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
      await page.evaluate(async()=>{await Home.ready;if(!Library.active(data).length){const entry=Library.newBook({name:'Регрессионная тетрадь',template:'plain',pageSize:'a4',paper:'blank',color:'#5369d8',pattern:'plain'});data.books.push(entry);Home.open(entry.id,{history:false})}else Home.open(data.selected,{history:false})});
      await page.waitForFunction(
        () => typeof storageReady !== "undefined" && storageReady,
      );
      await page.locator("#togglePenDock").click();
      await page.locator("#savePreset").click();
      assert(
        (await page.locator("#penPresets button").count()) === 1,
        engine + " pins current pen from dock",
      );
      await page.locator("#managePenDock").click();
      await page.locator("#savePreset").click();
      assert(
        (await page.locator("#penPresets button").count()) === 1,
        engine + " prevents duplicate presets",
      );
      await page.locator("[data-tool=pen]").click();
      await page.locator("[data-brush=pencil]").click();
      await page.locator("#brushColor").fill("#23856b");
      await page.locator("#brushWidth").fill("5");
      await page.locator("#brushOpacity").fill("70");
      await page.locator("#brushSmoothing").fill("45");
      await page.locator("#useBrush").click();
      await page.locator("#savePreset").click();
      await page.locator("[data-tool=pen]").click();
      await page.locator("[data-brush=marker]").click();
      await page.locator("#brushColor").fill("#c03943");
      await page.locator("#brushWidth").fill("3");
      await page.locator("#brushSmoothing").fill("10");
      await page.locator("#useBrush").click();
      await page.locator("#savePreset").click();
      assert(
        (await page.locator("#penPresets button").count()) === 3,
        engine + " pins distinct pencil and marker",
      );
      await page.locator("#penPresets button").nth(1).click();
      assert(
        await page.evaluate(
          () =>
            tool === "pen" &&
            preferences.penType === "pencil" &&
            preferences.color === "#23856b" &&
            preferences.width === 5 &&
            preferences.opacity === 70 &&
            preferences.smoothing === 45,
        ),
        engine + " restores real brush properties and correction",
      );
      assert(
        (await page
          .locator("#penPresets button")
          .nth(1)
          .getAttribute("aria-pressed")) === "true",
        engine + " indicates active preset",
      );
      await page.locator("#penPresets button").nth(2).click();
      assert(
        await page.evaluate(
          () =>
            tool === "marker" &&
            preferences.penType === "marker" &&
            preferences.smoothing === 10,
        ),
        engine + " switches to actual marker",
      );
      await page
        .locator(".dock-manage-row")
        .nth(2)
        .getByRole("button", { name: /Раньше/ })
        .click();
      assert(
        await page.evaluate(
          () => preferences.penPresets[1].penType === "marker",
        ),
        engine + " reorders favorites",
      );
      await page
        .locator(".dock-manage-row")
        .first()
        .getByRole("button", { name: /Удалить/ })
        .click();
      assert(
        (await page.locator("#penPresets button").count()) === 2,
        engine + " deletes preset without deleting notes",
      );
      await page.locator("#managePenDock").click();
      await page.locator("#togglePenDock").click();
      await page.locator("#togglePenDock").tap();
      assert(
        await page.locator("#penDockContent").isVisible(),
        engine + " toggles dock with touch",
      );
      for (const width of [320, 512, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        assert(
          await page.locator("#penDockContent").evaluate((e) => {
            const r = e.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth;
          }),
          engine + " dock fits " + width,
        );
        if (directory)
          await page.screenshot({
            path: resolve(directory, engine + "-dock-" + width + ".png"),
          });
      }
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.locator("#togglePenDock").click();
      await page.evaluate(() => {
        preferences.toolbarPosition = "bottom";
        $("toolbarPosition").value = "bottom";
        $("toolbarPosition").dispatchEvent(new Event("change"));
      });
      await page.locator("#togglePenDock").click();
      assert(
        await page
          .locator("#penDock")
          .evaluate(
            (e) =>
              e.getBoundingClientRect().bottom <=
              document.getElementById("toolbar").getBoundingClientRect().top,
          ),
        engine + " dock fits above bottom toolbar",
      );
      await page.evaluate(() => {
        preferences.toolbarPosition = "top";
        $("toolbarPosition").value = "top";
        $("toolbarPosition").dispatchEvent(new Event("change"));
        book.pages = [[]];
        render();
      });
      await page.locator("#togglePenDock").click();
      await page.locator("#fitPage").click();
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const r = await page.locator("#canvas").boundingBox();
      await page.mouse.move(r.x + r.width * 0.6, r.y + r.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width * 0.7, r.y + r.height * 0.25, {
        steps: 4,
      });
      await page.mouse.up();
      assert(
        await page.evaluate(
          () => book.pages[page].at(-1)?.penType === "marker",
        ),
        engine + " draws with selected dock tool",
      );
      await page.locator("#undo").click();
      assert(
        await page.evaluate(() => book.pages[page].length === 0),
        engine + " undo works after dock switching",
      );
      await page.locator("#redo").click();
      await page.evaluate(() => save());
      const preset = await page.evaluate(() =>
          JSON.stringify(preferences.penPresets),
        ),
        notes = await page.evaluate(() => JSON.stringify(book.pages)),
        png = await page.evaluate(async () =>
          (await Documents.compose(book, page)).toDataURL(),
        );
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      if (engine === "webkit")
        await new Promise((r) => {
          server.close(r);
          server.closeAllConnections();
        });
      else await context.setOffline(true);
      await page.reload();
      await page.waitForFunction(
        () => typeof storageReady !== "undefined" && storageReady,
      );
      assert(
        (await page.evaluate(() => JSON.stringify(preferences.penPresets))) ===
          preset,
        engine + " preserves dock order and properties offline",
      );
      assert(
        (await page.evaluate(() => JSON.stringify(book.pages))) === notes &&
          (await page.evaluate(async () =>
            (await Documents.compose(book, page)).toDataURL(),
          )) === png,
        engine + " preserves notes and export after dock changes offline",
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
