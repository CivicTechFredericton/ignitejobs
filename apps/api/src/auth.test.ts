// Integration test: needs DATABASE_URL (run with `direnv exec . pnpm --filter @ignite/api test`).
// Clerk is stood in for by setting the context variable that @hono/clerk-auth's getAuth() reads.
process.env.CLERK_SECRET_KEY ??= "sk_test_fake";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_fake";
delete process.env.AUTH_DEV_MODERATOR;

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { users } from "@ignite/db";
import { eq, like } from "drizzle-orm";
import { Hono } from "hono";

const { requireModerator, requireSignedIn } = await import("./auth.ts");
const { db } = await import("./db.ts");

const PREFIX = "user_test_auth_";

const app = new Hono()
  .use(async (c, next) => {
    const userId = c.req.header("x-test-user") ?? null;
    c.set("clerkAuth" as never, (() => ({ userId })) as never);
    await next();
  })
  .use(requireModerator)
  .get("/", (c) => c.json({ roles: c.get("user").roles }));

const request = (user?: string) => app.request("/", { headers: user ? { "x-test-user": user } : {} });

// A Clerk backend client that knows one profile per user id.
let profiles: Record<string, { fullName: string | null; primaryEmailAddress: { emailAddress: string } | null }> = {};
const fakeClerk = {
  users: {
    getUser: async (id: string) => {
      const profile = profiles[id];
      if (!profile) throw new Error("Clerk is down");
      return profile;
    },
  },
};

const sessionApp = new Hono()
  .use(async (c, next) => {
    const userId = c.req.header("x-test-user") ?? null;
    c.set("clerkAuth" as never, (() => ({ userId })) as never);
    c.set("clerk" as never, fakeClerk as never);
    await next();
  })
  .use(requireSignedIn)
  .post("/", (c) => c.json({ roles: c.get("user").roles }));

const signIn = (user?: string) =>
  sessionApp.request("/", { method: "POST", headers: user ? { "x-test-user": user } : {} });
const userRow = async (clerkUserId: string) =>
  (await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)))[0];
const cleanup = () => db.delete(users).where(like(users.clerkUserId, `${PREFIX}%`));
after(() => db.pool.end());

describe("requireModerator", () => {
  before(cleanup);
  after(cleanup);

  test("rejects anonymous requests", async () => {
    const res = await request();
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "unauthenticated" });
  });

  test("records a first-time user with no roles and forbids them", async () => {
    const res = await request(`${PREFIX}new`);
    assert.equal(res.status, 403);
    const [row] = await db.select().from(users).where(like(users.clerkUserId, `${PREFIX}new`));
    assert.deepEqual(row?.roles, []);
    assert.ok(row?.lastSeenAt);
  });

  for (const role of ["moderator", "admin"] as const) {
    test(`allows a user with the ${role} role`, async () => {
      await db.insert(users).values({ clerkUserId: `${PREFIX}${role}`, roles: [role] });
      const res = await request(`${PREFIX}${role}`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { roles: [role] });
    });
  }

  test("the database rejects unknown roles", async () => {
    await assert.rejects(
      db.insert(users).values({ clerkUserId: `${PREFIX}bad`, roles: ["superuser" as never] }),
      // Drizzle wraps the Postgres error; the violated constraint is on its cause.
      (error: Error & { cause?: { constraint?: string } }) => error.cause?.constraint === "users_roles_valid",
    );
  });
});

describe("sign-in sync (requireSignedIn)", () => {
  before(cleanup);
  after(cleanup);

  test("rejects anonymous requests", async () => {
    assert.equal((await signIn()).status, 401);
  });

  test("creates a row with the Clerk profile on first sign-in", async () => {
    profiles = { [`${PREFIX}sync`]: { fullName: "Ada Lovelace", primaryEmailAddress: { emailAddress: "ada@example.org" } } };
    const res = await signIn(`${PREFIX}sync`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { roles: [] });
    const row = await userRow(`${PREFIX}sync`);
    assert.equal(row?.email, "ada@example.org");
    assert.equal(row?.name, "Ada Lovelace");
  });

  test("refreshes the profile on later sign-ins and keeps granted roles", async () => {
    await db.update(users).set({ roles: ["moderator"] }).where(eq(users.clerkUserId, `${PREFIX}sync`));
    profiles = { [`${PREFIX}sync`]: { fullName: "Ada King", primaryEmailAddress: { emailAddress: "ada.king@example.org" } } };
    const res = await signIn(`${PREFIX}sync`);
    assert.deepEqual(await res.json(), { roles: ["moderator"] });
    const row = await userRow(`${PREFIX}sync`);
    assert.equal(row?.email, "ada.king@example.org");
    assert.equal(row?.name, "Ada King");
  });

  test("still records the user, keeping known details, when Clerk is unavailable", async () => {
    profiles = {};
    assert.equal((await signIn(`${PREFIX}sync`)).status, 200);
    assert.equal((await userRow(`${PREFIX}sync`))?.email, "ada.king@example.org");
    assert.equal((await signIn(`${PREFIX}offline`)).status, 200);
    assert.equal((await userRow(`${PREFIX}offline`))?.email, null);
  });
});
