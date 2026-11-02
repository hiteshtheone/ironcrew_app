"""Reflect application tables into SQLAlchemy model classes.

The classes are built from the live database so they stay aligned with
migrations. Relationships are left out; foreign keys are reported by
``describe`` instead of being turned into ORM attributes.
"""

from sqlalchemy import Engine
from sqlalchemy.orm import DeclarativeBase

# Tables created in db/migrations/000001_initial_schema.up.sql. Later
# migrations alter these tables but do not add new ones. Used only to warn
# when a database is missing a table the application expects.
KNOWN_TABLES: tuple[str, ...] = (
    "profiles",
    "trainers",
    "clients",
    "trainer_clients",
    "goals",
    "programs",
    "program_assignments",
    "program_phases",
    "program_weeks",
    "workouts",
    "exercises",
    "workout_blocks",
    "program_workouts",
    "workout_assignments",
    "workout_sessions",
    "exercise_results",
    "measurements",
    "client_notes",
)


def reflect_models(engine: Engine, *, schema: str | None = "public") -> dict[str, type]:
    """Map each reflected table to a class keyed by its unqualified name.

    ``schema`` limits reflection to one Postgres schema. Pass ``None`` for
    SQLite, which has no ``public`` schema. Foreign-key targets outside the
    requested schema, such as ``auth.users``, are not reflected.
    """

    class Base(DeclarativeBase):
        pass

    Base.metadata.reflect(bind=engine, schema=schema, resolve_fks=False)
    models: dict[str, type] = {}
    for table in Base.metadata.sorted_tables:
        if schema is not None and table.schema != schema:
            continue
        if table.name in models:
            raise RuntimeError(f"Duplicate reflected table name {table.name}")
        models[table.name] = type(
            table.name,
            (Base,),
            {"__table__": table, "__module__": __name__},
        )
    return models


def missing_known_tables(reflected: list[str] | tuple[str, ...] | set[str]) -> list[str]:
    """Return known application tables that were not reflected, in schema order."""
    present = set(reflected)
    return [name for name in KNOWN_TABLES if name not in present]
