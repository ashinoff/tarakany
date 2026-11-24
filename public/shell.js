// «Развитие» — оболочка по образцу ЭнергоСферы: главная из цветных колонок разделов,
// у раздела своя цветная колонка меню, справа — содержимое. Разделы: Тараканьи бега
// (страница /races/ во фрейме), Тестирование и Задачи (скоро). За тесты и задачи будут
// падать монетки, на них — играть.
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

  // Свои значки вместо эмодзи: таракана (🪳) нет в шрифтах Windows 10 — был бы пустой квадрат
  const ICONS = {
    roach: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M27 14c-3-5-8-8-14-8M37 14c3-5 8-8 14-8"/>
      <ellipse cx="32" cy="18" rx="6" ry="5" fill="currentColor" fill-opacity=".25"/>
      <ellipse cx="32" cy="38" rx="11" ry="17" fill="currentColor" fill-opacity=".25"/>
      <path d="M32 22v32M22 30l-11-6M42 30l11-6M21 38H8M43 38h13M22 46l-10 8M42 46l10 8"/></svg>`,
    test: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="12" y="9" width="40" height="48" rx="5" fill="currentColor" fill-opacity=".18"/>
      <path d="M24 6h16v8H24zM20 26l4 4 7-8M36 27h10M20 42l4 4 7-8M36 43h10"/></svg>`,
    target: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="30" cy="34" r="22" fill="currentColor" fill-opacity=".15"/><circle cx="30" cy="34" r="14"/><circle cx="30" cy="34" r="6" fill="currentColor"/>
      <path d="M30 34 52 12M46 8l6 4-2 7"/></svg>`,
    sprout: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M32 56V30M32 34c-12 0-18-8-18-18 12 0 18 8 18 18zM32 30c0-10 7-17 18-17 0 11-7 17-18 17z" fill="currentColor" fill-opacity=".2"/></svg>`,
  };

  // ---------- Разделы ----------
  const MODULES = [
    {
      id: 'races', num: '01', title: 'Тараканьи бега', subtitle: 'Скоростная печать\nнаперегонки',
      tint: '#f3d99a', accent: '#efc35a', strong: '#8a5a00', emoji: ICONS.roach,
      about: 'Печатай текст — и твой таракан бежит. Кто первым без ошибок наберёт весь текст, тот и победил.',
      menu: [
        { id: 'race', title: 'Заезды', about: 'Быстрая гонка, свои комнаты и заезды с ботами.', frame: '/races/' },
        { id: 'mine', title: 'Мои результаты', about: 'Все твои заезды: скорость, точность, места.' },
        { id: 'records', title: 'Рекорды', about: 'Самые быстрые тараканы — лучший результат каждого.' },
      ],
    },
    {
      id: 'tests', num: '02', title: 'Тестирование', subtitle: 'Проверь себя\nи получи монетки',
      tint: '#b9dccd', accent: '#93cbb3', strong: '#2c6b52', emoji: ICONS.test, soon: true,
      about: 'Тесты по работе: прошёл успешно — на счёт падают монетки.',
      menu: [
        { id: 'list', title: 'Тесты', about: 'Доступные тесты и что за них дают.' },
        { id: 'mine', title: 'Мои результаты', about: 'Пройденные тесты и баллы.' },
      ],
    },
    {
      id: 'tasks', num: '03', title: 'Задачи', subtitle: 'Решай задачи\nкопи монетки',
      tint: '#c7cbee', accent: '#a9afe6', strong: '#454c9a', emoji: ICONS.target, soon: true,
      about: 'Практические задачи: решил — монетки на счёт.',
      menu: [
        { id: 'list', title: 'Задачи', about: 'Задачи, которые можно взять в работу.' },
        { id: 'mine', title: 'Мои задачи', about: 'Взятые и решённые задачи.' },
      ],
    },
  ];
  const moduleById = (id) => MODULES.find((m) => m.id === id);

  // ---------- Вход ----------
  let token = null;
  let me = null;
  const children = new Set();   // окна встроенных разделов, ждущие токен

  const send = (win) => token && win.postMessage({ type: 'platform-auth', token }, location.origin);
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    // токен от Платформы
    if (d.type === 'platform-auth' && d.token && e.source === window.parent && PLATFORM_ORIGINS.includes(e.origin)) {
      const first = !token;
      token = d.token;
      children.forEach(send);
      if (first) loadMe();
      return;
    }
    // встроенный раздел (тот же сайт) просит токен
    if (d.type === 'app-ready' && e.origin === location.origin && e.source && e.source !== window) {
      children.add(e.source);
      if (token) send(e.source);
      else if (embedded) window.parent.postMessage({ type: 'app-ready' }, '*');
      else e.source.postMessage({ type: 'no-auth' }, location.origin);   // вне Платформы (тестовый стенд)
    }
  });

  async function api(path) {
    const r = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
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
      route();
    } catch (e) {
      me = null;
      renderBlocked(e.message);
    }
  }

  if (embedded) window.parent.postMessage({ type: 'app-ready' }, '*');
  else loadMe();   // вне Платформы: сработает только на тестовом стенде (вход без платформы)
  // Платформа не ответила — покажем, что делать
  setTimeout(() => { if (!me && embedded && !token) renderBlocked('Платформа не передала вход. Закрой и снова открой «Развитие».'); }, 10000);

  // ---------- Экран ----------
  const content = $('content');
  const menu = $('menu');
  const strips = $('strips');
  let frames = {};   // фреймы разделов живут, пока открыта оболочка (заезд не рвётся при переходах)

  function setTheme(m) {
    const root = document.documentElement.style;
    root.setProperty('--tint', m ? m.tint : '#e9e7e0');
    root.setProperty('--accent', m ? m.accent : '#d9dde4');
    root.setProperty('--accent-strong', m ? m.strong : '#23272e');
  }

  function renderStrips(active) {
    strips.innerHTML = MODULES.map((m) =>
      `<a class="strip${m.id === active ? ' is-active' : ''}" href="#/${m.id}" style="--tint:${m.tint};--accent-strong:${m.strong}" title="${esc(m.title)}">
         <span class="strip__num">${m.num}</span><span class="strip__title">${esc(m.title)}</span></a>`).join('');
  }

  function renderHome() {
    setTheme(null);
    renderStrips(null);
    menu.hidden = true;
    hideFrames();
    content.className = 'content content--home';
    content.innerHTML =
      `<div class="home">
         <div class="home__hello"><h1>${me ? `Привет, ${esc(firstName(me.fullName) || me.nick)}!` : 'Развитие'}</h1>
           <p>Тренируйся, проходи тесты, решай задачи. За успехи падают монетки — на них можно играть.</p></div>
         <div class="home__cols">
           ${MODULES.map((m) => `
             <a class="col" href="#/${m.id}" style="--tint:${m.tint};--accent:${m.accent};--accent-strong:${m.strong}">
               <span class="col__num">${m.num}</span>
               <span class="col__emoji" aria-hidden="true">${m.emoji}</span>
               <span class="col__title">${esc(m.title)}</span>
               <span class="col__sub">${esc(m.subtitle)}</span>
               <span class="col__about">${esc(m.about)}</span>
               <span class="col__go">${m.soon ? 'Скоро' : 'Открыть'}</span>
             </a>`).join('')}
         </div>
       </div>`;
  }

  function renderModule(m, page) {
    setTheme(m);
    renderStrips(m.id);
    menu.hidden = false;
    menu.innerHTML =
      `<a class="menu__back" href="#/">← Все разделы</a>
       <div class="menu__hero"><span class="menu__emoji" aria-hidden="true">${m.emoji}</span>
         <span class="menu__num">${m.num}</span><h2>${esc(m.title)}</h2></div>
       <ul class="menu__list">${m.menu.map((i) =>
         `<li><a class="menu__item${i.id === page.id ? ' is-active' : ''}" href="#/${m.id}/${i.id}">${esc(i.title)}</a></li>`).join('')}</ul>`;

    if (page.frame) return showFrame(m, page);
    hideFrames();
    content.className = 'content';
    content.innerHTML = header(m, page) + '<div class="page" id="page"><p class="muted">Загрузка…</p></div>';
    const box = $('page');
    if (m.soon) {
      box.innerHTML = `<section class="card soon"><span class="soon__emoji" aria-hidden="true">${m.emoji}</span>
        <h2>Раздел готовится</h2><p>${esc(m.about)}</p>
        <p class="muted">Монетки появятся вместе с первыми тестами и задачами. Пока можно размяться в тараканьих бегах.</p>
        <a class="btn btn--primary" href="#/races/race">К тараканьим бегам</a></section>`;
      return;
    }
    if (m.id === 'races' && page.id === 'mine') return myRaces(box);
    if (m.id === 'races' && page.id === 'records') return records(box);
  }

  const header = (m, page) =>
    `<div class="page-head"><p class="crumbs">Развитие / ${esc(m.title)}</p><h1>${esc(page.title)}</h1><p class="sub">${esc(page.about)}</p></div>`;

  function showFrame(m, page) {
    const key = `${m.id}/${page.id}`;
    content.className = 'content content--frame';
    content.innerHTML = header(m, page);
    Object.entries(frames).forEach(([k, f]) => { f.hidden = k !== key; });
    let f = frames[key];
    if (!f) {
      f = document.createElement('iframe');
      f.className = 'frame';
      f.title = page.title;
      const room = new URLSearchParams(location.search).get('room');
      f.src = page.frame + (room && m.id === 'races' ? `?room=${encodeURIComponent(room)}` : '');
      f.allow = 'clipboard-write';
      $('frames').appendChild(f);
      frames[key] = f;
    }
    f.hidden = false;
    document.body.classList.add('has-frame');
  }
  function hideFrames() {
    Object.values(frames).forEach((f) => { f.hidden = true; });
    document.body.classList.remove('has-frame');
  }

  // ---------- Тараканьи бега: мои результаты и рекорды ----------
  const fmtDate = (s) => new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtTime = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '—');

  async function myRaces(box) {
    try {
      const { stats, results } = await api('/api/races/mine');
      box.innerHTML =
        `<div class="stats">
           ${stat(stats.races, 'заездов')}${stat(stats.best, 'лучшая скорость, зн/мин')}${stat(stats.avg, 'средняя скорость')}${stat(stats.wins, 'побед')}
         </div>
         <section class="card card--flush"><h2 class="card__title">Последние заезды</h2>
         ${results.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Когда</th><th>Скорость</th><th>Точность</th><th>Время</th><th>Место</th></tr></thead><tbody>
           ${results.map((r) => `<tr><td>${fmtDate(r.at)}</td><td><b>${r.cpm}</b> зн/мин</td><td>${r.acc}%</td><td>${fmtTime(r.timeMs)}</td>
             <td>${r.place ? `${r.place === 1 ? '🏆 ' : ''}${r.place} из ${r.racers || '?'}` : '—'}</td></tr>`).join('')}
         </tbody></table></div>` : '<p class="empty">Ты ещё не добегал ни одного заезда. <a href="#/races/race">Встать на старт</a></p>'}
         </section>`;
    } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }

  async function records(box) {
    try {
      const list = await api('/api/records');
      box.innerHTML = `<section class="card card--flush"><h2 class="card__title">Самые быстрые</h2>
        ${list.length ? `<ol class="records">${list.map((r, i) =>
          `<li class="${me && r.nick === me.nick ? 'is-me' : ''}"><span class="records__place">${i + 1}</span><span class="records__nick">${esc(r.nick)}</span>
           <span class="records__cpm"><b>${r.cpm}</b> зн/мин</span><span class="records__acc">${r.acc}%</span></li>`).join('')}</ol>`
          : '<p class="empty">Рекордов пока нет — стань первым.</p>'}</section>`;
    } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }
  const stat = (v, label) => `<div class="stat"><b>${Number(v || 0).toLocaleString('ru-RU')}</b><span>${esc(label)}</span></div>`;
  const firstName = (full) => String(full || '').trim().split(/\s+/)[1] || '';

  function renderBlocked(message) {
    setTheme(null);
    renderStrips(null);
    menu.hidden = true;
    hideFrames();
    content.className = 'content content--home';
    content.innerHTML = `<section class="card soon"><span class="soon__emoji" aria-hidden="true">${ICONS.sprout}</span><h2>Нужен вход через платформу</h2><p>${esc(message)}</p></section>`;
  }

  // ---------- Маршрут: #/раздел/страница ----------
  function route() {
    if (!me) return;
    const [, mid, pid] = location.hash.split('/');
    const m = moduleById(mid);
    if (!m) return renderHome();
    const page = m.menu.find((i) => i.id === pid) || m.menu[0];
    renderModule(m, page);
  }
  window.addEventListener('hashchange', route);
  // старые ссылки на комнату (?room=K7QX) — сразу в заезды
  if (new URLSearchParams(location.search).get('room') && !location.hash) location.hash = '#/races/race';
})();
