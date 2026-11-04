from create_beginner_10k import LEG_AND_CORE, build_plan


def test_beginner_10k_matches_the_three_phases():
    plan = build_plan()
    workouts = plan.workout_by_name()

    assert all("10k" not in exercise.name for exercise in plan.exercises)
    assert all("10k" not in workout.name for workout in plan.workouts)
    assert [phase.name for phase in plan.phases] == ["Build", "Endurance phase", "Taper"]
    assert [len(phase.weeks) for phase in plan.phases] == [4, 3, 1]
    assert plan.estimated_duration_weeks == 8

    build = [_weekly_km(week, workouts) for week in plan.phases[0].weeks]
    assert build[0] < build[1] < build[2]
    assert build[3] < build[2]
    assert [_kind_count(week, workouts, "strength") for week in plan.phases[0].weeks] == [2, 3, 3, 2]

    endurance = [_weekly_km(week, workouts) for week in plan.phases[1].weeks]
    assert endurance[0] < endurance[1] < endurance[2]
    assert [_kind_count(week, workouts, "strength") for week in plan.phases[1].weeks] == [2, 1, 2]

    taper = plan.phases[2].weeks[0]
    assert _kind_count(taper, workouts, "run") == 2
    assert _kind_count(taper, workouts, "strength") == 3

    for workout in plan.workouts:
        if workout.kind != "strength":
            continue
        muscles = {
            exercise.muscle
            for exercise in plan.exercises
            if exercise.name in {block.exercise for block in workout.blocks}
        }
        assert muscles <= LEG_AND_CORE


def _weekly_km(week, workouts) -> float:
    return sum(workouts[session.workout].distance_km or 0 for session in week.sessions if workouts[session.workout].kind == "run")


def _kind_count(week, workouts, kind: str) -> int:
    return sum(1 for session in week.sessions if workouts[session.workout].kind == kind)
