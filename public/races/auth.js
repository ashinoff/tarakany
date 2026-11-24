// Вход для страницы бегов. Токен Keycloak присылает окно-родитель: оболочка «Развитие»
// (тот же сайт) или сама Платформа (web-desktop), сообщением { type: 'platform-auth', token }.
// Мы шлём родителю { type: 'app-ready' }, он отвечает токеном (и шлёт новый, когда старый
// продлён). Ник сервер берёт из проверенного токена — ФИО пользователя платформы.
(function () {
  'use strict';

  const PLATFORM_ORIGINS = ['https://sue-system-2-ashinoff.waw0.amvera.tech', 'http://localhost:5173', location.origin];
  const embedded = window.self !== window.top;
  // Внутри оболочки «Развитие» (тот же сайт) её шапка уже есть — свою большую не показываем
  try { if (embedded && window.parent.location.origin === location.origin) document.documentElement.classList.add('in-shell'); } catch { /* чужой родитель */ }
  let token = null;
  const waiting = [];
  const listeners = [];

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !PLATFORM_ORIGINS.includes(e.origin)) return;
    // оболочка «Развитие» открыта не в Платформе (тестовый стенд) — входа не будет, не ждём
    if (e.data && e.data.type === 'no-auth' && e.origin === location.origin) { waiting.splice(0).forEach((fn) => fn(null)); return; }
    if (!e.data || e.data.type !== 'platform-auth' || !e.data.token) return;
    token = e.data.token;
    waiting.splice(0).forEach((fn) => fn(token));
    listeners.forEach((fn) => fn(token));
  });

  const ask = () => { if (embedded) window.parent.postMessage({ type: 'app-ready' }, '*'); };

  window.RaceAuth = {
    embedded,
    current: () => token,
    /** Токен (вне фрейма — null: локальная разработка без платформы). */
    token(timeoutMs = 8000) {
      if (token || !embedded) return Promise.resolve(token);
      return new Promise((resolve) => {
        waiting.push(resolve);
        ask();
        setTimeout(() => resolve(token), timeoutMs);
      });
    },
    refresh: ask,
    onToken: (fn) => listeners.push(fn),
    headers: () => (token ? { Authorization: `Bearer ${token}` } : {}),
  };
  ask();
})();
