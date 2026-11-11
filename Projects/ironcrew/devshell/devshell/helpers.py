"""Script access to the same commands as the IPython shell.

    from devshell.helpers import open_shell

    with open_shell() as db:
        db.describe("clients")
        for client in db.rows("clients"):
            print(db.as_dict(client))
        created = db.add("clients", first_name="Ada")
        db.commit()
"""

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from devshell.cli import create_shell_engine, reflection_schema
from devshell.namespace import build_namespace, close_session


class Shell:
    """Commands bound inside ``ironcrew-shell``: read, insert, and commit rows."""

    def __init__(self, namespace: dict[str, Any]):
        self._namespace = namespace

    def __getattr__(self, name: str) -> Any:
        try:
            return self._namespace[name]
        except KeyError as error:
            raise AttributeError(f"no model or command named {name}") from error

    def tables(self) -> list[str]:
        return self._namespace["tables"]()

    def describe(self, model: Any) -> dict[str, Any]:
        return self._namespace["describe"](model)

    def get(self, model: Any, pk: Any) -> Any:
        return self._namespace["get"](model, pk)

    def rows(self, model: Any, limit: int = 20) -> list[Any]:
        return self._namespace["rows"](model, limit)

    def as_dict(self, entity: Any) -> dict[str, Any]:
        return self._namespace["as_dict"](entity)

    def sql(self, statement: str, **params: Any) -> Any:
        return self._namespace["sql"](statement, **params)

    def add(self, model: Any, **fields: Any) -> Any:
        """Insert one row and flush it so database defaults are loaded."""
        row = self._namespace[model](**fields) if isinstance(model, str) else model(**fields)
        self.session.add(row)
        self.session.flush()
        return row

    def commit(self) -> None:
        self._namespace["commit"]()

    def rollback(self) -> None:
        self._namespace["rollback"]()


@contextmanager
def open_shell(database_url: str | None = None) -> Iterator[Shell]:
    """Open the reflected models using ``DATABASE_URL``.

    Uncommitted work rolls back when the context exits. Call ``commit()`` to keep it.
    """
    url = (database_url if database_url is not None else os.environ.get("DATABASE_URL", "")).strip()
    if not url:
        raise RuntimeError("DATABASE_URL is required.")
    engine, normalized = create_shell_engine(url)
    namespace = build_namespace(engine, schema=reflection_schema(normalized))
    try:
        yield Shell(namespace)
    finally:
        close_session(namespace["session"], commit_on_exit=False)
        engine.dispose()
