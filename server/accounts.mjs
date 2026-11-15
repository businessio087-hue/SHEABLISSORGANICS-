import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { CATALOG } from '../shared/catalog.mjs';
import {
  AccountError, SESSION_COOKIE, NONCE_COOKIE, STATE_SECONDS, SESSION_SECONDS,
  fail, hash, configFromEnvironment, browserOrigin, normalizeProxyOrigin, requestOrigin, enforceMutationOrigin,
  readCookie, sessionToken, setCookie, signJwt, verifyJwt, makeState, verifyState,
  makeCsrf, checkCsrf, basicIdentity, validEmail, validateProfile, readJson,
} from './account-security.mjs';

const MIGRATION_ID = 'sheabliss_accounts_v1';
const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
const MIGRATION_TABLE_SQL = `CREATE TABLE IF NOT EXISTS sb_account_migrations (
  migration_id VARCHAR(96) NOT NULL PRIMARY KEY,
  checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ${TABLE_OPTIONS}`;
const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS sb_customers (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    app_id VARCHAR(191) NOT NULL,
    open_id VARCHAR(191) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(320) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    street_address VARCHAR(255) NOT NULL,
    suburb VARCHAR(120) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    building_type VARCHAR(80) NOT NULL,
    company_name VARCHAR(160) NOT NULL DEFAULT '',
    accepted_terms_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sb_customer_identity (app_id, open_id)
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS sb_customer_wishlist (
    customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    product VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id, product),
    CONSTRAINT fk_sb_wishlist_customer FOREIGN KEY (customer_id) REFERENCES sb_customers(id)
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS sb_account_oauth_states (
    state_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    nonce_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at BIGINT UNSIGNED NOT NULL,
    INDEX idx_sb_state_expiry (expires_at)
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS sb_account_revoked_sessions (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    app_id VARCHAR(191) NOT NULL,
    expires_at BIGINT UNSIGNED NOT NULL,
    INDEX idx_sb_revocation_expiry (expires_at)
  ) ${TABLE_OPTIONS}`,
];
const SCHEMA_CHECKSUM = hash([MIGRATION_TABLE_SQL, ...SCHEMA_SQL].join('\n'));
const PRODUCT_NAMES = new Set(CATALOG.map((entry) => entry.product));
const CUSTOMER_COLUMNS = 'id, name, email, phone, street_address, suburb, postal_code, building_type, company_name';

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};
const responseHeaders = (res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie, Authorization, Origin');
};
const customerUser = (row) => row ? ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  address: {
    streetAddress: row.street_address,
    suburb: row.suburb,
    postalCode: row.postal_code,
    buildingType: row.building_type,
    companyName: row.company_name,
  },
}) : null;
const guestSession = () => ({ authenticated: false, registered: false, user: null, identity: null, csrfToken: null });

// Dependency injection is only a unit-test seam: the exported production handler always uses
// configured Manus OAuth and DATABASE_URL. There is no HTTP-accessible development login.
export function createAccountService({
  database,
  getConfig = configFromEnvironment,
  fetchImpl = globalThis.fetch,
  clock = () => Math.floor(Date.now() / 1000),
} = {}) {
  let ownPool;
  let migrationPromise;
  let readinessPromise;
  const rateBuckets = new Map();

  const db = () => {
    if (database) return database;
    if (!process.env.DATABASE_URL) fail(503, 'Account services are temporarily unavailable.');
    ownPool ??= mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 4,
      maxIdle: 4,
      idleTimeout: 60000,
      connectTimeout: 10000,
      enableKeepAlive: true,
      queueLimit: 50,
    });
    return ownPool;
  };

  async function ensureAccountSchema() {
    migrationPromise ??= (async () => {
      const connection = await db().getConnection();
      try {
        // MySQL DDL auto-commits: record success only after all additive statements succeed.
        // CREATE IF NOT EXISTS and the unique migration ID also tolerate overlapping releases.
        await connection.query(MIGRATION_TABLE_SQL);
        const [existing] = await connection.execute(
          'SELECT checksum FROM sb_account_migrations WHERE migration_id = ? LIMIT 1', [MIGRATION_ID],
        );
        if (existing.length) {
          if (existing[0].checksum !== SCHEMA_CHECKSUM) fail(503, 'Account schema requires operator attention.');
          return { migration: MIGRATION_ID, applied: false };
        }
        for (const statement of SCHEMA_SQL) await connection.query(statement);
        const [result] = await connection.execute(
          'INSERT IGNORE INTO sb_account_migrations (migration_id, checksum) VALUES (?, ?)',
          [MIGRATION_ID, SCHEMA_CHECKSUM],
        );
        const [record] = await connection.execute(
          'SELECT checksum FROM sb_account_migrations WHERE migration_id = ? LIMIT 1', [MIGRATION_ID],
        );
        if (record[0]?.checksum !== SCHEMA_CHECKSUM) fail(503, 'Account schema requires operator attention.');
        return { migration: MIGRATION_ID, applied: result.affectedRows === 1 };
      } finally { connection.release(); }
    })().catch((error) => { migrationPromise = undefined; throw error; });
    return migrationPromise;
  }

  async function checkAccountReadiness() {
    readinessPromise ??= (async () => {
      const [rows] = await db().execute(
        'SELECT checksum FROM sb_account_migrations WHERE migration_id = ? LIMIT 1', [MIGRATION_ID],
      );
      if (rows[0]?.checksum !== SCHEMA_CHECKSUM) fail(503, 'Account services are awaiting deployment preparation.');
      return true;
    })().catch(() => {
      readinessPromise = undefined;
      fail(503, 'Account services are awaiting deployment preparation. Please try again later.');
    });
    return readinessPromise;
  }

  function rateLimit(req, route) {
    const now = clock();
    const address = req.socket?.remoteAddress || 'unknown';
    const group = route === '/api/account/login' || route === '/api/account/callback' ? 'oauth' : 'account';
    const key = `${address}:${group}`;
    // Do not trust caller-supplied X-Forwarded-For. Keep memory bounded even on direct ingress.
    for (const [id, bucket] of rateBuckets) {
      if (bucket.reset <= now) rateBuckets.delete(id);
    }
    if (!rateBuckets.has(key) && rateBuckets.size >= 2048) {
      fail(429, 'Too many requests. Please try again in a minute.');
    }
    const bucket = rateBuckets.get(key) || { count: 0, reset: now + 60 };
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > (group === 'oauth' ? 20 : 180)) fail(429, 'Too many requests. Please try again in a minute.');
  }

  async function authenticated(req, config, required = true) {
    const token = sessionToken(req);
    const claims = verifyJwt(token, config, clock());
    if (!claims) {
      if (required) fail(401, 'Sign in to continue.');
      return null;
    }
    await checkAccountReadiness();
    const [revoked] = await db().execute(
      'SELECT token_hash FROM sb_account_revoked_sessions WHERE token_hash = ? AND app_id = ? AND expires_at > ? LIMIT 1',
      [hash(token), config.projectId, clock()],
    );
    if (revoked.length) {
      if (required) fail(401, 'Your session has ended. Sign in again.');
      return null;
    }
    const [rows] = await db().execute(
      `SELECT ${CUSTOMER_COLUMNS} FROM sb_customers WHERE app_id = ? AND open_id = ? LIMIT 1`,
      [config.projectId, claims.openId],
    );
    return { token, claims, customer: rows[0] || null };
  }

  const registered = (session) => {
    if (!session.customer) fail(403, 'Create your SheaBliss customer account to use this feature.');
    return session.customer;
  };
  function sessionResponse(req, session, config) {
    if (!session) return guestSession();
    const origin = requestOrigin(req) || session.claims.origin || null;
    if (session.claims.origin && origin !== session.claims.origin) fail(403, 'Cross-origin requests are not allowed.');
    return {
      authenticated: true,
      registered: Boolean(session.customer),
      user: customerUser(session.customer),
      identity: basicIdentity(session.claims),
      csrfToken: makeCsrf(session.token, origin, session.claims, config, clock()),
    };
  }

  async function oauthPost(config, method, body) {
    const endpoint = `${config.apiUrl.replace(/\/$/, '')}/webdev.v1.WebDevAuthPublicService/${method}`;
    let response;
    let data;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'connect-protocol-version': '1' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      const text = await response.text();
      if (text.length > 65536) throw new Error();
      data = JSON.parse(text);
    } catch { fail(502, 'The sign-in provider is unavailable. Please start sign-in again.'); }
    // Provider responses can contain an error even with an HTTP 200 status. Never expose it.
    if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data) || data.error) {
      fail(502, 'Sign-in could not be completed. Please start sign-in again.');
    }
    return data;
  }

  async function login(req, res, config) {
    const origin = enforceMutationOrigin(req);
    const body = await readJson(req);
    if (browserOrigin(body.origin) !== origin) fail(403, 'The sign-in origin does not match this application.');
    await checkAccountReadiness();
    const now = clock();
    const nonce = crypto.randomBytes(32).toString('base64url');
    const redirectUri = `${origin}/api/account/callback`;
    const state = makeState(redirectUri, nonce, config, now);
    await db().execute('DELETE FROM sb_account_oauth_states WHERE expires_at <= ? LIMIT 100', [now]);
    await db().execute(
      'INSERT INTO sb_account_oauth_states (state_hash, nonce_hash, expires_at) VALUES (?, ?, ?)',
      [hash(state), hash(nonce), now + STATE_SECONDS],
    );
    const url = new URL(`${config.portalUrl.replace(/\/$/, '')}/app-auth`);
    url.searchParams.set('appId', config.projectId);
    url.searchParams.set('redirectUri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('responseType', 'code');
    setCookie(res, NONCE_COOKIE, nonce, origin, STATE_SECONDS);
    json(res, 200, { url: url.toString() });
  }

  async function callback(req, res, url, config) {
    const stateValues = url.searchParams.getAll('state');
    const codeValues = url.searchParams.getAll('code');
    if (stateValues.length !== 1 || codeValues.length !== 1 || !codeValues[0] || codeValues[0].length > 4096 || /[\x00-\x1f]/.test(codeValues[0])) {
      fail(400, 'Sign-in could not be verified. Please start sign-in again.');
    }
    const nonce = readCookie(req, NONCE_COOKIE);
    const state = verifyState(stateValues[0], nonce, config, clock());
    if (!state) fail(400, 'Sign-in has expired or could not be verified. Please start sign-in again.');
    const origin = new URL(state.redirectUri).origin;
    await checkAccountReadiness();
    // Atomic deletion is the distributed single-use claim, before exchanging the code.
    const [claimed] = await db().execute(
      'DELETE FROM sb_account_oauth_states WHERE state_hash = ? AND nonce_hash = ? AND expires_at > ?',
      [hash(stateValues[0]), hash(nonce), clock()],
    );
    if (claimed.affectedRows !== 1) fail(400, 'This sign-in request has expired or was already used. Please sign in again.');
    setCookie(res, NONCE_COOKIE, '', origin, 0);
    const exchange = await oauthPost(config, 'ExchangeToken', {
      clientId: config.projectId,
      grantType: 'authorization_code',
      code: codeValues[0],
      redirectUri: state.redirectUri,
    });
    if (typeof exchange.accessToken !== 'string' || !exchange.accessToken || exchange.accessToken.length > 16384 || exchange.tokenType !== 'Bearer') {
      fail(502, 'The sign-in provider returned an invalid session. Please start sign-in again.');
    }
    const identity = await oauthPost(config, 'GetUserInfo', { accessToken: exchange.accessToken });
    const now = clock();
    const claims = {
      appId: config.projectId,
      openId: identity.openId,
      name: typeof identity.name === 'string' && identity.name.length <= 255 && !/[\x00-\x1f\x7f]/.test(identity.name) ? identity.name.trim() : '',
      email: validEmail(identity.email) ? identity.email.trim() : '',
      origin,
      iat: now,
      exp: now + SESSION_SECONDS,
      jti: crypto.randomUUID(),
      iss: 'sheabliss-account',
    };
    const token = signJwt(claims, config);
    if (!verifyJwt(token, config, now)) fail(502, 'The sign-in provider returned an invalid identity. Please start sign-in again.');
    // No customer INSERT here. OAuth identity and customer registration are separate gates.
    // Access/refresh/id tokens are deliberately not retained in the database, cookie or browser.
    setCookie(res, SESSION_COOKIE, token, origin, SESSION_SECONDS);
    res.statusCode = 303;
    res.setHeader('Location', '/account.html');
    res.end();
  }

  async function saveRegistration(req, res, config) {
    const session = await authenticated(req, config);
    checkCsrf(req, session.token, session.claims, config, clock());
    const profile = validateProfile(await readJson(req), true);
    if (session.customer) return json(res, 200, sessionResponse(req, session, config));
    const identity = basicIdentity(session.claims);
    if (!identity?.email) fail(422, 'Sign in again with a verified email before registering your customer account.');
    const id = crypto.randomUUID();
    const a = profile.address;
    try {
      await db().execute(
        `INSERT INTO sb_customers
          (id, app_id, open_id, name, email, phone, street_address, suburb, postal_code, building_type, company_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, config.projectId, session.claims.openId, profile.name, identity.email, profile.phone,
          a.streetAddress, a.suburb, a.postalCode, a.buildingType, a.companyName],
      );
    } catch (error) {
      // A simultaneous registration for this verified identity must not overwrite saved data.
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      const existing = await authenticated(req, config);
      if (!existing.customer) throw error;
      return json(res, 200, sessionResponse(req, existing, config));
    }
    const saved = await authenticated(req, config);
    json(res, 201, sessionResponse(req, saved, config));
  }

  async function saveProfile(req, res, config) {
    const session = await authenticated(req, config);
    const customer = registered(session);
    checkCsrf(req, session.token, session.claims, config, clock());
    const profile = validateProfile(await readJson(req));
    const a = profile.address;
    await db().execute(
      `UPDATE sb_customers SET name = ?, phone = ?, street_address = ?, suburb = ?, postal_code = ?, building_type = ?, company_name = ?
       WHERE id = ? AND app_id = ? AND open_id = ?`,
      [profile.name, profile.phone, a.streetAddress, a.suburb, a.postalCode, a.buildingType, a.companyName,
        customer.id, config.projectId, session.claims.openId],
    );
    json(res, 200, sessionResponse(req, await authenticated(req, config), config));
  }

  async function wishlistItems(customerId) {
    const [rows] = await db().execute(
      'SELECT product FROM sb_customer_wishlist WHERE customer_id = ? ORDER BY created_at, product', [customerId],
    );
    // The catalog is canonical; obsolete rows remain durable but are not exposed as products.
    return rows.filter((row) => PRODUCT_NAMES.has(row.product)).map((row) => ({ product: row.product }));
  }
  async function wishlist(req, res, config) {
    const session = await authenticated(req, config);
    const customer = registered(session);
    if (req.method !== 'GET') {
      checkCsrf(req, session.token, session.claims, config, clock());
      const body = await readJson(req);
      if (typeof body.product !== 'string' || !PRODUCT_NAMES.has(body.product)) {
        fail(400, 'Choose a product from the SheaBliss catalog.');
      }
      if (req.method === 'PUT') {
        // The primary key makes repeated saves idempotent without changing their ordering.
        await db().execute(
          'INSERT IGNORE INTO sb_customer_wishlist (customer_id, product) VALUES (?, ?)',
          [customer.id, body.product],
        );
      } else {
        await db().execute(
          'DELETE FROM sb_customer_wishlist WHERE customer_id = ? AND product = ?', [customer.id, body.product],
        );
      }
    }
    json(res, 200, { items: await wishlistItems(customer.id) });
  }

  async function logout(req, res, config) {
    const session = await authenticated(req, config);
    const origin = checkCsrf(req, session.token, session.claims, config, clock());
    await readJson(req);
    // Durable revocation also blocks replay of a supplied Preview JWT across replicas/restarts.
    // Manus documents no provider revocation endpoint: this logs out this application session,
    // not the user's Manus/platform session. Provider access tokens were never retained.
    await db().execute(
      'INSERT IGNORE INTO sb_account_revoked_sessions (token_hash, app_id, expires_at) VALUES (?, ?, ?)',
      [hash(session.token), config.projectId, session.claims.exp],
    );
    setCookie(res, SESSION_COOKIE, '', origin, 0);
    setCookie(res, NONCE_COOKIE, '', origin, 0);
    await db().execute('DELETE FROM sb_account_revoked_sessions WHERE expires_at <= ? LIMIT 100', [clock()]);
    json(res, 200, guestSession());
  }

  async function accountApiHandler(req, res) {
    let url;
    try { url = new URL(req.url || '/', 'http://internal.invalid'); } catch { return false; }
    const route = url.pathname;
    if (route !== '/api/account' && !route.startsWith('/api/account/')) return false;
    responseHeaders(res);
    try {
      normalizeProxyOrigin(req);
      if ((req.url || '').length > 12288) fail(414, 'The request URL is too long.');
      const allowed = {
        '/api/account/login': ['POST'],
        '/api/account/callback': ['GET'],
        '/api/account/session': ['GET'],
        '/api/account/register': ['POST'],
        '/api/account/profile': ['PUT'],
        '/api/account/logout': ['POST'],
        '/api/account/wishlist': ['GET', 'PUT', 'DELETE'],
      }[route];
      if (!allowed) fail(404, 'Account endpoint not found.');
      if (!allowed.includes(req.method)) {
        res.setHeader('Allow', allowed.join(', '));
        fail(405, 'Method not allowed.');
      }
      rateLimit(req, route);
      const config = getConfig();
      if (route === '/api/account/login') await login(req, res, config);
      else if (route === '/api/account/callback') await callback(req, res, url, config);
      else if (route === '/api/account/session') json(res, 200, sessionResponse(req, await authenticated(req, config, false), config));
      else if (route === '/api/account/register') await saveRegistration(req, res, config);
      else if (route === '/api/account/profile') await saveProfile(req, res, config);
      else if (route === '/api/account/logout') await logout(req, res, config);
      else if (route === '/api/account/wishlist') await wishlist(req, res, config);
    } catch (error) {
      const status = error instanceof AccountError ? error.status : 503;
      const message = error instanceof AccountError ? error.message : 'Account services are temporarily unavailable. Please try again later.';
      if (status === 429) res.setHeader('Retry-After', '60');
      if (status === 408 || status === 413) res.setHeader('Connection', 'close');
      if (['POST', 'PUT', 'DELETE'].includes(req.method)) req.resume?.();
      // Never send or log raw SQL errors, personal data, OAuth codes, JWTs or credentials.
      if (!res.headersSent) json(res, status, { error: message });
      else if (!res.writableEnded) res.end();
    }
    return true;
  }

  async function closeAccountConnections() {
    if (ownPool) {
      const pool = ownPool;
      ownPool = undefined;
      migrationPromise = undefined;
      readinessPromise = undefined;
      await pool.end();
    }
  }
  return { accountApiHandler, ensureAccountSchema, checkAccountReadiness, closeAccountConnections };
}

const service = createAccountService();
export const accountApiHandler = service.accountApiHandler;
export const ensureAccountSchema = service.ensureAccountSchema;
export const checkAccountReadiness = service.checkAccountReadiness;
export const closeAccountConnections = service.closeAccountConnections;
