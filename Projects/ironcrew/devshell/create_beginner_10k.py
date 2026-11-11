#!/usr/bin/env python3
"""Create the shared Beginner 10k program.

Run from Projects/ironcrew after installing this package:

    export DATABASE_URL='postgresql://...'
    PYTHONPATH=devshell python devshell/create_beginner_10k.py

The program is shared (no trainer or client owner), same as the catalog CLI.
Running it again replaces the phases and workout blocks for this plan.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Connection

from devshell.cli import create_shell_engine, reflection_schema

PROGRAM_NAME = "Beginner 10k"
LEG_AND_CORE = frozenset({"legs", "glutes", "core"})


@dataclass(frozen=True)
class Exercise:
    name: str
    description: str
    instructions: str
    muscle: str
    equipment: str
    tracking_type: str
    parameter_list: tuple[str, ...] | None = None


@dataclass(frozen=True)
class Block:
    block_type: str
    title: str | None = None
    exercise: str | None = None
    sets: int | None = None
    reps_min: int | None = None
    reps_max: int | None = None
    rest_seconds: int | None = None
    duration_seconds: int | None = None
    distance_meters: float | None = None
    instructions: str | None = None


@dataclass(frozen=True)
class Workout:
    name: str
    description: str
    minutes: int
    kind: str
    blocks: tuple[Block, ...]
    distance_km: float | None = None


@dataclass(frozen=True)
class Session:
    day: int
    workout: str


@dataclass(frozen=True)
class Week:
    number: int
    name: str
    notes: str
    sessions: tuple[Session, ...]


@dataclass(frozen=True)
class Phase:
    name: str
    description: str
    weeks: tuple[Week, ...]


@dataclass(frozen=True)
class Plan:
    name: str
    description: str
    status: str
    estimated_duration_weeks: int
    exercises: tuple[Exercise, ...]
    workouts: tuple[Workout, ...]
    phases: tuple[Phase, ...]

    def workout_by_name(self) -> dict[str, Workout]:
        return {workout.name: workout for workout in self.workouts}


def build_plan() -> Plan:
    exercises = _exercises()
    workouts = {workout.name: workout for workout in _strength_workouts()}
    phases = (
        _phase(
            "Build",
            "Four weeks for a new runner. Running distance rises for three weeks, then drops in week 4 so your legs can absorb the work. Two or three short sessions keep the legs and core strong.",
            (
                (1, 2.0, 2.0, 3.0, ("A", "B")),
                (2, 2.5, 2.5, 4.0, ("A", "B", "C")),
                (3, 3.0, 3.0, 4.5, ("A", "B", "C")),
                (4, 2.0, 2.0, 3.0, ("A", "B")),
            ),
            workouts,
            plan_week_offset=0,
        ),
        _phase(
            "Endurance phase",
            "Three weeks of longer running. The distance increases every week. One or two leg and core sessions stay in the week.",
            (
                (1, 3.5, 3.5, 5.5, ("A", "B")),
                (2, 4.0, 4.0, 6.5, ("A",)),
                (3, 4.5, 5.0, 8.0, ("A", "B")),
            ),
            workouts,
            plan_week_offset=4,
        ),
        _taper_phase(workouts),
    )
    plan = Plan(
        name=PROGRAM_NAME,
        description=(
            "An 8-week beginner plan that builds to a 10k with run/walk sessions and short leg and core strength work. "
            "Race the 10k after the taper week."
        ),
        status="active",
        estimated_duration_weeks=8,
        exercises=exercises,
        workouts=tuple(workouts.values()),
        phases=phases,
    )
    validate_plan(plan)
    return plan


def validate_plan(plan: Plan) -> None:
    if [phase.name for phase in plan.phases] != ["Build", "Endurance phase", "Taper"]:
        raise ValueError("phases must be Build, Endurance phase, and Taper")
    if [len(phase.weeks) for phase in plan.phases] != [4, 3, 1]:
        raise ValueError("phase lengths must be 4, 3, and 1 weeks")
    if plan.estimated_duration_weeks != 8:
        raise ValueError("the plan must cover 8 weeks")

    exercises = {exercise.name: exercise for exercise in plan.exercises}
    workouts = plan.workout_by_name()
    if len(workouts) != len(plan.workouts):
        raise ValueError("workout names must be unique")

    build = [_weekly_run_km(week, workouts) for week in plan.phases[0].weeks]
    if not (build[0] < build[1] < build[2] and build[3] < build[2]):
        raise ValueError("Build running distance must rise for 3 weeks and drop in week 4")
    if any(_strength_count(week, workouts) not in (2, 3) for week in plan.phases[0].weeks):
        raise ValueError("Build weeks need 2 or 3 strength sessions")

    endurance = [_weekly_run_km(week, workouts) for week in plan.phases[1].weeks]
    if not (endurance[0] < endurance[1] < endurance[2]):
        raise ValueError("Endurance running distance must increase every week")
    if any(_strength_count(week, workouts) not in (1, 2) for week in plan.phases[1].weeks):
        raise ValueError("Endurance weeks need 1 or 2 strength sessions")

    taper = plan.phases[2].weeks[0]
    if _run_count(taper, workouts) != 2 or _strength_count(taper, workouts) != 3:
        raise ValueError("Taper week needs 2 runs and 3 strength sessions")

    for phase in plan.phases:
        for week in phase.weeks:
            days = [session.day for session in week.sessions]
            if len(days) != len(set(days)) or any(day < 1 or day > 7 for day in days):
                raise ValueError(f"{phase.name} {week.name} has an invalid day")
            for session in week.sessions:
                workout = workouts[session.workout]
                for block in workout.blocks:
                    if block.exercise is None:
                        continue
                    exercise = exercises[block.exercise]
                    if workout.kind == "strength" and exercise.muscle not in LEG_AND_CORE:
                        raise ValueError(f"{exercise.name} is not a leg or core exercise")


def apply_plan(connection: Connection, plan: Plan) -> str:
    exercise_ids = {exercise.name: _upsert_exercise(connection, exercise) for exercise in plan.exercises}
    workout_ids = {workout.name: _upsert_workout(connection, workout, exercise_ids) for workout in plan.workouts}
    program_id = _upsert_program(connection, plan)
    connection.execute(text("delete from public.program_phases where program_id = :id"), {"id": program_id})
    for position, phase in enumerate(plan.phases, start=1):
        phase_id = _insert_returning(
            connection,
            """
            insert into public.program_phases (program_id, name, position, description)
            values (:program_id, :name, :position, :description)
            returning id::text as id
            """,
            {"program_id": program_id, "name": phase.name, "position": position, "description": phase.description},
        )
        for week in phase.weeks:
            week_id = _insert_returning(
                connection,
                """
                insert into public.program_weeks (program_phase_id, week_number, name, notes)
                values (:phase_id, :number, :name, :notes)
                returning id::text as id
                """,
                {"phase_id": phase_id, "number": week.number, "name": week.name, "notes": week.notes},
            )
            for session in week.sessions:
                connection.execute(
                    text(
                        """
                        insert into public.program_workouts (program_week_id, workout_id, day_number, position)
                        values (:week_id, :workout_id, :day, 1)
                        """
                    ),
                    {"week_id": week_id, "workout_id": workout_ids[session.workout], "day": session.day},
                )
    return (
        f"Wrote shared program {plan.name} ({program_id}): "
        f"{len(plan.phases)} phases, {sum(len(phase.weeks) for phase in plan.phases)} weeks, "
        f"{len(plan.workouts)} workouts, {len(plan.exercises)} exercises."
    )


def main() -> int:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is required.", file=sys.stderr)
        return 2
    engine, normalized = create_shell_engine(database_url)
    if reflection_schema(normalized) != "public":
        print("DATABASE_URL must be a Postgres database.", file=sys.stderr)
        engine.dispose()
        return 2
    plan = build_plan()
    try:
        with engine.begin() as connection:
            print(apply_plan(connection, plan))
    finally:
        engine.dispose()
    return 0


def _exercises() -> tuple[Exercise, ...]:
    reps = (
        ("Bodyweight Squat", "legs", "Sit the hips back and stand tall. Knees track over the toes."),
        ("Reverse Lunge", "legs", "Step one foot back and lower the rear knee. Alternate legs each rep."),
        ("Glute Bridge", "glutes", "Drive through the heels and pause with the hips level."),
        ("Calf Raise", "legs", "Rise onto the balls of the feet, pause, and lower slowly."),
        ("Step-Up", "legs", "Step onto a low stair and stand up fully before stepping down."),
        ("Single-Leg Romanian Deadlift", "legs", "Hinge from the hip with a soft knee. Keep the hips square."),
        ("Dead Bug", "core", "Keep the lower back gently pressed down as the opposite arm and leg reach."),
        ("Bird Dog", "core", "Reach the opposite arm and leg without rotating the hips."),
        ("Heel Tap", "core", "Lie on your back and tap one heel at a time. Keep the ribs down."),
    )
    timed = (
        ("Wall Sit", "legs", "Sit against a wall with the knees near a right angle. Breathe steadily."),
        ("Front Plank", "core", "Brace the belly and keep a straight line from head to heels."),
        ("Side Plank", "core", "Stack the feet or stagger them. Hold the hips up."),
    )
    exercises = [
        Exercise(
            name="Easy Run",
            description="Conversational run/walk used for the short runs.",
            instructions="Keep a pace where you can speak in short sentences. Walk breaks are part of the session.",
            muscle="legs",
            equipment="none",
            tracking_type="custom",
            parameter_list=("distance", "time", "heart_rate"),
        ),
        Exercise(
            name="Long Run",
            description="The longer run/walk of the week. It stays easy.",
            instructions="Start slower than you think. Use the walk breaks in the workout instead of speeding up.",
            muscle="legs",
            equipment="none",
            tracking_type="distance_time",
        ),
    ]
    exercises.extend(
        Exercise(
            name=name,
            description=instruction,
            instructions=instruction,
            muscle=muscle,
            equipment="bodyweight",
            tracking_type="reps",
        )
        for name, muscle, instruction in reps
    )
    exercises.extend(
        Exercise(
            name=name,
            description=instruction,
            instructions=instruction,
            muscle=muscle,
            equipment="bodyweight",
            tracking_type="time",
        )
        for name, muscle, instruction in timed
    )
    return tuple(exercises)


def _strength_workouts() -> tuple[Workout, ...]:
    specs = {
        "A": (
            "Beginner Legs and Core A",
            35,
            (
                _reps("Bodyweight Squat", 3, 8, 12),
                _reps("Reverse Lunge", 3, 8, 10),
                _reps("Glute Bridge", 3, 10, 15),
                _reps("Calf Raise", 3, 12, 15),
                _reps("Dead Bug", 3, 6, 8),
                _hold("Front Plank", 3, 20, 40),
            ),
        ),
        "B": (
            "Beginner Legs and Core B",
            35,
            (
                _reps("Step-Up", 3, 8, 10),
                _reps("Single-Leg Romanian Deadlift", 3, 6, 8),
                _hold("Wall Sit", 3, 20, 40),
                _hold("Side Plank", 3, 15, 30),
                _reps("Bird Dog", 3, 6, 8),
                _reps("Heel Tap", 3, 10, 12),
            ),
        ),
        "C": (
            "Beginner Legs and Core C",
            25,
            (
                _reps("Bodyweight Squat", 2, 8, 10),
                _reps("Glute Bridge", 2, 10, 12),
                _reps("Calf Raise", 2, 12, 15),
                _reps("Dead Bug", 2, 6, 8),
                _hold("Front Plank", 2, 20, 30),
                _reps("Bird Dog", 2, 6, 8),
            ),
        ),
        "TA": (
            "Beginner Taper Legs and Core A",
            25,
            (
                _reps("Bodyweight Squat", 2, 6, 8),
                _reps("Reverse Lunge", 2, 6, 8),
                _reps("Glute Bridge", 2, 8, 10),
                _reps("Dead Bug", 2, 6, 8),
                _hold("Front Plank", 2, 15, 25),
            ),
        ),
        "TB": (
            "Beginner Taper Legs and Core B",
            25,
            (
                _reps("Step-Up", 2, 6, 8),
                _reps("Single-Leg Romanian Deadlift", 2, 6, 8),
                _hold("Wall Sit", 2, 15, 25),
                _reps("Bird Dog", 2, 6, 8),
                _hold("Side Plank", 2, 15, 20),
            ),
        ),
        "TC": (
            "Beginner Taper Legs and Core C",
            20,
            (
                _reps("Glute Bridge", 2, 8, 10),
                _reps("Calf Raise", 2, 10, 12),
                _reps("Heel Tap", 2, 8, 10),
                _hold("Front Plank", 2, 15, 20),
                _reps("Dead Bug", 2, 6, 8),
            ),
        ),
    }
    workouts = []
    for key, (name, minutes, blocks) in specs.items():
        label = "Light leg and core session for taper week." if key.startswith("T") else "Short leg and core session for the beginner running plan."
        workouts.append(
            Workout(
                name=name,
                description=label,
                minutes=minutes,
                kind="strength",
                blocks=(
                    Block("warmup", title="Warm up", instructions="March in place and do 10 easy bodyweight squats."),
                    *blocks,
                    Block("cooldown", title="Cool down", instructions="Stop if a joint hurts. Shake out the legs and stretch the hips gently."),
                ),
            )
        )
    return tuple(workouts)


def _phase(name: str, description: str, weeks: tuple[tuple, ...], workouts: dict[str, Workout], plan_week_offset: int) -> Phase:
    built = []
    for number, first, second, long_km, strength_keys in weeks:
        plan_week = plan_week_offset + number
        easy_name = _run_workout(workouts, first, long=False)
        second_name = _run_workout(workouts, second, long=False)
        long_name = _run_workout(workouts, long_km, long=True)
        strength_names = [_STRENGTH_NAMES[key] for key in strength_keys]
        total = first + second + long_km
        note = (
            f"Plan week {plan_week} of 8. Three runs cover {total:.1f} km. "
            f"{len(strength_names)} leg and core session{'s' if len(strength_names) != 1 else ''}."
        )
        if name == "Build" and number == 4:
            note += " Distance comes down this week so the first three weeks can settle."
        built.append(
            Week(
                number=number,
                name=f"Week {number}",
                notes=note,
                sessions=_place_sessions((easy_name, second_name, long_name), strength_names),
            )
        )
    return Phase(name=name, description=description, weeks=tuple(built))


def _taper_phase(workouts: dict[str, Workout]) -> Phase:
    first = _run_workout(workouts, 3.0, long=False)
    second = _run_workout(workouts, 2.0, long=False)
    strength_names = [_STRENGTH_NAMES[key] for key in ("TA", "TB", "TC")]
    week = Week(
        number=1,
        name="Week 1",
        notes="Plan week 8 of 8. Two short runs and three light leg and core sessions. Race the 10k after this week.",
        sessions=_place_sessions((first, second), strength_names),
    )
    return Phase(
        name="Taper",
        description="One easier week before a 10k. Two short runs and three light leg and core sessions.",
        weeks=(week,),
    )


_STRENGTH_NAMES = {
    "A": "Beginner Legs and Core A",
    "B": "Beginner Legs and Core B",
    "C": "Beginner Legs and Core C",
    "TA": "Beginner Taper Legs and Core A",
    "TB": "Beginner Taper Legs and Core B",
    "TC": "Beginner Taper Legs and Core C",
}


def _run_workout(workouts: dict[str, Workout], distance_km: float, *, long: bool) -> str:
    label = "Long Run" if long else "Easy Run"
    name = f"Beginner {label} {distance_km:.1f} km"
    if name in workouts:
        return name
    pattern = _run_walk_pattern(distance_km)
    exercise = "Long Run" if long else "Easy Run"
    workouts[name] = Workout(
        name=name,
        description=f"{'Long' if long else 'Easy'} run/walk of {distance_km:.1f} km. {pattern}",
        minutes=round(distance_km * 10 + 10),
        kind="run",
        distance_km=distance_km,
        blocks=(
            Block("warmup", title="Warm up", instructions="Walk easily for 5 minutes, then loosen the ankles and hips."),
            Block(
                "exercise",
                exercise=exercise,
                sets=1,
                distance_meters=distance_km * 1000,
                instructions=pattern,
            ),
            Block("cooldown", title="Cool down", instructions="Walk for 5 minutes. Stretch the calves and the front of the hips."),
        ),
    )
    return name


def _run_walk_pattern(distance_km: float) -> str:
    if distance_km < 3.5:
        return "Run 1 minute and walk 2 minutes until the distance is done."
    if distance_km < 5:
        return "Run 2 minutes and walk 1 minute until the distance is done."
    if distance_km < 7:
        return "Run 4 minutes and walk 1 minute until the distance is done."
    return "Run 8 minutes and walk 1 minute. Continue easy without walk breaks if you can still talk."


def _place_sessions(runs: tuple[str, ...], strength: list[str]) -> tuple[Session, ...]:
    if len(runs) == 3:
        run_days = (1, 3, 5)
        strength_days = {1: (2,), 2: (2, 6), 3: (2, 4, 6)}[len(strength)]
    elif len(runs) == 2 and len(strength) == 3:
        run_days = (1, 4)
        strength_days = (2, 3, 5)
    else:
        raise ValueError("unsupported week layout")
    sessions = [Session(day, workout) for day, workout in zip(run_days, runs, strict=True)]
    sessions.extend(Session(day, workout) for day, workout in zip(strength_days, strength, strict=True))
    return tuple(sorted(sessions, key=lambda session: session.day))


def _reps(exercise: str, sets: int, low: int, high: int) -> Block:
    return Block("exercise", exercise=exercise, sets=sets, reps_min=low, reps_max=high, rest_seconds=60)


def _hold(exercise: str, sets: int, low: int, high: int) -> Block:
    return Block(
        "exercise",
        exercise=exercise,
        sets=sets,
        duration_seconds=low,
        rest_seconds=45,
        instructions=f"Hold {low}-{high} seconds. Each side counts as its own set when the exercise has a left and right side.",
    )


def _weekly_run_km(week: Week, workouts: dict[str, Workout]) -> float:
    return sum(workouts[session.workout].distance_km or 0 for session in week.sessions if workouts[session.workout].kind == "run")


def _count_kind(week: Week, workouts: dict[str, Workout], kind: str) -> int:
    return sum(1 for session in week.sessions if workouts[session.workout].kind == kind)


def _run_count(week: Week, workouts: dict[str, Workout]) -> int:
    return _count_kind(week, workouts, "run")


def _strength_count(week: Week, workouts: dict[str, Workout]) -> int:
    return _count_kind(week, workouts, "strength")


def _upsert_exercise(connection: Connection, exercise: Exercise) -> str:
    existing = _shared_id(connection, "exercises", exercise.name, f"10k {exercise.name}")
    parameters = _tracking_parameters(exercise.tracking_type, exercise.parameter_list)
    values = {
        "name": exercise.name,
        "description": exercise.description,
        "instructions": exercise.instructions,
        "muscle": exercise.muscle,
        "equipment": exercise.equipment,
        "tracking_type": exercise.tracking_type,
        "tracking_parameters": parameters,
    }
    if existing:
        connection.execute(
            text(
                """
                update public.exercises
                set description = :description,
                    instructions = :instructions,
                    primary_muscle_group = :muscle,
                    equipment = :equipment,
                    tracking_type = cast(:tracking_type as public.exercise_tracking_type),
                    tracking_parameters = cast(:tracking_parameters as public.exercise_tracking_parameter[])
                where id = :id
                """
            ),
            {**values, "id": existing},
        )
        return existing
    return _insert_returning(
        connection,
        """
        insert into public.exercises (
          trainer_id, owner_client_id, name, description, instructions,
          primary_muscle_group, equipment, tracking_type, tracking_parameters
        ) values (
          null, null, :name, :description, :instructions, :muscle, :equipment,
          cast(:tracking_type as public.exercise_tracking_type),
          cast(:tracking_parameters as public.exercise_tracking_parameter[])
        )
        returning id::text as id
        """,
        values,
    )


def _upsert_workout(connection: Connection, workout: Workout, exercise_ids: dict[str, str]) -> str:
    legacy_name = f"Beginner 10k {workout.name.removeprefix('Beginner ')}" if workout.name.startswith("Beginner ") else None
    existing = _shared_id(connection, "workouts", workout.name, legacy_name)
    values = {
        "name": workout.name,
        "description": workout.description,
        "minutes": workout.minutes,
    }
    if existing:
        connection.execute(
            text(
                """
                update public.workouts
                set description = :description,
                    estimated_duration_minutes = :minutes,
                    is_template = true
                where id = :id
                """
            ),
            {**values, "id": existing},
        )
        workout_id = existing
    else:
        workout_id = _insert_returning(
            connection,
            """
            insert into public.workouts (
              trainer_id, owner_client_id, name, description, estimated_duration_minutes, is_template
            ) values (null, null, :name, :description, :minutes, true)
            returning id::text as id
            """,
            values,
        )
    connection.execute(text("delete from public.workout_blocks where workout_id = :id"), {"id": workout_id})
    for position, block in enumerate(workout.blocks, start=1):
        exercise_id = exercise_ids[block.exercise] if block.exercise else None
        connection.execute(
            text(
                """
                insert into public.workout_blocks (
                  workout_id, exercise_id, block_type, position, title,
                  prescribed_sets, prescribed_reps_min, prescribed_reps_max,
                  rest_seconds, instructions, configuration,
                  prescribed_duration_seconds, prescribed_distance_meters
                ) values (
                  :workout_id, :exercise_id, cast(:block_type as public.workout_block_type), :position, :title,
                  :sets, :reps_min, :reps_max,
                  :rest_seconds, :instructions, '{}'::jsonb,
                  :duration_seconds, :distance_meters
                )
                """
            ),
            {
                "workout_id": workout_id,
                "exercise_id": exercise_id,
                "block_type": block.block_type,
                "position": position,
                "title": block.title,
                "sets": block.sets,
                "reps_min": block.reps_min,
                "reps_max": block.reps_max,
                "rest_seconds": block.rest_seconds,
                "instructions": block.instructions,
                "duration_seconds": block.duration_seconds,
                "distance_meters": block.distance_meters,
            },
        )
    return workout_id


def _upsert_program(connection: Connection, plan: Plan) -> str:
    existing = _shared_id(connection, "programs", plan.name)
    values = {
        "name": plan.name,
        "description": plan.description,
        "status": plan.status,
        "weeks": plan.estimated_duration_weeks,
    }
    if existing:
        connection.execute(
            text(
                """
                update public.programs
                set description = :description,
                    status = cast(:status as public.program_status),
                    estimated_duration_weeks = :weeks
                where id = :id
                """
            ),
            {**values, "id": existing},
        )
        return existing
    return _insert_returning(
        connection,
        """
        insert into public.programs (
          trainer_id, owner_client_id, name, description, status, estimated_duration_weeks
        ) values (
          null, null, :name, :description, cast(:status as public.program_status), :weeks
        )
        returning id::text as id
        """,
        values,
    )


def _shared_id(connection: Connection, table: str, name: str, legacy_name: str | None = None) -> str | None:
    if table not in {"exercises", "workouts", "programs"}:
        raise ValueError(f"unsupported table {table}")
    found = _find_shared_id(connection, table, name)
    if found or legacy_name is None:
        return found
    legacy = _find_shared_id(connection, table, legacy_name)
    if legacy is None:
        return None
    connection.execute(
        text(f"update public.{table} set name = :name where id = :id"),
        {"name": name, "id": legacy},
    )
    return legacy


def _find_shared_id(connection: Connection, table: str, name: str) -> str | None:
    rows = connection.execute(
        text(
            f"""
            select id::text as id
            from public.{table}
            where trainer_id is null and owner_client_id is null and name = :name
            """
        ),
        {"name": name},
    ).all()
    if len(rows) > 1:
        raise RuntimeError(f"more than one shared {table} row is named {name}")
    return None if not rows else str(rows[0].id)


def _insert_returning(connection: Connection, statement: str, values: dict) -> str:
    row = connection.execute(text(statement), values).one()
    return str(row.id)


def _tracking_parameters(tracking_type: str, parameter_list: tuple[str, ...] | None = None) -> str:
    if parameter_list is not None:
        if not parameter_list:
            raise ValueError("tracking parameters must not be empty")
        return "{" + ",".join(parameter_list) + "}"
    parameters = {
        "reps": "reps",
        "time": "time",
        "distance_time": "distance,time",
    }
    try:
        return "{" + parameters[tracking_type] + "}"
    except KeyError:
        raise ValueError(f"unsupported tracking type {tracking_type}") from None


if __name__ == "__main__":
    raise SystemExit(main())
