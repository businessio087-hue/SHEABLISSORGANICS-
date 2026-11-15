import crypto from 'node:crypto';

export const SESSION_COOKIE = 'webdev_app_session';
export const NONCE_COOKIE = 'sheabliss_oauth_nonce';
export const STATE_SECONDS = 600;
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

export class AccountError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => { throw new AccountError(status, message); };
export const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const mac = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
export const equal = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export function configFromEnvironment() {
  const config = {
    projectId: process.env.MANUS_PROJECT_ID,
    secret: process.env.MANUS_JWT_SECRET,
    portalUrl: process.env.MANUS_OAUTH_PORTAL_URL,
    apiUrl: process.env.MANUS_OAUTH_API_URL,
  };
  if (Object.values(config).some((value) => typeof value !== 'string' || !value)) {
    fail(503, 'Account services are not configured. Please try again later.');
  }
  if (config.projectId.length > 191) fail(503, 'Account services are not configured.');
  for (const value of [config.portalUrl, config.apiUrl]) {
    let url;
    try { url = new URL(value); } catch { fail(503, 'Account services are not configured.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      fail(503, 'Account services are not configured.');
    }
  }
  return config;
}

export function browserOrigin(value) {
  if (typeof value !== 'string' || value.length > 2048) fail(403, 'A valid application origin is required.');
  let url;
  try { url = new URL(value); } catch { fail(403, 'A valid application origin is required.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== value || url.username || url.password ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) {
    fail(403, 'A valid application origin is required.');
  }
  return url.origin;
}

export function normalizeProxyOrigin(req) {
  // Preview rebases Origin and Host to its loopback listener. The browser supplies its
  // public origin explicitly; only same-origin Fetch Metadata requests are eligible.
  // Cross-site requests, direct public origins and absent/invalid metadata are untouched.
  const supplied = req.headers['x-app-origin'];
  const transport = req.headers.origin;
  if (!supplied || !transport || req.headers['sec-fetch-site'] !== 'same-origin') return;
  let internal;
  try { internal = new URL(transport); } catch { return; }
  if (internal.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(internal.hostname)) return;
  if (transport !== `http://${req.headers.host}`) return;
  const publicOrigin = browserOrigin(supplied);
  if (!publicOrigin.startsWith('https:')) return;
  if (req.headers.referer) {
    let referer;
    try { referer = new URL(req.headers.referer); } catch { return; }
    if (referer.origin !== transport && referer.origin !== publicOrigin) return;
    if (referer.origin === transport) req.headers.referer = publicOrigin;
  }
  req.headers.origin = publicOrigin;
}

export function requestOrigin(req) {
  if (req.headers.origin) return browserOrigin(req.headers.origin);
  if (req.headers.referer) {
    try { return browserOrigin(new URL(req.headers.referer).origin); } catch { /* fail closed below */ }
  }
  // Optional same-origin custom header for browsers which suppress Referer.
  if (req.headers['x-app-origin']) return browserOrigin(req.headers['x-app-origin']);
  return null;
}

export function enforceMutationOrigin(req, expectedOrigin = null) {
  const origin = browserOrigin(req.headers.origin);
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && fetchSite !== 'same-origin') fail(403, 'Cross-origin requests are not allowed.');
  if (expectedOrigin && origin !== expectedOrigin) fail(403, 'Cross-origin requests are not allowed.');
  if (req.headers.referer) {
    let refererOrigin;
    try { refererOrigin = new URL(req.headers.referer).origin; } catch { fail(403, 'Cross-origin requests are not allowed.'); }
    if (refererOrigin !== origin) fail(403, 'Cross-origin requests are not allowed.');
  }
  return origin;
}

export function readCookie(req, name) {
  const matches = String(req.headers.cookie || '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return value.length <= 8192 ? value : null;
}
export function sessionToken(req) {
  // Do not accept an Authorization fallback when an invalid/duplicate session cookie exists.
  if (String(req.headers.cookie || '').split(';').some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`))) {
    return readCookie(req, SESSION_COOKIE);
  }
  const authorization = req.headers.authorization;
  return typeof authorization === 'string' && /^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(authorization)
    ? authorization.slice(7) : null;
}

export function cookieValue(name, value, origin, maxAge) {
  const secure = !origin || browserOrigin(origin).startsWith('https:');
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}${secure ? '; Secure' : ''}; Max-Age=${maxAge}${maxAge === 0 ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT' : ''}`;
}
export function setCookie(res, name, value, origin, maxAge) {
  const existing = res.getHeader('Set-Cookie');
  const values = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader('Set-Cookie', [...values, cookieValue(name, value, origin, maxAge)]);
}

export function signJwt(payload, config) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.${mac(`${header}.${body}`, config.secret)}`;
}
export function verifyJwt(token, config, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || token.length > 8192) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || (header.typ !== undefined && header.typ !== 'JWT')) return null;
    if (!equal(signature, mac(`${encodedHeader}.${encodedPayload}`, config.secret))) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload || payload.appId !== config.projectId || !Number.isSafeInteger(payload.exp) || payload.exp <= now ||
        typeof payload.openId !== 'string' || !payload.openId.trim() || payload.openId.length > 191 || /[\x00-\x1f\x7f]/.test(payload.openId)) return null;
    if (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > now)) return null;
    if (payload.iat !== undefined && (!Number.isSafeInteger(payload.iat) || payload.iat > now + 60)) return null;
    if (payload.origin !== undefined) browserOrigin(payload.origin);
    return payload;
  } catch { return null; }
}

export function makeState(redirectUri, nonce, config, now) {
  const payload = { redirectUri, nonce, appId: config.projectId, exp: now + STATE_SECONDS, purpose: 'sheabliss-oauth-state-v1' };
  const signature = mac(`sheabliss-state:${JSON.stringify(payload)}`, config.secret);
  // Manus expects base64 JSON containing redirectUri and nonce, not an OIDC state JWT.
  return Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64');
}
export function verifyState(encoded, nonceCookie, config, now) {
  try {
    if (typeof encoded !== 'string' || encoded.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
    const state = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const { redirectUri, nonce, appId, exp, purpose, signature } = state;
    if (appId !== config.projectId || purpose !== 'sheabliss-oauth-state-v1' || !Number.isSafeInteger(exp) || exp <= now || exp > now + STATE_SECONDS ||
        typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || !equal(nonce, nonceCookie)) return null;
    const payload = { redirectUri, nonce, appId, exp, purpose };
    if (!equal(signature, mac(`sheabliss-state:${JSON.stringify(payload)}`, config.secret))) return null;
    const url = new URL(redirectUri);
    browserOrigin(url.origin);
    if (url.pathname !== '/api/account/callback' || url.search || url.hash || url.username || url.password) return null;
    return payload;
  } catch { return null; }
}

export function makeCsrf(token, origin, session, config, now) {
  if (!origin) return null;
  const payload = { session: hash(token), origin: browserOrigin(origin), exp: Math.min(session.exp, now + 7200) };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${mac(`sheabliss-csrf:${encoded}`, config.secret)}`;
}
export function checkCsrf(req, token, session, config, now) {
  const origin = enforceMutationOrigin(req, session.origin || null);
  const csrf = req.headers['x-csrf-token'];
  try {
    if (typeof csrf !== 'string' || csrf.length > 4096) throw new Error();
    const [encoded, signature, extra] = csrf.split('.');
    if (extra !== undefined || !encoded || !equal(signature, mac(`sheabliss-csrf:${encoded}`, config.secret))) throw new Error();
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!equal(payload.session, hash(token)) || payload.origin !== origin || !Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.exp > session.exp) throw new Error();
  } catch { fail(403, 'Your security token has expired. Refresh the account page and try again.'); }
  return origin;
}

const text = (value, max, required = true) => {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') fail(400, 'Please provide valid account details.');
  const clean = value.trim();
  if ((required && !clean) || clean.length > max || /[\x00-\x1f\x7f]/.test(clean)) fail(400, 'Please provide valid account details.');
  return clean;
};
export function validEmail(value) {
  return typeof value === 'string' && value.length <= 320 && /^[^\s@\x00-\x1f]+@[^\s@\x00-\x1f]+\.[^\s@\x00-\x1f]+$/.test(value);
}
export function basicIdentity(session) {
  const name = typeof session.name === 'string' && session.name.length <= 255 && !/[\x00-\x1f\x7f]/.test(session.name) ? session.name.trim() : '';
  const email = validEmail(session.email) ? session.email.trim() : '';
  return name || email ? { name, email } : null;
}
export function validateProfile(body, registration = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Please provide valid account details.');
  if (registration && body.acceptedTerms !== true) fail(400, 'Accept the terms before creating your account.');
  const suppliedAddress = body.address === undefined ? {} : body.address;
  if (!suppliedAddress || typeof suppliedAddress !== 'object' || Array.isArray(suppliedAddress)) fail(400, 'Please provide valid delivery details.');
  const name = text(body.name, 255);
  const phone = text(body.phone, 40, false);
  const address = {
    streetAddress: text(suppliedAddress.streetAddress, 255, false),
    suburb: text(suppliedAddress.suburb, 120, false),
    postalCode: text(suppliedAddress.postalCode, 10, false),
    buildingType: text(suppliedAddress.buildingType, 80, false),
    companyName: text(suppliedAddress.companyName, 160, false),
  };
  if ((phone && (!/^\+?[0-9()\-\s]{7,39}$/.test(phone) || phone.replace(/\D/g, '').length < 7)) ||
      (address.postalCode && !/^[0-9]{4}$/.test(address.postalCode))) {
    fail(400, 'Please provide a valid phone number and four-digit South African postal code.');
  }
  return { name, phone, address };
}

export function readJson(req, maxBytes = 16 * 1024) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(req.headers['content-type'] || ''))) {
    fail(415, 'Send account requests as application/json.');
  }
  const declared = req.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) fail(413, 'The request is too large.');
  return new Promise((resolve, reject) => {
    let settled = false;
    let bytes = 0;
    const chunks = [];
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new AccountError(408, 'The request took too long.')), 10000);
    timer.unref();
    req.on('data', (chunk) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > maxBytes) finish(new AccountError(413, 'The request is too large.'));
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        finish(null, value);
      } catch { finish(new AccountError(400, 'The request must contain a valid JSON object.')); }
    });
    req.on('error', () => finish(new AccountError(400, 'The request could not be read.')));
    req.on('aborted', () => finish(new AccountError(400, 'The request was interrupted.')));
  });
}
