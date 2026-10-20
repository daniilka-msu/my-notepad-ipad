import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
const { chromium, webkit } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const root = resolve(import.meta.dirname, ".."),
  files = new Set(
    JSON.parse(
      (await readFile(resolve(root, "sw.js"), "utf8")).match(
        /const FILES=(\[[^\n]+\]);/,
      )[1],
    ).map((s) => s.slice(2) || "index.html"),
  );
files.add("sw.js");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
const server = http.createServer(async (req, res) => {
  try {
    const path =
      decodeURIComponent(new URL(req.url, "http://local").pathname).slice(1) ||
      "index.html";
    if (!files.has(path)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(resolve(root, path)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port;
const directory = process.env.SCREENSHOT_DIR;
if (directory) await mkdir(directory, { recursive: true });
function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log("PASS " + message);
}
try {
  for (const engine of ["chromium", "webkit"]) {
    const browser = await (engine === "chromium"
      ? chromium.launch({ channel: "msedge" })
      : webkit.launch());
    try {
      const context = await browser.newContext({
          viewport: { width: 1024, height: 768 },
          hasTouch: true,
        }),
        page = await context.newPage(),
        errors = [];
      page.setDefaultTimeout(12000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.evaluate(async () => {
        await Home.ready;
        if (!Library.active(data).length) {
          const entry = Library.newBook({
            name: "Регрессионная тетрадь",
            template: "plain",
            pageSize: "a4",
            paper: "blank",
            color: "#5369d8",
            pattern: "plain",
          });
          data.books.push(entry);
          Home.open(entry.id, { history: false });
        } else Home.open(data.selected, { history: false });
      });
      await page.waitForFunction(
        () => typeof storageReady !== "undefined" && storageReady,
      );

      const check = async (fn, label) =>
        assert(await page.evaluate(fn), engine + " " + label);
      await check(() => {
        const view = { x: 13.25, y: 5.75, width: 150, height: 150 },
          create = () => {
            const c = document.createElement("canvas");
            c.width = c.height = 300;
            return c;
          },
          scratch = create(),
          mask = create(),
          actual = create(),
          expected = create();
        try {
          for (const kind of Object.keys(Brushes.labels)) {
            const s = {
              brushVersion: 1,
              seed: 17,
              tool: kind === "marker" ? "marker" : "pen",
              penType: kind,
              color: "#5369d8",
              width: kind === "marker" ? 12 : 3,
              opacity: 0.65,
              pressure: true,
              tightSampling: true,
              points: Array.from({ length: 30 }, (_, i) => ({
                x: -5 + i * 7,
                y: 25 + Math.sin(i * 0.5) * 10,
                p: 0.2 + i * 0.02,
                pressureValid: true,
              })),
            };
            const a = actual.getContext("2d"),
              e = expected.getContext("2d"),
              m = mask.getContext("2d");
            for (const c of [a, e, m]) {
              c.setTransform(1, 0, 0, 1, 0, 0);
              c.clearRect(0, 0, 300, 300);
              c.setTransform(2, 0, 0, 2, -view.x * 2, -view.y * 2);
            }
            stroke(s, a, { scratch, view, sx: 2, sy: 2 });
            Brushes.render(m, s);
            e.save();
            e.globalAlpha = s.opacity * (s.tool === "marker" ? 0.28 : 1);
            e.drawImage(mask, view.x, view.y, view.width, view.height);
            e.restore();
            if (actual.toDataURL() !== expected.toDataURL()) return false;
          }
          return true;
        } finally {
          for (const c of [scratch, mask, actual, expected])
            c.width = c.height = 1;
        }
      }, "cropped masks match full masks for every brush at a fractional viewport");
      await page.evaluate(async () => {
        const fixture = Array.from({ length: 1000 }, (_, i) => ({
          tool: "pen",
          color: "#222222",
          width: 2,
          brushVersion: 1,
          penType: "regular",
          seed: i + 1,
          points: [
            { x: 40 + (i % 24) * 28, y: 60 + Math.floor((i % 1200) / 24) * 17 },
            { x: 60 + (i % 24) * 28, y: 60 + Math.floor((i % 1200) / 24) * 17 },
          ],
        }));
        fixture.push({
          type: "text-block",
          text: "Overlay",
          font: "Arial",
          size: 24,
          x: 100,
          y: 100,
          width: 250,
          color: "#b76750",
          rotation: 90,
          bold: false,
          italic: false,
          align: "left",
        });
        fixture.push({
          tool: "eraser",
          width: 8,
          color: "#000000",
          points: [
            { x: 110, y: 90 },
            { x: 110, y: 150 },
          ],
        });
        fixture.push({
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
        fixture.push({
          type: "object-order",
          target: 1002,
          placement: "front",
        });
        book.pages = [fixture];
        page = 0;
        render();
        InkQuality.refresh();
        await new Promise(requestAnimationFrame);
        preferences.opacity = 65;
        Editor.choose("pen");
        canvas.setPointerCapture = () => {};
        canvas.hasPointerCapture = () => false;
        window.perf50 = {
          previous: 0,
          active: 0,
          writes: 0,
          rects: 0,
          baseBlits: 0,
          maxMaskArea: 0,
          sidebar: $("books").firstChild,
        };
        const original = stroke,
          put = IDBObjectStore.prototype.put,
          rect = canvas.getBoundingClientRect.bind(canvas);
        const blit = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (...args) {
          if (drawing) {
            if (this.canvas.id === "inkDetail") perf50.baseBlits++;
            if (this.canvas.id === "inkActive" && args.length === 9)
              perf50.maxMaskArea = Math.max(
                perf50.maxMaskArea,
                args[3] * args[4],
              );
          }
          return blit.apply(this, args);
        };
        stroke = function (s, ...args) {
          if (drawing) {
            if (s === drawing) perf50.active++;
            else perf50.previous++;
          }
          return original(s, ...args);
        };
        IDBObjectStore.prototype.put = function (...args) {
          if (activeInkInput()) perf50.writes++;
          return put.apply(this, args);
        };
        canvas.getBoundingClientRect = () => {
          perf50.rects++;
          return rect();
        };
        window.emit50 = (type, x = 100, y = 100, extra = {}) => {
          const r = rect();
          const event = new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 33,
            pointerType: "pen",
            button: 0,
            buttons: 1,
            pressure: 0.5,
            clientX: r.left + x,
            clientY: r.top + y,
            ...extra,
          });
          canvas.dispatchEvent(event);
          return event;
        };
      });
      await page.evaluate(() => emit50("pointerdown"));
      await page.waitForTimeout(30);
      await page.evaluate(() => {
        for (let i = 1; i <= 40; i++)
          emit50("pointermove", 100 + i, 100 + Math.sin(i * 0.2) * 5);
      });
      await page.waitForFunction(() => perf50.active > 0);
      await check(
        () => perf50.active > 0 && perf50.previous === 0 && perf50.writes === 0,
        "active handwriting never replays completed content or writes IndexedDB",
      );
      await check(
        () =>
          perf50.baseBlits === 0 &&
          perf50.maxMaskArea > 0 &&
          perf50.maxMaskArea <
            $("inkActive").width * $("inkActive").height * 0.3,
        "active overlay leaves completed raster untouched and composites a bounded stroke mask",
      );
      await check(
        () => $("inkDetail").hidden === false && canvas.style.opacity === "0",
        "active ink is displayed through the visible high-resolution layer",
      );
      await page.evaluate(() => emit50("pointercancel", 140));
      await check(
        () => !drawing && book.pages[0].at(-1).rawPoints.length === 41,
        "pointercancel preserves collected input as a separate completed stroke",
      );
      await check(
        () => $("books").firstChild === perf50.sidebar,
        "finishing handwriting preserves unchanged library DOM",
      );
      await check(() => {
        const expected = canvas.toDataURL();
        cachedItems = null;
        paint();
        return expected === canvas.toDataURL();
      }, "damage replay matches full page pixels with order changes, erasing and rotated text");
      await check(() => {
        PageView.setZoom(1.7);
        $("workspace").scrollTop = 137;
        InkQuality.refresh();
        const source = book.pages[0],
          last = source.at(-1);
        source.push({
          ...last,
          strokeId: uid(),
          points: last.points.map((p) => ({ ...p, x: p.x + 4, y: p.y + 2 })),
          rawPoints: last.rawPoints.map((p) => ({
            ...p,
            x: p.x + 4,
            y: p.y + 2,
          })),
        });
        paint();
        InkQuality.refresh();
        const expected = $("inkDetail").toDataURL();
        InkQuality.invalidate();
        InkQuality.refresh();
        return expected === $("inkDetail").toDataURL();
      }, "clipped viewport damage preserves exact pixels at fractional zoom");
      await page.evaluate(() => {
        preferences.opacity = 100;
        PageView.fit();
        InkQuality.refresh();
        perf50.rects = 0;
        const r = canvas.getBoundingClientRect(),
          samples = [];
        emit50("pointerdown", 100);
        for (let i = 0; i < 16; i++)
          samples.push(
            new PointerEvent("pointermove", {
              pointerId: 33,
              pointerType: "pen",
              pressure: 0.6,
              clientX: r.left + 101 + i,
              clientY: r.top + 100,
            }),
          );
        const e = new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          pointerId: 33,
          pointerType: "pen",
          pressure: 0.6,
          buttons: 1,
          clientX: r.left + 118,
          clientY: r.top + 100,
        });
        Object.defineProperty(e, "getCoalescedEvents", {
          value: () => samples,
        });
        perf50.rects = 0;
        canvas.dispatchEvent(e);
      });
      await check(
        () => drawing.rawPoints.length === 18 && perf50.rects < 8,
        "coalesced samples are preserved with one shared document geometry per batch",
      );
      await page.evaluate(() => emit50("pointerup", 120));
      await page.evaluate(async () => {
        Backups.validateLibrary(data);
        await save();
      });
      const expected = await page.evaluate(async () => {
        return (await Documents.compose(book, page)).toDataURL();
      });
      await page.reload();
      await page.evaluate(async () => {
        await Home.ready;
        Home.open(data.selected, { history: false });
      });
      assert(
        (await page.evaluate(async () =>
          (await Documents.compose(book, page)).toDataURL(),
        )) === expected,
        engine + " saved and reopened optimized scene exports identical PNG",
      );
      assert(
        errors.length === 0,
        engine + " no script errors: " + errors.join(","),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  server.closeAllConnections();
}
