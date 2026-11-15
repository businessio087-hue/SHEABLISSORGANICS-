import test from 'node:test';
import assert from 'node:assert/strict';

let sequence = 0;
async function client(t, fetchImpl) {
  const keys = ['document', 'CustomEvent', 'location', 'fetch'];
  const previous = new Map(keys.map((key) => [key, globalThis[key]]));
  const events = [];
  globalThis.document = { dispatchEvent: (event) => events.push(event.detail) };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  globalThis.location = { origin: 'https://store.example' };
  globalThis.fetch = fetchImpl;
  t.after(() => { for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const source = new URL('../src/customer-session.js', import.meta.url);
  source.searchParams.set('test', String(++sequence));
  return { api: await import(source.href), events };
}
const guest = { authenticated: false, registered: false, user: null, identity: null, csrfToken: null };
const registered = { authenticated: true, registered: true, user: { id: 'test-owner' }, identity: null, csrfToken: 'isolated-test-token' };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('a late session response cannot restore customer state after authoritative logout', async (t) => {
  let resolve;
  const { api, events } = await client(t, () => new Promise((done) => { resolve = done; }));
  const old = api.getCustomerSession();
  api.setCustomerSession(guest);
  resolve(response(registered));
  assert.equal((await old).authenticated, false);
  assert.equal(api.customerSnapshot().session.authenticated, false);
  assert.equal(events.length, 1);
});

test('successful logout immediately consumes the server guest response without another lookup', async (t) => {
  let gets = 0;
  const { api } = await client(t, async (_url, options) => {
    if (options.method === 'POST') return response(guest);
    gets += 1;
    return response(registered);
  });
  api.setCustomerSession(registered);
  await api.accountRequest('logout', 'POST', {});
  assert.equal(api.customerSnapshot().session.authenticated, false);
  assert.equal(gets, 1);
});

test('wishlist ownership snapshots expire on sign-out and account changes', async (t) => {
  const { api } = await client(t, async () => response(guest));
  api.setCustomerSession(registered);
  const revision = api.customerSnapshot().revision;
  assert.equal(api.isCurrentCustomer('test-owner', revision), true);
  api.setCustomerSession(guest);
  assert.equal(api.isCurrentCustomer('test-owner', revision), false);
  api.setCustomerSession({ ...registered, user: { id: 'another-test-owner' } });
  assert.equal(api.isCurrentCustomer('test-owner', revision), false);
});
