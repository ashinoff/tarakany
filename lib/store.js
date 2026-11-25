'use strict';

// Хранилище «Развития». С DATABASE_URL — Postgres (схема razvitie): пользователи
// платформы, все результаты заездов, рекорды; монетки — поле users.coins (появятся
// с тестами и задачами). Без базы (локально) — как раньше: рекорды в DATA_DIR/records.json,
// пользователи только в памяти.

const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS razvitie;
CREATE TABLE IF NOT EXISTS razvitie.users (
  id            serial PRIMARY KEY,
  sub           text NOT NULL UNIQUE,
  full_name     text NOT NULL DEFAULT '',
  nick          text NOT NULL DEFAULT '',
  email         text,
  coins         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS razvitie.race_results (
  id          bigserial PRIMARY KEY,
  user_id     integer REFERENCES razvitie.users(id) ON DELETE SET NULL,
  nick        text NOT NULL,
  cpm         integer NOT NULL,
  acc         numeric(5,1) NOT NULL,
  time_ms     integer,
  chars       integer,
  place       integer,
  racers      integer,
  room        text,
  legacy      boolean NOT NULL DEFAULT false,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS race_results_user ON razvitie.race_results(user_id, at DESC);
CREATE INDEX IF NOT EXISTS race_results_cpm ON razvitie.race_results(cpm DESC);
ALTER TABLE razvitie.users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
-- Журнал монеток: каждое начисление/списание с причиной и автором (админка, тесты, задачи)
CREATE TABLE IF NOT EXISTS razvitie.coin_log (
  id        bigserial PRIMARY KEY,
  user_id   integer NOT NULL REFERENCES razvitie.users(id) ON DELETE CASCADE,
  delta     integer NOT NULL,
  reason    text NOT NULL,
  by_user   integer REFERENCES razvitie.users(id) ON DELETE SET NULL,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coin_log_user ON razvitie.coin_log(user_id, at DESC);
`;

// Админ: флаг в базе (назначается в админке), почта из RAZVITIE_ADMINS или роль admin в Keycloak.
const ENV_ADMINS = (process.env.RAZVITIE_ADMINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const adminByIdentity = (identity) => (identity.roles || []).includes('admin') || (!!identity.email && ENV_ADMINS.includes(identity.email.toLowerCase()));
const fail = (status, message) => Object.assign(new Error(message), { status });

function createStore({ databaseUrl, dataDir }) {
  return databaseUrl ? pgStore(databaseUrl, dataDir) : fileStore(dataDir);
}

// ---------- Postgres ----------
function pgStore(databaseUrl, dataDir) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  pool.on('error', (e) => console.error('База:', e.message));

  return {
    kind: 'postgres',
    async init() {
      await pool.query(SCHEMA);
      // Рекорды прежних заездов (records.json) — один раз, без привязки к пользователю
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM razvitie.race_results');
      const file = path.join(dataDir, 'records.json');
      if (!rows[0].n && fs.existsSync(file)) {
        try {
          const old = JSON.parse(fs.readFileSync(file, 'utf8'));
          for (const r of Array.isArray(old) ? old : []) {
            await pool.query('INSERT INTO razvitie.race_results(nick, cpm, acc, legacy, at) VALUES ($1,$2,$3,true,to_timestamp($4/1000.0))',
              [String(r.nick).slice(0, 40), Math.round(r.cpm) || 0, Number(r.acc) || 0, Number(r.at) || Date.now()]);
          }
          console.log(`Перенесено рекордов из records.json: ${Array.isArray(old) ? old.length : 0}`);
        } catch (e) { console.error('Не удалось перенести records.json:', e.message); }
      }
    },
    async user(identity) {
      const { rows } = await pool.query(
        `INSERT INTO razvitie.users(sub, full_name, nick, email) VALUES ($1,$2,$3,$4)
         ON CONFLICT (sub) DO UPDATE SET full_name=EXCLUDED.full_name, nick=EXCLUDED.nick, email=EXCLUDED.email, last_seen_at=now()
         RETURNING id, full_name AS "fullName", nick, email, coins, is_admin`,
        [identity.sub, identity.fullName, identity.nick, identity.email]);
      const { is_admin: flag, ...u } = rows[0];
      return { ...u, isAdmin: flag || adminByIdentity(identity) };
    },
    async saveResult(r) {
      await pool.query(
        'INSERT INTO razvitie.race_results(user_id, nick, cpm, acc, time_ms, chars, place, racers, room) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [r.userId ?? null, r.nick, r.cpm, r.acc, r.timeMs, r.chars, r.place, r.racers, r.room]);
    },
    // Лучший результат каждого игрока (прежние рекорды — по нику)
    async records(limit = 10) {
      const { rows } = await pool.query(
        `SELECT nick, cpm, acc::float AS acc FROM (
           SELECT DISTINCT ON (coalesce(r.user_id::text, 'n:' || lower(r.nick))) coalesce(u.nick, r.nick) AS nick, r.cpm, r.acc
           FROM razvitie.race_results r LEFT JOIN razvitie.users u ON u.id = r.user_id
           ORDER BY coalesce(r.user_id::text, 'n:' || lower(r.nick)), r.cpm DESC, r.at) best
         ORDER BY cpm DESC LIMIT $1`, [limit]);
      return rows;
    },
    // ---------- Админка ----------
    async adminUsers() {
      const { rows } = await pool.query(
        `SELECT u.id, u.full_name AS "fullName", u.nick, u.email, u.coins, u.is_admin AS "isAdmin", u.last_seen_at AS "lastSeenAt",
                count(r.id)::int AS races, coalesce(max(r.cpm), 0)::int AS best
         FROM razvitie.users u LEFT JOIN razvitie.race_results r ON r.user_id = u.id
         GROUP BY u.id ORDER BY u.last_seen_at DESC`);
      return rows;
    },
    async adminUpdateUser(id, { coinsDelta, reason, isAdmin }, byUser) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT id, coins FROM razvitie.users WHERE id=$1 FOR UPDATE', [id]);
        if (!rows[0]) throw fail(404, 'Пользователь не найден.');
        if (coinsDelta) {
          if (rows[0].coins + coinsDelta < 0) throw fail(400, `На счёте ${rows[0].coins} — столько не списать.`);
          await client.query('UPDATE razvitie.users SET coins = coins + $2 WHERE id=$1', [id, coinsDelta]);
          await client.query('INSERT INTO razvitie.coin_log(user_id, delta, reason, by_user) VALUES ($1,$2,$3,$4)', [id, coinsDelta, reason, byUser]);
        }
        if (typeof isAdmin === 'boolean') await client.query('UPDATE razvitie.users SET is_admin=$2 WHERE id=$1', [id, isAdmin]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    },
    async adminCoinLog(limit = 100) {
      const { rows } = await pool.query(
        `SELECT l.id, l.delta, l.reason, l.at, u.full_name AS "user", b.full_name AS "by"
         FROM razvitie.coin_log l JOIN razvitie.users u ON u.id = l.user_id LEFT JOIN razvitie.users b ON b.id = l.by_user
         ORDER BY l.at DESC LIMIT $1`, [limit]);
      return rows;
    },
    async adminRaces(limit = 200) {
      const { rows } = await pool.query(
        `SELECT r.id, coalesce(u.full_name, r.nick) AS "user", r.nick, r.cpm, r.acc::float AS acc, r.time_ms AS "timeMs", r.place, r.racers, r.legacy, r.at
         FROM razvitie.race_results r LEFT JOIN razvitie.users u ON u.id = r.user_id ORDER BY r.cpm DESC, r.at DESC LIMIT $1`, [limit]);
      return rows;
    },
    async adminDeleteRace(id) {
      const { rowCount } = await pool.query('DELETE FROM razvitie.race_results WHERE id=$1', [id]);
      if (!rowCount) throw fail(404, 'Заезд не найден.');
    },
    async myResults(userId, limit = 50) {
      const { rows } = await pool.query(
        `SELECT cpm, acc::float AS acc, time_ms AS "timeMs", chars, place, racers, at FROM razvitie.race_results
         WHERE user_id=$1 ORDER BY at DESC LIMIT $2`, [userId, limit]);
      const stats = (await pool.query(
        `SELECT count(*)::int AS races, coalesce(max(cpm),0)::int AS best, coalesce(round(avg(cpm)),0)::int AS avg,
                count(*) FILTER (WHERE place=1)::int AS wins FROM razvitie.race_results WHERE user_id=$1`, [userId])).rows[0];
      return { stats, results: rows };
    },
  };
}

// ---------- Без базы: файл рекордов, как раньше ----------
function fileStore(dataDir) {
  const file = path.join(dataDir, 'records.json');
  let records = [];
  try { records = JSON.parse(fs.readFileSync(file, 'utf8')); if (!Array.isArray(records)) records = []; } catch { records = []; }
  const users = new Map();
  const results = [];
  let seq = 0;
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fs.mkdir(dataDir, { recursive: true }, (err) => {
        if (err) return console.error('Не удалось создать папку данных:', err.message);
        const tmp = file + '.tmp';
        fs.writeFile(tmp, JSON.stringify(records), (e) => (e ? console.error('Не удалось сохранить рекорды:', e.message) : fs.rename(tmp, file, () => {})));
      });
    }, 1000);
  };
  return {
    kind: 'file',
    async init() {},
    async user(identity) {
      let u = users.get(identity.sub);
      if (!u) { u = { id: ++seq, coins: 0 }; users.set(identity.sub, u); }
      Object.assign(u, { fullName: identity.fullName, nick: identity.nick, email: identity.email, lastSeenAt: new Date() });
      return { id: u.id, fullName: u.fullName, nick: u.nick, email: u.email, coins: u.coins, isAdmin: !!u.isAdmin || adminByIdentity(identity) };
    },
    async saveResult(r) {
      results.push({ ...r, id: results.length + 1, at: new Date() });
      const key = r.userId ? `u:${r.userId}` : r.nick.toLowerCase();
      const existing = records.find((x) => x.key === key);
      if (existing && existing.cpm >= r.cpm) return;
      if (existing) Object.assign(existing, { nick: r.nick, cpm: r.cpm, acc: r.acc, at: Date.now() });
      else records.push({ key, nick: r.nick, cpm: r.cpm, acc: r.acc, at: Date.now() });
      records.sort((a, b) => b.cpm - a.cpm);
      records = records.slice(0, 100);
      save();
    },
    async records(limit = 10) { return records.slice(0, limit).map(({ nick, cpm, acc }) => ({ nick, cpm, acc })); },
    async adminUsers() {
      return [...users.values()].map((u) => {
        const mine = results.filter((r) => r.userId === u.id);
        return { id: u.id, fullName: u.fullName, nick: u.nick, email: u.email, coins: u.coins, isAdmin: !!u.isAdmin, lastSeenAt: u.lastSeenAt, races: mine.length, best: Math.max(0, ...mine.map((r) => r.cpm)) };
      });
    },
    async adminUpdateUser(id, { coinsDelta, isAdmin }) {
      const u = [...users.values()].find((x) => x.id === id);
      if (!u) throw fail(404, 'Пользователь не найден.');
      if (coinsDelta) { if (u.coins + coinsDelta < 0) throw fail(400, `На счёте ${u.coins} — столько не списать.`); u.coins += coinsDelta; }
      if (typeof isAdmin === 'boolean') u.isAdmin = isAdmin;
    },
    async adminCoinLog() { return []; },
    async adminRaces() { return results.map((r) => ({ id: r.id, user: r.nick, nick: r.nick, cpm: r.cpm, acc: r.acc, timeMs: r.timeMs, place: r.place, racers: r.racers, legacy: false, at: r.at })).sort((a, b) => b.cpm - a.cpm); },
    async adminDeleteRace(id) { const i = results.findIndex((r) => r.id === id); if (i < 0) throw fail(404, 'Заезд не найден.'); results.splice(i, 1); },
    async myResults(userId, limit = 50) {
      const mine = results.filter((r) => r.userId === userId).reverse();
      return {
        stats: { races: mine.length, best: Math.max(0, ...mine.map((r) => r.cpm)), avg: mine.length ? Math.round(mine.reduce((a, r) => a + r.cpm, 0) / mine.length) : 0, wins: mine.filter((r) => r.place === 1).length },
        results: mine.slice(0, limit).map((r) => ({ cpm: r.cpm, acc: r.acc, timeMs: r.timeMs, chars: r.chars, place: r.place, racers: r.racers, at: r.at })),
      };
    },
  };
}

module.exports = { createStore };
