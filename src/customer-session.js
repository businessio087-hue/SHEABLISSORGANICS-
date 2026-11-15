let session;
let pendingSession;
let sessionEpoch = 0;
let ownerRevision = 0;
let mutationQueue = Promise.resolve();
const guest = () => ({ authenticated: false, registered: false, user: null, identity: null, csrfToken: null });
const ownerKey = (value) => value?.authenticated ? value.registered ? `customer:${value.user?.id}` : `identity:${value.identity?.email || value.identity?.name || ''}` : 'guest';

export function setCustomerSession(value) {
  if (ownerKey(value) !== ownerKey(session)) ownerRevision += 1;
  sessionEpoch += 1;
  session = value;
  document.dispatchEvent(new CustomEvent('customer-session-changed', { detail: value }));
  return value;
}

export function customerSnapshot() { return { session, revision: ownerRevision }; }
export function isCurrentCustomer(id, revision) {
  return Boolean(session?.authenticated && session.registered && session.user?.id === id && revision === ownerRevision);
}

export async function getCustomerSession(force = false) {
  if (pendingSession) return pendingSession;
  if (!force && session) return session;
  const epoch = sessionEpoch;
  const request = fetch('/api/account/session', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json', 'X-App-Origin': location.origin } })
    .then(async (response) => {
      if (!response.ok) throw new Error('Customer accounts are temporarily unavailable. Please try again.');
      const result = await response.json();
      if (epoch !== sessionEpoch) return session || guest();
      return setCustomerSession(result);
    }).finally(() => { if (pendingSession === request) pendingSession = null; });
  pendingSession = request;
  return request;
}

async function performRequest(path, method, body) {
  const headers = { Accept: 'application/json', 'X-App-Origin': location.origin };
  if (method !== 'GET') {
    const current = await getCustomerSession(true);
    headers['Content-Type'] = 'application/json';
    if (current.csrfToken) headers['X-CSRF-Token'] = current.csrfToken;
  }
  const revision = ownerRevision;
  const response = await fetch(`/api/account/${path}`, {
    method, credentials: 'include', cache: 'no-store', headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && revision === ownerRevision) setCustomerSession(guest());
    const error = new Error(result.error || 'Your request could not be completed. Please try again.');
    error.status = response.status;
    throw error;
  }
  if (typeof result.authenticated === 'boolean' && revision === ownerRevision) setCustomerSession(result);
  return result;
}

export function accountRequest(path, method = 'GET', body) {
  if (method === 'GET') return performRequest(path, method, body);
  const request = mutationQueue.then(() => performRequest(path, method, body));
  mutationQueue = request.catch(() => {});
  return request;
}

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
