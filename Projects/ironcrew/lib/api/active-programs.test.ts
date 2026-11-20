import assert from "node:assert/strict";
import { test } from "node:test";

import { isActiveProgramExistsError } from "./active-programs";

test("only the active-program sentinel is treated as a conflict", () => {
  assert.equal(isActiveProgramExistsError({ message: "ACTIVE_PROGRAM_EXISTS" }), true);
  assert.equal(isActiveProgramExistsError({ message: "This program is already active" }), false);
});
