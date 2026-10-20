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
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.evaluate(() => Home.ready);
      await page.locator("#libraryView-list").click();
      await page.reload();
      await page.evaluate(() => Home.ready);
      assert(
        (await page.locator("#homeBooks").getAttribute("data-view")) === "list",
        engine + " persists list preference",
      );
      await page.locator("#homeNewBook").click();
      await page.locator("[name=documentFormat][value=paged]").check();
      await page.locator("#notebookName").fill("UX 5.0");
      await page.locator("#createNotebook").click();
      await page.waitForFunction(() => !Home.active && book.name === "UX 5.0");
      await page.locator("#goHome").click();
      assert(
        (await page.locator("#homeBooks .home-card").count()) === 1,
        engine + " lists created document",
      );
      for (const width of [1024, 768, 512])
        for (const theme of ["light", "dark"]) {
          await page.setViewportSize({
            width,
            height: width === 768 ? 1024 : 768,
          });
          await page.evaluate((t) => {
            document.documentElement.dataset.theme = t;
          }, theme);
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            engine + " library fits " + width + " " + theme,
          );
          if (directory)
            await page.screenshot({
              animations: "disabled",
              path: resolve(
                directory,
                engine + "-library-" + width + "-" + theme + ".png",
              ),
            });
        }
      await page.locator("#libraryView-covers").click();
      assert(
        (await page.locator("#homeBooks").getAttribute("data-view")) ===
          "covers",
        engine + " switches covers",
      );
      await page.locator("#homeBooks .home-book-open").click();
      await page.evaluate(() => Editor.choose("hand"));
      await page.locator("[data-tool=pen]").click();
      assert(
        !(await page.locator("#brushDialog").evaluate((e) => e.open)),
        engine + " first pen click selects",
      );
      await page.locator("[data-tool=pen]").click();
      assert(
        await page.locator("#brushDialog").evaluate((e) => e.open),
        engine + " second pen click opens properties",
      );
      await page.locator("#closeBrushes").click();
      for (const width of [1024, 768, 512])
        for (const theme of ["light", "dark"]) {
          await page.setViewportSize({
            width,
            height: width === 768 ? 1024 : 768,
          });
          await page.evaluate((t) => {
            document.documentElement.dataset.theme = t;
            PageView.layout();
          }, theme);
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            engine + " editor fits " + width + " " + theme,
          );
          assert(
            await page.locator("#saveStatus").isVisible(),
            engine + " save status visible " + width,
          );
          if (directory)
            await page.screenshot({
              animations: "disabled",
              path: resolve(
                directory,
                engine + "-editor-" + width + "-" + theme + ".png",
              ),
            });
        }
      assert(!errors.length, engine + " no script errors " + errors.join(","));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  server.closeAllConnections();
}
