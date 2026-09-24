import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAtsResult, parseAmericanOdds, unitsDelta } from "./scoring.ts";

test("parseAmericanOdds: EVEN / EV / PK → +100", () => {
  assert.equal(parseAmericanOdds("EVEN"), 100);
  assert.equal(parseAmericanOdds("even"), 100);
  assert.equal(parseAmericanOdds(" EV "), 100);
  assert.equal(parseAmericanOdds("PK"), 100);
});

test("parseAmericanOdds: normal American odds", () => {
  assert.equal(parseAmericanOdds("+120"), 120);
  assert.equal(parseAmericanOdds("-110"), -110);
  assert.equal(parseAmericanOdds("-105.0"), -105);
  assert.equal(parseAmericanOdds(-115), -115);
  assert.equal(parseAmericanOdds(150), 150);
});

test("parseAmericanOdds: empty / garbage → null, never 0", () => {
  assert.equal(parseAmericanOdds(""), null);
  assert.equal(parseAmericanOdds("   "), null);
  assert.equal(parseAmericanOdds("OFF"), null);
  assert.equal(parseAmericanOdds("abc-110"), null);
  assert.equal(parseAmericanOdds("--"), null);
  assert.equal(parseAmericanOdds("0"), null);
  assert.equal(parseAmericanOdds(0), null);
  assert.equal(parseAmericanOdds(Number.NaN), null);
  assert.equal(parseAmericanOdds(null), null);
  assert.equal(parseAmericanOdds(undefined), null);
});

test("EVEN juice: a losing ★ bet costs 1 unit, a win pays 1", () => {
  const even = parseAmericanOdds("EVEN");
  assert.equal(unitsDelta("favorite", "underdog", "home", -110, even), -1);
  assert.equal(unitsDelta("favorite", "favorite", "home", -110, even), 1);
});

test("pick'em (0) line grades straight-up with home as nominal favorite", () => {
  assert.equal(computeAtsResult(24, 20, 0, "home"), "favorite");
  assert.equal(computeAtsResult(20, 24, 0, "home"), "underdog");
  assert.equal(computeAtsResult(20, 20, 0, "home"), "push");
});
