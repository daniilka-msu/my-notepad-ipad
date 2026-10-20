import http from "node:http";
import { execFileSync } from "node:child_process";
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
    res.end(
      process.env.EDIT_BASELINE &&
        ["shape-tools.js", "text-tools.js", "object-tools.js"].includes(path)
        ? execFileSync(
            "git",
            [
              "-c",
              "safe.directory=" + root.replaceAll("\\", "/"),
              "show",
              process.env.EDIT_BASELINE + ":" + path,
            ],
            { cwd: root },
          )
        : await readFile(resolve(root, path)),
    );
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
      const page = await browser.newPage({
          viewport: { width: 1024, height: 768 },
        }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.evaluate(async () => {
        await Home.ready;
        const b = Library.newBook({
          name: "Object regression",
          template: "plain",
          pageSize: "a4",
          paper: "blank",
          color: "#5369d8",
          pattern: "plain",
        });
        data.books.push(b);
        Home.open(b.id, { history: false });
      });
      await page.waitForFunction(() => storageReady && !Home.active);
      for (const kind of ["shape", "text", "object"])
        for (const zoom of [0.5, 1.5]) {
          const result = await page.evaluate(
            ({ kind, zoom }) => {
              const text = {
                type: "text-block",
                x: 300,
                y: 220,
                width: 240,
                size: 24,
                text: "Several lines\nSecond line\nThird line",
                font: "Arial",
                color: "#222222",
                bold: false,
                italic: false,
                align: "left",
                rotation: 90,
              };
              const value =
                kind === "text"
                  ? text
                  : kind === "shape"
                    ? {
                        tool: "pen",
                        shape: "circle",
                        color: "#222222",
                        width: 3,
                        points: Shapes.points(
                          "circle",
                          { x: 280, y: 220 },
                          { x: 400, y: 320 },
                          book,
                        ),
                      }
                    : {
                        type: "table-object",
                        x: 280,
                        y: 220,
                        width: 220,
                        height: 120,
                        rows: 2,
                        cols: 2,
                        cells: [
                          ["A", "B"],
                          ["C", "D"],
                        ],
                      };
              // A registered sticker exercises generic object editing without asynchronous assets.
              if (kind === "object") {
                value.type = "sticker-object";
                value.symbol = "idea";
                value.text = "Note";
                value.fill = "#fff5c9";
                value.color = "#222222";
              }
              book.pages[page] = [value];
              redo = [];
              render();
              PageView.setZoom(zoom);
              Editor.choose(
                kind === "shape"
                  ? "selectShape"
                  : kind === "text"
                    ? "textBlock"
                    : "pageObject",
              );
              const b = SceneObjects.bounds(value),
                point = { x: b.x + b.width / 2, y: b.y + b.height / 2 },
                r = canvas.getBoundingClientRect();
              const nativePaint = paint,
                nativeRAF = window.requestAnimationFrame,
                nativeCancel = window.cancelAnimationFrame;
              let count = 0,
                next = 0;
              const callbacks = new Map();
              window.requestAnimationFrame = (fn) => {
                callbacks.set(++next, fn);
                return next;
              };
              window.cancelAnimationFrame = (id) => callbacks.delete(id);
              paint = () => {
                count++;
                nativePaint();
              };
              canvas.setPointerCapture = () => {};
              canvas.hasPointerCapture = () => false;
              const event = (type, x, y) =>
                canvas.dispatchEvent(
                  new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    pointerId: 300,
                    pointerType: "mouse",
                    button: 0,
                    buttons: type === "pointerup" ? 0 : 1,
                    clientX: r.left + (x / 794) * r.width,
                    clientY: r.top + (y / 1123) * r.height,
                  }),
                );
              try {
                event("pointerdown", point.x, point.y);
                const before = count;
                for (let i = 1; i <= 20; i++)
                  event("pointermove", point.x + i, point.y + i);
                const during = count - before;
                for (const [id, fn] of [...callbacks]) {
                  callbacks.delete(id);
                  fn(0);
                }
                const frames = count - before;
                event("pointerup", point.x + 20, point.y + 20);
                const values = Shapes.resolve(book.pages[page], false),
                  final = values[0];
                const moved =
                  kind === "shape"
                    ? Math.abs(final.points[0].x - value.points[0].x - 20) <
                      0.01
                    : Math.abs(final.x - value.x - 20) < 0.01;
                const beforeCancel = JSON.stringify(book.pages[page]);
                event("pointerdown", point.x + 20, point.y + 20);
                event("pointermove", point.x + 40, point.y + 40);
                event("pointercancel", point.x + 40, point.y + 40);
                for (const [id, fn] of [...callbacks]) {
                  callbacks.delete(id);
                  fn(0);
                }
                const cancelled =
                    JSON.stringify(book.pages[page]) === beforeCancel,
                  actions = book.pages[page].length;
                $("undo").click();
                const undone =
                  JSON.stringify(Shapes.resolve(book.pages[page], false)[0]) ===
                  JSON.stringify(value);
                $("redo").click();
                const redone =
                  JSON.stringify(book.pages[page]) === beforeCancel;
                return {
                  during,
                  frames,
                  moved,
                  actions,
                  cancelled,
                  history: undone && redone,
                };
              } finally {
                paint = nativePaint;
                window.requestAnimationFrame = nativeRAF;
                window.cancelAnimationFrame = nativeCancel;
                delete canvas.setPointerCapture;
                delete canvas.hasPointerCapture;
                Editor.choose("hand");
              }
            },
            { kind, zoom },
          );
          assert(
            result.during === 0 && result.frames === 1,
            engine +
              " " +
              kind +
              " batches 20 moves at " +
              zoom +
              " " +
              JSON.stringify(result),
          );
          assert(
            result.moved && result.actions === 2,
            engine + " " + kind + " commits final coordinate once at " + zoom,
          );
          assert(
            result.cancelled,
            engine + " " + kind + " cancels pending preview at " + zoom,
          );
          assert(
            result.history,
            engine +
              " " +
              kind +
              " undo and redo preserve the complete edit at " +
              zoom,
          );
        }
      const edges = await page.evaluate(() => {
        const s = {
          type: "text-block",
          x: 500,
          y: 350,
          width: 240,
          size: 24,
          text: "One\nTwo\nThree",
          font: "Georgia",
          color: "#222222",
          bold: false,
          italic: false,
          align: "left",
          rotation: 90,
        };
        book.pages[page] = [s];
        redo = [];
        render();
        Editor.choose("textBlock");
        PageView.setZoom(1);
        const r = canvas.getBoundingClientRect(),
          b = SceneObjects.bounds(s),
          p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        canvas.setPointerCapture = () => {};
        const fire = (type, x, y) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 301,
              pointerType: "mouse",
              button: 0,
              buttons: type === "pointerup" ? 0 : 1,
              clientX: r.left + (x / 794) * r.width,
              clientY: r.top + (y / 1123) * r.height,
            }),
          );
        fire("pointerdown", p.x, p.y);
        fire("pointermove", p.x + 400, p.y + 500);
        fire("pointerup", p.x + 400, p.y + 500);
        delete canvas.setPointerCapture;
        const final = TextTools.current(),
          bounds = SceneObjects.bounds(final);
        return {
          right: bounds.x + bounds.width,
          bottom: bounds.y + bounds.height,
          x: final.x,
          original: s.x,
        };
      });
      assert(
        Math.abs(edges.right - 794) < 0.01 &&
          edges.bottom <= 1123.01 &&
          edges.x > edges.original,
        engine + " rotated text clamps visual bounds, not original width",
      );
      await page.evaluate(() => save());
      const snapshot = await page.evaluate(() => JSON.stringify(book.pages));
      const png = await page.evaluate(async () =>
        (await Documents.compose(book, page)).toDataURL(),
      );
      await page.reload();
      await page.evaluate(() => Home.ready);
      await page.waitForFunction(() => storageReady);
      assert(
        (await page.evaluate(() => JSON.stringify(book.pages))) === snapshot,
        engine + " saves and reopens edited objects",
      );
      assert(
        (await page.evaluate(async () =>
          (await Documents.compose(book, page)).toDataURL(),
        )) === png,
        engine + " exports edited text identically after reopening",
      );
      assert(!errors.length, engine + " no script errors " + errors.join(","));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  server.closeAllConnections();
}
