import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HttpError, errorToResponse } from "./errors";
import { parseJsonBody } from "./http";
import type { HandlerEvent } from "@netlify/functions";

describe("errorToResponse", () => {
  const silent = () => {};

  it("HttpError keeps its status, message and code", () => {
    assert.deepEqual(errorToResponse(new HttpError(404, "No player with that name", "USER_NOT_FOUND"), silent), {
      status: 404,
      body: { error: "No player with that name", code: "USER_NOT_FOUND" },
    });
    assert.deepEqual(errorToResponse(new HttpError(401, "Unauthorized"), silent), {
      status: 401,
      body: { error: "Unauthorized" },
    });
  });

  it("SyntaxError (bad JSON) → 400 Invalid request", () => {
    let err: unknown;
    try {
      JSON.parse("{not json");
    } catch (e) {
      err = e;
    }
    const r = errorToResponse(err, silent);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "Invalid request");
  });

  it("anything else → 500 generic, details only in the log", () => {
    const logged: unknown[][] = [];
    const secret = new Error('duplicate key value violates unique constraint "users_username_unique"');
    const r = errorToResponse(secret, (...args) => logged.push(args));
    assert.deepEqual(r, { status: 500, body: { error: "Something went wrong" } });
    assert.equal(logged.length, 1);
    assert.ok(logged[0].includes(secret));
    assert.doesNotMatch(JSON.stringify(r.body), /duplicate|constraint/);

    assert.equal(errorToResponse("a string", silent).status, 500);
    assert.equal(errorToResponse(new Error("Unauthorized"), silent).status, 500, "plain Error isn't trusted");
  });
});

describe("parseJsonBody", () => {
  const ev = (body: string | null, isBase64Encoded = false) =>
    ({ body, isBase64Encoded }) as unknown as HandlerEvent;

  it("parses objects, treats empty as {}", () => {
    assert.deepEqual(parseJsonBody(ev('{"a":1}')), { a: 1 });
    assert.deepEqual(parseJsonBody(ev(null)), {});
    assert.deepEqual(parseJsonBody(ev("  ")), {});
    assert.deepEqual(parseJsonBody(ev(Buffer.from('{"b":2}').toString("base64"), true)), { b: 2 });
  });

  it("malformed or non-object → HttpError 400", () => {
    for (const b of ["{oops", "[1,2]", "null", '"str"', "42"]) {
      assert.throws(
        () => parseJsonBody(ev(b)),
        (e: unknown) => e instanceof HttpError && e.status === 400 && e.message === "Invalid request",
        b,
      );
    }
  });
});
