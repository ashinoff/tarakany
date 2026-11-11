// Встраивание в Платформу (web-desktop, репозиторий SUE_system).
// Внутри iframe платформа присылает Keycloak-токен: { type: 'platform-auth', token }.
// Берём из него только имя для ника - прав в игре нет, поэтому подпись токена не проверяем.
// Сообщения принимаем лишь от родительского окна с известного адреса платформы.
(function () {
  'use strict';

  if (window.self === window.top) return;

  const PLATFORM_ORIGINS = ['https://sue-system-2-ashinoff.waw0.amvera.tech', 'http://localhost:5173'];

  function platformNick(token) {
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const c = JSON.parse(decodeURIComponent(escape(atob(b64))));
      const first = (c.given_name || '').trim();
      const last = (c.family_name || '').trim();
      const nick = first && last ? `${first} ${last[0]}.` : first || c.name || c.preferred_username || '';
      return String(nick).trim().slice(0, 16);
    } catch {
      return '';
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !PLATFORM_ORIGINS.includes(e.origin)) return;
    if (!e.data || e.data.type !== 'platform-auth' || !e.data.token) return;
    const input = document.getElementById('nick');
    const nick = platformNick(e.data.token);
    // свой ник, который игрок уже вводил, не затираем
    if (input && nick && !input.value.trim()) input.value = nick;
  });

  // пинг готовности: платформа ответит токеном, даже если onLoad iframe прошёл раньше
  window.parent.postMessage({ type: 'app-ready' }, '*');
})();
