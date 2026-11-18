(function () {
  'use strict';

  // Разрыв короче 2,5 секунды не должен пугать игрока красной плашкой.
  const NOTICE_DELAY_MS = 2500;
  // Сервер удерживает место 60 секунд; оставляем запас для восстановления.
  const LOCAL_GRACE_MS = 50000;

  function canContinueRace({ room, player, textLength, pos, gaveUp, now, offlineSince }) {
    if (!room || !player || !textLength || gaveUp || pos >= textLength) return false;
    if (player.finished || player.spectator) return false;
    if (room.state !== 'racing' && room.state !== 'countdown') return false;
    if (!room.startAt || !room.endAt || now < room.startAt || now >= room.endAt) return false;
    if (offlineSince != null && now - offlineSince >= LOCAL_GRACE_MS) return false;
    return true;
  }

  // Не копим сотни Socket.IO сообщений во время обрыва. Берем только
  // последнее локальное состояние данного заезда и догоняем сервер одним пакетом.
  function unsyncedProgress({ room, player, pos, errors, raceStartAt, connected, ready }) {
    if (!connected || !ready || !room || !player) return null;
    if (room.state !== 'racing' && room.state !== 'countdown') return null;
    if (!raceStartAt || raceStartAt !== room.startAt || player.spectator || player.finished) return null;
    if (!Number.isInteger(pos) || pos < 0 || pos > room.text.length) return null;
    if (pos <= player.progress && errors <= player.errors) return null;
    return { pos, errors, startAt: raceStartAt };
  }

  const api = { NOTICE_DELAY_MS, LOCAL_GRACE_MS, canContinueRace, unsyncedProgress };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.RaceRecovery = api;
})();
