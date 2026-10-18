const StudyTools = (() => {
  const dialog = document.createElement("dialog");
  dialog.id = "studyDialog";
  dialog.setAttribute("aria-labelledby", "studyTitle");
  dialog.innerHTML =
    '<div class="dialog-header"><h2 id="studyTitle">Вставить</h2><button id="closeStudy" aria-label="Закрыть редактор"></button></div><form id="studyForm" class="settings-content"><div id="studyMath"><label for="studyTex">Формула TeX</label><textarea id="studyTex" rows="4" maxlength="2000"></textarea><div id="formulaKeys"></div><div id="formulaPreview" role="img" aria-label="Предпросмотр формулы"></div></div><div id="studyTable"><div class="study-table-size"><label>Строки<input id="studyRows" type="number" min="1" max="20" value="3"></label><label>Столбцы<input id="studyCols" type="number" min="1" max="8" value="3"></label><button type="button" id="resizeTable">Изменить таблицу</button></div><p class="hint">Уменьшение размера скрывает ячейки только в черновике; закрытие отменяет изменения.</p><div class="studio-table-scroll"><table id="studyCells"></table></div></div><div id="studySticker"><label>Знак<select id="studySymbol"><option value="important">Важно</option><option value="question">Вопрос</option><option value="done">Готово</option><option value="idea">Идея</option></select></label><label>Надпись<input id="studyText" maxlength="80"></label></div><label>Цвет<input id="studyColor" type="color" value="#365ecc"></label><label id="studyFillLabel">Фон<input id="studyFill" type="color" value="#fff5c9"></label><p id="studyError" role="alert"></p><button id="applyStudy" class="primary">Вставить</button></form>';
  document.body.append(dialog);
  Interface.decorate($("closeStudy"), "close", "Закрыть редактор", true);
  let source = null,
    apply = null,
    type = null,
    context = null,
    revision = 0,
    busy = false;
  const keys = {
    Дробь: "\\frac{a}{b}",
    Степень: "x^{2}",
    Индекс: "a_{n}",
    Корень: "\\sqrt{x}",
    Интеграл: "\\int_{0}^{1} x\\,dx",
    Сумма: "\\sum_{n=1}^{N} n",
    Предел: "\\lim_{x\\to 0} x",
    Греческие: "\\alpha+\\beta+\\pi",
    Матрица: "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}",
    Система: "\\begin{cases}x+y=1\\\\x-y=0\\end{cases}",
  };
  for (const [label, value] of Object.entries(keys)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = () => {
      const input = $("studyTex");
      input.setRangeText(
        value,
        input.selectionStart,
        input.selectionEnd,
        "end",
      );
      input.focus();
      preview();
    };
    $("formulaKeys").append(b);
  }
  function cells() {
    return [...$("studyCells").rows].map((r) =>
      [...r.cells].map((td) => td.firstChild.value),
    );
  }
  function table(values) {
    $("studyCells").replaceChildren();
    values.forEach((row, i) => {
      const tr = $("studyCells").insertRow();
      row.forEach((value, j) => {
        const input = document.createElement("input");
        input.value = value;
        input.maxLength = 300;
        input.setAttribute("aria-label", `Ячейка ${i + 1}, ${j + 1}`);
        tr.insertCell().append(input);
      });
    });
    $("studyRows").value = values.length;
    $("studyCols").value = values[0].length;
  }
  function value() {
    return {
      type,
      x: source?.x ?? 80,
      y: source?.y ?? 100,
      width: source?.width ?? (type === "sticker-object" ? 260 : 500),
      height: source?.height ?? (type === "sticker-object" ? 110 : 180),
      color: $("studyColor").value,
      ...(type === "math-object"
        ? { tex: $("studyTex").value }
        : type === "table-object"
          ? { cells: cells(), fill: $("studyFill").value }
          : {
              text: $("studyText").value,
              symbol: $("studySymbol").value,
              fill: $("studyFill").value,
            }),
    };
  }
  async function preview() {
    const n = ++revision;
    $("studyError").textContent = "";
    if (type !== "math-object") return;
    $("applyStudy").disabled = true;
    try {
      const result = await StudyObjects.formula(value());
      if (n !== revision || !dialog.open) return;
      $("formulaPreview").replaceChildren(
        document.importNode(
          new DOMParser().parseFromString(result.svg, "image/svg+xml")
            .documentElement,
          true,
        ),
      );
      $("applyStudy").disabled = false;
    } catch (error) {
      if (n === revision) $("studyError").textContent = error.message;
    }
  }
  function open(kind, object = null, commit = null, template = null) {
    source = object ? structuredClone(object) : null;
    apply = commit;
    type = kind;
    context = { book, page };
    $("studyMath").hidden = kind !== "math-object";
    $("studyTable").hidden = kind !== "table-object";
    $("studySticker").hidden = kind !== "sticker-object";
    $("studyFillLabel").hidden = kind === "math-object";
    $("studyTitle").textContent = {
      "math-object": "Формулы",
      "table-object": "Таблица",
      "sticker-object": "Стикер",
    }[kind];
    $("studyTex").value = object?.tex || "E=mc^{2}";
    $("studyColor").value = object?.color || "#365ecc";
    $("studyFill").value =
      object?.fill || (kind === "table-object" ? "#ffffff" : "#fff5c9");
    $("studyText").value = object?.text || "Важно";
    $("studySymbol").value = object?.symbol || "important";
    table(
      object?.cells ||
        template || [
          ["Тема", "Определение", "Пример"],
          ["", "", ""],
          ["", "", ""],
        ],
    );
    $("applyStudy").disabled = false;
    dialog.showModal();
    preview();
  }
  $("resizeTable").onclick = () => {
    const rows = Number($("studyRows").value),
      cols = Number($("studyCols").value);
    if (
      !Number.isInteger(rows) ||
      rows < 1 ||
      rows > 20 ||
      !Number.isInteger(cols) ||
      cols < 1 ||
      cols > 8
    ) {
      $("studyError").textContent = "От 1 до 20 строк и от 1 до 8 столбцов";
      return;
    }
    const old = cells();
    table(
      Array.from({ length: rows }, (_, i) =>
        Array.from({ length: cols }, (_, j) => old[i]?.[j] || ""),
      ),
    );
  };
  $("studyTex").addEventListener("input", preview);
  $("studyColor").addEventListener("input", preview);
  $("closeStudy").onclick = () => dialog.close();
  dialog.addEventListener("close", () => revision++);
  $("studyForm").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      if (context.book !== book || context.page !== page) {
        dialog.close();
        return;
      }
      const s = value();
      try {
        if (!StudyObjects.valid(s))
          throw new Error("Проверьте параметры объекта");
        if (type === "math-object") {
          const rendered = await StudyObjects.formula(s);
          if (!source)
            s.height = Math.max(30, Math.min(500, s.width * rendered.ratio));
        }
        if (!dialog.open || context.book !== book || context.page !== page)
          return;
        if (apply) apply(s);
        else ObjectTools.add(s);
        dialog.close();
      } catch (error) {
        $("studyError").textContent = error.message;
      }
    } finally {
      busy = false;
    }
  };
  for (const kind of StudyObjects.types)
    ObjectTools.register(kind, {
      label: {
        "math-object": "Формула",
        "table-object": "Таблица",
        "sticker-object": "Стикер",
      }[kind],
      valid: StudyObjects.valid,
      bounds: (s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }),
      resize(s, dx, dy) {
        if (s.type === "math-object") {
          const ratio = Math.max(0.2, Math.min(4, (s.width + dx) / s.width));
          return {
            ...s,
            width: Math.max(40, s.width * ratio),
            height: Math.max(20, s.height * ratio),
          };
        }
        return {
          ...s,
          width: Math.max(80, Math.min(1500, s.width + dx)),
          height: Math.max(40, Math.min(1500, s.height + dy)),
        };
      },
      edit: (s, commit) => open(kind, s, commit),
    });
  return { open };
})();
