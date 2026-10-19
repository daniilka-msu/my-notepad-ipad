// Local audio is streamed from IndexedDB. It never passes through a network server.
(() => {
  const base = new URL("./__lecture_audio/", self.location.href).pathname;
  const request = (req) =>
    new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  async function serve(req, url) {
    let db;
    try {
      const id = decodeURIComponent(url.pathname.slice(base.length)),
        bookId = url.searchParams.get("book");
      if (!bookId || !/^[-a-zA-Z0-9_.]{1,100}$/.test(id))
        return new Response("Неверный адрес", { status: 400 });
      db = await request(indexedDB.open("my-notepad", 1));
      const record = await request(
        db
          .transaction("library")
          .objectStore("library")
          .get("lecture/" + encodeURIComponent(bookId) + "/" + id),
      );
      if (!record || !record.bytes) {
        db.close();
        return new Response("Нет сохранённого аудио", { status: 404 });
      }
      let start = 0,
        end = record.bytes - 1;
      const range = req.headers.get("Range");
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) throw Error("range");
        if (!match[1]) start = Math.max(0, record.bytes - Number(match[2]));
        else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        }
        if (!Number.isSafeInteger(start) || start > end || end >= record.bytes)
          throw Error("range");
      }
      const headers = {
        "Content-Type": record.mime,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };
      if (range)
        headers["Content-Range"] = `bytes ${start}-${end}/${record.bytes}`;
      if (url.searchParams.has("download")) {
        const ext = record.mime.includes("mp4")
          ? "m4a"
          : record.mime.includes("ogg")
            ? "ogg"
            : "webm";
        headers["Content-Disposition"] =
          "attachment; filename=lecture." +
          ext +
          "; filename*=UTF-8''" +
          encodeURIComponent(record.name + "." + ext);
      }
      if (req.method === "HEAD") {
        db.close();
        return new Response(null, { status: range ? 206 : 200, headers });
      }
      let index = 0,
        offset = 0,
        cancelled = false;
      const stream = new ReadableStream({
        async pull(controller) {
          if (cancelled) return;
          while (index < record.chunks.length) {
            const chunk = record.chunks[index++],
              chunkStart = offset;
            offset += chunk.bytes;
            if (offset <= start) continue;
            if (chunkStart > end) break;
            try {
              const value = await request(
                db.transaction("assets").objectStore("assets").get(chunk.asset),
              );
              const bytes =
                value?.notepadAsset === 1
                  ? value.bytes
                  : value instanceof Blob
                    ? await value.arrayBuffer()
                    : null;
              if (!bytes) throw Error("Аудиочасть отсутствует");
              if (cancelled) return;
              controller.enqueue(
                new Uint8Array(
                  bytes,
                  Math.max(0, start - chunkStart),
                  Math.min(offset - 1, end) - Math.max(chunkStart, start) + 1,
                ),
              );
              return;
            } catch (error) {
              controller.error(error);
              db.close();
              return;
            }
          }
          controller.close();
          db.close();
        },
        cancel() {
          cancelled = true;
          db.close();
        },
      });
      return new Response(stream, { status: range ? 206 : 200, headers });
    } catch (error) {
      db?.close();
      return new Response("Аудио недоступно", {
        status: error.message === "range" ? 416 : 500,
      });
    }
  }
  self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (
      url.origin === self.location.origin &&
      url.pathname.startsWith(base) &&
      ["GET", "HEAD"].includes(event.request.method)
    )
      event.respondWith(serve(event.request, url));
  });
})();
