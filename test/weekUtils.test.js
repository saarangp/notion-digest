const test = require("node:test");
const assert = require("node:assert/strict");
const { endOfWeekIso, isUpcomingThisWeek } = require("../src/shared/weekUtils.cjs");

test("endOfWeekIso returns the current local week Sunday", () => {
  assert.equal(endOfWeekIso("2026-05-13"), "2026-05-17");
  assert.equal(endOfWeekIso("2026-05-17"), "2026-05-17");
});

test("isUpcomingThisWeek includes later days in the current week only", () => {
  assert.equal(isUpcomingThisWeek("2026-05-13", "2026-05-13"), false);
  assert.equal(isUpcomingThisWeek("2026-05-14", "2026-05-13"), true);
  assert.equal(isUpcomingThisWeek("2026-05-17", "2026-05-13"), true);
  assert.equal(isUpcomingThisWeek("2026-05-18", "2026-05-13"), false);
  assert.equal(isUpcomingThisWeek(null, "2026-05-13"), false);
});
