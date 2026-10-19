import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const c = vm.createContext({});
vm.runInContext(
  readFileSync(new URL("../transcription-data.js", import.meta.url), "utf8") +
    ";globalThis.data=TranscriptionData",
  c,
);
test("recognition preserves real timestamps and editable text", () => {
  const r = c.data.result({ id: "audio", bookId: "book" }, [
    { start: 1.25, end: 3.5, text: " Русский текст " },
  ]);
  assert.equal(r.text, "Русский текст");
  assert.equal(r.segments[0].start, 1.25);
  assert.equal(r.source, "local-faster-whisper");
  assert.equal(r.audioId, "audio");
});
test("invalid timestamps and unbounded output are rejected", () => {
  for (const entry of [
    { start: NaN, end: 1, text: "x" },
    { start: 1, end: 0, text: "x" },
    { start: 0, end: 15000, text: "x" },
    { start: 0, end: 1, text: "x".repeat(1000001) },
  ])
    assert.throws(() => c.data.result({ id: "x", bookId: "b" }, [entry]));
});
test("SRT contains source times and does not invent edited alignment", () => {
  const r = c.data.result({ id: "a", bookId: "b" }, [
    { start: 1.25, end: 62.5, text: "Исходный текст" },
  ]);
  r.text = "Редактируемый текст";
  const srt = c.data.srt(r);
  assert.match(srt, /00:00:01,250 --> 00:01:02,500/);
  assert.match(srt, /Исходный текст/);
  assert.doesNotMatch(srt, /Редактируемый/);
});
test("storage keys keep transcripts separate from audio and notebook", () => {
  assert.equal(
    c.data.key({ id: "id", bookId: "book/a" }),
    "transcript/book%2Fa/id",
  );
});
