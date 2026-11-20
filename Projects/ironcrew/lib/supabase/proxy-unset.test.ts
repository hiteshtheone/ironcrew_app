import assert from "node:assert/strict";
import { before, test } from "node:test";
import { NextRequest } from "next/server";

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let updateSession: typeof import("./proxy").updateSession;

before(async () => {
  ({ updateSession } = await import("./proxy"));
});

test("the session proxy does nothing until the public Supabase env vars are set", async () => {
  const response = await updateSession(new NextRequest("http://localhost:3000/dashboard"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});
