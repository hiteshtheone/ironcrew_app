#!/usr/bin/env python3
"""Create the shared Upper Body and Core workout.

The exercises already live in the gym library seeded by seed_gym_exercises.py.
This script only writes the workout and its blocks. It does not insert or
update exercises.

Run from Projects/ironcrew after installing the development shell:

    PYTHONPATH=devshell python devshell/create_upper_body_core.py --dry-run
    DATABASE_URL='postgresql://...' PYTHONPATH=devshell python devshell/create_upper_body_core.py

Seed the exercise library first when the database does not already have it.
Running this script again replaces the blocks on the shared workout of the
same name.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Connection

from devshell.cli import create_shell_engine, reflection_schema
from seed_gym_exercises import Exercise, build_exercises

WORKOUT_NAME = "Upper Body and Core"
ALLOWED_BODY_PARTS = frozenset({"upper_body", "core_and_midsections"})
LOWER_AND_CARDIO = frozenset(
    {
        "abductors",
        "adductors",
        "calves",
        "cardio",
        "glutes",
        "hamstrings",
        "quadriceps",
    }
)


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
    instructions: str | None = None


@dataclass(frozen=True)
class Workout:
    name: str
    description: str
    minutes: int
    blocks: tuple[Block, ...]

    def exercise_names(self) -> tuple[str, ...]:
        return tuple(block.exercise for block in self.blocks if block.exercise is not None)


def build_workout() -> Workout:
    library = {exercise.name: exercise for exercise in build_exercises()}
    workout = Workout(
        name=WORKOUT_NAME,
        description=(
            "A gym session for the chest, back, shoulders, and arms, finished with trunk work. "
            "Every exercise comes from the shared gym library."
        ),
        minutes=60,
        blocks=(
            Block(
                "warmup",
                title="Warm up",
                instructions="Move the shoulders and hips for 3 minutes, then use the first two exercises as easy sets.",
            ),
            _prescribe(library, "Push-Up", 2, 8, 12, 45),
            _prescribe(library, "Bird Dog", 2, 6, 8, 45, "Each side counts as its own set."),
            Block(
                "notes",
                title="Upper body",
                instructions="Press and row first. Leave one or two reps in reserve on the main lifts.",
            ),
            _prescribe(library, "Bench Press", 4, 6, 8, 120),
            _prescribe(library, "Bent-Over Row", 4, 6, 8, 120),
            _prescribe(library, "Overhead Press", 3, 6, 10, 90),
            _prescribe(library, "Lat Pulldown", 3, 8, 12, 90),
            _prescribe(library, "Standing Lateral Raise", 3, 12, 15, 60),
            _prescribe(library, "Dumbbell Curl", 3, 8, 12, 60),
            _prescribe(library, "Cable Pushdown", 3, 10, 12, 60),
            Block(
                "notes",
                title="Core",
                instructions="Brace before each rep. Stop a set when the lower back takes over.",
            ),
            _prescribe(library, "Hanging Leg Raise", 3, 8, 12, 60),
            _prescribe(library, "Russian Twist", 3, 10, 12, 45),
            _prescribe(library, "Plank", 3, 30, 45, 45),
            _prescribe(library, "Bicycle Crunch", 3, 12, 16, 45),
            Block(
                "cooldown",
                title="Cool down",
                instructions="Breathe easy for 3 minutes. Stretch the chest, lats, and the front of the hips.",
            ),
        ),
    )
    validate_workout(workout, library)
    return workout


def validate_workout(workout: Workout, library: Mapping[str, Exercise]) -> None:
    if workout.name != WORKOUT_NAME:
        raise ValueError(f"workout name must be {WORKOUT_NAME}")
    if not 1 <= len(workout.name) <= 160:
        raise ValueError("workout name must be between 1 and 160 characters")
    if workout.minutes != 60:
        raise ValueError("the session is a 60 minute workout")
    if not workout.blocks or workout.blocks[0].block_type != "warmup" or workout.blocks[-1].block_type != "cooldown":
        raise ValueError("the workout needs a warm up and a cool down")

    names = workout.exercise_names()
    if len(names) != len(set(names)):
        raise ValueError("each exercise is used once")
    if not names:
        raise ValueError("the workout needs exercises")

    upper = False
    core = False
    for block in workout.blocks:
        if block.block_type == "exercise":
            _validate_exercise_block(block, library)
            exercise = library[block.exercise or ""]
            upper = upper or "upper_body" in exercise.body_parts
            core = core or "core_and_midsections" in exercise.body_parts
        elif block.exercise is not None:
            raise ValueError(f"{block.block_type} blocks do not take an exercise")

    if not upper or not core:
        raise ValueError("the workout needs both upper-body and core exercises")

    titles = [block.title for block in workout.blocks if block.block_type == "notes"]
    if titles != ["Upper body", "Core"]:
        raise ValueError("section notes must be Upper body, then Core")
    core_at = next(index for index, block in enumerate(workout.blocks) if block.title == "Core")
    core_names = {block.exercise for block in workout.blocks[core_at:] if block.exercise}
    if not core_names or any("core_and_midsections" not in library[name].body_parts for name in core_names):
        raise ValueError("exercises after the Core note must train the core")


def apply_workout(connection: Connection, workout: Workout) -> str:
    exercise_ids = _require_shared_exercises(connection, workout.exercise_names())
    workout_id = _upsert_workout(connection, workout, exercise_ids)
    return (
        f"Wrote shared workout {workout.name} ({workout_id}) "
        f"with {len(workout.exercise_names())} exercises."
    )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the shared Upper Body and Core workout.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate the workout against the seeded exercise library without connecting to the database.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    workout = build_workout()
    if args.dry_run:
        print(
            f"Validated {workout.name}: {len(workout.exercise_names())} exercises, "
            f"{workout.minutes} minutes."
        )
        return 0

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is required unless --dry-run is used.", file=sys.stderr)
        return 2
    engine, normalized = create_shell_engine(database_url)
    if reflection_schema(normalized) != "public":
        print("DATABASE_URL must be a Postgres database.", file=sys.stderr)
        engine.dispose()
        return 2
    try:
        with engine.begin() as connection:
            print(apply_workout(connection, workout))
    except LookupError as error:
        print(error, file=sys.stderr)
        return 1
    finally:
        engine.dispose()
    return 0


def _prescribe(
    library: Mapping[str, Exercise],
    name: str,
    sets: int,
    low: int,
    high: int,
    rest_seconds: int,
    instructions: str | None = None,
) -> Block:
    exercise = library[name]
    if exercise.tracking_type == "time":
        note = f"Hold {low}-{high} seconds."
        return Block(
            "exercise",
            exercise=name,
            sets=sets,
            rest_seconds=rest_seconds,
            duration_seconds=low,
            instructions=_join_notes(note, instructions),
        )
    return Block(
        "exercise",
        exercise=name,
        sets=sets,
        reps_min=low,
        reps_max=high,
        rest_seconds=rest_seconds,
        instructions=instructions,
    )


def _validate_exercise_block(block: Block, library: Mapping[str, Exercise]) -> None:
    if block.exercise is None or block.exercise not in library:
        raise ValueError(f"{block.exercise!r} is not in the shared gym library")
    exercise = library[block.exercise]
    parts = set(exercise.body_parts)
    if not parts or not parts <= ALLOWED_BODY_PARTS:
        raise ValueError(f"{exercise.name} is not an upper-body or core exercise")
    if exercise.primary_muscle_group in LOWER_AND_CARDIO:
        raise ValueError(f"{exercise.name} does not belong in this workout")
    if block.sets is None or block.sets <= 0:
        raise ValueError(f"{exercise.name} needs at least one set")
    if block.rest_seconds is None or block.rest_seconds < 0:
        raise ValueError(f"{exercise.name} needs a rest interval")
    if exercise.tracking_type == "time":
        if block.duration_seconds is None or block.duration_seconds <= 0 or block.reps_min is not None:
            raise ValueError(f"{exercise.name} is tracked by time")
        return
    if exercise.tracking_type not in {"reps", "weight_reps"}:
        raise ValueError(f"{exercise.name} uses {exercise.tracking_type}, which this workout does not prescribe")
    if (
        block.duration_seconds is not None
        or block.reps_min is None
        or block.reps_max is None
        or block.reps_max < block.reps_min
    ):
        raise ValueError(f"{exercise.name} needs a rep range")


def _require_shared_exercises(connection: Connection, names: Sequence[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    missing: list[str] = []
    for name in names:
        rows = connection.execute(
            text(
                """
                select id::text as id
                from public.exercises
                where trainer_id is null
                  and owner_client_id is null
                  and name = :name
                """
            ),
            {"name": name},
        ).all()
        if len(rows) > 1:
            raise RuntimeError(f"more than one shared exercise is named {name}")
        if not rows:
            missing.append(name)
            continue
        found[name] = str(rows[0].id)
    if missing:
        joined = ", ".join(missing)
        raise LookupError(f"Missing shared exercises: {joined}. Run seed_gym_exercises.py first.")
    return found


def _upsert_workout(connection: Connection, workout: Workout, exercise_ids: Mapping[str, str]) -> str:
    rows = connection.execute(
        text(
            """
            select id::text as id
            from public.workouts
            where trainer_id is null
              and owner_client_id is null
              and name = :name
            """
        ),
        {"name": workout.name},
    ).all()
    if len(rows) > 1:
        raise RuntimeError(f"more than one shared workout is named {workout.name}")
    values = {"name": workout.name, "description": workout.description, "minutes": workout.minutes}
    if rows:
        workout_id = str(rows[0].id)
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
            {**values, "id": workout_id},
        )
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
        connection.execute(
            text(
                """
                insert into public.workout_blocks (
                  workout_id, exercise_id, block_type, position, title,
                  prescribed_sets, prescribed_reps_min, prescribed_reps_max,
                  rest_seconds, instructions, configuration,
                  prescribed_duration_seconds
                ) values (
                  :workout_id, :exercise_id, cast(:block_type as public.workout_block_type), :position, :title,
                  :sets, :reps_min, :reps_max,
                  :rest_seconds, :instructions, '{}'::jsonb,
                  :duration_seconds
                )
                """
            ),
            {
                "workout_id": workout_id,
                "exercise_id": exercise_ids[block.exercise] if block.exercise else None,
                "block_type": block.block_type,
                "position": position,
                "title": block.title,
                "sets": block.sets,
                "reps_min": block.reps_min,
                "reps_max": block.reps_max,
                "rest_seconds": block.rest_seconds,
                "instructions": block.instructions,
                "duration_seconds": block.duration_seconds,
            },
        )
    return workout_id


def _insert_returning(connection: Connection, statement: str, values: dict) -> str:
    row = connection.execute(text(statement), values).one()
    return str(row.id)


def _join_notes(*notes: str | None) -> str | None:
    parts = [note for note in notes if note]
    return " ".join(parts) if parts else None


if __name__ == "__main__":
    raise SystemExit(main())
