const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isIsoDate,
  shiftIsoDate,
  createPendingAction,
  buildNotionUpdateForAction,
} = require('../src/botActions');

const config = {
  notionDueProp: 'Due',
  notionDoneCheckboxProp: 'done',
};

test('isIsoDate validates YYYY-MM-DD', () => {
  assert.equal(isIsoDate('2026-02-27'), true);
  assert.equal(isIsoDate('2026-2-27'), false);
  assert.equal(isIsoDate('02-27-2026'), false);
});

test('shiftIsoDate shifts by whole days', () => {
  assert.equal(shiftIsoDate('2026-02-27', 1), '2026-02-28');
  assert.equal(shiftIsoDate('2026-02-27', 7), '2026-03-06');
});

test('createPendingAction sets expiration', () => {
  const pending = createPendingAction({
    action: 'done',
    taskId: 'task_1',
    userId: 'user_1',
    details: {},
    ttlMinutes: 30,
  });

  assert.equal(pending.action, 'done');
  assert.equal(pending.taskId, 'task_1');
  assert.equal(pending.userId, 'user_1');
  assert.ok(pending.expiresAt > pending.createdAt);
});

test('buildNotionUpdateForAction handles done', () => {
  const update = buildNotionUpdateForAction({
    action: 'done',
    task: { id: 'abc', title: 'Task A', dueIso: '2026-02-27' },
    details: {},
    config,
  });

  assert.deepEqual(update.properties, { done: { checkbox: true } });
});

test('buildNotionUpdateForAction handles reschedule', () => {
  const update = buildNotionUpdateForAction({
    action: 'reschedule',
    task: { id: 'abc', title: 'Task A', dueIso: '2026-02-27' },
    details: { targetDate: '2026-03-02' },
    config,
  });

  assert.deepEqual(update.properties, { Due: { date: { start: '2026-03-02' } } });
});

test('buildNotionUpdateForAction handles defer', () => {
  const update = buildNotionUpdateForAction({
    action: 'defer',
    task: { id: 'abc', title: 'Task A', dueIso: '2026-02-27' },
    details: { days: 3 },
    config,
  });

  assert.deepEqual(update.properties, { Due: { date: { start: '2026-03-02' } } });
});
