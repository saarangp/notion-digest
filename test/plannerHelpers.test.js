const test = require("node:test");
const assert = require("node:assert/strict");

const {
  pickFutureLoadRisks,
  buildPlanningCandidates,
  buildProjectPlans,
  buildProjectBlocks,
  buildOneOffProjectPlan,
  buildDeterministicMorningDecisionIds,
  computeFreeSlots,
  reserveFocusBuffer,
} = require("../src/digestService");

test("pickFutureLoadRisks keeps only future-load risk tasks", () => {
  const ranked = [
    { id: "a", isFutureLoadRisk: true, dueInDays: 6, requiredDailyMinutes: 90, score: 0.5 },
    { id: "b", isFutureLoadRisk: false, dueInDays: 2, requiredDailyMinutes: 30, score: 0.9 },
    { id: "c", isFutureLoadRisk: true, dueInDays: 4, requiredDailyMinutes: 75, score: 0.4 },
  ];

  const risks = pickFutureLoadRisks(ranked);
  assert.equal(risks.length, 2);
  assert.equal(risks[0].id, "c");
  assert.equal(risks[1].id, "a");
});

test("buildPlanningCandidates includes future-pressure later tasks", () => {
  const ranked = [
    {
      id: "overdue",
      bucket: "overdue",
      isFutureLoadRisk: false,
      dueInDays: -1,
      requiredDailyMinutes: 40,
      priority: "p2",
      dueIso: "2026-03-08",
    },
    {
      id: "later-risk",
      bucket: "later",
      isFutureLoadRisk: true,
      dueInDays: 8,
      requiredDailyMinutes: 80,
      priority: "p1",
      dueIso: "2026-03-17",
    },
    {
      id: "later-normal",
      bucket: "later",
      isFutureLoadRisk: false,
      dueInDays: 9,
      requiredDailyMinutes: 20,
      priority: "p1",
      dueIso: "2026-03-18",
    },
  ];

  const candidates = buildPlanningCandidates(ranked);
  assert.equal(candidates.some((task) => task.id === "later-risk"), true);
  assert.equal(candidates.some((task) => task.id === "later-normal"), false);
  assert.equal(candidates[0].id, "overdue");
});

test("buildPlanningCandidates boosts heavy near-term p0 tasks", () => {
  const ranked = [
    {
      id: "heavy-p0",
      bucket: "due_soon",
      isFutureLoadRisk: false,
      dueInDays: 2,
      requiredDailyMinutes: 210,
      priority: "p0",
      dueIso: "2026-03-11",
    },
    {
      id: "light-p1",
      bucket: "due_soon",
      isFutureLoadRisk: false,
      dueInDays: 2,
      requiredDailyMinutes: 45,
      priority: "p1",
      dueIso: "2026-03-11",
    },
  ];

  const candidates = buildPlanningCandidates(ranked);
  assert.equal(candidates[0].id, "heavy-p0");
});

test("computeFreeSlots and reserveFocusBuffer produce usable slots", () => {
  const workWindow = {
    start: new Date("2026-03-09T09:00:00.000Z"),
    end: new Date("2026-03-09T18:00:00.000Z"),
  };

  const events = [
    {
      start: { dateTime: "2026-03-09T10:00:00.000Z" },
      end: { dateTime: "2026-03-09T11:00:00.000Z" },
    },
    {
      start: { dateTime: "2026-03-09T13:00:00.000Z" },
      end: { dateTime: "2026-03-09T14:00:00.000Z" },
    },
  ];

  const slots = computeFreeSlots(events, workWindow, 30);
  assert.deepEqual(slots.map((slot) => slot.minutes), [60, 120, 240]);

  const buffered = reserveFocusBuffer(slots, 60, 30);
  assert.deepEqual(buffered.map((slot) => slot.minutes), [60, 120, 180]);
});

test("computeFreeSlots excludes lunch window", () => {
  const workWindow = {
    // 09:00-16:00 America/Los_Angeles on 2026-03-09 (UTC-7)
    start: new Date("2026-03-09T16:00:00.000Z"),
    end: new Date("2026-03-09T23:00:00.000Z"),
  };

  const slots = computeFreeSlots([], workWindow, 30);
  // Lunch is 12:00-13:00 local => 19:00-20:00 UTC on this date.
  assert.deepEqual(slots.map((slot) => slot.minutes), [180, 180]);
  assert.equal(slots[0].start.toISOString(), "2026-03-09T16:00:00.000Z");
  assert.equal(slots[0].end.toISOString(), "2026-03-09T19:00:00.000Z");
  assert.equal(slots[1].start.toISOString(), "2026-03-09T20:00:00.000Z");
  assert.equal(slots[1].end.toISOString(), "2026-03-09T23:00:00.000Z");
});

test("buildProjectPlans groups tasks and computes triage-minute demand", () => {
  const tasks = [
    {
      id: "a",
      project: "Alpha",
      planningScore: 1.1,
      bucket: "due_today",
      dueIso: "2026-03-09",
      title: "A1",
    },
    {
      id: "b",
      project: "Alpha",
      planningScore: 0.5,
      bucket: "due_soon",
      dueIso: "2026-03-10",
      title: "A2",
    },
    {
      id: "c",
      project: "Beta",
      planningScore: 1.0,
      bucket: "overdue",
      dueIso: "2026-03-08",
      title: "B1",
    },
  ];

  const projects = buildProjectPlans(tasks);
  assert.equal(projects.length, 2);
  assert.equal(projects[0].project, "Alpha");
  assert.equal(projects[0].demandMinutes, 150);
  assert.equal(projects[1].project, "Beta");
  assert.equal(projects[1].demandMinutes, 90);
});

test("buildProjectBlocks fills long slots with grouped project blocks", () => {
  const slots = [
    {
      index: 0,
      start: new Date("2026-03-09T11:00:00.000Z"),
      end: new Date("2026-03-09T17:00:00.000Z"),
      minutes: 360,
    },
  ];

  const projects = [
    {
      project: "Alpha",
      projectKey: "alpha",
      demandMinutes: 210,
      tasks: [
        { task: { title: "A1" }, remainingMinutes: 120 },
        { task: { title: "A2" }, remainingMinutes: 90 },
      ],
    },
    {
      project: "Beta",
      projectKey: "beta",
      demandMinutes: 120,
      tasks: [{ task: { title: "B1" }, remainingMinutes: 120 }],
    },
  ];

  const blocks = buildProjectBlocks({
    slots,
    projects,
    maxBlocks: 5,
    minBlockMinutes: 30,
  });

  assert.equal(blocks.length, 2);
  assert.deepEqual(
    blocks.map((block) => block.minutes),
    [210, 120],
  );
  assert.equal(blocks[0].project, "Alpha");
  assert.equal(blocks[1].project, "Beta");
  assert.equal(blocks[0].start.toISOString(), "2026-03-09T11:00:00.000Z");
  assert.equal(blocks[1].end.toISOString(), "2026-03-09T16:30:00.000Z");
});

test("buildDeterministicMorningDecisionIds prioritizes must and picks safe moves", () => {
  const ranked = [
    { id: "a", bucket: "overdue", score: 1.2, dueInDays: -1, title: "A" },
    { id: "b", bucket: "due_today", score: 1.1, dueInDays: 0, title: "B" },
    { id: "c", bucket: "due_soon", score: 0.6, dueInDays: 2, title: "C" },
    { id: "d", bucket: "later", score: 0.2, dueInDays: 6, title: "D" },
    { id: "e", bucket: "later", score: 0.3, dueInDays: 5, title: "E" },
  ];
  const capacity = {
    available: true,
    status: "constrained_day",
    freeMinutes: 90,
    requiredMinutes: 180,
  };

  const decisions = buildDeterministicMorningDecisionIds({ ranked, capacity });
  assert.deepEqual(decisions.mustIds, ["a", "b"]);
  assert.deepEqual(decisions.moveIds, ["d", "e"]);
  assert.equal(decisions.startNowId, "a");
});

test("buildOneOffProjectPlan reserves urgent one-off tasks outside dominant projects", () => {
  const tasks = [
    {
      id: "a1",
      title: "Alpha deep work",
      project: "Alpha",
      bucket: "due_today",
      score: 1.2,
      planningScore: 1.1,
      dueIso: "2026-03-09",
    },
    {
      id: "b1",
      title: "Beta quick one-off",
      project: "Beta",
      bucket: "due_today",
      score: 1.0,
      planningScore: 0.9,
      dueIso: "2026-03-09",
    },
    {
      id: "c1",
      title: "Gamma one-off",
      project: "Gamma",
      bucket: "overdue",
      score: 1.3,
      planningScore: 1.0,
      dueIso: "2026-03-08",
    },
  ];

  const orderedProjects = [
    { projectKey: "alpha", project: "Alpha", demandMinutes: 240, tasks: [] },
    { projectKey: "delta", project: "Delta", demandMinutes: 120, tasks: [] },
  ];

  const oneOffPlan = buildOneOffProjectPlan({
    tasks,
    orderedProjects,
    totalSlotMinutes: 300,
  });

  assert.ok(oneOffPlan);
  assert.equal(oneOffPlan.projectKey, "__one_off__");
  assert.equal(oneOffPlan.project, "One-offs");
  assert.equal(oneOffPlan.demandMinutes >= 60, true);
  assert.deepEqual(
    oneOffPlan.tasks.map((item) => item.task.id).sort(),
    ["b1", "c1"],
  );
});
