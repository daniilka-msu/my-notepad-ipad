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
      await page.evaluate(() => {
        book.pages = [[]];
        render();
      });
      async function drag(a, b) {
        const r = await page.locator("#canvas").boundingBox();
        const p = (q) => ({
          x: r.x + (q.x / 794) * r.width,
          y: r.y + (q.y / 1123) * r.height,
        });
        const x = p(a),
          y = p(b);
        await page.mouse.move(x.x, x.y);
        await page.mouse.down();
        await page.mouse.move(y.x, y.y, { steps: 4 });
        await page.mouse.up();
      }
      await page.locator("#extraTools summary").click();
      await page.locator("#textTool").click();
      await drag({ x: 100, y: 200 }, { x: 100, y: 200 });
      await page.locator("#textContent").fill("Текст Studio");
      await page.locator("#saveText").click();
      await page.locator("#contexttext").click();
      await page.locator("#contextUnderline").check();
      await page.locator("#contextFilled").check();
      await page.locator("#contextFill").fill("#fff5c9");
      await page.locator("#contextFont").selectOption("Georgia");
      await page.locator("#applyContext").click();
      assert(
        await page.evaluate(
          () =>
            TextTools.current().underline &&
            TextTools.current().background === "#fff5c9" &&
            TextTools.current().font === "Georgia",
        ),
        engine + " applies contextual text formatting",
      );
      await page.locator("#editText").click();
      assert(
        await page.locator("#textUnderline").isChecked(),
        engine + " reopens underline in text editor",
      );
      await page.locator("#closeText").click();
      await page.locator("#undo").click();
      assert(
        await page.evaluate(() => !TextTools.current().underline),
        engine + " undoes text formatting",
      );
      await page.locator("#redo").click();
      await page.locator("#extraTools summary").click();
      await page.locator("#drawShape").click();
      await page.locator("#shapeKind").selectOption("rect");
      await page.locator("#applyShape").click();
      await drag({ x: 250, y: 250 }, { x: 450, y: 400 });
      await page.locator("#extraTools summary").click();
      await page.locator("#selectShape").click();
      await drag({ x: 300, y: 300 }, { x: 300, y: 300 });
      await page.locator("#contextshape").click();
      await page.locator("#contextDash").selectOption("dotted");
      await page.locator("#contextRadius").fill("18");
      await page.locator("#contextRotation").fill("30");
      await page.locator("#contextAlign").selectOption("center");
      await page.locator("#applyContext").click();
      assert(
        await page.evaluate(() => {
          const s = ShapeTools.current(),
            b = Shapes.bounds(s);
          return (
            s.dash === "dotted" &&
            s.radius === 18 &&
            Math.abs((b.x + b.right) / 2 - 397) < 0.001
          );
        }),
        engine + " rotates, rounds and centers shape",
      );
      const geometry = await page.evaluate(() =>
        JSON.stringify(ShapeTools.current().points),
      );
      await page.locator("#editShape").click();
      await page.locator("#shapeColor").fill("#23856b");
      await page.locator("#applyShape").click();
      assert(
        (await page.evaluate(() =>
          JSON.stringify(ShapeTools.current().points),
        )) === geometry,
        engine + " preserves rotated geometry when changing stroke",
      );
      assert(
        await page.evaluate(() =>
          ["a4", "a5", "square"].every((pageSize) => {
            const notebook = { pageSize },
              s = {
                shape: "circle",
                points: Shapes.points(
                  "circle",
                  { x: 20, y: 30 },
                  { x: 180, y: 70 },
                  notebook,
                ),
              },
              b = Shapes.bounds(s),
              scale = Paper.geometry(notebook).outputHeight / 1123,
              v = ContextTools.transformShape(
                s,
                (b.right - b.x) * 2,
                (b.bottom - b.y) * scale,
                90,
                "none",
                notebook,
              ),
              r = Shapes.bounds(v);
            return Math.abs(r.right - r.x - (r.bottom - r.y) * scale) < 0.01;
          }),
        ),
        engine + " maintains physical circles across page formats and rotation",
      );
      await page.locator("#extraTools summary").click();
      await page.locator("#insertImage").click();
      await page.locator("#imageFile").setInputFiles({
        name: "pixel.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          await page.evaluate(() => {
            const c = document.createElement("canvas");
            c.width = c.height = 100;
            const x = c.getContext("2d");
            x.fillStyle = "red";
            x.fillRect(0, 0, 100, 100);
            return c.toDataURL().split(",")[1];
          }),
          "base64",
        ),
      });
      await page
        .waitForFunction(() => ObjectTools.current()?.type === "image-object")
        .catch(async (e) => {
          console.log(await page.locator("#imageStatus").textContent(), errors);
          throw e;
        });
      await page.locator("#contextobject").click();
      await page.locator("#contextW").fill("160");
      await page.locator("#contextRotation").selectOption("90");
      await page.locator("#applyContext").click();
      assert(
        await page.evaluate(
          () =>
            ObjectTools.current().width === 160 &&
            ObjectTools.current().height === 160 &&
            ObjectTools.current().rotation === 90,
        ),
        engine + " resizes image proportionally and rotates",
      );
      await drag({ x: 100, y: 120 }, { x: 140, y: 160 });
      assert(
        await page.evaluate(() => ObjectTools.current().x > 90),
        engine + " moves unlocked image",
      );
      await page.locator("#lockObject").click();
      const locked = await page.evaluate(() =>
        JSON.stringify(ObjectTools.current()),
      );
      await drag({ x: 140, y: 160 }, { x: 200, y: 210 });
      assert(
        (await page.evaluate(() => JSON.stringify(ObjectTools.current()))) ===
          locked,
        engine + " prevents moving locked image",
      );
      assert(
        (await page.locator("#deleteObject").isDisabled()) &&
          (await page.locator("#editObject").isDisabled()),
        engine + " prevents deleting or modifying locked image",
      );
      await page.locator("#lockObject").click();
      await page.locator("#extraTools summary").click();
      await page.locator("#insertChart").click();
      if(await page.evaluate(()=>ChartWizard.enabled))await page.locator('[data-chart-step="4"]').click();
        await page.locator("#applyChart").click();
      const count = await page.evaluate(
        () =>
          Shapes.resolve(book.pages[page]).filter(
            (s) => s?.type === "chart-object",
          ).length,
      );
      await page.locator("#duplicateObject").click();
      assert(
        (await page.evaluate(
          () =>
            Shapes.resolve(book.pages[page]).filter(
              (s) => s?.type === "chart-object",
            ).length,
        )) ===
          count + 1,
        engine + " duplicates editable chart",
      );
      const download = page.waitForEvent("download");
      await page.locator("#exportObject").click();
      assert(
        (await download).suggestedFilename() === "my-notepad-object.png",
        engine + " exports selected chart through UI",
      );
      const png = await page.evaluate(async () =>
        (await Documents.compose(book, page)).toDataURL(),
      );
      assert(
        await page.evaluate(async () => {
          const b = await Backups.create(data);
          return (
            JSON.stringify((await Backups.parse(JSON.stringify(b))).library) ===
            JSON.stringify(data)
          );
        }),
        engine + " backs up contextual properties without losing old objects",
      );
      await page.evaluate(() => save());
      const snapshot = await page.evaluate(() => JSON.stringify(book.pages));
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
        engine + " restores all contextual properties offline",
      );
      assert(
        (await page.evaluate(async () =>
          (await Documents.compose(book, page)).toDataURL(),
        )) === png,
        engine + " exports formatted mixed page identically offline",
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
