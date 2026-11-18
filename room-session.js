'use strict';

// Краткий обрыв WebSocket не должен удалять игрока, его прогресс и право запуска.
// Сессионный ключ принадлежит вкладке браузера и не передается другим игрокам.
const RECONNECT_GRACE_MS = 60_000;
const VALID_TOKEN = /^[a-f0-9]{32}$/;

function cancelDisconnect(player, clear = clearTimeout) {
  if (player && player.disconnectTimer != null) {
    clear(player.disconnectTimer);
    player.disconnectTimer = null;
  }
}

function markDisconnected(room, socketId, expire, {
  schedule = setTimeout,
  clear = clearTimeout,
  graceMs = RECONNECT_GRACE_MS,
} = {}) {
  const player = room.players.get(socketId);
  if (!player) return false;
  cancelDisconnect(player, clear);
  player.connected = false;
  player.disconnectTimer = schedule(() => {
    player.disconnectTimer = null;
    // При восстановлении игрок получает другой socket.id. Старый таймер
    // не должен удалить уже вернувшегося участника.
    if (room.players.get(socketId) === player && !player.connected) expire();
  }, graceMs);
  return true;
}

function resumePlayer(room, socketId, token, { clear = clearTimeout } = {}) {
  if (typeof token !== 'string' || !VALID_TOKEN.test(token)) return null;
  for (const [oldId, player] of room.players) {
    if (player.sessionToken !== token) continue;
    cancelDisconnect(player, clear);
    if (oldId !== socketId) {
      room.players.delete(oldId);
      room.players.set(socketId, player);
      if (room.hostId === oldId) room.hostId = socketId;
    }
    player.id = socketId;
    player.connected = true;
    return { player, previousId: oldId };
  }
  return null;
}

module.exports = { RECONNECT_GRACE_MS, VALID_TOKEN, cancelDisconnect, markDisconnected, resumePlayer };
