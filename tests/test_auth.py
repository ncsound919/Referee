"""
test_auth.py

Authentication behaviour of the referee-core HTTP service.

The service used to run open whenever REFEREE_API_KEY was unset, which meant a
deployment that forgot its secret was indistinguishable from one that was
working correctly - and the deterministic engine was reachable by anyone.

These tests pin the replacement behaviour:
  - production mode with no key  -> 503 (the service is closed)
  - a wrong or missing key       -> 401
  - the correct key              -> the request is served
  - development mode             -> open, for local work and CI
"""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

import referee_core.api as api


@pytest.fixture()
def reload_api(monkeypatch):
    """Reload the module with a specific environment and restore it after."""

    def _reload(env: str | None, key: str | None):
        if env is None:
            monkeypatch.delenv("REFEREE_ENV", raising=False)
        else:
            monkeypatch.setenv("REFEREE_ENV", env)
        if key is None:
            monkeypatch.delenv("REFEREE_API_KEY", raising=False)
        else:
            monkeypatch.setenv("REFEREE_API_KEY", key)
        return importlib.reload(api)

    yield _reload

    # Restore the module to development mode before handing control back.
    # pytest tears fixtures down in reverse setup order, so monkeypatch is
    # still active here and REFEREE_ENV would otherwise still be "production".
    monkeypatch.setenv("REFEREE_ENV", "development")
    monkeypatch.delenv("REFEREE_API_KEY", raising=False)
    importlib.reload(api)


def test_production_without_key_is_closed(reload_api):
    module = reload_api(env="production", key=None)
    client = TestClient(module.app)

    resp = client.post("/audit", json={"claim": {}, "csv_text": "patient_id,label,score,split\n"})

    assert resp.status_code == 503, resp.text
    assert "REFEREE_API_KEY" in resp.json()["detail"]


def test_production_with_key_rejects_a_wrong_key(reload_api):
    module = reload_api(env="production", key="correct-horse")
    client = TestClient(module.app)

    resp = client.post(
        "/audit",
        json={"claim": {}, "csv_text": "patient_id,label,score,split\n"},
        headers={"x-referee-key": "wrong-key"},
    )
    assert resp.status_code == 401, resp.text

    resp = client.post(
        "/audit",
        json={"claim": {}, "csv_text": "patient_id,label,score,split\n"},
    )
    assert resp.status_code == 401, resp.text


def test_production_with_key_accepts_the_correct_key(reload_api):
    module = reload_api(env="production", key="correct-horse")
    client = TestClient(module.app)

    resp = client.post(
        "/audit",
        json={"claim": {}, "csv_text": "patient_id,label,score,split\n"},
        headers={"x-referee-key": "correct-horse"},
    )
    # The key is accepted, so the request reaches the engine and is judged on
    # its merits (an empty claim is a validation error, not an auth error).
    assert resp.status_code != 401, resp.text
    assert resp.status_code != 503, resp.text


def test_health_is_always_reachable(reload_api):
    module = reload_api(env="production", key=None)
    client = TestClient(module.app)

    resp = client.get("/health")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "ok"


def test_development_mode_runs_open(reload_api):
    module = reload_api(env="development", key=None)
    client = TestClient(module.app)

    resp = client.post("/audit", json={"claim": {}, "csv_text": "patient_id,label,score,split\n"})

    assert resp.status_code != 503, resp.text


# ---------------------------------------------------------------------------
# Key rotation
#
# A rotation is only safe if the engine accepts the outgoing and the incoming
# key at the same time, for as long as it takes to move every client over.
# These tests pin that overlap, and pin the boundary: once the old key leaves
# the ring it really is refused, so "rotated" cannot mean "both still work
# forever".
# ---------------------------------------------------------------------------


def _audit(client, key):
    return client.post(
        "/audit",
        json={"claim": {}, "csv_text": "patient_id,label,score,split\n"},
        headers={"x-referee-key": key},
    )


def test_both_keys_are_accepted_during_the_overlap(reload_api):
    module = reload_api(env="production", key="old-key,new-key")
    client = TestClient(module.app)

    for key in ("old-key", "new-key"):
        resp = _audit(client, key)
        assert resp.status_code != 401, f"{key} was refused: {resp.text}"
        assert resp.status_code != 503, resp.text


def test_the_removed_key_is_refused_once_the_overlap_ends(reload_api):
    module = reload_api(env="production", key="new-key")
    client = TestClient(module.app)

    assert _audit(client, "old-key").status_code == 401
    assert _audit(client, "new-key").status_code != 401


def test_semicolons_and_whitespace_also_separate_keys(reload_api):
    module = reload_api(env="production", key=" first-key ;second-key ")
    client = TestClient(module.app)

    for key in ("first-key", "second-key"):
        assert _audit(client, key).status_code != 401, key
    assert _audit(client, "third-key").status_code == 401


def test_empty_entries_do_not_open_the_service(reload_api):
    # A trailing comma or a stray blank in the environment file must not be
    # read as an accepted empty key.
    module = reload_api(env="production", key=", ,,  ,")
    client = TestClient(module.app)

    resp = client.post("/audit", json={"claim": {}, "csv_text": "patient_id,label,score,split\n"})
    assert resp.status_code == 503, resp.text

    # And an empty header value is not a match either.
    module = reload_api(env="production", key="real-key,, ")
    client = TestClient(module.app)
    assert client.post(
        "/audit",
        json={"claim": {}, "csv_text": "patient_id,label,score,split\n"},
        headers={"x-referee-key": ""},
    ).status_code == 401
    assert _audit(client, "real-key").status_code != 401
