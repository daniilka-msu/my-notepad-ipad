import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const root = resolve(import.meta.dirname, "..");
const server = http.createServer(async (req, res) => {
  try {
    const path =
      decodeURIComponent(new URL(req.url, "http://local").pathname).slice(1) ||
      "index.html";
    if (path.startsWith("api/transcription")) {
      await mockApi(req, res);
      return;
    }
    if (path.includes("..")) throw Error();
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(resolve(root, path)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { webkit } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
function check(value, label) {
  if (!value) throw Error(label);
  console.log("PASS " + label);
}
let mock,
  serverClosed = false;
async function mockApi(req, res) {
  const path = new URL(req.url, "http://test").pathname.slice(
    "/api/transcription".length,
  );
  const body = [];
  for await (const part of req) body.push(part);
  const bytes = Buffer.concat(body);
  const json = (status, value, cookie) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    });
    res.end(JSON.stringify(value));
  };
  mock.calls.push({ path, method: req.method, bytes: bytes.length });
  if (path === "/login") {
    const valid = JSON.parse(bytes).password === "test-transcription-password";
    json(
      valid ? 200 : 401,
      valid ? { ok: true } : { error: "unauthorized" },
      valid
        ? "test_asr=1; Path=/api/transcription; HttpOnly; SameSite=Strict"
        : null,
    );
    return;
  }
  if (!req.headers.cookie?.includes("test_asr=1")) {
    json(401, { error: "unauthorized" });
    return;
  }
  if (path === "/status") {
    json(200, { configured: true, maxBytes: 256 * 1024 * 1024 });
    return;
  }
  if (path === "/logout") {
    json(200, { ok: true }, "test_asr=; Path=/api/transcription; Max-Age=0");
    return;
  }
  if (path === "/jobs" && req.method === "POST") {
    const meta = JSON.parse(bytes),
      id = String(mock.jobs.size + 1).padStart(32, "0");
    const job = {
      id,
      state: "uploading",
      uploadedChunks: 0,
      bytes: 0,
      seconds: 0,
      meta,
    };
    mock.jobs.set(id, job);
    json(201, job);
    return;
  }
  const parts = path.split("/").filter(Boolean),
    job = mock.jobs.get(parts[1]);
  if (!job) {
    json(404, { error: "job_not_found" });
    return;
  }
  if (req.method === "DELETE") {
    job.state = "cancelled";
    json(200, { ok: true });
    return;
  }
  if (req.method === "PUT") {
    const index = Number(parts[3]);
    if (mock.dropChunk === index) {
      mock.dropChunk = null;
      json(500, { error: "server_error" });
      return;
    }
    if (index !== job.uploadedChunks) {
      json(409, { error: "chunk_order" });
      return;
    }
    job.uploadedChunks++;
    job.bytes += bytes.length;
    mock.uploads.push(bytes.length);
    json(200, job);
    return;
  }
  if (req.method === "POST" && parts[2] === "run") {
    job.state = "running";
    json(202, job);
    return;
  }
  if (job.state === "running" && !mock.hold) {
    job.state = mock.fail ? "failed" : "complete";
    job.segments = [
      { start: 0, end: 1.25, text: "Тест транспорта: учебная лекция." },
      { start: 1.25, end: 3, text: "Проверка временных меток." },
    ];
  }
  json(200, job);
}
try {
  for (const engine of ["chromium", "webkit"]) {
    mock = {
      calls: [],
      jobs: new Map(),
      uploads: [],
      hold: false,
      fail: false,
      dropChunk: null,
    };
    const browser = await (engine === "chromium"
      ? chromium.launch({ channel: "msedge" })
      : webkit.launch());
    try {
      const tab = await browser.newPage({
          viewport: { width: 1024, height: 900 },
          acceptDownloads: true,
        }),
        errors = [];
      tab.on("pageerror", (e) => errors.push(e.message));
      tab.on("dialog", (d) => d.accept());
      await tab.goto("http://127.0.0.1:" + server.address().port);
      await tab.evaluate(async () => {
        await ready;
        await Home.ready;
        data.books = [
          {
            id: "speech-book",
            name: "Лекция",
            paper: "grid",
            pages: [
              [
                {
                  tool: "pen",
                  color: "#222222",
                  width: 2,
                  points: [
                    { x: 20, y: 30 },
                    { x: 40, y: 35 },
                  ],
                },
              ],
            ],
          },
        ];
        data.selected = "speech-book";
        Home.open("speech-book");
        await save();
        const r = await LectureStore.create(book.id, book.name, "audio/mp4");
        await LectureStore.append(
          r,
          new Blob(["x".repeat(600000)], { type: "audio/mp4" }),
          3000,
        );
        await LectureStore.update(r, { state: "stopped" });
        await navigator.serviceWorker.ready;
      });
      await tab.locator("#openLecture").click();
      await tab.locator(".lecture-row").click();
      await tab.locator("#transcriptionDetails > summary").click();
      await tab.waitForFunction(
        () => !!LectureUI.selected && $("transcriptionText").value === "",
      );
      check(
        mock.calls.length === 0 &&
          (await tab.locator("#runTranscription").isDisabled()),
        engine +
          " selecting audio never sends audio or starts recognition automatically",
      );
      await tab.locator("#connectTranscription").click();
      await tab.waitForFunction(() => !$("transcriptionLogin").hidden);
      await tab.fill("#transcriptionPassword", "test-transcription-password");
      await tab.locator("#transcriptionLogin button").click();
      await tab.waitForFunction(() =>
        $("transcriptionStatus").textContent.includes("Сервис готов"),
      );
      check(
        (await tab.evaluate(
          () =>
            $("transcriptionPassword").value === "" &&
            $("runTranscription").disabled,
        )) && mock.uploads.length === 0,
        engine +
          " separate cookie login clears password and still requires explicit audio consent",
      );
      await tab.locator("#transcriptionConsent").check();
      await tab.locator("#runTranscription").click();
      await tab.waitForFunction(
        () =>
          $("transcriptionText").value.includes("Тест транспорта") &&
          !$("transcriptionText").disabled,
      );
      check(
        mock.uploads.length === 3 &&
          mock.uploads.every((n) => n <= 256 * 1024) &&
          mock.uploads.reduce((n, b) => n + b, 0) === 600000,
        engine +
          " uploads only bounded audio parts after consent and preserves real response timestamps",
      );
      check(
        await tab.evaluate(async () => {
          const r = LectureUI.selected,
            doc = await NotepadStore.read(TranscriptionData.key(r));
          return (
            doc.segments[1].start === 1.25 &&
            doc.text.includes("Тест транспорта") &&
            r.bytes === 600000 &&
            (await NotepadStore.asset(r.chunks[0].asset)).size > 0
          );
        }),
        engine +
          " transcript is stored separately and never deletes source audio",
      );
      await tab.fill("#transcriptionText", "Моя отредактированная расшифровка");
      await tab.locator("#saveTranscription").click();
      await tab.waitForFunction(() =>
        $("transcriptionStatus").textContent.includes("Текст сохранён"),
      );
      await tab.fill("#transcriptionSearch", "временных");
      check(
        (await tab.locator("#transcriptionSegments button").count()) === 1,
        engine + " source timestamps remain searchable after editing full text",
      );
      await tab.fill("#transcriptionText", "Отложено до завершения штриха");
      await tab.evaluate(() => {
        canvas.setPointerCapture = () => {};
        canvas.hasPointerCapture = () => false;
        const r = canvas.getBoundingClientRect();
        window.inkForTranscript = (type) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 41,
              pointerType: "pen",
              button: 0,
              buttons: type === "pointerup" ? 0 : 1,
              pressure: 0.5,
              clientX: r.left + 40,
              clientY: r.top + 60,
              bubbles: true,
              cancelable: true,
            }),
          );
        Editor.choose("pen");
        inkForTranscript("pointerdown");
      });
      await tab.waitForTimeout(3200);
      check(
        await tab.evaluate(
          async () =>
            !!drawing &&
            (await NotepadStore.read(TranscriptionData.key(LectureUI.selected)))
              .text !== "Отложено до завершения штриха",
        ),
        engine + " transcript autosave never starts during an active stroke",
      );
      await tab.evaluate(() => inkForTranscript("pointerup"));
      await tab.waitForFunction(
        async () =>
          (await NotepadStore.read(TranscriptionData.key(LectureUI.selected)))
            .text === "Отложено до завершения штриха",
      );
      check(
        true,
        engine +
          " deferred transcript autosave resumes automatically after pen lift",
      );
      await tab.locator("#undo").click();
      await tab.fill("#transcriptionText", "Моя отредактированная расшифровка");
      await tab.locator("#saveTranscription").click();
      await tab.waitForFunction(() =>
        $("transcriptionStatus").textContent.includes("Текст сохранён"),
      );
      await tab.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (text) => {
              window.copiedTranscript = text;
            },
          },
          configurable: true,
        });
      });
      await tab.locator("#copyTranscription").click();
      check(
        await tab.evaluate(
          () => copiedTranscript === "Моя отредактированная расшифровка",
        ),
        engine + " copy uses edited text",
      );
      for (const format of ["Text", "Srt"]) {
        const download = tab.waitForEvent("download");
        await tab.locator("#exportTranscript" + format).click();
        const file = await download;
        check(
          (await file.failure()) === null,
          engine +
            " exports transcript " +
            format +
            " through browser download",
        );
      }
      // An interrupted upload is resumed without retransmitting committed chunks.
      mock.dropChunk = 1;
      await tab.locator("#transcriptionConsent").check();
      await tab.locator("#runTranscription").click();
      await tab.waitForFunction(
        () =>
          !$("transcriptionText").disabled && !$("resumeTranscription").hidden,
      );
      const uploadsBefore = mock.uploads.length,
        jobsBefore = mock.jobs.size;
      await tab.reload();
      await tab.evaluate(async () => {
        await ready;
        await Home.ready;
        Home.open("speech-book");
      });
      await tab.locator("#openLecture").click();
      await tab.locator(".lecture-row").click();
      await tab.locator("#transcriptionDetails > summary").click();
      await tab.waitForFunction(() => !$("resumeTranscription").hidden);
      await tab.locator("#connectTranscription").click();
      await tab.waitForFunction(() =>
        $("transcriptionStatus").textContent.includes("Сервис готов"),
      );
      await tab.locator("#transcriptionConsent").check();
      await tab.locator("#resumeTranscription").click();
      await tab.waitForFunction(
        () =>
          $("transcriptionText").value.includes("Тест транспорта") &&
          !$("transcriptionText").disabled &&
          $("resumeTranscription").hidden,
      );
      check(
        mock.jobs.size === jobsBefore &&
          mock.uploads.length === uploadsBefore + 2,
        engine +
          " reload resumes pending upload using durable job ID and server chunk count",
      );
      const previous = await tab.inputValue("#transcriptionText");
      mock.fail = true;
      await tab.locator("#transcriptionConsent").check();
      await tab.locator("#runTranscription").click();
      await tab.waitForFunction(() =>
        $("transcriptionStatus").textContent.includes("не завершено"),
      );
      check(
        (await tab.inputValue("#transcriptionText")) === previous,
        engine +
          " model failure never replaces prior transcript with fake text",
      );
      await tab.locator("#cancelTranscription").click();
      await tab.waitForFunction(() => $("resumeTranscription").hidden);
      mock.fail = false;
      mock.hold = true;
      await tab.locator("#transcriptionConsent").check();
      await tab.locator("#runTranscription").click();
      await tab.waitForFunction(() =>
        $("transcriptionStatus").textContent.includes(
          "Распознавание на вашем компьютере",
        ),
      );
      await tab.locator("#cancelTranscription").click();
      await tab.waitForFunction(() => $("cancelTranscription").hidden);
      check(
        [...mock.jobs.values()].at(-1).state === "cancelled" &&
          (await tab.inputValue("#transcriptionText")) === previous,
        engine + " cancellation stops job and preserves text and audio",
      );
      await tab.evaluate(() => {
        window.actualTranscriptWrite = NotepadStore.writeRecord;
        NotepadStore.writeRecord = (key, ...args) =>
          key.startsWith("transcript/")
            ? Promise.reject(Error("quota"))
            : actualTranscriptWrite(key, ...args);
      });
      await tab.fill("#transcriptionText", "Текст после ошибки");
      await tab.locator("#saveTranscription").click();
      await tab.waitForFunction(() =>
        $("transcriptionStatus").textContent.includes("Ошибка сохранения"),
      );
      check(
        (await tab.inputValue("#transcriptionText")) === "Текст после ошибки",
        engine + " storage error retains editable transcript in memory",
      );
      await tab.evaluate(
        () => (NotepadStore.writeRecord = actualTranscriptWrite),
      );
      await tab.locator("#saveTranscription").click();
      await tab.waitForFunction(() =>
        $("transcriptionStatus").textContent.includes("Текст сохранён"),
      );
      await tab.evaluate(() => {
        window.actualLectureRemove = LectureStore.remove;
        LectureStore.remove = async () => {
          throw Error("storage failure");
        };
      });
      await tab.fill(
        "#transcriptionText",
        "Текст сохраняется даже при ошибке удаления",
      );
      await tab.locator("#deleteLecture").click();
      await tab.waitForFunction(() =>
        $("lectureStatus").textContent.includes("Не удалось удалить"),
      );
      check(
        (await tab.inputValue("#transcriptionText")) ===
          "Текст сохраняется даже при ошибке удаления" &&
          !(await tab.locator("#transcriptionText").isDisabled()),
        engine +
          " failed deletion retains unsaved transcript and restores its save controller",
      );
      await tab.evaluate(() => (LectureStore.remove = actualLectureRemove));
      await tab.fill("#transcriptionText", "Текст после ошибки");
      await tab.locator("#saveTranscription").click();
      await tab.waitForFunction(() =>
        $("transcriptionStatus").textContent.includes("Текст сохранён"),
      );
      await tab.setViewportSize({ width: 560, height: 800 });
      await tab.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const controlsBox = await tab.locator("#openLecture").boundingBox();
      check(
        controlsBox &&
          controlsBox.x >= 0 &&
          controlsBox.x + controlsBox.width <= 560 &&
          controlsBox.y + controlsBox.height <= 800,
        engine + " lecture entry remains accessible in Split View",
      );
      if (process.env.SCREENSHOT_DIR)
        await tab.screenshot({
          path:
            process.env.SCREENSHOT_DIR +
            "/" +
            engine +
            "-transcription-split.png",
        });
      if (engine === "chromium") await tab.context().setOffline(true);
      else {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
        serverClosed = true;
      }
      await tab.reload();
      await tab.evaluate(async () => {
        await ready;
        await Home.ready;
        Home.open("speech-book");
      });
      await tab.locator("#openLecture").click();
      await tab.locator(".lecture-row").click();
      await tab.locator("#transcriptionDetails > summary").click();
      await tab.waitForFunction(
        () => $("transcriptionText").value === "Текст после ошибки",
      );
      check(
        await tab.evaluate(
          async () =>
            LectureUI.selected.bytes === 600000 && book.pages[0].length === 1,
        ),
        engine + " edited transcript, audio and ink reopen together offline",
      );
      await tab.fill(
        "#transcriptionText",
        "Несохранённый текст перед удалением",
      );
      const key = await tab.evaluate(() =>
        TranscriptionData.key(LectureUI.selected),
      );
      await tab.locator("#deleteLecture").click();
      await tab.waitForFunction(() => $("lectureDetails").hidden);
      await tab.waitForTimeout(3300);
      check(
        await tab.evaluate(
          async (key) =>
            (await NotepadStore.read(key)) === undefined &&
            (await LectureStore.list(book.id)).length === 0 &&
            book.pages[0].length === 1,
          key,
        ),
        engine +
          " deleting audio atomically removes transcript and cancels delayed writes without resurrecting data",
      );
      check(
        errors.length === 0,
        engine + " transcription UI has no script errors: " + errors.join(";"),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  if (!serverClosed) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
