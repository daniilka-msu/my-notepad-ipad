import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const context = vm.createContext({});
vm.runInContext(
  readFileSync(new URL("../autosave.js", import.meta.url), "utf8") +
    ";globalThis.Autosave=Autosave",
  context,
);
function setup(write = async () => {}) {
  let now = 0,
    id = 0,
    active = false,
    writes = 0;
  const timers = new Map(),
    states = [];
  const clock = {
    setTimeout(fn, delay) {
      timers.set(++id, { time: now + delay, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const save = context.Autosave.create({
    write: () => {
      writes++;
      return write();
    },
    active: () => active,
    clock,
    state: (...s) => states.push(s),
  });
  async function tick(ms) {
    const end = now + ms;
    for (let i = 0; i < 10000; i++) {
      for (let j = 0; j < 15; j++) await Promise.resolve();
      const next = [...timers]
        .filter(([, t]) => t.time <= end)
        .sort((a, b) => a[1].time - b[1].time)[0];
      if (!next) {
        now = end;
        return;
      }
      now = next[1].time;
      timers.delete(next[0]);
      next[1].fn();
    }
    throw Error("timer loop");
  }
  return {
    save,
    tick,
    states,
    get writes() {
      return writes;
    },
    set active(v) {
      active = v;
      if (v) save.input();
      else save.idle();
    },
  };
}
test("three seconds of idle after a change", async () => {
  const s = setup();
  s.save.dirty();
  await s.tick(2999);
  assert.equal(s.writes, 0);
  await s.tick(1);
  assert.equal(s.writes, 1);
  assert.equal(s.save.dirtyState, false);
});
test("continuous writing postpones autosave and never saves an active stroke", async () => {
  const s = setup();
  for (let i = 0; i < 20; i++) {
    s.active = true;
    await s.tick(1000);
    s.save.dirty();
    s.active = false;
  }
  assert.equal(s.writes, 0);
  s.active = true;
  await s.tick(10000);
  assert.equal(s.writes, 0);
  s.active = false;
  await s.tick(3000);
  assert.equal(s.writes, 1);
});
test("ten minute checkpoint defers to end of active stroke", async () => {
  const s = setup();
  s.save.dirty();
  s.active = true;
  await s.tick(600000);
  assert.equal(s.writes, 0);
  s.active = false;
  await s.tick(0);
  assert.equal(s.writes, 1);
  await s.tick(600000);
  assert.equal(s.writes, 1);
});
test("new input cancels preparation without invoking storage", async () => {
  const s = setup();
  s.save.dirty();
  const result = s.save.flush();
  s.active = true;
  await s.tick(0);
  await result;
  assert.equal(s.writes, 0);
  assert.equal(s.save.dirtyState, true);
  s.active = false;
  await s.tick(0);
  assert.equal(s.writes, 1);
});
test("pending writes are serialized and new revisions remain dirty", async () => {
  let release;
  const s = setup(() => new Promise((r) => (release = r)));
  s.save.dirty();
  const first = s.save.flush();
  await s.tick(0);
  s.save.dirty();
  const second = s.save.flush(true);
  assert.equal(s.writes, 1);
  release();
  await first;
  assert.equal(s.save.dirtyState, true);
  await s.tick(0);
  assert.equal(s.writes, 2);
  release();
  await second;
  assert.equal(s.save.dirtyState, false);
});
test("failure retains dirty revision and explicit retry succeeds", async () => {
  let fail = true;
  const s = setup(async () => {
    if (fail) throw Error("quota");
  });
  s.save.dirty();
  const result = s.save.flush();
  const rejected = assert.rejects(result, /quota/);
  await s.tick(0);
  await rejected;
  assert.equal(s.save.dirtyState, true);
  assert.equal(s.states.at(-1)[0], "error");
  fail = false;
  const retry = s.save.flush(true);
  await s.tick(0);
  await retry;
  assert.equal(s.states.at(-1)[0], "saved");
  assert.equal(s.save.dirtyState, false);
});
test("checkpoint happens despite short gaps without active input", async () => {
  const s = setup();
  for (let i = 0; i < 300; i++) {
    s.save.dirty();
    await s.tick(2000);
  }
  assert.equal(s.writes, 1);
});
test("storage queue can cancel a write when input starts before transaction", async () => {
  let s;
  s = setup(async () => {
    s.active = true;
    return false;
  });
  s.save.dirty();
  const result = s.save.flush();
  await s.tick(0);
  await result;
  assert.equal(s.save.dirtyState, true);
  assert.notEqual(s.states.at(-1)[0], "saved");
});
test("an unfinished new stroke stays dirty when the previous write completes", async () => {
  let release;
  const s = setup(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  s.save.dirty();
  const result = s.save.flush();
  await s.tick(0);
  s.active = true;
  release();
  await result;
  assert.equal(s.save.dirtyState, true);
  assert.equal(s.states.at(-1)[0], "dirty");
});
