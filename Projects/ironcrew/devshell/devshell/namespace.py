"""Objects bound into the IPython shell."""

from collections.abc import Mapping
from typing import Any

from sqlalchemy import Engine, inspect, select, text
from sqlalchemy.orm import InstanceState, Session

from devshell.models import missing_known_tables, reflect_models

HELPERS = (
    "tables",
    "describe",
    "get",
    "rows",
    "as_dict",
    "sql",
    "commit",
    "rollback",
)


def model_names(namespace: Mapping[str, Any]) -> list[str]:
    names = [
        name
        for name, value in namespace.items()
        if isinstance(value, type) and hasattr(value, "__table__")
    ]
    return sorted(names)


def missing_tables_message(namespace: Mapping[str, Any]) -> str | None:
    missing = missing_known_tables(model_names(namespace))
    if not missing:
        return None
    joined = ", ".join(missing)
    return f"Missing expected tables (migrations may not be applied): {joined}"


def make_banner(namespace: Mapping[str, Any]) -> str:
    names = model_names(namespace)
    lines = [
        "Ironcrew development shell",
        "This connection uses the database role in DATABASE_URL and does not apply Supabase row-level security.",
        "Uncommitted work rolls back when the shell exits. Call commit() to persist changes.",
        f"Models: {', '.join(names) if names else '(none)'}",
        "Helpers: tables(), describe(model), get(model, pk), rows(model, limit=20), as_dict(entity), sql(statement, **params), commit(), rollback()",
        "Also bound: engine, session, select, text",
    ]
    message = missing_tables_message(namespace)
    if message:
        lines.append(message)
    return "\n".join(lines) + "\n"


def build_namespace(engine: Engine, *, schema: str | None = "public") -> dict[str, Any]:
    """Reflect ``engine`` and return the shell namespace, with a transaction open."""
    models = reflect_models(engine, schema=schema)
    session = Session(engine)
    session.begin()

    def resolve(model: type | str) -> type:
        if isinstance(model, str):
            try:
                return models[model]
            except KeyError:
                known = ", ".join(sorted(models)) or "(none)"
                raise KeyError(f"Unknown model {model!r}. Reflected tables: {known}") from None
        return model

    def tables() -> list[str]:
        return sorted(models)

    def describe(model_or_name: type | str) -> dict[str, Any]:
        model = resolve(model_or_name)
        table = model.__table__
        columns = [
            {
                "name": column.name,
                "type": str(column.type),
                "nullable": column.nullable,
                "primary_key": column.primary_key,
            }
            for column in table.columns
        ]
        foreign_keys = [
            {"column": fk.parent.name, "references": fk.target_fullname}
            for fk in table.foreign_keys
        ]
        return {
            "table": table.name,
            "columns": columns,
            "primary_key": [column.name for column in table.primary_key.columns],
            "foreign_keys": foreign_keys,
        }

    def get(model: type | str, pk: Any) -> Any:
        return session.get(resolve(model), pk)

    def rows(model: type | str, limit: int = 20) -> list[Any]:
        return list(session.scalars(select(resolve(model)).limit(limit)).all())

    def as_dict(entity: Any) -> dict[str, Any]:
        state = inspect(entity, raiseerr=False)
        if not isinstance(state, InstanceState):
            raise TypeError("as_dict() expects a mapped row")
        return {
            attribute.key: getattr(entity, attribute.key)
            for attribute in state.mapper.column_attrs
        }

    def sql(statement: str, **params: Any) -> Any:
        result = session.execute(text(statement), params)
        if result.returns_rows:
            return result.mappings().all()
        return result.rowcount

    def commit() -> None:
        session.commit()
        session.begin()

    def rollback() -> None:
        session.rollback()
        session.begin()

    namespace: dict[str, Any] = {
        "engine": engine,
        "session": session,
        "select": select,
        "text": text,
        "tables": tables,
        "describe": describe,
        "get": get,
        "rows": rows,
        "as_dict": as_dict,
        "sql": sql,
        "commit": commit,
        "rollback": rollback,
    }
    overlap = set(namespace).intersection(models)
    if overlap:
        joined = ", ".join(sorted(overlap))
        raise RuntimeError(f"Reflected tables shadow shell helpers: {joined}")
    namespace.update(models)
    return namespace


def close_session(session: Session, *, commit_on_exit: bool) -> None:
    """Commit or roll back the open transaction, then close the session."""
    try:
        if commit_on_exit:
            session.commit()
        else:
            session.rollback()
    finally:
        session.close()
