import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '../src/serve.js';

// A controllable clock. Real time would make these tests either slow or flaky,
// and what is being tested is the loop's decisions, not setTimeout.
function clock(startMs = 0) {
  let t = startMs;
  return { now: () => t, advance: (s) => { t += s * 1000; } };
}

/** dispatch stand-in that reports N sends on the calls listed in `sendOn`. */
function fakeDispatch({ sendOn = [], throwOn = [] } = {}) {
  let call = 0;
  const f = async ({ allowIngest } = {}) => {
    call += 1;
    f.calls = call;
    if (allowIngest) f.ingestCalls += 1;
    if (throwOn.includes(call)) throw new Error(`dispatch blew up on call ${call}`);
    const n = sendOn.filter((c) => c === call).length;
    return { sent: new Array(n).fill({}), inbox: { handled: 0 } };
  };
  f.calls = 0;
  f.ingestCalls = 0;
  return f;
}

/** listen stand-in that consumes the slice it was given, so the clock moves. */
function fakeListen(c, { handledOn = [], throwOn = [] } = {}) {
  let call = 0;
  const f = async ({ seconds }) => {
    call += 1;
    f.calls = call;
    f.lastSlice = seconds;
    c.advance(seconds);
    if (throwOn.includes(call)) throw new Error('poll died');
    return { handled: handledOn.includes(call) ? 1 : 0 };
  };
  f.calls = 0;
  return f;
}

const quiet = () => {};

test('a zero window does nothing at all', async () => {
  const d = fakeDispatch();
  const r = await serve({ seconds: 0, dispatchFn: d, listenFn: async () => ({}), log: quiet });
  assert.deepEqual(r, { loops: 0, sent: 0, handled: 0, minutes: 0 });
  assert.equal(d.calls, 0, 'nothing may touch the network on a zero window');
});

test('the loop keeps cycling for the whole window, not once', async () => {
  // The entire point of the change: one run covers hours, checking often. At a
  // 25-second slice a five-minute window is twelve cycles, and every cycle is a
  // chance for a due slot to fire on time.
  const c = clock();
  const d = fakeDispatch();
  const l = fakeListen(c);
  await serve({ seconds: 300, sliceSeconds: 25, dispatchFn: d, listenFn: l,
                now: c.now, log: quiet });
  assert.equal(d.calls, 12);
  assert.equal(l.calls, 12);
});

test('slot precision is the slice, not the run length', async () => {
  // With the old design the worst case was the gap between scheduled runs --
  // measured at up to 206 minutes. Here it is one slice.
  const c = clock();
  const l = fakeListen(c);
  await serve({ seconds: 3600, sliceSeconds: 25, dispatchFn: fakeDispatch(),
               listenFn: l, now: c.now, log: quiet });
  assert.ok(l.lastSlice <= 25, 'no cycle may wait longer than one slice');
});

test('the final slice never overruns the deadline', async () => {
  const c = clock();
  const l = fakeListen(c);
  await serve({ seconds: 40, sliceSeconds: 25, dispatchFn: fakeDispatch(),
               listenFn: l, now: c.now, log: quiet });
  // 40s window, 25s slice: the second slice must be trimmed to 15, not 25, or
  // the job outlives the window it was given.
  assert.equal(l.lastSlice, 15);
  assert.ok(c.now() <= 40 * 1000);
});

test('state is pushed as soon as something is sent, not at the end', async () => {
  // A six-hour run that persisted only at the end would lose a whole evening of
  // delivery records if the job were killed, and re-send all of it tomorrow.
  const c = clock();
  const pushes = [];
  await serve({
    seconds: 200, sliceSeconds: 25,
    dispatchFn: fakeDispatch({ sendOn: [2, 5] }),
    listenFn: fakeListen(c),
    persist: async () => pushes.push(c.now() / 1000),
    now: c.now, log: quiet,
  });
  // Three: the startup flush, then one per cycle that sent something.
  assert.equal(pushes.length, 3, 'startup flush plus one push per sending cycle');
  assert.ok(pushes[1] < 100, 'the send must be recorded long before the window ends');
});

test('a quiet window pushes once at startup and then not at all', async () => {
  const c = clock();
  let pushes = 0;
  await serve({ seconds: 600, sliceSeconds: 25, dispatchFn: fakeDispatch(),
                listenFn: fakeListen(c), persist: async () => { pushes += 1; },
                now: c.now, log: quiet });
  assert.equal(pushes, 1, 'the startup flush only; 23 further quiet cycles add nothing');
});

test('an answered reply is persisted too', async () => {
  const c = clock();
  let pushes = 0;
  const r = await serve({ seconds: 100, sliceSeconds: 25, dispatchFn: fakeDispatch(),
    listenFn: fakeListen(c, { handledOn: [2] }), persist: async () => { pushes += 1; },
    now: c.now, log: quiet });
  assert.equal(r.handled, 1);
  assert.equal(pushes, 2, 'startup flush, then the reply record — which has to '
    + 'survive the job being killed');
});

/* ------------------------------------------------- nothing may end the window */

test('a failed dispatch does not end the window', async () => {
  const c = clock();
  const d = fakeDispatch({ throwOn: [1, 2] });
  const r = await serve({ seconds: 200, sliceSeconds: 25, dispatchFn: d,
    listenFn: fakeListen(c), now: c.now, log: quiet });
  assert.equal(d.calls, 8, 'the loop must keep going after a throw');
  assert.equal(r.loops, 8);
});

test('a failed poll does not end the window, and does not spin', async () => {
  const c = clock();
  const l = fakeListen(c, { throwOn: [1] });
  const r = await serve({ seconds: 100, sliceSeconds: 25, dispatchFn: fakeDispatch(),
    listenFn: l, now: c.now, log: quiet });
  // The catch waits out the slice with a real timer, so the loop cannot busy-spin
  // through the whole window on a persistently broken poll.
  assert.ok(r.loops >= 2 && r.loops <= 4, `expected a handful of cycles, got ${r.loops}`);
});

test('a failed state push does not end the window', async () => {
  const c = clock();
  const r = await serve({ seconds: 100, sliceSeconds: 25,
    dispatchFn: fakeDispatch({ sendOn: [1] }), listenFn: fakeListen(c),
    persist: async () => { throw new Error('push rejected'); }, now: c.now, log: quiet });
  assert.equal(r.loops, 4);
  assert.equal(r.sent, 1, 'the message was still delivered');
});

test('a failed deck delivery does not end the window', async () => {
  const c = clock();
  const r = await serve({ seconds: 100, sliceSeconds: 25, dispatchFn: fakeDispatch(),
    listenFn: fakeListen(c), onNewNight: async () => { throw new Error('render died'); },
    now: c.now, log: quiet });
  assert.equal(r.loops, 4);
});

test('sends and replies are both counted', async () => {
  const c = clock();
  const r = await serve({ seconds: 200, sliceSeconds: 25,
    dispatchFn: fakeDispatch({ sendOn: [1, 1, 3] }),
    listenFn: fakeListen(c, { handledOn: [2, 4] }), now: c.now, log: quiet });
  assert.equal(r.sent, 3);
  assert.equal(r.handled, 2);
});

test('the Oura pull is throttled even though slots are checked every cycle', () => {
  // The supervisor cycles every ~25s where the old cron ran every 5 minutes.
  // shouldIngest is cheap but the pull behind it is four API calls, so an
  // unsettled night would have meant 576 Oura requests an hour instead of 48 --
  // and rate-limited pulls fail, retry, and compound. Slot delivery must stay on
  // every cycle; only the network pull is throttled.
  const c = clock();
  const d = fakeDispatch();
  return serve({
    seconds: 3600, sliceSeconds: 25, ingestCooldownSeconds: 300,
    dispatchFn: d, listenFn: fakeListen(c), now: c.now, log: quiet,
  }).then(() => {
    assert.equal(d.calls, 144, 'every cycle must still check what is due');
    // 12 five-minute boundaries in an hour, give or take where the last one
    // falls relative to the deadline.
    assert.ok(d.ingestCalls >= 11 && d.ingestCalls <= 13,
      `expected ~12 pulls in an hour at a 5-minute cooldown, got ${d.ingestCalls}`);
  });
});

test('the first cycle is allowed to pull, so a fresh window is not blind', () => {
  const c = clock();
  const d = fakeDispatch();
  return serve({ seconds: 30, sliceSeconds: 25, dispatchFn: d,
                 listenFn: fakeListen(c), now: c.now, log: quiet })
    .then(() => assert.equal(d.ingestCalls, 1));
});
