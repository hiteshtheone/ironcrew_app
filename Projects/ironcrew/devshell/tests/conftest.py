from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from devshell.namespace import build_namespace

STATEMENTS = (
    """
    create table profiles (
        id text primary key,
        full_name text not null,
        role text not null
    )
    """,
    """
    create table trainer_clients (
        trainer_id text not null references profiles (id),
        client_id text not null,
        primary key (trainer_id, client_id)
    )
    """,
)


def create_sample_database(path: Path):
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as connection:
        for statement in STATEMENTS:
            connection.execute(text(statement))
    return engine


@pytest.fixture
def database_path(tmp_path: Path) -> Path:
    path = tmp_path / "ironcrew.db"
    engine = create_sample_database(path)
    engine.dispose()
    return path


@pytest.fixture
def namespace(database_path: Path):
    engine = create_engine(f"sqlite:///{database_path}")
    shell = build_namespace(engine, schema=None)
    try:
        yield shell
    finally:
        shell["rollback"]()
        shell["session"].close()
        engine.dispose()
