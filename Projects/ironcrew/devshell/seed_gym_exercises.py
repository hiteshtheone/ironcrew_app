#!/usr/bin/env python3
"""Seed the shared gym exercise reference library.

Run from Projects/ironcrew after installing the development shell:

    PYTHONPATH=devshell python devshell/seed_gym_exercises.py --dry-run
    DATABASE_URL='postgresql://...' PYTHONPATH=devshell python devshell/seed_gym_exercises.py

Rows are shared system exercises. Running the script again updates matching
shared names and leaves trainer- and client-owned exercises untouched.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Connection

from devshell.cli import create_shell_engine, reflection_schema

MUSCLES = frozenset(
    {
        "abdominals",
        "biceps",
        "chest",
        "forearms",
        "lats",
        "lower_back",
        "neck",
        "shoulders",
        "traps",
        "triceps",
        "upper_back",
        "abductors",
        "adductors",
        "calves",
        "glutes",
        "hamstrings",
        "quadriceps",
        "cardio",
        "full_body",
        "other",
    }
)
BODY_PARTS = frozenset({"upper_body", "lower_body", "full_body", "core_and_midsections"})
TRACKING_PARAMETERS = {
    "time": ("time",),
    "reps": ("reps",),
    "weight_reps": ("weight", "reps"),
    "distance_time": ("distance", "time"),
    "distance_weight": ("distance", "weight"),
    "reps_height": ("reps", "height"),
}


@dataclass(frozen=True)
class Exercise:
    name: str
    description: str
    instructions: str
    primary_muscle_group: str
    equipment: str
    tracking_type: str
    secondary_muscle_groups: tuple[str, ...]
    body_parts: tuple[str, ...]

    @property
    def tracking_parameters(self) -> tuple[str, ...]:
        return TRACKING_PARAMETERS[self.tracking_type]


def build_exercises() -> tuple[Exercise, ...]:
    strength = "weight_reps"
    reps = "reps"
    return (
        Exercise("Bench Press", "Compound horizontal press for chest strength.", "Lie on the bench, lower the bar to mid-chest, then press it upward while keeping your feet planted.", "chest", "barbell", strength, ("shoulders", "triceps"), ("upper_body",)),
        Exercise("Incline Bench Press", "Inclined press emphasizing the upper chest.", "Set the bench to a moderate incline, lower the bar toward the upper chest, then press to full extension.", "chest", "barbell", strength, ("shoulders", "triceps"), ("upper_body",)),
        Exercise("Dumbbell Fly", "Chest isolation exercise using a wide arc.", "Lie on a bench with slightly bent elbows, open your arms until the chest stretches, then bring the dumbbells together.", "chest", "dumbbell", strength, ("shoulders",), ("upper_body",)),
        Exercise("Dumbbell Bench Press", "Independent-arm horizontal chest press.", "Lower both dumbbells beside your chest, keep your wrists stacked over your elbows, and press upward.", "chest", "dumbbell", strength, ("shoulders", "triceps"), ("upper_body",)),
        Exercise("Push-Up", "Bodyweight press developing the chest and upper body.", "Start in a rigid plank, lower your chest between your hands, then push the floor away without letting your hips sag.", "chest", "bodyweight", reps, ("shoulders", "triceps", "abdominals"), ("upper_body", "core_and_midsections")),
        Exercise("Bent-Over Row", "Hip-hinged pulling exercise for back strength.", "Hinge with a neutral spine, pull the weight toward your lower ribs, squeeze your shoulder blades, and lower it under control.", "upper_back", "barbell or dumbbell", strength, ("lats", "biceps", "lower_back"), ("upper_body",)),
        Exercise("Lat Pulldown", "Vertical cable pull targeting the latissimus dorsi.", "Grip the bar overhead, keep your torso stable, pull it toward your upper chest, and return slowly.", "lats", "cable", strength, ("biceps", "upper_back"), ("upper_body",)),
        Exercise("Deadlift", "Compound floor pull strengthening the posterior chain.", "Brace your trunk, drive through the floor, extend your hips and knees together, then return the bar with a controlled hip hinge.", "glutes", "barbell", strength, ("hamstrings", "lower_back", "quadriceps", "traps"), ("full_body",)),
        Exercise("Pull-Up", "Bodyweight vertical pull for the back and arms.", "Hang from an overhand grip, pull your chest toward the bar until your chin clears it, then lower under control.", "lats", "pull-up bar", reps, ("biceps", "upper_back", "forearms"), ("upper_body",)),
        Exercise("Bird Dog", "Contralateral core-stability exercise.", "From hands and knees, extend the opposite arm and leg without rotating your hips, pause, and alternate sides.", "abdominals", "bodyweight", reps, ("lower_back", "glutes", "shoulders"), ("core_and_midsections",)),
        Exercise("Seated Dumbbell Press", "Seated overhead press for shoulder strength.", "Sit upright, begin with the dumbbells at shoulder height, press overhead, and lower without arching your back.", "shoulders", "dumbbell", strength, ("triceps", "traps"), ("upper_body",)),
        Exercise("Arnold Press", "Rotating dumbbell press training multiple shoulder heads.", "Begin with palms facing you, rotate them outward as you press overhead, then reverse the motion while lowering.", "shoulders", "dumbbell", strength, ("triceps", "traps"), ("upper_body",)),
        Exercise("Standing Lateral Raise", "Isolation movement for the middle deltoids.", "With soft elbows, raise light dumbbells out to shoulder height, pause, and lower without swinging.", "shoulders", "dumbbell", strength, ("traps",), ("upper_body",)),
        Exercise("Bent-Over Rear Delt Fly", "Bent-over isolation exercise for the rear shoulders.", "Hinge forward with a neutral spine, raise the weights out to the sides, squeeze the rear shoulders, and lower slowly.", "shoulders", "dumbbell", strength, ("upper_back", "traps"), ("upper_body",)),
        Exercise("Barbell Curl", "Bilateral curl for biceps strength and size.", "Keep your elbows beside your torso, curl the bar toward your shoulders, squeeze, and lower without swinging.", "biceps", "barbell", strength, ("forearms",), ("upper_body",)),
        Exercise("Dumbbell Curl", "Independent-arm curl supporting balanced biceps development.", "Hold the dumbbells at your sides, curl them without moving your upper arms, and lower under control.", "biceps", "dumbbell", strength, ("forearms",), ("upper_body",)),
        Exercise("Hammer Curl", "Neutral-grip curl emphasizing the biceps and forearms.", "Keep your palms facing inward, curl the dumbbells toward your shoulders, and lower while keeping your elbows fixed.", "biceps", "dumbbell", strength, ("forearms",), ("upper_body",)),
        Exercise("Preacher Curl", "Supported curl that isolates the biceps.", "Rest your upper arms on the preacher pad, curl the weight without lifting your elbows, and lower to a controlled stretch.", "biceps", "EZ bar", strength, ("forearms",), ("upper_body",)),
        Exercise("Concentration Curl", "Single-arm seated curl emphasizing control.", "Brace your elbow against your inner thigh, curl the dumbbell toward your shoulder, then lower without moving your upper arm.", "biceps", "dumbbell", strength, ("forearms",), ("upper_body",)),
        Exercise("Cable Curl", "Cable-based curl providing continuous resistance.", "Stand tall with your elbows close to your sides, curl the handle upward, squeeze the biceps, and return slowly.", "biceps", "cable", strength, ("forearms",), ("upper_body",)),
        Exercise("Cable Pushdown", "Cable isolation exercise for the triceps.", "Keep your elbows pinned beside your torso, push the attachment down until your arms straighten, then return under control.", "triceps", "cable", strength, ("forearms",), ("upper_body",)),
        Exercise("Skull Crusher / Lying Triceps Extension", "Lying elbow-extension exercise for the triceps.", "Lie on a bench, bend only your elbows to lower the weight near your forehead, then extend your arms without flaring.", "triceps", "EZ bar or dumbbell", strength, ("forearms",), ("upper_body",)),
        Exercise("Overhead Dumbbell Extension", "Overhead elbow extension emphasizing the long head of the triceps.", "Hold one dumbbell overhead, lower it behind your head by bending your elbows, then extend your arms fully.", "triceps", "dumbbell", strength, ("shoulders",), ("upper_body",)),
        Exercise("Diamond Push-Up", "Close-hand push-up emphasizing the triceps.", "Form a diamond with your hands beneath your chest, lower with your elbows close, then press back to a rigid plank.", "triceps", "bodyweight", reps, ("chest", "shoulders", "abdominals"), ("upper_body", "core_and_midsections")),
        Exercise("Squat", "Compound lower-body exercise built around knee and hip flexion.", "Stand with feet about shoulder-width apart, sit your hips down and back, keep your knees aligned with your toes, and stand through your feet.", "quadriceps", "bodyweight or free weight", strength, ("glutes", "hamstrings", "calves", "abdominals"), ("lower_body",)),
        Exercise("Lunge", "Unilateral lower-body exercise developing leg strength and balance.", "Step forward or backward, lower until both knees approach right angles, then drive through the working foot to return.", "quadriceps", "bodyweight or dumbbell", strength, ("glutes", "hamstrings", "calves"), ("lower_body",)),
        Exercise("Calf Raise", "Ankle-extension exercise for calf strength.", "Rise onto the balls of your feet, pause at the top, then lower your heels through a comfortable range.", "calves", "bodyweight or machine", strength, (), ("lower_body",)),
        Exercise("Glute Bridge", "Floor-based hip extension for the glutes.", "Lie with your knees bent, drive through your heels, lift your hips until your torso and thighs align, and squeeze your glutes.", "glutes", "bodyweight", reps, ("hamstrings", "abdominals"), ("lower_body", "core_and_midsections")),
        Exercise("Hip Thrust", "Bench-supported hip extension for loaded glute training.", "Rest your upper back on a bench, drive your hips upward through your heels, pause with your ribs down, and lower under control.", "glutes", "barbell and bench", strength, ("hamstrings", "abdominals"), ("lower_body",)),
        Exercise("Romanian Deadlift", "Hip hinge emphasizing the hamstrings and glutes.", "Soften your knees, push your hips backward while keeping the weight close, stop at a strong hamstring stretch, and stand tall.", "hamstrings", "barbell or dumbbell", strength, ("glutes", "lower_back"), ("lower_body",)),
        Exercise("Bulgarian Split Squat", "Rear-foot-elevated unilateral squat.", "Place your rear foot on a bench, lower your back knee toward the floor, then drive through the front foot to stand.", "quadriceps", "bodyweight or dumbbell", strength, ("glutes", "hamstrings", "calves"), ("lower_body",)),
        Exercise("Crunch", "Short-range spinal flexion exercise for the abdominals.", "Lie with your knees bent, brace your abdomen, lift your shoulder blades from the floor, and lower without pulling your neck.", "abdominals", "bodyweight", reps, (), ("core_and_midsections",)),
        Exercise("Plank", "Isometric exercise developing trunk stability.", "Support yourself on your forearms and toes, keep your body straight, brace your abdomen and glutes, and hold without sagging.", "abdominals", "bodyweight", "time", ("shoulders", "glutes", "lower_back"), ("core_and_midsections",)),
        Exercise("Reverse Crunch", "Abdominal exercise using controlled pelvic flexion.", "Lie on your back with bent knees, curl your pelvis toward your chest without swinging, then lower slowly.", "abdominals", "bodyweight", reps, (), ("core_and_midsections",)),
        Exercise("Bicycle Crunch", "Rotational abdominal exercise combining flexion and alternating leg movement.", "Bring one elbow toward the opposite knee while extending the other leg, then alternate without pulling your neck.", "abdominals", "bodyweight", reps, (), ("core_and_midsections",)),
        Exercise("Russian Twist", "Seated rotational exercise for the trunk.", "Sit with bent knees and a slight backward lean, brace your abdomen, and rotate your torso from side to side.", "abdominals", "bodyweight or medicine ball", strength, ("lower_back",), ("core_and_midsections",)),
        Exercise("Hanging Leg Raise", "Hanging abdominal exercise using controlled leg elevation.", "Hang without swinging, brace your trunk, raise your legs toward the front, and lower them slowly.", "abdominals", "pull-up bar", reps, ("forearms", "lats"), ("upper_body", "core_and_midsections")),
        Exercise("Rows", "General horizontal pulling movement for the back.", "Maintain a stable torso, pull the resistance toward your ribs, retract your shoulder blades, and return with control.", "lats", "cable, machine, or free weight", strength, ("upper_back", "biceps"), ("upper_body",)),
        Exercise("Overhead Press", "Standing vertical press for shoulders and upper-body strength.", "Brace your trunk, press the weight from shoulder height to overhead, move your head through at the top, and lower steadily.", "shoulders", "barbell", strength, ("triceps", "traps", "abdominals"), ("upper_body",)),
        Exercise("Burpee", "Full-body conditioning movement combining a squat, plank, and jump.", "Squat down, place your hands on the floor, move into a plank, return your feet beneath you, and jump upward.", "full_body", "bodyweight", reps, ("cardio", "chest", "shoulders", "quadriceps", "abdominals"), ("full_body",)),
        Exercise("Treadmill", "Indoor walking or running for cardiovascular conditioning.", "Begin at a comfortable pace, maintain an upright posture, and gradually adjust speed or incline to match the intended effort.", "cardio", "treadmill", "distance_time", ("quadriceps", "hamstrings", "glutes", "calves"), ("lower_body",)),
        Exercise("Cycling", "Low-impact pedalling exercise for cardiovascular endurance.", "Adjust the seat, pedal smoothly at a sustainable cadence, and increase resistance without rocking your hips.", "cardio", "stationary bike", "distance_time", ("quadriceps", "glutes", "hamstrings", "calves"), ("lower_body",)),
        Exercise("Jumping Jack", "Rhythmic full-body movement that elevates heart rate.", "Jump your feet outward while raising your arms overhead, then return both to the starting position and repeat.", "cardio", "bodyweight", reps, ("full_body", "shoulders", "calves"), ("full_body",)),
        Exercise("Rowing", "Full-body cardiovascular exercise performed on a rowing machine.", "Drive with your legs, lean back slightly, pull the handle toward your lower ribs, then return arms, torso, and legs in sequence.", "cardio", "rowing machine", "distance_time", ("upper_back", "lats", "quadriceps", "hamstrings", "biceps"), ("full_body",)),
        Exercise("Dead Bug", "Supine core exercise reaching the opposite arm and leg.", "Lie on your back, press your lower back gently down, and reach the opposite arm and leg. Each rep is one side.", "abdominals", "bodyweight", reps, (), ("core_and_midsections",)),
        Exercise("Farmer Carry", "Loaded walk with a weight in each hand.", "Walk tall with a kettlebell or dumbbell in each hand. Keep your shoulders packed and your steps even.", "forearms", "kettlebell", "distance_weight", ("quadriceps",), ("full_body",)),
        Exercise("Sled Push", "Leg-drive push of a loaded sled.", "Drive the sled with your legs for the distance on the workout. Use a load you can move without stopping.", "quadriceps", "sled", "distance_weight", ("glutes",), ("lower_body",)),
        Exercise("Sled Pull", "Rope pull of a loaded sled toward you.", "Pull the sled in with the rope. Start lighter than the load you use to push.", "lats", "sled", "distance_weight", ("biceps",), ("upper_body",)),
        Exercise("Box Jump", "Jump onto a box, stand tall, and step down.", "Jump up, stand fully, and step down. Use a lower box or a step-up if the landing is sloppy.", "quadriceps", "box", "reps_height", ("calves",), ("lower_body",)),
        Exercise("Wall Ball", "Squat and throw a medicine ball to a high target.", "Squat until your hips pass your knees, then throw the ball to the target in one motion.", "quadriceps", "medicine ball", strength, ("shoulders",), ("full_body",)),
    )


def validate_exercises(exercises: Sequence[Exercise]) -> None:
    if len(exercises) != 50:
        raise ValueError(f"expected 50 exercises, got {len(exercises)}")
    names = [exercise.name for exercise in exercises]
    if len(names) != len(set(names)):
        raise ValueError("exercise names must be unique")
    for exercise in exercises:
        if not 1 <= len(exercise.name) <= 160:
            raise ValueError(f"{exercise.name!r} must be between 1 and 160 characters")
        if exercise.primary_muscle_group not in MUSCLES:
            raise ValueError(f"{exercise.name}: unknown primary muscle")
        if len(exercise.secondary_muscle_groups) != len(set(exercise.secondary_muscle_groups)):
            raise ValueError(f"{exercise.name}: secondary muscles must be unique")
        if any(muscle not in MUSCLES for muscle in exercise.secondary_muscle_groups):
            raise ValueError(f"{exercise.name}: unknown secondary muscle")
        if exercise.primary_muscle_group in exercise.secondary_muscle_groups:
            raise ValueError(f"{exercise.name}: primary muscle cannot also be secondary")
        if not exercise.body_parts or any(part not in BODY_PARTS for part in exercise.body_parts):
            raise ValueError(f"{exercise.name}: unknown or missing body part")
        if len(exercise.body_parts) != len(set(exercise.body_parts)):
            raise ValueError(f"{exercise.name}: body parts must be unique")
        if exercise.tracking_type not in TRACKING_PARAMETERS:
            raise ValueError(f"{exercise.name}: unsupported tracking type")


def seed_exercises(connection: Connection, exercises: Sequence[Exercise]) -> int:
    statement = text(
        """
        insert into public.exercises (
          trainer_id, owner_client_id, name, description, instructions,
          primary_muscle_group, equipment, tracking_type, tracking_parameters,
          secondary_muscle_groups, body_parts
        ) values (
          null, null, :name, :description, :instructions,
          cast(:primary_muscle_group as public.muscle), :equipment,
          cast(:tracking_type as public.exercise_tracking_type),
          cast(:tracking_parameters as public.exercise_tracking_parameter[]),
          cast(:secondary_muscle_groups as public.muscle[]),
          cast(:body_parts as public.body_part[])
        )
        on conflict on constraint exercises_owner_name_key do update set
          description = excluded.description,
          instructions = excluded.instructions,
          primary_muscle_group = excluded.primary_muscle_group,
          equipment = excluded.equipment,
          tracking_type = excluded.tracking_type,
          tracking_parameters = excluded.tracking_parameters,
          secondary_muscle_groups = excluded.secondary_muscle_groups,
          body_parts = excluded.body_parts
        """
    )
    for exercise in exercises:
        connection.execute(
            statement,
            {
                "name": exercise.name,
                "description": exercise.description,
                "instructions": exercise.instructions,
                "primary_muscle_group": exercise.primary_muscle_group,
                "equipment": exercise.equipment,
                "tracking_type": exercise.tracking_type,
                "tracking_parameters": _postgres_array(exercise.tracking_parameters),
                "secondary_muscle_groups": _postgres_array(exercise.secondary_muscle_groups),
                "body_parts": _postgres_array(exercise.body_parts),
            },
        )
    return len(exercises)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed the shared gym exercises.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate the exercise payload without connecting to the database.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    exercises = build_exercises()
    validate_exercises(exercises)
    if args.dry_run:
        print(f"Validated {len(exercises)} shared gym exercises.")
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
            count = seed_exercises(connection, exercises)
    finally:
        engine.dispose()
    print(f"Upserted {count} shared gym exercises.")
    return 0


def _postgres_array(values: Sequence[str]) -> str:
    return "{" + ",".join(values) + "}"


if __name__ == "__main__":
    raise SystemExit(main())
