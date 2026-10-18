const ContextTools = (() => {
  const dialog = document.createElement("dialog");
  dialog.id = "contextDialog";
  dialog.setAttribute("aria-labelledby", "contextTitle");
  dialog.innerHTML =
    '<div class="dialog-header"><h2 id="contextTitle">Свойства</h2><button id="closeContext" aria-label="Закрыть свойства"></button></div><form id="contextForm" class="settings-content"><div id="contextFields"></div><p id="contextError" role="alert"></p><button class="primary" id="applyContext">Применить</button></form>';
  document.body.append(dialog);
  Interface.decorate($("closeContext"), "close", "Закрыть свойства", true);
  $("closeContext").onclick = () => dialog.close();
  let draft = null;
  function field(id, label, value, type = "number", options = null) {
    const row = document.createElement("label");
    row.textContent = label;
    const input = document.createElement(options ? "select" : "input");
    input.id = id;
    if (options)
      for (const [v, text] of options) input.add(new Option(text, v));
    else input.type = type;
    if (type === "checkbox") input.checked = !!value;
    else input.value = value;
    if (type === "number" && !options) {
      input.step = "any";
      input.required = true;
    }
    row.append(input);
    $("contextFields").append(row);
    return input;
  }
  function open(kind) {
    const api =
        kind === "shape"
          ? ShapeTools
          : kind === "text"
            ? TextTools
            : ObjectTools,
      s = api.current();
    if (!s) return;
    draft = { kind, api, source: structuredClone(s), book, page };
    $("contextFields").replaceChildren();
    $("contextError").textContent = "";
    $("contextTitle").textContent =
      kind === "shape"
        ? "Оформление фигуры"
        : kind === "text"
          ? "Оформление текста"
          : s.type === "image-object"
            ? "Размер изображения"
            : "Размер объекта";
    if (kind === "shape") {
      const b = Shapes.bounds(s),
        scale = Paper.geometry(book).outputHeight / H;
      field("contextColor", "Контур", s.color, "color");
      field("contextWidth", "Толщина", s.width);
      field(
        "contextOpacity",
        "Непрозрачность, %",
        Math.round((s.opacity ?? 1) * 100),
      );
      field("contextFilled", "Заливка", !!s.fill, "checkbox");
      field("contextFill", "Цвет заливки", s.fill || "#a9b9ff", "color");
      field("contextDash", "Линия", s.dash || "solid", "select", [
        ["solid", "Сплошная"],
        ["dashed", "Пунктир"],
        ["dotted", "Точки"],
      ]);
      if (s.shape === "rect")
        field("contextRadius", "Радиус углов", s.radius || 0);
      field("contextW", "Ширина", Math.round((b.right - b.x) * 100) / 100);
      field(
        "contextH",
        "Высота",
        Math.round((b.bottom - b.y) * scale * 100) / 100,
      );
      field("contextRotation", "Повернуть на, °", 0);
      field("contextAlign", "По странице", "none", "select", [
        ["none", "Без выравнивания"],
        ["left", "Слева"],
        ["center", "По центру"],
        ["right", "Справа"],
      ]);
    } else if (kind === "text") {
      field(
        "contextFont",
        "Шрифт",
        s.font,
        "select",
        Object.keys(TextBlocks.fonts).map((v) => [v, v]),
      );
      field("contextSize", "Размер", s.size);
      field("contextColor", "Цвет", s.color, "color");
      for (const [id, label, key] of [
        ["contextBold", "Полужирный", "bold"],
        ["contextItalic", "Курсив", "italic"],
        ["contextUnderline", "Подчёркивание", "underline"],
      ])
        field(id, label, s[key], "checkbox");
      field("contextAlign", "Выравнивание", s.align, "select", [
        ["left", "Слева"],
        ["center", "По центру"],
        ["right", "Справа"],
      ]);
      field("contextFilled", "Фон", !!s.background, "checkbox");
      field("contextFill", "Цвет фона", s.background || "#fff5c9", "color");
    } else {
      field("contextW", "Ширина", s.width);
      if (s.type !== "image-object" && s.type !== "math-object")
        field("contextH", "Высота", s.height);
      else {
        const hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent = "Пропорции сохраняются.";
        $("contextFields").append(hint);
      }
      if (s.type === "image-object")
        field(
          "contextRotation",
          "Поворот",
          s.rotation,
          "select",
          [0, 90, 180, 270].map((v) => [String(v), v + "°"]),
        );
    }
    dialog.showModal();
  }
  function transformShape(
    s,
    width,
    height,
    angle = 0,
    align = "none",
    notebook = book,
  ) {
    const scale = Paper.geometry(notebook).outputHeight / H,
      b = Shapes.bounds(s),
      bw = b.right - b.x,
      bh = (b.bottom - b.y) * scale;
    if (
      ![width, height, angle].every(Number.isFinite) ||
      width < 1 ||
      height < 1 ||
      width > 10000 ||
      height > 10000 ||
      Math.abs(angle) > 3600
    )
      throw new Error("Проверьте размер и угол поворота");
    if (
      Math.abs(width - bw) < 0.02 &&
      Math.abs(height - bh) < 0.02 &&
      angle === 0 &&
      align === "none"
    )
      return structuredClone(s);
    let sx = width / (bw || 1),
      sy = height / (bh || 1);
    if (s.shape === "circle") {
      if (Math.abs(width - bw) > 0.02) sx = sy = sx;
      else sx = sy = sy;
    }
    const cx = (b.x + b.right) / 2,
      cy = ((b.y + b.bottom) * scale) / 2,
      a = (angle * Math.PI) / 180;
    const points = s.points.map((p) => {
      const x = (p.x - cx) * sx,
        y = (p.y * scale - cy) * sy;
      return {
        ...p,
        x: cx + x * Math.cos(a) - y * Math.sin(a),
        y: (cy + x * Math.sin(a) + y * Math.cos(a)) / scale,
      };
    });
    const value = { ...s, points };
    delete value.shapeStart;
    delete value.shapeEnd;
    const box = Shapes.bounds(value),
      offset =
        align === "left"
          ? 0 - box.x
          : align === "center"
            ? (W - (box.right - box.x)) / 2 - box.x
            : align === "right"
              ? W - box.right
              : 0;
    value.points = value.points.map((p) => ({ ...p, x: p.x + offset }));
    return value;
  }
  $("contextForm").onsubmit = (e) => {
    e.preventDefault();
    if (!draft || draft.book !== book || draft.page !== page) {
      dialog.close();
      return;
    }
    const { kind, api, source: s } = draft,
      current = api.current();
    if (!current || JSON.stringify(current) !== JSON.stringify(s)) {
      $("contextError").textContent =
        "Объект изменился. Откройте свойства снова.";
      return;
    }
    const num = (id) => Number($(id).value);
    let value;
    try {
      if (kind === "text") {
        value = {
          ...s,
          font: $("contextFont").value,
          size: num("contextSize"),
          color: $("contextColor").value,
          bold: $("contextBold").checked,
          italic: $("contextItalic").checked,
          underline: $("contextUnderline").checked,
          align: $("contextAlign").value,
          background: $("contextFilled").checked
            ? $("contextFill").value
            : null,
        };
        if (!TextBlocks.valid(value))
          throw new Error("Размер текста: от 8 до 120");
      } else if (kind === "shape") {
        value = transformShape(
          s,
          num("contextW"),
          num("contextH"),
          num("contextRotation"),
          $("contextAlign").value,
        );
        value = {
          ...value,
          color: $("contextColor").value,
          width: num("contextWidth"),
          opacity: num("contextOpacity") / 100,
          fill:
            Shapes.closed.has(s.shape) && $("contextFilled").checked
              ? $("contextFill").value
              : null,
          dash: $("contextDash").value,
          radius: $("contextRadius") ? num("contextRadius") : s.radius,
        };
        if (
          value.width < 1 ||
          value.width > 25 ||
          value.opacity < 0 ||
          value.opacity > 1 ||
          !Number.isFinite(value.width) ||
          !Number.isFinite(value.opacity) ||
          value.radius < 0 ||
          value.radius > 200
        )
          throw new Error(
            "Толщина: 1–25; непрозрачность: 0–100; радиус: 0–200",
          );
      } else {
        const width = num("contextW");
        value = {
          ...s,
          width,
          height: $("contextH")
            ? num("contextH")
            : (s.height * width) / s.width,
        };
        if (s.type === "image-object") value.rotation = num("contextRotation");
        const valid =
          s.type === "image-object"
            ? ImageObjects.valid
            : s.type === "chart-object"
              ? Charts.valid
              : StudyObjects.valid;
        if (!valid(value)) throw new Error("Проверьте размер объекта");
      }
      api.commit(value);
      dialog.close();
    } catch (error) {
      $("contextError").textContent = error.message;
    }
  };
  for (const [kind, id] of [
    ["text", "textInspector"],
    ["shape", "shapeInspector"],
    ["object", "objectInspector"],
  ]) {
    const button = document.createElement("button");
    button.id = "context" + kind;
    Interface.decorate(button, "settings", "Оформление");
    button.onclick = () => open(kind);
    $(id).prepend(button);
    $(id).setAttribute("role", "toolbar");
    $(id).setAttribute("aria-label", "Действия с выделенным объектом");
  }
  const lock = document.createElement("button");
  lock.id = "lockObject";
  lock.onclick = () => {
    const s = ObjectTools.current();
    if (s?.type === "image-object")
      ObjectTools.commit({ ...s, locked: !s.locked });
  };
  $("objectInspector").append(lock);
  const duplicate = document.createElement("button");
  duplicate.id = "duplicateObject";
  duplicate.textContent = "Дублировать";
  duplicate.onclick = () => {
    const s = ObjectTools.current();
    if (s && !s.locked)
      ObjectTools.add({ ...structuredClone(s), x: s.x + 24, y: s.y + 24 });
  };
  $("objectInspector").append(duplicate);
  const exportButton = document.createElement("button");
  exportButton.id = "exportObject";
  exportButton.textContent = "PNG объекта";
  $("objectInspector").append(exportButton);
  async function exportCanvas() {
    const s = ObjectTools.current();
    if (!s) throw new Error("Выберите объект");
    const notebook = book,
      b = s.type === "image-object" ? ImageObjects.bounds(s) : s,
      scale = Paper.geometry(notebook).outputHeight / H;
    const source = await Documents.compose(
        {
          ...notebook,
          paper: "blank",
          paperColor: "white",
          pages: [[structuredClone(s)]],
          backgrounds: undefined,
        },
        0,
      ),
      target = document.createElement("canvas");
    target.width = Math.max(1, Math.ceil(b.width));
    target.height = Math.max(1, Math.ceil(b.height * scale));
    target
      .getContext("2d")
      .drawImage(
        source,
        b.x,
        b.y * scale,
        b.width,
        b.height * scale,
        0,
        0,
        target.width,
        target.height,
      );
    return target;
  }
  exportButton.onclick = async () => {
    exportButton.disabled = true;
    try {
      const c = await exportCanvas(),
        blob = await new Promise((r) => c.toBlob(r, "image/png"));
      if (!blob) throw new Error("Не удалось создать PNG");
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "my-notepad-object.png";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      $("saveStatus").textContent = "Экспорт: " + error.message;
    } finally {
      exportButton.disabled = false;
    }
  };
  function update() {
    const s = ObjectTools.current();
    lock.hidden = s?.type !== "image-object";
    lock.textContent = s?.locked ? "Разблокировать" : "Заблокировать";
    duplicate.disabled = !!s?.locked;
    $("contextobject").disabled = !!s?.locked;
  }
  document.addEventListener("notepad:render", update);
  document.addEventListener("notepad:tool", update);
  new MutationObserver(update).observe($("objectInspector"), {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  new MutationObserver(update).observe($("objectName"), { childList: true });
  update();
  return { open, transformShape, exportCanvas };
})();
