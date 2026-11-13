from create_beginner_10k import build_plan as build_beginner_10k
from create_yoddha import build_plan
from seed_gym_exercises import build_exercises


def test_yoddha_matches_the_five_week_brief():
    plan = build_plan()
    workouts = plan.workout_by_name()
    weeks = [week for phase in plan.phases for week in phase.weeks]

    assert plan.name == "Yoddha 5-week"
    assert plan.estimated_duration_weeks == 5
    assert [phase.name for phase in plan.phases] == ["Base", "Race-specific", "Taper"]
    assert [len(phase.weeks) for phase in plan.phases] == [2, 2, 1]
    used = {
        block.exercise
        for workout in plan.workouts
        for block in workout.blocks
        if block.exercise is not None
    }
    assert used <= {exercise.name for exercise in build_exercises()}

    assert [session.workout for session in weeks[0].sessions] == [
        "Yoddha Strength Week 1",
        "Yoddha Easy Run 25 min",
        "Yoddha Station Practice 1",
        "Yoddha Run and Stations 1",
    ]
    assert [session.workout for session in weeks[1].sessions] == [
        "Yoddha Strength Week 2",
        "Yoddha Easy Run 30 min",
        "Yoddha Station Practice 2",
        "Yoddha Run and Stations 2",
    ]
    assert [session.workout for session in weeks[2].sessions] == [
        "Yoddha Strength Week 3",
        "Yoddha 700 m Repeats",
        "Yoddha Compromised Rounds",
        "Yoddha Easy Run and Wall Balls",
    ]
    assert [session.workout for session in weeks[3].sessions] == [
        "Yoddha Strength Week 4",
        "Yoddha 500 m Repeats",
        "Yoddha Station Touch",
        "Yoddha Simulation",
    ]
    assert [session.workout for session in weeks[4].sessions] == [
        "Yoddha Taper Strength",
        "Yoddha Taper Run",
        "Yoddha Taper Mixed",
        "Yoddha Shakeout",
        "Yoddha Race Morning",
    ]
    assert [session.day for session in weeks[4].sessions] == [1, 2, 4, 6, 7]

    assert _duration(workouts["Yoddha Easy Run 25 min"], "Treadmill") == 25 * 60
    assert _duration(workouts["Yoddha Easy Run 30 min"], "Treadmill") == 30 * 60
    assert _distance(workouts["Yoddha Station Practice 1"], "Rowing") == 500
    assert _distance(workouts["Yoddha Station Practice 2"], "Rowing") == 750
    assert _distance(workouts["Yoddha Station Practice 1"], "Sled Push") == 15
    assert _distance(workouts["Yoddha Station Practice 2"], "Sled Push") == 20
    assert _reps(workouts["Yoddha Strength Week 1"], "Squat") == (3, 8)
    assert _reps(workouts["Yoddha Strength Week 2"], "Squat") == (3, 10)
    assert _reps(workouts["Yoddha Strength Week 3"], "Squat") == (3, 6)
    assert _reps(workouts["Yoddha Strength Week 4"], "Squat") == (2, 6)
    assert _reps(workouts["Yoddha Taper Strength"], "Squat") == (2, 5)

    repeats = _blocks(workouts["Yoddha 700 m Repeats"], "Treadmill")
    assert [(block.sets, block.distance_meters, block.rest_seconds) for block in repeats] == [(4, 700, 120)]
    compromised = workouts["Yoddha Compromised Rounds"]
    assert compromised.description.startswith("Hard.")
    assert [block.distance_meters for block in _blocks(compromised, "Treadmill")] == [400, 400, 400]
    assert _blocks(compromised, "Sled Pull")[0].rest_seconds == 180

    simulation = workouts["Yoddha Simulation"]
    assert simulation.kind == "simulation"
    assert simulation.minutes == 70
    assert [
        (block.exercise, block.distance_meters)
        for block in simulation.blocks
        if block.block_type == "exercise"
    ] == [
        ("Treadmill", 700),
        ("Rowing", 500),
        ("Treadmill", 700),
        ("Sled Push", 30),
        ("Treadmill", 700),
        ("Sled Pull", 30),
        ("Treadmill", 700),
        ("Farmer Carry", 100),
    ]
    assert _blocks(workouts["Yoddha 500 m Repeats"], "Treadmill")[0].sets == 5
    assert _reps(workouts["Yoddha Run and Stations 1"], "Wall Ball") == (3, 10)
    assert _blocks(workouts["Yoddha Run and Stations 1"], "Wall Ball")[0].load == 6
    assert _blocks(workouts["Yoddha Run and Stations 1"], "Box Jump")[0].height_cm == 60

    taper_names = {
        block.exercise
        for session in weeks[4].sessions
        for block in workouts[session.workout].blocks
        if block.exercise is not None
    }
    earlier_names = {
        block.exercise
        for week in weeks[:4]
        for session in week.sessions
        for block in workouts[session.workout].blocks
        if block.exercise is not None
    }
    assert taper_names <= earlier_names
    assert all(workout.minutes <= 70 for workout in plan.workouts)
    assert workouts["Yoddha Taper Mixed"].description.startswith("Steady.")
    assert "skip it if you are not racing" in weeks[4].notes


def test_yoddha_workouts_do_not_replace_beginner_10k_rows():
    yoddha = build_plan()
    beginner = build_beginner_10k()

    assert yoddha.name != beginner.name
    assert {workout.name for workout in yoddha.workouts}.isdisjoint(workout.name for workout in beginner.workouts)


def _blocks(workout, exercise: str):
    return [block for block in workout.blocks if block.exercise == exercise]


def _duration(workout, exercise: str) -> int:
    return _blocks(workout, exercise)[0].duration_seconds


def _distance(workout, exercise: str) -> float:
    return _blocks(workout, exercise)[0].distance_meters


def _reps(workout, exercise: str) -> tuple[int, int]:
    block = _blocks(workout, exercise)[0]
    return (block.sets, block.reps_min)
