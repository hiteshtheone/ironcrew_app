"""Reflect application tables into SQLAlchemy model classes.

The classes are built from the live database so they stay aligned with
migrations. Relationships are left out; foreign keys are reported by
``describe`` instead of being turned into ORM attributes.
"""

from sqlalchemy import Column, Engine, Table
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql.schema import MetaData

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
    # Keep targets such as auth.users out of the shell, but present in the
    # metadata. Otherwise sorting tables for a flush raises
    # NoReferencedTableError for profiles.id.
    reflected = set(Base.metadata.tables)
    _stub_unresolved_foreign_keys(Base.metadata)
    models: dict[str, type] = {}
    for table in Base.metadata.sorted_tables:
        if table.key not in reflected:
            continue
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


def _table_key(name: str, schema: str | None) -> str:
    return name if schema is None else f"{schema}.{name}"


def _stub_unresolved_foreign_keys(metadata: MetaData) -> None:
    """Create placeholder tables for foreign keys whose targets were not reflected."""
    pending: dict[tuple[str | None, str], dict[str, Column]] = {}
    for table in list(metadata.tables.values()):
        for foreign_key in table.foreign_keys:
            tokens = foreign_key.target_tokens
            target_schema = tokens.schema
            if target_schema is None and metadata.schema is not None:
                target_schema = metadata.schema
            if _table_key(tokens.table_name, target_schema) in metadata.tables:
                continue
            column_name = tokens.column_name or foreign_key.parent.key
            columns = pending.setdefault((target_schema, tokens.table_name), {})
            if column_name not in columns:
                column_type = foreign_key.parent.type
                if hasattr(column_type, "copy"):
                    column_type = column_type.copy()
                columns[column_name] = Column(column_name, column_type, primary_key=True)
    for (target_schema, table_name), columns in pending.items():
        Table(table_name, metadata, *columns.values(), schema=target_schema)


def missing_known_tables(reflected: list[str] | tuple[str, ...] | set[str]) -> list[str]:
    """Return known application tables that were not reflected, in schema order."""
    present = set(reflected)
    return [name for name in KNOWN_TABLES if name not in present]
