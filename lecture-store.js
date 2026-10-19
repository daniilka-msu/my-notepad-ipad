const LectureStore = (() => {
  const prefix = (bookId) => "lecture/" + encodeURIComponent(bookId) + "/";
  const key = (record) => prefix(record.bookId) + record.id;
  const queues = new WeakMap();
  function serial(record, operation) {
    const next = (queues.get(record) || Promise.resolve()).then(operation);
    queues.set(
      record,
      next.catch(() => {}),
    );
    return next;
  }
  async function list(bookId) {
    return (await NotepadStore.records(prefix(bookId))).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }
  async function create(bookId, bookName, mime) {
    const record = {
      version: 1,
      id: uid(),
      bookId,
      bookName,
      name: "Лекция " + new Date().toLocaleString("ru-RU"),
      createdAt: Date.now(),
      state: "recording",
      mime,
      bytes: 0,
      durationMs: 0,
      chunks: [],
      marks: [],
      markAssets: [],
      storedNotes: 0,
    };
    await NotepadStore.writeRecord(key(record), record);
    return record;
  }
  async function persist(record, changes, assets = []) {
    const next = { ...record, ...changes },
      allMarks = next.marks,
      notes = allMarks.filter((m) => m.actionId),
      markAssets = [...(next.markAssets || [])];
    for (let i = next.storedNotes || 0; i < notes.length; i += 256) {
      const asset = "lecture-marks-" + record.id + "-" + markAssets.length;
      assets.push([
        asset,
        new Blob([JSON.stringify(notes.slice(i, i + 256))], {
          type: "application/json",
        }),
      ]);
      markAssets.push(asset);
    }
    const manifest = {
      ...next,
      marks: allMarks.filter((m) => !m.actionId),
      markAssets,
      storedNotes: Math.max(next.storedNotes || 0, notes.length),
    };
    await NotepadStore.writeRecord(key(record), manifest, assets);
    Object.assign(record, manifest);
    record.marks = allMarks;
  }
  async function loadMarks(record) {
    const manual = record.marks.filter((m) => !m.actionId),
      notes = [];
    for (const id of record.markAssets || []) {
      const blob = await NotepadStore.asset(id);
      if (!blob) throw Error("Временные привязки недоступны");
      notes.push(...JSON.parse(await blob.text()));
    }
    record.marks = [...manual, ...notes];
    return record;
  }
  function append(record, blob, durationMs, progress = { offset: 0 }) {
    return serial(record, async () => {
      for (
        let offset = progress.offset || 0;
        offset < blob.size;
        offset += 256 * 1024
      ) {
        const part = blob.slice(
            offset,
            offset + 256 * 1024,
            blob.type || record.mime,
          ),
          asset = "lecture-" + record.id + "-" + record.chunks.length;
        const next = {
          ...record,
          mime: blob.type || record.mime,
          bytes: record.bytes + part.size,
          durationMs,
          chunks: [...record.chunks, { asset, bytes: part.size }],
        };
        await persist(record, next, [[asset, part]]);
        progress.offset = offset + part.size;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
  }
  function update(record, changes) {
    return serial(record, async () => {
      const next = { ...record, ...changes };
      await persist(record, next);
    });
  }
  async function remove(record) {
    await NotepadStore.writeRecord(
      key(record),
      null,
      [],
      [...record.chunks.map((c) => c.asset), ...(record.markAssets || [])],
    );
  }
  function url(record, download = false) {
    return (
      "./__lecture_audio/" +
      encodeURIComponent(record.id) +
      "?book=" +
      encodeURIComponent(record.bookId) +
      (download ? "&download=1" : "")
    );
  }
  return { list, create, append, update, remove, url, loadMarks };
})();
