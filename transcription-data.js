const TranscriptionData = (() => {
  const key = (record) =>
    "transcript/" + encodeURIComponent(record.bookId) + "/" + record.id;
  function result(record, segments) {
    if (!Array.isArray(segments) || segments.length > 50000)
      throw Error("Некорректная расшифровка");
    let length = 0;
    const clean = segments.map((s) => {
      if (
        !s ||
        !Number.isFinite(s.start) ||
        !Number.isFinite(s.end) ||
        s.start < 0 ||
        s.end < s.start ||
        s.end > 14400 ||
        typeof s.text !== "string"
      )
        throw Error("Некорректные временные метки");
      length += s.text.length;
      if (length > 1000000) throw Error("Расшифровка слишком большая");
      return { start: s.start, end: s.end, text: s.text };
    });
    return {
      version: 1,
      audioId: record.id,
      bookId: record.bookId,
      source: "local-faster-whisper",
      text: clean.map((s) => s.text.trim()).join("\n"),
      segments: clean,
      edited: false,
      updatedAt: Date.now(),
    };
  }
  function timestamp(seconds) {
    const ms = Math.max(0, Math.round(seconds * 1000)),
      s = Math.floor(ms / 1000);
    return (
      [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
        .map((n) => String(n).padStart(2, "0"))
        .join(":") +
      "," +
      String(ms % 1000).padStart(3, "0")
    );
  }
  function srt(doc) {
    return (
      doc.segments
        .map(
          (s, i) =>
            i +
            1 +
            "\n" +
            timestamp(s.start) +
            " --> " +
            timestamp(s.end) +
            "\n" +
            s.text.trim(),
        )
        .join("\n\n") + "\n"
    );
  }
  return { key, result, srt };
})();
