from dataclasses import replace

import pytest

from create_upper_body_core import (
    ALLOWED_BODY_PARTS,
    WORKOUT_NAME,
    apply_workout,
    build_workout,
    main,
    validate_workout,
)
from seed_gym_exercises import build_exercises


EXERCISE_ORDER = (
    "Push-Up",
    "Bird Dog",
    "Bench Press",
    "Bent-Over Row",
    "Overhead Press",
    "Lat Pulldown",
    "Standing Lateral Raise",
    "Dumbbell Curl",
    "Cable Pushdown",
    "Hanging Leg Raise",
    "Russian Twist",
    "Plank",
    "Bicycle Crunch",
)


def test_workout_uses_only_seeded_upper_body_and_core_exercises():
    library = {exercise.name: exercise for exercise in build_exercises()}
    workout = build_workout()

    assert workout.name == WORKOUT_NAME
    assert workout.minutes == 60
    assert workout.exercise_names() == EXERCISE_ORDER
    assert workout.blocks[0].block_type == "warmup"
    assert workout.blocks[-1].block_type == "cooldown"
    assert [block.title for block in workout.blocks if block.block_type == "notes"] == ["Upper body", "Core"]

    for name in workout.exercise_names():
        exercise = library[name]
        assert set(exercise.body_parts) <= ALLOWED_BODY_PARTS
        assert exercise.primary_muscle_group not in {"quadriceps", "hamstrings", "glutes", "calves", "cardio"}

    assert any("upper_body" in library[name].body_parts for name in workout.exercise_names())
    assert any("core_and_midsections" in library[name].body_parts for name in workout.exercise_names())

    bench = _block(workout, "Bench Press")
    assert bench.sets == 4
    assert (bench.reps_min, bench.reps_max) == (6, 8)
    assert bench.duration_seconds is None

    plank = _block(workout, "Plank")
    assert plank.sets == 3
    assert plank.duration_seconds == 30
    assert plank.reps_min is None
    assert plank.instructions == "Hold 30-45 seconds."


def test_validate_rejects_exercises_outside_the_library():
    library = {exercise.name: exercise for exercise in build_exercises()}
    workout = build_workout()
    blocks = tuple(
        replace(block, exercise="Kettlebell Swing") if block.exercise == "Bench Press" else block
        for block in workout.blocks
    )

    with pytest.raises(ValueError, match="not in the shared gym library"):
        validate_workout(replace(workout, blocks=blocks), library)


def test_validate_rejects_lower_body_exercises():
    library = {exercise.name: exercise for exercise in build_exercises()}
    workout = build_workout()
    blocks = tuple(
        replace(block, exercise="Squat", reps_min=8, reps_max=10, duration_seconds=None)
        if block.exercise == "Bench Press"
        else block
        for block in workout.blocks
    )

    with pytest.raises(ValueError, match="not an upper-body or core exercise"):
        validate_workout(replace(workout, blocks=blocks), library)


def test_dry_run_validates_without_a_database(capsys):
    assert main(["--dry-run"]) == 0
    assert capsys.readouterr().out == "Validated Upper Body and Core: 13 exercises, 60 minutes.\n"


def test_apply_links_existing_exercises_and_does_not_insert_new_ones():
    connection = RecordingConnection(known_exercises=set(EXERCISE_ORDER))

    message = apply_workout(connection, build_workout())

    assert message.startswith("Wrote shared workout Upper Body and Core (workout-1)")
    statements = [sql.lower() for sql, _parameters in connection.calls]
    assert not any("insert into public.exercises" in sql for sql in statements)
    assert not any("update public.exercises" in sql for sql in statements)
    inserted = [parameters for sql, parameters in connection.calls if "insert into public.workout_blocks" in sql.lower()]
    assert [parameters["exercise_id"] for parameters in inserted if parameters["exercise_id"]] == [
        f"exercise-{name}" for name in EXERCISE_ORDER
    ]
    assert inserted[0]["block_type"] == "warmup"
    assert inserted[-1]["block_type"] == "cooldown"
    plank = next(parameters for parameters in inserted if parameters["exercise_id"] == "exercise-Plank")
    assert plank["duration_seconds"] == 30
    assert plank["reps_min"] is None


def test_apply_replaces_blocks_when_the_workout_already_exists():
    connection = RecordingConnection(known_exercises=set(EXERCISE_ORDER), workout_id="existing-workout")

    message = apply_workout(connection, build_workout())

    assert message.startswith("Wrote shared workout Upper Body and Core (existing-workout)")
    statements = [sql.lower() for sql, _parameters in connection.calls]
    assert not any("insert into public.workouts" in sql for sql in statements)
    assert any("update public.workouts" in sql for sql in statements)
    assert any("delete from public.workout_blocks" in sql for sql in statements)
    deleted = next(parameters for sql, parameters in connection.calls if "delete from public.workout_blocks" in sql.lower())
    assert deleted["id"] == "existing-workout"


def test_apply_reports_missing_seed_exercises():
    connection = RecordingConnection(known_exercises=set(EXERCISE_ORDER) - {"Plank", "Bench Press"})

    with pytest.raises(LookupError, match="Missing shared exercises: Bench Press, Plank"):
        apply_workout(connection, build_workout())


def _block(workout, name: str):
    return next(block for block in workout.blocks if block.exercise == name)


class RecordingConnection:
    def __init__(self, known_exercises: set[str], workout_id: str | None = None):
        self.known_exercises = known_exercises
        self.workout_id = workout_id
        self.calls = []

    def execute(self, statement, parameters):
        sql = str(statement)
        self.calls.append((sql, parameters))
        if "from public.exercises" in sql:
            name = parameters["name"]
            if name not in self.known_exercises:
                return Rows([])
            return Rows([Row(id=f"exercise-{name}")])
        if "from public.workouts" in sql:
            if self.workout_id is None:
                return Rows([])
            return Rows([Row(id=self.workout_id)])
        if "returning id" in sql:
            return Rows([Row(id="workout-1")])
        return Rows([])


class Rows:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def one(self):
        return self._rows[0]


class Row:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
