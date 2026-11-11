import pytest

from devshell.helpers import open_shell


def test_open_shell_reads_and_inserts_rows(database_path):
    url = f"sqlite:///{database_path}"
    with open_shell(url) as db:
        assert db.tables() == ["profiles", "trainer_clients"]
        assert db.describe("profiles")["primary_key"] == ["id"]
        created = db.add("profiles", id="p1", full_name="Ada", role="trainer")
        assert db.as_dict(created) == {"id": "p1", "full_name": "Ada", "role": "trainer"}
        assert db.get("profiles", "p1").full_name == "Ada"
        assert [row.role for row in db.rows("profiles")] == ["trainer"]
        db.commit()

    with open_shell(url) as db:
        assert db.as_dict(db.get(db.profiles, "p1"))["full_name"] == "Ada"


def test_open_shell_rolls_back_uncommitted_inserts(database_path):
    url = f"sqlite:///{database_path}"
    with open_shell(url) as db:
        db.add("profiles", id="p1", full_name="Ada", role="trainer")

    with open_shell(url) as db:
        assert db.rows("profiles") == []


def test_open_shell_requires_a_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        with open_shell():
            pass
