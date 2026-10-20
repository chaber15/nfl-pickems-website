import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePickemLine,
  resolveLineFields,
  shouldSwapPicksForFavoriteFlip,
  type LineSnapshot,
} from "./lineLock.ts";

const stored: LineSnapshot = { spread: 3.5, favoriteSide: "home", oddsAway: -110, oddsHome: -110 };
const empty: LineSnapshot = { spread: null, favoriteSide: null, oddsAway: null, oddsHome: null };

test("before lock: null incoming line keeps stored values (no wipe)", () => {
  assert.deepEqual(resolveLineFields(stored, empty, false), stored);
});

test("before lock: partial incoming keeps stored pair, takes new juice field-by-field", () => {
  const out = resolveLineFields(
    stored,
    { spread: null, favoriteSide: "away", oddsAway: -120, oddsHome: null },
    false,
  );
  assert.deepEqual(out, { spread: 3.5, favoriteSide: "home", oddsAway: -120, oddsHome: -110 });
});

test("before lock: complete incoming line replaces stored", () => {
  const incoming: LineSnapshot = { spread: 2.5, favoriteSide: "away", oddsAway: -105, oddsHome: -115 };
  assert.deepEqual(resolveLineFields(stored, incoming, false), incoming);
});

test("before lock, nothing stored: take incoming as-is", () => {
  assert.deepEqual(resolveLineFields(null, empty, false), empty);
});

test("after lock: complete stored line is frozen, even against nulls or a flip", () => {
  assert.deepEqual(resolveLineFields(stored, empty, true), stored);
  assert.deepEqual(
    resolveLineFields(stored, { spread: 7, favoriteSide: "away", oddsAway: -110, oddsHome: -110 }, true),
    stored,
  );
});

test("after lock: incomplete stored line only fills gaps, with juice from the same line only", () => {
  const partial: LineSnapshot = { spread: 3, favoriteSide: "home", oddsAway: null, oddsHome: -110 };
  // A moved line's prices don't fill the locked line.
  assert.deepEqual(
    resolveLineFields(partial, { spread: 4, favoriteSide: "away", oddsAway: -105, oddsHome: -115 }, true),
    partial,
  );
  assert.deepEqual(
    resolveLineFields(partial, { spread: 3, favoriteSide: "home", oddsAway: -105, oddsHome: -115 }, true),
    { spread: 3, favoriteSide: "home", oddsAway: -105, oddsHome: -110 },
  );
  assert.deepEqual(resolveLineFields(partial, empty, true), partial);

  const noJuice: LineSnapshot = { spread: 1.5, favoriteSide: "home", oddsAway: null, oddsHome: null };
  assert.deepEqual(
    resolveLineFields(noJuice, { spread: 2.5, favoriteSide: "away", oddsAway: -120, oddsHome: 100 }, true),
    noJuice,
  );
  assert.deepEqual(
    resolveLineFields(noJuice, { spread: 1.5, favoriteSide: "home", oddsAway: -115, oddsHome: -105 }, true),
    { spread: 1.5, favoriteSide: "home", oddsAway: -115, oddsHome: -105 },
  );

  // Nothing stored but a spread-less row: the incoming pair and its own juice are taken.
  const bare: LineSnapshot = { spread: null, favoriteSide: null, oddsAway: null, oddsHome: null };
  assert.deepEqual(
    resolveLineFields(bare, { spread: 3, favoriteSide: "away", oddsAway: -112, oddsHome: -108 }, true),
    { spread: 3, favoriteSide: "away", oddsAway: -112, oddsHome: -108 },
  );
});

test("pick'em: spread 0 without favorite → home nominal favorite", () => {
  assert.deepEqual(normalizePickemLine({ spread: 0, favoriteSide: null, oddsAway: -110, oddsHome: -110 }), {
    spread: 0,
    favoriteSide: "home",
    oddsAway: -110,
    oddsHome: -110,
  });
  assert.deepEqual(
    resolveLineFields(null, { spread: 0, favoriteSide: null, oddsAway: null, oddsHome: null }, false).favoriteSide,
    "home",
  );
  // Non-zero spread without favorite is left alone
  assert.equal(normalizePickemLine({ spread: 3, favoriteSide: null, oddsAway: null, oddsHome: null }).favoriteSide, null);
});

test("favorite flip swap decision", () => {
  assert.equal(shouldSwapPicksForFavoriteFlip("home", "away"), true);
  assert.equal(shouldSwapPicksForFavoriteFlip("away", "home"), true);
  assert.equal(shouldSwapPicksForFavoriteFlip("home", "home"), false);
  assert.equal(shouldSwapPicksForFavoriteFlip(null, "home"), false);
  assert.equal(shouldSwapPicksForFavoriteFlip("home", null), false);
  assert.equal(shouldSwapPicksForFavoriteFlip(undefined, undefined), false);
});

test("favorite flip flows through line resolution before lock only", () => {
  const flipped = resolveLineFields(stored, { spread: 1, favoriteSide: "away", oddsAway: -110, oddsHome: -110 }, false);
  assert.equal(shouldSwapPicksForFavoriteFlip(stored.favoriteSide, flipped.favoriteSide), true);
  const locked = resolveLineFields(stored, { spread: 1, favoriteSide: "away", oddsAway: -110, oddsHome: -110 }, true);
  assert.equal(shouldSwapPicksForFavoriteFlip(stored.favoriteSide, locked.favoriteSide), false);
  // Line pulled (nulls) before lock: no flip
  const pulled = resolveLineFields(stored, empty, false);
  assert.equal(shouldSwapPicksForFavoriteFlip(stored.favoriteSide, pulled.favoriteSide), false);
});
