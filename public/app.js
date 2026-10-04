(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MAX_WRONG = 8; // сколько неверных символов можно набрать подряд, прежде чем ввод "упрётся"

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

  // набор текста
  let text = '';
  let pos = 0;
  let wrong = '';
  let errors = 0;
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
    socket.emit('join', { nick, mode, code }, (res) => {
      if (!res || res.error) {
        showLoginError(res ? res.error : 'Сервер не ответил. Попробуй ещё раз.');
        return;
      }
      me = { id: res.you, nick: res.nick };
      joined = res.isPrivate ? { mode: 'code', code: res.code, nick } : { mode: 'quick', nick };
      history.replaceState(null, '', res.isPrivate ? `?room=${res.code}` : location.pathname);
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
    if (mine && !mine.spectator && s.state !== 'waiting') track.setProgress(me.id, pos);

    renderHeader();
    renderPanels();
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
    wrong = '';
    errors = 0;
    lastSentPos = 0;
    track.resetPositions();
    setHint('');
    focusInput();
  }

  function resetTyping() {
    text = '';
    pos = 0;
    wrong = '';
    errors = 0;
    raceStartAt = 0;
    lastSentPos = 0;
    setHint('');
  }

  function canType() {
    if (!room || !text) return false;
    const mine = myPlayer();
    if (!mine || mine.spectator || pos >= text.length) return false;
    if (room.state === 'racing') return true;
    return room.state === 'countdown' && serverNow() >= room.startAt;
  }

  // "е" и "ё" считаем одной буквой
  const norm = (c) => (c === 'ё' ? 'е' : c === 'Ё' ? 'Е' : c === '\u00a0' ? ' ' : c);
  const same = (a, b) => a === b || norm(a) === norm(b);

  const isLatin = (c) => /[a-z]/i.test(c);
  const isCyrillic = (c) => /[а-яё]/i.test(c);

  function onChar(ch) {
    if (!canType()) return;
    const expected = text[pos];
    if (!wrong && same(ch, expected)) {
      pos++;
      setHint('');
      track.setProgress(me.id, pos);
      sendProgress();
    } else {
      if (wrong.length < MAX_WRONG) {
        wrong += ch;
        errors++;
      }
      if (isLatin(ch) && isCyrillic(expected)) setHint('Похоже, включена английская раскладка. Переключись на русскую.');
      else if (wrong.length >= MAX_WRONG) setHint('Сотри ошибку клавишей Backspace, чтобы бежать дальше.');
      shake();
    }
    renderText();
    updateStats();
  }

  function onBackspace(all) {
    if (!wrong) return;
    wrong = all ? '' : wrong.slice(0, -1);
    if (!wrong) setHint('');
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

  // мобильные клавиатуры часто не сообщают клавишу в keydown - ловим через input
  input.addEventListener('input', () => {
    const v = input.value;
    input.value = '';
    for (const ch of v) onChar(ch);
  });
  input.addEventListener('paste', (e) => e.preventDefault());
  input.addEventListener('drop', (e) => e.preventDefault());
  input.addEventListener('focus', () => $('textBox').classList.add('focused'));
  input.addEventListener('blur', () => $('textBox').classList.remove('focused'));

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

    const errEnd = Math.min(text.length, pos + wrong.length);
    const done = text.slice(0, pos);
    const err = text.slice(pos, errEnd);
    const cur = errEnd < text.length ? text[errEnd] : '';
    const rest = text.slice(errEnd + 1);
    box.innerHTML =
      `<span class="t-done">${escapeHtml(done)}</span>` +
      (err ? `<span class="t-err">${escapeHtml(err)}</span>` : '') +
      (cur ? `<span class="t-cur${wrong ? ' after-err' : ''}">${escapeHtml(cur)}</span>` : '') +
      `<span class="t-rest">${escapeHtml(rest)}</span>`;
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
    $('roomLabel').textContent = room.isPrivate
      ? `Комната ${room.code}, тараканов: ${count} из ${room.maxPlayers}`
      : `Общий заезд, тараканов: ${count} из ${room.maxPlayers}`;
    $('copyLink').hidden = !room.isPrivate;
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
      const alone = room.players.length < 2;
      key += `|${room.players.length}|${isHost}|${room.autoStartAt}|${host && host.nick}`;
      let note;
      if (room.isPrivate) note = 'Отправь друзьям ссылку на комнату. Заезд запускает тот, кто зашёл первым.';
      else if (alone) note = 'Заезд стартует сам, когда подтянется ещё кто-нибудь. Можно не ждать и пробежать одному.';
      else note = 'Скоро старт. Положи пальцы на клавиатуру.';
      html = `
        <div class="board-row">
          <div>
            <h2>${alone ? 'Пока ты один на старте' : 'Тараканы в боксах'}</h2>
            <p>${note}</p>
            ${room.autoStartAt ? '<p class="auto">Старт через <b data-auto></b> с</p>' : ''}
          </div>
          ${isHost
            ? '<button type="button" class="btn primary big" data-action="start">Старт</button>'
            : `<p class="muted">Заезд запустит ${escapeHtml(host ? host.nick : 'создатель комнаты')}.</p>`}
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
    const btn = e.target.closest('[data-action="start"]');
    if (btn) {
      socket.emit('start');
      btn.disabled = true;
    }
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
    $('statPlace').textContent = mine && mine.finished && !mine.dnf ? `Финиш! Место: ${mine.place}` : '';
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
    if (room.state === 'racing') updateStats();
  }
  setInterval(tickUi, 100);
})();
