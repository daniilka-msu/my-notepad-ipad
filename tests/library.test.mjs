import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
const Library = vm.runInNewContext(
  (await readFile(new URL("../library.js", import.meta.url), "utf8")) +
    ";Library",
  { crypto: webcrypto, structuredClone },
);
const options = {
  name: "Новая",
  template: "plain",
  paper: "grid",
  pageSize: "a4",
  color: "#5369d8",
  pattern: "plain",
};
test("migration preserves document coordinates, raw legacy data and unknown fields", () => {
  const old = {
      selected: "old",
      custom: "keep",
      books: [
        {
          id: "old",
          name: "Прежняя",
          paper: "grid",
          pages: [
            [
              {
                points: [{ x: 10.4, y: 20.5, p: 0.4 }],
                width: 2,
                tool: "pen",
                color: "#222222",
              },
            ],
          ],
          backgrounds: [{ id: "asset", width: 100, height: 200 }],
        },
      ],
    },
    copy = JSON.stringify(old),
    next = Library.migrate(old);
  assert.equal(JSON.stringify(old), copy);
  assert.equal(next.libraryVersion, 1);
  assert.equal(
    JSON.stringify(next.books[0].pages),
    JSON.stringify(old.books[0].pages),
  );
  assert.equal(next.books[0].backgrounds[0].id, "asset");
  assert.equal("gridMm" in next.books[0], false);
  assert.equal(next.custom, "keep");
  assert.equal(next.books[0].modifiedAt, 0);
  assert.equal(JSON.stringify(Library.migrate(next)), JSON.stringify(next));
});
test("future versions are rejected rather than downgraded", () =>
  assert.throws(
    () => Library.migrate({ libraryVersion: 100, books: [] }),
    /более новой/,
  ));
test("empty typed library stays empty", () =>
  assert.equal(
    Library.migrate({ libraryVersion: 1, books: [] }).books.length,
    0,
  ));
test("trash filtering never mutates original books", () => {
  const source = {
    books: [
      { id: "a" },
      { id: "b", deletedAt: 123 },
      { id: "c", deletedAt: null },
    ],
  };
  assert.equal(
    JSON.stringify(Library.active(source).map((b) => b.id)),
    JSON.stringify(["a", "c"]),
  );
  assert.equal(source.books.length, 3);
});
test("all five templates create independent editable documents", () => {
  for (const template of Object.keys(Library.templates)) {
    const a = Library.newBook({ ...options, template }),
      b = Library.newBook({ ...options, template });
    assert.notEqual(a.id, b.id);
    assert.equal(a.pages.length, 1);
    assert.notEqual(a.pages, b.pages);
    assert.equal(a.gridMm, 5);
    assert.equal(a.deletedAt, null);
    assert.equal(a.cover.color, options.color);
    if (template === "planner" || template === "algorithms")
      assert.equal(a.pages[0][0].type, "table-object");
  }
});
test("invalid wizard data is rejected", () => {
  for (const invalid of [
    { name: " " },
    { name: "x".repeat(121) },
    { paper: "bad" },
    { pageSize: "A0" },
    { pattern: "bad" },
    { color: "url(x)" },
    { template: "missing" },
  ])
    assert.throws(() => Library.newBook({ ...options, ...invalid }));
});
test("view-only changes do not change modification time, append and undo do", () => {
  const b = Library.newBook(options);
  b.modifiedAt = 1;
  Library.track(b);
  Library.track(b);
  assert.equal(b.modifiedAt, 1);
  b.pages[0].push({ test: 1 });
  Library.track(b);
  assert.ok(b.modifiedAt > 1);
  b.modifiedAt = 2;
  b.pages[0].pop();
  Library.track(b);
  assert.ok(b.modifiedAt > 2);
});
