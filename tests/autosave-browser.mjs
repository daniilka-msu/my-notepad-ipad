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
      const page = await browser.newPage({
        viewport: { width: 1024, height: 900 },
      });
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.evaluate(async () => {
        await ready;
        await Home.ready;
        data.books = [
          { id: "ink", name: "Ink", paper: "grid", pages: [[], [], []] },
        ];
        data.selected = "ink";
        Home.open("ink");
        await save();
        window.writeLog = [];
        window.realWrite = NotepadStore.write;
        NotepadStore.write = (...args) => {
          writeLog.push({ active: !!drawing, time: performance.now() });
          return realWrite(...args);
        };
        canvas.setPointerCapture = () => {};
        canvas.hasPointerCapture = () => false;
        window.emitInk = (type, x = 100) => {
          const r = canvas.getBoundingClientRect();
          canvas.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 11,
              pointerType: "pen",
              button: 0,
              buttons: type === "pointerup" ? 0 : 1,
              pressure: 0.5,
              clientX: r.left + x,
              clientY: r.top + 100,
            }),
          );
        };
        Editor.choose("pen");
        emitInk("pointerdown");
        emitInk("pointermove", 110);
        emitInk("pointerup", 115);
      });
      await page.waitForTimeout(1000);
      await page.evaluate(() => emitInk("pointerdown"));
      await page.waitForTimeout(3300);
      check(
        await page.evaluate(() => writeLog.length === 0 && !!drawing),
        engine + " does not save while pen is down, even after idle deadline",
      );
      await page.evaluate(() => {
        emitInk("pointermove", 112);
        emitInk("pointerup", 118);
      });
      await page.waitForTimeout(1500);
      check(
        await page.evaluate(() => writeLog.length === 0 && unsaved),
        engine + " waits for three seconds after last stroke",
      );
      await page.waitForFunction(() => writeLog.length === 1 && !unsaved);
      check(
        await page.evaluate(
          () =>
            $("saveStatus").textContent === "Все изменения сохранены" &&
            !writeLog.some((w) => w.active),
        ),
        engine + " idle commit reports actual success",
      );
      await page.evaluate(() => {
        emitInk("pointerdown");
        emitInk("pointermove", 110);
        emitInk("pointerup", 116);
        $("next").click();
        $("next").click();
        $("prev").click();
      });
      await page.waitForFunction(() => !unsaved);
      check(
        await page.evaluate(async () => {
          const saved = await NotepadStore.read();
          return page === 1 && saved.books[0].pages[0].length === 3;
        }),
        engine +
          " rapid page changes preserve ink and flush without waiting for idle",
      );
      await page.evaluate(() => {
        window.releaseWrite = null;
        window.pendingSave = null;
        NotepadStore.write = (...args) => {
          const actual = realWrite(...args);
          return new Promise((resolve, reject) => {
            actual.then(() => {
              releaseWrite = resolve;
            }, reject);
          });
        };
        emitInk("pointerdown");
        emitInk("pointerup", 110);
        pendingSave = save();
      });
      await page.waitForFunction(() => !!releaseWrite);
      await page.evaluate(() => {
        emitInk("pointerdown");
        emitInk("pointermove", 112);
        emitInk("pointerup", 118);
        emitInk("pointerdown");
        releaseWrite();
      });
      await page.evaluate(async () => {
        await pendingSave;
      });
      check(
        await page.evaluate(
          () =>
            unsaved &&
            !!drawing &&
            $("saveStatus").textContent !== "Все изменения сохранены",
        ),
        engine +
          " old write completion never clears newer changes or blocks new input",
      );
      await page.evaluate(async () => {
        NotepadStore.write = realWrite;
        emitInk("pointerup", 110);
        await save();
      });
      await page.evaluate(async () => {
        NotepadStore.write = async () => {
          throw Error("QuotaExceededError");
        };
        emitInk("pointerdown");
        emitInk("pointerup", 110);
        try {
          await save();
        } catch {}
      });
      check(
        await page.evaluate(
          () =>
            unsaved &&
            storageFailed &&
            !$("saveWarning").hidden &&
            $("saveStatus").textContent === "Ошибка сохранения" &&
            book.pages[1].length === 4,
        ),
        engine + " storage failure keeps all ink in memory and shows retry",
      );
      await page.evaluate(async () => {
        NotepadStore.write = realWrite;
        await $("retrySave").onclick();
      });
      check(
        await page.evaluate(() => !unsaved && !storageFailed),
        engine + " visible retry succeeds",
      );
      const before = await page.evaluate(() =>
        JSON.stringify(data.books[0].pages),
      );
      await page.reload();
      await page.evaluate(async () => {
        await ready;
        await Home.ready;
        Home.open("ink");
        canvas.setPointerCapture = () => {};
        canvas.hasPointerCapture = () => false;
        window.emitInk = (type, x = 100) => {
          const r = canvas.getBoundingClientRect();
          canvas.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 11,
              pointerType: "pen",
              button: 0,
              buttons: type === "pointerup" ? 0 : 1,
              pressure: 0.5,
              clientX: r.left + x,
              clientY: r.top + 100,
            }),
          );
        };
      });
      check(
        await page.evaluate(
          (expected) => JSON.stringify(book.pages) === expected,
          before,
        ),
        engine + " saved strokes reopen with unchanged coordinates",
      );
      await page.evaluate(() => {
        page = 0;
        render();
        emitInk("pointerdown");
        emitInk("pointerup", 110);
        Home.show();
      });
      await page.waitForFunction(() => !unsaved);
      check(
        await page.evaluate(
          async () =>
            (await NotepadStore.read()).books[0].pages[0].length === 4,
        ),
        engine + " leaving notebook flushes dirty page",
      );
      check(
        await page.evaluate(async () => {
          Home.open("ink");
          page = 0;
          render();
          emitInk("pointerdown");
          emitInk("pointermove", 110);
          window.dispatchEvent(new Event("pagehide"));
          await save();
          return (
            !drawing &&
            (await NotepadStore.read()).books[0].pages[0].length === 5
          );
        }),
        engine +
          " pagehide finishes pending ink and attempts immediate persistence",
      );
      check(
        await page.evaluate(() => {
          for (const kind of Object.keys(Brushes.labels)) {
            preferences.penType = kind;
            Editor.choose(kind === "marker" ? "marker" : "pen");
            emitInk("pointerdown");
            emitInk("pointermove", 110);
            emitInk("pointerup", 118);
            paint();
            const incremental = canvas.toDataURL();
            cachedItems = null;
            paint();
            if (incremental !== canvas.toDataURL()) return false;
          }
          return true;
        }),
        engine +
          " incremental output for every brush matches full replay exactly",
      );
      // A slow asset conversion must not let an older write overtake a newer write.
      check(
        await page.evaluate(async () => {
          const old = structuredClone(data),
            next = structuredClone(data);
          old.books[0].name = "Old";
          next.books[0].name = "New";
          const blob = new Blob(["asset"]);
          const original = blob.arrayBuffer.bind(blob);
          blob.arrayBuffer = async () => {
            await new Promise((r) => setTimeout(r, 100));
            return original();
          };
          await Promise.all([
            NotepadStore.write(old, [["test-asset", blob]]),
            NotepadStore.write(next),
          ]);
          return (await NotepadStore.read()).books[0].name === "New";
        }),
        engine + " slow asset preparation cannot reorder library transactions",
      );
      check(
        await page.evaluate(async () => {
          const old = structuredClone(data);
          const blob = new Blob(["queue"]);
          const original = blob.arrayBuffer.bind(blob);
          blob.arrayBuffer = async () => {
            await new Promise((r) => setTimeout(r, 100));
            return original();
          };
          const first = NotepadStore.write(old, [["queued-asset", blob]]);
          const queued = NotepadStore.write(() => data);
          data = structuredClone(data);
          data.books[0].name = "Latest in-memory library";
          await Promise.all([first, queued]);
          return (
            (await NotepadStore.read()).books[0].name === data.books[0].name
          );
        }),
        engine +
          " queued autosave reads current library after metadata replacement",
      );
      check(
        await page.evaluate(async () => {
          const before = JSON.stringify(await NotepadStore.read());
          const cancelled = await NotepadStore.write(
            { books: [] },
            [],
            () => false,
          );
          return (
            cancelled === false &&
            JSON.stringify(await NotepadStore.read()) === before
          );
        }),
        engine + " cancelled transaction leaves persisted library intact",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
