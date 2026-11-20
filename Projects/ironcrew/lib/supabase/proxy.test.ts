import assert from "node:assert/strict";
import { before, mock, test } from "node:test";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

let claims: { sub: string } | null = null;

mock.module("@supabase/ssr", {
  namedExports: {
    createServerClient: () => ({
      auth: {
        getClaims: async () => ({ data: { claims } }),
      },
    }),
  },
});

let updateSession: typeof import("./proxy").updateSession;

before(async () => {
  ({ updateSession } = await import("./proxy"));
});

test("an anonymous dashboard visit redirects to login", async () => {
  claims = null;
  const response = await updateSession(new NextRequest("http://localhost:3000/dashboard"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost:3000/auth/login");
});

test("api and auth routes stay reachable without a session", async () => {
  claims = null;
  for (const path of ["/api/me", "/auth/login"]) {
    const response = await updateSession(new NextRequest(`http://localhost:3000${path}`));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("location"), null, path);
  }
});

test("a signed-in visit is not redirected", async () => {
  claims = { sub: "11111111-1111-4111-8111-111111111111" };
  const response = await updateSession(new NextRequest("http://localhost:3000/dashboard"));
  assert.equal(response.status, 200);
});
