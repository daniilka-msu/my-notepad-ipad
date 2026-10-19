import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const root = resolve(import.meta.dirname, "..");
const server = http.createServer(async (req, res) => {
  try {
    const path =
      decodeURIComponent(new URL(req.url, "http://local").pathname).slice(1) ||
      "index.html";
    if (path.includes("..")) throw Error();
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(resolve(root, path)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 900 },
  });
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.evaluate(async () => {
    await ready;
    await Home.ready;
  });
  const result = await page.evaluate(async () => {
    const fixture = () =>
      Array.from({ length: 1000 }, (_, i) => ({
        tool: "pen",
        width: 2,
        color: "#222222",
        points: Array.from({ length: 32 }, (_, j) => ({
          x: 40 + j * 5,
          y: 40 + (i % 180) * 5 + Math.sin(j) * 4,
          p: 0.5,
        })),
      }));
    data.books = Array.from({ length: 4 }, (_, i) => ({
      id: "perf" + i,
      name: "Performance " + i,
      paper: "grid",
      pages: [fixture(), fixture(), fixture()],
    }));
    data.selected = "perf0";
    Home.open("perf0");
    await save();
    const timings = { paint: [], sidebar: [], put: [], finish: [] };
    const originalPaint = paint,
      originalBooks = renderBooks,
      originalPut = IDBObjectStore.prototype.put;
    paint = (...args) => {
      const t = performance.now();
      try {
        return originalPaint(...args);
      } finally {
        timings.paint.push(performance.now() - t);
      }
    };
    renderBooks = (...args) => {
      const t = performance.now();
      try {
        return originalBooks(...args);
      } finally {
        timings.sidebar.push(performance.now() - t);
      }
    };
    IDBObjectStore.prototype.put = function (...args) {
      const t = performance.now();
      try {
        return originalPut.apply(this, args);
      } finally {
        if (this.name === "library") timings.put.push(performance.now() - t);
      }
    };
    canvas.setPointerCapture = () => {};
    canvas.hasPointerCapture = () => false;
    Editor.choose("pen");
    for (let i = 0; i < 15; i++) {
      const r = canvas.getBoundingClientRect();
      const event = (type, j) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: "pen",
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            pressure: 0.5,
            clientX: r.left + 80 + j * 2,
            clientY: r.top + 100 + i * 3,
          }),
        );
      event("pointerdown", 0);
      for (let j = 1; j < 20; j++) event("pointermove", j);
      const t = performance.now();
      event("pointerup", 20);
      timings.finish.push(performance.now() - t);
      await new Promise((r) => setTimeout(r, 30));
    }
    const writesDuringWriting = timings.put.length;
    await save();
    return {
      fixture: {
        books: 4,
        pages: 12,
        strokesPerPage: 1000,
        pointsPerStroke: 32,
        newStrokes: 15,
      },
      writesDuringWriting,
      metrics: Object.fromEntries(
        Object.entries(timings).map(([k, v]) => {
          v.sort((a, b) => a - b);
          return [
            k,
            {
              count: v.length,
              medianMs: +(v[Math.floor(v.length / 2)] || 0).toFixed(2),
              p95Ms: +(
                v[Math.min(v.length - 1, Math.floor(v.length * 0.95))] || 0
              ).toFixed(2),
            },
          ];
        }),
      ),
    };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
