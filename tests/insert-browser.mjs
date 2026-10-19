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
      await page.evaluate(async()=>{await Home.ready;if(!Library.active(data).length){const entry=Library.newBook({name:'Регрессионная тетрадь',template:'plain',pageSize:'a4',paper:'blank',color:'#5369d8',pattern:'plain'});data.books.push(entry);Home.open(entry.id,{history:false})}else Home.open(data.selected,{history:false})});
      await page.waitForFunction(
        () => typeof storageReady !== "undefined" && storageReady,
      );
      await page.evaluate(() => {
        book.pages = [[]];
        render();
      });
      await page.locator("#extraTools summary").click();
      assert(
        (await page.locator(".insert-card").count()) === 9,
        engine + " exposes nine working categories",
      );
      await page.locator("#insertSearch").fill("дробь");
      assert(
        (await page.locator(".insert-card:visible").count()) === 1,
        engine + " searches tool synonyms",
      );
      await page.locator("#insertFormula").click();
      await page
        .locator("#studyTex")
        .fill("\\frac{a_1}{\\sqrt{x}}+\\int_0^1 x\\,dx");
      await page.waitForFunction(
        () => !document.getElementById("applyStudy").disabled,
      );
      await page.locator("#applyStudy").click();
      assert(
        await page.evaluate(
          () =>
            StudyObjects.valid(ObjectTools.current()) &&
            ObjectTools.current().tex.includes("frac"),
        ),
        engine + " inserts structured formula",
      );
      await page.locator("#editObject").click();
      await page.locator("#studyTex").fill("x^{2}+y^{2}");
      await page.waitForFunction(
        () => !document.getElementById("applyStudy").disabled,
      );
      await page.locator("#applyStudy").click();
      assert(
        await page.evaluate(() => ObjectTools.current().tex === "x^{2}+y^{2}"),
        engine + " edits formula",
      );
      await page.locator("#undo").click();
      assert(
        await page.evaluate(() => ObjectTools.current().tex.includes("frac")),
        engine + " undoes formula edit",
      );
      await page.locator("#redo").click();
      for (const id of ["insertTable", "insertSticker"]) {
        await page.locator("#extraTools summary").click();
        await page.locator("#" + id).click();
        if (id === "insertTable")
          await page
            .locator("#studyCells input")
            .first()
            .fill("Учебная таблица");
        else await page.locator("#studyText").fill("Повторить тему");
        await page.locator("#applyStudy").click();
        await page.locator("#editObject").click();
        assert(
          await page.locator("#studyDialog").isVisible(),
          engine + " reopens " + id,
        );
        await page.locator("#closeStudy").click();
      }
      await page.locator("#extraTools summary").click();
      await page.locator("[data-key=insertTable] .insert-favorite").click();
      await page.locator("[data-filter=favorites]").click();
      assert(
        (await page.locator(".insert-card:visible").count()) === 1,
        engine + " filters favorites",
      );
      await page.locator("#extraTools summary").click();
      await page.evaluate(() => save());
      const snapshot = await page.evaluate(() => JSON.stringify(book.pages));
      const image = await page.evaluate(async () =>
        (await Documents.compose(book, page)).toDataURL(),
      );
      assert(
        await page.evaluate(async () => {
          const parsed = await Backups.parse(
            JSON.stringify(await Backups.create(data)),
          );
          return (
            JSON.stringify(parsed.library.books) === JSON.stringify(data.books)
          );
        }),
        engine + " round-trips study objects through backup",
      );
      for (const width of [320, 512, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator("#extraTools summary").click();
        assert(
          await page.locator("#insertPanel").evaluate((e) => {
            const r = e.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth + 1;
          }),
          engine + " menu fits " + width,
        );
        await page.locator("#extraTools summary").click();
      }
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
        (await page.evaluate(() => JSON.stringify(book.pages))) === snapshot,
        engine + " restores editable source offline",
      );
      assert(
        (await page.evaluate(async () =>
          (await Documents.compose(book, page)).toDataURL(),
        )) === image,
        engine + " exports study objects identically offline",
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
