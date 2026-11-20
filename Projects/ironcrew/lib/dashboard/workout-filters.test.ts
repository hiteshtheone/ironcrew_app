import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildQuery,
  computeCounts,
  getPageItems,
  parseFilters,
  rangeLabel,
  stripWorkoutParams,
  whenRange,
} from "./workout-filters";

const bounds = { today: "2026-11-18", weekStart: "2026-11-16", weekEnd: "2026-11-22" };

test("unknown filter values fall back to the defaults", () => {
  const filters = parseFilters(new URLSearchParams("when=nope&status=nope&sort=nope&page=0"));
  assert.deepEqual(filters, { when: "all", status: "all", sort: "date_desc", page: 1 });
});

test("buildQuery keeps unrelated params and omits defaults", () => {
  const params = buildQuery(
    { when: "past", status: "finished", sort: "date_asc", page: 2 },
    "section=workouts",
  );
  assert.equal(params.get("section"), "workouts");
  assert.equal(params.get("when"), "past");
  assert.equal(params.get("status"), "finished");
  assert.equal(params.get("sort"), "date_asc");
  assert.equal(params.get("page"), "2");

  const defaults = buildQuery({ when: "all", status: "all", sort: "date_desc", page: 1 }, params);
  assert.equal(defaults.get("section"), "workouts");
  assert.equal(defaults.has("when"), false);
  assert.equal(stripWorkoutParams(params).get("section"), "workouts");
  assert.equal(stripWorkoutParams(params).has("status"), false);
});

test("date windows are inclusive around today and the current week", () => {
  assert.deepEqual(whenRange("past", bounds), { lte: "2026-11-17" });
  assert.deepEqual(whenRange("present", bounds), { gte: "2026-11-18", lte: "2026-11-18" });
  assert.deepEqual(whenRange("this_week", bounds), { gte: "2026-11-16", lte: "2026-11-22" });
  assert.deepEqual(whenRange("last_week", bounds), { gte: "2026-11-09", lte: "2026-11-15" });
  assert.deepEqual(whenRange("next_week", bounds), { gte: "2026-11-23", lte: "2026-11-29" });
});

test("status counts follow the date filter and date counts follow the status filter", () => {
  const rows = [
    { scheduledFor: "2026-11-17", status: "completed" },
    { scheduledFor: "2026-11-18", status: "scheduled" },
    { scheduledFor: "2026-11-18", status: "cancelled" },
  ];
  const counts = computeCounts(rows, { when: "present", status: "unfinished" }, bounds);
  assert.equal(counts.status.finished, 0);
  assert.equal(counts.status.unfinished, 1);
  assert.equal(counts.status.cancelled, 1);
  assert.equal(counts.when.past, 0);
  assert.equal(counts.when.present, 1);
});

test("page lists stay compact and the range label counts rows", () => {
  assert.deepEqual(getPageItems(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getPageItems(5, 20), [1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 20]);
  assert.equal(rangeLabel(1, 10, 0), "No results");
  assert.equal(rangeLabel(2, 10, 15), "Showing 11–15 of 15 results");
  assert.equal(rangeLabel(1, 10, 1), "Showing 1–1 of 1 result");
});
