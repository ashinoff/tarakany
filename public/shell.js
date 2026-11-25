// «Развитие» — оболочка. Разделы — цветные панели-«книжки»: на главной они стоят
// колонками, при открытии раздела выбранная становится колонкой меню, остальные
// уезжают влево узкими корешками. Кнопка «Развернуть» убирает книжки и оставляет
// только приложение, «Вернуть книжки» — возвращает. Разделы: Тараканьи бега
// (страница /races/ во фрейме), Тестирование и Задачи (скоро), Админка (админам).
//
// Вход: оболочка открыта во фрейме Платформы, та присылает Keycloak-токен
// ({ type: 'platform-auth', token }). Токен уходит на сервер (он проверяет подпись) и во
// встроенные страницы разделов — тем же сообщением, по их { type: 'app-ready' }.
(function () {
  'use strict';

  const PLATFORM_ORIGINS = ['https://sue-system-2-ashinoff.waw0.amvera.tech', 'http://localhost:5173'];
  const embedded = window.self !== window.top;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Свои значки вместо эмодзи: таракана нет в шрифтах Windows 10 — был бы пустой квадрат
  const S = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    roach: `<svg viewBox="0 0 64 64" ${S}><path d="M27 14c-3-5-8-8-14-8M37 14c3-5 8-8 14-8"/><ellipse cx="32" cy="18" rx="6" ry="5" fill="currentColor" fill-opacity=".25"/><ellipse cx="32" cy="38" rx="11" ry="17" fill="currentColor" fill-opacity=".25"/><path d="M32 22v32M22 30l-11-6M42 30l11-6M21 38H8M43 38h13M22 46l-10 8M42 46l10 8"/></svg>`,
    test: `<svg viewBox="0 0 64 64" ${S}><rect x="12" y="9" width="40" height="48" rx="5" fill="currentColor" fill-opacity=".18"/><path d="M24 6h16v8H24zM20 26l4 4 7-8M36 27h10M20 42l4 4 7-8M36 43h10"/></svg>`,
    target: `<svg viewBox="0 0 64 64" ${S}><circle cx="30" cy="34" r="22" fill="currentColor" fill-opacity=".15"/><circle cx="30" cy="34" r="14"/><circle cx="30" cy="34" r="6" fill="currentColor"/><path d="M30 34 52 12M46 8l6 4-2 7"/></svg>`,
    key: `<svg viewBox="0 0 64 64" ${S}><circle cx="22" cy="32" r="12" fill="currentColor" fill-opacity=".2"/><circle cx="22" cy="32" r="4"/><path d="M34 32h24M50 32v8M42 32v6"/></svg>`,
    sprout: `<svg viewBox="0 0 64 64" ${S}><path d="M32 56V30M32 34c-12 0-18-8-18-18 12 0 18 8 18 18zM32 30c0-10 7-17 18-17 0 11-7 17-18 17z" fill="currentColor" fill-opacity=".2"/></svg>`,
    expand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>`,
    books: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h3v16H4zM9 4h3v16H9zM14.5 5.2l2.9-.8 3.6 15-2.9.8z"/></svg>`,
  };

  // ---------- Разделы (палитра своя — не как в ЭнергоСфере) ----------
  const MODULES = [
    {
      id: 'races', num: '01', title: 'Тараканьи бега', subtitle: 'Скоростная печать\nнаперегонки', icon: ICONS.roach,
      tint: '#ffc9ad', accent: '#ff9b6b', strong: '#a8401a',
      about: 'Печатай текст — и твой таракан бежит. Кто первым без ошибок наберёт весь текст, тот и победил.',
      menu: [
        { id: 'race', title: 'Заезды', about: 'Быстрая гонка, свои комнаты и заезды с ботами.', frame: '/races/' },
        { id: 'mine', title: 'Мои результаты', about: 'Все твои заезды: скорость, точность, места.' },
        { id: 'records', title: 'Рекорды', about: 'Самые быстрые тараканы — лучший результат каждого.' },
      ],
    },
    {
      id: 'tests', num: '02', title: 'Тестирование', subtitle: 'Проверь себя\nи получи монетки', icon: ICONS.test, soon: true,
      tint: '#b3dcf7', accent: '#6fb8ec', strong: '#16577f',
      about: 'Тесты по работе: прошёл успешно — на счёт падают монетки.',
      menu: [
        { id: 'list', title: 'Тесты', about: 'Доступные тесты и что за них дают.' },
        { id: 'mine', title: 'Мои результаты', about: 'Пройденные тесты и баллы.' },
      ],
    },
    {
      id: 'tasks', num: '03', title: 'Задачи', subtitle: 'Решай задачи\nкопи монетки', icon: ICONS.target, soon: true,
      tint: '#d4eda6', accent: '#a3d15a', strong: '#46670f',
      about: 'Практические задачи: решил — монетки на счёт.',
      menu: [
        { id: 'list', title: 'Задачи', about: 'Задачи, которые можно взять в работу.' },
        { id: 'mine', title: 'Мои задачи', about: 'Взятые и решённые задачи.' },
      ],
    },
    {
      id: 'admin', num: '★', title: 'Админка', subtitle: 'Люди, монетки\nи порядок', icon: ICONS.key, admin: true,
      tint: '#dccbf5', accent: '#b493ea', strong: '#56308c',
      about: 'Пользователи «Развития», начисление монеток, назначение админов, чистка рекордов.',
      menu: [
        { id: 'users', title: 'Пользователи', about: 'Кто заходил, сколько монеток, кто админ.' },
        { id: 'coins', title: 'Журнал монеток', about: 'Каждое начисление и списание — кто, кому и за что.' },
        { id: 'races', title: 'Заезды', about: 'Все результаты по скорости: подозрительный — удалить.' },
      ],
    },
  ];
  const visible = () => MODULES.filter((m) => !m.admin || (me && me.isAdmin));

  // ---------- Вход ----------
  let token = null;
  let me = null;
  const children = new Set();
  const send = (win) => token && win.postMessage({ type: 'platform-auth', token }, location.origin);
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'platform-auth' && d.token && e.source === window.parent && PLATFORM_ORIGINS.includes(e.origin)) {
      const first = !token;
      token = d.token;
      children.forEach(send);
      if (first) loadMe();
      return;
    }
    if (d.type === 'app-ready' && e.origin === location.origin && e.source && e.source !== window) {
      children.add(e.source);
      if (token) send(e.source);
      else if (embedded) window.parent.postMessage({ type: 'app-ready' }, '*');
      else e.source.postMessage({ type: 'no-auth' }, location.origin);   // вне Платформы (тестовый стенд)
    }
  });

  async function api(path, opts = {}) {
    const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) };
    const r = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const body = await r.json().catch(() => ({}));
    if (r.status === 401 && embedded) window.parent.postMessage({ type: 'app-ready' }, '*');
    if (!r.ok) throw new Error(body.error || `Ошибка сервера (${r.status})`);
    return body;
  }

  async function loadMe() {
    try {
      me = await api('/api/me');
      $('meName').textContent = me.fullName || me.nick;
      $('meAvatar').textContent = (me.nick || '?').slice(0, 1);
      $('coinsValue').textContent = me.coins;
      buildPanels();
      route();
    } catch (e) { me = null; blocked(e.message); }
  }
  if (embedded) window.parent.postMessage({ type: 'app-ready' }, '*');
  else loadMe();
  setTimeout(() => { if (!me && embedded && !token) blocked('Платформа не передала вход. Закрой и снова открой «Развитие».'); }, 10000);

  // ---------- Сцена: панели-книжки ----------
  const stage = $('stage');
  const content = $('content');
  const page = $('page');
  const frames = {};
  const STRIP = 64, SIDE = 290, BAR = 64;
  const narrowQuery = window.matchMedia('(max-width: 900px)');
  let state = { mid: null, pid: null, focus: false };

  function buildPanels() {
    stage.querySelectorAll('.panel').forEach((p) => p.remove());
    visible().forEach((m) => {
      const p = document.createElement('section');
      p.className = 'panel';
      p.dataset.id = m.id;
      p.style.cssText = `--tint:${m.tint};--accent:${m.accent};--accent-strong:${m.strong}`;
      p.innerHTML =
        `<span class="panel__img" aria-hidden="true">${m.icon}</span>
         <a class="panel__col" href="#/${m.id}">
           <span class="panel__num">${m.num}</span>
           <span class="panel__title">${esc(m.title)}</span>
           <span class="panel__sub">${esc(m.subtitle)}</span>
           <span class="panel__about">${esc(m.about)}</span>
           <span class="panel__go">${m.soon ? 'Скоро' : 'Открыть'} <b aria-hidden="true">→</b></span>
         </a>
         <a class="panel__strip" href="#/${m.id}" title="${esc(m.title)}"><span class="panel__num">${m.num}</span><span class="panel__spine">${esc(m.title)}</span></a>
         <nav class="panel__side" aria-label="${esc(m.title)}">
           <a class="side__back" href="#/">← Все разделы</a>
           <div class="side__hero"><span class="panel__num">${m.num}</span><h2>${esc(m.title)}</h2></div>
           <ul class="side__menu">${m.menu.map((i) => `<li><a class="side__item" data-page="${i.id}" href="#/${m.id}/${i.id}">${esc(i.title)}</a></li>`).join('')}</ul>
         </nav>`;
      stage.insertBefore(p, content);
    });
  }

  function layout() {
    const narrow = narrowQuery.matches;
    const mods = visible();
    const sel = state.mid;
    const others = mods.filter((m) => m.id !== sel);
    const stripsW = narrow || state.focus ? 0 : others.length * STRIP;
    const n = mods.length;
    mods.forEach((m, i) => {
      const p = stage.querySelector(`.panel[data-id="${m.id}"]`);
      if (!p) return;
      let mode, st;
      if (!sel) {
        mode = 'col';
        st = narrow ? { left: '0', width: '100%', top: `${(i * 100) / n}%`, height: `${100 / n}%` } : { left: `${(i * 100) / n}%`, width: `${100 / n}%`, top: '0', height: '100%' };
      } else if (m.id === sel) {
        if (state.focus) { mode = 'hidden'; st = narrow ? { left: '0', width: '100%', top: '0', height: '0' } : { left: '0', width: '0', top: '0', height: '100%' }; }
        else { mode = 'side'; st = narrow ? { left: '0', width: '100%', top: '0', height: `${BAR}px` } : { left: `${stripsW}px`, width: `${SIDE}px`, top: '0', height: '100%' }; }
      } else if (narrow || state.focus) {
        mode = 'hidden';
        st = narrow ? { left: '0', width: '100%', top: '0', height: '0' } : { left: '0', width: '0', top: '0', height: '100%' };
      } else {
        const k = others.indexOf(m);
        mode = 'strip';
        st = { left: `${k * STRIP}px`, width: `${STRIP}px`, top: '0', height: '100%' };
      }
      p.className = `panel panel--${mode}`;
      Object.assign(p.style, st);
      p.querySelectorAll('.side__item').forEach((a) => a.classList.toggle('is-active', a.dataset.page === state.pid));
    });
    const left = !sel ? 0 : state.focus ? 0 : narrow ? 0 : stripsW + SIDE;
    const top = sel && narrow && !state.focus ? BAR : 0;
    content.classList.toggle('is-open', !!sel);
    Object.assign(content.style, { left: `${left}px`, top: `${top}px` });
    document.body.classList.toggle('is-focus', !!(sel && state.focus));
  }
  narrowQuery.addEventListener('change', layout);

  // ---------- Содержимое ----------
  const header = (m, p) =>
    `<div class="page-head">
       <div><p class="crumbs">Развитие / ${esc(m.title)}</p><h1>${esc(p.title)}</h1><p class="sub">${esc(p.about)}</p></div>
       <button type="button" class="btn btn--ghost focus-btn" id="focusBtn" title="${state.focus ? 'Показать разделы-книжки' : 'Убрать книжки — только приложение'}">
         <span class="btn__icon">${state.focus ? ICONS.books : ICONS.expand}</span><span>${state.focus ? 'Вернуть книжки' : 'Развернуть'}</span></button>
     </div>`;

  function render() {
    const m = visible().find((x) => x.id === state.mid);
    hideFrames();
    if (!m) { page.innerHTML = ''; return; }
    const p = m.menu.find((i) => i.id === state.pid) || m.menu[0];
    content.style.setProperty('--accent', m.accent);
    content.style.setProperty('--accent-strong', m.strong);
    content.style.setProperty('--tint', m.tint);
    page.innerHTML = header(m, p) + '<div class="page" id="pageBody"><p class="muted">Загрузка…</p></div>';
    $('focusBtn').addEventListener('click', () => { state.focus = !state.focus; layout(); render(); });
    const box = $('pageBody');
    if (p.frame) { box.remove(); return showFrame(m, p); }
    if (m.soon) {
      box.innerHTML = `<section class="block soon"><span class="soon__icon" aria-hidden="true">${m.icon}</span><h2 class="block__title">Раздел готовится</h2>
        <p>${esc(m.about)}</p><p class="muted">Монетки появятся вместе с первыми тестами и задачами. Пока можно размяться в тараканьих бегах.</p>
        <a class="btn btn--primary" href="#/races/race">К тараканьим бегам</a></section>`;
      return;
    }
    const pages = { 'races/mine': myRaces, 'races/records': records, 'admin/users': adminUsers, 'admin/coins': adminCoins, 'admin/races': adminRaces };
    (pages[`${m.id}/${p.id}`] || (() => {}))(box);
  }

  function showFrame(m, p) {
    const key = `${m.id}/${p.id}`;
    let f = frames[key];
    if (!f) {
      f = document.createElement('iframe');
      f.className = 'frame';
      f.title = p.title;
      const room = new URLSearchParams(location.search).get('room');
      f.src = p.frame + (room && m.id === 'races' ? `?room=${encodeURIComponent(room)}` : '');
      f.allow = 'clipboard-write';
      $('frames').appendChild(f);
      frames[key] = f;
    }
    f.hidden = false;
    content.classList.add('has-frame');
  }
  function hideFrames() { Object.values(frames).forEach((f) => { f.hidden = true; }); content.classList.remove('has-frame'); }

  // ---------- Тараканьи бега ----------
  const fmtDate = (s) => new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtTime = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '—');
  const stat = (v, label) => `<div class="stat"><b>${Number(v || 0).toLocaleString('ru-RU')}</b><span>${esc(label)}</span></div>`;
  const fail = (box, e) => { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; };

  async function myRaces(box) {
    try {
      const { stats, results } = await api('/api/races/mine');
      box.innerHTML = `<div class="stats">${stat(stats.races, 'заездов')}${stat(stats.best, 'лучшая скорость, зн/мин')}${stat(stats.avg, 'средняя скорость')}${stat(stats.wins, 'побед')}</div>
        <section class="card card--flush"><h2 class="card__title">Последние заезды</h2>
        ${results.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Когда</th><th>Скорость</th><th>Точность</th><th>Время</th><th>Место</th></tr></thead><tbody>
          ${results.map((r) => `<tr><td>${fmtDate(r.at)}</td><td><b>${r.cpm}</b> зн/мин</td><td>${r.acc}%</td><td>${fmtTime(r.timeMs)}</td><td>${r.place ? `${r.place} из ${r.racers || '?'}` : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">Ты ещё не добегал ни одного заезда. <a href="#/races/race">Встать на старт</a></p>'}</section>`;
    } catch (e) { fail(box, e); }
  }
  async function records(box) {
    try {
      const list = await api('/api/records');
      box.innerHTML = `<section class="card card--flush"><h2 class="card__title">Самые быстрые</h2>
        ${list.length ? `<ol class="records">${list.map((r, i) => `<li class="${me && r.nick === me.nick ? 'is-me' : ''}"><span class="records__place">${i + 1}</span><span class="records__nick">${esc(r.nick)}</span><span class="records__cpm"><b>${r.cpm}</b> зн/мин</span><span class="records__acc">${r.acc}%</span></li>`).join('')}</ol>`
          : '<p class="empty">Рекордов пока нет — стань первым.</p>'}</section>`;
    } catch (e) { fail(box, e); }
  }

  // ---------- Админка ----------
  async function adminUsers(box) {
    let list;
    try { list = await api('/api/admin/users'); } catch (e) { return fail(box, e); }
    let query = '';
    let open = null;   // id пользователя с открытой формой монеток
    const draw = () => {
      const q = query.trim().toLowerCase();
      const rows = list.filter((u) => !q || `${u.fullName} ${u.nick} ${u.email || ''}`.toLowerCase().includes(q));
      box.innerHTML = `<div class="toolbar"><input class="input" id="uq" placeholder="Поиск по ФИО или почте" value="${esc(query)}"><span class="muted">Всего: ${list.length}</span></div>
        <section class="card card--flush"><div class="table-wrap"><table class="table">
          <thead><tr><th>Пользователь</th><th>Заездов</th><th>Лучшая</th><th>Монетки</th><th>Был</th><th>Админ</th></tr></thead><tbody>
          ${rows.map((u) => `<tr>
              <td><b>${esc(u.fullName || u.nick)}</b><div class="muted small">${esc(u.email || '—')}</div></td>
              <td>${u.races}</td><td>${u.best || '—'}</td>
              <td><button type="button" class="chip-btn" data-coins="${u.id}" title="Начислить или списать"><span class="coin-dot"></span>${u.coins}</button></td>
              <td class="small">${u.lastSeenAt ? fmtDate(u.lastSeenAt) : '—'}</td>
              <td><button type="button" class="toggle${u.isAdmin ? ' is-on' : ''}" data-admin="${u.id}" aria-pressed="${u.isAdmin}" title="${u.isAdmin ? 'Снять админа' : 'Сделать админом'}"><i></i></button></td></tr>
            ${open === u.id ? `<tr class="row-form"><td colspan="6"><form class="coins-form" data-form="${u.id}">
              <input class="input" name="delta" inputmode="numeric" placeholder="+50 или −10" required>
              <input class="input" name="reason" placeholder="За что (видно в журнале)" required maxlength="200">
              <button class="btn btn--primary" type="submit">Провести</button><button class="btn btn--ghost" type="button" data-cancel>Отмена</button>
              <span class="error" data-err></span></form></td></tr>` : ''}`).join('')}
          </tbody></table></div></section>`;
      const input = $('uq');
      input.addEventListener('input', () => { query = input.value; const pos = input.selectionStart; draw(); const n = $('uq'); n.focus(); n.setSelectionRange(pos, pos); });
      box.querySelectorAll('[data-coins]').forEach((b) => b.addEventListener('click', () => { open = open === +b.dataset.coins ? null : +b.dataset.coins; draw(); }));
      box.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { open = null; draw(); }));
      box.querySelectorAll('[data-admin]').forEach((b) => b.addEventListener('click', async () => {
        const u = list.find((x) => x.id === +b.dataset.admin);
        try { await api(`/api/admin/users/${u.id}`, { body: { isAdmin: !u.isAdmin } }); u.isAdmin = !u.isAdmin; draw(); } catch (e) { alertInline(b, e.message); }
      }));
      box.querySelectorAll('[data-form]').forEach((f) => f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const id = +f.dataset.form;
        const delta = Number(String(f.delta.value).replace(/[−–]/g, '-').replace(/\s/g, ''));
        if (!Number.isInteger(delta) || !delta) { f.querySelector('[data-err]').textContent = 'Целое число, не ноль: например 50 или -10.'; return; }
        try {
          await api(`/api/admin/users/${id}`, { body: { coinsDelta: delta, reason: f.reason.value } });
          const u = list.find((x) => x.id === id); u.coins += delta; open = null; draw();
          if (me && id === me.id) { me.coins += delta; $('coinsValue').textContent = me.coins; }
        } catch (e) { f.querySelector('[data-err]').textContent = e.message; }
      }));
    };
    draw();
  }
  const alertInline = (el, msg) => { el.title = msg; el.classList.add('is-error'); setTimeout(() => el.classList.remove('is-error'), 2500); };

  async function adminCoins(box) {
    try {
      const log = await api('/api/admin/coins');
      box.innerHTML = `<section class="card card--flush">${log.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Когда</th><th>Кому</th><th>Монетки</th><th>За что</th><th>Кто провёл</th></tr></thead><tbody>
        ${log.map((l) => `<tr><td class="small">${fmtDate(l.at)}</td><td>${esc(l.user)}</td><td><b class="${l.delta > 0 ? 'plus' : 'minus'}">${l.delta > 0 ? '+' : ''}${l.delta}</b></td><td>${esc(l.reason)}</td><td class="small">${esc(l.by || 'система')}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">Монетки ещё никому не начисляли. Начислить можно в «Пользователях».</p>'}</section>`;
    } catch (e) { fail(box, e); }
  }

  async function adminRaces(box) {
    let list;
    try { list = await api('/api/admin/races'); } catch (e) { return fail(box, e); }
    let confirm = null;
    const draw = () => {
      box.innerHTML = `<section class="card card--flush">${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Кто</th><th>Скорость</th><th>Точность</th><th>Время</th><th>Когда</th><th></th></tr></thead><tbody>
        ${list.map((r) => `<tr><td><b>${esc(r.user)}</b>${r.legacy ? ' <span class="muted small">старый рекорд</span>' : ''}</td><td><b>${r.cpm}</b> зн/мин</td><td>${r.acc}%</td><td>${fmtTime(r.timeMs)}</td><td class="small">${fmtDate(r.at)}</td>
          <td><button type="button" class="btn ${confirm === r.id ? 'btn--danger' : 'btn--ghost'} small-btn" data-del="${r.id}">${confirm === r.id ? 'Удалить?' : 'Удалить'}</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">Заездов пока нет.</p>'}</section>`;
      box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        const id = +b.dataset.del;
        if (confirm !== id) { confirm = id; return draw(); }
        try { await api(`/api/admin/races/${id}`, { method: 'DELETE' }); list = list.filter((r) => r.id !== id); confirm = null; draw(); } catch (e) { alertInline(b, e.message); }
      }));
    };
    draw();
  }

  function blocked(message) {
    state = { mid: null, pid: null, focus: false };
    content.classList.add('is-open');
    content.style.left = '0px';
    page.innerHTML = `<section class="block soon blocked"><span class="soon__icon" aria-hidden="true">${ICONS.sprout}</span><h2 class="block__title">Нужен вход через платформу</h2><p>${esc(message)}</p></section>`;
  }

  // ---------- Маршрут: #/раздел/страница ----------
  function route() {
    if (!me) return;
    const [, mid, pid] = location.hash.split('/');
    const m = visible().find((x) => x.id === mid);
    const was = state.mid;
    state.mid = m ? m.id : null;
    state.pid = m ? (m.menu.find((i) => i.id === pid) || m.menu[0]).id : null;
    if (!m || was !== state.mid) state.focus = false;   // новый раздел — снова с книжками
    $('hello').textContent = !m ? `Привет, ${String(me.fullName || '').split(/\s+/)[1] || me.nick}!` : '';
    layout();
    render();
  }
  window.addEventListener('hashchange', route);
  if (new URLSearchParams(location.search).get('room') && !location.hash) location.hash = '#/races/race';
})();
