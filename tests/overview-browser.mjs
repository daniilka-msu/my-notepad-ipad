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
      await page.locator("#notebookName").fill("Обзор и закладки");
      await page.locator("[name=documentFormat][value=infinite]").check();
      await page.locator("#createNotebook").click();
      await page.waitForFunction(
        () =>
          CanvasEditor.session?.book.id === book.id && !CanvasEditor.loading,
      );
      async function stroke() {
        const rect = await page.locator("#canvas").boundingBox();
        await page.mouse.move(rect.x + 100, rect.y + 80);
        await page.mouse.down();
        await page.mouse.move(rect.x + 200, rect.y + 100, { steps: 8 });
        await page.mouse.up();
      }
      await page.evaluate(() => PageView.setZoom(0.7));
      await stroke();
      await page.evaluate(async () => {
        await save();
        await CanvasEditor.move({ x: -3000, y: 12000 });
        PageView.setZoom(1.2);
      });
      await stroke();
      await page.evaluate(async () => {
        await save();
      });
      await page.locator("#canvasOverviewToggle").click();
      await page.waitForFunction(
        () => CanvasOverview.frame?.visible.y >= 12000,
      );
      await check(
        () =>
          CanvasOverview.visible &&
          $("canvasOverviewToggle").getAttribute("aria-expanded") === "true" &&
          $("canvasMinimap").width === 400 &&
          $("canvasMinimap").height === 360,
        "opens bounded minimap with current document viewport",
      );
      await check(() => {
        const model = CanvasEditor.session.model,
          stats = JSON.stringify(model.stats);
        let calls = 0;
        const query = model.query;
        model.query = () => {
          calls++;
          throw Error("Unexpected vector load");
        };
        try {
          CanvasOverview.draw();
          return calls === 0 && JSON.stringify(model.stats) === stats;
        } finally {
          model.query = query;
        }
      }, "drawing minimap never queries or fills vector caches");
      await page.locator("#canvasBookmarkName").fill("Производные");
      await page.locator("#canvasBookmarkAdd").click();
      await check(
        () =>
          CanvasEditor.session.model.overview.bookmarks[0].camera.x === -3000 &&
          CanvasEditor.session.model.overview.bookmarks[0].camera.zoom === 1.2,
        "bookmark stores negative coordinates and actual zoom",
      );
      await page.evaluate(async () => {
        await save();
        await CanvasEditor.move({ x: 0, y: 0 });
        PageView.setZoom(0.7);
      });
      await page
        .getByRole("button", { name: "Производные", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          CanvasEditor.session.camera.x === -3000 &&
          PageView.zoom === 1.2 &&
          !CanvasEditor.loading,
      );
      await check(
        () => CanvasEditor.session.camera.y === 12000,
        "bookmark restores distant camera and zoom through real UI",
      );
      await page.locator("#canvasMinimap").focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction(
        () => CanvasEditor.session.camera.y === 12600 && !CanvasEditor.loading,
      );
      await check(
        () => CanvasEditor.session.camera.y === 12600,
        "keyboard navigation moves camera without creating ink",
      );
      await page.evaluate(() => CanvasOverview.draw());
      const point = await page.evaluate(() => {
        const f = CanvasOverview.frame,
          r = $("canvasMinimap").getBoundingClientRect();
        return {
          x: r.x + ((f.offsetX + (100 - f.left) * f.scale) / 400) * r.width,
          y: r.y + ((f.offsetY + (100 - f.top) * f.scale) / 360) * r.height,
        };
      });
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(
        () => CanvasEditor.session.camera.y < 1000 && !CanvasEditor.loading,
      );
      await check(
        () => CanvasEditor.session.camera.y < 1000,
        "touch-sized overview surface navigates by actual pointer click",
      );
      if (directory) {
        await page.screenshot({
          path: resolve(directory, engine + "-overview.png"),
          animations: "disabled",
        });
        await page.setViewportSize({ width: 512, height: 768 });
        await check(() => {
          const r = $("canvasOverview").getBoundingClientRect();
          return (
            r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
          );
        }, "overview remains reachable in Split View");
        await page.screenshot({
          path: resolve(directory, engine + "-overview-split.png"),
          animations: "disabled",
        });
      }
      await page.locator("#canvasOverviewClose").click();
      await check(
        () =>
          !CanvasOverview.visible &&
          $("canvasOverviewToggle").getAttribute("aria-expanded") === "false",
        "close hides overview and updates accessibility state",
      );
      await page.evaluate(async () => {
        await save();
      });
      await page.reload();
      await page.evaluate(async () => {
        await Home.ready;
        Home.open(data.selected, { history: false });
      });
      await page.waitForFunction(
        () =>
          CanvasEditor.session?.book.id === book.id && !CanvasEditor.loading,
      );
      await page.locator("#canvasOverviewToggle").click();
      await page.waitForFunction(() =>
        $("canvasBookmarks").textContent.includes("Производные"),
      );
      await check(
        () =>
          CanvasEditor.session.model.overview.bookmarks[0].name ===
          "Производные",
        "reopens named bookmark from IndexedDB",
      );
      await check(async () => {
        const copy = await Backups.create(data, preferences),
          parsed = await Backups.parse(JSON.stringify(copy));
        return parsed.canvasRecords.some(([, rows]) =>
          rows.some(
            ([key, value]) =>
              key === "meta" &&
              value.bookmarks.some((b) => b.name === "Производные"),
          ),
        );
      }, "JSON backup retains bookmark positions");
      await check(async () => {
        const copy = await Backups.create(data, preferences);
        for (const [, rows] of copy.canvasRecords)
          for (const [key, value] of rows)
            if (key === "meta" && value.bookmarks.length)
              value.bookmarks[0].camera.zoom = 100;
        try {
          await Backups.parse(JSON.stringify(copy));
          return false;
        } catch {
          return true;
        }
      }, "rejects corrupt bookmark positions without importing data");
      await page
        .locator('#canvasBookmarks button[aria-label^="Удалить закладку"]')
        .click();
      await page.evaluate(async () => {
        await save();
      });
      await check(async () => {
        const reopened = await SpatialDocument.open(book.id, "infinite");
        return reopened.overview.bookmarks.length === 0;
      }, "bookmark deletion persists without changing document objects");
      await page.locator("#goHome").click();
      await page.locator("#homeNewBook").click();
      await page.locator("#notebookName").fill("Обзор длинного A4");
      await page.locator("[name=documentFormat][value=continuous]").check();
      await page.locator("#createNotebook").click();
      await page.waitForFunction(
        () =>
          book.name === "Обзор длинного A4" &&
          CanvasEditor.session?.book.id === book.id &&
          !CanvasEditor.loading,
      );
      await page.evaluate(async () => {
        await CanvasEditor.move({ y: 25000 });
        CanvasOverview.draw();
      });
      await check(
        () =>
          book.canvasDocument.format === "continuous" && CanvasOverview.visible,
        "continuous A4 shares the same usable overview",
      );
      await page.locator("#canvasMinimap").focus();
      await page.keyboard.press("Home");
      await page.waitForFunction(
        () => CanvasEditor.session.camera.y === 0 && !CanvasEditor.loading,
      );
      await page.evaluate(() => CanvasOverview.draw());
      const mapRect = await page.locator("#canvasMinimap").boundingBox();
      await page.touchscreen.tap(mapRect.x + mapRect.width / 2, mapRect.y + 1);
      await page.waitForFunction(() => !CanvasEditor.loading);
      await check(
        () =>
          CanvasEditor.session.camera.x === 0 &&
          CanvasEditor.session.camera.y >= 0,
        "finger navigation respects continuous A4 boundaries",
      );
      await page.evaluate(async () => {
        await save();
      });
      await page.locator("#goHome").click();
      await check(
        () => $("canvasOverview").hidden,
        "home screen hides document overview",
      );
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      if (engine === "chromium") await context.setOffline(true);
      else {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
      await page.reload();
      await page.evaluate(async () => {
        await Home.ready;
        Home.open(data.selected, { history: false });
      });
      await page.waitForFunction(
        () =>
          CanvasEditor.session?.book.id === book.id && !CanvasEditor.loading,
      );
      if (!(await page.locator("#canvasOverview").isVisible()))
        await page.locator("#canvasOverviewToggle").click();
      await check(
        () =>
          typeof CanvasOverview.draw === "function" &&
          CanvasEditor.session.model.overview.bookmarks.length === 0,
        "offline reload loads overview resources and saved document",
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
