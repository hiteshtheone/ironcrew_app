#!/usr/bin/env python3
"""Create the shared Yoddha 5-week program.

Run from Projects/ironcrew after installing this package:

    PYTHONPATH=devshell python devshell/seed_gym_exercises.py
    export DATABASE_URL='postgresql://...'
    PYTHONPATH=devshell python devshell/create_yoddha.py

Workouts use the shared gym exercise names. Seed the gym library first.
Running this script again replaces the phases and workout blocks for this plan.
It does not write the database until that command is run.

Male Open race standards are the event target. Training loads stay lighter.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Connection

from devshell.cli import create_shell_engine, reflection_schema
from seed_gym_exercises import build_exercises

PROGRAM_NAME = "Yoddha 5-week"


WARMUP = "5 minutes of easy rowing or jogging, then 8 squats and 8 hip hinges."
COOLDOWN = "Walk until breathing settles. Stop a movement if a joint hurts."
SLED_PUSH_CUE = "Use a load you can move for the distance without stopping."
SLED_PULL_CUE = "Start lighter than the push."
CARRY_CUE = "Use bells lighter than 2×24 kg if grip or posture goes first. Dumbbells work."
LOAD_HOLD = "Same loads as the previous week if those sets were solid. Add load only if every rep stayed clean."
BOX_CUE = "Step down. Use 40–50 cm, or a step-up, if 60 cm landings are sloppy."
WALL_BALL_CUE = "Full squat, then throw to a high target in one motion. Use 4 kg if a 9 ft target is a miss."


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
    load: float | None = None
    load_unit: str | None = None
    height_cm: float | None = None


@dataclass(frozen=True)
class Workout:
    name: str
    description: str
    minutes: int
    kind: str
    blocks: tuple[Block, ...]


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
    workouts: tuple[Workout, ...]
    phases: tuple[Phase, ...]

    def workout_by_name(self) -> dict[str, Workout]:
        return {workout.name: workout for workout in self.workouts}


def build_plan() -> Plan:
    plan = Plan(
        name=PROGRAM_NAME,
        description=(
            "Five-week Male Open prep. Four sessions a week, about 60 minutes: "
            "Monday strength, Tuesday running, Thursday stations or mixed work, Saturday a run or the simulation. "
            "Rest Wednesday, Friday, and Sunday until race morning. "
            "Start week 1 on the Monday five weeks before race week, and race at the end of week 5. "
            "Day 1 is Monday. Shift the whole week together if you need a different start day. "
            "Published Male Open standards are the event target: row 1 km at resistance 7, "
            "sled push 50 m at 150 kg, sled pull 50 m at 100 kg, kettlebell carry 200 m with 2×24 kg, "
            "30 box jumps at 60 cm, lunge walk 100 m at 20 kg, and 75 wall balls with a 6 kg ball to a 9 ft target. "
            "Train lighter. Progress distance or reps first, then load. "
            "Easy means full sentences. Steady means short phrases and an even pace. "
            "Moderate strength leaves 2–3 reps. "
            "Repeat a week instead of progressing when a session wrecks the next day. "
            "Missing kit: a bike for the same minutes instead of a rower, a plate or sandbag push instead of a sled push, "
            "a rope or band pull instead of a sled pull, dumbbells instead of kettlebells, "
            "step-ups instead of box jumps, and a light dumbbell squat-to-press instead of wall balls."
        ),
        status="active",
        estimated_duration_weeks=5,
        workouts=_workouts(),
        phases=_phases(),
    )
    validate_plan(plan)
    return plan


def validate_plan(plan: Plan) -> None:
    if [phase.name for phase in plan.phases] != ["Base", "Race-specific", "Taper"]:
        raise ValueError("phases must be Base, Race-specific, and Taper")
    if [len(phase.weeks) for phase in plan.phases] != [2, 2, 1]:
        raise ValueError("phase lengths must be 2, 2, and 1 weeks")
    if plan.estimated_duration_weeks != 5:
        raise ValueError("the plan must cover 5 weeks")

    library = {exercise.name for exercise in build_exercises()}
    workouts = plan.workout_by_name()
    if len(workouts) != len(plan.workouts):
        raise ValueError("workout names must be unique")
    for workout in plan.workouts:
        if workout.blocks[0].block_type != "warmup" or workout.blocks[-1].block_type != "cooldown":
            raise ValueError(f"{workout.name} needs a warm-up and a cool-down")
        for block in workout.blocks:
            if block.exercise is not None and block.exercise not in library:
                raise ValueError(f"{workout.name} uses unknown exercise {block.exercise}")

    weeks = [week for phase in plan.phases for week in phase.weeks]
    if len(weeks) != 5:
        raise ValueError("the plan must have 5 weeks")
    for index, week in enumerate(weeks, start=1):
        days = [session.day for session in week.sessions]
        expected = [1, 2, 4, 6, 7] if index == 5 else [1, 2, 4, 6]
        if days != expected:
            raise ValueError(f"plan week {index} days must be {expected}")
        if workouts[week.sessions[0].workout].kind != "strength":
            raise ValueError(f"plan week {index} Monday must be strength")

    simulation = workouts[weeks[3].sessions[3].workout]
    if simulation.kind != "simulation":
        raise ValueError("plan week 4 Saturday must be the simulation")
    taper_exercises = _exercise_names(weeks[4], workouts)
    earlier = set().union(*(_exercise_names(week, workouts) for week in weeks[:4]))
    if taper_exercises - earlier:
        raise ValueError("taper week introduces a new exercise")


def apply_plan(connection: Connection, plan: Plan) -> str:
    exercise_ids = _shared_exercise_ids(connection, plan)
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
        f"{len(plan.workouts)} workouts, {len(exercise_ids)} exercises."
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


def _workouts() -> tuple[Workout, ...]:
    return (
        _workout(
            "Yoddha Strength Week 1",
            "Moderate. Leave 2–3 reps in reserve on every set.",
            55,
            "strength",
            (
                _reps("Squat", 3, 8, 90, "Hold one dumbbell at your chest. Leave 2–3 reps in reserve."),
                _reps("Romanian Deadlift", 3, 8, 90, "Leave 2–3 reps in reserve."),
                _reps("Push-Up", 3, 8, 90),
                _meters("Farmer Carry", 3, 40, 60, CARRY_CUE),
                _reps("Dead Bug", 3, 6, 60, "6 reps each side."),
            ),
        ),
        _workout(
            "Yoddha Easy Run 25 min",
            "Easy. Conversational for the whole run.",
            30,
            "run",
            (_minutes("Treadmill", 25, "Speak in full sentences."),),
        ),
        _workout(
            "Yoddha Station Practice 1",
            "Easy to moderate. Learn the stations with long rests.",
            55,
            "station",
            (
                _meters("Rowing", 1, 500, 90, "Resistance 5–6."),
                _meters("Sled Push", 4, 15, 90, SLED_PUSH_CUE),
                _meters("Sled Pull", 4, 15, 90, SLED_PULL_CUE),
                _meters("Farmer Carry", 4, 40, 90, CARRY_CUE),
            ),
        ),
        _workout(
            "Yoddha Run and Stations 1",
            "Easy. Easy run, then jumps, lunges, and wall balls.",
            55,
            "mixed",
            (
                _minutes("Treadmill", 30, "Speak in full sentences."),
                _jumps(3, 8, 60, BOX_CUE),
                _meters("Lunge", 3, 20, 60, "Walk 20 m. Bodyweight."),
                _reps("Wall Ball", 3, 10, 60, WALL_BALL_CUE, load=6, unit="kg"),
            ),
        ),
        _workout(
            "Yoddha Strength Week 2",
            "Moderate. One more rep per set than week 1 on the squat, hinge, and press.",
            55,
            "strength",
            (
                _reps("Squat", 3, 10, 90, f"Hold one dumbbell at your chest. {LOAD_HOLD}"),
                _reps("Romanian Deadlift", 3, 10, 90, LOAD_HOLD),
                _reps("Push-Up", 3, 10, 90, LOAD_HOLD),
                _meters("Farmer Carry", 3, 50, 60, CARRY_CUE),
                _reps("Dead Bug", 3, 8, 60, "8 reps each side."),
            ),
        ),
        _workout(
            "Yoddha Easy Run 30 min",
            "Easy. A little longer than week 1.",
            35,
            "run",
            (_minutes("Treadmill", 30, "Speak in full sentences."),),
        ),
        _workout(
            "Yoddha Station Practice 2",
            "Easy to moderate. Longer station pieces. Keep week 1 loads if those sets were solid.",
            55,
            "station",
            (
                _meters("Rowing", 1, 750, 90, "Resistance 5–6."),
                _meters("Sled Push", 4, 20, 90, LOAD_HOLD),
                _meters("Sled Pull", 4, 20, 90, LOAD_HOLD),
                _meters("Farmer Carry", 4, 50, 90, LOAD_HOLD),
            ),
        ),
        _workout(
            "Yoddha Run and Stations 2",
            "Easy. 35-minute easy run. The last 10 minutes are 4 relaxed strides with a full walk back.",
            60,
            "mixed",
            (
                _minutes("Treadmill", 25, "Speak in full sentences. The strides that follow fill the last 10 minutes."),
                _strides(4),
                _jumps(3, 8, 60, BOX_CUE),
                _meters("Lunge", 3, 20, 60, "Walk 20 m. Bodyweight."),
                _reps("Wall Ball", 4, 10, 60, WALL_BALL_CUE, load=6, unit="kg"),
            ),
        ),
        _workout(
            "Yoddha Strength Week 3",
            "Moderate. Squat and hinge are slightly heavier than week 2, for fewer reps.",
            50,
            "strength",
            (
                _reps("Squat", 3, 6, 90, "Hold one dumbbell at your chest. Slightly heavier than week 2. Leave 2–3 reps in reserve."),
                _reps("Romanian Deadlift", 3, 6, 90, "Slightly heavier than week 2. Leave 2–3 reps in reserve."),
                _reps("Push-Up", 3, 8, 90),
                _meters("Farmer Carry", 2, 40, 60, CARRY_CUE),
                _reps("Dead Bug", 2, 8, 60, "8 reps each side."),
            ),
        ),
        _workout(
            "Yoddha 700 m Repeats",
            "Steady. Even 700 m repeats, then an easy row.",
            45,
            "mixed",
            (
                _meters("Treadmill", 4, 700, 120, "Even effort. Walk 2 minutes between repeats."),
                _meters("Rowing", 1, 500, 0, "Easy. Resistance 5–6."),
            ),
        ),
        _workout(
            "Yoddha Compromised Rounds",
            "Hard. Three rounds of a run into a station. Walk 3 minutes between rounds. Keep week 2 loads. Stop before form breaks.",
            55,
            "mixed",
            (
                _meters("Treadmill", 1, 400, 0, "Round 1. Even pace."),
                _meters("Sled Push", 1, 20, 0, "Week 2 load."),
                _meters("Sled Pull", 1, 20, 180, "Week 2 load. Then walk easily for 3 minutes."),
                _meters("Treadmill", 1, 400, 0, "Round 2. Even pace."),
                _meters("Farmer Carry", 1, 80, 180, "Week 2 load. Then walk easily for 3 minutes."),
                _meters("Treadmill", 1, 400, 0, "Round 3. Even pace."),
                _jumps(1, 12, 60, BOX_CUE, rest=0),
                _meters("Lunge", 1, 20, 0, "Walk 20 m. Bodyweight, or the light load from week 2."),
            ),
        ),
        _workout(
            "Yoddha Easy Run and Wall Balls",
            "Easy. Recovery run, then wall balls.",
            45,
            "mixed",
            (
                _minutes("Treadmill", 30, "Speak in full sentences."),
                _reps("Wall Ball", 4, 12, 60, WALL_BALL_CUE, load=6, unit="kg"),
            ),
        ),
        _workout(
            "Yoddha Strength Week 4",
            "Moderate and short. Week 3 loads, with 3 reps left, so Saturday can be the hard day.",
            35,
            "strength",
            (
                _reps("Squat", 2, 6, 90, "Hold one dumbbell at your chest. Week 3 load. Stop with 3 reps in reserve."),
                _reps("Romanian Deadlift", 2, 6, 90, "Week 3 load. Stop with 3 reps in reserve."),
                _reps("Push-Up", 2, 8, 90, "Stop with 3 reps in reserve."),
            ),
        ),
        _workout(
            "Yoddha 500 m Repeats",
            "Steady. Short repeats with a full walk between them.",
            40,
            "run",
            (_meters("Treadmill", 5, 500, 90, "Even effort. Walk 90 seconds between repeats."),),
        ),
        _workout(
            "Yoddha Station Touch",
            "Easy. Short touches. Go one step heavier than week 2 only on a station that has stayed clean.",
            40,
            "mixed",
            (
                _minutes("Treadmill", 15, "Speak in full sentences."),
                _meters("Sled Push", 2, 20, 60, "Week 2 load, or one step heavier if every rep last week was clean."),
                _meters("Sled Pull", 2, 20, 60, "Week 2 load, or one step heavier if every rep last week was clean."),
                _meters("Farmer Carry", 2, 40, 60, CARRY_CUE),
                _jumps(1, 8, 60, BOX_CUE),
                _reps("Wall Ball", 1, 10, 60, WALL_BALL_CUE, load=6, unit="kg"),
            ),
        ),
        _workout(
            "Yoddha Simulation",
            "Hard. Controlled first-half rehearsal. Record total time, each 700 m split, each station time, the loads used, and effort.",
            70,
            "simulation",
            (
                Block(
                    "notes",
                    title="Record",
                    instructions=(
                        "Four rounds, continuous, in race order. "
                        "Box jumps, the lunge walk, and wall balls stay in the other weeks. "
                        "If these 700 m runs push the session past about 70 minutes, use 400 m for every run."
                    ),
                ),
                _meters("Treadmill", 1, 700, 0, "Round 1. Controlled."),
                _meters("Rowing", 1, 500, 0, "Resistance 5–6. Add a short piece at resistance 7 if the pace stays even."),
                _meters("Treadmill", 1, 700, 0, "Round 2. Controlled."),
                _meters("Sled Push", 1, 30, 0, SLED_PUSH_CUE),
                _meters("Treadmill", 1, 700, 0, "Round 3. Controlled."),
                _meters("Sled Pull", 1, 30, 0, SLED_PULL_CUE),
                _meters("Treadmill", 1, 700, 0, "Round 4. Controlled."),
                _meters("Farmer Carry", 1, 100, 0, CARRY_CUE),
            ),
            cooldown="Walk for 5 minutes.",
        ),
        _workout(
            "Yoddha Taper Strength",
            "Easy to moderate. Light, familiar loads. No new movements.",
            30,
            "strength",
            (
                _reps("Squat", 2, 5, 90, "Hold one dumbbell at your chest. Light and familiar."),
                _reps("Romanian Deadlift", 2, 5, 90, "Light and familiar."),
                _reps("Push-Up", 2, 5, 90, "Light and familiar."),
                _meters("Farmer Carry", 2, 30, 60, "Light and familiar."),
            ),
        ),
        _workout(
            "Yoddha Taper Run",
            "Easy. Short run, then four relaxed strides.",
            30,
            "run",
            (
                _minutes("Treadmill", 20, "Speak in full sentences."),
                _strides(4),
            ),
        ),
        _workout(
            "Yoddha Taper Mixed",
            "Steady. Two short rounds. Keep it only if you feel fresh. Drop it if you feel flat.",
            25,
            "mixed",
            (
                _meters("Treadmill", 1, 400, 0, "Round 1. Steady."),
                _meters("Rowing", 1, 200, 120, "Easy. Resistance 5–6. Ten wall balls can replace this row. Then walk 2 minutes."),
                _meters("Treadmill", 1, 400, 0, "Round 2. Steady."),
                _meters("Rowing", 1, 200, 0, "Easy. Resistance 5–6. Ten wall balls can replace this row."),
            ),
        ),
        _workout(
            "Yoddha Shakeout",
            "Easy. 15–20 minutes. Walk only if the race is the next morning.",
            25,
            "run",
            (_minutes("Treadmill", 20, "15 minutes is enough. Walk only if the race is the next morning."),),
        ),
        _workout(
            "Yoddha Race Morning",
            "Easy. Race-morning primer. Skip this if you are not racing.",
            15,
            "mixed",
            (
                _minutes("Treadmill", 10, "Easy jog, then stop after the rehearsal reps."),
                _reps("Squat", 1, 5, 0, "A few easy reps, then stop."),
                _reps("Wall Ball", 1, 5, 0, "A few easy reps, then stop.", load=6, unit="kg"),
            ),
        ),
    )


def _phases() -> tuple[Phase, ...]:
    return (
        Phase(
            "Base",
            "Easy running and station technique. Progress time and distance.",
            (
                Week(
                    1,
                    "Week 1",
                    "Plan week 1 of 5. Base. Monday strength is moderate. Tuesday and Saturday are easy. Thursday is easy station practice. Rest Wednesday, Friday, and Sunday.",
                    (
                        Session(1, "Yoddha Strength Week 1"),
                        Session(2, "Yoddha Easy Run 25 min"),
                        Session(4, "Yoddha Station Practice 1"),
                        Session(6, "Yoddha Run and Stations 1"),
                    ),
                ),
                Week(
                    2,
                    "Week 2",
                    "Plan week 2 of 5. Base. Runs are a little longer and station distances step up. Keep week 1 loads if those sets were solid. Rest Wednesday, Friday, and Sunday.",
                    (
                        Session(1, "Yoddha Strength Week 2"),
                        Session(2, "Yoddha Easy Run 30 min"),
                        Session(4, "Yoddha Station Practice 2"),
                        Session(6, "Yoddha Run and Stations 2"),
                    ),
                ),
            ),
        ),
        Phase(
            "Race-specific",
            "Controlled 700 m work and short run-into-station pieces. The hardest session is the Saturday simulation in plan week 4.",
            (
                Week(
                    1,
                    "Week 1",
                    "Plan week 3 of 5. Race-specific. Thursday is the hard session. Saturday stays easy. Rest Wednesday, Friday, and Sunday.",
                    (
                        Session(1, "Yoddha Strength Week 3"),
                        Session(2, "Yoddha 700 m Repeats"),
                        Session(4, "Yoddha Compromised Rounds"),
                        Session(6, "Yoddha Easy Run and Wall Balls"),
                    ),
                ),
                Week(
                    2,
                    "Week 2",
                    "Plan week 4 of 5. Saturday is the simulation and the hardest session of the plan. Monday and Thursday stay lighter. Rest Wednesday, Friday, and Sunday. Record total time, each 700 m split, each station time, the loads used, and effort.",
                    (
                        Session(1, "Yoddha Strength Week 4"),
                        Session(2, "Yoddha 500 m Repeats"),
                        Session(4, "Yoddha Station Touch"),
                        Session(6, "Yoddha Simulation"),
                    ),
                ),
            ),
        ),
        Phase(
            "Taper",
            "About half the volume, familiar movements, and a little steady work. No new exercises and no max tests.",
            (
                Week(
                    1,
                    "Week 1",
                    "Plan week 5 of 5. Taper. About half the work. No new exercises and no max tests. Rest Wednesday and Friday. Saturday is an easy shakeout. Sunday is a short race-morning primer; skip it if you are not racing. On race morning, jog easily, rehearse a few squats and wall balls, then stop.",
                    (
                        Session(1, "Yoddha Taper Strength"),
                        Session(2, "Yoddha Taper Run"),
                        Session(4, "Yoddha Taper Mixed"),
                        Session(6, "Yoddha Shakeout"),
                        Session(7, "Yoddha Race Morning"),
                    ),
                ),
            ),
        ),
    )


def _workout(
    name: str,
    description: str,
    minutes: int,
    kind: str,
    blocks: tuple[Block, ...],
    cooldown: str = COOLDOWN,
) -> Workout:
    return Workout(
        name=name,
        description=description,
        minutes=minutes,
        kind=kind,
        blocks=(
            Block("warmup", title="Warm up", instructions=WARMUP),
            *blocks,
            Block("cooldown", title="Cool down", instructions=cooldown),
        ),
    )


def _reps(
    exercise: str,
    sets: int,
    reps: int,
    rest: int,
    instructions: str | None = None,
    load: float | None = None,
    unit: str | None = None,
) -> Block:
    return Block(
        "exercise",
        exercise=exercise,
        sets=sets,
        reps_min=reps,
        reps_max=reps,
        rest_seconds=rest,
        instructions=instructions,
        load=load,
        load_unit=unit,
    )


def _meters(
    exercise: str,
    sets: int,
    meters: float,
    rest: int,
    instructions: str | None = None,
) -> Block:
    if exercise == "Treadmill" and instructions:
        instructions = f"{instructions} Run outdoors if you are not on a treadmill."
    return Block(
        "exercise",
        exercise=exercise,
        sets=sets,
        distance_meters=meters,
        rest_seconds=rest,
        instructions=instructions,
    )


def _minutes(exercise: str, minutes: int, instructions: str) -> Block:
    if exercise == "Treadmill":
        instructions = f"{instructions} Run outdoors if you are not on a treadmill."
    return Block(
        "exercise",
        exercise=exercise,
        sets=1,
        duration_seconds=minutes * 60,
        instructions=instructions,
    )


def _strides(sets: int) -> Block:
    return Block(
        "exercise",
        exercise="Treadmill",
        sets=sets,
        duration_seconds=20,
        rest_seconds=60,
        instructions="20 seconds, relaxed. Walk back fully before the next one. Run outdoors if you are not on a treadmill.",
    )


def _jumps(sets: int, reps: int, height_cm: float, instructions: str, rest: int = 60) -> Block:
    return Block(
        "exercise",
        exercise="Box Jump",
        sets=sets,
        reps_min=reps,
        reps_max=reps,
        rest_seconds=rest,
        height_cm=height_cm,
        instructions=instructions,
    )


def _exercise_names(week: Week, workouts: dict[str, Workout]) -> set[str]:
    names: set[str] = set()
    for session in week.sessions:
        for block in workouts[session.workout].blocks:
            if block.exercise is not None:
                names.add(block.exercise)
    return names


def _upsert_workout(connection: Connection, workout: Workout, exercise_ids: dict[str, str]) -> str:
    existing = _shared_id(connection, "workouts", workout.name)
    values = {"name": workout.name, "description": workout.description, "minutes": workout.minutes}
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
                  prescribed_load, load_unit, rest_seconds, instructions, configuration,
                  prescribed_duration_seconds, prescribed_distance_meters, prescribed_height_cm
                ) values (
                  :workout_id, :exercise_id, cast(:block_type as public.workout_block_type), :position, :title,
                  :sets, :reps_min, :reps_max,
                  :load, :load_unit, :rest_seconds, :instructions, '{}'::jsonb,
                  :duration_seconds, :distance_meters, :height_cm
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
                "load": block.load,
                "load_unit": block.load_unit,
                "rest_seconds": block.rest_seconds,
                "instructions": block.instructions,
                "duration_seconds": block.duration_seconds,
                "distance_meters": block.distance_meters,
                "height_cm": block.height_cm,
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


def _shared_exercise_ids(connection: Connection, plan: Plan) -> dict[str, str]:
    names = sorted({block.exercise for workout in plan.workouts for block in workout.blocks if block.exercise})
    found = {name: _shared_id(connection, "exercises", name) for name in names}
    missing = [name for name, exercise_id in found.items() if exercise_id is None]
    if missing:
        raise RuntimeError(
            "Missing shared exercises: "
            + ", ".join(missing)
            + ". Run seed_gym_exercises.py first."
        )
    return {name: exercise_id for name, exercise_id in found.items() if exercise_id is not None}


def _shared_id(connection: Connection, table: str, name: str) -> str | None:
    if table not in {"exercises", "workouts", "programs"}:
        raise ValueError(f"unsupported table {table}")
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



if __name__ == "__main__":
    raise SystemExit(main())
