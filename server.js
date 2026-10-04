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
const AUTOSTART_MS = 15000;     // общий заезд стартует сам, когда собралось 2+ игроков
const FULL_ROOM_START_MS = 4000;// ...или почти сразу, если комната заполнена
const RESULTS_MS = 12000;       // сколько показываем результаты
const TICK_MS = 100;            // шаг игрового цикла
const MAX_CPS = 25;             // быстрее 25 знаков/сек (1500 зн/мин) - явный чит
const NICK_MAX = 16;

const COLORS = ['#d64532', '#2f6fde', '#e3a512', '#2f9e63', '#8d4bc4', '#e2702c', '#14a0a0', '#d6457a'];

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

function genCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom(code, isPrivate) {
  const room = {
    code,
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
    dirty: true,
  };
  rooms.set(code, room);
  return room;
}

function findPublicRoom() {
  for (const room of rooms.values()) {
    if (!room.isPrivate && room.state === 'waiting' && room.players.size < MAX_PLAYERS) return room;
  }
  return createRoom(genCode(), false);
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
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICK_MAX);
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

const racers = (room) => [...room.players.values()].filter((p) => !p.spectator);

function resetPlayer(p) {
  Object.assign(p, { progress: 0, errors: 0, finishedAt: 0, place: 0, cpm: 0, acc: 100, time: 0, dnf: false });
}

function updateAutoStart(room) {
  if (room.state !== 'waiting' || room.isPrivate) {
    room.autoStartAt = 0;
    return;
  }
  const now = Date.now();
  if (room.players.size < 2) room.autoStartAt = 0;
  else if (!room.autoStartAt) room.autoStartAt = now + AUTOSTART_MS;
  if (room.players.size >= MAX_PLAYERS) room.autoStartAt = Math.min(room.autoStartAt, now + FULL_ROOM_START_MS);
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
}

function resetRoom(room) {
  room.state = 'waiting';
  room.text = '';
  room.startAt = 0;
  room.endAt = 0;
  room.resetAt = 0;
  for (const p of room.players.values()) {
    p.spectator = false;
    resetPlayer(p);
  }
  updateAutoStart(room);
  room.dirty = true;
}

function roomState(room) {
  return {
    code: room.code,
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

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  socket.data.roomCode = null;
  socket.leave(code);
  const room = rooms.get(code);
  if (!room) return;
  room.players.delete(socket.id);
  if (room.players.size === 0) {
    rooms.delete(code);
    return;
  }
  if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
  updateAutoStart(room);
  room.dirty = true;
}

// ---------- Сокеты ----------
io.on('connection', (socket) => {
  socket.emit('records', topRecords());

  socket.on('join', (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    data = data || {};
    leaveRoom(socket);

    const nick = cleanNick(data.nick);
    if (!nick) return reply({ error: 'Введите ник: от 1 до 16 символов.' });

    let room;
    if (data.mode === 'create') {
      room = createRoom(genCode(), true);
    } else if (data.mode === 'code') {
      const code = String(data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 3 || code.length > 8) {
        return reply({ error: 'Код комнаты: от 3 до 8 латинских букв или цифр.' });
      }
      room = rooms.get(code) || createRoom(code, true);
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
      spectator: room.state !== 'waiting', // пришёл посреди заезда - бежит в следующем
    };
    resetPlayer(player);
    room.players.set(socket.id, player);
    if (!room.hostId) room.hostId = socket.id;

    socket.data.roomCode = room.code;
    socket.join(room.code);
    updateAutoStart(room);
    room.dirty = true;

    reply({ ok: true, you: socket.id, code: room.code, nick: player.nick, isPrivate: room.isPrivate });
    socket.emit('state', roomState(room));
  });

  socket.on('start', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    startCountdown(room);
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

  socket.on('leave', () => leaveRoom(socket));
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
    } else if (room.state === 'racing') {
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
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`Тараканьи бега запущены на порту ${PORT}`);
});
