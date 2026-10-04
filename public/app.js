(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // Комичные кричалки: меняются от заезда к заезду.
  const QUIPS = [
    'Кто последний — тот под тапком!',
    'Тараканы на старте, нервишки — вразнос.',
    'Беги, рыжий, беги, пока свет не включили!',
    'Промахнулся по клавише — считай, уже на тапке.',
    'Усами не маши — пальцами работай.',
    'Медленный таракан — сытый кот.',
    'На кухне погаснет свет — победит самый быстрый.',
    'Опечатка — и ты уже закуска.',
    'Спринт по плинтусу: орфография решает.',
    'Шурши клавишами, а не тараканьими лапками.',
    'Кто не успел — того веником.',
    'Дихлофос уже близко, набирай быстрее!',
    'Чемпион кухни получает хлебную крошку.',
    'Бежим за печеньком, остальное — суета.',
    'Один неверный знак — и привет, мухобойка.',
    'Тараканьи бега: тут выживает самый грамотный.',
  ];
  let lastQuip = -1;
  function newQuip() {
    let i = lastQuip;
    while (QUIPS.length > 1 && i === lastQuip) i = Math.floor(Math.random() * QUIPS.length);
    lastQuip = i;
    const q = $('quip');
    if (q) q.textContent = QUIPS[i];
  }

  const store = {
    get(k) {
      try { return localStorage.getItem(k); } catch { return null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); } catch { /* приватный режим - не страшно */ }
    },
  };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Состояние ----------
  const socket = io();
  const track = new window.Track($('track'));
  window.RoachArt.startHeroRoach($('hero'));

  let me = { id: null, nick: '' };
  let joined = null; // как переподключаться: {mode, code, nick}
  let room = null;
  let clockOffset = null;
  let botLevel = 'medium'; // выбранная сложность бота (у админа комнаты)
  const BOT_LABELS = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', insane: 'Терминатор' };

  // набор текста
  let text = '';
  let pos = 0;
  let errAt = false; // на текущей букве стоит ошибка: таракан замер, пока не нажмут верную
  let errors = 0;
  let gaveUp = false; // игрок сдался в этом заезде
  let raceStartAt = 0;
  let lastSentPos = 0;

  const serverNow = () => Date.now() + (clockOffset || 0);
  const myPlayer = () => (room ? room.players.find((p) => p.id === me.id) : null);

  // ---------- Вход ----------
  const nickInput = $('nick');
  const codeInput = $('code');
  nickInput.value = store.get('nick') || '';

  const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (urlRoom) {
    codeInput.value = urlRoom;
    $('quickBtn').textContent = `В комнату ${urlRoom}`;
  }

  function showLoginError(msg) {
    $('loginError').textContent = msg || '';
  }

  function join(mode, code) {
    const nick = nickInput.value.trim();
    if (!nick) {
      showLoginError('Введи ник, чтобы встать на старт.');
      nickInput.focus();
      return;
    }
    showLoginError('');
    store.set('nick', nick);
    const payload = { nick, mode, code };
    if (mode === 'create') payload.name = $('roomName').value.trim();
    socket.emit('join', payload, (res) => {
      if (!res || res.error) {
        showLoginError(res ? res.error : 'Сервер не ответил. Попробуй ещё раз.');
        return;
      }
      me = { id: res.you, nick: res.nick };
      // auto - быстрый общий заезд (вернёмся в любой свободный), иначе держимся за код комнаты
      joined = res.auto ? { mode: 'quick', nick } : { mode: 'code', code: res.code, nick };
      history.replaceState(null, '', res.auto ? location.pathname : `?room=${res.code}`);
      showScreen('race');
    });
  }

  $('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (urlRoom) join('code', urlRoom);
    else join('quick');
  });
  $('createBtn').addEventListener('click', () => join('create'));
  $('codeBtn').addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) {
      showLoginError('Впиши код комнаты, который тебе прислали.');
      codeInput.focus();
      return;
    }
    join('code', code);
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('codeBtn').click();
    }
  });

  function showScreen(name) {
    $('login').hidden = name !== 'login';
    $('race').hidden = name !== 'race';
    if (name === 'race') {
      track.resize(true);
      focusInput();
    }
  }

  $('leaveBtn').addEventListener('click', () => {
    socket.emit('leave');
    joined = null;
    room = null;
    resetTyping();
    history.replaceState(null, '', location.pathname);
    showScreen('login');
  });

  $('giveupBtn').addEventListener('click', () => {
    if (gaveUp || !room || room.state !== 'racing') return;
    gaveUp = true;
    socket.emit('giveup');
    setHint('Ты сдался. Таракан замер — ждём финиша остальных.');
  });

  $('copyLink').addEventListener('click', async () => {
    if (!room) return;
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      flashButton($('copyLink'), 'Ссылка скопирована');
    } catch {
      prompt('Скопируй ссылку на комнату:', link);
    }
  });

  function flashButton(btn, label) {
    const old = btn.dataset.label || btn.textContent;
    btn.dataset.label = old;
    btn.textContent = label;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => (btn.textContent = old), 1800);
  }

  // ---------- Рекорды ----------
  socket.on('records', (list) => {
    const ol = $('recordsList');
    if (!list || !list.length) {
      ol.innerHTML = '<li class="empty">Таблица пока пуста. Пройди заезд и окажешься в ней первым.</li>';
      return;
    }
    ol.innerHTML = list
      .map((r) => `<li><span class="r-nick">${escapeHtml(r.nick)}</span><span class="r-cpm">${r.cpm} зн/мин</span></li>`)
      .join('');
  });

  // ---------- Список открытых комнат ----------
  socket.on('rooms', (list) => renderRooms(list));

  function renderRooms(list) {
    const ul = $('roomsList');
    if (!ul) return;
    if (!list || !list.length) {
      ul.innerHTML = '<li class="empty">Пока пусто — создай первую комнату или жми «Быстрая гонка».</li>';
      return;
    }
    ul.innerHTML = list
      .map((r) => {
        const racing = r.state !== 'waiting';
        const full = r.count >= r.max;
        const status = racing ? 'бежит' : full ? 'полна' : 'ждут';
        const dis = racing || full;
        return (
          `<li class="room-item${dis ? ' closed' : ''}">` +
          `<span class="room-name">${escapeHtml(r.name)}</span>` +
          `<span class="room-count">${r.count}/${r.max}</span>` +
          `<span class="room-state">${status}</span>` +
          `<button type="button" class="btn small" data-code="${escapeHtml(r.code)}"${dis ? ' disabled' : ''}>Зайти</button>` +
          `</li>`
        );
      })
      .join('');
  }

  $('roomsList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-code]');
    if (btn) join('code', btn.getAttribute('data-code'));
  });

  // Админ комнаты выгнал
  socket.on('kicked', () => {
    joined = null;
    room = null;
    resetTyping();
    history.replaceState(null, '', location.pathname);
    showScreen('login');
    showLoginError('Админ комнаты высадил тебя из заезда.');
    socket.emit('rooms');
  });

  // ---------- Соединение ----------
  socket.on('connect', () => {
    $('offline').hidden = true;
    if (joined) {
      // переподключились - встаём обратно в ту же комнату
      socket.emit('join', { nick: joined.nick, mode: joined.mode, code: joined.code }, (res) => {
        if (res && res.ok) me = { id: res.you, nick: res.nick };
      });
    }
  });
  socket.on('disconnect', () => {
    if (joined) $('offline').hidden = false;
  });

  socket.on('state', (s) => {
    const measured = s.serverNow - Date.now();
    // задержка сети всегда занижает оценку, поэтому держимся за максимум
    clockOffset = clockOffset === null || measured > clockOffset ? measured : clockOffset * 0.98 + measured * 0.02;

    const prev = room;
    room = s;
    const mine = myPlayer();

    const raceBegan = (s.state === 'countdown' || s.state === 'racing') && s.startAt && s.startAt !== raceStartAt;
    if (raceBegan) beginRace(s);
    if (s.state === 'waiting' && (!prev || prev.state !== 'waiting')) {
      resetTyping();
      track.resetPositions();
    }

    const lane = s.state === 'waiting' ? s.players : s.players.filter((p) => !p.spectator);
    track.setRace(lane, me.id, s.state === 'waiting' ? 1 : s.text.length);
    track.setPhase(s.state); // трибуны реагируют на отсчёт, старт и финиш
    if (mine && !mine.spectator && s.state !== 'waiting') track.setProgress(me.id, pos);

    renderHeader();
    renderPanels();
    renderStandings();
    renderSpectators();
    renderText();
    updateStats();
    if (raceBegan) focusInput(); // поле ввода стало видимым только сейчас
  });

  // ---------- Заезд ----------
  function beginRace(s) {
    raceStartAt = s.startAt;
    text = s.text;
    pos = 0;
    errAt = false;
    errors = 0;
    gaveUp = false;
    lastSentPos = 0;
    newQuip();
    track.resetPositions();
    setHint('');
    resetField();
    focusInput();
  }

  function resetTyping() {
    text = '';
    pos = 0;
    errAt = false;
    errors = 0;
    gaveUp = false;
    raceStartAt = 0;
    lastSentPos = 0;
    setHint('');
  }

  function canType() {
    if (!room || !text || gaveUp) return false;
    const mine = myPlayer();
    if (!mine || mine.spectator || mine.finished || pos >= text.length) return false;
    if (room.state === 'racing') return true;
    return room.state === 'countdown' && serverNow() >= room.startAt;
  }

  // "е" и "ё" считаем одной буквой
  const norm = (c) => (c === 'ё' ? 'е' : c === 'Ё' ? 'Е' : c === '\u00a0' ? ' ' : c);
  const same = (a, b) => a === b || norm(a) === norm(b);

  const isTouch = window.matchMedia('(hover: none)').matches;
  const isLatin = (c) => /[a-z]/i.test(c);
  const isCyrillic = (c) => /[а-яё]/i.test(c);

  function onChar(ch) {
    if (!canType()) return;
    const expected = text[pos];
    if (same(ch, expected)) {
      // верная буква - таракан делает шаг, ошибка (если была) снимается
      pos++;
      errAt = false;
      setHint('');
      track.setProgress(me.id, pos);
      sendProgress();
    } else {
      // неверная буква - курсор НЕ двигается, стоит на той же букве, пока не нажмут верную
      if (!errAt) {
        errAt = true;
        errors++; // одна буква - одна ошибка, сколько ни долби мимо
      }
      if (isTouch && navigator.vibrate) {
        try { navigator.vibrate(25); } catch { /* не все браузеры разрешают */ }
      }
      if (isLatin(ch) && isCyrillic(expected)) setHint('Похоже, включена английская раскладка. Переключись на русскую.');
      else setHint('Не та буква - таракан замер. Нажми правильную, чтобы бежать дальше.');
      shake();
    }
    renderText();
    updateStats();
  }

  function onBackspace() {
    // отдельно стирать ничего не нужно: курсор и так ждёт верную букву.
    // Backspace просто гасит красную подсветку, если захотелось "передохнуть".
    if (!errAt) return;
    errAt = false;
    setHint('');
    renderText();
  }

  function sendProgress() {
    lastSentPos = pos;
    socket.emit('progress', { pos, errors });
  }

  // страховка: если пакет потерялся при переподключении - повторим
  setInterval(() => {
    if (!room || room.state !== 'racing') return;
    const mine = myPlayer();
    if (mine && !mine.spectator && pos > 0 && mine.progress < pos) socket.emit('progress', { pos, errors });
  }, 1000);

  // ---------- Ввод ----------
  const input = $('typeInput');

  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      onBackspace(e.ctrlKey || e.altKey || e.metaKey);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onChar(e.key);
    }
  });

  // Мобильные клавиатуры (особенно Android) не сообщают клавишу в keydown и набирают
  // слово «составом», переписывая уже введённое. Поэтому поле не чистим на каждой букве,
  // а сравниваем, что в нём было и что стало: новые символы - это нажатия.
  let shadow = '';
  let composing = false;
  const resetField = () => {
    input.value = '';
    shadow = '';
  };
  input.addEventListener('compositionstart', () => (composing = true));
  input.addEventListener('compositionend', () => (composing = false));
  input.addEventListener('input', () => {
    const v = input.value;
    let i = 0;
    while (i < shadow.length && i < v.length && shadow[i] === v[i]) i++;
    const removed = shadow.length - i;
    const added = v.slice(i);
    shadow = v;
    if (removed > 0 && !added) onBackspace();
    for (const ch of added) onChar(ch);
    // поле не копим: чистим на границе слова, когда клавиатура не собирает слово
    if (!composing && (v.endsWith(' ') || v.length > 30)) resetField();
  });
  input.addEventListener('blur', () => {
    if (!composing) resetField();
  });
  input.addEventListener('paste', (e) => e.preventDefault());
  input.addEventListener('drop', (e) => e.preventDefault());
  input.addEventListener('focus', () => $('textBox').classList.add('focused'));
  input.addEventListener('blur', () => $('textBox').classList.remove('focused'));

  // открылась клавиатура телефона - подтягиваем трассу к верху экрана,
  // чтобы над клавиатурой были видны и тараканы, и текст
  function pinStageOnPhone() {
    if ($('race').hidden || document.activeElement !== input || window.innerWidth >= 760) return;
    const stage = document.querySelector('.race-stage');
    requestAnimationFrame(() => {
      const top = stage.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top - 2), behavior: 'auto' });
    });
  }
  if (window.visualViewport) window.visualViewport.addEventListener('resize', pinStageOnPhone);
  input.addEventListener('focus', () => setTimeout(pinStageOnPhone, 350));

  function focusInput() {
    if (!$('race').hidden) input.focus({ preventScroll: true });
  }

  $('race').addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    focusInput();
  });
  document.addEventListener('keydown', (e) => {
    if ($('race').hidden || document.activeElement === input) return;
    if (e.target.closest('button, input, a')) return;
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      focusInput();
      onBackspace(e.altKey);
    } else if (e.key.length === 1) {
      e.preventDefault();
      focusInput();
      onChar(e.key);
    }
  });

  // ---------- Отрисовка ----------
  function renderText() {
    const box = $('textBox');
    const mine = myPlayer();
    if (!room || room.state === 'waiting' || !text) {
      box.className = 'text-box placeholder' + (document.activeElement === input ? ' focused' : '');
      box.textContent = 'Текст появится здесь, как только начнётся отсчёт.';
      return;
    }
    const spectator = mine && mine.spectator;
    box.className =
      'text-box' +
      (spectator ? ' spectator' : '') +
      (document.activeElement === input ? ' focused' : '') +
      (room.state === 'countdown' && serverNow() < room.startAt ? ' waiting' : '');

    if (spectator) {
      box.textContent = text;
      return;
    }

    const done = text.slice(0, pos);
    const cur = pos < text.length ? text[pos] : '';
    const rest = text.slice(pos + 1);
    box.innerHTML =
      `<span class="t-done">${escapeHtml(done)}</span>` +
      (cur ? `<span class="t-cur${errAt ? ' error' : ''}">${escapeHtml(cur)}</span>` : '') +
      `<span class="t-rest">${escapeHtml(rest)}</span>`;
    keepCursorVisible(box);
  }

  // В невысоком окне (телефон) держим текущую строку у верхнего края:
  // как только дописал строку, текст сам поднимается, и печатаешь всегда вверху -
  // ничего не закрывает адресная строка браузера, и палец не нужен.
  function keepCursorVisible(box) {
    const curEl = box.querySelector('.t-cur') || box.querySelector('.t-rest');
    if (!curEl || box.scrollHeight <= box.clientHeight + 2) return;
    const padTop = parseFloat(getComputedStyle(box).paddingTop) || 0;
    box.scrollTop = Math.max(0, curEl.offsetTop - padTop);
  }

  function shake() {
    const box = $('textBox');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  function setHint(msg) {
    $('hint').textContent = msg;
  }

  function renderHeader() {
    if (!room) return;
    const count = room.players.length;
    const where = room.auto ? 'Общий заезд' : `Комната «${room.name}»`;
    const codePart = !room.auto ? ` · код ${room.code}` : '';
    $('roomLabel').textContent = `${where} · тараканов ${count}/${room.maxPlayers}${codePart}`;
    $('copyLink').hidden = room.auto; // в именованных комнатах можно звать по ссылке
    const mineNow = myPlayer();
    const inRace = room.state === 'racing' || room.state === 'countdown';
    $('giveupBtn').hidden = !(inRace && mineNow && !mineNow.spectator && !mineNow.finished);
  }

  function renderSpectators() {
    const el = $('spectators');
    if (!room) return;
    const list = room.state === 'waiting' ? [] : room.players.filter((p) => p.spectator);
    el.textContent = list.length ? `Ждут следующего заезда: ${list.map((p) => p.nick).join(', ')}` : '';
  }

  // Лобби и результаты показываем под трассой (на месте текста),
  // а поверх трассы - только большой обратный отсчёт.
  let boardKey = '';
  let overlayKey = '';
  function renderPanels() {
    if (!room) return;
    const mine = myPlayer();
    const typingVisible = room.state === 'countdown' || room.state === 'racing';
    $('typing').hidden = !typingVisible;
    $('board').hidden = typingVisible;

    // --- табло под трассой ---
    const isHost = room.hostId === me.id;
    const host = room.players.find((p) => p.id === room.hostId);
    let html = '';
    let key = room.state;

    if (room.state === 'waiting') {
      const players = room.players;
      const alone = players.length < 2;
      const sig = players.map((p) => `${p.id}:${p.nick}:${p.ready ? 1 : 0}:${p.bot ? p.level : ''}`).join('|');
      key += `|${sig}|${isHost}|${room.autoStartAt}|${botLevel}`;

      let note;
      if (alone && !room.auto) note = 'Позови друзей по ссылке или добавь ботов. Старт даёшь ты.';
      else if (room.auto && alone) note = 'Заезд стартует сам, когда подтянется ещё таракан. Не хочешь ждать - добавь бота или жми «Старт».';
      else note = 'Жмите «Готов» и ждите, пока админ даст старт.';

      const rosterRows = players
        .map((p) => {
          const you = p.id === me.id;
          const isHostP = p.id === room.hostId;
          const badges = [you ? 'ты' : '', isHostP ? 'админ' : '', p.bot ? 'бот · ' + (BOT_LABELS[p.level] || '') : '']
            .filter(Boolean)
            .map((b) => `<span class="tag">${b}</span>`)
            .join('');
          const ready = p.bot ? true : p.ready;
          const kick = isHost && !you ? `<button type="button" class="kick" title="Выгнать" data-kick="${p.id}">✕</button>` : '';
          return (
            `<li class="${you ? 'you' : ''}">` +
            `<span class="s-dot" style="background:${p.color}"></span>` +
            `<span class="l-nick">${escapeHtml(p.nick)} ${badges}</span>` +
            `<span class="l-ready ${ready ? 'on' : ''}">${ready ? 'готов' : '…'}</span>` +
            kick +
            `</li>`
          );
        })
        .join('');

      const readyBtn =
        mine && !mine.spectator
          ? `<button type="button" class="btn ${mine.ready ? '' : 'primary'}" data-action="ready">${mine.ready ? 'Готов ✓ (отменить)' : 'Я готов!'}</button>`
          : '';
      const botBox = isHost
        ? `<div class="bot-box">
             <select data-botlevel aria-label="Сложность бота">
               <option value="easy">Лёгкий</option>
               <option value="medium">Средний</option>
               <option value="hard">Сложный</option>
               <option value="insane">Терминатор</option>
             </select>
             <button type="button" class="btn small" data-action="addbot"${players.length >= room.maxPlayers ? ' disabled' : ''}>+ таракан-бот</button>
           </div>`
        : '';
      const startBtn = isHost
        ? '<button type="button" class="btn primary big" data-action="start">Старт</button>'
        : `<p class="muted">Старт даёт ${escapeHtml(host ? host.nick : 'админ')}.</p>`;

      html = `
        <div class="lobby">
          <div class="lobby-head">
            <h2>${alone && !room.auto ? 'Ты пока один на старте' : 'Тараканы в боксах'}</h2>
            <p>${note}</p>
            ${room.autoStartAt ? '<p class="auto">Автостарт через <b data-auto></b> с</p>' : ''}
          </div>
          <ul class="roster">${rosterRows}</ul>
          <div class="lobby-controls">
            ${readyBtn}
            ${startBtn}
            ${botBox}
          </div>
        </div>`;
    } else if (room.state === 'finished') {
      key += `|${room.resetAt}`;
      const rows = room.players
        .filter((p) => !p.spectator && p.place)
        .sort((a, b) => a.place - b.place)
        .map(
          (p) => `
          <tr class="${p.id === me.id ? 'you' : ''}">
            <td><span class="place" style="--c:${p.color}">${p.dnf ? '–' : p.place}</span></td>
            <td class="nick">${escapeHtml(p.nick)}</td>
            <td>${p.cpm} зн/мин</td>
            <td>${p.acc}%</td>
            <td>${p.dnf ? 'не добежал' : formatTime(p.time)}</td>
          </tr>`
        )
        .join('');
      html = `
        <h2>Финиш</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Место</th><th>Таракан</th><th>Скорость</th><th>Точность</th><th>Время</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="auto">Следующий заезд через <b data-reset></b> с</p>`;
    }

    if (!typingVisible && key !== boardKey) {
      boardKey = key;
      $('board').innerHTML = html;
      const sel = $('board').querySelector('[data-botlevel]');
      if (sel) sel.value = botLevel;
    }
    if (typingVisible) boardKey = '';

    // --- отсчёт поверх трассы ---
    const ov = $('overlay');
    const showCount = room.state === 'countdown' && !(mine && mine.spectator);
    const oKey = showCount ? `count|${room.startAt}` : '';
    if (oKey !== overlayKey) {
      overlayKey = oKey;
      ov.innerHTML = showCount ? '<div class="count" data-count aria-live="assertive"></div>' : '';
      ov.hidden = !showCount;
    }
    if (room.state !== 'countdown') ov.hidden = true;

    if (mine && mine.spectator && typingVisible) setHint('Заезд уже идёт. Ты побежишь в следующем.');
    tickUi();
  }

  $('board').addEventListener('click', (e) => {
    const kickBtn = e.target.closest('[data-kick]');
    if (kickBtn) {
      socket.emit('kick', { id: kickBtn.getAttribute('data-kick') });
      return;
    }
    const act = e.target.closest('[data-action]');
    if (!act) return;
    const a = act.getAttribute('data-action');
    if (a === 'start') {
      socket.emit('start');
      act.disabled = true;
    } else if (a === 'ready') {
      const meP = myPlayer();
      socket.emit('ready', { ready: !(meP && meP.ready) });
    } else if (a === 'addbot') {
      socket.emit('addBot', { level: botLevel });
    }
  });

  $('board').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-botlevel]');
    if (sel) botLevel = sel.value;
  });

  function formatTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function updateStats() {
    const mine = myPlayer();
    const racing = room && (room.state === 'racing' || room.state === 'finished') && room.startAt;
    let elapsed = 0;
    if (racing) {
      const end = mine && mine.finished ? room.startAt + mine.time : room.state === 'finished' ? Math.min(serverNow(), room.endAt) : serverNow();
      elapsed = Math.max(0, end - room.startAt);
    }
    const cpm = elapsed > 1500 ? Math.round(pos / (elapsed / 60000)) : 0;
    const acc = pos + errors ? Math.round((1000 * pos) / (pos + errors)) / 10 : 100;
    $('statSpeed').textContent = mine && mine.finished ? mine.cpm : cpm;
    $('statAcc').textContent = acc;
    $('statTime').textContent = formatTime(elapsed);
    const progress = text ? Math.round((100 * pos) / text.length) : 0;
    $('statProgress').textContent = progress;
  }

  // Таблица мест слева в центре кольца: кто где едет / финишировал.
  function renderStandings() {
    const el = $('standingsList');
    if (!el) return;
    if (!room) { el.innerHTML = ''; return; }
    const waiting = room.state === 'waiting';
    const racing = room.state === 'racing' || room.state === 'countdown';
    const players = waiting ? room.players.slice() : room.players.filter((p) => !p.spectator);
    const len = room.text ? room.text.length : (text ? text.length : 1);

    if (racing) players.sort((a, b) => (b.progress || 0) - (a.progress || 0));
    else if (room.state === 'finished') players.sort((a, b) => (a.place || 99) - (b.place || 99));

    el.innerHTML = players
      .map((p, i) => {
        const you = p.id === me.id;
        let val = '';
        if (racing) val = Math.round((100 * (p.progress || 0)) / Math.max(1, len)) + '%';
        else if (room.state === 'finished') val = p.dnf ? 'сошёл' : (p.place ? '#' + p.place : '');
        else if (waiting) val = (p.bot || p.ready) ? '✓' : '';
        const rank = waiting ? '' : i + 1;
        return (
          `<li class="${you ? 'you' : ''}">` +
          `<span class="s-rank">${rank}</span>` +
          `<span class="s-dot" style="background:${p.color}"></span>` +
          `<span class="s-nick">${escapeHtml(p.nick)}${you ? ' <em>ты</em>' : ''}</span>` +
          `<span class="s-val">${val}</span>` +
          `</li>`
        );
      })
      .join('');
  }

  // таймеры обратного отсчёта
  function tickUi() {
    if (!room) return;
    const now = serverNow();
    const auto = document.querySelector('[data-auto]');
    if (auto && room.autoStartAt) auto.textContent = Math.max(0, Math.ceil((room.autoStartAt - now) / 1000));
    const reset = document.querySelector('[data-reset]');
    if (reset && room.resetAt) reset.textContent = Math.max(0, Math.ceil((room.resetAt - now) / 1000));
    const count = document.querySelector('[data-count]');
    if (count) {
      const left = Math.ceil((room.startAt - now) / 1000);
      const label = left > 0 ? String(left) : 'Марш!';
      if (count.textContent !== label) {
        count.textContent = label;
        count.classList.remove('pop');
        void count.offsetWidth;
        count.classList.add('pop');
      }
      if (left <= 0) {
        renderText();
        if (now - room.startAt > 700) $('overlay').hidden = true;
      }
    }
    if (room.state === 'racing') {
      updateStats();
      renderStandings();
    }
  }
  setInterval(tickUi, 100);
})();
