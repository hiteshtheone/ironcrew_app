#!/usr/bin/env python3
"""Create the shared Beginner 5k program.

Run from Projects/ironcrew after installing this package:

    export DATABASE_URL='postgresql://...'
    PYTHONPATH=devshell python devshell/create_beginner_5k.py

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

PROGRAM_NAME = "Beginner 5k"
LEG_AND_CORE = frozenset({"legs", "glutes", "core"})
RUN_WALK_PARAMETERS = ("distance", "time", "heart_rate")
EASY_HEART_RATE = 140
TEMPO_HEART_RATE = 160


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
    heart_rate_bpm: int | None = None


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


@dataclass(frozen=True)
class RunSlot:
    kind: str
    distance_km: float
    reps: int | None = None
    rest_seconds: int | None = None


def build_plan() -> Plan:
    exercises = _exercises()
    workouts = {workout.name: workout for workout in _strength_workouts()}
    phases = (
        _phase(
            "Build",
            "Four weeks for a new runner. Running distance rises for three weeks, then drops in week 4 so your legs can absorb the work. A tempo run starts in week 3. Two or three short sessions keep the legs and core strong.",
            (
                (1, RunSlot("easy", 1.0), RunSlot("easy", 1.0), RunSlot("long", 1.5), ("A", "B")),
                (2, RunSlot("easy", 1.5), RunSlot("easy", 1.5), RunSlot("long", 2.0), ("A", "B", "C")),
                (3, RunSlot("easy", 1.5), RunSlot("tempo", 1.5), RunSlot("long", 2.5), ("A", "B", "C")),
                (4, RunSlot("easy", 1.0), RunSlot("tempo", 1.0), RunSlot("long", 1.5), ("A", "B")),
            ),
            workouts,
            plan_week_offset=0,
        ),
        _phase(
            "Endurance phase",
            "Three weeks of longer running. The distance increases every week, with one interval or tempo run each week. One or two leg and core sessions stay in the week.",
            (
                (1, RunSlot("easy", 2.0), RunSlot("interval", 2.0, 4, 120), RunSlot("long", 3.0), ("A", "B")),
                (2, RunSlot("easy", 2.0), RunSlot("tempo", 2.0), RunSlot("long", 3.5), ("A",)),
                (3, RunSlot("easy", 2.5), RunSlot("interval", 2.5, 6, 90), RunSlot("long", 4.0), ("A", "B")),
            ),
            workouts,
            plan_week_offset=4,
        ),
        _taper_phase(workouts),
    )
    plan = Plan(
        name=PROGRAM_NAME,
        description=(
            "An 8-week beginner plan that builds to a 5k with easy run/walk sessions, tempo and interval runs, "
            "and short leg and core strength work. Race the 5k after the taper week."
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
    _validate_tracking(exercises)

    build = [_weekly_run_km(week, workouts) for week in plan.phases[0].weeks]
    if build != [3.5, 5.0, 5.5, 3.5]:
        raise ValueError("Build running distance must be 3.5, 5.0, 5.5, then 3.5 km")
    if [_strength_count(week, workouts) for week in plan.phases[0].weeks] != [2, 3, 3, 2]:
        raise ValueError("Build weeks need 2, 3, 3, and 2 strength sessions")

    endurance = [_weekly_run_km(week, workouts) for week in plan.phases[1].weeks]
    if endurance != [7.0, 7.5, 9.0]:
        raise ValueError("Endurance running distance must be 7.0, 7.5, then 9.0 km")
    if [_strength_count(week, workouts) for week in plan.phases[1].weeks] != [2, 1, 2]:
        raise ValueError("Endurance weeks need 2, 1, and 2 strength sessions")

    taper = plan.phases[2].weeks[0]
    if _run_count(taper, workouts) != 2 or _strength_count(taper, workouts) != 3:
        raise ValueError("Taper week needs 2 runs and 3 strength sessions")
    if _weekly_run_km(taper, workouts) != 2.5:
        raise ValueError("Taper running distance must be 2.5 km")

    expected_quality = (None, None, "tempo", "tempo", "interval", "tempo", "interval", "tempo")
    plan_weeks = [week for phase in plan.phases for week in phase.weeks]
    for plan_week, week in enumerate(plan_weeks, start=1):
        _validate_week(plan_week, week, workouts, expected_quality[plan_week - 1])

    for workout in plan.workouts:
        if workout.kind != "strength" and workout.name.startswith("Beginner"):
            raise ValueError(f"{workout.name} must not start with Beginner")
        for block in workout.blocks:
            if block.exercise is None:
                continue
            exercise = exercises[block.exercise]
            if workout.kind == "strength" and exercise.muscle not in LEG_AND_CORE:
                raise ValueError(f"{exercise.name} is not a leg or core exercise")
            _validate_heart_rate(workout, block)


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
            parameter_list=RUN_WALK_PARAMETERS,
        ),
        Exercise(
            name="Long Run",
            description="The longer run/walk of the week. It stays easy.",
            instructions="Start slower than you think. Use the walk breaks in the workout instead of speeding up.",
            muscle="legs",
            equipment="none",
            tracking_type="distance_time",
        ),
        Exercise(
            name="Tempo Run",
            description="Comfortably hard run held near 160 bpm.",
            instructions="Hold a steady effort where talking is limited to a few words. Walk only if you need to.",
            muscle="legs",
            equipment="none",
            tracking_type="custom",
            parameter_list=RUN_WALK_PARAMETERS,
        ),
        Exercise(
            name="Interval Run",
            description="Short hard repeats with walking recoveries.",
            instructions="Run the hard minute, then walk the recovery. Start the next repeat when the rest is over.",
            muscle="legs",
            equipment="none",
            tracking_type="time",
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
    for number, first, second, third, strength_keys in weeks:
        plan_week = plan_week_offset + number
        run_names = (
            _run_workout(workouts, first),
            _run_workout(workouts, second),
            _run_workout(workouts, third),
        )
        strength_names = [_STRENGTH_NAMES[key] for key in strength_keys]
        total = first.distance_km + second.distance_km + third.distance_km
        note = (
            f"Plan week {plan_week} of 8. Three runs cover {total:.1f} km. "
            f"{len(strength_names)} leg and core session{'s' if len(strength_names) != 1 else ''}."
        )
        if second.kind == "tempo":
            note += " The middle run is a tempo."
        elif second.kind == "interval":
            note += " The middle run is an interval session."
        if name == "Build" and number == 4:
            note += " Distance comes down this week so the first three weeks can settle."
        built.append(
            Week(
                number=number,
                name=f"Week {number}",
                notes=note,
                sessions=_place_sessions(run_names, strength_names),
            )
        )
    return Phase(name=name, description=description, weeks=tuple(built))


def _taper_phase(workouts: dict[str, Workout]) -> Phase:
    easy = _run_workout(workouts, RunSlot("easy", 1.5))
    tempo = _run_workout(workouts, RunSlot("tempo", 1.0))
    strength_names = [_STRENGTH_NAMES[key] for key in ("TA", "TB", "TC")]
    week = Week(
        number=1,
        name="Week 1",
        notes="Plan week 8 of 8. One easy run, one short tempo, and three light leg and core sessions. Race the 5k after this week.",
        sessions=_place_sessions((easy, tempo), strength_names),
    )
    return Phase(
        name="Taper",
        description="One easier week before a 5k. One easy run, one short tempo, and three light leg and core sessions.",
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


def _run_workout(workouts: dict[str, Workout], slot: RunSlot) -> str:
    name = _run_name(slot)
    if name in workouts:
        return name
    pattern = None if slot.kind in {"tempo", "interval"} else _run_walk_pattern(slot.distance_km)
    workouts[name] = Workout(
        name=name,
        description=_run_description(slot, pattern),
        minutes=round(slot.distance_km * 10 + 10),
        kind=slot.kind,
        distance_km=slot.distance_km,
        blocks=(
            Block("warmup", title="Warm up", instructions="Walk easily for 5 minutes, then loosen the ankles and hips."),
            _run_block(slot, pattern),
            Block("cooldown", title="Cool down", instructions="Walk for 5 minutes. Stretch the calves and the front of the hips."),
        ),
    )
    return name


def _run_name(slot: RunSlot) -> str:
    if slot.kind == "interval":
        return f"Interval Run {slot.reps} x 1 min"
    labels = {"easy": "Easy Run", "long": "Long Run", "tempo": "Tempo Run"}
    try:
        label = labels[slot.kind]
    except KeyError:
        raise ValueError(f"unsupported run {slot.kind}") from None
    return f"{label} {slot.distance_km:.1f} km"


def _run_description(slot: RunSlot, pattern: str | None) -> str:
    if slot.kind == "interval":
        return (
            f"{slot.reps} hard efforts of 1 minute with {_rest_phrase(slot.rest_seconds or 0)} of walking between them. "
            f"The session is about {slot.distance_km:.1f} km."
        )
    if slot.kind == "tempo":
        return f"Tempo run of {slot.distance_km:.1f} km at about {TEMPO_HEART_RATE} bpm."
    label = "Long" if slot.kind == "long" else "Easy"
    heart_rate = f" at about {EASY_HEART_RATE} bpm" if slot.kind == "easy" else ""
    return f"{label} run/walk of {slot.distance_km:.1f} km{heart_rate}. {pattern}"


def _run_block(slot: RunSlot, pattern: str | None) -> Block:
    if slot.kind == "interval":
        if slot.reps is None or slot.rest_seconds is None:
            raise ValueError("interval runs need reps and rest")
        return Block(
            "exercise",
            exercise="Interval Run",
            sets=slot.reps,
            duration_seconds=60,
            rest_seconds=slot.rest_seconds,
            instructions=(
                f"Run hard for 1 minute. Walk for {_rest_phrase(slot.rest_seconds)}. "
                "Repeat until the sets are done."
            ),
        )
    if slot.kind == "tempo":
        return Block(
            "exercise",
            exercise="Tempo Run",
            sets=1,
            distance_meters=slot.distance_km * 1000,
            heart_rate_bpm=TEMPO_HEART_RATE,
            instructions=f"Hold a comfortably hard effort at about {TEMPO_HEART_RATE} bpm. Do not use walk breaks unless you need them.",
        )
    exercise = "Long Run" if slot.kind == "long" else "Easy Run"
    heart_rate = EASY_HEART_RATE if slot.kind == "easy" else None
    instructions = pattern
    if heart_rate is not None:
        instructions = f"Stay near {heart_rate} bpm. {pattern}"
    return Block(
        "exercise",
        exercise=exercise,
        sets=1,
        distance_meters=slot.distance_km * 1000,
        heart_rate_bpm=heart_rate,
        instructions=instructions,
    )


def _run_walk_pattern(distance_km: float) -> str:
    if distance_km < 2:
        return "Run 1 minute and walk 2 minutes until the distance is done."
    if distance_km < 3:
        return "Run 2 minutes and walk 1 minute until the distance is done."
    if distance_km < 4:
        return "Run 4 minutes and walk 1 minute until the distance is done."
    return "Run 8 minutes and walk 1 minute. Continue easy without walk breaks if you can still talk."


def _rest_phrase(seconds: int) -> str:
    if seconds % 60 == 0:
        minutes = seconds // 60
        return f"{minutes} minute" if minutes == 1 else f"{minutes} minutes"
    return f"{seconds} seconds"


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
    return sum(workouts[session.workout].distance_km or 0 for session in week.sessions if workouts[session.workout].kind != "strength")


def _count_kind(week: Week, workouts: dict[str, Workout], kind: str) -> int:
    return sum(1 for session in week.sessions if workouts[session.workout].kind == kind)


def _run_count(week: Week, workouts: dict[str, Workout]) -> int:
    return sum(1 for session in week.sessions if workouts[session.workout].kind != "strength")


def _strength_count(week: Week, workouts: dict[str, Workout]) -> int:
    return _count_kind(week, workouts, "strength")


def _validate_tracking(exercises: dict[str, Exercise]) -> None:
    easy = exercises["Easy Run"]
    tempo = exercises["Tempo Run"]
    if easy.tracking_type != "custom" or easy.parameter_list != RUN_WALK_PARAMETERS:
        raise ValueError("Easy Run must track distance, time, and heart rate")
    if tempo.tracking_type != "custom" or tempo.parameter_list != RUN_WALK_PARAMETERS:
        raise ValueError("Tempo Run must track distance, time, and heart rate")
    if exercises["Interval Run"].tracking_type != "time":
        raise ValueError("Interval Run must track time")
    if exercises["Long Run"].tracking_type != "distance_time":
        raise ValueError("Long Run must track distance and time")


def _validate_week(plan_week: int, week: Week, workouts: dict[str, Workout], quality: str | None) -> None:
    days = [session.day for session in week.sessions]
    if len(days) != len(set(days)) or any(day < 1 or day > 7 for day in days):
        raise ValueError(f"plan week {plan_week} has an invalid day")
    runs = [session for session in week.sessions if workouts[session.workout].kind != "strength"]
    if plan_week == 8:
        expected_kinds = ["easy", "tempo"]
        expected_days = [1, 4]
    elif quality is None:
        expected_kinds = ["easy", "easy", "long"]
        expected_days = [1, 3, 5]
    else:
        expected_kinds = ["easy", quality, "long"]
        expected_days = [1, 3, 5]
    kinds = [workouts[session.workout].kind for session in runs]
    run_days = [session.day for session in runs]
    if kinds != expected_kinds or run_days != expected_days:
        raise ValueError(f"plan week {plan_week} runs must be {expected_kinds} on days {expected_days}")


def _validate_heart_rate(workout: Workout, block: Block) -> None:
    expected = {"Easy Run": EASY_HEART_RATE, "Tempo Run": TEMPO_HEART_RATE}.get(block.exercise or "")
    if block.exercise in {"Easy Run", "Tempo Run"} and block.heart_rate_bpm != expected:
        raise ValueError(f"{workout.name} must prescribe {expected} bpm")
    if block.exercise in {"Long Run", "Interval Run"} and block.heart_rate_bpm is not None:
        raise ValueError(f"{workout.name} must not prescribe a heart rate")
    if workout.kind == "strength" and block.heart_rate_bpm is not None:
        raise ValueError(f"{workout.name} must not prescribe a heart rate")


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
                  prescribed_duration_seconds, prescribed_distance_meters,
                  prescribed_heart_rate_bpm
                ) values (
                  :workout_id, :exercise_id, cast(:block_type as public.workout_block_type), :position, :title,
                  :sets, :reps_min, :reps_max,
                  :rest_seconds, :instructions, '{}'::jsonb,
                  :duration_seconds, :distance_meters, :heart_rate_bpm
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
                "heart_rate_bpm": block.heart_rate_bpm,
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
