'use strict';

// Вход через Платформу (web-desktop): она присылает Keycloak-токен, сервер проверяет
// его подпись по ключам Keycloak (JWKS) — за тесты и задачи начисляются монетки, так
// что «нарисовать» себе пользователя нельзя. Из токена берём ФИО для ника.
//
// AUTH_DISABLED=true (только не в production) — вход без платформы под тестовым
// пользователем, для разработки.

const KEYCLOAK_URL = (process.env.KEYCLOAK_URL || 'https://keycloak-waw-ashinoff.waw0.amvera.tech').replace(/\/+$/, '');
const REALM = process.env.KEYCLOAK_REALM || 'platform';
const ISSUER = `${KEYCLOAK_URL}/realms/${REALM}`;
const CLIENTS = (process.env.KEYCLOAK_CLIENTS || 'web-desktop').split(',').map((s) => s.trim()).filter(Boolean);
const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true' && process.env.NODE_ENV !== 'production';
const NICK_MAX = 24;

let jwks = null;
async function verifier() {
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  jwks ??= createRemoteJWKSet(new URL(`${ISSUER}/protocol/openid-connect/certs`));
  return (token) => jwtVerify(token, jwks, { issuer: ISSUER });
}

/** «Иванов Иван Иванович» → «Иванов И.И.» (ник на трассе и в таблицах). */
function nickOf(claims) {
  const words = String(claims.name || '').trim().split(/\s+/).filter(Boolean);
  const surname = String(claims.family_name || words[0] || '').trim();
  const first = String(claims.given_name || (words[0] === surname ? words[1] : words[0]) || '').trim();
  // отчество: отдельное поле или третье слово полного имени (не фамилия и не имя)
  const middle = String(claims.middle_name || (words.length >= 3 ? words.find((w) => w !== surname && w !== first) : '') || '').trim();
  const initials = [first, middle].filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join('');
  const nick = surname ? `${surname}${initials ? ` ${initials}` : ''}` : String(claims.preferred_username || '').trim();
  return nick.slice(0, NICK_MAX) || 'Таракан';
}

function fullNameOf(claims) {
  const fromParts = [claims.family_name, claims.given_name, claims.middle_name].filter(Boolean).join(' ').trim();
  return String(claims.name || fromParts || claims.preferred_username || '').trim().slice(0, 200);
}

class AuthError extends Error {}

/** Заголовок «Bearer …» или сам токен → { sub, fullName, nick, email }. */
async function identify(tokenOrHeader) {
  const raw = String(tokenOrHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw) {
    if (AUTH_DISABLED) return { sub: 'dev', fullName: 'Тестов Тест Тестович', nick: 'Тестов Т.Т.', email: 'dev@razvitie.local', roles: ['admin'] };
    throw new AuthError('Открой «Развитие» через платформу — вход по учётной записи платформы.');
  }
  let payload;
  try {
    ({ payload } = await (await verifier())(raw));
  } catch {
    throw new AuthError('Вход устарел — обнови страницу платформы.');
  }
  if (CLIENTS.length && payload.azp && !CLIENTS.includes(payload.azp)) throw new AuthError('Токен выдан другому приложению.');
  const roles = (payload.realm_access && Array.isArray(payload.realm_access.roles)) ? payload.realm_access.roles : [];
  return { sub: String(payload.sub), fullName: fullNameOf(payload), nick: nickOf(payload), email: payload.email || null, roles };
}

module.exports = { identify, AuthError, nickOf, fullNameOf, AUTH_DISABLED, NICK_MAX };
