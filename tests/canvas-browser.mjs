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
      await page.locator("#goHome").click();
      await page.locator("#homeNewBook").click();
      await check(
        () =>
          document.querySelector("[name=documentFormat]:checked").value ===
          "continuous",
        "defaults creation to continuous A4",
      );
      await page.locator("#notebookName").fill("Длинный конспект");
      await page.locator("#createNotebook").click();
      await page.waitForFunction(
        () =>
          CanvasEditor.session?.book.id === book.id && !CanvasEditor.loading,
      );
      await check(
        () =>
          book.canvasDocument.format === "continuous" && book.pageSize === "a4",
        "creates continuous A4 through visible wizard",
      );
      const draw = async (x = 100, y = 200) =>
        page.evaluate(
          ({ x, y }) => {
            canvas.setPointerCapture = () => {};
            canvas.hasPointerCapture = () => false;
            Editor.choose("pen");
            const r = canvas.getBoundingClientRect();
            for (let i = 0; i < 3; i++)
              canvas.dispatchEvent(
                new PointerEvent(
                  i === 0
                    ? "pointerdown"
                    : i === 2
                      ? "pointerup"
                      : "pointermove",
                  {
                    bubbles: true,
                    cancelable: true,
                    pointerId: 700,
                    pointerType: "pen",
                    button: 0,
                    buttons: i === 2 ? 0 : 1,
                    pressure: 0.5,
                    clientX: r.left + ((x + i * 20) / 794) * r.width,
                    clientY: r.top + (y / 1123) * r.height,
                  },
                ),
              );
            delete canvas.setPointerCapture;
            delete canvas.hasPointerCapture;
          },
          { x, y },
        );
      await draw();
      await check(
        () => CanvasEditor.session.model.dirty && book.pages[0].length === 1,
        "writes an editable vector stroke in initial region",
      );
      await page.evaluate(async () => {
        await save();
        await CanvasEditor.move({ y: 25000 });
      });
      await draw();
      await page.evaluate(async () => {
        await save();
      });
      await check(async () => {
        const persisted = await NotepadStore.read();
        return (
          persisted.books.find((b) => b.id === book.id).pages[0].length === 0
        );
      }, "keeps canonical strokes outside legacy whole-library record");
      await page.evaluate(async () => {
        await CanvasEditor.move({ y: 0 });
      });
      await check(
        () =>
          book.pages[0].length === 1 &&
          Math.abs(book.pages[0][0].points[0].y - 200) < 1,
        "restores original coordinates after long navigation",
      );
      for (let i = 0; i < 40; i++)
        await page.evaluate(async (i) => {
          await CanvasEditor.move({ y: i * 1500 });
        }, i);
      await check(
        () =>
          CanvasEditor.session.model.stats.regionCache <= 32 &&
          CanvasEditor.session.model.stats.objectCache <= 512,
        "bounds caches during forty-region navigation",
      );
      await page.evaluate(async () => {
        await CanvasEditor.move({ y: 25000 });
        await save();
      });
      const bookId = await page.evaluate(() => book.id);
      await page.reload();
      await page.evaluate(async () => {
        await Home.ready;
      });
      await page.waitForFunction(
        () =>
          CanvasEditor.session?.book.id === book.id && !CanvasEditor.loading,
      );
      await check(
        () =>
          CanvasEditor.session.camera.y === 25000 && book.pages[0].length === 1,
        "reopens saved camera and lazy vector content",
      );
      await page.locator("#undo").click();
      await page.waitForFunction(() => book.pages[0].length === 0);
      await page.locator("#redo").click();
      await page.waitForFunction(() => book.pages[0].length === 1);
      await check(
        () => CanvasEditor.session.model.metadata.cursor === 2,
        "undo and redo work after reopening",
      );
      const backup = await page.evaluate(async () => {
        await save();
        return JSON.stringify(await Backups.create(data, preferences));
      });
      await check(async () => {
        const parsed = await Backups.parse(
          JSON.stringify(await Backups.create(data, preferences)),
        );
        return parsed.canvasRecords.length === 1;
      }, "backs up canonical objects, index and history");
      await page.evaluate(async () => {
        Home.show();
      });
      await page.locator("#homeNewBook").click();
      await page.locator("#notebookName").fill("Бескрайнее поле");
      await page.locator("[name=documentFormat][value=infinite]").check();
      await page.locator("#createNotebook").click();
      await page.waitForFunction(
        () =>
          book.canvasDocument?.format === "infinite" &&
          CanvasEditor.session?.book.id === book.id &&
          !CanvasEditor.loading,
      );
      await page.evaluate(async () => {
        await CanvasEditor.move({ x: -5000, y: -8000 });
      });
      await draw();
      await page.evaluate(async () => {
        await save();
      });
      await check(async () => {
        const v = (
          await CanvasEditor.session.model.query({
            x: -5000,
            y: -8000,
            width: 794,
            height: 1123,
          })
        )[0];
        return v.value.points[0].x < 0 && v.value.points[0].y < 0;
      }, "stores editable strokes in negative document coordinates");
      await check(async () => {
        const output = await Documents.compose(book, 0);
        return (
          output.width > 0 &&
          output.height > 0 &&
          output.width * output.height <= CanvasExport.maxPixels + 5000
        );
      }, "exports current visible canvas region within pixel budget");
      await page.evaluate(async (backup) => {
        const parsed = await Backups.parse(backup);
        data = await Backups.merge(data, parsed);
        const restored = data.books.find(
          (b) => b.canvasDocument && b.name === "Длинный конспект (копия)",
        );
        Home.open(restored.id, { history: false });
      }, backup);
      await page.waitForFunction(
        () =>
          CanvasEditor.session?.book.id === book.id && !CanvasEditor.loading,
      );
      await check(
        () =>
          book.name.includes("(копия)") &&
          CanvasEditor.session.camera.y === 25000 &&
          book.pages[0].length === 1,
        "restores canvas copy without overwriting originals",
      );
      await page.evaluate(() => {
        const model = CanvasEditor.session.model;
        window.originalQuery = model.query;
        window.queryWaiting = false;
        const gate = new Promise((r) => (window.releaseQuery = r));
        model.query = async (...args) => {
          window.queryWaiting = true;
          await gate;
          return window.originalQuery(...args);
        };
        window.pendingMove = CanvasEditor.move({ y: 30000 });
      });
      await page.waitForFunction(() => window.queryWaiting);
      await draw(200, 300);
      await page.evaluate(async () => {
        window.releaseQuery();
        await window.pendingMove;
        CanvasEditor.session.model.query = window.originalQuery;
        await save();
      });
      await check(
        () =>
          CanvasEditor.session.camera.y === 25000 && book.pages[0].length === 2,
        "retains stroke completed while a neighboring region was loading",
      );
      await check(async () => {
        const batch = NotepadStore.batchRecords;
        NotepadStore.batchRecords = async () => {
          throw new DOMException("Test quota failure", "QuotaExceededError");
        };
        try {
          CanvasEditor.session.model.camera({
            ...CanvasEditor.session.camera,
            y: 25000,
          });
          CanvasEditor.session.autosave.dirty();
          try {
            await save();
          } catch {}
          return (
            CanvasEditor.session.model.dirty &&
            $("saveStatus").dataset.state === "error"
          );
        } finally {
          NotepadStore.batchRecords = batch;
        }
      }, "failed atomic save retains in-memory edits and displays error");
      await page.evaluate(async () => {
        await save();
      });
      const printed = await page.evaluate(async () => {
        const frame = document.createElement("iframe");
        frame.hidden = true;
        document.body.append(frame);
        const win = frame.contentWindow,
          old = window.open;
        let printed = false;
        win.focus = () => {};
        win.print = () => {
          printed = true;
        };
        window.open = () => win;
        try {
          await $("exportPdf").onclick();
          return {
            printed,
            count: win.document.images.length,
            html: "<!doctype html>" + win.document.documentElement.outerHTML,
          };
        } finally {
          window.open = old;
          frame.remove();
        }
      });
      assert(
        printed.printed && printed.count >= 23,
        engine +
          " paginates long continuous A4 without dropping distant content",
      );
      if (engine === "chromium") {
        const printPage = await context.newPage();
        await printPage.setContent(printed.html);
        await printPage.evaluate(() =>
          Promise.all([...document.images].map((img) => img.decode())),
        );
        const pdf = await printPage.pdf({
          preferCSSPageSize: true,
          printBackground: true,
        });
        assert(
          pdf.subarray(0, 5).toString() === "%PDF-" &&
            (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || [])
              .length === printed.count,
          engine + " produces real multipage PDF",
        );
        await printPage.close();
      }
      if (directory)
        await page.screenshot({
          path: resolve(directory, engine + "-continuous-canvas.png"),
          animations: "disabled",
        });
      await page.evaluate(async () => {
        await CanvasEditor.move({ y: 26000 });
        PageView.fit();
      });
      await page.locator("#extraTools summary").click();
      await page.locator("#textTool").click();
      const textRect = await page.locator("#canvas").boundingBox();
      await page.mouse.click(
        textRect.x + textRect.width * 0.2,
        textRect.y + textRect.height * 0.15,
      );
      await page
        .locator("#textContent")
        .fill("Редактируемый текст далеко от начала");
      await page.locator("#saveText").click();
      await page.locator("#extraTools summary").click();
      await page.locator("#insertFormula").click();
      await page.locator("#studyTex").fill("x^{2}+y^{2}");
      await page.waitForFunction(() => !$("applyStudy").disabled);
      await page.locator("#applyStudy").click();
      await page.locator("#extraTools summary").click();
      await page.locator("#insertChart").click();
      await page.locator("#chartNext").click();
      await page.locator("#chartNext").click();
      await page.locator("#chartNext").click();
      await page.locator("#applyChart").click();
      await page.evaluate(async () => {
        await save();
      });
      const mixed = await page.evaluate(async () =>
        (await Documents.compose(book, 0)).toDataURL(),
      );
      await page.evaluate(async () => {
        await CanvasEditor.move({ y: 0 });
        await CanvasEditor.move({ y: 26000 });
      });
      await check(
        () =>
          ["text-block", "math-object", "chart-object"].every((type) =>
            book.pages[0].some((v) => v.type === type),
          ),
        "keeps text, formulas and charts editable after unloading",
      );
      assert(
        (await page.evaluate(async () =>
          (await Documents.compose(book, 0)).toDataURL(),
        )) === mixed,
        engine +
          " preserves mixed-object rendering and export after region reload",
      );
      await check(async () => {
        await Backups.parse(
          JSON.stringify(await Backups.create(data, preferences)),
        );
        return true;
      }, "validates backup containing distant mixed objects");
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
