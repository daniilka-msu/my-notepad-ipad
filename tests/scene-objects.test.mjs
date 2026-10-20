import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
const pointSegmentDistance = (p, a, b) => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const segmentDistance = (a, b, c, d) => {
  const rx = b.x - a.x,
    ry = b.y - a.y,
    sx = d.x - c.x,
    sy = d.y - c.y,
    den = rx * sy - ry * sx;
  if (den) {
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den,
      u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
};
const context = vm.createContext({
  window: {},
  structuredClone,
  book: { pageSize: "a4" },
  Paper: {
    geometry: (b) => ({ outputHeight: b.pageSize === "square" ? 794 : 1123 }),
  },
  TextBlocks: { layout: (s) => ({ height: s.size * 2 }) },
  Shapes: { closed: new Set(["circle", "rect"]) },
  pointSegmentDistance,
  segmentDistance,
});
vm.runInContext(
  await readFile(new URL("../scene-objects.js", import.meta.url), "utf8"),
  context,
);
const scene = context.window.SceneObjects;
const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
test("lasso distinguishes inside and crossing strokes without testing only sample endpoints", () => {
  const s = {
    tool: "pen",
    width: 2,
    points: [
      { x: -20, y: 50 },
      { x: 120, y: 50 },
    ],
  };
  assert.equal(scene.selected(s, square, false), false);
  assert.equal(scene.selected(s, square, true), true);
  assert.equal(
    scene.selected(
      {
        ...s,
        points: [
          { x: 10, y: 10 },
          { x: 90, y: 90 },
        ],
      },
      square,
      false,
    ),
    true,
  );
  assert.equal(scene.selected({ ...s, tool: "eraser" }, square, true), false);
});
test("concave lasso rejects a segment leaving the contour between internal endpoints", () => {
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 30 },
    { x: 30, y: 30 },
    { x: 30, y: 70 },
    { x: 100, y: 70 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const s = {
    tool: "pen",
    width: 1,
    points: [
      { x: 80, y: 20 },
      { x: 80, y: 80 },
    ],
  };
  assert.equal(scene.selected(s, path, false), false);
  assert.equal(scene.selected(s, path, true), true);
});
test("quarter-turn preserves stroke geometry, raw samples and original data", () => {
  const s = {
    tool: "pen",
    width: 3,
    points: [
      { x: 10, y: 0, p: 0.4 },
      { x: 20, y: 0, p: 0.8 },
    ],
    rawPoints: [{ x: 10, y: 0, p: 0.4 }],
  };
  const next = scene.transform(
    s,
    { angle: 90, scale: 2, dx: 5 },
    { x: 0, y: 0 },
  );
  assert.ok(Math.abs(next.points[0].x - 5) < 1e-8);
  assert.ok(Math.abs(next.points[0].y - 20) < 1e-8);
  assert.equal(next.points[1].p, 0.8);
  assert.equal(next.width, 6);
  assert.equal(s.points[0].x, 10);
});
test("text rotation keeps editable content and swaps physical bounds", () => {
  const s = {
    type: "text-block",
    text: "Текст",
    font: "Georgia",
    size: 20,
    width: 100,
    x: 0,
    y: 0,
    bold: true,
  };
  const next = scene.transform(s, { angle: 90 }, { x: 50, y: 20 });
  const box = scene.bounds(next);
  assert.equal(next.text, s.text);
  assert.equal(next.font, s.font);
  assert.equal(next.rotation, 90);
  assert.ok(Math.abs(box.width - 40) < 1e-8);
  assert.ok(Math.abs(box.height - 100) < 1e-8);
});
test("rotation on square paper uses physical distances rather than stretched logical axes", () => {
  context.book.pageSize = "square";
  const s = { tool: "pen", width: 1, points: [{ x: 100, y: 0 }] };
  const next = scene.transform(s, { angle: 90 }, { x: 0, y: 0 });
  assert.ok(Math.abs((next.points[0].y * 794) / 1123 - 100) < 1e-8);
  context.book.pageSize = "a4";
});
test("function graph points stay in mathematical coordinates during object transforms", () => {
  const s = {
    type: "chart-object",
    kind: "function",
    x: 100,
    y: 200,
    width: 400,
    height: 300,
    points: [{ name: "A", x: 2, y: 3 }],
  };
  const next = scene.transform(
    s,
    { dx: 50, dy: 60, angle: 90 },
    { x: 300, y: 350 },
  );
  assert.deepEqual(next.points, s.points);
  assert.equal(next.rotation, 90);
  assert.ok(Math.abs(scene.bounds(s).x - 100) < 1e-8);
  const empty = scene.transform(
    { ...s, points: [] },
    { dx: 50, dy: 60 },
    { x: 0, y: 0 },
  );
  assert.equal(empty.x, 150);
  assert.equal(empty.y, 260);
});
