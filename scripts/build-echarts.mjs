import {
  readFile,
  writeFile,
  mkdtemp,
  mkdir,
  copyFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
const root = resolve(import.meta.dirname, ".."),
  destination = join(root, "vendor/echarts");
const lock = JSON.parse(
  await readFile(join(destination, "build-lock.json"), "utf8"),
);
if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error(
    "This pinned build uses Windows x64 esbuild; add a verified platform package to the lock for another host.",
  );
const work = await mkdtemp(join(tmpdir(), "notepad-echarts-build-"));
for (const p of lock) {
  const response = await fetch(p.tarball);
  if (!response.ok) throw new Error("Download failed: " + p.name);
  const buffer = Buffer.from(await response.arrayBuffer()),
    [algorithm, expected] = p.integrity.split("-");
  if (createHash(algorithm).update(buffer).digest("base64") !== expected)
    throw new Error("Integrity mismatch: " + p.name);
  const target = join(work, "node_modules", p.name),
    archive = join(work, p.name.replaceAll("/", "-") + ".tgz");
  await mkdir(target, { recursive: true });
  await writeFile(archive, buffer);
  execFileSync("tar", [
    "-xf",
    archive,
    "--strip-components",
    "1",
    "-C",
    target,
  ]);
}
const entry = `import * as echarts from 'echarts/core';
import {BarChart,LineChart,PieChart,ScatterChart,GraphChart} from 'echarts/charts';
import {TitleComponent,TooltipComponent,LegendComponent,GridComponent,DataZoomComponent,AriaComponent} from 'echarts/components';
import {LabelLayout} from 'echarts/features';
import {CanvasRenderer} from 'echarts/renderers';
echarts.use([BarChart,LineChart,PieChart,ScatterChart,GraphChart,TitleComponent,TooltipComponent,LegendComponent,GridComponent,DataZoomComponent,AriaComponent,LabelLayout,CanvasRenderer]);
export * from 'echarts/core';
export {default as inputEnvironment} from 'zrender/lib/core/env.js';
export {normalizeEvent as normalizeInput} from 'zrender/lib/core/event.js';`;
await writeFile(join(work, "entry.js"), entry);
const require = createRequire(join(work, "build.cjs")),
  esbuild = require("esbuild");
await esbuild.build({
  entryPoints: [join(work, "entry.js")],
  outfile: join(destination, "echarts.min.js"),
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "echarts",
  target: ["safari15.4"],
  legalComments: "eof",
  define: { "process.env.NODE_ENV": '"production"' },
});
for (const name of ["LICENSE", "NOTICE"])
  await copyFile(
    join(work, "node_modules/echarts", name),
    join(destination, name),
  );
await copyFile(
  join(work, "node_modules/zrender/LICENSE"),
  join(destination, "LICENSE-zrender"),
);
await copyFile(
  join(work, "node_modules/tslib/LICENSE.txt"),
  join(destination, "LICENSE-tslib"),
);
const binary = await readFile(join(destination, "echarts.min.js"));
console.log(
  JSON.stringify({
    bytes: binary.length,
    gzipBytes: gzipSync(binary).length,
    sha256: createHash("sha256").update(binary).digest("hex"),
  }),
);
