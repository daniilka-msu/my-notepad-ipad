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
      await page.evaluate(() => Home.ready);
      await page.locator("#homeNewBook").click();
      await page.locator("#notebookName").fill("Учебный проект 3.5");
      await page.locator("#createNotebook").click();
      await page.waitForFunction(() => !Home.active);
      const id = await page.evaluate(() => book.id);
      await page.locator("#extraTools summary").click();
      await page.locator("#insertChart").click();
      await page.locator("#chartNext").click();
      await page.locator("#chartDescriptionTab").click();
      await page
        .locator("#chartDescription")
        .fill("Построй диаграмму: алгебра 85, геометрия 72");
      await page.locator("#parseDescription").click();
      await page.locator("#chartNext").click();
      await page.locator("#chartName").fill("Прогресс");
      await page.locator("#chartNext").click();
      await page.locator("#applyChart").click();
      await page.waitForFunction(() =>
        document.getElementById("homeNotice").textContent.includes("Диаграмма"),
      );
      assert(
        (await page.locator("#homeNotice").isVisible()) &&
          (await page.evaluate(
            () =>
              document.activeElement !== document.body &&
              document.activeElement.getClientRects().length > 0,
          )),
        engine + " confirms insertion and restores visible keyboard focus",
      );
      await page.locator("#addPage").click();
      await page.locator("#extraTools summary").click();
      await page.locator("#insertGraph").click();
      await page.locator("#chartExpression").fill("bad(1)");
      assert(
        (await page
          .locator("#chartExpression")
          .getAttribute("aria-invalid")) === "true" &&
          (await page.locator("#applyChart").isDisabled()),
        engine + " exposes expression validation accessibly",
      );
      await page
        .locator("#graphExamples")
        .getByRole("button", { name: "Синусоида", exact: true })
        .click();
      assert(
        (await page
          .locator("#chartExpression")
          .getAttribute("aria-invalid")) === null,
        engine + " clears validation after correcting expression",
      );
      await page.locator("#applyChart").click();
      await page.waitForFunction(() =>
        document.getElementById("homeNotice").textContent.includes("График"),
      );
      assert(
        await page.evaluate(
          () =>
            book.pages[0][0].kind === "bar" &&
            book.pages[1][0].kind === "function",
        ),
        engine + " diagram and function coexist as separate editable pages",
      );
      await page.locator("#addPage").click();
      await page.locator("#extraTools summary").click();
      await page.locator("#textTool").click();
      await page.locator("#fitPage").click();
      const r = await page.locator("#canvas").boundingBox();
      await page.mouse.click(r.x + r.width * 0.2, r.y + r.height * 0.2);
      await page.locator("#textContent").fill("Сквозной конспект");
      await page.locator("#saveText").click();
      await page.locator("#editText").click();
      await page.locator("#textContent").fill("Несохранённый черновик");
      await page.goBack();
      await page.waitForFunction(
        () => Home.active && !document.querySelector("dialog[open]"),
      );
      assert(
        await page.evaluate(
          () => data.books[0].pages[2][0].text === "Сквозной конспект",
        ),
        engine + " browser Back cancels text draft without losing saved note",
      );
      await page.goForward();
      await page.waitForFunction(() => !Home.active);
      assert(
        await page.evaluate(
          () => page === 2 && !document.querySelector("dialog[open]"),
        ),
        engine +
          " Forward restores editor page without reopening discarded modal",
      );
      await page.locator("#zoomIn").click();
      await page.locator("#zoomIn").click();
      const zoom = await page.evaluate(() => PageView.zoom),
        notes = await page.evaluate(() => JSON.stringify(book.pages));
      await page.locator("#goHome").click();
      await page
        .locator('#homeBooks [data-book-id="' + id + '"] .home-book-open')
        .click();
      assert(
        (await page.evaluate(() => PageView.zoom)) === zoom &&
          (await page.evaluate(() => JSON.stringify(book.pages))) === notes,
        engine + " home round trip preserves zoom and document coordinates",
      );
      await page.locator("#addPage").click();
      const before = await page.evaluate(() => JSON.stringify(book.pages));
      await page.locator("#extraTools summary").click();
      await page.locator("#insertChart").click();
      await page.locator("#chartNext").click();
      await page.locator("#chartDescriptionTab").click();
      await page.evaluate(() =>
        ChartRequests.connect({
          label: "Test-only navigation mock",
          generate: () =>
            new Promise((resolve) => (window.finishNavigationMock = resolve)),
        }),
      );
      await page.locator("#descriptionMode").selectOption("provider");
      await page.locator("#chartDescription").fill("Тест отмены при навигации");
      await page.locator("#parseDescription").click();
      await page.goBack();
      await page.waitForFunction(
        () => Home.active && !document.querySelector("dialog[open]"),
      );
      await page.evaluate(() =>
        window.finishNavigationMock({
          kind: "bar",
          data: [{ label: "Late", value: 10 }],
        }),
      );
      assert(
        (await page.evaluate(() => JSON.stringify(book.pages))) === before,
        engine + " navigation cancels late future-provider result",
      );
      await page.evaluate(() => ChartRequests.connect(null));
      await page
        .locator('#homeBooks [data-book-id="' + id + '"] .home-book-open')
        .click();
      await page.locator("#documentMenuButton").click();
      const popupPromise = context.waitForEvent("page");
      await page.locator("#exportPdf").click();
      const popup = await popupPromise;
      await popup.waitForFunction(
        () =>
          document.images.length === 4 &&
          [...document.images].every((i) => i.complete && i.naturalWidth > 0),
      );
      assert(
        (await popup.locator("img").count()) === 4,
        engine + " PDF UI prepares all mixed document pages",
      );
      if (engine === "chromium") {
        const cdp = await context.newCDPSession(popup),
          pdf = await cdp.send("Page.printToPDF", {
            printBackground: true,
            preferCSSPageSize: true,
          }),
          bytes = Buffer.from(pdf.data, "base64");
        assert(
          bytes.subarray(0, 5).toString() === "%PDF-" &&
            (bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || [])
              .length === 4,
          engine + " actual PDF contains four mixed document pages",
        );
        await cdp.detach();
      }
      await popup.close();
      await page.locator("#documentMenuButton").click();
      const downloading = page.waitForEvent("download");
      await page.locator("#exportPng").click();
      assert(
        (await downloading).suggestedFilename().endsWith(".png"),
        engine + " PNG export works through document menu",
      );
      await page.locator("#goHome").click();
      const card = page.locator('#homeBooks [data-book-id="' + id + '"]');
      await page.evaluate(() => save());
      const originalState = await page.evaluate(() => JSON.stringify(data));
      await card.locator(".home-book-more").click();
      await page.locator("#renameNotebook").fill("Не сохранять");
      await page.evaluate(() => {
        window.originalStoreWrite = NotepadStore.write;
        NotepadStore.write = async () => {
          throw new Error("Тестовая ошибка хранения");
        };
      });
      await page.locator("#saveNotebookProperties").click();
      assert(
        (await page.locator("#notebookActionError").textContent()) ===
          "Тестовая ошибка хранения" &&
          (await page.evaluate(() => JSON.stringify(data))) === originalState,
        engine + " storage failure stays in modal and leaves library unchanged",
      );
      await page.evaluate(
        () => (NotepadStore.write = window.originalStoreWrite),
      );
      await page.locator("#closeNotebookActions").click();
      await card.locator(".home-book-more").click();
      await page.locator("#duplicateNotebook").click();
      await page.waitForFunction(
        () => !document.getElementById("notebookActions").open,
      );
      assert(
        await page.evaluate(
          () =>
            data.books.length === 2 &&
            JSON.stringify(data.books[0].pages) ===
              JSON.stringify(data.books[1].pages),
        ),
        engine +
          " duplication preserves diagram, graph and text sources together",
      );
      await card.locator(".home-book-more").click();
      await page.locator("#trashNotebook").click();
      await page.waitForFunction(
        () => !document.getElementById("notebookActions").open,
      );
      await page.locator("[data-view=trash]").click();
      await page.locator(".restore-notebook").click();
      await page.waitForFunction(
        () => document.querySelectorAll("#homeBooks .home-card").length === 0,
      );
      await page.locator("[data-view=all]").click();
      await card.locator(".home-book-open").click();
      const images = await page.evaluate(async () =>
        Promise.all(
          book.pages.map((_, i) =>
            Documents.compose(book, i).then((c) => c.toDataURL()),
          ),
        ),
      );
      assert(
        await page.evaluate(async () => {
          const backup = await Backups.parse(
            JSON.stringify(await Backups.create(data)),
          );
          return (
            backup.library.books.length === 2 &&
            backup.library.books[0].pages[0][0].data[0].value === 85
          );
        }),
        engine +
          " backup and trash restoration preserve complete mixed documents",
      );
      await page.evaluate(() => save());
      await page.locator("#goHome").click();
      await page.locator("#openSettings").click();
      await page.locator("#theme").selectOption("dark");
      await page.locator("#closeSettings").click();
      assert(
        (await page.locator("html").getAttribute("data-theme")) === "dark",
        engine + " home settings retain shared dark theme",
      );
      if (directory)
        await page.screenshot({
          path: resolve(directory, engine + "-studio35-home.png"),
        });
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      if (engine === "webkit")
        await new Promise((r) => {
          server.close(r);
          server.closeAllConnections();
        });
      else await context.setOffline(true);
      await page.goto(url + "/index.html");
      await page.evaluate(() => Home.ready);
      assert(
        await page.evaluate(() => Home.active && data.books.length === 2),
        engine + " normal offline start returns to real home library",
      );
      await page
        .locator('#homeBooks [data-book-id="' + id + '"] .home-book-open')
        .click();
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
        engine + " complete Home/Studio workflow exports identically offline",
      );
      assert(
        errors.length === 0,
        engine + " complete workflow has no script errors: " + errors.join(","),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  server.closeAllConnections();
}
