import assert from "node:assert/strict";
import { test } from "node:test";

import { bodyPartFromText, bodyPartsFromList, isMuscle, muscleFromText, muscleLabel, musclesFromList } from "./muscle-group";

test("muscle and body-part text accepts slugs and labels", () => {
  assert.equal(isMuscle("chest"), true);
  assert.equal(isMuscle("Chest"), false);
  assert.equal(muscleFromText("Lower Back"), "lower_back");
  assert.equal(bodyPartFromText("Core and Midsections"), "core_and_midsections");
  assert.equal(muscleFromText("not a muscle"), null);
  assert.equal(muscleLabel("lats"), "Lats");
  assert.equal(muscleLabel("custom"), "custom");
});

test("lists drop blanks and repeats, including a postgres array string", () => {
  assert.deepEqual(musclesFromList(["chest", "chest", "nope", "lats"]), ["chest", "lats"]);
  assert.deepEqual(musclesFromList("{chest,lats}"), ["chest", "lats"]);
  assert.deepEqual(bodyPartsFromList("upper_body"), ["upper_body"]);
});
