import { AuthSession } from "@language-app/core";
import type { HTTPMethods } from "fastify";
import { describe, expect, it } from "vitest";
import { addInvite } from "../../src/auth/invites";
import { users, userWords, words } from "../../src/db/schema";
import { buildTestApp } from "../helpers/app";
import { getWith, signUp } from "../helpers/auth";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// Every API route needs a session, except /api/health, /api/sign-in-options and /api/auth/*
// (docs/design.md §4 Accounts, §9).

const db = useTestDb();

/** Every route the app serves, as Fastify registers them. */
async function routesOf(app: ReturnType<typeof buildTestApp>) {
  const routes: Array<{ method: string; url: string }> = [];
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method !== "HEAD") routes.push({ method, url: route.url });
    }
  });
  await app.ready();
  return routes;
}

const OPEN = ["/api/health", "/api/sign-in-options"];
const isOpen = (url: string) => OPEN.includes(url) || url.startsWith("/api/auth/");
/** A path for the route: its parameters filled in. */
const pathOf = (url: string) => url.replace(/:[a-zA-Z]+/g, "1");

describe("without a session", async () => {
  const signedOut = buildTestApp(db, { learner: null });
  const routes = await routesOf(signedOut);
  const protectedRoutes = routes.filter((route) => !isOpen(route.url));

  it("finds the app's routes", () => {
    // Guards the table below against an empty list. (The open routes are registered before the
    // hook that collects these, so they aren't in it.)
    expect(protectedRoutes.length).toBeGreaterThanOrEqual(20);
    expect(signedOut.hasRoute({ method: "GET", url: "/api/health" })).toBe(true);
    expect(signedOut.hasRoute({ method: "GET", url: "/api/sign-in-options" })).toBe(true);
    expect(signedOut.hasRoute({ method: "POST", url: "/api/auth/*" })).toBe(true);
  });

  it.each(protectedRoutes.map((route) => [route.method, route.url]))(
    "%s %s answers 401 unauthorized",
    async (method, url) => {
      const res = await signedOut.inject({
        method: method as HTTPMethods,
        url: pathOf(url),
        payload: method === "GET" || method === "DELETE" ? undefined : {},
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: { code: "unauthorized", message: "Sign in to continue" },
      });
    },
  );

  it("the health check answers", async () => {
    const res = await signedOut.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
  });

  it("so does the question whether Google is offered (Sign in asks it)", async () => {
    const res = await signedOut.inject({ method: "GET", url: "/api/sign-in-options" });
    expect(res.statusCode).toBe(200);
  });

  it("get-session answers that nobody is signed in", async () => {
    const res = await signedOut.inject({ method: "GET", url: "/api/auth/get-session" });
    expect(res.statusCode).toBe(200);
    expect(AuthSession.parse(res.json())).toBeNull();
  });

  it("an unknown or forged cookie is no session", async () => {
    for (const cookie of [
      "better-auth.session_token=made-up",
      "better-auth.session_token=abc.def",
    ]) {
      expect((await getWith(signedOut, "/api/stats", cookie)).statusCode).toBe(401);
    }
  });

  it("an unknown route is still 404", async () => {
    const res = await signedOut.inject({ method: "GET", url: "/api/nothing-here" });
    expect(res.statusCode).toBe(404);
  });
});

describe("with a session", () => {
  async function wordFor(userId: number, lemma: string) {
    const word = first(
      await db
        .insert(words)
        .values({ language: "de", lemma, pos: "noun", article: "der", checkStatus: "match" })
        .returning({ id: words.id }),
    );
    await db.insert(userWords).values({ userId, wordId: word.id, status: "learning" });
  }

  it("each route acts for the session's learner", async () => {
    await wordFor(LEARNER_ID, "Tisch");
    await addInvite(db, "bob@example.com");
    const bob = await signUp(buildTestApp(db, { learner: null }), {
      email: "bob@example.com",
      username: "bob",
    });
    const bobId = first(
      await db.select({ id: users.id }).from(users).orderBy(users.id).offset(1),
    ).id;
    await wordFor(bobId, "Stuhl");
    await wordFor(bobId, "Lampe");

    const app = buildTestApp(db, { learner: null });
    const asBob = await getWith(app, "/api/stats", bob);
    const asLearner = await buildTestApp(db).inject({ method: "GET", url: "/api/stats" });

    expect(asBob.json()).toMatchObject({ learning: 2 });
    expect(asLearner.json()).toMatchObject({ learning: 1 });
  });
});
