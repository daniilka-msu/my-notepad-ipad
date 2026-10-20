window.LectureUI = (() => {
  const button = document.createElement("button");
  button.id = "openLecture";
  button.textContent = "Лекция";
  button.setAttribute("aria-controls", "lecturePanel");
  button.setAttribute("aria-expanded", "false");
  $("viewControls").append(button);
  const panel = document.createElement("section");
  panel.id = "lecturePanel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Лекция");
  panel.innerHTML =
    '<div class="lecture-controls"><strong>Лекция</strong><output id="lectureTimer">00:00</output><button id="startLecture">Записать</button><button id="pauseLecture" disabled>Пауза</button><button id="resumeLecture" disabled>Продолжить</button><button id="stopLecture" disabled>Остановить</button><button id="retryLecture" hidden>Повторить сохранение</button><button id="closeLecture" aria-label="Скрыть панель лекции">Скрыть</button></div><p id="lectureStatus" role="status">Микрофон выключен. Записи хранятся только на этом устройстве.</p><p class="hint">На iPad фоновая запись не гарантируется: при скрытии приложения запись ставится на паузу. JSON-копия блокнотов не включает аудио и расшифровки — экспортируйте их отдельно.</p><div class="lecture-content"><div id="lectureList" aria-label="Записи блокнота"></div><div id="lectureDetails" hidden><label>Название <input id="lectureName" maxlength="120"></label><button id="renameLecture">Переименовать</button><audio id="lectureAudio" controls preload="metadata"></audio><button id="exportLecture">Экспорт аудио</button><button id="deleteLecture">Удалить запись</button><div id="lectureTranscriptSlot"></div><div id="lectureMarks"></div></div></div><div class="lecture-controls"><input id="lectureBookmarkText" maxlength="120" placeholder="Название временной закладки" aria-label="Название временной закладки"><button id="lectureBookmark" disabled>Закладка</button><button id="lectureSeekInk" aria-pressed="false">Аудио по штриху</button></div>';
  $("workspace").after(panel);
  if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
    $("startLecture").disabled = true;
    $("lectureStatus").textContent =
      "Запись недоступна в этом браузере: нужны HTTPS, микрофон и MediaRecorder. Сохранённые записи можно открыть.";
  }
  let selected = null,
    records = [],
    token = 0,
    known = new WeakSet(),
    observedBooks = new WeakSet(),
    seekInk = false,
    starting = false,
    currentBook = null,
    wasActive = false;
  const time = (ms) => {
    const s = Math.floor(ms / 1000);
    return (
      (Math.floor(s / 3600) ? Math.floor(s / 3600) + ":" : "") +
      String(Math.floor(s / 60) % 60).padStart(2, "0") +
      ":" +
      String(s % 60).padStart(2, "0")
    );
  };
  function status(message) {
    if ($("lectureStatus").textContent !== message)
      $("lectureStatus").textContent = message;
  }
  const recorder = LectureRecorder.create((state) => {
    const elapsed = time(state.elapsed);
    if ($("lectureTimer").textContent !== elapsed)
      $("lectureTimer").textContent = elapsed;
    const caption =
      state.state === "recording"
        ? "● Лекция"
        : recorder.active
          ? "Ⅱ Лекция"
          : "Лекция";
    if (button.textContent !== caption) button.textContent = caption;
    const disabled = {
      startLecture: starting || recorder.active,
      pauseLecture: state.state !== "recording",
      resumeLecture: state.state !== "paused" || !!state.error,
      stopLecture: state.state === "inactive",
      lectureBookmark: state.state !== "recording",
    };
    for (const [id, value] of Object.entries(disabled))
      if ($(id).disabled !== value) $(id).disabled = value;
    if ($("retryLecture").hidden !== !state.error)
      $("retryLecture").hidden = !state.error;
    if (state.message) status(state.message);
    else if (state.state === "recording")
      status(
        "Идёт запись · " +
          state.record.bookName +
          " · сохранено " +
          Math.round(state.record.bytes / 1024) +
          " КБ",
      );
    else if (state.state === "paused")
      status("Запись на паузе. Для продолжения нажмите «Продолжить».");
    if (wasActive && !recorder.active) refresh();
    wasActive = recorder.active;
  });
  async function refresh() {
    if (!book?.id) return;
    const request = ++token;
    try {
      const list = await LectureStore.list(book.id);
      if (request !== token) return;
      records = list;
      $("lectureList").replaceChildren();
      if (!list.length) {
        const p = document.createElement("p");
        p.textContent = "В этом блокноте пока нет записей.";
        $("lectureList").append(p);
      }
      for (const r of list) {
        const row = document.createElement("button");
        row.className = "lecture-row";
        row.textContent =
          r.name +
          " · " +
          time(r.durationMs) +
          (r.state === "recording" ? " · незавершённая запись" : "");
        row.onclick = () => select(r);
        $("lectureList").append(row);
      }
      if (selected) {
        const current = list.find((r) => r.id === selected.id);
        if (current) {
          await LectureStore.loadMarks(current);
          if (request !== token) return;
          selected = current;
        } else {
          $("lectureDetails").hidden = true;
          selected = null;
        }
      }
    } catch (error) {
      status("Не удалось открыть записи: " + error.message);
    }
  }
  async function ensureStream() {
    await navigator.serviceWorker?.ready;
    if (!navigator.serviceWorker?.controller)
      throw Error(
        "Перезапустите приложение после обновления для воспроизведения аудио.",
      );
  }
  async function select(record) {
    try {
      if (recorder.active && recorder.record?.id === record.id)
        throw Error("Сначала остановите запись и дождитесь сохранения.");
      await ensureStream();
      try {
        await LectureStore.loadMarks(record);
      } catch {
        status(
          "Временные привязки недоступны; аудио можно воспроизвести или экспортировать.",
        );
      }
      selected = record;
      $("lectureDetails").hidden = false;
      $("lectureName").value = record.name;
      $("lectureAudio").pause();
      $("lectureAudio").hidden = !record.bytes;
      $("exportLecture").disabled = !record.bytes;
      if (record.bytes) $("lectureAudio").src = LectureStore.url(record);
      else {
        $("lectureAudio").removeAttribute("src");
        status(
          "Нет полученных аудиоданных. Можно переименовать или удалить эту запись.",
        );
      }
      if (
        record.bytes &&
        !$("lectureAudio").canPlayType(record.mime.split(";")[0])
      )
        status(
          "Этот браузер не поддерживает формат аудио. Запись сохранена; используйте экспорт и совместимый плеер.",
        );
      renderMarks();
      document.dispatchEvent(
        new CustomEvent("notepad:lecture-selected", { detail: record }),
      );
      if (record.state === "recording")
        status(
          "Доступны ранее сохранённые части. Завершение предыдущей записи не подтверждено; последние секунды могли не сохраниться.",
        );
    } catch (error) {
      status(error.message);
    }
  }
  function renderMarks() {
    $("lectureMarks").replaceChildren();
    for (const mark of selected?.marks || []) {
      if (!mark.label) continue;
      const row = document.createElement("button");
      row.textContent = "≈ " + time(mark.timeMs) + " · " + mark.label;
      row.onclick = () => seek(mark.timeMs);
      $("lectureMarks").append(row);
    }
  }
  function seek(ms) {
    const audio = $("lectureAudio");
    audio.currentTime = Math.max(0, ms / 1000);
    audio.play().catch(() => status("Нажмите воспроизведение в аудиоплеере."));
  }
  $("lectureAudio").onerror = () =>
    status(
      "Браузер не смог воспроизвести аудио. Сохранённые части не удалены; попробуйте экспорт записи и другой плеер.",
    );
  button.onclick = () => {
    if (!panel.hidden) {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      return;
    }
    finish();
    if (!$("zoomWriting").hidden) ZoomWriting.close();
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    currentBook = book.id;
    refresh();
  };
  $("closeLecture").onclick = () => {
    hide();
    button.focus({ preventScroll: true });
  };
  function hide() {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    seekInk = false;
    $("lectureSeekInk").setAttribute("aria-pressed", "false");
  }
  $("startLecture").onclick = async () => {
    if (starting) return;
    starting = true;
    $("lectureAudio").pause();
    $("startLecture").disabled = true;
    status("Разрешите доступ к микрофону в запросе браузера.");
    try {
      await recorder.start(book.id, book.name);
      for (const item of book.pages.flat()) known.add(item);
      observedBooks.add(book);
      selected = null;
      $("lectureDetails").hidden = true;
      refresh();
    } catch (error) {
      status(
        error.name === "NotAllowedError"
          ? "Нет разрешения микрофона. Разрешите доступ в настройках Safari и повторите."
          : error.message,
      );
    } finally {
      starting = false;
      $("startLecture").disabled = recorder.active;
    }
  };
  $("pauseLecture").onclick = () => recorder.pause();
  $("resumeLecture").onclick = () => recorder.resume();
  $("stopLecture").onclick = () =>
    recorder.stop().catch((error) => status(error.message));
  $("retryLecture").onclick = () => recorder.retry();
  $("lectureBookmark").onclick = () => {
    if (recorder.state !== "recording") return;
    recorder.mark({
      label: $("lectureBookmarkText").value.trim() || "Закладка",
    });
    $("lectureBookmarkText").value = "";
    LectureStore.update(recorder.record, { marks: recorder.record.marks }).then(
      () => status("Временная закладка сохранена"),
      (error) => status("Не удалось сохранить закладку: " + error.message),
    );
  };
  $("renameLecture").onclick = async () => {
    const name = $("lectureName").value.trim();
    if (!selected || !name || name.length > 120) return;
    try {
      await LectureStore.update(selected, { name });
      await refresh();
      status("Название сохранено");
    } catch (error) {
      status("Переименование не сохранено: " + error.message);
    }
  };
  $("exportLecture").onclick = async () => {
    try {
      if (!selected) return;
      await ensureStream();
      const a = document.createElement("a");
      a.href = LectureStore.url(selected, true);
      document.body.append(a);
      a.click();
      a.remove();
    } catch (error) {
      status(error.message);
    }
  };
  $("deleteLecture").onclick = async () => {
    if (
      !selected ||
      !confirm("Удалить эту аудиозапись и её расшифровку с устройства?")
    )
      return;
    const deleting = selected;
    try {
      document.dispatchEvent(
        new CustomEvent("notepad:lecture-deleting", { detail: deleting }),
      );
      await LectureStore.remove(deleting);
      document.dispatchEvent(
        new CustomEvent("notepad:lecture-deleted", { detail: deleting }),
      );
      $("lectureAudio").pause();
      $("lectureAudio").removeAttribute("src");
      selected = null;
      $("lectureDetails").hidden = true;
      await refresh();
      status("Запись удалена");
    } catch (error) {
      document.dispatchEvent(
        new CustomEvent("notepad:lecture-delete-failed", { detail: deleting }),
      );
      status("Не удалось удалить запись: " + error.message);
    }
  };
  $("lectureSeekInk").onclick = () => {
    finish();
    seekInk = !seekInk;
    if (seekInk) Editor.choose("pen");
    $("lectureSeekInk").setAttribute("aria-pressed", String(seekInk));
    status(
      seekInk
        ? "Выберите сохранённую запись, затем коснитесь штриха, сделанного во время неё."
        : "Режим перехода по штриху выключен.",
    );
  };
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (!seekInk || panel.hidden) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!selected) {
        status("Сначала выберите запись в списке.");
        return;
      }
      const p = pos(e),
        hit = Shapes.ordered(book.pages[page], false)
          .reverse()
          .find(
            ([, s]) =>
              s &&
              (s.points?.some(
                (q) =>
                  Math.hypot(q.x - p.x, q.y - p.y) <=
                  Math.max(10, s.width || 1),
              ) ||
                (!s.points &&
                  p.x >= s.x &&
                  p.x <= s.x + s.width &&
                  p.y >= s.y &&
                  p.y <= s.y + (s.height || 40))),
          );
      const id = hit && book.pages[page][hit[0]].lectureActionId,
        mark = selected.marks.find((m) => m.actionId === id && id);
      const unique =
        id &&
        book.pages.reduce(
          (count, items) =>
            count + items.filter((s) => s.lectureActionId === id).length,
          0,
        ) === 1;
      if (mark && unique) seek(mark.timeMs);
      else
        status(
          "Для этого объекта нет достоверной временной привязки к выбранной записи.",
        );
    },
    true,
  );
  document.addEventListener("notepad:render", () => {
    if (recorder.active && recorder.record.bookId !== book.id) recorder.pause();
    if (!observedBooks.has(book)) {
      observedBooks.add(book);
      for (const s of book.pages.flat()) known.add(s);
    }
    if(window.CanvasEditor?.projecting)for(const s of book.pages.flat())known.add(s);
    const item = book.pages[page].at(-1),
      fresh = item && !known.has(item);
    if (fresh) delete item.lectureActionId;
    if (item) known.add(item);
    if (recorder.state === "recording" && recorder.record.bookId === book.id) {
      if (fresh) {
        item.lectureActionId = uid();
        recorder.mark({ actionId: item.lectureActionId, page });
      }
    }
    if (!panel.hidden && currentBook !== book.id) {
      currentBook = book.id;
      selected = null;
      $("lectureAudio").pause();
      $("lectureDetails").hidden = true;
      refresh();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) recorder.pause();
  });
  document.addEventListener("notepad:screen", () => {
    if (document.body.classList.contains("home-view")) {
      recorder.pause();
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });
  window.addEventListener("pagehide", () => recorder.stop().catch(() => {}));
  window.addEventListener("beforeunload", (e) => {
    if (recorder.active) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  return {
    hide,
    recorder,
    refresh,
    get selected() {
      return selected;
    },
    seek,
  };
})();
