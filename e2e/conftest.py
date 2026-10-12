import os
import subprocess

import httpx
import pytest
from playwright.sync_api import Browser, sync_playwright

BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:3000")
MAILPIT_URL = os.environ.get("E2E_MAILPIT_URL", "http://localhost:18125")
# Seeded by `pnpm auth:bootstrap --seed`.
SEED_EMAIL = "moderator@ignite.local"
SEED_PASSWORD = "Moderator-Password-1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def users_cli(*args: str) -> str:
    """Run `pnpm db:users ...`; needs DATABASE_URL (run the tests under `direnv exec .`)."""
    result = subprocess.run(
        ["pnpm", "-s", "db:users", *args], cwd=ROOT, capture_output=True, text=True, check=True
    )
    return result.stdout


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        yield browser
        browser.close()


@pytest.fixture
def page(browser: Browser):
    context = browser.new_context(base_url=BASE_URL, locale="en-CA")
    page = context.new_page()
    yield page
    context.close()


@pytest.fixture
def mailpit():
    client = httpx.Client(base_url=MAILPIT_URL, timeout=10)
    client.delete("/api/v1/messages")  # start from an empty inbox
    yield client
    client.close()


@pytest.fixture
def seed_user_without_roles():
    """The seeded FerrisKey user, with no moderation roles in our database (if it has a row)."""
    for role in ("admin", "moderator"):
        subprocess.run(["pnpm", "-s", "db:users", "revoke", SEED_EMAIL, role], cwd=ROOT, capture_output=True)
    yield
    for role in ("admin", "moderator"):
        subprocess.run(["pnpm", "-s", "db:users", "revoke", SEED_EMAIL, role], cwd=ROOT, capture_output=True)


FERRISKEY_API = os.environ.get("E2E_FERRISKEY_URL", "http://localhost:8190/api")


def set_ferriskey_password(email: str, password: str):
    """Set a user's password through the FerrisKey admin API (dev admin / admin)."""
    with httpx.Client(base_url=FERRISKEY_API, timeout=10) as fk:
        token = fk.post(
            "/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli", "username": "admin", "password": "admin"},
        ).raise_for_status().json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        users = fk.get("/realms/ignite/users", headers=headers).raise_for_status().json()
        users = users.get("data", users) if isinstance(users, dict) else users
        user = next(u for u in users if u.get("username") == email)
        fk.put(
            f"/realms/ignite/users/{user['id']}/reset-password",
            headers=headers,
            json={"value": password, "temporary": False, "credential_type": "password"},
        ).raise_for_status()


@pytest.fixture
def restore_seed_password():
    yield
    set_ferriskey_password(SEED_EMAIL, SEED_PASSWORD)
