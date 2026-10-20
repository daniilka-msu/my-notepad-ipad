import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
const context = vm.createContext({});
vm.runInContext(
  (await readFile(new URL("../brushes.js", import.meta.url), "utf8")) +
    ";globalThis.brushes=Brushes",
  context,
);
function render(value) {
  const counts = { stroke: 0, arc: 0, lineTo: 0, fill: 0 },
    canvas = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      setLineDash() {},
    };
  for (const key of Object.keys(counts)) canvas[key] = () => counts[key]++;
  context.brushes.render(canvas, value);
  return { counts, width: canvas.lineWidth };
}
const points = Array.from({ length: 1000 }, (_, i) => ({
  x: i * 0.2,
  y: Math.sin(i * 0.1) * 3,
  p: 0.5,
  pressureValid: true,
}));
test("constant-width handwriting submits one native path without resampling stamps", () => {
  for (const pressure of [false, true]) {
    const result = render({
      points,
      width: 2,
      color: "#222222",
      penType: "regular",
      pressure,
    });
    assert.equal(result.counts.stroke, 1);
    assert.equal(result.counts.arc, 0);
    assert.equal(result.counts.lineTo, 999);
    assert.equal(result.width, 2);
  }
});
test("native path retains brush width and constant credible pressure", () => {
  assert.equal(
    render({
      points,
      width: 2,
      color: "#222222",
      penType: "ballpoint",
      pressure: false,
    }).width,
    1.6,
  );
  assert.equal(
    render({
      points,
      width: 2,
      color: "#222222",
      penType: "gel",
      pressure: false,
    }).width,
    2.3,
  );
  assert.ok(
    Math.abs(
      render({
        points: points.map((p) => ({ ...p, p: 0.75 })),
        width: 2,
        color: "#222222",
        penType: "regular",
        pressure: true,
      }).width - 2.7,
    ) < 1e-9,
  );
});
test("varying pressure and uncertain pressure retain the pressure-aware renderer", () => {
  for (const samples of [
    [
      { x: 0, y: 0, p: 0.2 },
      { x: 20, y: 0, p: 0.8 },
    ],
    [
      { x: 0, y: 0, p: 0.5, pressureValid: false },
      { x: 20, y: 0, p: 0.5 },
    ],
  ]) {
    const result = render({
      points: samples,
      width: 2,
      color: "#222222",
      penType: "regular",
      pressure: true,
    });
    assert.ok(result.counts.arc > 1);
    assert.equal(result.counts.stroke, 0);
  }
});
test("single taps remain round dots and input vectors are unchanged", () => {
  const source = {
      points: [{ x: 5, y: 7, p: 0.5 }],
      width: 2,
      color: "#222222",
      penType: "regular",
      pressure: false,
    },
    copy = structuredClone(source),
    result = render(source);
  assert.equal(result.counts.arc, 1);
  assert.equal(result.counts.fill, 1);
  assert.deepEqual(source, copy);
});
