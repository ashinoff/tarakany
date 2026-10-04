'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const TEXTS = require('./texts');

// ---------- Настройки ----------
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');

const MAX_PLAYERS = 8;          // тараканов в одном заезде
const COUNTDOWN_MS = 3000;      // 3-2-1
const AUTOSTART_MS = 15000;     // общий (быстрый) заезд стартует сам, когда собралось 2+ игроков
const FULL_ROOM_START_MS = 4000;// ...или почти сразу, если комната заполнена
const RESULTS_MS = 12000;       // сколько показываем результаты
const TICK_MS = 100;            // шаг игрового цикла
const MAX_CPS = 25;             // быстрее 25 знаков/сек (1500 зн/мин) - явный чит
const NICK_MAX = 16;
const ROOM_NAME_MAX = 22;

const COLORS = ['#d64532', '#2f6fde', '#e3a512', '#2f9e63', '#8d4bc4', '#e2702c', '#14a0a0', '#d6457a'];

// Уровни ботов: cps - знаков в секунду, acc - точность, label - подпись.
const BOT_LEVELS = {
  easy: { cps: 2.2, acc: 0.95, label: 'Лёгкий' },        // ~130 зн/мин
  medium: { cps: 4.0, acc: 0.97, label: 'Средний' },     // ~240 зн/мин
  hard: { cps: 6.0, acc: 0.985, label: 'Сложный' },      // ~360 зн/мин
  insane: { cps: 9.0, acc: 0.995, label: 'Терминатор' }, // ~540 зн/мин
};
const BOT_NAMES = ['Шустрик', 'Тапкобой', 'Усатый', 'Прусак', 'Рыжик', 'Дусти', 'Форсаж', 'Крошка', 'Турбо', 'Жужик'];

// ---------- Рекорды (лежат в постоянном хранилище /data на Amvera) ----------
let records = [];
try {
  records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf8'));
  if (!Array.isArray(records)) records = [];
} catch {
  records = [];
}

let saveTimer = null;
function saveRecords() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdir(DATA_DIR, { recursive: true }, (err) => {
      if (err) return console.error('Не удалось создать папку данных:', err.message);
      const tmp = RECORDS_FILE + '.tmp';
      fs.writeFile(tmp, JSON.stringify(records), (e) => {
        if (e) return console.error('Не удалось сохранить рекорды:', e.message);
        fs.rename(tmp, RECORDS_FILE, () => {});
      });
    });
  }, 1000);
}

function submitRecord(nick, cpm, acc) {
  const key = nick.toLowerCase();
  const existing = records.find((r) => r.key === key);
  if (existing && existing.cpm >= cpm) return false;
  if (existing) Object.assign(existing, { nick, cpm, acc, at: Date.now() });
  else records.push({ key, nick, cpm, acc, at: Date.now() });
  records.sort((a, b) => b.cpm - a.cpm);
  records = records.slice(0, 100);
  saveRecords();
  return true;
}

const topRecords = () => records.slice(0, 10).map(({ nick, cpm, acc }) => ({ nick, cpm, acc }));

// ---------- HTTP ----------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.send('ok'));
app.get('/api/records', (req, res) => res.json(topRecords()));

const server = http.createServer(app);
const io = new Server(server);

// ---------- Комнаты ----------
const rooms = new Map();
let quickSeq = 0;
let lobbyDirty = true; // нужно разослать свежий список открытых комнат

function genCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// auto - быстрый общий заезд (автостарт по таймеру); isPrivate - скрыт из списка (только по коду)
function createRoom(code, opts = {}) {
  const isPrivate = Boolean(opts.isPrivate);
  const auto = Boolean(opts.auto);
  const name = opts.name || (auto ? `Общий заезд ${++quickSeq}` : isPrivate ? `Комната ${code}` : `Комната ${code}`);
  const room = {
    code,
    name,
    auto,
    isPrivate,
    state: 'waiting', // waiting -> countdown -> racing -> finished -> waiting
    players: new Map(),
    hostId: null,
    text: '',
    textIndex: -1,
    startAt: 0,
    endAt: 0,
    autoStartAt: 0,
    resetAt: 0,
    finishCount: 0,
    botSeq: 0,
    dirty: true,
  };
  rooms.set(code, room);
  lobbyDirty = true;
  return room;
}

function findPublicRoom() {
  for (const room of rooms.values()) {
    if (room.auto && !room.isPrivate && room.state === 'waiting' && room.players.size < MAX_PLAYERS) return room;
  }
  return createRoom(genCode(), { auto: true });
}

function pickText(room) {
  let i;
  do {
    i = Math.floor(Math.random() * TEXTS.length);
  } while (TEXTS.length > 1 && i === room.textIndex);
  room.textIndex = i;
  return TEXTS[i];
}

function cleanNick(raw) {
  return String(raw || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICK_MAX);
}

function cleanRoomName(raw) {
  return String(raw || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ROOM_NAME_MAX);
}

function uniqueNick(room, nick) {
  const taken = new Set([...room.players.values()].map((p) => p.nick.toLowerCase()));
  if (!taken.has(nick.toLowerCase())) return nick;
  for (let i = 2; ; i++) {
    const candidate = `${nick.slice(0, NICK_MAX - 3)} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function freeColor(room) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[room.players.size % COLORS.length];
}

function botName(room) {
  const taken = new Set([...room.players.values()].map((p) => p.nick.toLowerCase()));
  const free = BOT_NAMES.filter((n) => !taken.has(('бот ' + n).toLowerCase()));
  const pool = free.length ? free : BOT_NAMES;
  return 'Бот ' + pool[Math.floor(Math.random() * pool.length)];
}

const racers = (room) => [...room.players.values()].filter((p) => !p.spectator);
const humans = (room) => [...room.players.values()].filter((p) => !p.bot);

function resetPlayer(p) {
  Object.assign(p, { progress: 0, errors: 0, finishedAt: 0, place: 0, cpm: 0, acc: 100, time: 0, dnf: false, exact: 0 });
}

function updateAutoStart(room) {
  if (room.state !== 'waiting' || !room.auto) {
    room.autoStartAt = 0;
    return;
  }
  const now = Date.now();
  if (room.players.size < 2) room.autoStartAt = 0;
  else if (!room.autoStartAt) room.autoStartAt = now + AUTOSTART_MS;
  if (room.players.size >= MAX_PLAYERS) room.autoStartAt = Math.min(room.autoStartAt || Infinity, now + FULL_ROOM_START_MS);
  room.dirty = true;
}

function startCountdown(room) {
  if (room.state !== 'waiting' || room.players.size === 0) return;
  room.state = 'countdown';
  room.text = pickText(room);
  room.startAt = Date.now() + COUNTDOWN_MS;
  // лимит времени: щедрые 0.8 с на знак, но не меньше минуты
  room.endAt = room.startAt + Math.max(60000, room.text.length * 800);
  room.autoStartAt = 0;
  room.finishCount = 0;
  for (const p of room.players.values()) {
    p.spectator = false;
    resetPlayer(p);
  }
  room.dirty = true;
  lobbyDirty = true;
}

function finishRace(room) {
  const now = Date.now();
  room.state = 'finished';
  room.resetAt = now + RESULTS_MS;
  const minutes = Math.max(1 / 60, (Math.min(now, room.endAt) - room.startAt) / 60000);
  const unfinished = racers(room)
    .filter((p) => !p.finishedAt)
    .sort((a, b) => b.progress - a.progress);
  for (const p of unfinished) {
    p.dnf = true;
    p.place = ++room.finishCount;
    p.cpm = Math.round(p.progress / minutes);
    p.acc = p.progress ? Math.round((1000 * p.progress) / (p.progress + p.errors)) / 10 : 0;
  }
  room.dirty = true;
  lobbyDirty = true;
}

function resetRoom(room) {
  room.state = 'waiting';
  room.text = '';
  room.startAt = 0;
  room.endAt = 0;
  room.resetAt = 0;
  for (const p of room.players.values()) {
    p.spectator = false;
    p.ready = Boolean(p.bot); // боты всегда готовы, людям жать заново
    resetPlayer(p);
  }
  updateAutoStart(room);
  room.dirty = true;
  lobbyDirty = true;
}

// Боты бегут сами: подкручиваем прогресс исходя из их скорости и лёгкого колебания.
function advanceBots(room, now) {
  if (room.state !== 'racing') return;
  const dt = TICK_MS / 1000;
  for (const p of room.players.values()) {
    if (!p.bot || p.spectator || p.finishedAt) continue;
    const wob = 0.75 + 0.5 * Math.abs(Math.sin(now / 600 + p.wobblePhase));
    p.exact += p.cps * dt * wob;
    const pos = Math.min(room.text.length, Math.floor(p.exact));
    if (pos > p.progress) {
      p.progress = pos;
      room.dirty = true;
    }
    if (p.progress >= room.text.length && !p.finishedAt) {
      p.finishedAt = now;
      p.place = ++room.finishCount;
      p.time = now - room.startAt;
      p.cpm = Math.round(p.progress / (p.time / 60000));
      p.errors = Math.round((p.progress * (1 - p.accTarget)) / p.accTarget);
      p.acc = Math.round((1000 * p.progress) / (p.progress + p.errors)) / 10;
      room.dirty = true;
    }
  }
}

function roomState(room) {
  return {
    code: room.code,
    name: room.name,
    auto: room.auto,
    isPrivate: room.isPrivate,
    state: room.state,
    hostId: room.hostId,
    text: room.state === 'waiting' ? '' : room.text,
    startAt: room.startAt,
    endAt: room.endAt,
    autoStartAt: room.autoStartAt,
    resetAt: room.resetAt,
    maxPlayers: MAX_PLAYERS,
    serverNow: Date.now(),
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      nick: p.nick,
      color: p.color,
      bot: Boolean(p.bot),
      level: p.bot ? p.level : undefined,
      ready: Boolean(p.ready),
      progress: p.progress,
      errors: p.errors,
      finished: Boolean(p.finishedAt),
      dnf: p.dnf,
      place: p.place,
      cpm: p.cpm,
      acc: p.acc,
      time: p.time,
      spectator: p.spectator,
    })),
  };
}

function publicRooms() {
  return [...rooms.values()]
    .filter((r) => !r.isPrivate)
    .map((r) => ({ code: r.code, name: r.name, count: r.players.size, max: MAX_PLAYERS, state: r.state }))
    .sort((a, b) => (a.state === 'waiting' ? 0 : 1) - (b.state === 'waiting' ? 0 : 1) || b.count - a.count);
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  socket.data.roomCode = null;
  socket.leave(code);
  const room = rooms.get(code);
  if (!room) return;
  room.players.delete(socket.id);
  // если людей не осталось - комнату (вместе с ботами) закрываем
  if (humans(room).length === 0) {
    rooms.delete(code);
    lobbyDirty = true;
    return;
  }
  if (room.hostId === socket.id) room.hostId = humans(room)[0].id;
  updateAutoStart(room);
  room.dirty = true;
  lobbyDirty = true;
}

// ---------- Сокеты ----------
io.on('connection', (socket) => {
  socket.emit('records', topRecords());
  socket.emit('rooms', publicRooms());

  socket.on('rooms', () => socket.emit('rooms', publicRooms()));

  socket.on('join', (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    data = data || {};
    leaveRoom(socket);

    const nick = cleanNick(data.nick);
    if (!nick) return reply({ error: 'Введите ник: от 1 до 16 символов.' });

    let room;
    if (data.mode === 'create') {
      const name = cleanRoomName(data.name) || `Комната ${nick}`;
      room = createRoom(genCode(), { isPrivate: false, auto: false, name });
    } else if (data.mode === 'code') {
      const code = String(data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 3 || code.length > 8) {
        return reply({ error: 'Код комнаты: от 3 до 8 латинских букв или цифр.' });
      }
      room = rooms.get(code) || createRoom(code, { isPrivate: true, auto: false });
    } else {
      room = findPublicRoom();
    }

    if (room.players.size >= MAX_PLAYERS) {
      return reply({ error: `В этой комнате уже ${MAX_PLAYERS} тараканов. Создайте свою или зайдите в общий заезд.` });
    }

    const player = {
      id: socket.id,
      nick: uniqueNick(room, nick),
      color: freeColor(room),
      bot: false,
      ready: false,
      spectator: room.state !== 'waiting', // пришёл посреди заезда - бежит в следующем
    };
    resetPlayer(player);
    room.players.set(socket.id, player);
    if (!room.hostId) room.hostId = socket.id;

    socket.data.roomCode = room.code;
    socket.join(room.code);
    updateAutoStart(room);
    room.dirty = true;
    lobbyDirty = true;

    reply({ ok: true, you: socket.id, code: room.code, name: room.name, nick: player.nick, isPrivate: room.isPrivate, auto: room.auto });
    socket.emit('state', roomState(room));
  });

  socket.on('ready', (data) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.state !== 'waiting') return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.ready = data && data.ready !== undefined ? Boolean(data.ready) : !p.ready;
    room.dirty = true;
  });

  socket.on('start', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    startCountdown(room);
  });

  socket.on('kick', (data) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    const id = data && data.id;
    if (!id || id === socket.id) return;
    const p = room.players.get(id);
    if (!p) return;
    if (p.bot) {
      room.players.delete(id);
      updateAutoStart(room);
      room.dirty = true;
      lobbyDirty = true;
    } else {
      const s = io.sockets.sockets.get(id);
      if (s) {
        s.emit('kicked');
        leaveRoom(s);
      } else {
        room.players.delete(id);
        if (humans(room).length === 0) rooms.delete(room.code);
        else room.dirty = true;
        lobbyDirty = true;
      }
    }
  });

  socket.on('addBot', (data) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.state !== 'waiting') return;
    if (room.players.size >= MAX_PLAYERS) return;
    const level = data && BOT_LEVELS[data.level] ? data.level : 'medium';
    const cfg = BOT_LEVELS[level];
    const id = 'bot:' + room.code + ':' + (++room.botSeq);
    const bot = {
      id,
      nick: uniqueNick(room, botName(room)),
      color: freeColor(room),
      bot: true,
      level,
      cps: cfg.cps,
      accTarget: cfg.acc,
      wobblePhase: Math.random() * 6,
      ready: true,
      spectator: false,
    };
    resetPlayer(bot);
    room.players.set(id, bot);
    updateAutoStart(room);
    room.dirty = true;
    lobbyDirty = true;
  });

  socket.on('removeBot', (data) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    const id = data && data.id;
    const p = id && room.players.get(id);
    if (p && p.bot) {
      room.players.delete(id);
      updateAutoStart(room);
      room.dirty = true;
      lobbyDirty = true;
    }
  });

  socket.on('progress', (data) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !data) return;
    const now = Date.now();
    // игровой цикл мог ещё не переключить состояние - стартуем по времени
    if (room.state === 'countdown' && now >= room.startAt) {
      room.state = 'racing';
      room.dirty = true;
    }
    if (room.state !== 'racing') return;

    const p = room.players.get(socket.id);
    if (!p || p.spectator || p.finishedAt) return;

    const pos = Math.floor(Number(data.pos));
    const errors = Math.max(0, Math.min(10000, Math.floor(Number(data.errors)) || 0));
    p.errors = Math.max(p.errors, errors);

    if (!Number.isFinite(pos) || pos <= p.progress || pos > room.text.length) return;
    const elapsedSec = (now - room.startAt) / 1000;
    if (pos > elapsedSec * MAX_CPS + 5) return; // слишком быстро для человека

    p.progress = pos;
    if (pos === room.text.length) {
      p.finishedAt = now;
      p.place = ++room.finishCount;
      p.time = now - room.startAt;
      p.cpm = Math.round(pos / (p.time / 60000));
      p.acc = Math.round((1000 * pos) / (pos + p.errors)) / 10;
      if (submitRecord(p.nick, p.cpm, p.acc)) io.emit('records', topRecords());
    }
    room.dirty = true;
  });

  socket.on('leave', () => {
    leaveRoom(socket);
    socket.emit('rooms', publicRooms());
  });
  socket.on('disconnect', () => leaveRoom(socket));
});

// ---------- Игровой цикл ----------
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.state === 'waiting' && room.autoStartAt && now >= room.autoStartAt) {
      startCountdown(room);
    } else if (room.state === 'countdown' && now >= room.startAt) {
      room.state = 'racing';
      room.dirty = true;
      lobbyDirty = true;
    } else if (room.state === 'racing') {
      advanceBots(room, now);
      const rs = racers(room);
      if (rs.length === 0 || rs.every((p) => p.finishedAt) || now >= room.endAt) finishRace(room);
    } else if (room.state === 'finished' && now >= room.resetAt) {
      resetRoom(room);
    }

    if (room.dirty) {
      room.dirty = false;
      io.to(room.code).emit('state', roomState(room));
    }
  }

  if (lobbyDirty) {
    lobbyDirty = false;
    io.emit('rooms', publicRooms());
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`Тараканьи бега запущены на порту ${PORT}`);
});
