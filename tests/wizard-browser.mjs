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
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.evaluate(async () => {
        await Home.ready;
        const b = Library.newBook({
          name: "Мастер диаграмм",
          template: "plain",
          paper: "blank",
          pageSize: "a4",
          pattern: "plain",
          color: "#5369d8",
        });
        data.books.push(b);
        Home.open(b.id);
      });
      for (const kind of ["bar", "line", "pie", "doughnut", "scatter"]) {
        if (kind !== "bar") await page.locator("#addPage").click();
        await page.locator("#extraTools summary").click();
        await page.locator("#insertChart").click();
        assert(
          await page.evaluate(
            () => ChartWizard.step === 1 && ChartWizard.enabled,
          ),
          engine + " opens type step " + kind,
        );
        await page.locator("#chartKind").selectOption(kind);
        await page.locator("#chartNext").click();
        assert(
          await page.evaluate(() => ChartWizard.step === 2),
          engine + " opens data step " + kind,
        );
        await page
          .locator("#chartData")
          .evaluate((e) => (e.closest("details").open = true));
        await page
          .locator("#chartData")
          .fill(
            kind === "scatter"
              ? "Имя\tX\tY\nA\t-2\t3\nB\t1,5\t4"
              : "Категория\tЗначение\nМатематика\t85\nФизика\t72",
          );
        assert(
          (await page.locator("#chartDataTable tbody tr").count()) === 2,
          engine + " pastes tabular data " + kind,
        );
        if (kind === "pie") {
          await page
            .locator("#chartDataTable tbody tr")
            .first()
            .locator("td")
            .nth(2)
            .locator("input")
            .fill("-5");
          await page.locator("#chartNext").click();
          assert(
            await page.evaluate(
              () =>
                ChartWizard.step === 2 &&
                document.getElementById("chartError").textContent.length > 0,
            ),
            engine + " blocks invalid pie before confirmation",
          );
          await page
            .locator("#chartDataTable tbody tr")
            .first()
            .locator("td")
            .nth(2)
            .locator("input")
            .fill("85");
        }
        await page.locator("#chartAddRow").click();
        assert(
          (await page.locator("#chartDataTable tbody tr").count()) === 3,
          engine + " adds row " + kind,
        );
        await page
          .locator("#chartDataTable tbody tr")
          .last()
          .getByRole("button")
          .click();
        await page.locator("#chartNext").click();
        await page.locator("#chartName").fill("Оценки · " + kind);
        await page.locator("#chartTheme").selectOption("ink");
        await page.locator("#chartLabels").check();
        await page.locator("#chartName").press("Enter");
        assert(
          await page.evaluate(
            () => ChartWizard.step === 4 && book.pages[page].length === 0,
          ),
          engine + " Enter leads to preview without insertion " + kind,
        );
        assert(
          await page.locator("#applyChart").isVisible(),
          engine + " exposes explicit confirmation " + kind,
        );
        if (directory)
          await page.screenshot({
            path: resolve(directory, engine + "-wizard-" + kind + ".png"),
          });
        await page.locator("#applyChart").click();
        assert(
          await page.evaluate(
            (kind) =>
              ObjectTools.current().kind === kind &&
              ObjectTools.current().data.length === 2 &&
              ObjectTools.current().style.theme === "ink",
            kind,
          ),
          engine + " inserts structured diagram " + kind,
        );
        const before = await page.evaluate(() =>
          JSON.stringify(book.pages[page]),
        );
        await page.locator("#editObject").click();
        await page.locator("#chartNext").click();
        await page
          .locator("#chartDataTable tbody tr")
          .first()
          .locator("td")
          .nth(2)
          .locator("input")
          .fill("90");
        await page.locator("#closeChart").click();
        assert(
          (await page.evaluate(() => JSON.stringify(book.pages[page]))) ===
            before,
          engine + " closing cancels draft " + kind,
        );
        await page.locator("#editObject").click();
        await page.locator("#chartNext").click();
        await page
          .locator("#chartDataTable tbody tr")
          .first()
          .locator("td")
          .nth(2)
          .locator("input")
          .fill("95");
        await page.locator("#chartNext").click();
        await page.locator("#chartNext").click();
        await page.locator("#applyChart").click();
        assert(
          await page.evaluate(() => ObjectTools.current().data[0].value === 95),
          engine + " reopens and edits " + kind,
        );
        await page.locator("#undo").click();
        assert(
          (await page.evaluate(() => JSON.stringify(book.pages[page]))) ===
            before,
          engine + " undoes diagram edit " + kind,
        );
        await page.locator("#redo").click();
      }
      const exports = await page.evaluate(async () =>
        Promise.all(
          book.pages.map((_, i) =>
            Documents.compose(book, i).then((c) => c.toDataURL()),
          ),
        ),
      );
      await page.evaluate(() => save());
      const snapshot = await page.evaluate(() => JSON.stringify(book.pages));
      await page.locator("#editObject").click();
      for (const width of [320, 512, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        assert(
          await page
            .locator("#chartDialog")
            .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          engine + " wizard fits " + width,
        );
      }
      await page.locator("#closeChart").click();
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      if (engine === "webkit")
        await new Promise((r) => {
          server.close(r);
          server.closeAllConnections();
        });
      else await context.setOffline(true);
      await page.reload();
      await page.evaluate(() => Home.ready);
      assert(
        (await page.evaluate(() => JSON.stringify(book.pages))) === snapshot,
        engine + " preserves wizard charts offline",
      );
      assert(
        JSON.stringify(
          await page.evaluate(async () =>
            Promise.all(
              book.pages.map((_, i) =>
                Documents.compose(book, i).then((c) => c.toDataURL()),
              ),
            ),
          ),
        ) === JSON.stringify(exports),
        engine + " exports all wizard charts identically offline",
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
