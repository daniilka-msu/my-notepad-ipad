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

const measurements = [];
try {
  for (const engine of ["chromium", "webkit"]) {
    const browser = await (engine === "chromium"
      ? chromium.launch({ channel: "msedge" })
      : webkit.launch());
    try {
      const page = await browser.newPage({
          viewport: { width: 1024, height: 768 },
          hasTouch: true,
        }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.evaluate(async () => {
        await Home.ready;
        const b = Library.newBook({
          name: "Overhaul",
          template: "plain",
          pageSize: "a4",
          paper: "grid",
          color: "#5369d8",
          pattern: "plain",
        });
        data.books.push(b);
        Home.open(b.id, { history: false });
      });
      await page.waitForFunction(() => storageReady && !Home.active);
      await page.locator("#navigationMode").click();
      assert(
        await page.evaluate(() => tool === "hand"),
        engine + " navigation selects real hand tool",
      );
      await page.locator("[data-tool=pen]").click();
      await page.locator("[data-tool=pen]").click();
      assert(
        await page
          .locator("#brushDialog")
          .evaluate((e) => e.open && !e.matches(":modal")),
        engine + " pen options are nonmodal",
      );
      await page.locator("[data-tool=pen]").click();
      assert(
        !(await page.locator("#brushDialog").evaluate((e) => e.open)),
        engine + " repeat pen click closes options",
      );
      await page.locator("[data-tool=pen]").click();
      if (directory)
        await page.screenshot({
          animations: "disabled",
          path: resolve(directory, engine + "-floating-pen.png"),
        });
      const beforeDismiss = await page.evaluate(() => book.pages[page].length),
        sheet = await page.locator("#canvas").boundingBox();
      await page.mouse.click(sheet.x + sheet.width * 0.85, sheet.y + 80);
      assert(
        (await page.evaluate(() => !$("brushDialog").open)) &&
          (await page.evaluate(() => book.pages[page].length)) ===
            beforeDismiss,
        engine + " outside tap closes palette without accidental ink",
      );
      await page.locator('#writingShelf [data-color="#365ecc"]').click();
      await page.locator('#writingShelf [data-width="6"]').click();
      assert(
        await page.evaluate(
          () => preferences.color === "#365ecc" && preferences.width === 6,
        ),
        engine + " quick ink settings affect persisted preferences",
      );
      await page.locator("#focusMode").click();
      assert(await page.locator("#navigationMode").isVisible(), engine + " focus keeps navigation available");
      await page.locator("#focusMode").click();
      await page.evaluate(() => document.body.classList.add("toolbar-bottom"));
      await page.locator("[data-tool=pen]").click();
      const floating = await page.locator("#brushDialog").boundingBox();
      assert(floating.y >= 0 && floating.y + floating.height < 768, engine + " bottom toolbar palette fits viewport");
      await page.locator("#closeBrushes").click();
      await page.evaluate(() => document.body.classList.remove("toolbar-bottom"));
      await page.locator("[data-tool=eraser]").click();
      await page.locator("#toggleEraserMode").click();
      assert(
        await page.evaluate(() => preferences.eraserMode === "stroke"),
        engine + " quick eraser switch updates existing eraser",
      );
      await page.locator("[data-tool=pen]").click();
      const input = await page.evaluate(() => {
        book.pages[page] = [];
        render();
        $("smoothing").value = 0;
        $("smoothing").dispatchEvent(new Event("input"));
        preferences.stabilization = 0;
        canvas.setPointerCapture = () => {};
        canvas.hasPointerCapture = () => false;
        const r = canvas.getBoundingClientRect();
        const sample = (type, x, time, kind = "pen") => {
          const e = new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 800,
            pointerType: kind,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            pressure: kind === "pen" ? 0.6 : 0,
            tiltX: kind === "pen" ? 25 : 0,
            tiltY: kind === "pen" ? -15 : 0,
            clientX: r.left + (x / 794) * r.width,
            clientY: r.top + (240 / 1123) * r.height,
          });
          Object.defineProperty(e, "timeStamp", { value: time });
          if (kind === "pen") {
            Object.defineProperty(e, "tiltX", { value: 25 });
            Object.defineProperty(e, "tiltY", { value: -15 });
          }
          return e;
        };
        canvas.dispatchEvent(sample("pointerdown", 100, 100));
        const release = sample("pointerup", 140, 105);
        release.getCoalescedEvents = () => [
          sample("pointermove", 130, 103),
          sample("pointermove", 120, 102),
          sample("pointermove", 110, 101),
        ];
        canvas.dispatchEvent(release);
        const stroke = book.pages[page][0];
        const preserved =
          stroke.points.length === 5 &&
          stroke.points[3].x > 129 &&
          stroke.rawPoints[1].tiltX === 25 &&
          stroke.tilt;
        canvas.dispatchEvent(sample("pointerdown", 200, 110, "touch"));
        canvas.dispatchEvent(sample("pointermove", 220, 112, "touch"));
        canvas.dispatchEvent(sample("pointerup", 220, 113, "touch"));
        const touch = book.pages[page][1];
        $("inputMode").value = "stylus";
        canvas.dispatchEvent(sample("pointerdown", 240, 120, "touch"));
        const restricted = drawing === null && book.pages[page].length === 2;
        $("inputMode").value = "any";
        delete canvas.setPointerCapture;
        delete canvas.hasPointerCapture;
        return {
          cancelledFrame: frame === null,
          preserved,
          touch: !touch.pressure && touch.rawPoints[0].tiltX === undefined,
          restricted,
        };
      });
      assert(
        input.cancelledFrame,
        engine + " stroke completion cancels redundant scheduled canvas paint",
      );
      assert(
        input.preserved,
        engine +
          " release retains ordered coalesced movement and real pen tilt",
      );
      assert(
        input.touch && input.restricted,
        engine +
          " generic touch stylus works without fabricated pressure or tilt; pen-only restriction holds",
      );
      assert(
        await page.evaluate(() => {
          const style = getComputedStyle(
            document.getElementById("inputMode").closest("label"),
          );
          return (style.userSelect || style.webkitUserSelect) === "none";
        }),
        engine + " input label cannot start text selection",
      );
      await page.locator("#openZoomWriting").click();
      await page.locator("#pickWritingArea").click();
      const zoomInput = await page.evaluate(() => {
        const field = $("writingCanvas"),
          r = field.getBoundingClientRect();
        field.setPointerCapture = () => {};
        field.hasPointerCapture = () => false;
        const event = (type, x, t) => {
          const value = new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 804,
            pointerType: "pen",
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            pressure: 0.7,
            clientX: r.left + x,
            clientY: r.top + 40,
          });
          Object.defineProperties(value, {
            timeStamp: { value: t },
            tiltX: { value: 25 },
            tiltY: { value: -15 },
          });
          return value;
        };
        field.dispatchEvent(event("pointerdown", 40, 200));
        const up = event("pointerup", 100, 205);
        up.getCoalescedEvents = () => [
          event("pointermove", 60, 201),
          event("pointermove", 80, 203),
        ];
        field.dispatchEvent(up);
        const result = book.pages[page].at(-1);
        delete field.setPointerCapture;
        delete field.hasPointerCapture;
        return {
          result,
          ok:
            result.points.length === 4 &&
            result.rawPoints[1]?.tiltX === 25 &&
            result.rawPoints[1]?.tiltY === -15,
        };
      });
      assert(
        zoomInput.ok,
        engine +
          " magnified writing preserves release samples and tilt " +
          JSON.stringify(zoomInput.result),
      );
      await page.locator("#closeZoomWriting").click();
      const metric = await page.evaluate(async () => {
        const strokes = Array.from({ length: 1000 }, (_, i) => ({
          tool: "pen",
          brushVersion: 1,
          penType: "regular",
          color: "#222222",
          width: 2,
          opacity: 1,
          points: [
            { x: 30 + (i % 30) * 20, y: 30 + Math.floor(i / 30) * 20 },
            { x: 40 + (i % 30) * 20, y: 35 + Math.floor(i / 30) * 20 },
          ],
        }));
        book.pages = [[], strokes];
        page = 0;
        render();
        let paints = 0;
        const original = paint;
        paint = (...args) => {
          paints++;
          return original(...args);
        };
        try {
          let t = performance.now();
          const full = await Documents.compose(book, 1);
          const fullMs = performance.now() - t,
            fullPaints = paints;
          full.width = full.height = 1;
          paints = 0;
          t = performance.now();
          const small = await Documents.thumbnail(book, 1);
          const result = {
            fullMs,
            fullPaints,
            thumbnailMs: performance.now() - t,
            thumbnailPaints: paints,
            pixels: small.width * small.height,
          };
          small.width = small.height = 1;
          return result;
        } finally {
          paint = original;
        }
      });
      measurements.push({ engine, ...metric });
      assert(
        metric.thumbnailPaints === 0 &&
          metric.fullPaints >= 2 &&
          metric.pixels <= 21000,
        engine +
          " thumbnail has bounded raster and never repaints editor " +
          JSON.stringify(metric),
      );
      await page.evaluate(() => {
        book.pages = Array.from({ length: 100 }, () => []);
        page = 0;
        render();
      });
      await page.locator("#showPages").click();
      await page.waitForFunction(() => PageBrowser.loaded > 0);
      if (directory)
        await page.screenshot({
          animations: "disabled",
          path: resolve(directory, engine + "-pages-panel.png"),
        });
      assert(
        await page.evaluate(
          () =>
            PageBrowser.loaded <= 8 &&
            document.querySelectorAll("#pageThumbnails canvas").length < 10,
        ),
        engine + " page browser renders only visible bounded thumbnails",
      );
      await page.locator("#pagesDialog .page-management summary").click();
      await page.locator("#duplicatePage").click();
      assert(
        await page.evaluate(() => book.pages.length === 101 && page === 1),
        engine + " duplicates selected page",
      );
      page.once("dialog", (d) => d.accept());
      await page.locator("#deletePage").click();
      assert(
        await page.evaluate(() => book.pages.length === 100),
        engine + " deletes page with confirmation",
      );
      await page.locator("#undoPages").click();
      assert(
        await page.evaluate(() => book.pages.length === 101),
        engine + " restores deleted page with page history",
      );
      await page.locator("#panelAddPage").click();
      await page.locator("#undoPages").click();
      assert(
        await page.evaluate(() => book.pages.length === 101),
        engine + " new page insertion is undoable",
      );
      await page.locator("#pageNumber").fill("101");
      await page.locator("#jumpForm button").click();
      assert(
        await page.evaluate(
          () =>
            page === 100 && !$("pagesDialog").open && PageBrowser.loaded === 0,
        ),
        engine + " jumps to page and releases thumbnails",
      );
      await page.evaluate(() => save());
      await page.reload();
      await page.evaluate(() => Home.ready);
      assert(
        await page.evaluate(
          () =>
            book.pages.length === 101 &&
            preferences.width === 6 &&
            preferences.color === "#365ecc",
        ),
        engine + " reopens saved pages and ink preferences",
      );
      assert(!errors.length, engine + " no script errors " + errors.join(","));
    } finally {
      await browser.close();
    }
  }
  console.log("MEASUREMENTS " + JSON.stringify(measurements));
} finally {
  server.close();
  server.closeAllConnections();
}
