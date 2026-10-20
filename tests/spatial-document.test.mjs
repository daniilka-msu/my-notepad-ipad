import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
const context = vm.createContext({ structuredClone, crypto, console });
vm.runInContext(
  (await readFile(new URL("../spatial-document.js", import.meta.url), "utf8")) +
    ";globalThis.model=SpatialDocument",
  context,
);
const model = context.model;
function memory() {
  const records = new Map();
  let failure = false;
  return {
    records,
    fail(value) {
      failure = value;
    },
    async read(key) {
      return structuredClone(records.get(key));
    },
    async batchRecords(entries, remove, guard, active) {
      if (!active()) return false;
      if (failure) throw Error("Disk full");
      if ((records.get(guard.key)?.revision || 0) !== guard.revision)
        throw Error("Revision conflict");
      for (const key of remove) records.delete(key);
      for (const [key, value] of entries)
        records.set(key, structuredClone(value));
      return true;
    },
  };
}
const entry = (id, x, y) => ({
  id,
  order: 1,
  bounds: { x, y, width: 20, height: 20 },
  value: {
    tool: "pen",
    width: 2,
    color: "#222222",
    points: [
      { x, y },
      { x: x + 20, y: y + 20 },
    ],
  },
});
test("negative tile boundaries and finite coordinate guards", () => {
  assert.equal(
    model.tiles({ x: -513, y: -1, width: 1, height: 1 }).join("|"),
    "-2,-1|-1,-1|-2,0|-1,0",
  );
  for (const x of [NaN, Infinity, 1e10])
    assert.throws(() => model.tiles({ x, y: 0, width: 1, height: 1 }));
  assert.throws(() => model.tiles({ x: 0, y: 0, width: 1e6, height: 1e6 }));
});
test("objects crossing tiles are stored once and returned once", async () => {
  const store = memory(),
    doc = await model.open("one", "infinite", store),
    value = entry("cross", 500, 500);
  doc.commit([{ id: value.id, before: null, after: value }]);
  await doc.save();
  assert.equal(
    [...store.records.keys()].filter((k) => k.includes("/object/")).length,
    1,
  );
  assert.equal(
    (await doc.query({ x: 0, y: 0, width: 1024, height: 1024 })).length,
    1,
  );
});
test("lazy query survives eviction and bounds caches during long travel", async () => {
  const store = memory(),
    doc = await model.open("long", "infinite", store);
  for (let i = 0; i < 100; i++)
    doc.commit([
      { id: "p" + i, before: null, after: entry("p" + i, 10, i * 1200) },
    ]);
  await doc.save();
  for (let i = 0; i < 100; i++) {
    assert.equal(
      (await doc.query({ x: 0, y: i * 1200, width: 794, height: 1123 })).length,
      1,
    );
    assert.ok(doc.stats.regionCache <= 32);
    assert.ok(doc.stats.objectCache <= 512);
  }
  doc.clearCache();
  assert.equal(
    (await doc.query({ x: 0, y: 0, width: 794, height: 1123 }))[0].id,
    "p0",
  );
});
test("no save during input; failures retain dirty objects for retry", async () => {
  const store = memory(),
    doc = await model.open("failure", "infinite", store),
    value = entry("a", -100, -100);
  doc.commit([{ id: "a", before: null, after: value }]);
  assert.equal(await doc.save(() => true), false);
  assert.equal(store.records.size, 0);
  store.fail(true);
  await assert.rejects(doc.save(), /Disk full/);
  assert.equal(doc.dirty, true);
  assert.equal(doc.stats.dirtyObjects, 1);
  store.fail(false);
  await doc.save();
  assert.equal(doc.dirty, false);
  const reopen = await model.open("failure", "infinite", store);
  assert.equal(
    (await reopen.query({ x: -200, y: -200, width: 200, height: 200 }))[0].id,
    "a",
  );
});
test("undo and redo retain identities after save and reopening", async () => {
  const store = memory(),
    doc = await model.open("undo", "infinite", store),
    a = entry("a", 1, 1),
    b = entry("a", 100, 100);
  doc.commit([{ id: "a", before: null, after: a }]);
  doc.commit([{ id: "a", before: a, after: b }]);
  await doc.save();
  const reopen = await model.open("undo", "infinite", store);
  await reopen.undo();
  await reopen.save();
  assert.equal((await reopen.readObject("a")).bounds.x, 1);
  await reopen.undo();
  assert.equal(await reopen.readObject("a"), null);
  await reopen.redo();
  await reopen.redo();
  assert.equal((await reopen.readObject("a")).bounds.x, 100);
});
test("branching after undo replaces redo instead of restoring abandoned edits", async () => {
  const store = memory(),
    doc = await model.open("branch", "infinite", store),
    a = entry("a", 1, 1),
    b = entry("a", 100, 100),
    c = entry("a", 200, 200);
  doc.commit([{ id: "a", before: null, after: a }]);
  doc.commit([{ id: "a", before: a, after: b }]);
  await doc.save();
  await doc.undo();
  doc.commit([{ id: "a", before: a, after: c }]);
  await doc.save();
  assert.equal(await doc.redo(), false);
  const reopen = await model.open("branch", "infinite", store);
  await reopen.undo();
  await reopen.redo();
  assert.equal((await reopen.readObject("a")).bounds.x, 200);
});
test("concurrent sessions cannot overwrite newer persisted revision", async () => {
  const store = memory(),
    first = await model.open("shared", "infinite", store),
    second = await model.open("shared", "infinite", store);
  first.commit([{ id: "a", before: null, after: entry("a", 1, 1) }]);
  await first.save();
  second.commit([{ id: "b", before: null, after: entry("b", 1, 1) }]);
  await assert.rejects(second.save(), /Revision conflict/);
  assert.equal(second.dirty, true);
});
test("continuous A4 rejects out-of-width objects and preserves camera and bookmarks", async () => {
  const store = memory(),
    doc = await model.open("a4", "continuous", store);
  assert.throws(() =>
    doc.commit([{ id: "a", before: null, after: entry("a", 790, 10) }]),
  );
  assert.throws(() =>
    doc.commit([{ id: "a", before: null, after: entry("a", -1, 10) }]),
  );
  doc.camera({ x: 0, y: 25000, zoom: 3 });
  doc.bookmark("Лекция", doc.camera());
  await doc.save();
  const reopen = await model.open("a4", "continuous", store);
  assert.equal(reopen.camera().y, 25000);
  assert.equal(reopen.metadata.bookmarks[0].name, "Лекция");
});
test("edits completed during a pending atomic write are saved in a later revision", async () => {
  const store = memory(),
    doc = await model.open("pending", "infinite", store),
    a = entry("a", 10, 10),
    b = entry("a", 100, 100);
  let release, started;
  const gate = new Promise((r) => (release = r)),
    ready = new Promise((r) => (started = r)),
    write = store.batchRecords;
  store.batchRecords = async (...args) => {
    started();
    await gate;
    return write(...args);
  };
  doc.commit([{ id: "a", before: null, after: a }]);
  const pending = doc.save();
  await ready;
  doc.commit([{ id: "a", before: a, after: b }]);
  release();
  await pending;
  assert.equal(doc.dirty, true);
  await doc.save();
  const reopen = await model.open("pending", "infinite", store);
  assert.equal((await reopen.readObject("a")).bounds.x, 100);
  assert.equal(reopen.metadata.cursor, 2);
});
test('group membership spans unloaded regions and survives undo and reopening',async()=>{
 const store=memory(),doc=await model.open('group','infinite',store),a=entry('a',0,0),b=entry('b',0,5000);a.value.groupId=b.value.groupId='lesson';doc.commit([{id:'a',before:null,after:a},{id:'b',before:null,after:b}]);await doc.save();
 const reopen=await model.open('group','infinite',store);assert.equal((await reopen.query({x:0,y:0,width:794,height:1123})).length,1);assert.equal((await reopen.group('lesson')).length,2);
 const changed=structuredClone(b);delete changed.value.groupId;reopen.commit([{id:'b',before:b,after:changed}]);assert.equal((await reopen.group('lesson')).length,1);await reopen.save();await reopen.undo();await reopen.save();assert.equal((await reopen.group('lesson')).length,2);
});
