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
      async function gesture(points) {
        const r = await page.locator("#canvas").boundingBox();
        const p = ([x, y]) => ({
          x: r.x + (x / 794) * r.width,
          y: r.y + (y / 1123) * r.height,
        });
        await page.mouse.move(p(points[0]).x, p(points[0]).y);
        await page.mouse.down();
        for (const point of points.slice(1)) {
          const v = p(point);
          await page.mouse.move(v.x, v.y, { steps: 4 });
        }
        await page.mouse.up();
      }
      const photo = await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 240;
        c.height = 160;
        const x = c.getContext("2d");
        x.fillStyle = "#75c9dc";
        x.fillRect(0, 0, 240, 160);
        x.fillStyle = "#365ecc";
        x.fillRect(20, 20, 80, 80);
        return c.toDataURL().split(",")[1];
      });
      await page.locator("#extraTools summary").click();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.locator("#insertImage").click(),
      ]);
      await chooser.setFiles({
        name: "photo.png",
        mimeType: "image/png",
        buffer: Buffer.from(photo, "base64"),
      });
      await page.waitForFunction(
        () => ObjectTools.current()?.type === "image-object",
      );
      const asset = await page.evaluate(() => ObjectTools.current().asset);
      await page.locator("#lassoTool").click();
      await gesture([
        [40, 60],
        [330, 60],
        [330, 270],
        [40, 270],
        [40, 60],
      ]);
      await page.waitForFunction(() => SmartLasso.values().length === 1);
      await page.locator("#lassoLock").click();
      await page.locator("[data-tool=pen]").click();
      await gesture([
        [100, 120],
        [180, 150],
      ]);
      await check(
        () =>
          Shapes.resolve(book.pages[page]).some(
            (s) => s?.type === "image-object" && s.locked,
          ) && Shapes.resolve(book.pages[page]).some((s) => s?.tool === "pen"),
        "writes vector annotations above a locked photo",
      );
      await page.locator("#lassoTool").click();
      await gesture([
        [40, 60],
        [330, 60],
        [330, 270],
        [40, 270],
        [40, 60],
      ]);
      await page.waitForFunction(() => SmartLasso.values().length === 2);
      await page.locator("#lassoLock").click();
      await page.locator("#lassoGroup").click();
      await check(
        () =>
          new Set(SmartLasso.values().map((v) => v.value.groupId)).size === 1 &&
          SmartLasso.values().some((v) => v.value.type === "image-object") &&
          SmartLasso.values().some((v) => v.value.tool === "pen"),
        "groups photo and annotations without merging their data",
      );
      await page.locator("#lassoUngroup").click();
      await page.locator("#documentMenuButton").click();
      await page.locator("#captureArea").click();
      await gesture([
        [80, 100],
        [200, 200],
      ]);
      await page.waitForFunction(
        () =>
          AreaCapture.clipboard &&
          !!AreaCapture.snapshot &&
          !$("captureCut").disabled,
      );
      await check(
        () =>
          AreaCapture.candidates().length === 1 &&
          AreaCapture.candidates()[0].value.tool === "pen",
        "cut policy includes fully enclosed ink and preserves partial photo",
      );
      const before = await page.evaluate(async () =>
        (await Documents.compose(book, page)).toDataURL(),
      );
      await page.locator("#captureCut").click();
      await check(
        () =>
          Shapes.resolve(book.pages[page]).some(
            (v) => v?.type === "image-object",
          ) && !Shapes.resolve(book.pages[page]).some((v) => v?.tool === "pen"),
        "cuts only fully contained unlocked objects after PNG is ready",
      );
      await page.locator("#undo").click();
      assert(
        (await page.evaluate(async () =>
          (await Documents.compose(book, page)).toDataURL(),
        )) === before,
        engine + " undo raster cut restores original photo and ink exactly",
      );
      await gesture([
        [70, 90],
        [200, 200],
      ]);
      await page.waitForFunction(
        () =>
          AreaCapture.snapshot &&
          AreaCapture.clipboard &&
          !$("captureCopy").disabled,
      );
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#captureDownload").click();
      const download = await downloadPromise;
      assert(
        download.suggestedFilename() === "my-notepad-area.png",
        engine + " exports selected area as PNG through browser download",
      );
      await page.locator("#captureMode").selectOption("freeform");
      await gesture([
        [70, 90],
        [210, 90],
        [70, 210],
        [70, 90],
      ]);
      await page.waitForFunction(
        () => AreaCapture.snapshot && !$("captureCopy").disabled,
      );
      await check(async () => {
        const image = await createImageBitmap(AreaCapture.clipboard.blob),
          c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const x = c.getContext("2d");
        x.drawImage(image, 0, 0);
        return (
          x.getImageData(c.width - 2, c.height - 2, 1, 1).data[3] === 0 &&
          x.getImageData(4, 4, 1, 1).data[3] > 0
        );
      }, "freeform capture has genuinely transparent pixels outside its contour");
      await page.locator("#captureObject").click();
      await page.waitForFunction(
        () =>
          Shapes.resolve(book.pages[page]).filter(
            (v) => v?.type === "image-object",
          ).length === 2,
      );
      await check(
        () => Shapes.resolve(book.pages[page]).some((v) => v?.tool === "pen"),
        "creates raster object while keeping original vector annotations",
      );
      await page.evaluate(async () => {
        await save();
        await Backups.parse(
          JSON.stringify(await Backups.create(data, preferences)),
        );
      });
      await check(
        () =>
          Shapes.resolve(book.pages[page]).filter(
            (v) => v?.type === "image-object",
          ).length === 2,
        "saves original photo and separate captured image",
      );
      assert(
        await page.evaluate(
          (asset) =>
            Shapes.resolve(book.pages[page]).some((v) => v?.asset === asset),
          asset,
        ),
        engine + " retains original photo asset",
      );
      const png = await page.evaluate(async () =>
        (await Documents.compose(book, page)).toDataURL(),
      );
      await page.reload();
      await page.evaluate(async () => {
        await Home.ready;
        Home.open(data.selected, { history: false });
      });
      assert(
        (await page.evaluate(async () =>
          (await Documents.compose(book, page)).toDataURL(),
        )) === png,
        engine +
          " captured object and vector originals reopen with identical PNG",
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
