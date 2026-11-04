import pytest
from sqlalchemy import text

from devshell.models import KNOWN_TABLES, missing_known_tables
from devshell.namespace import make_banner, missing_tables_message


def test_dangling_foreign_key_does_not_block_flush(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import class_mapper

    from devshell.namespace import build_namespace

    path = tmp_path / "dangling.db"
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                create table profiles (
                    id integer primary key references users (id),
                    full_name text not null
                )
                """
            )
        )
    shell = build_namespace(engine, schema=None)
    try:
        assert shell["tables"]() == ["profiles"]
        described = shell["describe"]("profiles")
        assert any(item["references"] == "users.id" for item in described["foreign_keys"])
        class_mapper(shell["profiles"])._sorted_tables
        shell["session"].add(shell["profiles"](id=1, full_name="Ada"))
        shell["session"].flush()
        assert shell["get"]("profiles", 1).full_name == "Ada"
    finally:
        shell["rollback"]()
        shell["session"].close()
        engine.dispose()


def test_auth_users_foreign_key_can_be_sorted():
    from sqlalchemy import Column, ForeignKey, Integer, Table
    from sqlalchemy.orm import DeclarativeBase

    from devshell.models import _stub_unresolved_foreign_keys

    class Base(DeclarativeBase):
        pass

    Table(
        "profiles",
        Base.metadata,
        Column("id", Integer, ForeignKey("auth.users.id"), primary_key=True),
        schema="public",
    )
    _stub_unresolved_foreign_keys(Base.metadata)
    assert "auth.users" in Base.metadata.tables
    assert [table.name for table in Base.metadata.sorted_tables] == ["users", "profiles"]


def test_known_tables_cover_the_initial_schema():
    assert len(KNOWN_TABLES) == 18
    assert KNOWN_TABLES[0] == "profiles"
    assert KNOWN_TABLES[-1] == "client_notes"


def test_reflected_namespace_lists_models_and_helpers(namespace):
    assert namespace["tables"]() == ["profiles", "trainer_clients"]
    assert namespace["profiles"].__table__.name == "profiles"
    assert callable(namespace["describe"])
    assert callable(namespace["sql"])


def test_describe_reports_columns_primary_key_and_foreign_keys(namespace):
    profiles = namespace["describe"]("profiles")
    assert profiles["table"] == "profiles"
    assert profiles["primary_key"] == ["id"]
    assert {column["name"] for column in profiles["columns"]} == {"id", "full_name", "role"}
    full_name = next(column for column in profiles["columns"] if column["name"] == "full_name")
    assert full_name["nullable"] is False
    assert full_name["primary_key"] is False

    links = namespace["describe"](namespace["trainer_clients"])
    assert links["primary_key"] == ["trainer_id", "client_id"]
    assert any(
        item["column"] == "trainer_id" and "profiles" in item["references"]
        for item in links["foreign_keys"]
    )


def test_rows_get_and_sql_share_the_open_transaction(namespace):
    inserted = namespace["sql"](
        "insert into profiles (id, full_name, role) values (:id, :full_name, :role)",
        id="p1",
        full_name="Ada",
        role="trainer",
    )
    assert inserted == 1
    found = namespace["get"]("profiles", "p1")
    assert found.full_name == "Ada"
    assert [row.full_name for row in namespace["rows"](namespace["profiles"])] == ["Ada"]
    selected = namespace["sql"]("select full_name from profiles where id = :id", id="p1")
    assert dict(selected[0]) == {"full_name": "Ada"}


def test_as_dict_returns_every_column(namespace):
    namespace["sql"](
        "insert into profiles (id, full_name, role) values ('p1', 'Ada', 'trainer')"
    )
    row = namespace["get"]("profiles", "p1")
    assert namespace["as_dict"](row) == {"id": "p1", "full_name": "Ada", "role": "trainer"}
    with pytest.raises(TypeError, match="mapped row"):
        namespace["as_dict"](namespace["profiles"])


def test_composite_primary_key_get(namespace):
    namespace["sql"](
        "insert into profiles (id, full_name, role) values ('t1', 'Ada', 'trainer')"
    )
    namespace["sql"](
        "insert into trainer_clients (trainer_id, client_id) values ('t1', 'c1')"
    )
    link = namespace["get"](namespace["trainer_clients"], ("t1", "c1"))
    assert link.client_id == "c1"
    assert namespace["get"]("trainer_clients", ("t1", "missing")) is None


def test_unknown_model_names_the_reflected_tables(namespace):
    with pytest.raises(KeyError, match="workouts"):
        namespace["describe"]("workouts")


def test_rollback_discards_pending_inserts(namespace):
    namespace["session"].add(
        namespace["profiles"](id="p1", full_name="Ada", role="trainer")
    )
    namespace["session"].flush()
    assert len(namespace["rows"]("profiles")) == 1
    namespace["rollback"]()
    assert namespace["rows"]("profiles") == []
    with namespace["engine"].connect() as connection:
        count = connection.execute(text("select count(*) from profiles")).scalar_one()
    assert count == 0


def test_commit_keeps_rows_visible_on_a_new_connection(namespace):
    namespace["session"].add(
        namespace["profiles"](id="p1", full_name="Ada", role="trainer")
    )
    namespace["commit"]()
    assert namespace["get"]("profiles", "p1").role == "trainer"
    with namespace["engine"].connect() as connection:
        name = connection.execute(
            text("select full_name from profiles where id = 'p1'")
        ).scalar_one()
    assert name == "Ada"


def test_missing_known_tables_follow_schema_order():
    missing = missing_known_tables(["profiles", "trainer_clients"])
    assert missing[0] == "trainers"
    assert "profiles" not in missing
    assert "trainer_clients" not in missing
    assert missing[-1] == "client_notes"
    assert len(missing) == 16


def test_banner_describes_the_session_without_the_connection_string(namespace):
    banner = make_banner(namespace)
    assert "Ironcrew development shell" in banner
    assert "DATABASE_URL" in banner
    assert "row-level security" in banner
    assert "commit()" in banner
    assert "profiles" in banner
    assert "trainer_clients" in banner
    assert "sqlite://" not in banner
    assert "postgresql://" not in banner
    message = missing_tables_message(namespace)
    assert message is not None
    assert message in banner
    assert "workouts" in message
