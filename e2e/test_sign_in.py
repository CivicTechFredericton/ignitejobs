"""Sign-in through FerrisKey, roles from our database, and sign-out ending the IdP session.

Needs the dev stack: FerrisKey + Mailpit (scripts/dev-infra.sh), `pnpm auth:bootstrap --seed`,
and the API + web app with the OIDC settings from .env.local. Run from the repo root:

    direnv exec . sh -c 'cd e2e && uv run pytest'
"""

import re

from conftest import BASE_URL, SEED_EMAIL, SEED_PASSWORD, users_cli
from playwright.sync_api import Page, expect


def sign_in_on_ferriskey(page: Page, email: str, password: str):
    expect(page).to_have_url(re.compile(r"/realms/ignite/"))
    page.locator("input[name=username]").fill(email)
    page.locator("input[name=password]").fill(password)
    page.get_by_role("button", name="Login").click()


def test_anonymous_visitors_are_asked_to_sign_in(page: Page):
    page.goto("/en/mod")
    expect(page.get_by_text("Sign in with your moderator account to continue.")).to_be_visible()
    expect(page.get_by_role("link", name="Moderate")).to_have_count(0)


def test_sign_in_roles_and_sign_out(page: Page, seed_user_without_roles):
    page.goto("/en/mod")
    page.get_by_role("main").get_by_role("link", name="Moderator sign in").click()
    sign_in_on_ferriskey(page, SEED_EMAIL, SEED_PASSWORD)

    # Back on the page we started from: signed in, but no role yet.
    expect(page).to_have_url(re.compile(r"/en/mod$"))
    expect(page.get_by_role("heading", name="Access denied")).to_be_visible()
    expect(page.get_by_role("button", name="Sign out")).to_be_visible()
    expect(page.get_by_text("Mo Derator")).to_be_visible()
    expect(page.get_by_role("link", name="Moderate")).to_have_count(0)

    # Signing in recorded the user; an admin grants the role.
    assert SEED_EMAIL in users_cli("list")
    users_cli("grant", SEED_EMAIL, "moderator")
    page.reload()
    expect(page.get_by_role("heading", name="Moderation")).to_be_visible()
    expect(page.get_by_role("link", name="Moderate")).to_be_visible()

    # Signing out ends the FerrisKey session too: signing in again shows the login form.
    page.get_by_role("button", name="Sign out").click()
    expect(page.get_by_role("link", name="Moderator sign in")).to_be_visible()
    page.goto("/en/mod")
    expect(page.get_by_text("Sign in with your moderator account to continue.")).to_be_visible()
    page.get_by_role("main").get_by_role("link", name="Moderator sign in").click()
    expect(page.locator("input[name=password]")).to_be_visible()


def test_wrong_password_stays_on_ferriskey(page: Page):
    page.goto("/en/mod")
    page.get_by_role("main").get_by_role("link", name="Moderator sign in").click()
    sign_in_on_ferriskey(page, SEED_EMAIL, "not-the-password")
    expect(page).to_have_url(re.compile(r"localhost:8190"))


def latest_email_to(mailpit, address: str, attempts: int = 20) -> dict:
    """Poll Mailpit for the newest message to `address`; returns the full message."""
    import time

    for _ in range(attempts):
        messages = mailpit.get("/api/v1/messages").json().get("messages", [])
        for message in messages:
            if any(to["Address"] == address for to in message["To"]):
                return mailpit.get(f"/api/v1/message/{message['ID']}").json()
        time.sleep(0.5)
    raise AssertionError(f"no email to {address} arrived in Mailpit")


def test_forgot_password_email_via_mailpit(page: Page, browser, mailpit, restore_seed_password):
    page.goto("/en/mod")
    page.get_by_role("main").get_by_role("link", name="Moderator sign in").click()
    page.get_by_text("Forgot your password?").click()
    page.locator("input[name=email]").fill(SEED_EMAIL)
    page.get_by_role("button", name="Send reset link").click()
    expect(page.get_by_text("If an account exists with this email").first).to_be_visible()

    email = latest_email_to(mailpit, SEED_EMAIL)
    assert email["Subject"] == "Reset your password"
    assert email["From"]["Address"] == "no-reply@ignite.local"
    # Our bilingual template (scripts/ferriskey-bootstrap.ts) is the HTML part.
    assert "Ignite Job Board" in email["HTML"]
    assert "nouveau mot de passe" in email["HTML"]
    link = re.search(r"https?://\S+/reset-password\?\S+", email["Text"]).group(0)

    new_password = "Changed-Password-2!"
    page.goto(link)
    page.locator("input[name=password]").fill(new_password)
    page.locator("input[name=confirmPassword]").fill(new_password)
    with page.expect_response(lambda r: r.url.endswith("/login-actions/reset-password")) as reset:
        page.get_by_role("button", name="Reset password").click()
    assert reset.value.ok

    # The new password works for signing in to the job board. Use a brand-new browser context
    # so this really goes through the FerrisKey login form. (Clearing only cookies is not
    # enough: FerrisKey's login page keeps OAuth state in localStorage and reloads forever if
    # it is stale.)
    fresh = browser.new_context(base_url=BASE_URL, locale="en-CA")
    try:
        other = fresh.new_page()
        other.goto("/en/mod")
        other.get_by_role("main").get_by_role("link", name="Moderator sign in").click()
        sign_in_on_ferriskey(other, SEED_EMAIL, new_password)
        expect(other).to_have_url(re.compile(r"/en/mod$"))
        expect(other.get_by_role("button", name="Sign out")).to_be_visible()
    finally:
        fresh.close()
