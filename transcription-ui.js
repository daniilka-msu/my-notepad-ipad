(() => {
  const slot = $("lectureTranscriptSlot");
  slot.innerHTML =
    '<details id="transcriptionDetails"><summary>Расшифровка аудио</summary><p class="hint">Распознавание выполняет отдельный сервис на вашем компьютере. По умолчанию он не подключён. Аудио остаётся на устройстве, пока вы явно не разрешите передачу.</p><button id="connectTranscription">Проверить сервис</button><button id="logoutTranscription" hidden>Выйти из сервиса</button><form id="transcriptionLogin" hidden><label>Отдельный пароль сервиса <input id="transcriptionPassword" type="password" autocomplete="current-password" maxlength="256"></label><button>Войти</button></form><p><a href="https://github.com/daniilka-msu/my-notepad-ipad/blob/main/transcription/README.md" target="_blank" rel="noopener noreferrer">Настройка локального распознавания</a></p><label><input id="transcriptionConsent" type="checkbox"> Разрешаю передать эту запись на мой сервер этого сайта для локального распознавания. Сторонние API не используются.</label><div class="lecture-controls"><button id="runTranscription" disabled>Расшифровать</button><button id="resumeTranscription" hidden>Продолжить задание</button><button id="cancelTranscription" hidden>Отменить</button></div><p id="transcriptionStatus" role="status">Сервис не подключён. Сохранённый текст доступен офлайн.</p><label>Текст расшифровки<textarea id="transcriptionText" rows="6" maxlength="1000000" placeholder="Результат распознавания или ваш собственный текст"></textarea></label><div class="lecture-controls"><button id="saveTranscription">Сохранить текст</button><button id="copyTranscription">Копировать</button><button id="exportTranscriptText">TXT</button><button id="exportTranscriptSrt">SRT — исходные таймкоды</button></div><label>Поиск <input id="transcriptionSearch" type="search" placeholder="Найти в тексте и исходных сегментах"></label><p id="transcriptionMatches" class="hint"></p><div id="transcriptionSegments"></div></details>';
  const contexts = new Map();
  let active = null,
    connected = false,
    busy = null,
    selection = 0;
  const status = (text) => ($("transcriptionStatus").textContent = text);
  const messages = {
    unauthorized: "Нужен вход в отдельный сервис распознавания.",
    model_not_configured:
      "Модель не установлена на сервере. Выполните инструкцию настройки.",
    busy: "Сервис уже обрабатывает другую запись. Дождитесь завершения или отмените её.",
    job_limited: "Достигнут локальный лимит: 6 запусков в час.",
    login_limited: "Слишком много попыток входа. Повторите через 15 минут.",
    too_large: "Запись превышает ограничение сервиса.",
    job_not_found:
      "Задание не найдено: возможно, сервис был перезапущен. Исходное аудио сохранено на устройстве.",
    transcription_failed:
      "Распознавание не завершено. Проверьте модель, формат аудио и память сервера. Исходное аудио не удалено.",
  };
  async function api(path, options = {}) {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 20000),
      parent = options.signal;
    const cancel = () => abort.abort();
    parent?.addEventListener("abort", cancel, { once: true });
    if (parent?.aborted) abort.abort();
    try {
      const res = await fetch("/api/transcription" + path, {
        credentials: "same-origin",
        ...options,
        signal: abort.signal,
      });
      const value = await res.json().catch(() => ({ error: "not_found" }));
      if (!res.ok) {
        if (res.status === 401) {
          connected = false;
          $("transcriptionLogin").hidden = false;
          controls();
        }
        throw Error(
          messages[value.error] ||
            "Сервис распознавания недоступен. Настройте отдельный сервер по инструкции.",
        );
      }
      return value;
    } catch (error) {
      if (error.name === "AbortError" && !parent?.aborted)
        throw Error(
          "Сервис не ответил вовремя. Задание можно продолжить после восстановления соединения.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
      parent?.removeEventListener("abort", cancel);
    }
  }
  function controls() {
    $("runTranscription").disabled =
      !active ||
      !active.record.bytes ||
      !connected ||
      !!busy ||
      !$("transcriptionConsent").checked;
    $("cancelTranscription").hidden = !busy && !active?.doc.pendingJob;
    $("logoutTranscription").hidden = !connected;
    $("logoutTranscription").disabled = !!busy;
    $("transcriptionText").disabled =
      !!active?.deleting || busy?.context === active;
    $("resumeTranscription").hidden = !active?.doc.pendingJob;
    $("resumeTranscription").disabled =
      !connected || !!busy || !$("transcriptionConsent").checked;
  }
  async function persistContext(context, task) {
    while (context.saver.dirtyState) {
      if (task.controller.signal.aborted)
        throw new DOMException("Cancelled", "AbortError");
      await context.saver.flush();
      if (context.saver.dirtyState)
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  function contextFor(record, doc) {
    const context = {
      record,
      doc: doc || {
        version: 1,
        audioId: record.id,
        bookId: record.bookId,
        source: "manual",
        text: "",
        segments: [],
        updatedAt: Date.now(),
        edited: false,
      },
    };
    context.saver = createSaver(context);
    contexts.set(TranscriptionData.key(record), context);
    for (const [key, value] of contexts) {
      if (contexts.size <= 8) break;
      if (
        value !== context &&
        value !== active &&
        value !== busy?.context &&
        !value.saver.dirtyState &&
        !value.doc.pendingJob
      ) {
        value.saver.dispose();
        contexts.delete(key);
      }
    }
    return context;
  }
  function createSaver(context) {
    const record = context.record;
    return Autosave.create({
      active: () => !!drawing,
      write: () =>
        NotepadStore.writeRecord(
          TranscriptionData.key(record),
          () => context.doc,
          [],
          [],
          [],
          () => !drawing && !context.deleted && !context.deleting,
        ),
      state: (state) => {
        if (active === context)
          status(
            {
              dirty: "Текст изменён и ещё не сохранён.",
              saving: "Сохранение текста…",
              saved: "Текст сохранён на устройстве.",
              error:
                "Ошибка сохранения текста. Он остаётся в поле; повторите запись или экспортируйте TXT.",
            }[state],
          );
      },
    });
  }
  function showText() {
    if (!active) return;
    $("transcriptionText").value = active.doc.text;
    search();
    controls();
  }
  function search() {
    if (!active) return;
    const query = $("transcriptionSearch").value.trim().toLocaleLowerCase("ru");
    const matches = active.doc.segments.filter(
      (s) => !query || s.text.toLocaleLowerCase("ru").includes(query),
    );
    $("transcriptionSegments").replaceChildren();
    for (const s of matches.slice(0, 100)) {
      const b = document.createElement("button");
      b.textContent =
        TranscriptionData.srt({ segments: [s] }).split("\n")[1] +
        " · " +
        s.text;
      b.onclick = () => LectureUI.seek(s.start * 1000);
      $("transcriptionSegments").append(b);
    }
    const full = query
      ? active.doc.text.toLocaleLowerCase("ru").includes(query)
      : null;
    $("transcriptionMatches").textContent =
      (query
        ? "В редактируемом тексте: " + (full ? "найдено" : "не найдено") + ". "
        : "") +
      "Исходные таймкоды: " +
      matches.length +
      "; показано " +
      Math.min(100, matches.length) +
      ". Редактирование текста не меняет исходные таймкоды.";
  }
  document.addEventListener("notepad:lecture-selected", async (e) => {
    const token = ++selection,
      record = e.detail,
      key = TranscriptionData.key(record);
    $("transcriptionConsent").checked = false;
    try {
      let context = contexts.get(key);
      if (!context) {
        const stored = await NotepadStore.read(key);
        if (token !== selection) return;
        context = contextFor(record, stored);
      }
      if (token !== selection) return;
      active = context;
      showText();
      status(
        busy
          ? "Идёт расшифровка."
          : context.doc.text
            ? "Текст загружен с устройства."
            : "Сервис не подключён. Можно добавить текст вручную.",
      );
    } catch (error) {
      status("Не удалось открыть расшифровку: " + error.message);
    }
  });
  async function connect() {
    try {
      const result = await api("/status");
      connected = !!result.configured;
      $("transcriptionLogin").hidden = true;
      status(
        connected
          ? "Сервис готов: локальный faster-whisper, русский язык. Аудио ещё не передавалось."
          : messages.model_not_configured,
      );
      controls();
    } catch (error) {
      status(error.message);
    }
  }
  $("connectTranscription").onclick = connect;
  $("transcriptionLogin").onsubmit = async (e) => {
    e.preventDefault();
    const password = $("transcriptionPassword").value;
    $("transcriptionPassword").value = "";
    try {
      await api("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      await connect();
    } catch (error) {
      status(error.message);
    }
  };
  $("logoutTranscription").onclick = async () => {
    try {
      await api("/logout", { method: "POST" });
      connected = false;
      controls();
      status("Выполнен выход из сервиса.");
    } catch (error) {
      status(error.message);
    }
  };
  $("transcriptionConsent").onchange = controls;
  async function run(resume = false) {
    if (
      !active ||
      !active.record.bytes ||
      !connected ||
      busy ||
      !$("transcriptionConsent").checked
    )
      return;
    const context = active,
      record = context.record;
    if (
      context.doc.text &&
      !confirm(
        "Заменить текущий текст новым результатом распознавания? Исходное аудио останется.",
      )
    )
      return;
    const task = { context, controller: new AbortController(), job: null };
    busy = task;
    $("transcriptionConsent").checked = false;
    controls();
    try {
      const settings = await api("/status", { signal: task.controller.signal });
      if (!settings.configured) throw Error(messages.model_not_configured);
      if (record.bytes > settings.maxBytes) throw Error(messages.too_large);
      task.job =
        resume && context.doc.pendingJob
          ? await api("/jobs/" + context.doc.pendingJob, {
              signal: task.controller.signal,
            })
          : await api("/jobs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mime: record.mime,
                bytes: record.bytes,
                chunks: record.chunks.length,
              }),
              signal: task.controller.signal,
            });
      if (!/^[0-9a-f]{32}$/.test(task.job.id))
        throw Error("Сервис вернул некорректный номер задания.");
      context.doc.pendingJob = task.job.id;
      context.saver.dirty();
      await persistContext(context, task);
      for (const [index, part] of record.chunks.entries()) {
        if (
          task.job.state !== "uploading" ||
          index < (task.job.uploadedChunks || 0)
        )
          continue;
        if (active === context)
          status(
            "Передача на ваш сервер: " +
              (index + 1) +
              " / " +
              record.chunks.length,
          );
        const blob = await NotepadStore.asset(part.asset);
        if (!blob)
          throw Error("Аудиочасть отсутствует. Распознавание остановлено.");
        await api("/jobs/" + task.job.id + "/chunks/" + index, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
          signal: task.controller.signal,
        });
      }
      if (task.job.state === "uploading")
        await api("/jobs/" + task.job.id + "/run", {
          method: "POST",
          signal: task.controller.signal,
        });
      const deadline = Date.now() + 4 * 3600000;
      while (Date.now() < deadline) {
        const result = await api("/jobs/" + task.job.id, {
          signal: task.controller.signal,
        });
        if (result.state === "complete") {
          while (drawing) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            if (task.controller.signal.aborted)
              throw new DOMException("Cancelled", "AbortError");
          }
          context.doc = TranscriptionData.result(record, result.segments);
          context.saver.dirty();
          if (active === context) showText();
          await persistContext(context, task);
          if (!context.saver.dirtyState)
            api("/jobs/" + task.job.id, { method: "DELETE" }).catch(() => {});
          return;
        }
        if (["failed", "cancelled"].includes(result.state))
          throw Error(messages.transcription_failed);
        if (active === context)
          status(
            "Распознавание на вашем компьютере… Обработано до " +
              Math.floor(result.seconds || 0) +
              " с.",
          );
        await new Promise((resolve, reject) => {
          const cancel = () => {
            clearTimeout(timer);
            reject(new DOMException("Cancelled", "AbortError"));
          };
          const timer = setTimeout(() => {
            task.controller.signal.removeEventListener("abort", cancel);
            resolve();
          }, 1500);
          if (task.controller.signal.aborted) cancel();
          else
            task.controller.signal.addEventListener("abort", cancel, {
              once: true,
            });
        });
      }
      throw Error("Превышено время ожидания. Аудио сохранено на устройстве.");
    } catch (error) {
      if (active === context)
        status(
          error.name === "AbortError"
            ? "Расшифровка отменена. Исходное аудио сохранено."
            : error.message,
        );
      if (task.controller.signal.aborted && task.job) {
        api("/jobs/" + task.job.id, { method: "DELETE" }).catch(() => {});
        delete context.doc.pendingJob;
        context.saver.dirty();
        context.saver.flush().catch(() => {});
      }
    } finally {
      busy = null;
      controls();
    }
  }
  $("runTranscription").onclick = () => run();
  $("resumeTranscription").onclick = () => run(true);
  $("cancelTranscription").onclick = async () => {
    if (busy) {
      busy.controller.abort();
      return;
    }
    if (!active?.doc.pendingJob) return;
    const context = active;
    let cancelled = false;
    try {
      await api("/jobs/" + context.doc.pendingJob, { method: "DELETE" });
      cancelled = true;
    } catch {}
    delete context.doc.pendingJob;
    context.saver.dirty();
    await context.saver.flush().catch(() => {});
    controls();
    status(
      cancelled
        ? "Задание отменено. Аудио сохранено."
        : "Задание убрано из интерфейса. Сервис не подтвердил отмену; при необходимости остановите его вручную. Аудио сохранено.",
    );
  };
  $("transcriptionText").oninput = () => {
    if (!active) return;
    active.doc.text = $("transcriptionText").value;
    active.doc.edited = true;
    active.doc.updatedAt = Date.now();
    active.saver.dirty();
  };
  $("saveTranscription").onclick = () =>
    active?.saver.flush(true).catch(() => {});
  $("transcriptionSearch").oninput = search;
  $("copyTranscription").onclick = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.doc.text);
      status("Текст скопирован.");
    } catch {
      $("transcriptionText").focus();
      $("transcriptionText").select();
      status("Текст выделен. Используйте команду «Копировать» системы.");
    }
  };
  function download(srt = false) {
    if (!active) return;
    const blob = new Blob(
        [srt ? TranscriptionData.srt(active.doc) : active.doc.text],
        { type: "text/plain;charset=utf-8" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      active.record.name.replace(/[<>:"/\\|?*]/g, "_") +
      (srt ? ".srt" : ".txt");
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  $("exportTranscriptText").onclick = () => download();
  $("exportTranscriptSrt").onclick = () => download(true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden)
      for (const c of contexts.values())
        c.saver.flush(false, true).catch(() => {});
  });
  document.addEventListener("notepad:stroke-end", () => {
    for (const context of contexts.values()) context.saver.idle();
  });
  window.addEventListener("pagehide", () => {
    for (const c of contexts.values())
      c.saver.flush(false, true).catch(() => {});
  });
  window.addEventListener("beforeunload", (e) => {
    if ([...contexts.values()].some((c) => c.saver.dirtyState)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  document.addEventListener("notepad:lecture-deleting", (e) => {
    selection++;
    const key = TranscriptionData.key(e.detail),
      context = contexts.get(key);
    if (!context) return;
    context.deleting = true;
    context.saver.dispose();
    controls();
  });
  document.addEventListener("notepad:lecture-delete-failed", (e) => {
    const context = contexts.get(TranscriptionData.key(e.detail));
    if (!context) return;
    context.deleting = false;
    context.saver = createSaver(context);
    context.saver.dirty();
    if (active === context) showText();
  });
  document.addEventListener("notepad:lecture-deleted", (e) => {
    const key = TranscriptionData.key(e.detail),
      context = contexts.get(key);
    if (!context) return;
    context.deleted = true;
    contexts.delete(key);
    if (busy?.context === context) busy.controller.abort();
    if (active === context) {
      active = null;
      $("transcriptionText").value = "";
      controls();
    }
  });
})();
