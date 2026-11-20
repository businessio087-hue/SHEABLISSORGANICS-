import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIAL_TIMING, createAutoplayScheduler, createLatestMaterialController } from '../src/raw-materials.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function fakeClock() {
  const tasks = new Map();
  let now = 0;
  let key = 0;
  return {
    setTimer(callback, delay) { const id = ++key; tasks.set(id, { callback, at: now + delay }); return id; },
    clearTimer(id) { tasks.delete(id); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at; tasks.delete(next[0]); next[1].callback();
      }
      now = end;
    },
    get count() { return tasks.size; },
  };
}

test('editorial timings match the requested values', () => {
  assert.deepEqual(MATERIAL_TIMING, {
    autoplay: 6000, image: 700, stagger: 150, copyOut: 300, copyIn: 500,
    reducedImage: 200, reducedCopy: 100, decodeTimeout: 4000,
  });
});

test('autoplay has one timer, a full 6000ms dwell and independent pause reasons', () => {
  const clock = fakeClock();
  let ticks = 0;
  const scheduler = createAutoplayScheduler({ onTick: () => ticks++, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  assert.equal(clock.count, 0);
  scheduler.pause('initializing', false);
  scheduler.reset(); scheduler.reset();
  assert.equal(clock.count, 1);
  clock.advance(5999); assert.equal(ticks, 0);
  clock.advance(1); assert.equal(ticks, 1); assert.equal(clock.count, 1);
  scheduler.pause('hover'); scheduler.pause('focus'); scheduler.pause('details');
  assert.equal(clock.count, 0);
  scheduler.pause('hover', false); scheduler.pause('focus', false);
  clock.advance(12000); assert.equal(ticks, 1);
  scheduler.pause('details', false);
  clock.advance(5999); assert.equal(ticks, 1);
  clock.advance(1); assert.equal(ticks, 2);
  scheduler.dispose(); assert.equal(clock.count, 0);
  scheduler.reset(); scheduler.pause('details', false); assert.equal(clock.count, 0);
});

test('a synchronous busy pause during a tick cannot create a second timer', () => {
  const clock = fakeClock();
  let scheduler;
  scheduler = createAutoplayScheduler({
    onTick: () => scheduler.pause('transition'), setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  scheduler.pause('initializing', false);
  clock.advance(6000);
  assert.equal(clock.count, 0);
  scheduler.pause('transition', false);
  assert.equal(clock.count, 1);
});

test('latest target wins even when old image decoding resolves last', async () => {
  const loading = { b: deferred(), c: deferred() };
  const commits = [];
  const controller = createLatestMaterialController({
    ids: ['a', 'b', 'c'], load: (id) => loading[id].promise,
    transition: async (_id, context) => context.commit(), onCommit: (id) => commits.push(id),
  });
  const old = controller.request('b', { manual: true });
  const latest = controller.request('c', { manual: true });
  loading.c.resolve(true); assert.equal(await latest, true);
  loading.b.resolve(true); assert.equal(await old, false);
  assert.equal(controller.current, 'c'); assert.deepEqual(commits, ['c']);
});

test('a stale transition cannot commit after a newer manual request', async () => {
  const gate = deferred();
  const began = deferred();
  const commits = [];
  const controller = createLatestMaterialController({
    ids: ['a', 'b', 'c'], load: async () => true,
    transition: async (id, context) => {
      if (id === 'b') { began.resolve(); await gate.promise; }
      context.commit();
    }, onCommit: (id) => commits.push(id),
  });
  const old = controller.request('b'); await began.promise;
  assert.equal(await controller.request('c', { manual: true }), true);
  gate.resolve(); assert.equal(await old, false);
  assert.deepEqual(commits, ['c']); assert.equal(controller.current, 'c');
});

test('interruption after a copy commit rebases to the committed material', async () => {
  const gate = deferred();
  const began = deferred();
  const resets = [];
  const controller = createLatestMaterialController({
    ids: ['a', 'b', 'c'], load: async () => true,
    transition: async (id, context) => {
      context.commit();
      if (id === 'b') { began.resolve(); await gate.promise; }
    }, onReset: (id) => resets.push(id),
  });
  const old = controller.request('b'); await began.promise;
  await controller.request('c');
  gate.resolve(); assert.equal(await old, false);
  assert.equal(controller.current, 'c'); assert.ok(resets.includes('b'));
});

test('decode failure retains current content and returns idle without a transition', async () => {
  const errors = [];
  const busy = [];
  let transitions = 0;
  const controller = createLatestMaterialController({
    ids: ['a', 'b'], load: async () => false, transition: async () => transitions++,
    onError: (_error, id, context) => errors.push({ id, ...context }), onBusy: (value) => busy.push(value),
  });
  assert.equal(await controller.request('b', { manual: true }), false);
  assert.equal(controller.current, 'a'); assert.equal(controller.target, 'a');
  assert.equal(transitions, 0); assert.deepEqual(busy, [true, false]);
  assert.deepEqual(errors, [{ id: 'b', manual: true }]);
});

test('pagehide cancellation prevents late commits and selecting current cancels pending work', async () => {
  const gate = deferred();
  const commits = [];
  const controller = createLatestMaterialController({
    ids: ['a', 'b'], load: () => gate.promise,
    transition: async (_id, context) => context.commit(), onCommit: (id) => commits.push(id),
  });
  const pending = controller.request('b'); controller.cancel();
  gate.resolve(true); assert.equal(await pending, false);
  assert.equal(controller.current, 'a'); assert.deepEqual(commits, []);
  assert.equal(await controller.request('a', { manual: true }), true);
  assert.equal(await controller.request('unknown'), false);
});

test('autoplay start cadence remains 6000ms rather than adding transition duration', async () => {
  const clock = fakeClock();
  const starts = [];
  const requests = [];
  let logicalNow = 0;
  let controller;
  let scheduler;
  scheduler = createAutoplayScheduler({
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    onTick: () => {
      if (controller.busy) return;
      starts.push(logicalNow);
      requests.push(controller.request(controller.current === 'a' ? 'b' : 'a'));
    },
  });
  controller = createLatestMaterialController({
    ids: ['a', 'b'], load: async () => true,
    transition: (_id, context) => new Promise((resolve) => {
      clock.setTimer(() => { context.commit(); resolve(); }, 1000);
    }),
    onBusy: (busy) => { if (busy) scheduler.reset(); },
  });
  scheduler.pause('initializing', false);
  logicalNow = 6000; clock.advance(6000);
  await Promise.resolve();
  assert.equal(controller.busy, true);
  logicalNow = 7000; clock.advance(1000); await requests[0];
  assert.equal(clock.count, 1);
  logicalNow = 11999; clock.advance(4999); assert.deepEqual(starts, [6000]);
  logicalNow = 12000; clock.advance(1); assert.deepEqual(starts, [6000, 12000]);
  await Promise.resolve();
  logicalNow = 13000; clock.advance(1000); await requests[1];
  scheduler.dispose();
});
