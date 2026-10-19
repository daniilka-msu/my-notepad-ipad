const LectureRecorder = (() => {
  function create(onState = () => {}) {
    let recorder = null,
      stream = null,
      record = null,
      queue = [],
      saving = false,
      stopping = false,
      error = null,
      base = 0,
      started = null,
      timer = null,
      stopPromise = null,
      stopResolve,
      starting = false;
    const elapsed = () =>
      base + (started !== null ? performance.now() - started : 0);
    function notify(message) {
      onState({
        record,
        state: recorder?.state || "inactive",
        pending: queue.reduce((n, p) => n + p.blob.size, 0),
        error,
        message,
        elapsed: elapsed(),
      });
    }
    function clockPause() {
      if (started !== null) {
        base = elapsed();
        started = null;
      }
    }
    async function drain() {
      if (saving) return;
      saving = true;
      while (queue.length) {
        const item = queue[0];
        try {
          await LectureStore.append(record, item.blob, item.end, item);
          queue.shift();
          error = null;
        } catch (e) {
          error = e;
          pause();
          notify(
            "Ошибка сохранения аудио. Части остаются в памяти; освободите место и повторите.",
          );
          saving = false;
          return;
        }
      }
      saving = false;
      if (stopping) {
        try {
          await LectureStore.update(record, {
            state: record.interruption ? "interrupted" : "stopped",
            durationMs: base,
          });
          stopping = false;
          clearInterval(timer);
          notify("Запись сохранена на устройстве");
          stopResolve?.();
        } catch (e) {
          error = e;
          notify(
            "Не удалось подтвердить сохранение записи. Повторите попытку.",
          );
        }
      } else notify();
    }
    async function start(bookId, bookName) {
      if (starting || recorder || stopping || queue.length)
        throw Error("Сначала завершите предыдущую запись и сохраните её");
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error(
          "Этот браузер не поддерживает запись. Нужен Safari с MediaRecorder и HTTPS.",
        );
      const usage = await navigator.storage?.estimate?.();
      if (usage?.quota - usage?.usage < 20 * 1024 * 1024)
        throw Error("Недостаточно свободного места. Освободите минимум 20 МБ.");
      error = null;
      base = 0;
      queue = [];
      stopPromise = null;
      starting = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        const mime = [
          "audio/mp4;codecs=mp4a.40.2",
          "audio/mp4",
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
        ].find((m) => MediaRecorder.isTypeSupported?.(m));
        recorder = new MediaRecorder(
          stream,
          mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : {},
        );
        record = await LectureStore.create(
          bookId,
          bookName,
          recorder.mimeType || mime || "audio/mp4",
        );
        recorder.ondataavailable = (e) => {
          if (!e.data?.size) return;
          queue.push({ blob: e.data, end: elapsed() });
          if (queue.reduce((n, p) => n + p.blob.size, 0) > 4 * 1024 * 1024) {
            pause();
            notify("Сохранение не успевает за записью. Запись приостановлена.");
          }
          drain();
        };
        recorder.onerror = (e) => {
          error = e.error || Error("Ошибка микрофона");
          record.interruption = error.message;
          stop().catch(() => {});
          notify("Микрофон недоступен; сохраняются полученные части.");
        };
        recorder.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;
          recorder = null;
          stopping = true;
          drain();
          notify();
        };
        for (const track of stream.getAudioTracks())
          track.addEventListener("ended", () => {
            if (recorder) {
              record.interruption = "Микрофон отключён";
              notify("Микрофон отключён; сохраняются полученные части.");
              stop().catch(() => {});
            }
          });
        started = performance.now();
        recorder.start(5000);
        let estimated = performance.now();
        timer = setInterval(() => {
          notify();
          if (performance.now() - estimated > 30000) {
            estimated = performance.now();
            navigator.storage
              ?.estimate?.()
              .then((usage) => {
                if (
                  usage.quota - usage.usage < 20 * 1024 * 1024 &&
                  recorder?.state === "recording"
                ) {
                  pause();
                  notify(
                    "Мало свободного места. Запись приостановлена; экспортируйте аудио и освободите хранилище.",
                  );
                }
              })
              .catch(() => {});
          }
        }, 250);
        notify();
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        recorder = null;
        throw e;
      } finally {
        starting = false;
      }
    }
    function pause() {
      if (recorder?.state !== "recording") return;
      clockPause();
      recorder.requestData();
      recorder.pause();
      notify("Запись на паузе");
    }
    function resume() {
      if (
        recorder?.state !== "paused" ||
        error ||
        queue.reduce((n, p) => n + p.blob.size, 0) > 4 * 1024 * 1024
      )
        return;
      started = performance.now();
      recorder.resume();
      notify();
    }
    function stop() {
      if (stopPromise) return stopPromise;
      if (!recorder) return Promise.resolve();
      stopPromise = new Promise((resolve) => (stopResolve = resolve));
      clockPause();
      stopping = true;
      if (recorder.state === "inactive") {
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        recorder = null;
        drain();
      } else recorder.stop();
      return stopPromise;
    }
    function retry() {
      error = null;
      drain();
    }
    function mark(mark) {
      if (recorder?.state !== "recording") return;
      record.marks.push({ ...mark, timeMs: elapsed() });
    }
    return {
      start,
      pause,
      resume,
      stop,
      retry,
      mark,
      get active() {
        return !!recorder || stopping || queue.length > 0;
      },
      get record() {
        return record;
      },
      get state() {
        return recorder?.state || "inactive";
      },
    };
  }
  return { create };
})();
