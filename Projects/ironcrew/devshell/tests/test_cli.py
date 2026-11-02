import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from devshell.cli import (
    MISSING_URL,
    _redacted_traceback,
    launch_ipython,
    main,
    normalize_database_url,
    reflection_schema,
)
from devshell.namespace import make_banner

PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def test_normalize_database_url_rewrites_bare_postgres_urls():
    assert normalize_database_url("postgres://user:secret@db/postgres") == (
        "postgresql+psycopg://user:secret@db/postgres"
    )
    assert normalize_database_url("postgresql://user@db/postgres?sslmode=require") == (
        "postgresql+psycopg://user@db/postgres?sslmode=require"
    )
    assert (
        normalize_database_url("postgresql+psycopg://user@db/postgres")
        == "postgresql+psycopg://user@db/postgres"
    )
    assert normalize_database_url("sqlite:///tmp/ironcrew.db") == "sqlite:///tmp/ironcrew.db"


def test_tracebacks_replace_the_database_url():
    secret = "postgresql://user:s3cret@db.example/postgres"
    normalized = "postgresql+psycopg://user:s3cret@db.example/postgres"
    try:
        raise RuntimeError(f"could not connect to {secret} via {normalized}")
    except RuntimeError:
        rendered = _redacted_traceback(secret, normalized)
    assert "s3cret" not in rendered
    assert rendered.count("DATABASE_URL") >= 2


def test_reflection_schema_skips_sqlite():
    assert reflection_schema("sqlite:///tmp/ironcrew.db") is None
    assert reflection_schema("postgresql+psycopg://db/postgres") == "public"
    assert reflection_schema("postgres://db/postgres") == "public"


def test_missing_database_url_exits_2(monkeypatch, capsys):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert main([]) == 2
    assert MISSING_URL in capsys.readouterr().err


def test_commit_flag_requires_a_snippet():
    with pytest.raises(SystemExit) as caught:
        main(["--commit"])
    assert caught.value.code == 2


def test_help_exits_cleanly():
    with pytest.raises(SystemExit) as caught:
        main(["-h"])
    assert caught.value.code == 0


def test_snippet_prints_reflected_tables(database_path, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    assert main(["-c", "print(','.join(tables()))"]) == 0
    captured = capsys.readouterr()
    assert captured.out.strip() == "profiles,trainer_clients"
    assert "Missing expected tables" in captured.err
    assert "workouts" in captured.err
    assert "profiles" not in captured.err.split("Missing expected tables", 1)[1]


def test_snippet_without_commit_rolls_back(database_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    code = (
        "session.add(profiles(id='p1', full_name='Ada', role='trainer'))\n"
        "session.flush()\n"
    )
    assert main(["-c", code]) == 0
    assert _names(database_path) == []


def test_commit_flag_persists_a_snippet(database_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    code = "session.add(profiles(id='p1', full_name='Ada', role='trainer'))"
    assert main(["-c", code, "--commit"]) == 0
    assert _names(database_path) == ["Ada"]


def test_explicit_commit_in_a_snippet_persists(database_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    code = (
        "session.add(profiles(id='p1', full_name='Ada', role='trainer'))\n"
        "commit()\n"
    )
    assert main(["-c", code]) == 0
    assert _names(database_path) == ["Ada"]


def test_failed_snippet_rolls_back_and_returns_1(database_path, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    code = (
        "session.add(profiles(id='p1', full_name='Ada', role='trainer'))\n"
        "session.flush()\n"
        "raise RuntimeError('boom')\n"
    )
    assert main(["-c", code, "--commit"]) == 1
    assert "boom" in capsys.readouterr().err
    assert _names(database_path) == []


def test_launch_ipython_passes_the_namespace_and_banner(namespace):
    captured: dict = {}

    def embed(**kwargs):
        captured.update(kwargs)

    launch_ipython(namespace, embed=embed)
    assert captured["user_ns"] is namespace
    assert captured["colors"] == "neutral"
    assert captured["banner1"] == make_banner(namespace)
    assert "row-level security" in captured["banner1"]


def test_interactive_exit_rolls_back(database_path, monkeypatch):
    def embed_and_insert(namespace, embed=None):
        namespace["session"].add(
            namespace["profiles"](id="p1", full_name="Ada", role="trainer")
        )
        namespace["session"].flush()

    monkeypatch.setattr("devshell.cli.launch_ipython", embed_and_insert)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    assert main([]) == 0
    assert _names(database_path) == []


def test_module_invocation_prints_tables(database_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{database_path}"
    env["PYTHONPATH"] = str(PACKAGE_ROOT)
    completed = subprocess.run(
        [sys.executable, "-m", "devshell", "-c", "print(','.join(tables()))"],
        cwd=PACKAGE_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == "profiles,trainer_clients"


def _names(path: Path) -> list[str]:
    with sqlite3.connect(path) as connection:
        rows = connection.execute("select full_name from profiles order by full_name").fetchall()
    return [row[0] for row in rows]
