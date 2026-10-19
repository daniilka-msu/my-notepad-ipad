import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
function setup() {
  const values = new Map(),
    assets = new Map();
  let fail = 0,
    calls = 0;
  const context = vm.createContext({
    Blob,
    Date,
    setTimeout,
    uid: () => "record-1",
    NotepadStore: {
      async writeRecord(key, value, entries = [], remove = []) {
        if (++calls === fail) throw Error("quota");
        for (const [id, blob] of entries) assets.set(id, blob);
        for (const id of remove) assets.delete(id);
        if (value === null) values.delete(key);
        else values.set(key, structuredClone(value));
      },
      async records(prefix) {
        return [...values]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, value]) => structuredClone(value));
      },
      async asset(id) {
        return assets.get(id);
      },
    },
  });
  vm.runInContext(
    readFileSync(new URL("../lecture-store.js", import.meta.url), "utf8") +
      ";globalThis.store=LectureStore",
    context,
  );
  return {
    store: context.store,
    values,
    assets,
    set failCall(n) {
      fail = n;
    },
    get calls() {
      return calls;
    },
  };
}
test("audio chunks and manifest remain bound to exact notebook", async () => {
  const s = setup();
  const r = await s.store.create("book/a", "Лекция", "audio/mp4");
  await s.store.append(r, new Blob(["audio"]), 5000);
  assert.equal(r.bytes, 5);
  assert.equal((await s.store.list("book/a"))[0].chunks.length, 1);
  assert.equal((await s.store.list("book")).length, 0);
});
test("large data event is split into bounded durable pieces", async () => {
  const s = setup();
  const r = await s.store.create("book", "Book", "audio/mp4");
  await s.store.append(r, new Blob([new Uint8Array(700000)]), 60000);
  assert.equal(r.chunks.length, 3);
  assert.ok(r.chunks.every((c) => c.bytes <= 256 * 1024));
  assert.equal(r.bytes, 700000);
});
test("partial failure retries from committed offset without duplicate bytes", async () => {
  const s = setup();
  const r = await s.store.create("book", "Book", "audio/mp4"),
    progress = { offset: 0 },
    blob = new Blob([new Uint8Array(700000)]);
  s.failCall = 4;
  await assert.rejects(s.store.append(r, blob, 60000, progress), /quota/);
  assert.equal(progress.offset, 524288);
  assert.equal(r.chunks.length, 2);
  await s.store.append(r, blob, 60000, progress);
  assert.equal(r.chunks.length, 3);
  assert.equal(r.bytes, blob.size);
});
test("metadata edits cannot discard a concurrent audio append", async () => {
  const s = setup();
  const r = await s.store.create("book", "Book", "audio/mp4");
  await Promise.all([
    s.store.append(r, new Blob([new Uint8Array(600000)]), 60000),
    s.store.update(r, { name: "New" }),
  ]);
  const saved = (await s.store.list("book"))[0];
  assert.equal(saved.chunks.length, 3);
  assert.equal(saved.name, "New");
  assert.equal(saved.bytes, 600000);
});
test("deletion removes audio assets and manifest", async () => {
  const s = setup();
  const r = await s.store.create("book", "Book", "audio/mp4");
  await s.store.append(r, new Blob(["audio"]), 1000);
  await s.store.remove(r);
  assert.equal(s.assets.size, 0);
  assert.equal(s.values.size, 0);
});
test("thousands of ink timestamps are stored in bounded batches outside audio manifest", async () => {
  const s = setup(),
    r = await s.store.create("book", "Book", "audio/mp4");
  r.marks = Array.from({ length: 3000 }, (_, i) => ({
    actionId: "stroke-" + i,
    timeMs: i * 100,
    page: 0,
  }));
  await s.store.append(r, new Blob(["audio"]), 300000);
  const persisted = (await s.store.list("book"))[0];
  assert.equal(persisted.marks.length, 0);
  assert.equal(persisted.markAssets.length, 12);
  assert.ok(JSON.stringify(persisted).length < 3000);
  await s.store.update(persisted, { name: "Renamed" });
  await s.store.loadMarks(persisted);
  assert.equal(persisted.marks.length, 3000);
  await s.store.remove(persisted);
  assert.equal(s.assets.size, 0);
});
