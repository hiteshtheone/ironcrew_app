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
