import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const root = resolve(import.meta.dirname, "..");
const reference = process.env.PERF_BASELINE;
if (reference && !/^[a-f0-9]{7,40}$/.test(reference))
  throw Error("PERF_BASELINE must be a commit hash");
const baseline = reference
  ? new Map(
      [
        "app.js",
        "ink-quality.js",
        "ink-surface.js",
        "canvas-editor.js",
        "brushes.js",
      ].map((path) => [
        path,
        execFileSync(
          "git",
          [
            "-c",
            "safe.directory=" + root.replaceAll("\\", "/"),
            "show",
            reference + ":" + path,
          ],
          { cwd: root },
        ),
      ]),
    )
  : null;
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
    res.end(baseline?.get(path) || (await readFile(resolve(root, path))));
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
  const profiler = process.env.PERF_PROFILE
    ? await page.context().newCDPSession(page)
    : null;
  if (profiler) {
    await profiler.send("Profiler.enable");
    await profiler.send("Profiler.start");
  }
  const result = await page.evaluate(async () => {
    const stats = (values) => {
      const a = [...values].sort((a, b) => a - b);
      return {
        n: a.length,
        medianMs: +(a[Math.floor(a.length / 2)] || 0).toFixed(3),
        p95Ms: +(a[Math.floor(a.length * 0.95)] || 0).toFixed(3),
        maxMs: +(a.at(-1) || 0).toFixed(3),
        totalMs: +a.reduce((sum, value) => sum + value, 0).toFixed(3),
      };
    };
    const nextFrame = () => new Promise(requestAnimationFrame);
    const results = [];
    let measuring = false,
      counts = {},
      timings = {},
      intervals = [],
      lastFrame,
      lastInput = 0,
      lastVisibleInput = NaN;
    const reset = () => {
      lastVisibleInput = NaN;
      counts = {
        paint: 0,
        stroke: 0,
        previousStroke: 0,
        ordered: 0,
        sidebar: 0,
        put: 0,
        json: 0,
        resize: 0,
      };
      timings = {
        paint: [],
        stroke: [],
        dispatch: [],
        finish: [],
        latency: [],
      };
      intervals = [];
      lastFrame = undefined;
    };
    const wrap = (fn, name) =>
      function (...args) {
        const t = performance.now();
        if (measuring) counts[name]++;
        try {
          return fn.apply(this, args);
        } finally {
          if (measuring && timings[name])
            timings[name].push(performance.now() - t);
        }
      };
    paint = wrap(paint, "paint");
    renderBooks = wrap(renderBooks, "sidebar");
    Shapes.ordered = wrap(Shapes.ordered, "ordered");
    const oldStroke = stroke,
      visibleContext = ($("inkActive") || $("inkDetail")).getContext("2d");
    stroke = function (s, ...args) {
      const t = performance.now();
      if (measuring) {
        counts.stroke++;
        if (s !== drawing) counts.previousStroke++;
      }
      try {
        return oldStroke(s, ...args);
      } finally {
        if (measuring) timings.stroke.push(performance.now() - t);
        if (
          measuring &&
          s === drawing &&
          args[0] === visibleContext &&
          lastVisibleInput !== lastInput
        ) {
          timings.latency.push(performance.now() - lastInput);
          lastVisibleInput = lastInput;
        }
      }
    };
    const oldPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (measuring) counts.put++;
      return oldPut.apply(this, args);
    };
    const stringify = JSON.stringify;
    JSON.stringify = function (...args) {
      if (measuring) counts.json++;
      return stringify(...args);
    };
    for (const key of ["width", "height"]) {
      const d = Object.getOwnPropertyDescriptor(
        HTMLCanvasElement.prototype,
        key,
      );
      Object.defineProperty(HTMLCanvasElement.prototype, key, {
        ...d,
        set(value) {
          if (measuring) counts.resize++;
          return d.set.call(this, value);
        },
      });
    }
    canvas.setPointerCapture = () => {};
    canvas.hasPointerCapture = () => false;
    const fixture = (n) =>
      Array.from({ length: n }, (_, i) => ({
        tool: "pen",
        brushVersion: 1,
        penType: "regular",
        seed: i + 1,
        filtered: true,
        tightSampling: true,
        color: "#222222",
        width: 2,
        points: Array.from({ length: 12 }, (_, j) => ({
          x: 40 + (i % 24) * 28 + j * 2,
          y: 60 + Math.floor((i % 1200) / 24) * 17 + Math.sin(j) * 2,
          p: 0.5,
          pressureValid: false,
        })),
      }));
    for (const n of [0, 100, 1000, 5000, 10000]) {
      data.books = [
        {
          id: "perf50",
          name: "Performance 5.0",
          paper: "grid",
          pages: [fixture(n)],
        },
      ];
      data.selected = "perf50";
      const openStart = performance.now();
      Home.open("perf50", { history: false });
      InkQuality.refresh();
      await nextFrame();
      const openMs = performance.now() - openStart;
      await save();
      Editor.choose("pen");
      const r = canvas.getBoundingClientRect();
      let j = 0;
      const event = (type) => {
        const t = performance.now();
        lastInput = t;
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 77,
            pointerType: "pen",
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            pressure: 0.5,
            clientX: r.left + 80 + (j++ % 80),
            clientY: r.top + 100 + Math.sin(j * 0.1) * 4,
          }),
        );
        if (measuring) timings.dispatch.push(performance.now() - t);
      };
      reset();
      measuring = true;
      event("pointerdown");
      for (let i = 0; i < 24; i++) {
        for (let k = 0; k < 4; k++) event("pointermove");
        await nextFrame();
        await nextFrame();
        const now = performance.now();
        if (lastFrame !== undefined) intervals.push((now - lastFrame) / 2);
        lastFrame = now;
      }
      measuring = false;
      const activeFrameInterval = stats(intervals),
        activeCounts = { ...counts },
        activeTiming = Object.fromEntries(
          Object.entries(timings).map(([k, v]) => [k, stats(v)]),
        );
      reset();
      measuring = true;
      const end = performance.now();
      event("pointerup");
      const finishMs = performance.now() - end;
      await nextFrame();
      await nextFrame();
      measuring = false;
      const finishCounts = { ...counts };
      const saveStart = performance.now();
      await save();
      const saveMs = performance.now() - saveStart;
      const zoomStart = performance.now();
      PageView.setZoom(1.1);
      InkQuality.refresh();
      const zoomMs = performance.now() - zoomStart;
      PageView.fit();
      await nextFrame();
      const switchStart = performance.now();
      Editor.choose("eraser");
      Editor.choose("pen");
      const switchMs = performance.now() - switchStart;
      const layers = [...document.querySelectorAll("canvas")].map((c) => ({
        id: c.id,
        pixels: c.width * c.height,
      }));
      results.push({
        strokes: n,
        pointsPerStroke: 12,
        openMs: +openMs.toFixed(2),
        saveMs: +saveMs.toFixed(2),
        zoomMs: +zoomMs.toFixed(2),
        switchMs: +switchMs.toFixed(2),
        finishMs: +finishMs.toFixed(2),
        activeCounts,
        finishCounts,
        activeTiming,
        frameInterval: activeFrameInterval,
        visibleCanvasPixels: layers,
        heapBytes: performance.memory?.usedJSHeapSize ?? null,
      });
    }
    const hot = [];
    for (const scenario of ["ordered-1000", "long-active"]) {
      const items = fixture(1000);
      if (scenario === "ordered-1000") {
        items.push({
          type: "sticker-object",
          symbol: "important",
          text: "Order",
          x: 110,
          y: 100,
          width: 100,
          height: 80,
          color: "#222222",
          fill: "#fff6df",
        });
        items.push({ type: "object-order", target: 1000, placement: "front" });
      }
      data.books = [
        { id: "hot50", name: scenario, paper: "grid", pages: [items] },
      ];
      data.selected = "hot50";
      Home.open("hot50", { history: false });
      InkQuality.refresh();
      await nextFrame();
      await save();
      Editor.choose("pen");
      const r = canvas.getBoundingClientRect();
      let j = 0;
      const event = (type) => {
        const t = performance.now();
        lastInput = t;
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 88,
            pointerType: "pen",
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            pressure: 0.5,
            clientX: r.left + 180 + Math.sin(j++ * 0.05) * 80,
            clientY: r.top + 100 + Math.sin(j * 0.1) * 30,
          }),
        );
        if (measuring) timings.dispatch.push(performance.now() - t);
      };
      reset();
      measuring = true;
      event("pointerdown");
      for (let i = 0; i < (scenario === "long-active" ? 80 : 12); i++) {
        for (let k = 0; k < 16; k++) event("pointermove");
        await nextFrame();
        await nextFrame();
      }
      const active = {
        counts: { ...counts },
        timings: Object.fromEntries(
          Object.entries(timings).map(([key, values]) => [key, stats(values)]),
        ),
      };
      measuring = false;
      reset();
      measuring = true;
      const start = performance.now();
      event("pointerup");
      const finishMs = performance.now() - start;
      await nextFrame();
      await nextFrame();
      measuring = false;
      hot.push({ scenario, active, finishMs, finishCounts: { ...counts } });
    }
    const extra = [];
    {
      const image = document.createElement("canvas");
      image.width = image.height = 512;
      const c = image.getContext("2d");
      c.fillStyle = "#5369d8";
      c.fillRect(0, 0, 512, 512);
      const blob = await new Promise((r) => image.toBlob(r));
      const value = await ImageObjects.importFile(
        new File([blob], "fixture.png", { type: "image/png" }),
      );
      const b = Library.newBook({
        name: "Image fixture",
        template: "plain",
        paper: "grid",
        pageSize: "a4",
        color: "#5369d8",
        pattern: "plain",
      });
      b.pages = [fixture(1000).concat(value)];
      data.books = [b];
      data.selected = b.id;
      const start = performance.now();
      Home.open(b.id, { history: false });
      await ImageObjects.prepare(b.pages[0]);
      paint();
      InkQuality.refresh();
      const openMs = performance.now() - start;
      const saveStart = performance.now();
      await save();
      extra.push({
        fixture: "image-1000",
        openMs,
        saveMs: performance.now() - saveStart,
      });
    }
    for (const format of ["continuous", "infinite"]) {
      const b = Library.newBook({
        name: "Spatial " + format,
        template: "plain",
        paper: "grid",
        pageSize: "a4",
        color: "#5369d8",
        pattern: "plain",
      });
      b.canvasDocument = { version: 1, format, initialZoom: 1 };
      const model = await SpatialDocument.open(b.id, format),
        entries = Array.from({ length: 2000 }, (_, i) => {
          const x = format === "continuous" ? 40 : (i % 2 ? -1 : 1) * i * 300,
            y = 60 + i * 600,
            s = fixture(1)[0];
          s.points = s.points.map((p) => ({
            ...p,
            x: p.x + x - 40,
            y: p.y + y - 60,
          }));
          return {
            id: "fixture-" + i,
            order: i,
            bounds: { x: x - 6, y: y - 6, width: 40, height: 18 },
            value: s,
          };
        });
      model.commit(
        entries.map((after) => ({ id: after.id, before: null, after })),
      );
      await model.save();
      model.clearCache();
      data.books.push(b);
      data.selected = b.id;
      const start = performance.now();
      Home.open(b.id, { history: false });
      while (CanvasEditor.loading || CanvasEditor.session?.book.id !== b.id)
        await new Promise((r) => setTimeout(r, 5));
      const openMs = performance.now() - start;
      const moveStart = performance.now();
      const moved = await CanvasEditor.move({
        x: format === "continuous" ? 0 : -300000,
        y: 600060,
      });
      const moveMs = performance.now() - moveStart;
      const saveStart = performance.now();
      await save();
      extra.push({
        fixture: format + "-2000-separated",
        openMs,
        moveMs,
        saveMs: performance.now() - saveStart,
        moved,
        cache: CanvasEditor.session.model.stats,
        loadedObjects: book.pages[0].length,
      });
    }
    return {
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      results,
      hot,
      extra,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  if (profiler) {
    const { profile } = await profiler.send("Profiler.stop");
    await writeFile(process.env.PERF_PROFILE, JSON.stringify(profile));
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
