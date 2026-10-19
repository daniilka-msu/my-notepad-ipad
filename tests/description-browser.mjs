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
        errors = [],
        outbound = [];
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (["xhr", "fetch"].includes(r.resourceType())) outbound.push(r.url());
      });
      await page.goto(url);
      await page.evaluate(async () => {
        await Home.ready;
        const b = Library.newBook({
          name: "Описание диаграмм",
          template: "plain",
          paper: "blank",
          pageSize: "a4",
          pattern: "plain",
          color: "#5369d8",
        });
        data.books.push(b);
        Home.open(b.id);
      });
      await page.locator("#extraTools summary").click();
      await page.locator("#insertChart").click();
      await page.locator("#chartNext").click();
      await page.locator("#chartDescriptionTab").click();
      assert(
        (await page.locator("#descriptionProvider").textContent()).includes(
          "ИИ не подключён",
        ),
        engine + " honestly identifies local parser without AI",
      );
      await page.locator("#chartDescription").fill("Сравни мои оценки за год");
      const before = await page.evaluate(() =>
        JSON.stringify(ChartStudio.value().data),
      );
      await page.locator("#parseDescription").click();
      assert(
        (await page.locator("#descriptionError").textContent()) !== "" &&
          (await page.evaluate(() =>
            JSON.stringify(ChartStudio.value().data),
          )) === before,
        engine + " complex request preserves previous draft",
      );
      await page.locator("#chartNext").click();
      assert(
        await page.evaluate(() => ChartWizard.step === 2),
        engine + " cannot skip unparsed request",
      );
      const network = outbound.length;
      await page
        .locator("#chartDescription")
        .fill("Построй диаграмму: математика 85, физика 72, информатика 94");
      await page.locator("#parseDescription").click();
      assert(
        (await page.locator("#chartTableTab").getAttribute("aria-selected")) ===
          "true" &&
          (await page.locator("#chartDataTable tbody tr").count()) === 3,
        engine + " local request yields editable review table",
      );
      assert(
        outbound.length === network &&
          (await page.evaluate(() => book.pages[page].length === 0)),
        engine +
          " local parsing sends no request and does not insert automatically",
      );
      await page
        .locator("#chartDataTable tbody tr")
        .first()
        .locator("td")
        .nth(2)
        .locator("input")
        .fill("86");
      await page.locator("#chartNext").click();
      await page.locator("#chartName").fill("Результаты");
      await page.locator("#chartNext").click();
      assert(
        await page.evaluate(
          () => ChartWizard.step === 4 && book.pages[page].length === 0,
        ),
        engine + " preview requires explicit insertion",
      );
      await page.locator("#applyChart").click();
      assert(
        await page.evaluate(
          () =>
            ObjectTools.current().data[0].value === 86 &&
            ObjectTools.current().title === "Результаты",
        ),
        engine + " inserts confirmed edited result",
      );
      const saved = await page.evaluate(() => JSON.stringify(book.pages));
      await page.locator("#editObject").click();
      await page.locator("#chartNext").click();
      await page.locator("#chartDescriptionTab").click();
      await page.evaluate(() =>
        ChartRequests.connect({
          label: "Test-only invalid mock",
          generate: async () => ({
            kind: "bar",
            data: [{ label: "A", value: "secret" }],
          }),
        }),
      );
      await page.locator("#descriptionMode").selectOption("provider");
      await page.locator("#chartDescription").fill("Тестовый сложный запрос");
      await page.locator("#parseDescription").click();
      assert(
        (await page.locator("#descriptionError").textContent()) !== "" &&
          (await page.evaluate(() => JSON.stringify(book.pages))) === saved,
        engine + " rejects invalid future provider schema",
      );
      await page.evaluate(() =>
        ChartRequests.connect({
          label: "Test-only deferred mock",
          generate: (input) => {
            window.mockKeys = Object.keys(input).sort();
            return new Promise((resolve) => (window.finishMock = resolve));
          },
        }),
      );
      await page.locator("#parseDescription").click();
      await page.locator("#cancelDescription").click();
      await page.evaluate(() =>
        window.finishMock({ kind: "bar", data: [{ label: "A", value: 10 }] }),
      );
      assert(
        (await page.evaluate(() => JSON.stringify(book.pages))) === saved &&
          (await page
            .locator("#chartDescriptionTab")
            .getAttribute("aria-selected")) === "true",
        engine + " cancellation prevents late result from changing draft",
      );
      await page.evaluate(() =>
        ChartRequests.connect({
          label: "Test-only valid mock",
          generate: async (input) => {
            window.mockKeys = Object.keys(input).sort();
            return {
              kind: "line",
              title: "Проверенный вариант",
              data: [
                { label: "A", value: 10 },
                { label: "B", value: 20 },
              ],
            };
          },
        }),
      );
      await page.locator("#parseDescription").click();
      await page.waitForFunction(
        () =>
          document
            .getElementById("chartTableTab")
            .getAttribute("aria-selected") === "true",
      );
      assert(
        await page.evaluate(
          () =>
            JSON.stringify(window.mockKeys) === '["signal","text"]' &&
            book.pages[page].length === 1 &&
            ChartStudio.value().kind === "line",
        ),
        engine +
          " future adapter gets only request and leaves result uncommitted",
      );
      for (const width of [320, 512, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator("#chartDescriptionTab").click();
        assert(
          await page
            .locator("#chartDialog")
            .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          engine + " description editor fits " + width,
        );
        if (directory)
          await page.screenshot({
            path: resolve(directory, engine + "-description-" + width + ".png"),
          });
      }
      await page.locator("#closeChart").click();
      await page.evaluate(() => ChartRequests.connect(null));
      assert(
        (await page.evaluate(() => JSON.stringify(book.pages))) === saved,
        engine + " closing review discards provider draft",
      );
      await page.evaluate(() => save());
      const png = await page.evaluate(async () =>
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
      await page.evaluate(() => Home.ready);
      assert(
        (await page.evaluate(() => JSON.stringify(book.pages))) === saved &&
          (await page.evaluate(async () =>
            (await Documents.compose(book, page)).toDataURL(),
          )) === png,
        engine + " confirmed description chart reopens and exports offline",
      );
      await page.locator("#extraTools summary").click();
      await page.locator("#insertChart").click();
      await page.locator("#chartNext").click();
      await page.locator("#chartDescriptionTab").click();
      await page
        .locator("#chartDescription")
        .fill("Создай круговую диаграмму: A 10, B 20");
      await page.locator("#parseDescription").click();
      assert(
        await page.evaluate(
          () =>
            ChartStudio.value().kind === "pie" &&
            ChartRequests.providerLabel === null,
        ),
        engine + " local description works offline without provider",
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
