// Integration tests: need DATABASE_URL (run with `direnv exec . pnpm --filter @ignite/api test`).
// They drive the real app with real session cookies; the OIDC round trip itself is covered by
// the browser test in e2e/.
delete process.env.AUTH_DEV_MODERATOR;
// Empty rather than deleted: env.ts loads .env.local, which never overrides a set variable.
process.env.OIDC_ISSUER = "";

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sessions, users } from "@ignite/db";
import { eq, like } from "drizzle-orm";

const { app } = await import("./app.ts");
const { db } = await import("./db.ts");
const { SESSION_COOKIE, createSession } = await import("./session.ts");
const { upsertUserFromClaims } = await import("./users.ts");

const PREFIX = "test-auth-";

const cleanup = () => db.delete(users).where(like(users.idpSubject, `${PREFIX}%`));
after(() => db.pool.end());

const get = (path: string, token?: string) =>
  app.request(path, { headers: token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {} });

async function signedInAs(subject: string, roles: ("moderator" | "admin")[] = []) {
  const user = await upsertUserFromClaims({ sub: `${PREFIX}${subject}`, email: `${subject}@example.org` });
  if (roles.length) await db.update(users).set({ roles }).where(eq(users.id, user.id));
  return { token: await createSession(user.id, "an-id-token"), userId: user.id };
}

describe("sessions and roles", () => {
  before(cleanup);
  after(cleanup);

  test("anonymous visitors: no user, and moderation is 401", async () => {
    assert.deepEqual(await (await get("/api/session")).json(), { user: null });
    assert.equal((await get("/api/mod/me")).status, 401);
  });

  test("an unknown or forged session token is ignored", async () => {
    assert.deepEqual(await (await get("/api/session", "not-a-real-token")).json(), { user: null });
    assert.equal((await get("/api/mod/me", "not-a-real-token")).status, 401);
  });

  test("a signed-in user without roles is known but forbidden from moderation", async () => {
    const { token } = await signedInAs("viewer");
    assert.deepEqual(await (await get("/api/session", token)).json(), {
      user: { email: "viewer@example.org", name: null, roles: [] },
    });
    const res = await get("/api/mod/me", token);
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "forbidden" });
  });

  for (const role of ["moderator", "admin"] as const) {
    test(`a ${role} can use moderation`, async () => {
      const { token } = await signedInAs(role, [role]);
      const res = await get("/api/mod/me", token);
      assert.equal(res.status, 200);
      assert.deepEqual(((await res.json()) as { roles: string[] }).roles, [role]);
    });
  }

  test("expired sessions are rejected", async () => {
    const { token, userId } = await signedInAs("expired", ["moderator"]);
    // Only this test user's session: the dev database may hold real ones.
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, userId));
    assert.equal((await get("/api/mod/me", token)).status, 401);
  });

  test("only the token's hash is stored", async () => {
    const { token, userId } = await signedInAs("hashed");
    const rows = await db.select({ tokenHash: sessions.tokenHash }).from(sessions).where(eq(sessions.userId, userId));
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.tokenHash !== token && /^[0-9a-f]{64}$/.test(row.tokenHash)));
  });

  test("logout deletes the session and clears the cookie", async () => {
    const { token } = await signedInAs("leaving", ["moderator"]);
    const res = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    });
    assert.equal(res.status, 303);
    assert.match(res.headers.get("set-cookie") ?? "", new RegExp(`${SESSION_COOKIE}=;`));
    assert.equal((await get("/api/mod/me", token)).status, 401);
  });

  test("a callback without the login cookie goes home instead of signing in", async () => {
    const res = await app.request("/api/auth/callback?code=x&state=y");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/");
  });

  test("the database rejects unknown roles", async () => {
    await assert.rejects(
      db.insert(users).values({ idpSubject: `${PREFIX}bad`, roles: ["superuser" as never] }),
      // Drizzle wraps the Postgres error; the violated constraint is on its cause.
      (error: Error & { cause?: { constraint?: string } }) => error.cause?.constraint === "users_roles_valid",
    );
  });
});

describe("upsertUserFromClaims", () => {
  before(cleanup);
  after(cleanup);

  test("builds the name from given/family names (FerrisKey sends no `name`)", async () => {
    const user = await upsertUserFromClaims({ sub: `${PREFIX}ada`, email: "ada@example.org", given_name: "Ada", family_name: "Lovelace" });
    assert.equal(user.name, "Ada Lovelace");
    const blank = await upsertUserFromClaims({ sub: `${PREFIX}blank`, given_name: "", family_name: "" });
    assert.equal(blank.name, null);
  });

  test("refreshes details on later sign-ins, keeps roles, and keeps known values when claims are empty", async () => {
    const first = await upsertUserFromClaims({ sub: `${PREFIX}grace`, email: "grace@example.org", given_name: "Grace" });
    await db.update(users).set({ roles: ["moderator"] }).where(eq(users.id, first.id));
    const renamed = await upsertUserFromClaims({ sub: `${PREFIX}grace`, email: "grace.hopper@example.org", given_name: "Grace", family_name: "Hopper" });
    assert.equal(renamed.id, first.id);
    assert.deepEqual(renamed.roles, ["moderator"]);
    assert.equal(renamed.email, "grace.hopper@example.org");
    assert.equal(renamed.name, "Grace Hopper");
    const sparse = await upsertUserFromClaims({ sub: `${PREFIX}grace` });
    assert.equal(sparse.email, "grace.hopper@example.org");
    assert.equal(sparse.name, "Grace Hopper");
  });
});
