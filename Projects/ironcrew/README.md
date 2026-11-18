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

# Upper body workouts
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

# Lower body workouts
# catalog/lower-body.yaml holds Beginner, Intermediate, and Advanced Lower Body.
# The file names exercises from devshell/seed_gym_exercises.py and does not create them.
# From Projects/ironcrew, seed the exercises, then validate and apply the catalog.
# Apply again to replace the blocks on those same shared workout names.
# Trainer- and client-owned workouts and exercises stay untouched.
# Validate does not need a database. Apply does.

python -m pip install -e 'devshell[dev]'
export DATABASE_URL='postgresql://...'
PYTHONPATH=devshell python devshell/seed_gym_exercises.py --dry-run
PYTHONPATH=devshell python devshell/seed_gym_exercises.py

npm run catalog -- validate catalog/lower-body.yaml
npm run catalog -- apply catalog/lower-body.yaml
