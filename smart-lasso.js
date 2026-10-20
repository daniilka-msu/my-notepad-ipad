window.SmartLasso = (() => {
  const button = document.createElement("button");
  button.id = "lassoTool";
  button.className = "tool";
  button.dataset.tool = "lasso";
  Interface.decorate(button, "lasso", "Лассо", true);
  document.querySelector("[data-tool=hand]").after(button);
  const panel = document.createElement("section");
  panel.id = "lassoPanel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Лассо и буфер объектов");
  panel.innerHTML =
    '<div class="lasso-heading"><strong>Лассо</strong><button id="lassoNew">Новое выделение</button><button id="lassoClose" aria-label="Закрыть лассо"></button></div><label>Штрихи<select id="lassoMode"><option value="inside">Только полностью внутри</option><option value="intersect">Включая пересекающиеся</option></select></label><p id="lassoStatus" role="status">Обведите объекты замкнутым контуром.</p><div class="lasso-actions"><button id="lassoCopy">Копировать</button><button id="lassoCut">Вырезать</button><button id="lassoPaste">Вставить объекты</button><button id="lassoDuplicate">Дублировать</button><button id="lassoDelete">Удалить</button><button id="lassoRotate">Повернуть на 90°</button><button id="lassoFront">На передний план</button><button id="lassoBack">На задний план</button><button id="lassoGroup">Сгруппировать</button><button id="lassoUngroup">Разгруппировать</button><button id="lassoLock">Заблокировать</button></div><label>Цвет<input id="lassoColor" type="color" value="#365ecc"><button id="lassoApplyColor">Применить</button></label><p class="hint">Перетащите выделение для перемещения. Нижний правый маркер меняет размер. Копирование объектов сохраняет возможность редактирования.</p>';
  $("workspace").append(panel);
  Interface.decorate($("lassoClose"), "close", "Закрыть лассо", true);
  const frame = document.createElement("div");
  frame.id = "lassoSelection";
  frame.hidden = true;
  frame.innerHTML =
    '<button id="lassoResize" aria-label="Изменить размер выделения"></button>';
  $("page").append(frame);
  Interface.decorate(
    $("lassoResize"),
    "focus",
    "Изменить размер выделения",
    true,
  );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "lassoContour";
  svg.setAttribute("viewBox", "0 0 794 1123");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const contour = document.createElementNS(svg.namespaceURI, "path");
  svg.append(contour);
  $("page").append(svg);
  let selection = null,
    active = null,
    clipboard = null,
    animation = null,
    token = 0;
  const message = (text) => {
    $("lassoStatus").textContent = text;
  };
  function values() {
    if (
      !selection ||
      selection.book !== book ||
      selection.items !== book.pages[page]
    )
      return [];
    const resolved = Shapes.resolve(selection.items);
    return selection.indices
      .map((index) => ({ index, value: resolved[index] }))
      .filter((item) => SceneObjects.eligible(item.value));
  }
  function update() {
    const entries = values(),
      locked = entries.some((v) => v.value.locked);
    panel.hidden = tool !== "lasso" || Home.active;
    frame.hidden = !entries.length || panel.hidden;
    panel.inert = !!active;
    if (entries.length) {
      const b = SceneObjects.combined(entries.map((v) => v.value)),
        x = Math.max(0, b.x),
        y = Math.max(0, b.y),
        right = Math.min(W, b.x + b.width),
        bottom = Math.min(H, b.y + b.height);
      frame.hidden = frame.hidden || right <= x || bottom <= y;
      Object.assign(frame.style, {
        left: (x / W) * 100 + "%",
        top: (y / H) * 100 + "%",
        width: (Math.max(0, right - x) / W) * 100 + "%",
        height: (Math.max(0, bottom - y) / H) * 100 + "%",
      });
      $("lassoResize").hidden =
        locked || b.x + b.width > W || b.y + b.height > H;
    }
    for (const id of ["lassoCopy", "lassoDuplicate"])
      $(id).disabled = !entries.length;
    for (const id of [
      "lassoCut",
      "lassoDelete",
      "lassoRotate",
      "lassoFront",
      "lassoBack",
      "lassoApplyColor",
      "lassoGroup",
      "lassoUngroup",
    ])
      $(id).disabled = !entries.length || locked;
    $("lassoLock").disabled = !entries.length;
    $("lassoLock").textContent = locked ? "Разблокировать" : "Заблокировать";
    $("lassoPaste").disabled = !clipboard;
    $("lassoApplyColor").disabled =
      locked || !entries.some((v) => v.value.type !== "image-object");
    $("lassoGroup").disabled = locked || entries.length < 2;
    $("lassoUngroup").disabled =
      locked || !entries.some((v) => v.value.groupId);
  }
  function cancel() {
    token++;
    active = null;
    Shapes.setPreview(null);
    contour.setAttribute("d", "");
    paint();
    saving.idle();
    CanvasEditor.session?.autosave.idle();
    update();
  }
  function clear() {
    token++;
    selection = null;
    cancel();
    message("Обведите объекты замкнутым контуром.");
  }
  function apply(changes, extra = {}) {
    const entries = values();
    if (!entries.length) return;
    if (
      changes.some(
        (change) => change.value !== null && !SceneObjects.valid(change.value),
      )
    )
      throw new Error(
        "Размер или свойства объекта выходят за допустимые пределы",
      );
    selection.items.push({ type: "selection-edit", changes, ...extra });
    redo = [];
    Shapes.setPreview(null);
    active = null;
    render();
    update();
  }
  function safe(action) {
    return async () => {
      try {
        await action();
      } catch (error) {
        message(error.message);
        cancel();
      }
    };
  }
  function requireVectorSafety() {
    const entries = values(),
      ordered = Shapes.ordered(book.pages[page], false);
    for (const entry of entries) {
      const position = ordered.findIndex(([index]) => index === entry.index),
        b = SceneObjects.bounds(entry.value);
      if (
        ordered
          .slice(position + 1)
          .some(
            ([, value]) =>
              value?.tool === "eraser" &&
              value.points?.length &&
              SpatialDocument.intersects(b, SceneObjects.bounds(value)),
          )
      )
        throw new Error(
          "В выделении есть пиксельное стирание. Для точного переноса используйте «Снимок области»: векторный перенос мог бы восстановить стёртые части.",
        );
    }
  }
  async function selectPath(path) {
    const generation = ++token,
      items = book.pages[page],
      hidden = new Set(
        items
          .filter((v) => v.tool === "stroke-eraser")
          .flatMap((v) => v.targets),
      ),
      resolved = Shapes.resolve(items, false);
    const indices = resolved.flatMap((value, index) =>
      !hidden.has(index) &&
      SceneObjects.selected(value, path, $("lassoMode").value === "intersect")
        ? [index]
        : [],
    );
    const groups = new Set(
      indices.map((index) => resolved[index].groupId).filter(Boolean),
    );
    if (book.canvasDocument && groups.size) {
      const entries = [];
      for (const id of groups)
        entries.push(...(await CanvasEditor.session.model.group(id)));
      if (generation !== token || items !== book.pages[page]) return;
      if (!(await CanvasEditor.include(entries))) return;
      for (let index = 0; index < items.length; index++)
        if (
          groups.has(Shapes.resolve(items, false)[index]?.groupId) &&
          !indices.includes(index)
        )
          indices.push(index);
    } else
      for (let index = 0; index < resolved.length; index++)
        if (groups.has(resolved[index]?.groupId) && !indices.includes(index))
          indices.push(index);
    if (generation !== token || items !== book.pages[page]) return;
    selection = { book, items, indices };
    message(
      indices.length
        ? "Выбрано объектов: " + indices.length
        : "В контуре нет подходящих объектов.",
    );
    update();
  }
  function copy() {
    const entries = values();
    if (!entries.length) return;
    requireVectorSafety();
    const box = SceneObjects.combined(entries.map((v) => v.value));
    clipboard = {
      values: entries.map((v) =>
        SceneObjects.transform(
          v.value,
          { dx: -box.x, dy: -box.y },
          { x: 0, y: 0 },
        ),
      ),
      width: box.width,
      height: box.height,
    };
    message("Редактируемые объекты скопированы во внутренний буфер.");
    update();
  }
  function deleteSelection() {
    if (values().some((v) => v.value.locked))
      throw new Error("Сначала разблокируйте выделение");
    apply(values().map((v) => ({ target: v.index, value: null })));
    selection = null;
    update();
  }
  async function paste() {
    if (!clipboard) return;
    finish();
    const area = book.canvasDocument
      ? CanvasExport.visible()
      : { x: 0, y: 0, width: W, height: H };
    const origin = book.canvasCamera || { x: 0, y: 0 };
    const x = area.x - origin.x + Math.min(24, area.width * 0.1),
      y = area.y - origin.y + Math.min(24, area.height * 0.1),
      groups = new Map(),
      items = book.pages[page],
      indices = [];
    const incoming = clipboard.values.map((value) => {
      const next = SceneObjects.transform(
        value,
        { dx: x, dy: y },
        { x: 0, y: 0 },
      );
      delete next.canvasObjectId;
      delete next.lectureActionId;
      next.locked = false;
      if (next.points) next.strokeId = uid();
      if (next.groupId) {
        if (!groups.has(next.groupId)) groups.set(next.groupId, uid());
        next.groupId = groups.get(next.groupId);
      }
      return next;
    });
    if (incoming.some((v) => !SceneObjects.valid(v)))
      throw new Error("Объекты не помещаются в допустимые размеры документа");
    // Keep the inserted objects in one undoable command.
    const target = items.length;
    items.push(...incoming, {
      type: "selection-batch",
      count: incoming.length,
    });
    for (let index = 0; index < incoming.length; index++)
      indices.push(target + index);
    redo = [];
    render();
    selection = { book, items, indices };
    update();
    message("Объекты вставлены. Их можно перемещать и редактировать.");
  }
  function transform(options) {
    const entries = values();
    if (entries.some((v) => v.value.locked))
      throw new Error("Сначала разблокируйте выделение");
    requireVectorSafety();
    const box = SceneObjects.combined(entries.map((v) => v.value));
    apply(
      entries.map((v) => ({
        target: v.index,
        value: SceneObjects.transform(v.value, options, {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        }),
      })),
    );
  }
  $("lassoCopy").onclick = safe(copy);
  $("lassoCut").onclick = safe(() => {
    copy();
    deleteSelection();
  });
  $("lassoDelete").onclick = safe(deleteSelection);
  $("lassoPaste").onclick = safe(paste);
  $("lassoDuplicate").onclick = safe(async () => {
    copy();
    await paste();
  });
  $("lassoRotate").onclick = safe(() => transform({ angle: 90 }));
  for (const [id, placement] of [
    ["lassoFront", "front"],
    ["lassoBack", "back"],
  ])
    $(id).onclick = safe(() => {
      requireVectorSafety();
      apply([], { placement, targets: values().map((v) => v.index) });
    });
  $("lassoGroup").onclick = safe(() => {
    const id = uid();
    apply(
      values().map((v) => ({
        target: v.index,
        value: { ...v.value, groupId: id },
      })),
    );
  });
  $("lassoUngroup").onclick = safe(() =>
    apply(
      values().map((v) => {
        const value = { ...v.value };
        delete value.groupId;
        return { target: v.index, value };
      }),
    ),
  );
  $("lassoLock").onclick = safe(() => {
    const locked = !values().some((v) => v.value.locked);
    apply(
      values().map((v) => ({ target: v.index, value: { ...v.value, locked } })),
    );
  });
  $("lassoApplyColor").onclick = safe(() =>
    apply(
      values()
        .filter((v) => v.value.type !== "image-object")
        .map((v) => ({
          target: v.index,
          value: { ...v.value, color: $("lassoColor").value },
        })),
    ),
  );
  $("lassoNew").onclick = clear;
  $("lassoClose").onclick = () => Editor.choose("pen");
  button.onclick = () => {
    finish();
    Editor.choose("lasso");
    clear();
  };
  $("lassoMode").value = preferences.lassoIntersect ? "intersect" : "inside";
  $("lassoMode").onchange = () => {
    preferences.lassoIntersect = $("lassoMode").value === "intersect";
    Editor.persist();
  };
  function start(event, mode) {
    if (
      event.button > 0 ||
      !validPosition(event) ||
      ($("inputMode").value !== "any" && event.pointerType !== "pen")
    )
      return;
    if (mode !== "path")
      try {
        requireVectorSafety();
      } catch (error) {
        message(error.message);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    const point = pos(event);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    active = {
      id: event.pointerId,
      type: event.pointerType,
      mode,
      point,
      latest: point,
      path: [point],
      originals: values().map((v) => ({
        index: v.index,
        value: structuredClone(v.value),
      })),
    };
    saving.input();
    CanvasEditor.session?.autosave.input();
    update();
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (tool !== "lasso" || active) return;
      const entries = values(),
        point = pos(event),
        b = entries.length
          ? SceneObjects.combined(entries.map((v) => v.value))
          : null;
      start(
        event,
        b &&
          point.x >= b.x &&
          point.x <= b.x + b.width &&
          point.y >= b.y &&
          point.y <= b.y + b.height &&
          !entries.some((v) => v.value.locked)
          ? "move"
          : "path",
      );
    },
    true,
  );
  $("lassoResize").onpointerdown = (event) => start(event, "resize");
  function preview() {
    animation = null;
    if (!active) return;
    if (active.mode === "path") {
      contour.setAttribute(
        "d",
        active.path
          .map((p, index) => (index ? "L" : "M") + p.x + " " + p.y)
          .join(" ") + " Z",
      );
      return;
    }
    const box = SceneObjects.combined(active.originals.map((v) => v.value)),
      dx = active.latest.x - active.point.x,
      dy = active.latest.y - active.point.y;
    const scale =
      active.mode === "resize"
        ? Math.max(
            0.05,
            Math.min(
              20,
              Math.max(
                (box.width + dx) / (box.width || 1),
                (box.height + dy) / (box.height || 1),
              ),
            ),
          )
        : 1;
    const center =
      active.mode === "resize" ? { x: box.x, y: box.y } : { x: 0, y: 0 };
    const changes = active.originals.map((v) => ({
      target: v.index,
      value: SceneObjects.transform(
        v.value,
        {
          dx: active.mode === "move" ? dx : 0,
          dy: active.mode === "move" ? dy : 0,
          scale,
        },
        center,
      ),
    }));
    if (changes.every((c) => SceneObjects.valid(c.value))) {
      active.changes = changes;
      Shapes.setPreview({ items: selection.items, changes });
      paint();
      update();
    }
  }
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (
        !active ||
        event.pointerId !== active.id ||
        event.pointerType !== active.type ||
        !validPosition(event)
      )
        return;
      active.latest = pos(event);
      if (
        active.mode === "path" &&
        Math.hypot(
          active.latest.x - active.path.at(-1).x,
          active.latest.y - active.path.at(-1).y,
        ) > 1
      )
        active.path.push(active.latest);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (animation === null) animation = requestAnimationFrame(preview);
    },
    true,
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      if (!active || event.pointerId !== active.id) return;
      active.latest = pos(event);
      preview();
      const action = active;
      active = null;
      Shapes.setPreview(null);
      contour.setAttribute("d", "");
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        if (action.mode === "path") {
          if (action.path.length >= 3)
            selectPath(action.path).catch((error) => message(error.message));
        } else if (
          action.changes &&
          Math.hypot(
            action.latest.x - action.point.x,
            action.latest.y - action.point.y,
          ) > 0.01
        )
          apply(action.changes);
      } catch (error) {
        message(error.message);
      }
      saving.idle();
      CanvasEditor.session?.autosave.idle();
      paint();
      update();
    },
    true,
  );
  for (const type of ["pointercancel", "lostpointercapture"])
    canvas.addEventListener(
      type,
      (event) => {
        if (active?.id === event.pointerId) cancel();
      },
      true,
    );
  document.addEventListener("notepad:gesture-start", cancel);
  document.addEventListener("notepad:tool", () => {
    if (tool !== "lasso") clear();
    update();
  });
  document.addEventListener("notepad:render", () => {
    if (selection && selection.items !== book.pages[page]) clear();
    update();
  });
  document.addEventListener("notepad:screen", clear);
  document.addEventListener("keydown", (event) => {
    if (
      tool !== "lasso" ||
      Home.active ||
      event.target.closest?.("input,textarea,select") ||
      document.querySelector("dialog[open]")
    )
      return;
    if (event.key === "Escape") clear();
    if (active) return;
    if (
      (event.ctrlKey || event.metaKey) &&
      ["c", "x", "v"].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      $(
        "lasso" + { c: "Copy", x: "Cut", v: "Paste" }[event.key.toLowerCase()],
      ).click();
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      $("lassoDelete").click();
    }
  });
  return {
    clear,
    values,
    selectPath,
    copy,
    paste,
    deleteSelection,
    apply,
    transform,
    get active() {
      return !!active;
    },
    get selection() {
      return selection;
    },
    get clipboard() {
      return clipboard;
    },
  };
})();
