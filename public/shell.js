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


  // Иллюстрации разделов — глянцевые, с градиентами и бликами (по макету владельца)
  const ART = {
    races: `<svg viewBox="0 0 240 200"><defs>
        <linearGradient id="rTrack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>
        <radialGradient id="rBody" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#c98b5a"/><stop offset=".55" stop-color="#7b4a2a"/><stop offset="1" stop-color="#3d2010"/></radialGradient>
        <radialGradient id="rCoin" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#f6c234"/><stop offset="1" stop-color="#b57b0c"/></radialGradient>
        <linearGradient id="rPole" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cfe9db"/></linearGradient></defs>
      <path d="M26 128h188l14 30H12z" fill="url(#rTrack)" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linejoin="round"/>
      <path d="M12 158h216v8a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6z" fill="#fff" fill-opacity=".22"/>
      <path d="M30 146h170" stroke="#fff" stroke-opacity=".75" stroke-width="3.5" stroke-dasharray="11 9" stroke-linecap="round"/>
      <rect x="182" y="40" width="6" height="118" rx="3" fill="url(#rPole)"/>
      <g><rect x="188" y="42" width="44" height="30" rx="2" fill="#fff"/>
        <g fill="#111"><rect x="188" y="42" width="11" height="10"/><rect x="210" y="42" width="11" height="10"/><rect x="199" y="52" width="11" height="10"/><rect x="221" y="52" width="11" height="10"/><rect x="188" y="62" width="11" height="10"/><rect x="210" y="62" width="11" height="10"/></g></g>
      <path d="M22 100h34M14 114h40M30 86h22" stroke="#fff" stroke-opacity=".85" stroke-width="5" stroke-linecap="round"/>
      <g transform="translate(112 118)">
        <path d="M-16-10l-16-14M-6-12l-6-22M10-12l10-20M18-6l20-8M-16 6l-22 6M18 6l22 4M-8 10l-10 18M12 10l12 16" stroke="#3a1f0e" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M30-6c8-10 14-20 16-30M32 2c12-4 22-12 28-22" stroke="#3a1f0e" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <ellipse cx="0" cy="0" rx="26" ry="15" fill="url(#rBody)"/><ellipse cx="28" cy="-1" rx="10" ry="9" fill="#4a2814"/>
        <path d="M-24 0h46" stroke="#3a1f0e" stroke-opacity=".5" stroke-width="2"/><ellipse cx="-6" cy="-7" rx="13" ry="4" fill="#fff" fill-opacity=".35"/></g>
      <circle cx="74" cy="56" r="21" fill="url(#rCoin)"/><circle cx="74" cy="56" r="15" fill="none" stroke="#c98a0e" stroke-width="2.5"/><ellipse cx="67" cy="48" rx="7" ry="4" fill="#fff" fill-opacity=".6"/>
      <path d="M148 22l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#fff"/></svg>`,
    tests: `<svg viewBox="0 0 240 200"><defs>
        <linearGradient id="tPaper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e3e8fb"/></linearGradient>
        <linearGradient id="tClip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#f3b52e"/></linearGradient>
        <linearGradient id="tPencil" x1="0" x2="1"><stop offset="0" stop-color="#ffd35c"/><stop offset=".5" stop-color="#ffbf2e"/><stop offset="1" stop-color="#e49b10"/></linearGradient>
        <radialGradient id="tCoin" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#f6c234"/><stop offset="1" stop-color="#b57b0c"/></radialGradient></defs>
      <rect x="64" y="24" width="116" height="156" rx="18" fill="url(#tPaper)"/>
      <rect x="94" y="12" width="56" height="26" rx="9" fill="url(#tClip)"/><circle cx="122" cy="25" r="5" fill="#fff"/>
      <g stroke-linecap="round" stroke-linejoin="round" stroke-width="8" fill="none"><path d="M84 64l9 9 17-19" stroke="#22b36b"/><path d="M84 104l9 9 17-19" stroke="#22b36b"/><path d="M86 136l18 18M104 136l-18 18" stroke="#f04f45"/></g>
      <g stroke="#b9c3ea" stroke-width="7" stroke-linecap="round"><path d="M124 66h40M124 106h40M124 146h28"/></g>
      <g transform="translate(192 118) rotate(38)"><rect x="-9" y="-56" width="18" height="84" rx="4" fill="url(#tPencil)"/><path d="M-9 28h18l-9 20z" fill="#f6dfbd"/><path d="M-3.5 41h7l-3.5 7z" fill="#2b2b2b"/><rect x="-9" y="-66" width="18" height="12" rx="4" fill="#f08aa0"/><rect x="-9" y="-56" width="18" height="5" fill="#c9cdd6"/></g>
      <path d="M200 20l-6 12M214 30l-12 6M218 46h-12" stroke="#ffd35c" stroke-width="4" stroke-linecap="round"/>
      <circle cx="56" cy="148" r="27" fill="url(#tCoin)"/><circle cx="56" cy="148" r="20" fill="none" stroke="#c98a0e" stroke-width="2.5"/>
      <path d="M56 134l4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L56 157.6l-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5z" fill="#fff6d6"/></svg>`,
    tasks: `<svg viewBox="0 0 240 200"><defs>
        <radialGradient id="kRing" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f3e6da"/></radialGradient>
        <radialGradient id="kMid" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffcfa3"/><stop offset="1" stop-color="#f59a52"/></radialGradient>
        <linearGradient id="kCoin" x1="0" x2="1"><stop offset="0" stop-color="#e9a515"/><stop offset=".45" stop-color="#ffd86a"/><stop offset="1" stop-color="#c88a10"/></linearGradient></defs>
      <circle cx="104" cy="108" r="76" fill="url(#kRing)"/><circle cx="104" cy="108" r="56" fill="url(#kMid)"/><circle cx="104" cy="108" r="37" fill="#fff"/><circle cx="104" cy="108" r="19" fill="#f2741f"/>
      <ellipse cx="80" cy="62" rx="26" ry="10" fill="#fff" fill-opacity=".55" transform="rotate(-20 80 62)"/>
      <path d="M104 108 194 34" stroke="#5a2a07" stroke-width="7" stroke-linecap="round"/><path d="M182 24l22 2-6 22-9-6z" fill="#5a2a07"/>
      <g><ellipse cx="204" cy="178" rx="26" ry="9" fill="#a8700f"/><rect x="178" y="154" width="52" height="24" fill="url(#kCoin)"/><ellipse cx="204" cy="154" rx="26" ry="9" fill="#ffe28f"/>
        <ellipse cx="204" cy="150" rx="26" ry="9" fill="#a8700f"/><rect x="178" y="128" width="52" height="22" fill="url(#kCoin)"/><ellipse cx="204" cy="128" rx="26" ry="9" fill="#ffe9a8"/>
        <path d="M186 136v10M186 160v12" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/></g>
      <path d="M32 46l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#fff"/></svg>`,
    admin: `<svg viewBox="0 0 240 200"><defs><linearGradient id="aGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#f2b632"/><stop offset="1" stop-color="#a8700f"/></linearGradient></defs>
      <path d="M120 18l70 26v52c0 46-30 76-70 90-40-14-70-44-70-90V44z" fill="#f2b632" opacity=".16"/>
      <path d="M120 18l70 26v52c0 46-30 76-70 90-40-14-70-44-70-90V44z" fill="none" stroke="url(#aGold)" stroke-width="7" stroke-linejoin="round"/>
      <circle cx="104" cy="98" r="22" fill="none" stroke="#fff" stroke-width="9"/><path d="M124 106l44 24M152 122l-8 14M164 129l-6 10" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
      <path d="M196 40l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#f2b632"/></svg>`,
  };

  // ---------- Разделы: глубокие насыщенные цвета, белый текст (концептуально не как пастель ЭнергоСферы) ----------
  const MODULES = [
    {
      id: 'races', num: '01', title: 'Тараканьи бега', subtitle: 'Скоростная печать и соревнование на время.', icon: ICONS.roach, art: ART.races,
      tint: '#14894f', accent: '#3fd08a', strong: '#0a5c33',
      about: 'Печатай текст — и твой таракан бежит. Кто первым без ошибок наберёт весь текст, тот и победил.',
      menu: [
        { id: 'race', title: 'Заезды', about: 'Быстрая гонка, свои комнаты и заезды с ботами.', frame: '/races/' },
        { id: 'mine', title: 'Мои результаты', about: 'Все твои заезды: скорость, точность, места.' },
        { id: 'records', title: 'Рекорды', about: 'Самые быстрые тараканы — лучший результат каждого.' },
      ],
    },
    {
      id: 'tests', num: '02', title: 'Тестирование', subtitle: 'Проверь знания и получи монетки.', icon: ICONS.test, art: ART.tests, soon: true,
      tint: '#3346c4', accent: '#8293ff', strong: '#1b2683',
      about: 'Тесты по работе: прошёл успешно — на счёт падают монетки.',
      menu: [
        { id: 'list', title: 'Тесты', about: 'Доступные тесты и что за них дают.' },
        { id: 'mine', title: 'Мои результаты', about: 'Пройденные тесты и баллы.' },
      ],
    },
    {
      id: 'tasks', num: '03', title: 'Задачи', subtitle: 'Решай практические задачи и зарабатывай монетки.', icon: ICONS.target, art: ART.tasks, soon: true,
      tint: '#e2711d', accent: '#ffaa5c', strong: '#8f3f06',
      about: 'Практические задачи: решил — монетки на счёт.',
      menu: [
        { id: 'list', title: 'Задачи', about: 'Задачи, которые можно взять в работу.' },
        { id: 'mine', title: 'Мои задачи', about: 'Взятые и решённые задачи.' },
      ],
    },
    {
      // Админка — как в ЭнергоСфере: на главной её нет, открывается из меню под именем, только админам
      id: 'admin', num: '★', title: 'Админка', subtitle: 'Люди, монетки\nи порядок', icon: ICONS.key, art: ART.admin, admin: true,
      tint: '#17181d', accent: '#f2b632', strong: '#0b0c10',
      about: 'Пользователи «Развития», начисление монеток, назначение админов, чистка рекордов.',
      menu: [
        { id: 'users', title: 'Пользователи', about: 'Кто заходил, сколько монеток, кто админ.' },
        { id: 'coins', title: 'Журнал монеток', about: 'Каждое начисление и списание — кто, кому и за что.' },
        { id: 'races', title: 'Заезды', about: 'Все результаты по скорости: подозрительный — удалить.' },
      ],
    },
  ];
  const visible = () => MODULES.filter((m) => !m.admin || (me && me.isAdmin));
  const shelf = () => MODULES.filter((m) => !m.admin);   // книжки на главной и корешки

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
      $('menuWho').innerHTML = `<b>${esc(me.fullName || me.nick)}</b><span>${esc(me.email || '')}</span>`;
      $('menuAdmin').hidden = !me.isAdmin;
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
        `<span class="panel__img" aria-hidden="true">${m.art}</span>
         <a class="panel__col" href="#/${m.id}">
           <span class="panel__num panel__pill">${m.num}</span>
           <span class="panel__title">${esc(m.title)}</span>
           <span class="panel__sub">${esc(m.subtitle)}</span>
           ${m.soon ? `<span class="panel__go panel__go--soon"><i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></i>Скоро</span>` : '<span class="panel__go">Открыть <b aria-hidden="true">→</b></span>'}
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
    const books = shelf();
    const sel = state.mid;
    const others = books.filter((m) => m.id !== sel);
    const stripsW = narrow || state.focus ? 0 : others.length * STRIP;
    const n = books.length;
    mods.forEach((m) => {
      const p = stage.querySelector(`.panel[data-id="${m.id}"]`);
      if (!p) return;
      const i = books.indexOf(m);
      let mode, st;
      if (m.admin && m.id !== sel) {
        // скрытая админка «лежит» за правым краем, пока её не откроют из меню
        mode = 'hidden';
        st = narrow ? { left: '0', width: '100%', top: '0', height: '0' } : { left: '100%', width: '0', top: '0', height: '100%' };
      } else if (!sel) {
        // главная — карточки с отступами (тёмная сцена со свечением)
        mode = 'col';
        const pad = narrow ? 14 : 40, gap = narrow ? 12 : 24;
        st = narrow
          ? { left: `${pad}px`, width: `calc(100% - ${2 * pad}px)`, top: `calc(${pad}px + ${i} * ((100% - ${2 * pad + (n - 1) * gap}px) / ${n} + ${gap}px))`, height: `calc((100% - ${2 * pad + (n - 1) * gap}px) / ${n})` }
          : { left: `calc(${pad}px + ${i} * ((100% - ${2 * pad + (n - 1) * gap}px) / ${n} + ${gap}px))`, width: `calc((100% - ${2 * pad + (n - 1) * gap}px) / ${n})`, top: `${pad}px`, height: `calc(100% - ${2 * pad}px)` };
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
    stage.classList.toggle('is-home', !sel);
    Object.assign(content.style, { left: `${left}px`, top: `${top}px` });
    document.body.classList.toggle('is-focus', !!(sel && state.focus));
    // кнопка «Развернуть / Вернуть книжки» — в шапке, неподвижна
    const fb = $('focusBtn');
    fb.hidden = !sel;
    fb.classList.toggle('is-on', state.focus);
    fb.title = state.focus ? 'Вернуть книжки — показать разделы' : 'Развернуть — только приложение';
    fb.querySelector('.focus-toggle__icon').innerHTML = state.focus ? ICONS.books : ICONS.expand;
    fb.querySelector('.focus-toggle__text').textContent = state.focus ? 'Вернуть книжки' : 'Развернуть';
  }
  narrowQuery.addEventListener('change', layout);

  // ---------- Содержимое ----------
  const header = (m, p) =>
    `<div class="page-head"><p class="crumbs">Развитие / ${esc(m.title)}</p><h1>${esc(p.title)}</h1><p class="sub">${esc(p.about)}</p></div>`;
  // Разворот — только перестройка сцены, содержимое не перерисовывается (плавно, без скачка)
  $('focusBtn').addEventListener('click', () => { state.focus = !state.focus; layout(); });

  // Меню под именем: кто я, почта, «Админка» (только админам)
  const userBtn = $('me');
  const userMenu = $('userMenu');
  userBtn.addEventListener('click', (e) => { e.stopPropagation(); userMenu.hidden = !userMenu.hidden; userBtn.setAttribute('aria-expanded', String(!userMenu.hidden)); });
  document.addEventListener('click', (e) => { if (!userMenu.hidden && !userMenu.contains(e.target)) { userMenu.hidden = true; userBtn.setAttribute('aria-expanded', 'false'); } });
  userMenu.addEventListener('click', (e) => { if (e.target.closest('a')) userMenu.hidden = true; });

  function render() {
    const m = visible().find((x) => x.id === state.mid);
    hideFrames();
    if (!m) { page.innerHTML = ''; return; }
    const p = m.menu.find((i) => i.id === state.pid) || m.menu[0];
    content.style.setProperty('--accent', m.accent);
    content.style.setProperty('--accent-strong', m.strong);
    content.style.setProperty('--tint', m.tint);
    // Приложение во фрейме (заезды) — без заголовков, на всё место справа от меню
    if (p.frame) { page.innerHTML = ''; return showFrame(m, p); }
    page.innerHTML = header(m, p) + '<div class="page" id="pageBody"><p class="muted">Загрузка…</p></div>';
    const box = $('pageBody');
    if (m.soon) {
      box.innerHTML = `<section class="block soon"><span class="soon__art" aria-hidden="true">${m.art}</span><h2 class="block__title">Раздел готовится</h2>
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

  // Кубки за 1–3 место: золото, серебро, бронза
  const CUP_COLORS = { 1: ['#ffe38a', '#f3b72a', '#a8700f'], 2: ['#ffffff', '#c9d0d9', '#7d8794'], 3: ['#ffd1a8', '#d98b4e', '#8a4b20'] };
  const cup = (place) => {
    const c = CUP_COLORS[place];
    if (!c) return '';
    return `<svg class="cup" viewBox="0 0 24 24" aria-label="${place} место"><defs><linearGradient id="cup${place}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient></defs>`
      + `<path d="M7 5H4.6a2.6 2.6 0 0 0 2.7 3.6M17 5h2.4a2.6 2.6 0 0 1-2.7 3.6" stroke="${c[2]}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`
      + `<path d="M6.8 3h10.4v4.2a5.2 5.2 0 0 1-10.4 0z" fill="url(#cup${place})"/><path d="M10.4 12.2h3.2l.7 3.8H9.7z" fill="${c[2]}"/>`
      + `<rect x="7.3" y="16" width="9.4" height="3.6" rx="1.2" fill="url(#cup${place})"/><path d="M9.6 4.8v2.6" stroke="#fff" stroke-opacity=".7" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  };

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
        ${list.length ? `<ol class="records">${list.map((r, i) => `<li class="${me && r.nick === me.nick ? 'is-me' : ''}"><span class="records__place">${cup(i + 1)}${i + 1}</span><span class="records__nick">${esc(r.nick)}</span><span class="records__cpm"><b>${r.cpm}</b> зн/мин</span><span class="records__acc">${r.acc}%</span></li>`).join('')}</ol>`
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

  // ---------- Смена содержимого в такт с книжками ----------
  // Раздел → раздел: старое уезжает вправо и гаснет, новое возвращается справа на место;
  // вместе ровно --morph (620 мс), как перестановка книжек. Пункт меню → пункт: короткое
  // мягкое появление. Быстрые повторные клики: доигрывается только последний переход.
  const MORPH = 620;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  let swapSeq = 0;
  async function swapContent(kind) {
    const seq = ++swapSeq;
    if (calm.matches || !content.animate) return render();
    if (kind === 'module') {
      const out = content.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(90px)', opacity: 0 }],
        { duration: MORPH * 0.4, easing: 'cubic-bezier(.55, 0, 1, .45)', fill: 'forwards' });
      await out.finished.catch(() => {});
      if (seq !== swapSeq) return out.cancel();
      render();
      out.cancel();
      content.animate([{ transform: 'translateX(90px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
        { duration: MORPH * 0.6, easing: 'cubic-bezier(0, .55, .45, 1)' });
    } else {
      render();
      page.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    }
  }

  // ---------- Маршрут: #/раздел/страница ----------
  function route() {
    if (!me) return;
    const [, mid, pid] = location.hash.split('/');
    const m = visible().find((x) => x.id === mid);
    const was = state.mid;
    const wasPage = state.pid;
    state.mid = m ? m.id : null;
    state.pid = m ? (m.menu.find((i) => i.id === pid) || m.menu[0]).id : null;
    if (!m || was !== state.mid) state.focus = false;   // новый раздел — снова с книжками
    $('hello').innerHTML = !m ? `Привет, <b>${esc(String(me.fullName || '').split(/\s+/)[1] || me.nick)}</b>!` : '';
    layout();
    if (was && m && was !== state.mid) swapContent('module');          // книжка → книжка
    else if (was && m && wasPage !== state.pid) swapContent('page');   // пункт меню внутри раздела
    else { swapSeq++; render(); }                                      // с главной / на главную — как было
  }
  window.addEventListener('hashchange', route);
  if (new URLSearchParams(location.search).get('room') && !location.hash) location.hash = '#/races/race';
})();
