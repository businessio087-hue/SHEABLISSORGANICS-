import './navigation.js';
import { getCustomerSession, accountRequest, customerSnapshot } from './customer-session.js';
import { savePendingWishlist, clearPendingWishlist } from './wishlist.js';

const guest = document.querySelector('#account-guest');
const registration = document.querySelector('#account-registration');
const profile = document.querySelector('#account-profile');
const status = document.querySelector('#account-status');
const registrationForm = document.querySelector('#registration-form');
const profileForm = document.querySelector('#profile-form');
let displayedOwner;

document.querySelectorAll('.account-field-container').forEach((container) => {
  container.append(document.querySelector('#customer-fields').content.cloneNode(true));
});
function fillForm(form, user) {
  if (!form || !user) return;
  for (const [name, value] of Object.entries({ name: user.name, email: user.email, phone: user.phone, ...(user.address || {}) })) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value || '';
  }
}
function updateAccountVisibility(current) {
  const owner = current.registered ? current.user?.id : null;
  if (!current.registered || owner !== displayedOwner) {
    profileForm.reset();
    document.querySelector('#account-greeting').textContent = '';
  }
  displayedOwner = owner;
  guest.hidden = current.authenticated;
  registration.hidden = !current.authenticated || current.registered;
  profile.hidden = !current.authenticated || !current.registered;
  if (!current.authenticated) registrationForm.reset();
}
function displayAccount(current) {
  updateAccountVisibility(current);
  if (current.registered && current.user) {
    fillForm(profileForm, current.user);
    document.querySelector('#account-greeting').textContent = `Good to see you, ${current.user.name}.`;
  } else if (current.authenticated) fillForm(registrationForm, current.identity);
}
document.addEventListener('customer-session-changed', (event) => updateAccountVisibility(event.detail));
async function applyPendingWish() {
  try { await savePendingWishlist(); }
  catch (error) { status.textContent = `Your account is available. Saving the product can be retried: ${error.message}`; }
}
async function renderAccount() {
  const current = await getCustomerSession(true);
  displayAccount(current);
  status.textContent = '';
  if (current.registered) await applyPendingWish();
}
if (new URLSearchParams(location.search).get('reason') === 'wishlist') {
  document.querySelector('#account-guest-note').textContent = 'Create your SheaBliss account to save the rituals you love. Your wishlist will appear once your account is ready.';
}
document.querySelectorAll('[data-start-login]').forEach((button) => button.addEventListener('click', async () => {
  button.disabled = true; status.textContent = 'Opening secure sign-in…';
  try {
    const response = await fetch('/api/account/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-App-Origin': location.origin },
      body: JSON.stringify({ origin: location.origin }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.error || 'Secure sign-in is temporarily unavailable.');
    const destination = new URL(result.url);
    if (destination.protocol !== 'https:') throw new Error('The sign-in destination is not secure.');
    location.assign(destination.href);
  } catch (error) { status.textContent = error.message; button.disabled = false; }
}));
function formData(form) {
  const data = new FormData(form);
  return { name: data.get('name'), phone: data.get('phone'), address: {
    streetAddress: data.get('streetAddress'), suburb: data.get('suburb'), postalCode: data.get('postalCode'),
    buildingType: data.get('buildingType'), companyName: data.get('companyName'),
  } };
}
registrationForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = registrationForm.querySelector('[type="submit"]'); button.disabled = true;
  try {
    await accountRequest('register', 'POST', { ...formData(registrationForm), acceptedTerms: registrationForm.elements.acceptedTerms.checked });
    displayAccount(customerSnapshot().session);
    status.textContent = 'Your account is ready. Your wishlist is now available.';
    await applyPendingWish();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
profileForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = profileForm.querySelector('[type="submit"]'); button.disabled = true;
  try {
    await accountRequest('profile', 'PUT', formData(profileForm));
    displayAccount(customerSnapshot().session);
    status.textContent = 'Your details have been saved.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelectorAll('[data-sign-out]').forEach((button) => button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    await accountRequest('logout', 'POST', {});
    clearPendingWishlist();
    displayAccount(customerSnapshot().session);
    status.textContent = 'You are signed out of SheaBliss. Your Manus sign-in is separate.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}));
function showUnavailable(error) {
  guest.hidden = false; registration.hidden = true; profile.hidden = true;
  registrationForm.reset(); profileForm.reset(); document.querySelector('#account-greeting').textContent = '';
  status.textContent = error.message;
}
renderAccount().catch(showUnavailable);
window.addEventListener('pageshow', (event) => { if (event.persisted) renderAccount().catch(showUnavailable); });
