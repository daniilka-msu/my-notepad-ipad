import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const source = await readFile(
    new URL("../math-expression.js", import.meta.url),
    "utf8",
  ),
  ranges = await readFile(
    new URL("../graph-ranges.js", import.meta.url),
    "utf8",
  ),
  GraphRanges = vm.runInNewContext(source + ";" + ranges + ";GraphRanges");
test("y=f(x) normalization keeps the existing safe expression language", () => {
  assert.equal(GraphRanges.normalize(" y = x^2-4 "), "x^2-4");
  assert.equal(GraphRanges.normalize("x=2"), "x=2");
  assert.equal(GraphRanges.normalize("sqrt(x)"), "sqrt(x)");
});
test("automatic parabola range includes extrema", () => {
  const r = GraphRanges.automatic([{ expression: "y=x^2-4" }], -5, 5);
  assert.ok(r.yMin < -4 && r.yMax > 21);
});
test("multiple functions and explicit points affect automatic Y", () => {
  const r = GraphRanges.automatic(
    [{ expression: "sin(x)" }, { expression: "2*x+1" }],
    -5,
    5,
    [{ y: 30 }],
  );
  assert.ok(r.yMin < -9 && r.yMax > 30);
});
test("constant functions receive a nonzero range", () => {
  const r = GraphRanges.automatic([{ expression: "0" }], -5, 5);
  assert.ok(r.yMin < 0 && r.yMax > 0);
});
test("hyperbola skips undefined samples", () => {
  const r = GraphRanges.automatic([{ expression: "1/x" }], -5, 5);
  assert.ok(Number.isFinite(r.yMin) && r.yMin < 0 && r.yMax > 0);
});
test("invalid and unsafe expressions never execute", () => {
  for (const expression of ["alert(1)", "x;2", "constructor(1)", "x=2"])
    assert.throws(() => GraphRanges.automatic([{ expression }], -5, 5));
});
test("undefined-only domains and invalid X return errors", () => {
  assert.throws(() =>
    GraphRanges.automatic([{ expression: "sqrt(x)" }], -5, -1),
  );
  assert.throws(() => GraphRanges.automatic([{ expression: "x" }], 5, -5));
  assert.throws(() =>
    GraphRanges.automatic([{ expression: "x" }], 0, Infinity),
  );
});
