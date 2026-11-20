import assert from "node:assert/strict";
import { test } from "node:test";

import { sentryStore } from "./report-error";

test("a Sentry DSN becomes a store URL and public key", () => {
  assert.deepEqual(
    sentryStore("https://public-key@o0.ingest.sentry.io/12345"),
    {
      key: "public-key",
      url: "https://o0.ingest.sentry.io/api/12345/store/",
    },
  );
});

test("a DSN without a project id is ignored", () => {
  assert.equal(sentryStore("https://public-key@o0.ingest.sentry.io"), null);
});
