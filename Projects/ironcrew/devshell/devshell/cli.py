"""Command-line entry for the Ironcrew development shell."""

import argparse
import os
import sys
import traceback
from collections.abc import Callable, Sequence
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from devshell.namespace import (
    build_namespace,
    close_session,
    make_banner,
    missing_tables_message,
)

MISSING_URL = "DATABASE_URL is required to open the development shell."


def _redacted_traceback(*secrets: str) -> str:
    rendered = traceback.format_exc()
    for secret in secrets:
        if secret:
            rendered = rendered.replace(secret, "DATABASE_URL")
    return rendered


def normalize_database_url(url: str) -> str:
    """Point bare Postgres URLs at the psycopg 3 SQLAlchemy dialect."""
    scheme, separator, rest = url.partition("://")
    if separator and scheme in {"postgres", "postgresql"}:
        return f"postgresql+psycopg://{rest}"
    return url


def reflection_schema(url: str) -> str | None:
    """SQLite has no ``public`` schema. Every other URL reflects Postgres ``public``."""
    scheme = url.partition("://")[0].split("+", 1)[0]
    if scheme == "sqlite":
        return None
    return "public"


def create_shell_engine(database_url: str) -> tuple[Engine, str]:
    normalized = normalize_database_url(database_url.strip())
    connect_args: dict[str, Any] = {}
    if normalized.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_engine(normalized, connect_args=connect_args), normalized


def launch_ipython(namespace: dict[str, Any], embed: Callable[..., Any] | None = None) -> None:
    if embed is None:
        from IPython import embed as embed
    embed(user_ns=namespace, colors="neutral", banner1=make_banner(namespace))


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="ironcrew-shell",
        description="Interactive shell for Ironcrew database models.",
        epilog=(
            "Export DATABASE_URL before launching. From Projects/ironcrew, "
            "install with: python -m pip install -e devshell. "
            "Pending work rolls back on exit unless the snippet passes --commit "
            "or the session calls commit()."
        ),
    )
    parser.add_argument(
        "-c",
        dest="command",
        help="Execute a Python snippet in the shell namespace and exit",
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Commit the session after a successful -c snippet",
    )
    args = parser.parse_args(argv)
    if args.commit and args.command is None:
        parser.error("--commit requires -c")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print(MISSING_URL, file=sys.stderr)
        return 2

    engine, normalized = create_shell_engine(database_url)
    namespace: dict[str, Any] | None = None
    commit_on_exit = False
    status = 0
    try:
        namespace = build_namespace(engine, schema=reflection_schema(normalized))
        if args.command is None:
            launch_ipython(namespace)
        else:
            message = missing_tables_message(namespace)
            if message:
                print(message, file=sys.stderr)
            try:
                exec(args.command, namespace)
            except Exception:
                sys.stderr.write(_redacted_traceback(database_url, normalized))
                status = 1
            else:
                commit_on_exit = args.commit
    except Exception:
        sys.stderr.write(_redacted_traceback(database_url, normalized))
        status = 1
    finally:
        if namespace is not None:
            close_session(namespace["session"], commit_on_exit=commit_on_exit and status == 0)
        engine.dispose()
    return status
