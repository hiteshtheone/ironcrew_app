from seed_gym_exercises import (
    BODY_PARTS,
    MUSCLES,
    TRACKING_PARAMETERS,
    build_exercises,
    main,
    seed_exercises,
    validate_exercises,
)


def test_exercise_reference_payload_is_complete_and_valid():
    exercises = build_exercises()

    validate_exercises(exercises)

    assert len(exercises) == 50
    assert len({exercise.name for exercise in exercises}) == 50
    assert {"Squat", "Push-Up", "Deadlift", "Glute Bridge", "Burpee"} <= {
        exercise.name for exercise in exercises
    }
    by_name = {exercise.name: exercise for exercise in exercises}
    assert by_name["Dead Bug"].tracking_type == "reps"
    assert by_name["Farmer Carry"].tracking_type == "distance_weight"
    assert by_name["Sled Push"].tracking_type == "distance_weight"
    assert by_name["Sled Pull"].tracking_type == "distance_weight"
    assert by_name["Box Jump"].tracking_type == "reps_height"
    assert by_name["Wall Ball"].tracking_type == "weight_reps"
    for exercise in exercises:
        assert exercise.primary_muscle_group in MUSCLES
        assert set(exercise.secondary_muscle_groups) <= MUSCLES
        assert set(exercise.body_parts) <= BODY_PARTS
        assert exercise.tracking_parameters == TRACKING_PARAMETERS[exercise.tracking_type]


def test_dry_run_validates_without_a_database(capsys):
    assert main(["--dry-run"]) == 0
    assert capsys.readouterr().out == "Validated 50 shared gym exercises.\n"


def test_seed_executes_one_upsert_per_exercise():
    connection = RecordingConnection()
    exercises = build_exercises()

    assert seed_exercises(connection, exercises) == 50
    assert len(connection.calls) == 50
    first_parameters = connection.calls[0]
    assert first_parameters["name"] == "Bench Press"
    assert first_parameters["tracking_parameters"] == "{weight,reps}"
    assert first_parameters["secondary_muscle_groups"] == "{shoulders,triceps}"
    assert first_parameters["body_parts"] == "{upper_body}"


class RecordingConnection:
    def __init__(self):
        self.calls = []

    def execute(self, _statement, parameters):
        self.calls.append(parameters)
