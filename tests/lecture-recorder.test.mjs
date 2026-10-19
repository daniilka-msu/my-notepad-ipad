import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const tick = () => new Promise((r) => setTimeout(r, 20));
function setup() {
  let now = 0,
    micCalls = 0,
    stopped = 0,
    native,
    fail = false,
    denied = false,
    ended;
  const states = [];
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      native = this;
      this.state = "inactive";
      this.mimeType = "audio/mp4";
    }
    start() {
      this.state = "recording";
    }
    pause() {
      this.state = "paused";
    }
    resume() {
      this.state = "recording";
    }
    requestData() {}
    emit(blob) {
      this.ondataavailable({ data: blob });
    }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => this.onstop());
    }
  }
  const context = vm.createContext({
    Blob,
    MediaRecorder: Recorder,
    performance: { now: () => now },
    setInterval: () => 1,
    clearInterval() {},
    navigator: {
      storage: { estimate: async () => ({ quota: 1e9, usage: 0 }) },
      mediaDevices: {
        getUserMedia: async () => {
          micCalls++;
          if (denied) throw Error("permission denied");
          return {
            getTracks: () => [
              {
                stop() {
                  stopped++;
                },
              },
            ],
            getAudioTracks: () => [
              {
                addEventListener(type, fn) {
                  ended = fn;
                },
              },
            ],
          };
        },
      },
    },
    LectureStore: {
      async create() {
        return { bookId: "book", bytes: 0, chunks: [], marks: [] };
      },
      async append(record, blob) {
        if (fail) throw Error("quota");
        record.bytes += blob.size;
        record.chunks.push(blob.size);
      },
      async update(record, changes) {
        Object.assign(record, changes);
      },
    },
  });
  context.window = context;
  vm.runInContext(
    readFileSync(new URL("../lecture-recorder.js", import.meta.url), "utf8") +
      ";globalThis.rec=LectureRecorder.create(s=>states.push(s))",
    vm.createContext(Object.assign(context, { states })),
  );
  return {
    rec: context.rec,
    states,
    get native() {
      return native;
    },
    get micCalls() {
      return micCalls;
    },
    get stopped() {
      return stopped;
    },
    set time(n) {
      now = n;
    },
    set fail(v) {
      fail = v;
    },
    set denied(v) {
      denied = v;
    },
    endTrack() {
      ended();
    },
  };
}
test("recording starts only on explicit call and pause time is excluded", async () => {
  const s = setup();
  assert.equal(s.micCalls, 0);
  await s.rec.start("book", "Book");
  s.time = 1000;
  s.rec.pause();
  s.time = 5000;
  s.rec.resume();
  s.time = 6000;
  await s.rec.stop();
  assert.equal(s.rec.record.durationMs, 2000);
  assert.equal(s.stopped, 1);
  assert.equal(s.rec.active, false);
});
test("quota failure retains pending audio and retry preserves it", async () => {
  const s = setup();
  await s.rec.start("book", "Book");
  s.fail = true;
  s.native.emit(new Blob(["audio"]));
  await tick();
  assert.equal(s.rec.state, "paused");
  assert.equal(s.states.at(-1).pending, 5);
  assert.ok(s.states.at(-1).error);
  await assert.rejects(s.rec.start("book", "Book"));
  s.fail = false;
  s.rec.retry();
  await tick();
  await s.rec.stop();
  assert.equal(s.rec.record.bytes, 5);
  assert.equal(s.rec.active, false);
});
test("permission denial does not create recording or claim success", async () => {
  const s = setup();
  s.denied = true;
  await assert.rejects(s.rec.start("book", "Book"), /permission denied/);
  assert.equal(s.rec.record, null);
  assert.equal(s.rec.active, false);
});
test("lost microphone stops tracks and marks interruption", async () => {
  const s = setup();
  await s.rec.start("book", "Book");
  s.native.emit(new Blob(["audio"]));
  await tick();
  s.endTrack();
  await tick();
  assert.equal(s.rec.record.state, "interrupted");
  assert.equal(s.rec.record.bytes, 5);
  assert.equal(s.stopped, 1);
});
