import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createAccountService } from './accounts.mjs';
import {
  SESSION_COOKIE, NONCE_COOKIE, browserOrigin, cookieValue, signJwt, verifyJwt,
  verifyState, makeState, validateProfile, hash, normalizeProxyOrigin, enforceMutationOrigin,
} from './account-security.mjs';

// All identities, tokens and database rows below are synthetic isolated test fixtures.
// The production environment and default database pool are never consulted.
const CONFIG = {
  projectId: 'isolated-account-test-project',
  secret: 'isolated-test-signing-secret-not-a-live-credential',
  portalUrl: 'https://provider.test',
  apiUrl: 'https://provider-api.test',
};
const ORIGIN = 'https://shop.test';
const NOW = 1800000000;
const PROFILE = {
  name: 'Test Customer', phone: '+27 82 123 4567', acceptedTerms: true,
  address: { streetAddress: '10 Test Street', suburb: 'Test Suburb', postalCode: '8001', buildingType: 'House', companyName: '' },
};

class MemoryDatabase {
  migrations = new Map();
  customers = new Map();
  states = new Map();
  revoked = new Map();
  wishlist = new Map();
  statements = [];
  releases = 0;
  schemaCreates = 0;
  async getConnection() { return { query: this.query.bind(this), execute: this.execute.bind(this), release: () => { this.releases += 1; } }; }
  async query(sql) {
    assert.match(sql.trim(), /^CREATE TABLE IF NOT EXISTS sb_/);
    this.schemaCreates += 1;
    return [[], []];
  }
  async execute(sql, parameters = []) {
    const s = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ sql: s, parameters });
    const [a, b, c] = parameters;
    const rows = (items) => [items, []];
    const result = (count) => [{ affectedRows: count }, []];
    if (s.startsWith('SELECT checksum FROM sb_account_migrations')) return rows(this.migrations.has(a) ? [{ checksum: this.migrations.get(a) }] : []);
    if (s.startsWith('INSERT IGNORE INTO sb_account_migrations')) {
      if (this.migrations.has(a)) return result(0);
      this.migrations.set(a, b); return result(1);
    }
    if (s.startsWith('INSERT INTO sb_account_oauth_states')) { this.states.set(a, { nonce: b, exp: c }); return result(1); }
    if (s.startsWith('DELETE FROM sb_account_oauth_states WHERE state_hash')) {
      const state = this.states.get(a);
      if (state?.nonce === b && state.exp > c) { this.states.delete(a); return result(1); }
      return result(0);
    }
    if (s.startsWith('DELETE FROM sb_account_oauth_states WHERE expires_at')) {
      for (const [key, value] of this.states) if (value.exp <= a) this.states.delete(key);
      return result(0);
    }
    if (s.startsWith('SELECT token_hash FROM sb_account_revoked_sessions')) {
      const row = this.revoked.get(a);
      return rows(row?.appId === b && row.exp > c ? [{ token_hash: a }] : []);
    }
    if (s.startsWith('INSERT IGNORE INTO sb_account_revoked_sessions')) { this.revoked.set(a, { appId: b, exp: c }); return result(1); }
    if (s.startsWith('DELETE FROM sb_account_revoked_sessions')) {
      for (const [key, value] of this.revoked) if (value.exp <= a) this.revoked.delete(key);
      return result(0);
    }
    if (s.startsWith('SELECT id, name, email, phone, street_address')) {
      return rows([...this.customers.values()].filter((row) => row.app_id === a && row.open_id === b).slice(0, 1));
    }
    if (s.startsWith('INSERT INTO sb_customers')) {
      const [id, app_id, open_id, name, email, phone, street_address, suburb, postal_code, building_type, company_name] = parameters;
      if ([...this.customers.values()].some((row) => row.app_id === app_id && row.open_id === open_id)) throw Object.assign(new Error('test duplicate'), { code: 'ER_DUP_ENTRY' });
      this.customers.set(id, { id, app_id, open_id, name, email, phone, street_address, suburb, postal_code, building_type, company_name });
      return result(1);
    }
    if (s.startsWith('UPDATE sb_customers SET name')) {
      const [name, phone, street_address, suburb, postal_code, building_type, company_name, id, appId, openId] = parameters;
      const row = this.customers.get(id);
      if (!row || row.app_id !== appId || row.open_id !== openId) return result(0);
      Object.assign(row, { name, phone, street_address, suburb, postal_code, building_type, company_name });
      return result(1);
    }
    if (s.startsWith('SELECT product FROM sb_customer_wishlist')) return rows([...(this.wishlist.get(a) || [])].map((product) => ({ product })));
    if (s.startsWith('INSERT IGNORE INTO sb_customer_wishlist')) {
      const items = this.wishlist.get(a) || new Set();
      const existed = items.has(b); items.add(b); this.wishlist.set(a, items); return result(existed ? 0 : 1);
    }
    if (s.startsWith('DELETE FROM sb_customer_wishlist')) return result(this.wishlist.get(a)?.delete(b) ? 1 : 0);
    throw new Error(`Unimplemented isolated DB statement: ${s}`);
  }
}

async function fixture({ providerEmail = 'verified@example.test' } = {}) {
  const database = new MemoryDatabase();
  const providerCalls = [];
  let now = NOW;
  const service = createAccountService({
    database, getConfig: () => CONFIG, clock: () => now,
    fetchImpl: async (url, options) => {
      providerCalls.push({ url, body: JSON.parse(options.body) });
      const data = url.endsWith('/ExchangeToken')
        ? { accessToken: 'isolated-provider-access-token', tokenType: 'Bearer', idToken: 'opaque-not-a-jwt', refreshToken: 'unused' }
        : { openId: 'verified-test-identity', name: 'Provider Name', email: providerEmail };
      return { ok: true, text: async () => JSON.stringify(data) };
    },
  });
  await service.ensureAccountSchema();
  async function request(method, url, { cookie, body, csrf, origin = ORIGIN, referer = `${ORIGIN}/account.html`, headers = {} } = {}) {
    const req = new PassThrough();
    req.method = method; req.url = url; req.socket = { remoteAddress: 'test-client' };
    req.headers = {
      ...(origin ? { origin } : {}), ...(referer ? { referer } : {}),
      ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      'sec-fetch-site': 'same-origin', ...headers,
    };
    const responseHeaders = new Map();
    const res = {
      statusCode: 200, headersSent: false, writableEnded: false,
      setHeader: (key, value) => responseHeaders.set(key.toLowerCase(), value),
      getHeader: (key) => responseHeaders.get(key.toLowerCase()),
      end: (value = '') => { res.text = value; res.headersSent = true; res.writableEnded = true; },
    };
    const pending = service.accountApiHandler(req, res);
    req.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
    const handled = await pending;
    let data;
    try { data = JSON.parse(res.text); } catch { data = null; }
    return { status: res.statusCode, headers: responseHeaders, data, handled, text: res.text };
  }
  const token = (openId = 'verified-test-identity', extra = {}) => signJwt({ appId: CONFIG.projectId, openId, name: 'Provider Name', email: providerEmail, iat: now, exp: now + 3600, ...extra }, CONFIG);
  const cookieFor = (value) => `${SESSION_COOKIE}=${value}`;
  const session = async (value) => (await request('GET', '/api/account/session', { cookie: cookieFor(value) })).data;
  return { database, service, request, providerCalls, token, cookieFor, session, advance: (seconds) => { now += seconds; } };
}

const setCookie = (response, name) => response.headers.get('set-cookie')?.find((value) => value.startsWith(`${name}=`))?.split(';')[0];

test('JWT fails closed on wrong key, expiry, project, algorithm, openId and future nbf', () => {
  const claims = { appId: CONFIG.projectId, openId: 'test-id', exp: NOW + 10 };
  const valid = signJwt(claims, CONFIG);
  assert.equal(verifyJwt(valid, CONFIG, NOW).openId, 'test-id');
  assert.equal(verifyJwt(valid, { ...CONFIG, secret: 'different-test-key' }, NOW), null);
  for (const extra of [{ exp: NOW }, { appId: 'other-project' }, { openId: '' }, { openId: 42 }, { nbf: NOW + 1 }, { exp: 'later' }, { origin: 'http://public.test' }]) {
    assert.equal(verifyJwt(signJwt({ ...claims, ...extra }, CONFIG), CONFIG, NOW), null);
  }
  const [header, body] = valid.split('.');
  assert.equal(verifyJwt(`${header}.${body}.invalid`, CONFIG, NOW), null);
  assert.equal(verifyJwt(`${Buffer.from('{"alg":"none"}').toString('base64url')}.${body}.signature`, CONFIG, NOW), null);
});

test('signed state binds browser nonce, project, fixed callback and expiry', () => {
  const nonce = 'a'.repeat(43);
  const state = makeState(`${ORIGIN}/api/account/callback`, nonce, CONFIG, NOW);
  assert.ok(verifyState(state, nonce, CONFIG, NOW));
  assert.equal(verifyState(state, 'b'.repeat(43), CONFIG, NOW), null);
  assert.equal(verifyState(state, nonce, CONFIG, NOW + 600), null);
  assert.equal(verifyState(state, nonce, { ...CONFIG, projectId: 'other-project' }, NOW), null);
  assert.equal(verifyState(makeState(`${ORIGIN}/elsewhere`, nonce, CONFIG, NOW), nonce, CONFIG, NOW), null);
  const modified = JSON.parse(Buffer.from(state, 'base64').toString());
  modified.redirectUri = 'https://evil.test/api/account/callback';
  assert.equal(verifyState(Buffer.from(JSON.stringify(modified)).toString('base64'), nonce, CONFIG, NOW), null);
});

test('public HTTPS cookie is iframe-compatible and plain HTTP is loopback-only', () => {
  assert.match(cookieValue(SESSION_COOKIE, 'test', ORIGIN, 100), /HttpOnly; SameSite=None; Secure/);
  assert.match(cookieValue(SESSION_COOKIE, 'test', 'http://localhost:3000', 100), /SameSite=Lax; Max-Age=100/);
  assert.throws(() => browserOrigin('http://shop.test'));
  assert.throws(() => browserOrigin('https://shop.test/path'));
  assert.throws(() => browserOrigin('https://user:password@shop.test'));
  assert.throws(() => validateProfile({ ...PROFILE, acceptedTerms: false }, true));
  assert.throws(() => validateProfile({ ...PROFILE, name: 'x'.repeat(256) }, true));
  assert.throws(() => validateProfile({ ...PROFILE, phone: '-------' }, true));
});

test('migration is additive, completed once, and releases all borrowed connections', async () => {
  const f = await fixture();
  const before = f.database.schemaCreates;
  const repeated = await f.service.ensureAccountSchema();
  assert.equal(repeated.applied, true); // same fulfilled promise, no repeat SQL
  assert.equal(f.database.schemaCreates, before);
  assert.equal(f.database.migrations.size, 1);
  assert.equal(f.database.releases, 1);
  const restarted = createAccountService({ database: f.database, getConfig: () => CONFIG });
  assert.equal((await restarted.ensureAccountSchema()).applied, false);
  assert.equal(f.database.schemaCreates, before + 1); // migration-table IF NOT EXISTS only
  assert.equal(f.database.releases, 2);
});

test('OAuth uses actual browser origin, verifies nonce, establishes identity without customer registration and rejects replay', async () => {
  const f = await fixture();
  const login = await f.request('POST', '/api/account/login', { body: { origin: ORIGIN } });
  assert.equal(login.status, 200);
  const providerUrl = new URL(login.data.url);
  assert.equal(providerUrl.pathname, '/app-auth');
  assert.equal(providerUrl.searchParams.get('redirectUri'), `${ORIGIN}/api/account/callback`);
  assert.equal(providerUrl.searchParams.get('responseType'), 'code');
  const state = providerUrl.searchParams.get('state');
  const callbackUrl = `/api/account/callback?code=test-authorization-code&state=${encodeURIComponent(state)}`;
  const nonceCookie = setCookie(login, NONCE_COOKIE);
  assert.match(login.headers.get('set-cookie')[0], /SameSite=None; Secure/);
  const wrongBrowser = await f.request('GET', callbackUrl, { cookie: `${NONCE_COOKIE}=${'b'.repeat(43)}`, origin: null, referer: null });
  assert.equal(wrongBrowser.status, 400);
  assert.equal(f.providerCalls.length, 0);
  const callback = await f.request('GET', callbackUrl, { cookie: nonceCookie, origin: null, referer: null });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/account.html');
  assert.equal(f.database.customers.size, 0);
  assert.equal(f.providerCalls.length, 2);
  assert.equal(f.providerCalls[0].body.grantType, 'authorization_code');
  assert.equal(f.providerCalls[1].body.accessToken, 'isolated-provider-access-token');
  const sessionCookie = setCookie(callback, SESSION_COOKIE);
  const result = await f.request('GET', '/api/account/session', { cookie: sessionCookie });
  assert.equal(result.data.authenticated, true);
  assert.equal(result.data.registered, false);
  assert.equal(result.data.user, null);
  assert.deepEqual(result.data.identity, { name: 'Provider Name', email: 'verified@example.test' });
  assert.ok(result.data.csrfToken);
  assert.match(result.headers.get('cache-control'), /no-store/);
  const replay = await f.request('GET', callbackUrl, { cookie: nonceCookie, origin: null, referer: null });
  assert.equal(replay.status, 400);
  assert.equal(f.providerCalls.length, 2);
});

test('verified Preview JWT remains authenticated but wishlist requires an actual registered customer', async () => {
  const f = await fixture();
  const jwt = f.token();
  const preview = await f.session(jwt);
  assert.equal(preview.authenticated, true);
  assert.equal(preview.registered, false);
  assert.ok(preview.csrfToken);
  assert.equal((await f.request('GET', '/api/account/wishlist')).status, 401);
  assert.equal((await f.request('GET', '/api/account/wishlist', { cookie: f.cookieFor(jwt) })).status, 403);
  assert.equal((await f.request('GET', '/api/account/session', { cookie: `${SESSION_COOKIE}=invalid` })).data.authenticated, false);
  const duplicate = `${f.cookieFor(jwt)}; ${f.cookieFor(jwt)}`;
  assert.equal((await f.request('GET', '/api/account/session', { cookie: duplicate })).data.authenticated, false);
  const bearer = await f.request('GET', '/api/account/session', { headers: { authorization: `Bearer ${jwt}` } });
  assert.equal(bearer.data.authenticated, true);
});

test('registration, profile, wishlist and logout enforce CSRF, verified email and row ownership', async () => {
  const f = await fixture();
  const jwt = f.token();
  const cookie = f.cookieFor(jwt);
  const csrf = (await f.session(jwt)).csrfToken;
  assert.equal((await f.request('POST', '/api/account/register', { cookie, body: PROFILE })).status, 403);
  assert.equal((await f.request('POST', '/api/account/register', { cookie, csrf, body: { ...PROFILE, acceptedTerms: false } })).status, 400);
  const saved = await f.request('POST', '/api/account/register', { cookie, csrf, body: { ...PROFILE, email: 'attacker@example.test', id: 'another-row', openId: 'other-person' } });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.registered, true);
  assert.equal(saved.data.user.email, 'verified@example.test');
  assert.equal(saved.data.user.name, PROFILE.name);
  assert.deepEqual(saved.data.user.address, PROFILE.address);
  const customerId = saved.data.user.id;
  const repeated = await f.request('POST', '/api/account/register', { cookie, csrf, body: { ...PROFILE, name: 'Do not overwrite' } });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.user.name, PROFILE.name);
  const otherJwt = f.token('other-test-identity', { email: 'other@example.test' });
  const otherCookie = f.cookieFor(otherJwt);
  const otherCsrf = (await f.session(otherJwt)).csrfToken;
  const other = await f.request('POST', '/api/account/register', { cookie: otherCookie, csrf: otherCsrf, body: { ...PROFILE, name: 'Other Customer' } });
  const changed = await f.request('PUT', '/api/account/profile', { cookie, csrf, body: { ...PROFILE, id: other.data.user.id, name: 'Updated Customer', email: 'forged@example.test' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.id, customerId);
  assert.equal(changed.data.user.email, 'verified@example.test');
  assert.equal(f.database.customers.get(other.data.user.id).name, 'Other Customer');
  for (let i = 0; i < 2; i += 1) {
    const add = await f.request('PUT', '/api/account/wishlist', { cookie, csrf, body: { product: 'Organic Sheabutter', customerId: other.data.user.id } });
    assert.equal(add.status, 200);
    assert.deepEqual(add.data.items, [{ product: 'Organic Sheabutter' }]);
  }
  assert.deepEqual((await f.request('GET', '/api/account/wishlist', { cookie: otherCookie })).data.items, []);
  assert.equal((await f.request('PUT', '/api/account/wishlist', { cookie, csrf, body: { product: 'Body' } })).status, 400);
  assert.equal((await f.request('PUT', '/api/account/wishlist', { cookie, csrf, body: { product: "' OR 1=1 --" } })).status, 400);
  assert.equal((await f.request('PUT', '/api/account/wishlist', { cookie, csrf, origin: 'https://evil.test', referer: 'https://evil.test/', body: { product: 'Hair Butter' } })).status, 403);
  assert.equal((await f.request('PUT', '/api/account/wishlist', { cookie, csrf: otherCsrf, body: { product: 'Hair Butter' } })).status, 403);
  for (let i = 0; i < 2; i += 1) {
    assert.deepEqual((await f.request('DELETE', '/api/account/wishlist', { cookie, csrf, body: { product: 'Organic Sheabutter' } })).data.items, []);
  }
  assert.equal((await f.request('POST', '/api/account/logout', { cookie })).status, 403);
  const logout = await f.request('POST', '/api/account/logout', { cookie, csrf, body: {} });
  assert.equal(logout.status, 200);
  assert.equal(logout.data.authenticated, false);
  assert.ok(f.database.revoked.has(hash(jwt)));
  assert.match(logout.headers.get('set-cookie')[0], /Max-Age=0/);
  assert.equal((await f.session(jwt)).authenticated, false);
  assert.equal((await f.session(otherJwt)).authenticated, true);
  assert.equal(f.database.customers.size, 2);
});

test('missing verified email does not create a customer and request limits/errors remain generic', async () => {
  const f = await fixture({ providerEmail: '' });
  const jwt = f.token(); const cookie = f.cookieFor(jwt); const csrf = (await f.session(jwt)).csrfToken;
  assert.equal((await f.request('POST', '/api/account/register', { cookie, csrf, body: PROFILE })).status, 422);
  assert.equal(f.database.customers.size, 0);
  assert.equal((await f.request('POST', '/api/account/register', { cookie, csrf, body: 'x'.repeat(20000) })).status, 413);
  assert.equal((await f.request('POST', '/api/account/register', { cookie, csrf, body: '{bad json' })).status, 400);
  assert.equal((await f.request('POST', '/api/account/register', { cookie, csrf, body: PROFILE, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await f.request('POST', '/api/account/login', { body: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await f.request('POST', '/api/account/login', { body: { origin: ORIGIN }, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await f.request('OPTIONS', '/api/account/wishlist')).status, 405);
  assert.equal((await f.request('GET', '/api/account/unknown')).status, 404);
  assert.equal((await f.request('GET', '/api/yoco/orders')).handled, false);
  const clean = await f.request('GET', '/api/account/session');
  assert.equal(clean.headers.has('access-control-allow-origin'), false);
  f.database.execute = async () => { throw new Error('raw SQL with secrets must never be exposed'); };
  const broken = await f.request('GET', '/api/account/session', { cookie });
  assert.equal(broken.status, 503);
  assert.doesNotMatch(broken.text, /raw SQL|secrets/);
});

test('API requests never prepare missing schema or write when a guest asks for session', async () => {
  let statements = 0;
  const database = { execute: async () => { statements += 1; return [[], []]; }, query: async () => { throw new Error('unexpected DDL'); } };
  const service = createAccountService({ database, getConfig: () => CONFIG, clock: () => NOW });
  const req = { method: 'GET', url: '/api/account/session', headers: {}, socket: { remoteAddress: 'test' } };
  const headers = new Map();
  const res = { setHeader: (key, value) => headers.set(key, value), end: (value) => { res.body = JSON.parse(value); } };
  assert.equal(await service.accountApiHandler(req, res), true);
  assert.equal(res.body.authenticated, false);
  assert.equal(statements, 0);
  await assert.rejects(service.checkAccountReadiness(), /awaiting deployment preparation/);
  assert.equal(statements, 1);
});

test('account name alone can register and optional delivery fields can be saved or cleared', async () => {
  const f = await fixture();
  const jwt = f.token(); const cookie = f.cookieFor(jwt); const csrf = (await f.session(jwt)).csrfToken;
  const minimal = { name: 'Minimal Customer', acceptedTerms: true };
  const saved = await f.request('POST', '/api/account/register', { cookie, csrf, body: minimal });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.user.phone, '');
  assert.deepEqual(saved.data.user.address, { streetAddress: '', suburb: '', postalCode: '', buildingType: '', companyName: '' });
  const partial = await f.request('PUT', '/api/account/profile', { cookie, csrf, body: { name: 'Minimal Customer', address: { suburb: 'Saved Suburb' } } });
  assert.equal(partial.status, 200);
  assert.equal(partial.data.user.address.suburb, 'Saved Suburb');
  const cleared = await f.request('PUT', '/api/account/profile', { cookie, csrf, body: { name: 'Minimal Customer', phone: '', address: { streetAddress: '', suburb: '', postalCode: '', buildingType: '', companyName: '' } } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.user.address.suburb, '');
  assert.equal((await f.request('PUT', '/api/account/profile', { cookie, csrf, body: { name: 'Minimal Customer', address: { postalCode: 'bad' } } })).status, 400);
});

test('every request revalidates session expiry and expired CSRF cannot mutate', async () => {
  const f = await fixture();
  const jwt = f.token('longer-test-session', { exp: NOW + 20000 });
  const cookie = f.cookieFor(jwt); const csrf = (await f.session(jwt)).csrfToken;
  f.advance(7201);
  assert.equal((await f.session(jwt)).authenticated, true);
  assert.equal((await f.request('POST', '/api/account/register', { cookie, csrf, body: PROFILE })).status, 403);
  assert.equal(f.database.customers.size, 0);
  f.advance(13000);
  assert.equal((await f.session(jwt)).authenticated, false);
  assert.equal((await f.request('POST', '/api/account/register', { cookie, csrf, body: PROFILE })).status, 401);
});

test('OAuth requests are throttled without unbounded rate-limit state', async () => {
  const f = await fixture();
  let response;
  for (let i = 0; i < 21; i += 1) response = await f.request('POST', '/api/account/login', { body: { origin: ORIGIN } });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  f.advance(60);
  assert.equal((await f.request('POST', '/api/account/login', { body: { origin: ORIGIN } })).status, 200);
});

test('only the observed same-origin loopback proxy rewrite is normalized', () => {
  const headers = { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000', 'x-app-origin': ORIGIN, 'sec-fetch-site': 'same-origin' };
  const sameOrigin = { headers: { ...headers } };
  normalizeProxyOrigin(sameOrigin);
  assert.equal(enforceMutationOrigin(sameOrigin), ORIGIN);
  const crossSite = { headers: { ...headers, 'sec-fetch-site': 'cross-site' } };
  normalizeProxyOrigin(crossSite);
  assert.equal(crossSite.headers.origin, headers.origin);
  assert.throws(() => enforceMutationOrigin(crossSite));
  const missingMetadata = { headers: { ...headers } };
  delete missingMetadata.headers['sec-fetch-site'];
  normalizeProxyOrigin(missingMetadata);
  assert.equal(missingMetadata.headers.origin, headers.origin);
  const wrongHost = { headers: { ...headers, host: '127.0.0.1:9999' } };
  normalizeProxyOrigin(wrongHost);
  assert.equal(wrongHost.headers.origin, headers.origin);
  const publicOrigin = { headers: { ...headers, origin: ORIGIN, host: 'shop.test' } };
  normalizeProxyOrigin(publicOrigin);
  assert.equal(publicOrigin.headers.origin, ORIGIN);
});
