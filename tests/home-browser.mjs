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
const legacy = {
  selected: "legacy-home",
  books: [
    {
      id: "legacy-home",
      name: "Старый конспект",
      paper: "grid",
      pages: [
        [
          {
            tool: "pen",
            color: "#222222",
            width: 3,
            points: [
              { x: 20, y: 20 },
              { x: 30, y: 30 },
            ],
          },
        ],
      ],
    },
  ],
};
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
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.evaluate(() => Home.ready);
      assert(
        await page.evaluate(
          () =>
            Home.active &&
            data.books.length === 0 &&
            document.getElementById("homeEmpty").hidden === false,
        ),
        engine + " starts with real empty home, without fictitious notebooks",
      );
      await page.locator("#newFolder").click();
      await page.locator("#folderName").fill("Учёба");
      await page.locator("#saveFolder").click();
      await page.waitForFunction(
        () => !document.getElementById("folderDialog").open,
      );
      const folder = await page.evaluate(() => data.folders[0].id);
      await page.locator("#homeNewBook").click();
      await page.locator("#notebookName").fill("Математика");
      await page.locator("#notebookTemplate").selectOption("math");
      await page.locator("#notebookPattern").selectOption("band");
      await page.locator("#notebookColor").fill("#248575");
      await page.locator("#notebookFolder").selectOption(folder);
      await page.locator("#createNotebook").click();
      await page.waitForFunction(() => !Home.active);
      const id = await page.evaluate(() => book.id);
      assert(
        await page.evaluate(
          () =>
            book.name === "Математика" &&
            book.paper === "grid" &&
            book.gridMm === 5 &&
            book.folderId &&
            book.cover.pattern === "band" &&
            book.cover.color === "#248575",
        ),
        engine + " creates configured notebook from wizard",
      );
      await page.locator("#fitPage").click();
      const r = await page.locator("#canvas").boundingBox();
      await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width * 0.4, r.y + r.height * 0.25, {
        steps: 3,
      });
      await page.mouse.up();
      assert(
        await page.evaluate(() => book.pages[0].length > 0),
        engine + " opens a working editor",
      );
      const notes = await page.evaluate(() => JSON.stringify(book.pages));
      await page.evaluate(() => save());
      await page.locator("#goHome").click();
      assert(
        (await page.locator("#homeRecent .home-card").count()) === 1,
        engine + " records recently opened notebook",
      );
      await page.goBack();
      await page.waitForFunction(() => !Home.active);
      assert(
        (await page.evaluate(() => book.id)) === id,
        engine + " browser Back returns to editor",
      );
      await page.goForward();
      await page.waitForFunction(() => Home.active);
      assert(
        (await page.evaluate(() => data.selected)) === id,
        engine + " preserves last notebook on home",
      );
      const card = () => page.locator('#homeBooks [data-book-id="' + id + '"]');
      await card().locator(".home-favorite").click();
      await page.locator("[data-view=favorites]").click();
      assert(
        (await page.locator("#homeBooks .home-card").count()) === 1,
        engine + " filters favorites",
      );
      await page.locator("[data-view=all]").click();
      await card().locator(".home-book-more").click();
      await page.locator("#renameNotebook").fill("Алгебра");
      await page.locator("#saveNotebookProperties").click();
      await page.waitForFunction(
        () => !document.getElementById("notebookActions").open,
      );
      assert(
        (await card().locator(".home-book-caption strong").textContent()) ===
          "Алгебра",
        engine + " renames notebook without changing notes",
      );
      await card().locator(".home-book-more").click();
      await page.locator("#duplicateNotebook").click();
      await page.waitForFunction(
        () => !document.getElementById("notebookActions").open,
      );
      assert(
        await page.evaluate(
          () =>
            data.books.length === 2 &&
            JSON.stringify(data.books[0].pages) ===
              JSON.stringify(data.books[1].pages) &&
            data.books[0].id !== data.books[1].id,
        ),
        engine + " duplicates all editable page contents",
      );
      await page.locator("#homeSearch").fill("копия");
      assert(
        (await page.locator("#homeBooks .home-card").count()) === 1,
        engine + " searches actual names",
      );
      await page.locator("#homeSearch").fill("");
      await page.locator("#homeSort").selectOption("name");
      assert(
        (await page
          .locator("#homeBooks .home-book-caption strong")
          .first()
          .textContent()) === "Алгебра",
        engine + " sorts by name",
      );
      await card().locator(".home-book-more").click();
      await page.locator("#trashNotebook").click();
      await page.waitForFunction(
        () => !document.getElementById("notebookActions").open,
      );
      await page.locator("[data-view=trash]").click();
      assert(
        (await page.locator("#homeBooks .home-card").count()) === 1 &&
          (await page.evaluate(
            (id) => JSON.stringify(data.books.find((b) => b.id === id).pages),
            id,
          )) === notes,
        engine + " moves notebook to trash without removing notes",
      );
      assert(
        await page.evaluate(async () => {
          const copy = await Backups.parse(
            JSON.stringify(await Backups.create(data)),
          );
          return (
            copy.library.books.some((b) => b.deletedAt) &&
            copy.library.folders.length === 1
          );
        }),
        engine + " backup includes trash and folders",
      );
      await page.locator(".restore-notebook").click();
      await page.waitForFunction(
        () => document.querySelectorAll("#homeBooks .home-card").length === 0,
      );
      await page.locator("[data-view=all]").click();
      assert(
        (await page.locator("#homeBooks .home-card").count()) === 2,
        engine + " restores deleted notebook",
      );
      await page.locator('[data-folder-id="' + folder + '"]').click();
      assert(
        (await page.locator("#homeBooks .home-card").count()) === 2,
        engine + " folder contains original and copy",
      );
      await page.locator("#homeFolders .icon-only").click();
      await page.locator("#folderName").fill("Курс");
      await page.locator("#saveFolder").click();
      await page.waitForFunction(
        () => !document.getElementById("folderDialog").open,
      );
      assert(
        (await page.locator("#homeTitle").textContent()) === "Курс",
        engine + " renames folder",
      );
      await page.locator("#homeFolders .icon-only").click();
      await page.locator("#removeFolder").click();
      await page.waitForFunction(
        () => !document.getElementById("folderDialog").open,
      );
      assert(
        await page.evaluate(
          () =>
            data.folders.length === 0 &&
            data.books.every((b) => b.folderId === null),
        ),
        engine + " deleting folder preserves all notebooks",
      );
      await page.locator("#importFile").click();
      await page.locator("#fileInput").setInputFiles({
        name: "схема.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          await page.evaluate(() => {
            const c = document.createElement("canvas");
            c.width = c.height = 50;
            c.getContext("2d").fillRect(0, 0, 50, 50);
            return c.toDataURL().split(",")[1];
          }),
          "base64",
        ),
      });
      await page.waitForFunction(() => data.books.length === 3);
      assert(
        await page.evaluate(() => Home.active),
        engine + " imports actual file from home",
      );
      for (const width of [320, 512, 768, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(
          () =>
            new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            ),
        );
        assert(
          await page
            .locator("#home")
            .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          engine + " home fits " + width,
        );
        if (directory)
          await page.screenshot({
            path: resolve(directory, engine + "-home-" + width + ".png"),
          });
      }
      await page.evaluate(() => {
        preferences.theme = "dark";
        applyPreferences();
      });
      assert(
        (await page.locator("html").getAttribute("data-theme")) === "dark",
        engine + " supports dark home",
      );
      if (directory)
        await page.screenshot({
          path: resolve(directory, engine + "-home-dark.png"),
        });
      await page.evaluate(() => {
        preferences.theme = "light";
        applyPreferences();
      });
      await page.evaluate(() => save());
      const saved = await page.evaluate(() => JSON.stringify(data));
      assert(
        await page.evaluate(() => {
          const before = JSON.stringify(data);
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "z",
              ctrlKey: true,
              bubbles: true,
            }),
          );
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
          );
          return JSON.stringify(data) === before;
        }),
        engine + " home shortcuts cannot alter hidden notes",
      );
      assert(
        await page.evaluate(async () => {
          const before = await NotepadStore.read(),
            snapshot = await NotepadStore.read("before-home-v1"),
            original = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function (...args) {
            const tx = original.apply(this, args);
            queueMicrotask(() => tx.abort());
            return tx;
          };
          let failed = false;
          try {
            await NotepadStore.upgradeLibrary({ books: [] }, { books: [] });
          } catch {
            failed = true;
          } finally {
            IDBDatabase.prototype.transaction = original;
          }
          return (
            failed &&
            JSON.stringify(await NotepadStore.read()) ===
              JSON.stringify(before) &&
            JSON.stringify(await NotepadStore.read("before-home-v1")) ===
              JSON.stringify(snapshot)
          );
        }),
        engine +
          " failed migration transaction preserves original and snapshot",
      );
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      if (engine === "chromium") await context.setOffline(true);
      await page.reload();
      await page.evaluate(() => Home.ready);
      assert(
        (await page.evaluate(() => JSON.stringify(data))) === saved,
        engine + " reload preserves library metadata and pages",
      );
      await context.setOffline(false);
      const oldContext = await browser.newContext();
      await oldContext.addInitScript((seed) => {
        if (!localStorage.getItem("seeded")) {
          localStorage.setItem("ipad-notebooks-v1", JSON.stringify(seed));
          localStorage.setItem("seeded", "1");
        }
      }, legacy);
      const oldPage = await oldContext.newPage();
      await oldPage.goto(url);
      await oldPage.evaluate(() => Home.ready);
      assert(
        await oldPage.evaluate(
          () =>
            Home.active && data.books.length === 1 && data.libraryVersion === 1,
        ),
        engine + " migrates legacy library into home",
      );
      assert(
        await oldPage.evaluate(
          async (source) =>
            JSON.stringify(
              (await NotepadStore.read("before-home-v1")).books[0].pages,
            ) === JSON.stringify(source.books[0].pages) &&
            JSON.stringify(data.books[0].pages) ===
              JSON.stringify(source.books[0].pages) &&
            localStorage.getItem("ipad-notebooks-v1") ===
              JSON.stringify(source) &&
            !("gridMm" in data.books[0]),
          legacy,
        ),
        engine +
          " preserves legacy pages, grid, migration snapshot and localStorage",
      );
      await oldPage.locator("#homeBooks .home-book-open").click();
      assert(
        await oldPage.evaluate(
          () =>
            book.id === "legacy-home" && book.pages[0][0].points.length === 2,
        ),
        engine + " opens old handwriting unchanged",
      );
      const exported = await oldPage.evaluate(async () =>
        (await Documents.compose(book, 0)).toDataURL(),
      );
      await oldPage.reload();
      await oldPage.evaluate(() => Home.ready);
      assert(
        (await oldPage.evaluate(async () =>
          (await Documents.compose(book, 0)).toDataURL(),
        )) === exported,
        engine + " old export survives reopening",
      );
      if (engine === "chromium") await context.setOffline(true);
      if (engine === "webkit")
        await new Promise((r) => {
          server.close(r);
          server.closeAllConnections();
        });
      await page.reload();
      await page.evaluate(() => Home.ready);
      assert(
        await page.evaluate(() => Home.active && data.books.length === 3),
        engine + " home opens with server unavailable",
      );
      await page.locator("#homeBooks .home-book-open").first().click();
      assert(
        await page.evaluate(() => !Home.active && storageReady),
        engine + " opens stored notebook offline",
      );
      assert(
        errors.length === 0,
        engine + " has no script errors: " + errors.join(","),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  server.closeAllConnections();
}
