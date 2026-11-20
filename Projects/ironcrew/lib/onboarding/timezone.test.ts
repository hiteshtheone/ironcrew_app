import assert from "node:assert/strict";
import { test } from "node:test";

import { isValidTimeZone, todayIn } from "./timezone";

test("timezones are checked and today's date is formatted for that zone", () => {
  assert.equal(isValidTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.match(todayIn("UTC"), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(todayIn("Not/AZone"), /^\d{4}-\d{2}-\d{2}$/);
});
