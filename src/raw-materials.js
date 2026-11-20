import { RAW_MATERIALS, materialShopHref } from '../shared/raw-materials.mjs';
import { getProductsByMaterial, getProductName, getProductCategories } from '../shared/catalog.mjs';

// These are the deliberately slow, user-specified editorial timings, not UI defaults.
export const MATERIAL_TIMING = Object.freeze({
  autoplay: 6000, image: 700, stagger: 150, copyOut: 300, copyIn: 500,
  reducedImage: 200, reducedCopy: 100, decodeTimeout: 4000,
});

/** One timeout, with independently owned pause reasons. Resuming starts a full dwell. */
export function createAutoplayScheduler({ onTick, onChange = () => {}, delay = MATERIAL_TIMING.autoplay,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  const reasons = new Set(['initializing']);
  let timer = null;
  let disposed = false;
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const arm = () => {
    if (disposed || reasons.size || timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      onTick();
      arm();
    }, delay);
  };
  const notify = () => onChange({ paused: disposed || reasons.size > 0, reasons: [...reasons] });
  return {
    pause(reason, paused = true) {
      if (disposed || reasons.has(reason) === paused) return;
      if (paused) reasons.add(reason); else reasons.delete(reason);
      clear(); arm(); notify();
    },
    reset() { clear(); arm(); notify(); },
    dispose() { disposed = true; clear(); notify(); },
    get paused() { return disposed || reasons.size > 0; },
    get reasons() { return [...reasons]; },
  };
}

/** Latest input cancels the old request. Only a live request may commit content. */
export function createLatestMaterialController({ ids, initialId = ids[0], load, transition,
  onCommit = () => {}, onReset = () => {}, onBusy = () => {}, onSettled = () => {}, onError = () => {} }) {
  let current = initialId;
  let target = initialId;
  let revision = 0;
  let active = null;
  let manual = false;
  function cancel() {
    revision += 1;
    active?.abort();
    active = null;
    target = current;
    onReset(current);
    onBusy(false, current);
  }
  async function request(id, options = {}) {
    if (!ids.includes(id)) return false;
    const token = ++revision;
    active?.abort();
    active = new AbortController();
    const signal = active.signal;
    target = id;
    manual = Boolean(options.manual);
    const requestedManually = manual;
    onReset(current);
    if (id === current) {
      active = null;
      onBusy(false, current);
      onSettled(current, { manual: requestedManually, changed: false });
      return true;
    }
    onBusy(true, id);
    const live = () => token === revision && !signal.aborted;
    try {
      if (!await load(id, { signal })) throw new Error('The next material image is not ready.');
      if (!live()) return false;
      await transition(id, {
        signal, isCurrent: live,
        commit() {
          if (!live()) return false;
          current = id;
          onCommit(id);
          return true;
        },
      });
      if (!live()) return false;
      onReset(current);
      onSettled(current, { manual: requestedManually, changed: true });
      return true;
    } catch (error) {
      if (live()) { onReset(current); onError(error, id, { manual: requestedManually }); }
      return false;
    } finally {
      if (token === revision) {
        active = null;
        target = current;
        onBusy(false, current);
      }
    }
  }
  return { request, cancel, get current() { return current; }, get target() { return target; },
    get manual() { return manual; }, get busy() { return active !== null; } };
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}

// A single next/target image is retained, never seven hidden image copies. Loading
// and decoding share a 4s deadline; failed targets keep both the old image and copy.
function createImageLoader() {
  let slot = null;
  function prepare(material) {
    if (slot?.src === material.image) return slot.promise;
    slot?.cancel();
    const image = new Image();
    image.decoding = 'async';
    let settle;
    let settled = false;
    const promise = new Promise((resolve) => { settle = resolve; });
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      image.onload = null; image.onerror = null;
      settle(Boolean(ok && image.complete && image.naturalWidth));
    };
    const deadline = setTimeout(() => finish(false), MATERIAL_TIMING.decodeTimeout);
    slot = { src: material.image, promise, cancel: () => { finish(false); image.removeAttribute('src'); } };
    image.onload = () => {
      if (typeof image.decode !== 'function') { finish(true); return; }
      image.decode().then(() => finish(true), () => finish(image.complete && image.naturalWidth > 0));
    };
    image.onerror = () => finish(false);
    image.src = material.image;
    if (typeof image.decode === 'function') {
      image.decode().then(() => finish(true), () => {
        if (image.complete) finish(image.naturalWidth > 0);
      });
    } else if (image.complete) finish(image.naturalWidth > 0);
    return promise;
  }
  return {
    prepare,
    async load(material, signal) {
      if (signal.aborted) return false;
      const ready = prepare(material);
      return new Promise((resolve) => {
        const abort = () => resolve(false);
        signal.addEventListener('abort', abort, { once: true });
        ready.then((ok) => { signal.removeEventListener('abort', abort); resolve(!signal.aborted && ok); });
      });
    },
    dispose() { slot?.cancel(); slot = null; },
  };
}

export function initializeRawMaterials(root) {
  if (!root || !RAW_MATERIALS.length) return null;
  const byId = new Map(RAW_MATERIALS.map((material) => [material.id, material]));
  const ids = [...byId.keys()];
  const frame = root.querySelector('[data-material-image]');
  const copy = root.querySelector('[data-material-copy]');
  const name = root.querySelector('[data-material-name]');
  const description = root.querySelector('[data-material-description]');
  const counter = root.querySelector('[data-material-counter]');
  const used = root.querySelector('[data-material-used]');
  const products = root.querySelector('[data-material-products]');
  const shop = root.querySelector('[data-material-shop]');
  const selectors = root.querySelector('[data-material-selectors]');
  const pause = root.querySelector('[data-material-pause]');
  const status = root.querySelector('[data-material-status]');
  const outgoing = [...frame.querySelectorAll('[data-material-outgoing]')];
  const incoming = [...frame.querySelectorAll('[data-material-incoming]')];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hover = window.matchMedia('(hover: hover) and (pointer: fine)');
  const loader = createImageLoader();
  const buttons = new Map();
  const productLinks = new Map();
  let scheduler;
  let controller;
  let active = false;
  let destroyed = false;
  let cleanup = [];
  let observer = null;
  let autoplayIndex = 0;
  const number = (index) => String(index + 1).padStart(2, '0');

  for (const [index, material] of RAW_MATERIALS.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'raw-materials-selector';
    button.dataset.materialSelect = material.id;
    button.textContent = number(index);
    button.setAttribute('aria-label', `Show ${material.name}, material ${index + 1} of ${ids.length}`);
    button.setAttribute('aria-controls', 'raw-materials-slide');
    buttons.set(material.id, button);
    selectors.append(button);
  }

  function render(id) {
    const material = byId.get(id);
    const index = ids.indexOf(id);
    root.dataset.materialCurrent = id;
    copy.setAttribute('aria-label', `${index + 1} of ${ids.length}: ${material.name}`);
    frame.setAttribute('aria-label', material.alt);
    name.textContent = material.name;
    description.textContent = material.description;
    counter.textContent = `${number(index)}/${String(ids.length).padStart(2, '0')}`;
    shop.href = materialShopHref(id);
    shop.setAttribute('aria-label', `Shop products with ${material.name}`);
    used.setAttribute('aria-label', `Used in: show products with ${material.name}`);
    const matches = getProductsByMaterial(id);
    const nextKeys = new Set(matches.map((item) => item.product));
    for (const [key, row] of productLinks) {
      if (nextKeys.has(key)) continue;
      // A manual material change must not drop focus with a removed product link.
      if (row.contains(document.activeElement)) used.focus({ preventScroll: true });
      row.remove(); productLinks.delete(key);
    }
    for (const item of matches) {
      let row = productLinks.get(item.product);
      if (!row) {
        row = document.createElement('li');
        row.append(document.createElement('a'));
        productLinks.set(item.product, row);
      }
      const link = row.firstElementChild;
      link.textContent = getProductName(item);
      const category = getProductCategories(item)[0];
      const query = new URLSearchParams({ ...(category ? { category } : {}), material: id });
      link.href = category ? `/category.html?${query}` : materialShopHref(id);
      link.dataset.materialProduct = item.product;
      // Preserve existing keyed nodes and focused links; only move if order changed.
      const expected = products.children[[...nextKeys].indexOf(item.product)];
      if (expected !== row) products.insertBefore(row, expected || null);
    }
    for (const [key, button] of buttons) {
      button.setAttribute('aria-pressed', String(key === id));
      if (key === id) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  }

  function reset(id) {
    // Cancel CSS transitions before rebasing to the last atomically committed material.
    root.dataset.materialReset = 'true';
    root.dataset.materialFade = 'false';
    root.dataset.materialCopyPhase = 'idle';
    const material = byId.get(id);
    outgoing.forEach((image) => { if (image.getAttribute('src') !== material.image) image.src = material.image; });
    incoming.forEach((image) => image.removeAttribute('src'));
    render(id);
    // Establish the full-opacity baseline before the next CSS transition starts.
    void frame.offsetWidth;
    delete root.dataset.materialReset;
  }

  async function transition(id, context) {
    const reduced = reduce.matches;
    const imageDuration = reduced ? MATERIAL_TIMING.reducedImage : MATERIAL_TIMING.image + 2 * MATERIAL_TIMING.stagger;
    const outDuration = reduced ? MATERIAL_TIMING.reducedCopy : MATERIAL_TIMING.copyOut;
    const inDuration = reduced ? MATERIAL_TIMING.reducedCopy : MATERIAL_TIMING.copyIn;
    incoming.forEach((image) => { image.src = byId.get(id).image; });
    root.dataset.materialState = 'transitioning';
    root.dataset.materialReduced = String(reduced);
    root.dataset.materialFade = 'true';
    root.dataset.materialCopyPhase = 'exit';
    await wait(outDuration, context.signal);
    if (!context.commit()) return;
    root.dataset.materialCopyPhase = 'enter-ready';
    void copy.offsetHeight;
    root.dataset.materialCopyPhase = 'enter';
    await wait(inDuration, context.signal);
    root.dataset.materialCopyPhase = 'idle';
    const remainder = imageDuration - outDuration - inDuration;
    if (remainder > 0) await wait(remainder, context.signal);
  }

  function preloadNext(id) {
    if (active) loader.prepare(byId.get(ids[(ids.indexOf(id) + 1) % ids.length]));
  }
  scheduler = createAutoplayScheduler({
    onTick: () => {
      // Normally decoding (bounded at 4s) plus the 1s fade finishes before
      // this 6s tick. A throttled browser must never overlap an active request.
      if (controller.busy) return;
      autoplayIndex = (autoplayIndex + 1) % ids.length;
      controller.request(ids[autoplayIndex]);
    },
    onChange: ({ paused, reasons }) => {
      root.dataset.materialAutoplay = paused ? 'paused' : 'running';
      root.dataset.materialPauseReasons = reasons.join(' ');
    },
  });
  controller = createLatestMaterialController({
    ids, load: (id, { signal }) => loader.load(byId.get(id), signal), transition,
    onCommit: render, onReset: reset,
    onBusy: (busy, id) => {
      root.dataset.materialState = busy ? 'loading' : 'idle';
      root.dataset.materialTarget = id;
      // Reset at the START, not the end: normal autoplay starts are 6000ms
      // apart rather than accidentally becoming 6000ms + the transition.
      if (busy) scheduler.reset();
    },
    onSettled: (id, { manual, changed }) => {
      autoplayIndex = ids.indexOf(id);
      if (manual && changed) status.textContent = `${byId.get(id).name}, material ${ids.indexOf(id) + 1} of ${ids.length}.`;
      preloadNext(id);
      if (!changed) scheduler.reset();
    },
    onError: (_error, id, { manual }) => {
      if (manual) status.textContent = `${byId.get(id).name}'s image is not ready. ${byId.get(controller.current).name} remains displayed. Please try another material.`;
      if (manual) autoplayIndex = ids.indexOf(controller.current);
      // Automatic failures preserve the displayed slide and prepare only the
      // following target; one unavailable image cannot stall the whole loop.
      preloadNext(manual ? controller.current : id);
    },
  });

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanup.push(() => target.removeEventListener(type, handler, options));
  }
  function listenMedia(media, handler) {
    if (media.addEventListener) listen(media, 'change', handler);
    else { media.addListener(handler); cleanup.push(() => media.removeListener(handler)); }
  }
  function select(id) {
    status.textContent = '';
    controller.request(id, { manual: true });
  }
  function syncVisibility() { scheduler.pause('hidden', document.hidden); }
  function syncFocus() { scheduler.pause('focus', root.contains(document.activeElement)); }
  function syncViewport() {
    const rect = root.getBoundingClientRect();
    scheduler.pause('offscreen', rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth);
  }
  function activate() {
    if (active || destroyed) return;
    active = true;
    autoplayIndex = ids.indexOf(controller.current);
    root.dataset.materialReduced = String(reduce.matches);
    listen(selectors, 'click', (event) => {
      const button = event.target.closest('[data-material-select]');
      if (button && selectors.contains(button)) select(button.dataset.materialSelect);
    });
    listen(selectors, 'keydown', (event) => {
      const button = event.target.closest('[data-material-select]');
      if (!button) return;
      const index = ids.indexOf(button.dataset.materialSelect);
      const target = event.key === 'ArrowRight' ? (index + 1) % ids.length
        : event.key === 'ArrowLeft' ? (index + ids.length - 1) % ids.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : null;
      if (target === null) return;
      event.preventDefault();
      buttons.get(ids[target]).focus();
      select(ids[target]);
    });
    listen(used, 'click', () => {
      const open = used.getAttribute('aria-expanded') !== 'true';
      used.setAttribute('aria-expanded', String(open));
      used.querySelector('[data-material-used-symbol]').textContent = open ? '−' : '+';
      products.hidden = !open;
      scheduler.pause('details', open);
    });
    listen(pause, 'click', () => {
      const explicit = pause.getAttribute('aria-pressed') !== 'true';
      pause.setAttribute('aria-pressed', String(explicit));
      pause.textContent = explicit ? 'Resume autoplay' : 'Pause autoplay';
      scheduler.pause('explicit', explicit);
    });
    listen(root, 'pointerenter', (event) => {
      if (event.pointerType === 'mouse' && hover.matches) scheduler.pause('hover', true);
    });
    listen(root, 'pointermove', (event) => {
      if (event.pointerType === 'mouse' && hover.matches) scheduler.pause('hover', true);
    });
    listen(root, 'pointerleave', (event) => {
      if (event.pointerType === 'mouse') scheduler.pause('hover', false);
    });
    listen(root, 'focusin', syncFocus);
    listen(root, 'focusout', (event) => scheduler.pause('focus', Boolean(event.relatedTarget && root.contains(event.relatedTarget))));
    listen(document, 'visibilitychange', syncVisibility);
    listenMedia(hover, () => { if (!hover.matches) scheduler.pause('hover', false); });
    listenMedia(reduce, () => {
      const target = controller.target;
      const manual = controller.manual;
      controller.cancel();
      root.dataset.materialReduced = String(reduce.matches);
      if (target !== controller.current) controller.request(target, { manual });
      else preloadNext(controller.current);
    });
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        scheduler.pause('offscreen', !entries[0].isIntersecting);
      }, { threshold: 0 });
      observer.observe(root);
    } else {
      listen(window, 'scroll', syncViewport, { passive: true });
      listen(window, 'resize', syncViewport, { passive: true });
    }
    syncVisibility(); syncFocus(); syncViewport();
    scheduler.pause('hover', hover.matches && root.matches(':hover'));
    scheduler.pause('details', !products.hidden);
    scheduler.pause('explicit', pause.getAttribute('aria-pressed') === 'true');
    scheduler.pause('pagehide', false);
    scheduler.pause('initializing', false);
    preloadNext(controller.current);
  }
  function deactivate() {
    active = false;
    scheduler.pause('pagehide', true);
    controller.cancel();
    loader.dispose();
    observer?.disconnect(); observer = null;
    cleanup.forEach((remove) => remove()); cleanup = [];
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    deactivate(); scheduler.dispose();
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener('pageshow', pageshow);
  }
  function pagehide(event) { if (event.persisted) deactivate(); else destroy(); }
  function pageshow(event) { if (event.persisted) activate(); }
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  reset(ids[0]);
  activate();
  return { controller, scheduler, destroy };
}

// Conditional CSS import also keeps pure controller/scheduler exports usable in Node.
if (typeof document !== 'undefined') {
  import('./raw-materials.css').then(() => {
    initializeRawMaterials(document.querySelector('[data-raw-materials]'));
  });
}
