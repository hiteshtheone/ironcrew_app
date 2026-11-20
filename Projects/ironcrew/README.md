# How to run tests

Run each set from this directory. `npm test` and pytest need no environment variables. The browser tests need a real Supabase project and skip any case whose variables are missing.

## App tests

```sh
npm install
npm test
```

Domain helpers, React components, the exercise catalog, API routes, and the database functions. The database cases apply `db/migrations` in memory. No `DATABASE_URL` and no Supabase keys.

## Browser tests

Install Chromium once, then start the suite. Playwright launches the app at `http://127.0.0.1:3000` and sets `NEXT_PUBLIC_SITE_URL` itself.

```sh
npx playwright install chromium
npm run test:e2e
```

Set these in the shell before `npm run test:e2e`. Values come from the Supabase project you want the browser to sign in to. Do not commit them.

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL, such as `https://<project-ref>.supabase.co`. The app uses it for Auth. Both values must be set or every browser case skips. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key from Project Settings, API. The browser sends it with Auth requests. This is not the service role key. |
| `E2E_TRAINER_EMAIL` | Email of an existing trainer who has already finished onboarding. The test signs in and expects Clients and Programs. |
| `E2E_TRAINER_PASSWORD` | Password for that trainer. |
| `E2E_CLIENT_EMAIL` | Email of an existing client who has already finished onboarding. The test signs in and expects this week's workouts. |
| `E2E_CLIENT_PASSWORD` | Password for that client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret service role key from Project Settings, API. The onboarding case creates a confirmed user, walks through trainer setup, then deletes that user. Keep it out of the browser and out of git. |

Login and a rejected password run when the two `NEXT_PUBLIC_SUPABASE_*` variables are set. The trainer case also needs `E2E_TRAINER_EMAIL` and `E2E_TRAINER_PASSWORD`. The client case also needs `E2E_CLIENT_EMAIL` and `E2E_CLIENT_PASSWORD`. Onboarding also needs `SUPABASE_SERVICE_ROLE_KEY`.

## Shell tests

```sh
cd devshell
python -m pip install -e '.[dev]'
python -m pytest
```

Dev shell, seed, and catalog helpers. They use a temporary SQLite file. Leave `DATABASE_URL` unset. The tests that open a database supply their own SQLite URL.

CI runs `npm test`, lint, the production build, and pytest on every push and pull request. Playwright runs in CI only when the repository secret `E2E_TRAINER_EMAIL` is set. The other secret names are the variables in the table above.

# coverage for some test -
node --experimental-test-coverage \
  --import tsx \
  --test-coverage-include='**/lib/**/*.ts' \
  --test-coverage-include='**/components/**/*.ts' \
  --test-coverage-include='**/components/**/*.tsx' \
  --test-coverage-include='**/app/**/*.ts' \
  --test-coverage-include='**/app/**/*.tsx' \
  --test-coverage-include='**/scripts/**/*.ts' \
  --test-coverage-exclude='**/*.test.ts' \
  --test-coverage-exclude='**/*.test.tsx' \
  --test-coverage-exclude='**/node_modules/**' \
  --test-coverage-exclude='**/.next/**' \
  --test-coverage-include-all \
  --test \
  lib/dashboard/*.test.ts \
  lib/onboarding/*.test.ts \
  lib/exercises/*.test.ts \
  lib/site.test.ts \
  lib/observability/*.test.ts \
  components/dashboard/*.test.ts \
  components/dashboard/*.test.tsx \
  scripts/catalog/*.test.ts \
  scripts/purge-system-catalog.test.ts


# How to run pythonshell 
# Get DATABASE_URL from supabase portal ... settings>>Infrastructure>>connect
# python -m pip install -e 'devshell[dev]'
export DATABASE_URL='postgresql://...'
npm run shell

# Sample commands
tables() --- Lists tables
rows(clients)                  # first 20
rows(clients, limit=5)
client = get(clients, "00000000-0000-0000-0000-000000000000")   # one row by primary key, or None

as_dict(client)  # shows details of that entry

# Create new client
client = clients(first_name="Ada", last_name="Lovelace", email="ada@example.com")
session.add(client)
session.flush()    # runs the INSERT and fills client.id
client.id
commit()           # keeps the row after you exit

# How to run a script
python -m pip install -e devshell
export DATABASE_URL='postgresql://postgres:password@host:5432/postgres'
python write_rows.py

write_rows.py --->
-----
import os

from devshell.cli import create_shell_engine, reflection_schema
from devshell.namespace import build_namespace, close_session

engine, url = create_shell_engine(os.environ["DATABASE_URL"])
shell = build_namespace(engine, schema=reflection_schema(url))
try:
    client = shell["clients"](first_name="Ada", last_name="Lovelace", email="ada@example.com")
    shell["session"].add(client)
    shell["session"].flush()
    print(shell["as_dict"](client))
    shell["commit"]()
finally:
    close_session(shell["session"], commit_on_exit=False)
    engine.dispose()

-----

# Purge the shared system catalog
# Deletes system programs, plus system workouts and exercises that have no logged session.
# Also deletes calendar rows and program slots that point at system workouts.
# Logged sets on a system workout stay, with that session, workout, its blocks, and the exercises those sets use.
# Trainer- and client-owned programs, workouts, and exercises stay.
# A personal workout loses a block only when that block used a system exercise that is being deleted.
# Without --apply the deletes run, the counts print, and the transaction rolls back.

export DATABASE_URL='postgresql://...'
npm run purge-system
npm run purge-system -- --apply

# Seed every shared exercise, workout, and plan
# scripts/seed-catalog.sh seeds the exercise library, validates every catalog, then applies them.
# Strength workouts are applied before the running plans that name those workouts.
# Running the script again updates the same shared names and rebuilds program phases.
# Trainer- and client-owned rows stay untouched.
# From Projects/ironcrew, with DATABASE_URL set:

export DATABASE_URL='postgresql://...'
./scripts/seed-catalog.sh

# Lower body, Core, Upper body, Full body workouts
# catalog/upper-body.yaml holds Beginner, Intermediate, and Advanced Upper Body.
# The file names exercises from devshell/seed_gym_exercises.py and does not create them.
# From Projects/ironcrew, seed the exercises, then validate and apply the catalog.
# Apply again to replace the blocks on those same shared workout names.
# Trainer- and client-owned workouts and exercises stay untouched.
# Validate does not need a database. Apply does.

python -m pip install -e 'devshell[dev]'
export DATABASE_URL='postgresql://...'
PYTHONPATH=devshell python devshell/seed_gym_exercises.py --dry-run
PYTHONPATH=devshell python devshell/seed_gym_exercises.py

npm run catalog -- validate catalog/upper-body.yaml
npm run catalog -- apply catalog/upper-body.yaml

# catalog/upper-body-core.yaml holds Beginner, Intermediate, and Advanced Upper Body and Core.
npm run catalog -- validate catalog/upper-body-core.yaml
./node_modules/.bin/tsx --test scripts/catalog/upper-body-core.test.ts
npm run catalog -- apply catalog/upper-body-core.yaml

npm run catalog -- validate catalog/lower-body-core.yaml
npm run catalog -- apply catalog/lower-body-core.yaml

npm run catalog -- validate catalog/lower-body.yaml
./node_modules/.bin/tsx --test scripts/catalog/lower-body.test.ts
npm run catalog -- apply catalog/lower-body.yaml

# catalog/full-body.yaml holds Beginner, Intermediate, and Advanced Full Body.
npm run catalog -- validate catalog/full-body.yaml
./node_modules/.bin/tsx --test scripts/catalog/full-body.test.ts
npm run catalog -- apply catalog/full-body.yaml

# catalog/core.yaml holds Beginner, Intermediate, and Advanced Core.
# The file names exercises from devshell/seed_gym_exercises.py and does not create them.
# Seed first, then validate, then apply.
# Apply again to replace the blocks on those same shared workout names.
# Trainer- and client-owned workouts and exercises stay untouched.
npm run catalog -- validate catalog/core.yaml
./node_modules/.bin/tsx --test scripts/catalog/core.test.ts
npm run catalog -- apply catalog/core.yaml

# catalog/beginner-10k.yaml holds the 8 Week 10K Beginner Running program.
# Run workouts name Easy Run, Speed Burst, Steady Interval, Stride, and Race Pace from the seed.
# Strength days name Beginner Lower Body and Beginner Lower Body and Core, so apply those catalogs first.
# The file does not create exercises. Seed first, then validate, then apply.
# Apply again to replace the blocks on those same shared workout names and rebuild the program phases.
# Trainer- and client-owned workouts, exercises, and programs stay untouched.
npm run catalog -- validate catalog/beginner-10k.yaml
./node_modules/.bin/tsx --test scripts/catalog/beginner-10k.test.ts
npm run catalog -- apply catalog/beginner-10k.yaml

# catalog/beginner-5k.yaml holds the 8 Week 5K Beginner Running program.
# Run workouts name Easy Run and Race Pace from the seed.
# Day 5 names Beginner Lower Body and Core, so apply catalog/lower-body-core.yaml first.
# The file does not create exercises. Seed first, then validate, then apply.
# Apply again to replace the blocks on those same shared workout names and rebuild the program phases.
# Trainer- and client-owned workouts, exercises, and programs stay untouched.
npm run catalog -- validate catalog/beginner-5k.yaml
./node_modules/.bin/tsx --test scripts/catalog/beginner-5k.test.ts
npm run catalog -- apply catalog/beginner-5k.yaml

# catalog/general-fitness.yaml holds the 16 Week General Fitness program.
# Strength and run workouts name exercises from devshell/seed_gym_exercises.py.
# The file does not create exercises. Seed first, then validate, then apply.
# Apply again to replace the blocks on those same shared workout names and rebuild the program phases.
# Trainer- and client-owned workouts, exercises, and programs stay untouched.
npm run catalog -- validate catalog/general-fitness.yaml
./node_modules/.bin/tsx --test scripts/catalog/general-fitness.test.ts
npm run catalog -- apply catalog/general-fitness.yaml
