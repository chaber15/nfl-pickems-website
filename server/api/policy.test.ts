import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRIVATE_NO_STORE,
  PUBLIC_BROWSER_CACHE,
  PUBLIC_CDN_CACHE,
  cacheHeadersFor,
  isOriginAllowed,
  isValidWeekParams,
  parseWeekQuery,
} from "./policy";
import { HttpError } from "./errors";

describe("cacheHeadersFor", () => {
  it("public CDN caching for successful slate GETs", () => {
    for (const path of ["games", "calendar", "calendar/current"]) {
      assert.deepEqual(cacheHeadersFor(path, "GET", 200), {
        "Cache-Control": PUBLIC_BROWSER_CACHE,
        "Netlify-CDN-Cache-Control": PUBLIC_CDN_CACHE,
      });
    }
    assert.equal(PUBLIC_CDN_CACHE, "public, s-maxage=60, stale-while-revalidate=120");
    assert.equal(PUBLIC_BROWSER_CACHE, "public, max-age=0, must-revalidate");
  });

  it("private no-store for everything else", () => {
    const cases: Array<[string, string, number]> = [
      ["games", "GET", 400],
      ["games", "GET", 500],
      ["games", "POST", 200],
      ["leaderboard", "GET", 200],
      ["auth/me", "GET", 200],
      ["picks/week", "GET", 200],
      ["admin", "GET", 200],
      ["calendarx", "GET", 200],
    ];
    for (const [p, m, s] of cases) {
      assert.deepEqual(cacheHeadersFor(p, m, s), { "Cache-Control": PRIVATE_NO_STORE }, `${m} ${p} ${s}`);
    }
  });
});

describe("isOriginAllowed", () => {
  it("ignores non-POST and POSTs without Origin", () => {
    assert.equal(isOriginAllowed("GET", "https://evil.example", "pickems.site"), true);
    assert.equal(isOriginAllowed("POST", undefined, "pickems.site"), true);
    assert.equal(isOriginAllowed("POST", "", "pickems.site"), true);
  });
  it("same host passes (case-insensitive, with port)", () => {
    assert.equal(isOriginAllowed("POST", "https://pickems.site", "pickems.site"), true);
    assert.equal(isOriginAllowed("POST", "https://PickEms.Site", "pickems.site"), true);
    assert.equal(isOriginAllowed("POST", "http://localhost:8888", "localhost:8888"), true);
  });
  it("foreign, malformed or null origins are rejected", () => {
    assert.equal(isOriginAllowed("POST", "https://evil.example", "pickems.site"), false);
    assert.equal(isOriginAllowed("POST", "https://pickems.site.evil.example", "pickems.site"), false);
    assert.equal(isOriginAllowed("POST", "http://localhost:5173", "localhost:8888"), false);
    assert.equal(isOriginAllowed("POST", "null", "pickems.site"), false);
    assert.equal(isOriginAllowed("POST", "not a url", "pickems.site"), false);
    assert.equal(isOriginAllowed("POST", "https://pickems.site", undefined), false);
  });
});

describe("week validation", () => {
  it("regular season 1..18, postseason 1..5", () => {
    assert.equal(isValidWeekParams(2, 1), true);
    assert.equal(isValidWeekParams(2, 18), true);
    assert.equal(isValidWeekParams(2, 19), false);
    assert.equal(isValidWeekParams(2, 0), false);
    assert.equal(isValidWeekParams(3, 1), true);
    assert.equal(isValidWeekParams(3, 5), true);
    assert.equal(isValidWeekParams(3, 6), false);
    assert.equal(isValidWeekParams(1, 1), false);
    assert.equal(isValidWeekParams(2, 1.5), false);
    assert.equal(isValidWeekParams(Number.NaN, 1), false);
  });

  it("parseWeekQuery defaults and rejects junk with 400", () => {
    assert.deepEqual(parseWeekQuery({}), { seasonType: 2, week: 1 });
    assert.deepEqual(parseWeekQuery({ seasonType: "3", week: "2" }), { seasonType: 3, week: 2 });
    for (const q of [
      { week: "99" },
      { week: "abc" },
      { week: "1e1" },
      { week: "-1" },
      { week: "2.0" },
      { seasonType: "4", week: "1" },
      { seasonType: "3", week: "6" },
    ]) {
      assert.throws(
        () => parseWeekQuery(q),
        (err: unknown) => err instanceof HttpError && err.status === 400 && err.code === "INVALID_WEEK",
        JSON.stringify(q),
      );
    }
  });
});
