import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCookies } from "./auth";
import {
  isReservedUsername,
  normalizeNewUsername,
  normalizeUsername,
} from "../shared/userDisplay";

describe("parseCookies", () => {
  it("parses normal headers", () => {
    assert.deepEqual(parseCookies("a=1; pickems_session=abc%20def; b=x=y"), {
      a: "1",
      pickems_session: "abc def",
      b: "x=y",
    });
  });

  it("empty / missing header", () => {
    assert.deepEqual(parseCookies(null), {});
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies(""), {});
  });

  it("never throws on malformed %-encoding; keeps the raw value", () => {
    assert.doesNotThrow(() => parseCookies("bad=%E0%A4%A; ok=1"));
    assert.deepEqual(parseCookies("bad=%E0%A4%A; ok=1"), { bad: "%E0%A4%A", ok: "1" });
    assert.deepEqual(parseCookies("x=%"), { x: "%" });
  });

  it("skips junk segments and keeps the first duplicate", () => {
    assert.deepEqual(parseCookies("; =nokey; novalue; a=1; a=2;;"), { a: "1" });
  });
});

describe("reserved usernames", () => {
  it("blocks reserved names case-insensitively for new names", () => {
    for (const name of [
      "admin",
      "Admin",
      "ADMINISTRATOR",
      "root",
      "mod",
      "Moderator",
      "superadmin",
      "SYSTEM",
      "null",
      "Undefined",
    ]) {
      assert.equal(isReservedUsername(name), true, name);
      assert.throws(() => normalizeNewUsername(name), /reserved/, name);
    }
  });

  it("allows ordinary names and names that merely contain a reserved word", () => {
    for (const name of ["Caleb", "Grace", "admin2", "modern", "rooty", "zz_test_b"]) {
      assert.equal(normalizeNewUsername(name), name);
    }
  });

  it("existing reserved accounts still pass the login format check", () => {
    assert.equal(normalizeUsername("admin"), "admin");
  });

  it("format rules still apply", () => {
    assert.throws(() => normalizeNewUsername("ab"));
    assert.throws(() => normalizeNewUsername("has space"));
    assert.equal(normalizeNewUsername("  Trimmed  "), "Trimmed");
  });
});
