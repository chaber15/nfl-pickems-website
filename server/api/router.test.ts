import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { HandlerEvent } from "@netlify/functions";
import { routeApiRequest, apiPath } from "./router";

// These run without a database: every case below is decided before any DB access.
before(() => {
  delete process.env.DATABASE_URL;
});

function event(partial: Partial<HandlerEvent> & { path: string }): HandlerEvent {
  return {
    rawUrl: `https://pickems.site${partial.path}`,
    rawQuery: "",
    httpMethod: "GET",
    headers: { host: "pickems.site" },
    multiValueHeaders: {},
    queryStringParameters: {},
    multiValueQueryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    ...partial,
  } as HandlerEvent;
}

describe("router", () => {
  it("normalizes paths", () => {
    assert.equal(apiPath({ path: "/api/games/", queryStringParameters: {} }), "games");
    assert.equal(apiPath({ path: "/.netlify/functions/api/auth/me", queryStringParameters: {} }), "auth/me");
    assert.equal(apiPath({ path: "/api", queryStringParameters: { path: "stats" } }), "stats");
  });

  it("POST with a foreign Origin → 403, private cache", async () => {
    const res = await routeApiRequest(
      event({
        path: "/api/auth/login",
        httpMethod: "POST",
        headers: { host: "pickems.site", origin: "https://evil.example" },
        body: JSON.stringify({ username: "Caleb" }),
      }),
    );
    assert.equal(res.statusCode, 403);
    assert.equal(JSON.parse(res.body).code, "BAD_ORIGIN");
    assert.equal(res.headers["Cache-Control"], "private, no-store");
  });

  it("/api/games?week=99 → 400 with an error body and no CDN caching", async () => {
    const res = await routeApiRequest(
      event({ path: "/api/games", queryStringParameters: { week: "99" } }),
    );
    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(res.body), { error: "Invalid week", code: "INVALID_WEEK" });
    assert.equal(res.headers["Cache-Control"], "private, no-store");
    assert.equal(res.headers["Netlify-CDN-Cache-Control"], undefined);
  });

  it("/api/calendar is CDN-cacheable", async () => {
    const res = await routeApiRequest(event({ path: "/api/calendar" }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Netlify-CDN-Cache-Control"], "public, s-maxage=60, stale-while-revalidate=120");
    assert.equal(res.headers["Cache-Control"], "public, max-age=0, must-revalidate");
  });

  it("DB-backed routes without a DB → 503 JSON", async () => {
    const res = await routeApiRequest(event({ path: "/api/leaderboard" }));
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers["Content-Type"], "application/json");
  });
});
