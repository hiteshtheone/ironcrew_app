#!/usr/bin/env bash
# Seed shared exercises, then validate and apply every workout and program catalog.
# Strength catalogs are applied before the plans that name those workouts.
# Running this again updates the same shared names and rebuilds program phases.
# Trainer- and client-owned rows stay untouched.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

catalogs=(
  catalog/upper-body.yaml
  catalog/upper-body-core.yaml
  catalog/lower-body.yaml
  catalog/lower-body-core.yaml
  catalog/full-body.yaml
  catalog/core.yaml
  catalog/beginner-10k.yaml
  catalog/beginner-5k.yaml
  catalog/general-fitness.yaml
)

echo "Seeding shared exercises."
PYTHONPATH=devshell python devshell/seed_gym_exercises.py

echo "Validating catalogs."
for file in "${catalogs[@]}"; do
  npm run catalog -- validate "$file"
done

echo "Applying catalogs."
for file in "${catalogs[@]}"; do
  npm run catalog -- apply "$file"
done

echo "Seeded exercises, workouts, and plans."
