import assert from "node:assert/strict";
import { test } from "node:test";

import { formatWeekday } from "./client-week";
import { groupByDate, monthView, shiftMonth } from "./calendar-month";

test("a month grid starts on Monday and covers the whole month", () => {
  // 1 November 2026 is a Sunday, so the grid opens on the previous Monday.
  const view = monthView("2026-11-10");

  assert.equal(view.monthStart, "2026-11-01");
  assert.equal(view.label, "November 2026");
  assert.equal(view.from, "2026-10-26");
  assert.equal(view.to, "2026-12-06");
  assert.equal(formatWeekday(view.from), "Mon");
  assert.equal(formatWeekday(view.to), "Sun");
  assert.equal(view.days.length % 7, 0);
  assert.equal(view.days[0].inMonth, false);
  assert.equal(view.days.find((day) => day.date === "2026-11-01")?.inMonth, true);
  assert.equal(view.days.at(-1)?.inMonth, false);
});

test("a month that already starts on Monday has no leading days", () => {
  // 1 February 2021 is a Monday and the 28th is a Sunday.
  const view = monthView("2021-02-01");

  assert.equal(view.from, "2021-02-01");
  assert.equal(view.to, "2021-02-28");
  assert.equal(view.days.length, 28);
  assert.ok(view.days.every((day) => day.inMonth));
});

test("shifting months stays on the first of the month", () => {
  assert.equal(shiftMonth("2026-11-10", 1), "2026-12-01");
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
});

test("a day keeps one entry per workout, including different statuses", () => {
  const grouped = groupByDate([
    { id: "completed", scheduledFor: "2026-11-10", status: "completed" },
    { id: "skipped", scheduledFor: "2026-11-10", status: "skipped" },
    { id: "scheduled", scheduledFor: "2026-11-10", status: "scheduled" },
    { id: "other-day", scheduledFor: "2026-11-11", status: "in_progress" },
  ]);

  const day = grouped.get("2026-11-10");
  assert.deepEqual(
    day?.map((workout) => workout.status),
    ["completed", "skipped", "scheduled"],
  );
  assert.equal(grouped.get("2026-11-11")?.length, 1);
});
