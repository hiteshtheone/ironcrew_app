from create_beginner_10k import build_plan as build_10k_plan
from create_beginner_5k import LEG_AND_CORE, build_plan


def test_beginner_5k_matches_the_three_phases():
    plan = build_plan()
    workouts = plan.workout_by_name()
    exercises = {exercise.name: exercise for exercise in plan.exercises}

    assert plan.name == "Beginner 5k"
    assert plan.estimated_duration_weeks == 8
    assert [phase.name for phase in plan.phases] == ["Build", "Endurance phase", "Taper"]
    assert [len(phase.weeks) for phase in plan.phases] == [4, 3, 1]

    build = [_weekly_km(week, workouts) for week in plan.phases[0].weeks]
    assert build == [3.5, 5.0, 5.5, 3.5]
    assert [_kind_count(week, workouts, "strength") for week in plan.phases[0].weeks] == [2, 3, 3, 2]

    endurance = [_weekly_km(week, workouts) for week in plan.phases[1].weeks]
    assert endurance == [7.0, 7.5, 9.0]
    assert [_kind_count(week, workouts, "strength") for week in plan.phases[1].weeks] == [2, 1, 2]

    taper = plan.phases[2].weeks[0]
    assert _weekly_km(taper, workouts) == 2.5
    assert _run_count(taper, workouts) == 2
    assert _kind_count(taper, workouts, "strength") == 3
    assert "Race the 5k" in taper.notes

    expected_quality = (None, None, "tempo", "tempo", "interval", "tempo", "interval", "tempo")
    plan_weeks = [week for phase in plan.phases for week in phase.weeks]
    for plan_week, week in enumerate(plan_weeks, start=1):
        runs = [session for session in week.sessions if workouts[session.workout].kind != "strength"]
        quality = expected_quality[plan_week - 1]
        if plan_week == 8:
            assert [workouts[session.workout].kind for session in runs] == ["easy", "tempo"]
            assert [session.day for session in runs] == [1, 4]
        elif quality is None:
            assert [workouts[session.workout].kind for session in runs] == ["easy", "easy", "long"]
            assert [session.day for session in runs] == [1, 3, 5]
        else:
            assert [workouts[session.workout].kind for session in runs] == ["easy", quality, "long"]
            assert [session.day for session in runs] == [1, 3, 5]

    for workout in plan.workouts:
        if workout.kind == "strength":
            muscles = {
                exercise.muscle
                for exercise in plan.exercises
                if exercise.name in {block.exercise for block in workout.blocks}
            }
            assert muscles <= LEG_AND_CORE
            assert all(block.heart_rate_bpm is None for block in workout.blocks)
            continue
        assert not workout.name.startswith("Beginner")
        for block in workout.blocks:
            if block.exercise == "Easy Run":
                assert block.heart_rate_bpm == 140
            elif block.exercise == "Tempo Run":
                assert block.heart_rate_bpm == 160
            elif block.exercise in {"Long Run", "Interval Run"}:
                assert block.heart_rate_bpm is None

    assert exercises["Easy Run"].tracking_type == "custom"
    assert exercises["Easy Run"].parameter_list == ("distance", "time", "heart_rate")
    assert exercises["Tempo Run"].tracking_type == "custom"
    assert exercises["Tempo Run"].parameter_list == ("distance", "time", "heart_rate")
    assert exercises["Interval Run"].tracking_type == "time"
    assert exercises["Long Run"].tracking_type == "distance_time"

    assert "Run 1 minute and walk 2 minutes" in _exercise_block(workouts, "Easy Run 1.0 km").instructions
    assert "Run 2 minutes and walk 1 minute" in _exercise_block(workouts, "Easy Run 2.0 km").instructions
    assert "Run 2 minutes and walk 1 minute" in _exercise_block(workouts, "Long Run 2.5 km").instructions
    assert "Run 4 minutes and walk 1 minute" in _exercise_block(workouts, "Long Run 3.0 km").instructions
    assert "Run 8 minutes and walk 1 minute" in _exercise_block(workouts, "Long Run 4.0 km").instructions
    assert _exercise_block(workouts, "Tempo Run 1.5 km").distance_meters == 1500
    assert _exercise_block(workouts, "Tempo Run 1.5 km").heart_rate_bpm == 160

    four_by_one = workouts["Interval Run 4 x 1 min"]
    six_by_one = workouts["Interval Run 6 x 1 min"]
    assert four_by_one.distance_km == 2.0
    assert six_by_one.distance_km == 2.5
    assert _exercise_block(workouts, four_by_one.name).sets == 4
    assert _exercise_block(workouts, four_by_one.name).duration_seconds == 60
    assert _exercise_block(workouts, four_by_one.name).rest_seconds == 120
    assert _exercise_block(workouts, six_by_one.name).sets == 6
    assert _exercise_block(workouts, six_by_one.name).rest_seconds == 90


def test_shared_catalog_rows_match_the_10k_plan():
    five = build_plan()
    ten = build_10k_plan()
    five_workouts = five.workout_by_name()
    ten_workouts = ten.workout_by_name()

    shared_names = set(five_workouts) & set(ten_workouts)
    assert shared_names
    assert all(five_workouts[name].kind == "strength" for name in shared_names)
    for name in shared_names:
        assert five_workouts[name].description == ten_workouts[name].description
        assert [_signature(block) for block in five_workouts[name].blocks] == [
            _signature(block) for block in ten_workouts[name].blocks
        ]

    five_runs = {workout.name for workout in five.workouts if workout.kind != "strength"}
    ten_runs = {workout.name for workout in ten.workouts if workout.kind == "run"}
    assert five_runs.isdisjoint(ten_runs)

    five_easy = next(exercise for exercise in five.exercises if exercise.name == "Easy Run")
    ten_easy = next(exercise for exercise in ten.exercises if exercise.name == "Easy Run")
    assert five_easy.description == ten_easy.description
    assert five_easy.instructions == ten_easy.instructions
    assert five_easy.tracking_type == ten_easy.tracking_type == "custom"
    assert five_easy.parameter_list == ten_easy.parameter_list == ("distance", "time", "heart_rate")
    assert "10k" not in five_easy.description
    assert "5k" not in five_easy.description


def _weekly_km(week, workouts) -> float:
    return sum(
        workouts[session.workout].distance_km or 0
        for session in week.sessions
        if workouts[session.workout].kind != "strength"
    )


def _kind_count(week, workouts, kind: str) -> int:
    return sum(1 for session in week.sessions if workouts[session.workout].kind == kind)


def _run_count(week, workouts) -> int:
    return sum(1 for session in week.sessions if workouts[session.workout].kind != "strength")


def _exercise_block(workouts, name: str):
    return next(block for block in workouts[name].blocks if block.block_type == "exercise")


def _signature(block):
    return (
        block.block_type,
        block.title,
        block.exercise,
        block.sets,
        block.reps_min,
        block.reps_max,
        block.rest_seconds,
        block.duration_seconds,
        block.distance_meters,
        block.instructions,
    )
