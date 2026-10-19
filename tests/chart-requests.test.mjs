import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const code = await readFile(
    new URL("../chart-data.js", import.meta.url),
    "utf8",
  ),
  requests = await readFile(
    new URL("../chart-requests.js", import.meta.url),
    "utf8",
  ),
  ChartRequests = vm.runInNewContext(code + ";" + requests + ";ChartRequests");
test("Russian request extracts real category values locally", () => {
  const s = ChartRequests.parse(
    "Построй диаграмму: математика 85, физика 72, информатика 94",
  );
  assert.equal(s.kind, "bar");
  assert.equal(s.data.length, 3);
  assert.equal(s.data[2].value, 94);
  assert.equal(s.data[0].label, "математика");
});
test("explicit chart styles and decimal commas", () => {
  for (const [word, kind] of [
    ["круговую", "pie"],
    ["кольцевую", "doughnut"],
    ["линейную", "line"],
    ["столбчатую", "bar"],
  ]) {
    const s = ChartRequests.parse(
      "Создай " + word + " диаграмму: A 2,5; B 3,2",
    );
    assert.equal(s.kind, kind);
    assert.equal(s.data[0].value, 2.5);
  }
});
test("unambiguous bare data, colons, equals and newlines are supported", () => {
  assert.equal(ChartRequests.parse("A: 10\nB=20").data[1].value, 20);
  assert.equal(
    ChartRequests.parse("Русский язык 85; Алгебра -2").data[1].value,
    -2,
  );
});
test("complex descriptions never invent missing data", () => {
  for (const text of [
    "Построй график y=x^2",
    "Сравни мои оценки за год",
    "Построй диаграмму роста без данных",
    "A NaN",
    "A 1e999",
    "A alert(1)",
    "Построй круговую диаграмму: A -2, B 3",
  ])
    assert.throws(() => ChartRequests.parse(text));
});
test("provider schema rejects extra fields and wrong numbers", () => {
  const s = { kind: "bar", data: [{ label: "A", value: 1 }] };
  for (const bad of [
    { ...s, html: "<script>" },
    { ...s, kind: "function" },
    { ...s, data: [{ label: "A", value: "1" }] },
    { ...s, data: [{ label: "A", value: Infinity }] },
    { ...s, data: [{ label: "A", value: 1, url: "secret" }] },
    { ...s, data: Array(101).fill(s.data[0]) },
  ])
    assert.throws(() => ChartRequests.validate(bad));
  assert.equal(ChartRequests.validate(s).data[0].value, 1);
});
test("no AI provider is connected by default", async () => {
  assert.equal(ChartRequests.providerLabel, null);
  await assert.rejects(ChartRequests.generate("A 1"), /не подключён/);
});
test("future adapter only gets request text and validated result", async () => {
  let payload;
  ChartRequests.connect({
    label: "Test-only mock",
    generate: async (input) => {
      payload = input;
      return { kind: "bar", title: "Test", data: [{ label: "A", value: 10 }] };
    },
  });
  const r = await ChartRequests.generate("A 10");
  assert.equal(payload.text, "A 10");
  assert.equal(Object.keys(payload).sort().join(","), "signal,text");
  assert.equal(r.data[0].value, 10);
  ChartRequests.connect(null);
});
test("cancelled adapter results cannot be used", async () => {
  let finish;
  ChartRequests.connect({
    label: "Test-only deferred mock",
    generate: () => new Promise((r) => (finish = r)),
  });
  const c = new AbortController(),
    result = ChartRequests.generate("A 1", { signal: c.signal });
  c.abort();
  finish({ kind: "bar", data: [{ label: "A", value: 1 }] });
  await assert.rejects(result, /отменён/);
  ChartRequests.connect(null);
});
