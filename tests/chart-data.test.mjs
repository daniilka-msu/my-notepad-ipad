import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const ChartData = vm.runInNewContext(
  (await readFile(new URL("../chart-data.js", import.meta.url), "utf8")) +
    ";ChartData",
);
test("Excel/Numbers TSV and optional header", () =>
  assert.equal(
    JSON.stringify(
      ChartData.parse("Категория\tЗначение\r\nМатематика\t85\r\nФизика\t72"),
    ),
    JSON.stringify([
      { label: "Математика", value: 85 },
      { label: "Физика", value: 72 },
    ]),
  ));
test("semicolon lists preserve decimal commas and negatives", () =>
  assert.equal(ChartData.parse("A; -2,5\nБ; 1 200")[0].value, -2.5));
test("scatter imports x and y separately", () => {
  const [p] = ChartData.parse("Имя\tX\tY\nA\t-1,5\t3", true);
  assert.equal(p.x, -1.5);
  assert.equal(p.value, 3);
});
test("zero and exponent are valid numbers", () =>
  assert.equal(ChartData.parse("A;0\nB;1e3")[1].value, 1000));
test("invalid or executable values are rejected", () => {
  for (const text of [
    "",
    "A;",
    "A;NaN",
    "A;Infinity",
    "A;1e999",
    "A;1;2",
    "A;alert(1)",
    "A;1,2,3",
    ";5",
    "A;0xFF",
  ])
    assert.throws(() => ChartData.parse(text));
});
test("table size and label size are bounded", () => {
  assert.throws(() => ChartData.parse(Array(101).fill("A;1").join("\n")));
  assert.throws(() => ChartData.parse("x".repeat(61) + ";1"));
  assert.equal(ChartData.parse(Array(100).fill("A;1").join("\n")).length, 100);
});
