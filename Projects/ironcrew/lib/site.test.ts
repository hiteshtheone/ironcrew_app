import assert from "node:assert/strict";
import { test } from "node:test";

import { siteUrl } from "./site";

test("an explicit site url wins over the Vercel host", () => {
  assert.equal(
    siteUrl({
      NEXT_PUBLIC_SITE_URL: "https://ironwill.example/",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "ironwill-fitness.vercel.app",
      VERCEL_URL: "preview.vercel.app",
    }),
    "https://ironwill.example",
  );
});

test("production metadata uses the Vercel production host", () => {
  assert.equal(
    siteUrl({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "ironwill.example",
      VERCEL_URL: "ironwill-abc123.vercel.app",
    }),
    "https://ironwill.example",
  );
});

test("preview metadata uses the deployment host", () => {
  assert.equal(
    siteUrl({
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "ironwill.example",
      VERCEL_URL: "ironwill-abc123.vercel.app",
    }),
    "https://ironwill-abc123.vercel.app",
  );
});

test("local metadata stays on localhost", () => {
  assert.equal(siteUrl({}), "http://localhost:3000");
});
