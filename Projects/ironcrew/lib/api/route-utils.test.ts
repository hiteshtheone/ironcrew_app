import assert from "node:assert/strict";
import { test } from "node:test";

import { asTrimmedString, isIsoDate, isUuid, rpcStatus } from "./route-utils";

const ID = "11111111-1111-4111-8111-111111111111";

test("uuid and date checks reject lookalikes", () => {
  assert.equal(isUuid(ID), true);
  assert.equal(isUuid("11111111-1111-4111-8111-11111111111"), false);
  assert.equal(isIsoDate("2026-11-19"), true);
  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(isIsoDate("19-11-2026"), false);
});

test("trimmed strings collapse blanks and reject non-strings", () => {
  assert.equal(asTrimmedString("  Ada  "), "Ada");
  assert.equal(asTrimmedString("   "), null);
  assert.equal(asTrimmedString(null), null);
  assert.equal(asTrimmedString(1), undefined);
});

test("rpc failures map to the status the UI handles", () => {
  assert.equal(rpcStatus("ACTIVE_PROGRAM_EXISTS"), 409);
  assert.equal(rpcStatus("ACCOUNT_HAS_CLIENTS Remove your clients"), 409);
  assert.equal(rpcStatus("ACCOUNT_IN_USE Workout history still uses your library"), 409);
  assert.equal(rpcStatus("row-level security"), 403);
  assert.equal(rpcStatus("You cannot deactivate this program"), 403);
  assert.equal(rpcStatus("starts_on is required"), 400);
  assert.equal(rpcStatus("Program week not found"), 400);
  assert.equal(rpcStatus("connection reset"), 500);
});
