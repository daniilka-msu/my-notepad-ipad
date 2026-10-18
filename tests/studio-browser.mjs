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
      await page.waitForFunction(
        () => typeof storageReady !== "undefined" && storageReady,
      );
      await page.evaluate(() => {
        book.name = "Studio browser";
        book.paper = "blank";
        book.pages = [[]];
        render();
      });
      const kinds = [
        "bar",
        "line",
        "pie",
        "doughnut",
        "scatter",
        "function",
        "axes",
        "flow",
      ];
      for (const [index, kind] of kinds.entries()) {
        if (index) await page.locator("#addPage").click();
        await page.locator("#extraTools summary").click();
        await page.locator("#insertChart").click();
        await page.locator("#chartKind").selectOption(kind);
        await page.locator("#chartName").fill("Studio " + kind);
        await page
          .locator("#chartTheme")
          .selectOption(index % 2 ? "aurora" : "studio");
        if (kind === "bar") {
          const row = page.locator("#chartDataTable tbody tr").first();
          await row.locator("td").nth(0).locator("input").fill("Эксперимент");
          await row.locator("td").nth(2).locator("input").fill("12");
          await page.locator("#chartAddRow").click();
          assert(
            (await page.locator("#chartDataTable tbody tr").count()) === 4,
            engine + " table data editor adds rows",
          );
        }
        if (kind === "function") {
          await page.locator("#chartExpression").fill("sin(x)");
          await page.locator("#chartAddFunction").click();
          await page.locator("#chartExpression1").fill("x^2/5");
          await page.locator("#chartAddPoint").click();
          const row = page.locator("#chartPoints tbody tr");
          await row.locator("td").nth(0).locator("input").fill("A");
          await row.locator("td").nth(1).locator("input").fill("2");
          await row.locator("td").nth(2).locator("input").fill("0.8");
          await page.locator("#chartZoomIn").tap();
          assert(
            (await page.locator("#chartXMax").inputValue()) !== "10",
            engine + " graph zoom updates saved ranges",
          );
          await page.locator("#chartPreview").scrollIntoViewIfNeeded();
          const box = await page.locator("#chartPreview").boundingBox(),
            before = await page.locator("#chartXMin").inputValue();
          await page.mouse.move(
            box.x + box.width * 0.6,
            box.y + box.height * 0.5,
          );
          await page.mouse.down();
          await page.mouse.move(
            box.x + box.width * 0.75,
            box.y + box.height * 0.5,
            { steps: 8 },
          );
          await page.mouse.up();
          assert(
            (await page.locator("#chartXMin").inputValue()) !== before,
            engine + " graph pans through actual pointer input",
          );
          if (engine === "chromium") {
            const cdp = await context.newCDPSession(page),
              before = await page.evaluate(() => ({
                span:
                  Number(document.getElementById("chartXMax").value) -
                  Number(document.getElementById("chartXMin").value),
                zoom: PageView.zoom,
              }));
            const x = box.x + box.width * 0.5,
              y = box.y + box.height * 0.5;
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [
                { id: 1, x: x - 25, y },
                { id: 2, x: x + 25, y },
              ],
            });
            for (const distance of [35, 45, 55])
              await cdp.send("Input.dispatchTouchEvent", {
                type: "touchMove",
                touchPoints: [
                  { id: 1, x: x - distance, y },
                  { id: 2, x: x + distance, y },
                ],
              });
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchEnd",
              touchPoints: [],
            });
            await page.waitForTimeout(100);
            assert(
              await page.evaluate(
                (b) =>
                  Number(document.getElementById("chartXMax").value) -
                    Number(document.getElementById("chartXMin").value) <
                    b.span && PageView.zoom === b.zoom,
                before,
              ),
              "chromium pinch zooms only the graph, preserving document zoom",
            );
            await cdp.detach();
          }
          if (directory)
            await page
              .locator("#chartDialog")
              .screenshot({
                path: resolve(directory, engine + "-function.png"),
              });
        }
        if (kind === "flow") {
          await page
            .locator("#chartFlowTable tbody tr")
            .nth(1)
            .locator("select")
            .selectOption("io");
          await page.locator("#chartPreview").scrollIntoViewIfNeeded();
          const position = await page.evaluate(() => {
            const chart = ChartStudio.instance(),
              data = chart.getModel().getSeriesByIndex(0).getData(),
              p = data.getItemGraphicEl(1).transformCoordToGlobal(0, 0),
              r = document
                .getElementById("chartPreview")
                .getBoundingClientRect();
            return {
              x: r.left + p[0],
              y: r.top + p[1],
              before: ChartStudio.value().nodes[1].x,
              edge: JSON.stringify(data.graph.getEdgeByIndex(0).getLayout()),
            };
          });
          await page.mouse.move(position.x, position.y);
          await page.mouse.down();
          await page.mouse.move(position.x + 35, position.y + 25, { steps: 8 });
          await page.mouse.up();
          const after = await page.evaluate(() => ({
            x: ChartStudio.value().nodes[1].x,
            edge: JSON.stringify(
              ChartStudio.instance()
                .getModel()
                .getSeriesByIndex(0)
                .getData()
                .graph.getEdgeByIndex(0)
                .getLayout(),
            ),
          }));
          assert(
            Math.abs(after.x - position.before) > 1 &&
              after.edge !== position.edge,
            engine +
              " dragging flow block updates attached arrows and saved coordinates",
          );
          if (engine === "chromium") {
            const cdp = await context.newCDPSession(page);
            for (const pointerType of ["touch", "pen"]) {
              const p = await page.evaluate(() => {
                const data = ChartStudio.instance()
                    .getModel()
                    .getSeriesByIndex(0)
                    .getData(),
                  p = data.getItemGraphicEl(1).transformCoordToGlobal(0, 0),
                  r = document
                    .getElementById("chartPreview")
                    .getBoundingClientRect();
                return {
                  x: r.left + p[0],
                  y: r.top + p[1],
                  saved: ChartStudio.value().nodes[1].x,
                };
              });
              if (pointerType === "touch") {
                await cdp.send("Input.dispatchTouchEvent", {
                  type: "touchStart",
                  touchPoints: [{ id: 5, x: p.x, y: p.y }],
                });
                for (const dx of [10, 20, 30])
                  await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{ id: 5, x: p.x + dx, y: p.y - 10 }],
                  });
                await cdp.send("Input.dispatchTouchEvent", {
                  type: "touchEnd",
                  touchPoints: [],
                });
              } else {
                await cdp.send("Input.dispatchMouseEvent", {
                  type: "mousePressed",
                  x: p.x,
                  y: p.y,
                  button: "left",
                  buttons: 1,
                  pointerType: "pen",
                });
                await cdp.send("Input.dispatchMouseEvent", {
                  type: "mouseMoved",
                  x: p.x + 25,
                  y: p.y + 10,
                  button: "left",
                  buttons: 1,
                  pointerType: "pen",
                });
                await cdp.send("Input.dispatchMouseEvent", {
                  type: "mouseReleased",
                  x: p.x + 25,
                  y: p.y + 10,
                  button: "left",
                  buttons: 0,
                  pointerType: "pen",
                });
              }
              assert(
                await page.evaluate(
                  (before) =>
                    Math.abs(ChartStudio.value().nodes[1].x - before) > 1,
                  p.saved,
                ),
                "chromium moves connected flow blocks using " + pointerType,
              );
            }
            await cdp.detach();
          }
          if (directory)
            await page
              .locator("#chartDialog")
              .screenshot({ path: resolve(directory, engine + "-flow.png") });
        }
        if (kind === "doughnut")
          for (const width of [512, 320, 1366]) {
            await page.setViewportSize({ width, height: 900 });
            assert(
              await page
                .locator("#chartDialog")
                .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
              engine + " Studio dialog fits " + width,
            );
            if (directory)
              await page
                .locator("#chartDialog")
                .screenshot({
                  path: resolve(
                    directory,
                    engine + "-studio-" + width + ".png",
                  ),
                });
          }
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.locator("#applyChart").click();
        assert(
          await page.evaluate(
            () =>
              Charts.valid(ObjectTools.current()) &&
              ObjectTools.current().chartVersion === 3,
          ),
          engine + " inserts editable " + kind,
        );
        await page.locator("#editObject").click();
        assert(
          (await page.locator("#chartKind").inputValue()) === kind,
          engine + " reopens " + kind,
        );
        await page.locator("#closeChart").click();
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
      await page.reload();
      await page.waitForFunction(
        () => typeof storageReady !== "undefined" && storageReady,
      );
      assert(
        (await page.evaluate(() => JSON.stringify(book.pages))) === snapshot,
        engine + " preserves all chart types after reload",
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
      const reopened = await page.evaluate(async () =>
        Promise.all(
          book.pages.map((_, i) =>
            Documents.compose(book, i).then((c) => c.toDataURL()),
          ),
        ),
      );
      assert(
        JSON.stringify(reopened) === JSON.stringify(images),
        engine + " exports every chart identically after offline reopening",
      );
      assert(errors.length === 0, engine + " reports no JavaScript errors");
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  server.closeAllConnections();
}
