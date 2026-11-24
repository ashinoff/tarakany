'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { NOTICE_DELAY_MS, LOCAL_GRACE_MS, canContinueRace, unsyncedProgress } = require('../public/races/race-recovery');

const room = { state: 'racing', startAt: 1000, endAt: 100000, text: 'т'.repeat(180) };
const player = { spectator: false, finished: false, progress: 30, errors: 1 };
const input = { room, player, textLength: 180, pos: 70, gaveUp: false, now: 16000, offlineSince: 14000 };
const sync = { room, player, pos: 70, errors: 2, raceStartAt: 1000, connected: true, ready: true };

test('локальный ввод не останавливается при кратком обрыве', () => {
  assert.equal(canContinueRace(input), true);
  assert.equal(NOTICE_DELAY_MS, 2500);
  assert.equal(LOCAL_GRACE_MS, 50000);
});

test('ввод закрывается после окончания гонки или истечения резерва', () => {
  assert.equal(canContinueRace({ ...input, now: room.endAt }), false);
  assert.equal(canContinueRace({ ...input, now: 70000, offlineSince: 19000 }), false);
  assert.equal(canContinueRace({ ...input, player: { ...player, spectator: true } }), false);
  assert.equal(canContinueRace({ ...input, player: { ...player, finished: true } }), false);
  assert.equal(canContinueRace({ ...input, pos: 180 }), false);
});

test('во время отсчета печатать можно только после старта', () => {
  assert.equal(canContinueRace({ ...input, room: { ...room, state: 'countdown' }, now: 1200 }), true);
  assert.equal(canContinueRace({ ...input, room: { ...room, state: 'countdown' }, now: 900 }), false);
});

test('при восстановлении отправляем последнее положение и ошибки', () => {
  assert.deepEqual(unsyncedProgress(sync), { pos: 70, errors: 2, startAt: 1000 });
  assert.equal(unsyncedProgress({ ...sync, connected: false }), null);
  assert.equal(unsyncedProgress({ ...sync, ready: false }), null);
});

test('не отправляем чужой или уже подтвержденный прогресс', () => {
  assert.equal(unsyncedProgress({ ...sync, raceStartAt: 700 }), null);
  assert.equal(unsyncedProgress({ ...sync, player: { ...player, progress: 70, errors: 2 } }), null);
  assert.equal(unsyncedProgress({ ...sync, player: { ...player, spectator: true } }), null);
  assert.equal(unsyncedProgress({ ...sync, room: { ...room, state: 'finished' } }), null);
});
