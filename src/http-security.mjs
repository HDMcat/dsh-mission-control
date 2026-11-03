import crypto from 'node:crypto';

export const HUD_COOKIE = 'mc_hud';

export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
}

export function isDshAppOrigin(value) {
  return /^dsh-app:\/\//i.test(String(value || ''));
}

export function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (isDshAppOrigin(raw)) return raw.replace(/\/$/, '');
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

export function allowedOriginSet(origins) {
  const out = new Set();
  for (const origin of Array.isArray(origins) ? origins : [origins]) {
    const n = normalizeOrigin(origin);
    if (n) out.add(n);
  }
  return out;
}

export function originAllowed(req, allowed) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin browser requests may omit Origin; Host is still checked.
  if (isDshAppOrigin(origin)) return true;
  return allowed.has(normalizeOrigin(origin));
}

export function mutationOriginAllowed(req, allowed) {
  const origin = req.headers.origin;
  if (!origin) return false; // mutations must come from a browser page, not a blind form/curl.
  return allowed.has(normalizeOrigin(origin));
}

export function setCorsForAllowedOrigin(req, res, allowed) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  const customApp = isDshAppOrigin(origin);
  if (!customApp && !allowed.has(normalized)) return false;
  res.setHeader('Access-Control-Allow-Origin', normalized);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

export function isLoopbackHost(hostHeader, port) {
  const host = String(hostHeader || '').trim().toLowerCase();
  if (!host) return false;
  const expected = Number(port);
  if (!Number.isInteger(expected) || expected <= 0) return false;
  const forms = new Set([
    `127.0.0.1:${expected}`,
    `localhost:${expected}`,
    `[::1]:${expected}`,
  ]);
  return forms.has(host);
}

export function cookieValue(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    return part.slice(idx + 1).trim();
  }
  return '';
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function safeEqualString(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length || aa.length === 0) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function setHudCookie(res, token, maxAge = 86400) {
  res.setHeader('Set-Cookie',
    `${HUD_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
}
