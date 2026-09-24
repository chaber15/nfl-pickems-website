import { test } from "node:test";
import assert from "node:assert/strict";
import { isSlateComplete } from "./badges";
import { makeGame } from "./testFixtures";

const kickoff = "2026-09-13T17:00:00.000Z";
const pending = { status: "scheduled" as const, atsResult: null, kickoffAt: kickoff };

test("slate with an unfinished game is not complete", () => {
  const games = [makeGame("a"), makeGame("b", pending)];
  assert.equal(isSlateComplete(games, new Date("2026-09-14T12:00:00Z")), false);
});

test("a game still unfinished 3+ days after kickoff (canceled) does not block the week", () => {
  const games = [makeGame("a"), makeGame("b", pending)];
  assert.equal(isSlateComplete(games, new Date("2026-09-17T18:00:00Z")), true);
});

test("slate with no graded games is never complete", () => {
  assert.equal(isSlateComplete([makeGame("a", pending)], new Date("2026-10-01T00:00:00Z")), false);
});
