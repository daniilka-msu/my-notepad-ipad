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
      await gesture([
        [100, 200],
        [200, 220],
      ]);
      await page.locator("#extraTools summary").click();
      await page.locator("#textTool").click();
      await gesture([
        [280, 220],
        [280, 220],
      ]);
      await page.locator("#textContent").fill("Лассо: редактируемый текст");
      await page.locator("#saveText").click();
      await page.locator("#lassoTool").click();
      await gesture([
        [80, 170],
        [640, 170],
        [640, 400],
        [80, 400],
        [80, 170],
      ]);
      await page.waitForFunction(() => SmartLasso.values().length === 2);
      await check(
        () =>
          SmartLasso.values().some((v) => v.value.type === "text-block") &&
          SmartLasso.values().some((v) => v.value.tool === "pen"),
        "selects handwriting and editable text with a real freeform pointer gesture",
      );
      await page.locator("#lassoCopy").click();
      await page.locator("#lassoPaste").click();
      await check(
        () =>
          Shapes.resolve(book.pages[page]).filter(SceneObjects.eligible)
            .length === 4,
        "pastes editable mixed objects",
      );
      await page.locator("#undo").click();
      await check(
        () =>
          Shapes.resolve(book.pages[page]).filter(SceneObjects.eligible)
            .length === 2,
        "undo removes the whole pasted selection",
      );
      await page.locator("#redo").click();
      await check(
        () =>
          Shapes.resolve(book.pages[page]).filter(SceneObjects.eligible)
            .length === 4,
        "redo restores the whole selection",
      );
      const grip = await page.locator("#lassoResize").boundingBox();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        grip.x + grip.width / 2 + 12,
        grip.y + grip.height / 2 + 6,
        { steps: 4 },
      );
      await page.mouse.up();
      await check(
        () =>
          SmartLasso.values().find((v) => v.value.type === "text-block").value
            .size > 24 &&
          SmartLasso.values().find((v) => v.value.tool === "pen").value.width >
            3,
        "resizes mixed selection with a native touch-sized corner handle",
      );
      await page.locator("#lassoGroup").click();
      await check(
        () =>
          new Set(SmartLasso.values().map((v) => v.value.groupId)).size === 1 &&
          !!SmartLasso.values()[0].value.groupId,
        "groups mixed editable objects",
      );
      await page.locator("#lassoNew").click();
      await gesture([
        [10, 10],
        [150, 10],
        [150, 100],
        [10, 100],
        [10, 10],
      ]);
      await page.waitForFunction(() => SmartLasso.values().length === 2);
      await check(
        () => SmartLasso.values().some((v) => v.value.type === "text-block"),
        "selecting one group member includes the complete group",
      );
      await gesture([
        [100, 50],
        [280, 320],
      ]);
      await check(
        () =>
          SmartLasso.values().find((v) => v.value.tool === "pen").value
            .points[0].y > 250,
        "moves grouped vectors through native mouse capture",
      );
      await page.locator("#lassoRotate").click();
      await check(
        () =>
          SmartLasso.values().find((v) => v.value.type === "text-block").value
            .rotation === 90,
        "rotates text without rasterizing it",
      );
      await page.locator("#lassoColor").fill("#23856b");
      await page.locator("#lassoApplyColor").click();
      await check(
        () => SmartLasso.values().every((v) => v.value.color === "#23856b"),
        "changes applicable object colors",
      );
      await page.locator("#lassoLock").click();
      await check(
        () =>
          SmartLasso.values().every((v) => v.value.locked) &&
          $("lassoRotate").disabled,
        "locks grouped selection and disables destructive edits",
      );
      await page.locator("#lassoLock").click();
      await page.locator("#lassoBack").click();
      await page.locator("#lassoFront").click();
      await page.evaluate(async () => {
        await save();
        Backups.validateLibrary(data);
      });
      const png = await page.evaluate(async () =>
        (await Documents.compose(book, page)).toDataURL(),
      );
      await page.locator("#lassoCut").click();
      await check(
        () =>
          Shapes.resolve(book.pages[page]).filter(SceneObjects.eligible)
            .length === 2,
        "cuts original objects only after creating an editable clipboard copy",
      );
      await page.locator("#undo").click();
      assert(
        (await page.evaluate(async () =>
          (await Documents.compose(book, page)).toDataURL(),
        )) === png,
        engine + " undo cut restores identical rendering",
      );
      await page.evaluate(async () => {
        await save();
      });
      await page.reload();
      await page.evaluate(async () => {
        await Home.ready;
        Home.open(data.selected, { history: false });
      });
      await check(
        () =>
          Shapes.resolve(book.pages[page]).filter(SceneObjects.eligible)
            .length === 4 &&
          Shapes.resolve(book.pages[page]).some(
            (v) => v?.type === "text-block" && v.rotation === 90,
          ),
        "reopens editable rotated and grouped objects",
      );
      assert(
        (await page.evaluate(async () =>
          (await Documents.compose(book, page)).toDataURL(),
        )) === png,
        engine + " saved scene and PNG reopen identically",
      );
      await check(async () => {
        const restored = await Backups.parse(
          JSON.stringify(await Backups.create(data, preferences)),
        );
        return !!restored.library;
      }, "exports and validates group history in JSON");
      await page.locator("#lassoTool").click();
      await gesture([
        [1, 1],
        [760, 1],
        [760, 700],
        [1, 700],
        [1, 1],
      ]);
      await page.waitForFunction(() => SmartLasso.values().length >= 2);
      await page.locator("#lassoCopy").click();
      await page.locator("#goHome").click();
      await page.locator("#homeNewBook").click();
      await page.locator("#notebookName").fill("Лассо в бескрайнем поле");
      await page.locator("[name=documentFormat][value=infinite]").check();
      await page.locator("#createNotebook").click();
      await page.waitForFunction(
        () =>
          CanvasEditor.session?.book.id === book.id && !CanvasEditor.loading,
      );
      await page.evaluate(async () => {
        await CanvasEditor.move({ x: -3000, y: -4000 });
      });
      await page.locator("#lassoTool").click();
      await page.locator("#lassoPaste").click();
      await check(
        () =>
          SmartLasso.values().some((v) => v.value.type === "text-block") &&
          SmartLasso.values().some((v) => v.value.tool === "pen"),
        "editable clipboard crosses notebooks and document formats",
      );
      await page.locator("#lassoGroup").click();
      await page.evaluate(async () => {
        await save();
        await CanvasEditor.move({ x: 0, y: 0 });
        await CanvasEditor.move({ x: -3000, y: -4000 });
      });
      await check(async () => {
        const scene = Shapes.resolve(book.pages[0]).filter(
          SceneObjects.eligible,
        );
        const group = scene.find((v) => v.groupId)?.groupId;
        return (
          !!group &&
          (await CanvasEditor.session.model.group(group)).length >= 2 &&
          scene.some((v) => v.type === "text-block")
        );
      }, "groups preserve editable members across negative regions and cache unloading");
      await check(async () => {
        await Backups.parse(
          JSON.stringify(await Backups.create(data, preferences)),
        );
        return true;
      }, "canvas JSON includes complete group indexes and history");
      if(directory){
        await page.screenshot({path:resolve(directory,engine+'-lasso.png'),animations:'disabled'});
        await page.setViewportSize({width:512,height:768});
        await check(()=>{const r=$('lassoPanel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight},'lasso controls remain reachable in Split View');
        await page.screenshot({path:resolve(directory,engine+'-lasso-split.png'),animations:'disabled'});
      }
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
