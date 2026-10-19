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
const { webkit } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
function check(value, label) {
  if (!value) throw Error(label);
  console.log("PASS " + label);
}
try {
  for (const engine of ["chromium", "webkit"]) {
    const browser = await (engine === "chromium"
      ? chromium.launch({ channel: "msedge" })
      : webkit.launch());
    try {
      for (const dpr of [1, 2, 3]) {
        const context = await browser.newContext({
          viewport: { width: 1024, height: 900 },
          deviceScaleFactor: dpr,
          hasTouch: true,
        });
        const tab = await context.newPage(),
          errors = [];
        tab.on("pageerror", (e) => errors.push(e.message));
        await tab.goto("http://127.0.0.1:" + server.address().port);
        await tab.evaluate(async () => {
          await ready;
          await Home.ready;
          data.books = [
            {
              id: "ink40",
              name: "Мелкий конспект — x² + ∫",
              paper: "grid",
              gridMm: 5,
              pages: [[]],
            },
          ];
          data.selected = "ink40";
          Home.open("ink40");
          window.emitPen = (
            target,
            type,
            x,
            y,
            pointerType = "pen",
            samples = [],
          ) => {
            const r = target.getBoundingClientRect();
            const event = new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerType,
              pointerId: 7,
              button: 0,
              buttons: type === "pointerup" ? 0 : 1,
              pressure: pointerType === "pen" ? 0.5 : 0,
              clientX: r.left + x,
              clientY: r.top + y,
            });
            window.inkClock = (window.inkClock || performance.now()) + 10;
            Object.defineProperty(event, "timeStamp", {
              value: window.inkClock,
            });
            if (samples.length)
              Object.defineProperty(event, "getCoalescedEvents", {
                value: () =>
                  samples.map(([sx, sy], i) => {
                    const sample = new PointerEvent("pointermove", {
                      pointerId: 7,
                      pointerType,
                      clientX: r.left + sx,
                      clientY: r.top + sy,
                      pressure: 0.5,
                    });
                    Object.defineProperty(sample, "timeStamp", {
                      value: event.timeStamp - samples.length + i,
                    });
                    return sample;
                  }),
              });
            target.dispatchEvent(event);
          };
          canvas.setPointerCapture = () => {};
          canvas.hasPointerCapture = () => false;
          $("writingCanvas").setPointerCapture = () => {};
          $("writingCanvas").hasPointerCapture = () => false;
        });
        for (const zoom of [0.5, 1, 2, 3]) {
          check(
            await tab.evaluate((z) => {
              PageView.setZoom(z);
              InkQuality.refresh();
              const r = canvas.getBoundingClientRect(),
                detail = $("inkDetail");
              const density = Number(detail.dataset.density),
                scale = Number(detail.dataset.documentScale);
              return (
                !detail.hidden &&
                detail.width * detail.height <= 4010000 &&
                Math.abs(scale - (r.width / W) * density) < 0.03
              );
            }, zoom),
            `${engine} DPR ${dpr} zoom ${zoom} rasterizes visible vectors at physical resolution within memory cap`,
          );
        }
        await tab.evaluate(() => {
          PageView.fit();
          Editor.choose("pen");
        });
        await tab.locator("#openZoomWriting").click();
        await tab.waitForFunction(
          () => !$("zoomWriting").hidden && ZoomWriting.view.width > 0,
        );
        await tab.evaluate(() => {
          emitPen(canvas, "pointerdown", 100, 120);
        });
        check(
          await tab.evaluate(
            () =>
              book.pages[0].length === 0 &&
              !drawing &&
              $("pickWritingArea").getAttribute("aria-pressed") === "false",
          ),
          `${engine} DPR ${dpr} region selection never adds accidental ink`,
        );
        await tab.evaluate(() => {
          const field = $("writingCanvas");
          emitPen(field, "pointerdown", 30, 50);
          emitPen(field, "pointermove", 42, 52, "pen", [
            [34, 51],
            [38, 50],
          ]);
          emitPen(field, "pointerup", 45, 53);
        });
        check(
          await tab.evaluate(() => {
            const s = book.pages[0][0];
            return (
              s?.points.length === 5 &&
              s.rawPoints.length === 5 &&
              s.tightSampling &&
              s.points.every(
                (p) =>
                  p.x >= ZoomWriting.view.x &&
                  p.x <= ZoomWriting.view.x + ZoomWriting.view.width,
              ) &&
              s.rawPoints.at(-1).x - s.rawPoints[0].x < 8
            );
          }),
          `${engine} DPR ${dpr} coalesced compact handwriting retains original document points without extra joins`,
        );
        await tab.locator("#undo").click();
        check(
          await tab.evaluate(() => book.pages[0].length === 0),
          `${engine} DPR ${dpr} compact ink Undo`,
        );
        await tab.locator("#redo").click();
        check(
          await tab.evaluate(() => book.pages[0].length === 1),
          `${engine} DPR ${dpr} compact ink Redo`,
        );
        const before = await tab.evaluate(() => ZoomWriting.view);
        await tab.locator("#writingRight").click();
        check(
          await tab.evaluate(
            (v) => ZoomWriting.view.x > v.x || ZoomWriting.view.y > v.y,
            before,
          ),
          `${engine} DPR ${dpr} explicit advance moves region after completed stroke`,
        );
        const y = await tab.evaluate(() => ZoomWriting.view.y);
        await tab.locator("#writingLine").click();
        check(
          await tab.evaluate((y) => ZoomWriting.view.y > y, y),
          `${engine} DPR ${dpr} next line advances vertically`,
        );
        await tab.selectOption("#writingMagnification", "6");
        await tab.waitForFunction(
          () => ZoomWriting.view.width < $("writingCanvas").clientWidth / 5,
        );
        check(
          await tab.evaluate(
            () =>
              Math.abs(
                ZoomWriting.view.width -
                  $("writingCanvas").getBoundingClientRect().width / 6,
              ) < 1,
          ),
          `${engine} DPR ${dpr} adjustable 6x compact field`,
        );
        await tab.locator("#writingErase").click();
        await tab.evaluate(() => {
          emitPen($("writingCanvas"), "pointerdown", 30, 30, "touch");
          emitPen($("writingCanvas"), "pointermove", 45, 30, "touch");
          emitPen($("writingCanvas"), "pointerup", 48, 30, "touch");
        });
        check(
          await tab.evaluate(() => book.pages[0].at(-1)?.tool === "eraser"),
          `${engine} DPR ${dpr} eraser and finger use same document history`,
        );
        await tab.evaluate(() => {
          Editor.choose("pen");
          delete $("writingCanvas").setPointerCapture;
          delete $("writingCanvas").hasPointerCapture;
          $("writingAuto").checked = false;
          window.inkCount = book.pages[0].length;
        });
        const fieldBox = await tab.locator("#writingCanvas").boundingBox();
        await tab.mouse.move(fieldBox.x + 30, fieldBox.y + 35);
        await tab.mouse.down();
        await tab.mouse.move(fieldBox.x + 70, fieldBox.y + 38, { steps: 10 });
        await tab.mouse.up();
        check(
          await tab.evaluate(
            () =>
              book.pages[0].length === inkCount + 1 &&
              !drawing &&
              book.pages[0].at(-1).points.length >= 10,
          ),
          `${engine} DPR ${dpr} real mouse events and pointer capture write through actual field`,
        );
        check(
          await tab.evaluate(() => {
            const field = $("writingCanvas");
            field.setPointerCapture = () => {};
            field.hasPointerCapture = () => false;
            $("writingAuto").checked = true;
            const before = ZoomWriting.view,
              count = book.pages[0].length;
            const width = field.getBoundingClientRect().width;
            emitPen(field, "pointerdown", 10, 45);
            for (let i = 1; i <= 30; i++)
              emitPen(
                field,
                "pointermove",
                10 + ((width * 0.94 - 10) * i) / 30,
                45,
              );
            if (
              ZoomWriting.view.x !== before.x ||
              ZoomWriting.view.y !== before.y
            )
              return false;
            emitPen(field, "pointerup", width * 0.94, 45);
            return (
              book.pages[0].length === count + 1 &&
              book.pages[0].at(-1).points.length === 31 &&
              (ZoomWriting.view.x !== before.x ||
                ZoomWriting.view.y !== before.y)
            );
          }),
          `${engine} DPR ${dpr} automatic advance waits for pen lift without splitting stroke`,
        );
        await tab.evaluate(async () => {
          book.pageSize = "square";
          render();
          ZoomWriting.schedule();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        });
        check(
          await tab.evaluate(
            () =>
              Math.abs(
                ZoomWriting.view.height -
                  $("writingCanvas").getBoundingClientRect().height /
                    ((Number($("writingMagnification").value) *
                      Paper.geometry(book).outputHeight) /
                      H),
              ) < 1,
          ),
          `${engine} DPR ${dpr} compact ink preserves physical proportions on square paper`,
        );
        await tab.evaluate(async () => {
          await save();
          window.expectedInk = JSON.stringify(book.pages);
          window.expectedExport = (
            await Documents.compose(book, 0)
          ).toDataURL();
        });
        const expected = await tab.evaluate(() => ({
          ink: expectedInk,
          image: expectedExport,
        }));
        await tab.reload();
        await tab.evaluate(async () => {
          await ready;
          await Home.ready;
          Home.open("ink40");
        });
        check(
          await tab.evaluate(
            async (e) =>
              JSON.stringify(book.pages) === e.ink &&
              (await Documents.compose(book, 0)).toDataURL() === e.image,
            expected,
          ),
          `${engine} DPR ${dpr} original points, eraser and export reopen identically`,
        );
        check(
          errors.length === 0,
          `${engine} DPR ${dpr} has no script errors: ${errors.join(";")}`,
        );
        if (process.env.SCREENSHOT_DIR && dpr === 2) {
          await tab.locator("#openZoomWriting").click();
          await tab.screenshot({
            path: process.env.SCREENSHOT_DIR + "/" + engine + "-ink40.png",
          });
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
