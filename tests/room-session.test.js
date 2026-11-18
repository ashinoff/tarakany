'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RECONNECT_GRACE_MS, markDisconnected, resumePlayer } = require('../room-session');

const tokens = [
  '0123456789abcdef0123456789abcdef',
  '11111111111111111111111111111111',
  '22222222222222222222222222222222',
];
const setup = () => {
  const players = new Map(tokens.map((sessionToken, i) => {
    const id = 'socket-' + (i + 1);
    return [id, { id, nick: 'Игрок ' + (i + 1), sessionToken, connected: true, progress: i * 20, errors: i }];
  }));
  return { players, hostId: 'socket-1', state: 'racing' };
};
function scheduler() {
  let seq = 0;
  const jobs = new Map();
  const schedule = (fn, delay) => {
    const id = ++seq;
    jobs.set(id, { fn, delay });
    return id;
  };
  const clear = (id) => jobs.delete(id);
  const fireAll = () => {
    for (const [id, job] of [...jobs]) {
      jobs.delete(id);
      job.fn();
    }
  };
  return { schedule, clear, fireAll, jobs };
}

test('временный обрыв третьего игрока не удаляет его и сохраняет прогресс', () => {
  const room = setup();
  const clock = scheduler();
  let expired = 0;
  assert.equal(markDisconnected(room, 'socket-3', () => expired++, { ...clock }), true);
  assert.equal(room.players.size, 3);
  assert.equal(room.players.get('socket-3').connected, false);
  assert.equal([...clock.jobs.values()][0].delay, RECONNECT_GRACE_MS);

  const restored = resumePlayer(room, 'socket-99', tokens[2], { clear: clock.clear });
  assert.equal(restored.previousId, 'socket-3');
  assert.equal(restored.player.progress, 40);
  assert.equal(restored.player.errors, 2);
  assert.equal(room.players.size, 3);
  assert.equal(room.players.has('socket-3'), false);
  assert.equal(room.players.get('socket-99').connected, true);
  clock.fireAll();
  assert.equal(expired, 0);
});

test('ведущий сохраняет роль после восстановления', () => {
  const room = setup();
  const clock = scheduler();
  markDisconnected(room, 'socket-1', () => {}, { ...clock });
  const restored = resumePlayer(room, 'new-host', tokens[0], { clear: clock.clear });
  assert.equal(restored.player.nick, 'Игрок 1');
  assert.equal(room.hostId, 'new-host');
  assert.equal(room.players.size, 3);
});

test('по истечении минуты отключенный участник удаляется', () => {
  const room = setup();
  const clock = scheduler();
  let expired = 0;
  markDisconnected(room, 'socket-2', () => {
    room.players.delete('socket-2');
    expired++;
  }, { ...clock });
  clock.fireAll();
  assert.equal(expired, 1);
  assert.equal(room.players.size, 2);
});

test('чужой и неправильный ключ не может забрать место', () => {
  const room = setup();
  assert.equal(resumePlayer(room, 'other-id', 'bad'), null);
  assert.equal(resumePlayer(room, 'other-id', 'ffffffffffffffffffffffffffffffff'), null);
  assert.equal(room.players.size, 3);
  assert.equal(room.hostId, 'socket-1');
});

test('поздний старый таймер не удаляет переподключенного игрока', () => {
  const room = setup();
  const clock = scheduler();
  let expired = false;
  markDisconnected(room, 'socket-2', () => { expired = true; }, { ...clock });
  const oldTimer = [...clock.jobs.values()][0].fn;
  resumePlayer(room, 'new-socket-2', tokens[1], { clear: clock.clear });
  oldTimer();
  assert.equal(expired, false);
  assert.equal(room.players.size, 3);
  assert.ok(room.players.has('new-socket-2'));
});
