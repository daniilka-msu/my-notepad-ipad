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
          name: "Функции 3.5",
          template: "plain",
          paper: "grid",
          pageSize: "a4",
          pattern: "plain",
          color: "#5369d8",
        });
        data.books.push(b);
        Home.open(b.id);
      });
      for (const name of ["Парабола", "Прямая", "Синусоида", "Гипербола"]) {
        if (name !== "Парабола") await page.locator("#addPage").click();
        await page.locator("#extraTools summary").click();
        await page.locator("#insertGraph").click();
        assert(
          (await page
            .locator("#chartDialog")
            .evaluate((e) => e.classList.contains("function-editor"))) &&
            !(await page.locator("#chartSteps").isVisible()),
          engine + " opens dedicated function panel " + name,
        );
        await page
          .locator("#graphExamples")
          .getByRole("button", { name, exact: true })
          .click();
        assert(
          await page.evaluate(
            () =>
              ChartStudio.value().autoY &&
              document.getElementById("chartError").textContent === "",
          ),
          engine + " plots live example " + name,
        );
        if (name === "Парабола") {
          await page.locator("#chartExpression").fill("y=x^2-4");
          await page.locator("#chartAddFunction").click();
          await page.locator("#chartExpression1").fill("y=2*x+1");
          await page
            .locator("#chartFunctions input[type=color]")
            .nth(1)
            .fill("#c03943");
          assert(
            await page.evaluate(
              () =>
                ChartStudio.value().functions.length === 2 &&
                ChartStudio.value().functions[1].expression === "2*x+1",
            ),
            engine + " normalizes y= and plots multiple functions",
          );
          await page
            .locator("#graphPointsDetails")
            .evaluate((e) => (e.open = true));
          await page.locator("#chartAddPoint").click();
          const row = page.locator("#chartPoints tbody tr");
          await row.locator("td").nth(0).locator("input").fill("A");
          await row.locator("td").nth(1).locator("input").fill("2");
          await row.locator("td").nth(2).locator("input").fill("30");
          assert(
            await page.evaluate(() => ChartStudio.value().yMax > 30),
            engine + " auto range includes coordinate points",
          );
          await page.locator("#graphAutoY").uncheck();
          await page.locator("#chartYMin").fill("-10");
          await page.locator("#chartYMax").fill("50");
          assert(
            await page.evaluate(
              () =>
                ChartStudio.value().yMin === -10 &&
                ChartStudio.value().yMax === 50 &&
                !ChartStudio.value().autoY,
            ),
            engine + " supports optional manual Y range",
          );
          await page.locator("#graphAutoY").check();
          await page.locator("#chartZoomIn").tap();
          assert(
            !(await page.locator("#graphAutoY").isChecked()),
            engine + " touch zoom preserves a manual viewport",
          );
          await page.locator("#chartExpression").fill("window.alert(1)");
          assert(
            await page.locator("#applyChart").isDisabled(),
            engine + " rejects executable expressions",
          );
          await page.locator("#chartExpression").fill("y=x^2-4");
          assert(
            await page.evaluate(() => book.pages[page].length === 0),
            engine + " preview never changes document before confirmation",
          );
          for (const width of [320, 512, 1366]) {
            await page.setViewportSize({ width, height: 900 });
            await page.evaluate(
              () =>
                new Promise((r) =>
                  requestAnimationFrame(() => requestAnimationFrame(r)),
                ),
            );
            if (directory)
              await page.screenshot({
                path: resolve(directory, engine + "-graph-" + width + ".png"),
              });
            assert(
              await page
                .locator("#chartDialog")
                .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
              engine + " function editor fits " + width,
            );
            if (directory)
              await page.screenshot({
                path: resolve(directory, engine + "-graph-" + width + ".png"),
              });
          }
          await page.setViewportSize({ width: 1024, height: 768 });
        }
        await page.locator("#applyChart").click();
        assert(
          await page.evaluate(
            () =>
              Charts.valid(ObjectTools.current()) &&
              ObjectTools.current().kind === "function" &&
              !ObjectTools.current().functions[0].expression.startsWith("y="),
          ),
          engine + " stores editable function source " + name,
        );
        const original = await page.evaluate(() =>
          JSON.stringify(book.pages[page]),
        );
        await page.locator("#editObject").click();
        await page.locator("#chartExpression").fill("y=x+3");
        await page.locator("#applyChart").click();
        assert(
          await page.evaluate(
            () => ObjectTools.current().functions[0].expression === "x+3",
          ),
          engine + " edits saved function " + name,
        );
        await page.locator("#undo").click();
        assert(
          (await page.evaluate(() => JSON.stringify(book.pages[page]))) ===
            original,
          engine + " undoes function edit " + name,
        );
        await page.locator("#redo").click();
      }
      await page.evaluate(() => save());
      const snapshot = await page.evaluate(() => JSON.stringify(book.pages)),
        images = await page.evaluate(async () =>
          Promise.all(
            book.pages.map((_, i) =>
              Documents.compose(book, i).then((c) => c.toDataURL()),
            ),
          ),
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
      await page.evaluate(() => Home.ready);
      assert(
        (await page.evaluate(() => JSON.stringify(book.pages))) === snapshot,
        engine + " restores function sources and ranges offline",
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
        ) === JSON.stringify(images),
        engine + " exports function pages identically offline",
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
