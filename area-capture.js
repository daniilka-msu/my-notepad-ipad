window.AreaCapture = (() => {
  const button = document.createElement("button");
  button.id = "captureArea";
  button.className = "tool";
  button.dataset.tool = "capture";
  Interface.decorate(button, "image", "Снимок области");
  $("documentActions").append(button);
  const panel = document.createElement("section");
  panel.id = "capturePanel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Снимок области");
  panel.innerHTML =
    '<div class="lasso-heading"><strong>Снимок области</strong><button id="captureClose" aria-label="Закрыть снимок области"></button></div><label>Выделение<select id="captureMode"><option value="rect">Прямоугольник</option><option value="freeform">Произвольный контур</option></select></label><p id="captureStatus" role="status">Выделите область на листе.</p><img id="capturePreview" alt="Предпросмотр снимка" hidden><div class="lasso-actions"><button id="captureCopy">Копировать изображение</button><button id="captureCut">Вырезать область</button><button id="capturePaste">Вставить изображение</button><button id="captureObject">Создать объект на месте</button><button id="captureDownload">Сохранить PNG</button></div><p class="hint">Снимок — растровое изображение. При вырезании удаляются только целиком попавшие в контур незаблокированные объекты; частичные и заблокированные остаются. Для редактируемых копий используйте «Лассо».</p>';
  $("workspace").append(panel);
  Interface.decorate(
    $("captureClose"),
    "close",
    "Закрыть снимок области",
    true,
  );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "captureContour";
  svg.setAttribute("viewBox", "0 0 794 1123");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const outline = document.createElementNS(svg.namespaceURI, "path");
  svg.append(outline);
  $("page").append(svg);
  let active = null,
    clipboard = null,
    snapshot = null,
    previewURL = null,
    frame = null,
    generation = 0,
    preparing = false;
  const message = (text) => {
    $("captureStatus").textContent = text;
  };
  const sourceCurrent = () =>
    snapshot &&
    snapshot.book === book &&
    snapshot.items === book.pages[page] &&
    snapshot.length === snapshot.items.length &&
    snapshot.last === snapshot.items.at(-1);
  function candidates() {
    if (!sourceCurrent()) return [];
    const hidden = new Set(
      snapshot.items
        .filter((v) => v.tool === "stroke-eraser")
        .flatMap((v) => v.targets),
    );
    return Shapes.resolve(snapshot.items, false).flatMap((value, index) =>
      !hidden.has(index) &&
      !value?.locked &&
      (!value?.groupId || snapshot.groupEligibility.get(value.groupId)) &&
      SceneObjects.selected(value, snapshot.path, false) &&
      SceneObjects.selected(value, snapshot.clipPath, false)
        ? [{ index, value }]
        : [],
    );
  }
  function update() {
    panel.hidden = tool !== "capture" || Home.active;
    panel.inert = !!active;
    for (const id of ["captureCopy", "capturePaste", "captureDownload"])
      $(id).disabled = !clipboard || preparing;
    $("captureObject").disabled = !clipboard || preparing || !sourceCurrent();
    $("captureCut").disabled = preparing || !candidates().length;
  }
  function cancel() {
    active = null;
    outline.setAttribute("d", "");
    saving.idle();
    CanvasEditor.session?.autosave.idle();
    update();
  }
  function cancelPreparation() {
    generation++;
    preparing = false;
    cancel();
  }
  async function snapshotArea(path) {
    const token = ++generation,
      sourceBook = book,
      items = book.pages[page],
      length = items.length,
      last = items.at(-1),
      camera = { ...(book.canvasCamera || { x: 0, y: 0 }) };
    const xs = path.map((p) => p.x),
      ys = path.map((p) => p.y);
    let x = Math.min(...xs),
      y = Math.min(...ys),
      right = Math.max(...xs),
      bottom = Math.max(...ys);
    if (!book.canvasDocument) {
      x = Math.max(0, x);
      y = Math.max(0, y);
      right = Math.min(W, right);
      bottom = Math.min(H, bottom);
    }
    if (right - x < 4 || bottom - y < 4)
      throw new Error(
        "Выделите область размером не менее 4 единиц по каждой стороне",
      );
    preparing = true;
    message("Подготовка снимка…");
    update();
    let target;
    try {
      if (sourceBook.canvasDocument)
        target = await CanvasExport.compose(
          {
            x: x + camera.x,
            y: y + camera.y,
            width: right - x,
            height: bottom - y,
          },
          sourceBook,
        );
      else {
        const source = await Documents.compose(sourceBook, page),
          sx = source.width / W,
          sy = source.height / H;
        target = document.createElement("canvas");
        target.width = Math.max(1, Math.round((right - x) * sx));
        target.height = Math.max(1, Math.round((bottom - y) * sy));
        target
          .getContext("2d")
          .drawImage(
            source,
            x * sx,
            y * sy,
            (right - x) * sx,
            (bottom - y) * sy,
            0,
            0,
            target.width,
            target.height,
          );
        source.width = source.height = 1;
      }
      const c = target.getContext("2d");
      c.save();
      c.globalCompositeOperation = "destination-in";
      c.beginPath();
      for (const [index, p] of path.entries()) {
        const px = ((p.x - x) / (right - x)) * target.width,
          py = ((p.y - y) / (bottom - y)) * target.height;
        if (index) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.closePath();
      c.fill();
      c.restore();
      const blob = await new Promise((resolve, reject) =>
        target.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Не удалось создать PNG")),
          "image/png",
        ),
      );
      if (token !== generation) return;
      const clipPath = [
          { x, y },
          { x: right, y },
          { x: right, y: bottom },
          { x, y: bottom },
        ],
        resolved = Shapes.resolve(items, false),
        groups = new Set(
          resolved
            .filter(SceneObjects.eligible)
            .map((value) => value.groupId)
            .filter(Boolean),
        ),
        groupEligibility = new Map();
      for (const id of groups) {
        const members = sourceBook.canvasDocument
          ? (await CanvasEditor.session.model.group(id)).map((entry) =>
              CanvasEditor.translate(entry.value, -camera.x, -camera.y),
            )
          : resolved.filter((value) => value?.groupId === id);
        groupEligibility.set(
          id,
          members.every(
            (value) =>
              !value.locked &&
              SceneObjects.selected(value, path, false) &&
              SceneObjects.selected(value, clipPath, false),
          ),
        );
      }
      if (token !== generation) return;
      clipboard = { blob, width: right - x, height: bottom - y };
      snapshot = {
        book: sourceBook,
        items,
        length,
        last,
        path: structuredClone(path),
        clipPath,
        groupEligibility,
        x,
        y,
      };
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(blob);
      $("capturePreview").src = previewURL;
      $("capturePreview").hidden = false;
      message("Снимок готов. Исходные объекты сохранены.");
    } finally {
      if (target) target.width = target.height = 1;
      if (token === generation) preparing = false;
      update();
    }
  }
  function safe(action) {
    return async () => {
      try {
        await action();
      } catch (error) {
        preparing = false;
        message(error.message);
        update();
      }
    };
  }
  $("captureCopy").onclick = safe(async () => {
    if (!clipboard) return;
    if (globalThis.ClipboardItem && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": clipboard.blob }),
        ]);
        message("PNG скопирован в системный и внутренний буферы.");
        return;
      } catch {}
    }
    message(
      "Изображение во внутреннем буфере. Используйте «Вставить изображение».",
    );
  });
  $("captureCut").onclick = safe(() => {
    if (!clipboard || !sourceCurrent())
      throw new Error(
        "Область изменилась. Сделайте новый снимок перед вырезанием.",
      );
    const entries = candidates();
    if (!entries.length) return;
    snapshot.items.push({
      type: "selection-edit",
      changes: entries.map((v) => ({ target: v.index, value: null })),
    });
    redo = [];
    render();
    message(
      "Полностью попавшие объекты вырезаны. Частичные и заблокированные сохранены.",
    );
    update();
  });
  async function paste(inPlace = false) {
    if (!clipboard) return;
    const blob = clipboard.blob,
      notebook = book,
      source = snapshot;
    const image = await ImageObjects.importFile(
      new File([blob], "snapshot.png", { type: "image/png" }),
    );
    while (activeInkInput() && book === notebook)
      await new Promise(requestAnimationFrame);
    if (book !== notebook)
      throw new Error("Блокнот изменился. Повторите вставку.");
    if (inPlace && (snapshot !== source || !sourceCurrent()))
      throw new Error("Область изменилась. Повторите вставку.");
    const area = book.canvasDocument
        ? CanvasExport.visible()
        : { x: 0, y: 0, width: W, height: H },
      camera = book.canvasCamera || { x: 0, y: 0 };
    image.x = inPlace && sourceCurrent() ? snapshot.x : area.x - camera.x + 24;
    image.y = inPlace && sourceCurrent() ? snapshot.y : area.y - camera.y + 24;
    ObjectTools.add(image);
    message(
      "Вставлено отдельное изображение. Оригинальные объекты не объединены с ним.",
    );
    update();
  }
  $("capturePaste").onclick = safe(() => paste());
  $("captureObject").onclick = safe(() => paste(true));
  $("captureDownload").onclick = safe(() => {
    if (!clipboard) return;
    const url = URL.createObjectURL(clipboard.blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "my-notepad-area.png";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message("PNG передан браузеру для сохранения.");
  });
  button.onclick = () => {
    finish();
    Editor.choose("capture");
    $("documentMenu").open = false;
    message(
      clipboard
        ? "Можно вставить последний снимок или выделить новую область."
        : "Выделите область на листе.",
    );
    update();
  };
  $("captureClose").onclick = () => Editor.choose("pen");
  $("captureMode").value = preferences.captureFreeform ? "freeform" : "rect";
  $("captureMode").onchange = () => {
    preferences.captureFreeform = $("captureMode").value === "freeform";
    Editor.persist();
    cancelPreparation();
  };
  function path() {
    if (!active) return [];
    if (active.mode === "freeform") return active.path;
    const a = active.start,
      b = active.latest;
    return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  }
  function draw() {
    frame = null;
    outline.setAttribute(
      "d",
      path()
        .map((p, index) => (index ? "L" : "M") + p.x + " " + p.y)
        .join(" ") + " Z",
    );
  }
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (
        tool !== "capture" ||
        active ||
        event.button > 0 ||
        !validPosition(event) ||
        ($("inputMode").value !== "any" && event.pointerType !== "pen")
      )
        return;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      cancelPreparation();
      snapshot = null;
      $("capturePreview").hidden = true;
      const point = pos(event);
      active = {
        id: event.pointerId,
        type: event.pointerType,
        start: point,
        latest: point,
        path: [point],
        mode: $("captureMode").value,
      };
      saving.input();
      CanvasEditor.session?.autosave.input();
      update();
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (
        !active ||
        active.id !== event.pointerId ||
        active.type !== event.pointerType ||
        !validPosition(event)
      )
        return;
      active.latest = pos(event);
      if (
        Math.hypot(
          active.latest.x - active.path.at(-1).x,
          active.latest.y - active.path.at(-1).y,
        ) > 1
      )
        active.path.push(active.latest);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (frame === null) frame = requestAnimationFrame(draw);
    },
    true,
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      if (!active || active.id !== event.pointerId) return;
      active.latest = pos(event);
      const result = path();
      active = null;
      outline.setAttribute("d", "");
      event.preventDefault();
      event.stopImmediatePropagation();
      saving.idle();
      CanvasEditor.session?.autosave.idle();
      const pending = snapshotArea(result),
        token = generation;
      pending.catch((error) => {
        if (token !== generation) return;
        preparing = false;
        message(error.message);
        update();
      });
    },
    true,
  );
  for (const type of ["pointercancel", "lostpointercapture"])
    canvas.addEventListener(
      type,
      (event) => {
        if (active?.id === event.pointerId) cancelPreparation();
      },
      true,
    );
  document.addEventListener("notepad:gesture-start", cancelPreparation);
  document.addEventListener("notepad:tool", () => {
    if (tool !== "capture") cancelPreparation();
    update();
  });
  document.addEventListener("notepad:render", update);
  document.addEventListener("notepad:screen", cancelPreparation);
  return {
    render: snapshotArea,
    paste,
    candidates,
    cancel: cancelPreparation,
    get active() {
      return !!active;
    },
    get busy() {
      return !!active || preparing;
    },
    get clipboard() {
      return clipboard;
    },
    get snapshot() {
      return snapshot;
    },
  };
})();
