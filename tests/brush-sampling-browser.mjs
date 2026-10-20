import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium, webkit } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const root = resolve(import.meta.dirname, ".."),
  reference = "6017bfd";
const before = execFileSync(
  "git",
  [
    "-c",
    "safe.directory=" + root.replaceAll("\\", "/"),
    "show",
    reference + ":brushes.js",
  ],
  { cwd: root },
)
  .toString()
  .replace("const Brushes =", "window.ReferenceBrushes =");
const current = await readFile(resolve(root, "brushes.js"), "utf8");
const server = http.createServer((req, res) => {
  res.setHeader(
    "Content-Type",
    req.url === "/"
      ? "text/html; charset=utf-8"
      : "text/javascript; charset=utf-8",
  );
  if (req.url === "/")
    res.end(
      '<!doctype html><title>Brush sampler regression</title><script src="/before.js"></script><script src="/after.js"></script>',
    );
  else if (req.url === "/before.js") res.end(before);
  else if (req.url === "/after.js") res.end(current);
  else res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const results = [];
try {
  for (const engine of ["chromium", "webkit"]) {
    const browser = await (engine === "chromium"
      ? chromium.launch({ channel: "msedge" })
      : webkit.launch());
    try {
      const page = await browser.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:" + server.address().port);
      const result = await page.evaluate(() => {
        const make = () => {
            const c = document.createElement("canvas");
            c.width = c.height = 512;
            return c;
          },
          oldCanvas = make(),
          newCanvas = make(),
          old = oldCanvas.getContext("2d"),
          next = newCanvas.getContext("2d");
        const sets = [
          [{ x: 30, y: 30, p: 0.3, pressureValid: true }],
          Array.from({ length: 32 }, () => ({
            x: 30,
            y: 30,
            p: 0.3,
            pressureValid: true,
          })),
          Array.from({ length: 48 }, (_, i) => ({
            x: 20 + i * 3,
            y: 50 + Math.sin(i * 0.3) * 20,
            p: 0.1 + i / 60,
            pressureValid: i % 5 !== 0,
          })),
          Array.from({ length: 1000 }, (_, i) => ({
            x: 20 + i * 0.2,
            y: 50 + Math.sin(i * 0.03) * 20,
            p: 0.4 + Math.sin(i * 0.02) * 0.3,
            pressureValid: true,
          })),
          [
            { x: -30000, y: 15, p: 0.2 },
            { x: 30000, y: 75, p: 0.8 },
          ],
          [
            { x: 20, y: 30 },
            { x: 40, y: 30, p: 0, pressureValid: true },
            { x: 40, y: 60, p: 0.9 },
            { x: 20, y: 60 },
          ],
          [
            { x: 15, y: 15, p: 0.2 },
            { x: 15, y: 15, p: 0.8 },
            { x: 60, y: 20, p: 0.1 },
            { x: 10, y: 40, p: 0.7 },
          ],
        ];
        let comparisons = 0;
        for (const scale of [1, 2])
          for (const kind of Object.keys(Brushes.labels))
            for (const points of sets)
              for (const tightSampling of [false, true]) {
                const s = {
                    points,
                    penType: kind,
                    width: kind === "marker" ? 12 : 3,
                    color: "#5369d8",
                    seed: 17,
                    pressure: true,
                    tightSampling,
                  },
                  source = JSON.stringify(s);
                for (const c of [old, next]) {
                  c.setTransform(1, 0, 0, 1, 0, 0);
                  c.clearRect(0, 0, 512, 512);
                  c.setTransform(scale, 0, 0, scale, -13.25, -5.75);
                }
                ReferenceBrushes.render(old, s);
                Brushes.render(next, s);
                if (oldCanvas.toDataURL() !== newCanvas.toDataURL())
                  throw Error(
                    "Pixel mismatch: " +
                      kind +
                      ", points=" +
                      points.length +
                      ", scale=" +
                      scale,
                  );
                if (JSON.stringify(s) !== source)
                  throw Error("Input vectors mutated");
                comparisons++;
              }
        const summarize = (values) => {
          const sorted = [...values].sort((a, b) => a - b);
          return {
            medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
            p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(3),
            totalMs: +sorted.reduce((sum, t) => sum + t, 0).toFixed(3),
          };
        };
        const points = Array.from({ length: 2000 }, (_, i) => ({
            x: 20 + i * 0.1,
            y: 50 + Math.sin(i * 0.03) * 20,
            p: 0.4 + Math.sin(i * 0.02) * 0.3,
            pressureValid: true,
          })),
          timings = [];
        for (const kind of ["regular", "pencil", "fountain", "brush"]) {
          const s = {
              points,
              penType: kind,
              width: 3,
              color: "#5369d8",
              seed: 17,
              pressure: true,
              tightSampling: true,
            },
            before = [],
            after = [];
          for (let i = 0; i < 18; i++)
            for (const [renderer, c, target] of i % 2
              ? [
                  [Brushes, next, after],
                  [ReferenceBrushes, old, before],
                ]
              : [
                  [ReferenceBrushes, old, before],
                  [Brushes, next, after],
                ]) {
              c.setTransform(1, 0, 0, 1, 0, 0);
              c.clearRect(0, 0, 512, 512);
              const start = performance.now();
              renderer.render(c, s);
              const elapsed = performance.now() - start;
              if (i >= 2) target.push(elapsed);
            }
          timings.push({
            kind,
            points: points.length,
            frames: 16,
            before: summarize(before),
            after: summarize(after),
          });
        }
        let grains = 0;
        const counter = {
          save() {},
          restore() {},
          beginPath() {},
          fill() {},
          arc() {
            grains++;
          },
        };
        ReferenceBrushes.render(counter, {
          points,
          penType: "pencil",
          width: 3,
          color: "#5369d8",
          seed: 17,
          pressure: true,
          tightSampling: true,
        });
        oldCanvas.width = newCanvas.width = 1;
        return {
          comparisons,
          timings,
          allocationEvidence: {
            inputPoints: points.length,
            referenceSampleObjects: grains / 4,
            currentSampleObjects: 0,
            method:
              "Reference samples counted as four pencil grains per sample; current no per-sample objects by source inspection; not heap bytes",
          },
          userAgent: navigator.userAgent,
        };
      });
      assert.equal(errors.length, 0, errors.join("\n"));
      console.log(
        "PASS " +
          engine +
          " " +
          result.comparisons +
          " pixel-identical brush comparisons; input vectors preserved",
      );
      results.push({ engine, ...result });
    } finally {
      await browser.close();
    }
  }
  if (process.env.SAMPLING_RESULTS)
    await writeFile(
      process.env.SAMPLING_RESULTS,
      JSON.stringify(
        {
          reference,
          method:
            "Standalone brush rendering; alternating trials; two warmups; synthetic varying pressure; not device FPS or app latency",
          results,
        },
        null,
        2,
      ) + "\n",
    );
  for (const result of results)
    console.log(
      JSON.stringify({ engine: result.engine, timings: result.timings }),
    );
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
