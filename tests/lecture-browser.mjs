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
let audioFixture = null,
  serverClosed = false;
try {
  for (const engine of ["chromium", "webkit"]) {
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
      await tab.addInitScript(() => {
        window.micCalls = 0;
        if (!navigator.mediaDevices)
          Object.defineProperty(navigator, "mediaDevices", {
            value: {},
            configurable: true,
          });
        navigator.mediaDevices.getUserMedia = async () => {
          micCalls++;
          throw new DOMException("Denied", "NotAllowedError");
        };
      });
      await tab.goto("http://127.0.0.1:" + server.address().port);
      await tab.evaluate(async () => {
        await ready;
        await Home.ready;
        data.books = [
          {
            id: "lecture-test",
            name: "Тест лекции",
            paper: "grid",
            pages: [[]],
          },
        ];
        data.selected = "lecture-test";
        Home.open("lecture-test");
        await save();
        await navigator.serviceWorker.ready;
      });
      check(
        await tab.evaluate(() => micCalls === 0),
        engine + " never requests microphone on application load",
      );
      await tab.locator("#openLecture").click();
      const nativeRecorder = await tab.evaluate(
        () => typeof MediaRecorder === "function",
      );
      if (!nativeRecorder) {
        check(
          await tab.evaluate(
            () =>
              $("startLecture").disabled &&
              $("lectureStatus").textContent.includes("недоступна"),
          ),
          engine + " unavailable native recorder has explicit disabled state",
        );
        await tab.evaluate((bytes) => {
          window.fixtureBytes = new Uint8Array(bytes);
          window.MediaRecorder = class {
            static isTypeSupported(m) {
              return m === "audio/mp4";
            }
            constructor(stream) {
              this.state = "inactive";
              this.mimeType = "audio/mp4";
              this.offset = 0;
            }
            emit(size) {
              const part = fixtureBytes.slice(this.offset, this.offset + size);
              this.offset += part.length;
              if (part.length)
                this.ondataavailable?.({
                  data: new Blob([part], { type: this.mimeType }),
                });
            }
            start() {
              this.state = "recording";
              this.timer = setTimeout(
                () => this.emit(Math.ceil(fixtureBytes.length / 2)),
                5000,
              );
            }
            requestData() {
              setTimeout(
                () => this.emit(Math.ceil(fixtureBytes.length / 4)),
                0,
              );
            }
            pause() {
              this.state = "paused";
            }
            resume() {
              this.state = "recording";
            }
            stop() {
              this.state = "inactive";
              clearTimeout(this.timer);
              setTimeout(() => {
                this.emit(fixtureBytes.length);
                this.onstop?.();
              }, 0);
            }
          };
          $("startLecture").disabled = false;
          window.mockRecorder = true;
        }, audioFixture);
      }
      await tab.evaluate(() => {
        if (!navigator.storage)
          Object.defineProperty(navigator, "storage", {
            value: {},
            configurable: true,
          });
        navigator.storage.estimate = async () => ({
          quota: 10 * 1024 * 1024,
          usage: 0,
        });
      });
      await tab.locator("#startLecture").click();
      await tab.waitForFunction(() =>
        $("lectureStatus").textContent.includes("Недостаточно"),
      );
      check(
        await tab.evaluate(() => micCalls === 0),
        engine + " low-storage check prevents opening microphone",
      );
      await tab.evaluate(() => {
        navigator.storage.estimate = async () => ({
          quota: 1024 * 1024 * 1024,
          usage: 0,
        });
      });
      await tab.locator("#startLecture").click();
      await tab.waitForFunction(() =>
        $("lectureStatus").textContent.includes("Нет разрешения"),
      );
      check(
        await tab.evaluate(
          async () =>
            micCalls === 1 && (await LectureStore.list(book.id)).length === 0,
        ),
        engine +
          " denied microphone leaves no empty recording and offers clear retry",
      );
      await tab.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          micCalls++;
          if (window.mockRecorder)
            return {
              getTracks: () => [{ stop() {} }],
              getAudioTracks: () => [{ addEventListener() {} }],
            };
          const audio = new AudioContext(),
            osc = audio.createOscillator(),
            dest = audio.createMediaStreamDestination();
          osc.frequency.value = 440;
          osc.connect(dest);
          osc.start();
          await audio.resume();
          for (const track of dest.stream.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => {
              stop();
              audio.close();
            };
          }
          return dest.stream;
        };
      });
      await tab.locator("#startLecture").click();
      await tab.waitForFunction(() => LectureUI.recorder.state === "recording");
      await tab.evaluate(() => {
        window.currentRecord = LectureUI.recorder.record;
        window.writeDuringStroke = false;
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
          if (this.name === "library" && key === "current" && drawing)
            writeDuringStroke = true;
          return put.call(this, value, key);
        };
        canvas.setPointerCapture = () => {};
        canvas.hasPointerCapture = () => false;
        const r = canvas.getBoundingClientRect();
        window.audioInk = (type, x) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 9,
              pointerType: "pen",
              pressure: 0.5,
              button: 0,
              buttons: type === "pointerup" ? 0 : 1,
              clientX: r.left + x,
              clientY: r.top + 100,
              bubbles: true,
              cancelable: true,
            }),
          );
        Editor.choose("pen");
        audioInk("pointerdown", 50);
        audioInk("pointermove", 60);
      });
      for (let i = 0; i < 55; i++) {
        await tab.evaluate((x) => audioInk("pointermove", x), 60.2 + i * 0.2);
        await tab.waitForTimeout(100);
      }
      check(
        await tab.evaluate(
          () =>
            currentRecord.chunks.length > 0 &&
            drawing?.rawPoints.length >= 50 &&
            !writeDuringStroke,
        ),
        engine +
          (nativeRecorder
            ? " native MediaRecorder"
            : " mock recorder with real MP4 fixture") +
          " persists audio parts while ink stays active without document autosave",
      );
      await tab.evaluate(() => audioInk("pointerup", 65));
      await tab.fill("#lectureBookmarkText", "Важное объяснение");
      await tab.locator("#lectureBookmark").click();
      await tab.locator("#pauseLecture").click();
      const paused = await tab.evaluate(() => $("lectureTimer").textContent);
      await tab.waitForTimeout(1100);
      check(
        await tab.evaluate(
          (text) =>
            LectureUI.recorder.state === "paused" &&
            $("lectureTimer").textContent === text,
          paused,
        ),
        engine + " pause excludes paused time and keeps microphone session",
      );
      await tab.evaluate(() => {
        audioInk("pointerdown", 80);
        audioInk("pointermove", 90);
        audioInk("pointerup", 95);
        window.pausedNote = book.pages[0].at(-1);
        window.marksBeforeResume = LectureUI.recorder.record.marks.length;
      });
      await tab.locator("#resumeLecture").click();
      await tab.evaluate(() => render());
      check(
        await tab.evaluate(
          () =>
            !pausedNote.lectureActionId &&
            LectureUI.recorder.record.marks.length === marksBeforeResume,
        ),
        engine +
          " writing during pause never gains a false timestamp after resume",
      );
      await tab.waitForTimeout(500);
      await tab.locator("#stopLecture").click();
      await tab.waitForFunction(() => !LectureUI.recorder.active);
      check(
        await tab.evaluate(async () => {
          const r = (await LectureStore.list(book.id))[0];
          await LectureStore.loadMarks(r);
          return (
            r.state === "stopped" &&
            r.bytes > 0 &&
            r.marks.some((m) => m.label === "Важное объяснение") &&
            r.marks.some((m) => m.actionId) &&
            book.pages[0][0].lectureActionId
          );
        }),
        engine +
          " stopped audio and handwritten/bookmark time references are durably saved",
      );
      await tab.locator(".lecture-row").first().click();
      await tab.waitForFunction(() => !!LectureUI.selected);
      const canPlay = await tab.evaluate(
        () =>
          !!$("lectureAudio").canPlayType(
            LectureUI.selected.mime.split(";")[0],
          ),
      );
      if (canPlay)
        await tab.waitForFunction(
          () => $("lectureAudio").readyState >= 1 || !!$("lectureAudio").error,
        );
      const playerWorks = await tab.evaluate(
        () => $("lectureAudio").readyState >= 1,
      );
      check(
        await tab.evaluate(
          (supported) =>
            !$("lectureDetails").hidden &&
            (supported
              ? $("lectureAudio").readyState >= 1
              : $("lectureStatus").textContent.includes("не поддерживает") ||
                $("lectureStatus").textContent.includes("не смог")),
          playerWorks,
        ),
        engine +
          (playerWorks
            ? " real recorded codec loads through local streaming player"
            : " unsupported player codec has a clear export fallback"),
      );
      if (nativeRecorder)
        audioFixture = await tab.evaluate(async () =>
          Array.from(
            new Uint8Array(
              await (
                await fetch(LectureStore.url(LectureUI.selected))
              ).arrayBuffer(),
            ),
          ),
        );
      check(
        await tab.evaluate(async () => {
          const r = LectureUI.selected,
            url = LectureStore.url(r),
            full = await fetch(url),
            bytes = new Uint8Array(await full.arrayBuffer()),
            partial = await fetch(url, { headers: { Range: "bytes=0-15" } }),
            part = new Uint8Array(await partial.arrayBuffer());
          const suffix = await fetch(url, { headers: { Range: "bytes=-16" } }),
            bad = await fetch(url, { headers: { Range: "bytes=9999999999-" } });
          return (
            bytes.length === r.bytes &&
            partial.status === 206 &&
            part.length === 16 &&
            part.every((b, i) => b === bytes[i]) &&
            (await suffix.arrayBuffer()).byteLength === 16 &&
            bad.status === 416
          );
        }),
        engine +
          " local audio streaming supports full files, byte ranges, suffix seeking and invalid ranges",
      );
      await tab.fill("#lectureName", "Проверенная лекция");
      await tab.locator("#renameLecture").click();
      await tab.waitForFunction(
        () => LectureUI.selected?.name === "Проверенная лекция",
      );
      const download = tab.waitForEvent("download");
      await tab.locator("#exportLecture").click();
      const file = await download;
      const failure = await file.failure();
      check(
        failure === null,
        engine + " audio exports through real browser download",
      );
      const expected = await tab.evaluate(async () => {
        await save();
        await LectureStore.update(LectureUI.selected, { state: "recording" });
        return {
          id: LectureUI.selected.id,
          bytes: LectureUI.selected.bytes,
          ink: JSON.stringify(book.pages),
        };
      });
      await tab.reload();
      await tab.evaluate(async () => {
        await ready;
        await Home.ready;
        Home.open("lecture-test");
      });
      await tab.locator("#openLecture").click();
      await tab.locator(".lecture-row").first().click();
      await tab.waitForFunction(() => !!LectureUI.selected);
      check(
        await tab.evaluate(
          (e) =>
            micCalls === 0 &&
            LectureUI.selected.id === e.id &&
            LectureUI.selected.bytes === e.bytes &&
            JSON.stringify(book.pages) === e.ink,
          expected,
        ),
        engine +
          " audio and associated ink reopen without asking for microphone",
      );
      if (engine === "chromium") await tab.context().setOffline(true);
      else {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
        serverClosed = true;
      }
      check(
        await tab.evaluate(async () => {
          const response = await fetch(LectureStore.url(LectureUI.selected), {
            headers: { Range: "bytes=0-15" },
          });
          return (
            response.status === 206 &&
            (await response.arrayBuffer()).byteLength === 16
          );
        }),
        engine +
          " saved audio streams offline and unfinished-session manifest preserves existing parts",
      );
      const assetIds = await tab.evaluate(() => [
        ...LectureUI.selected.chunks.map((c) => c.asset),
        ...(LectureUI.selected.markAssets || []),
      ]);
      tab.once("dialog", (d) => d.accept());
      await tab.locator("#deleteLecture").click();
      await tab.waitForFunction(() => $("lectureDetails").hidden);
      check(
        await tab.evaluate(
          async (ids) =>
            (await LectureStore.list(book.id)).length === 0 &&
            (await Promise.all(ids.map((id) => NotepadStore.asset(id)))).every(
              (v) => v === undefined,
            ),
          assetIds,
        ),
        engine +
          " deletion removes manifest and all audio parts without deleting notes",
      );
      check(
        errors.length === 0,
        engine + " lecture workflow has no script errors: " + errors.join(";"),
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
