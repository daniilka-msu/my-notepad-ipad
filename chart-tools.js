const ChartStudio = (() => {
  const button = document.createElement("button");
  button.id = "insertChart";
  Interface.decorate(button, "chart", "Студия диаграмм");
  $("insertImage").after(button);
  const dialog = document.createElement("dialog");
  dialog.id = "chartDialog";
  dialog.setAttribute("aria-labelledby", "chartTitle");
  dialog.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">MY NOTEPAD · STUDIO</span><h2 id="chartTitle">Диаграммы и графики</h2></div><button id="closeChart" type="button" aria-label="Закрыть студию"></button></div>
  <form id="chartForm"><div class="studio-layout"><section class="studio-controls" aria-label="Данные и оформление">
  <label>Тип объекта<select id="chartKind"></select></label><label>Название<input id="chartName" maxlength="100" placeholder="Например, результаты эксперимента"></label>
  <details open class="studio-section"><summary>Оформление</summary><label>Тема<select id="chartTheme"></select></label><label>Основной цвет<input id="chartColor" type="color" value="#5369d8"></label><div class="studio-toggles"><label><input id="chartLegend" type="checkbox" checked> Легенда</label><label><input id="chartLabels" type="checkbox"> Значения</label><label><input id="chartGrid" type="checkbox" checked> Сетка</label><label id="chartSmoothLabel"><input id="chartSmooth" type="checkbox"> Плавная линия</label></div><div id="chartAxisStyle"><label>Подпись X<input id="chartXTitle" maxlength="60"></label><label>Подпись Y<input id="chartYTitle" maxlength="60"></label><label>Шкала Y<select id="chartScale"><option value="linear">Линейная</option><option value="log">Логарифмическая</option></select></label></div></details>
  <section id="chartDataSection" class="studio-section"><h3>Таблица данных</h3><div class="studio-table-scroll"><table id="chartDataTable"><thead><tr><th>Подпись</th><th id="chartXHeading">X</th><th>Значение Y</th><th></th></tr></thead><tbody></tbody></table></div><button type="button" id="chartAddRow">+ Строка</button><details class="studio-bulk"><summary>Вставить данные списком</summary><label for="chartData">Подпись; значение (для точек: подпись; X; Y)</label><textarea id="chartData" rows="4" maxlength="12000"></textarea></details></section>
  <section id="chartAxesSection" class="studio-section"><h3>Координатная плоскость</h3><div class="chart-ranges"><label>x от<input id="chartXMin" type="number" step="any"></label><label>x до<input id="chartXMax" type="number" step="any"></label><label>y от<input id="chartYMin" type="number" step="any"></label><label>y до<input id="chartYMax" type="number" step="any"></label></div>
  <div id="chartFunctionSection"><h3>Функции</h3><div id="chartFunctions"></div><button id="chartAddFunction" type="button">+ Функция</button><p class="hint">Например: sin(x), x^2, sqrt(abs(x)). Умножение: 2*x. Углы — радианы. Поддерживаются pi, e, + − * / ^, min, max, ln, log, exp и обратные тригонометрические функции.</p></div><h3>Точки с координатами</h3><div class="studio-table-scroll"><table id="chartPoints"><thead><tr><th>Имя</th><th>X</th><th>Y</th><th></th></tr></thead><tbody></tbody></table></div><button id="chartAddPoint" type="button">+ Точка</button></section>
  <section id="chartFlowSection" class="studio-section"><h3>Блоки и связи</h3><p class="hint">Перетаскивайте блоки в предпросмотре. Связи прикреплены к блокам; укажите номера получателей через запятую.</p><div class="studio-table-scroll"><table id="chartFlowTable"><thead><tr><th>№</th><th>Тип</th><th>Текст</th><th>Куда</th><th></th></tr></thead><tbody></tbody></table></div><button id="chartAddNode" type="button">+ Блок</button><div class="studio-align"><button type="button" data-align="left">По левому краю</button><button type="button" data-align="top">По верхнему краю</button><button type="button" data-align="horizontal">Распределить ↔</button><button type="button" data-align="vertical">Распределить ↕</button><button type="button" data-align="grid">Разложить по сетке</button></div><p class="hint">Выравнивание применяется к отмеченным блокам; если отметок нет — ко всем.</p><details class="studio-bulk"><summary>Вставить схему списком</summary><label for="chartNodes">Тип; текст; номера. Типы: start, rect, diamond, io.</label><textarea id="chartNodes" rows="4" maxlength="6000"></textarea></details></section>
  </section><section class="studio-preview-panel" aria-label="Предпросмотр"><div class="studio-preview-heading"><div><span class="eyebrow">ПРЕДПРОСМОТР</span><p id="chartPreviewHint">Изменения видны сразу</p></div><div id="chartZoomControls"><button id="chartZoomIn" type="button" aria-label="Приблизить график">+</button><button id="chartZoomOut" type="button" aria-label="Отдалить график">−</button><button id="chartZoomReset" type="button">Исходный вид</button></div></div><div id="chartPreview" role="img" aria-label="Интерактивный предпросмотр"></div><p id="chartError" role="alert"></p><p class="hint">На листе объект остаётся редактируемым. Изменения применяются только кнопкой внизу; закрытие отменяет черновик.</p></section></div><footer class="studio-footer"><span id="chartDraftStatus" role="status">Черновик · заметка не изменена</span><button id="applyChart" class="primary">Вставить на страницу</button></footer></form>`;
  document.body.append(dialog);
  Interface.decorate($("closeChart"), "close", "Закрыть студию", true);
  for (const [value, label] of Object.entries(Charts.studioKinds))
    $("chartKind").add(new Option(label, value));
  for (const [value, theme] of Object.entries(Charts.themes))
    $("chartTheme").add(new Option(theme.label, value));
  let editing = null,
    apply = null,
    instance = null,
    previewSource = null,
    initialAxes = null,
    hidden = [],
    dataBulk = "",
    flowBulk = "",
    dragging = false;
  const dataBody = $("chartDataTable").tBodies[0],
    pointBody = $("chartPoints").tBodies[0],
    flowBody = $("chartFlowTable").tBodies[0];
  function field(value, type = "text", label = "") {
    const input = document.createElement("input");
    input.type = type;
    input.value = value ?? "";
    input.setAttribute("aria-label", label);
    if (type === "number") {
      input.step = "any";
      input.min = "-1000000000";
      input.max = "1000000000";
    } else input.maxLength = 60;
    return input;
  }
  function cell(row, child) {
    const td = document.createElement("td");
    td.append(child);
    row.append(td);
    return child;
  }
  function removeButton(action, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    Interface.decorate(b, "trash", label, true);
    b.onclick = () => {
      action();
      refresh();
    };
    return b;
  }
  function addData(d = { label: "Новое значение", x: 0, value: 0 }) {
    const row = dataBody.insertRow();
    cell(row, field(d.label, "text", "Подпись"));
    cell(row, field(d.x ?? dataBody.rows.length - 1, "number", "Координата X"));
    cell(row, field(d.value, "number", "Значение Y"));
    cell(
      row,
      removeButton(() => row.remove(), "Удалить строку"),
    );
  }
  function addPoint(p = { name: "", x: 0, y: 0 }) {
    const row = pointBody.insertRow();
    cell(row, field(p.name, "text", "Имя точки"));
    cell(row, field(p.x, "number", "X точки"));
    cell(row, field(p.y, "number", "Y точки"));
    cell(
      row,
      removeButton(() => row.remove(), "Удалить точку"),
    );
  }
  function addFunction(
    f = { expression: "cos(x)", name: "", color: "#16a394" },
  ) {
    const row = document.createElement("div");
    row.className = "studio-function";
    const expression = field(f.expression, "text", "Выражение y=f(x)");
    expression.maxLength = 200;
    expression.dataset.expression = "";
    const name = field(f.name || "", "text", "Имя функции");
    name.placeholder = "Имя функции";
    const color = field(f.color, "color", "Цвет функции");
    row.append(
      expression,
      name,
      color,
      removeButton(() => {
        row.remove();
        functionIDs();
      }, "Удалить функцию"),
    );
    $("chartFunctions").append(row);
    functionIDs();
  }
  function functionIDs() {
    $("chartFunctions")
      .querySelectorAll("[data-expression]")
      .forEach((e, i) => {
        e.id = i === 0 ? "chartExpression" : "chartExpression" + i;
      });
  }
  function readNumber(input) {
    if (!input.value.trim() || !Number.isFinite(Number(input.value)))
      throw new Error("Заполните числовые ячейки");
    return Number(input.value);
  }
  function addNode(
    n = { kind: "rect", text: "Новый блок", next: [], x: 100, y: 100 },
  ) {
    const row = flowBody.insertRow();
    row.dataset.x = n.x;
    row.dataset.y = n.y;
    const check = field("", "checkbox", "Выбрать блок");
    check.dataset.nodeSelect = "";
    cell(row, check);
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Тип блока");
    for (const [kind, label] of Object.entries({
      start: "Начало / конец",
      rect: "Процесс",
      diamond: "Условие",
      io: "Ввод / вывод",
    }))
      select.add(new Option(label, kind));
    select.value = n.kind;
    cell(row, select);
    cell(row, field(n.text, "text", "Текст блока"));
    cell(
      row,
      field(
        n.next.map((i) => i + 1).join(","),
        "text",
        "Номера следующих блоков",
      ),
    );
    cell(
      row,
      removeButton(() => {
        const index = [...flowBody.rows].indexOf(row);
        row.remove();
        for (const other of flowBody.rows) {
          const input = other.cells[3].firstChild;
          input.value = input.value
            .split(",")
            .map((s) => Number(s.trim()) - 1)
            .filter((i) => Number.isInteger(i) && i >= 0 && i !== index)
            .map((i) => (i > index ? i - 1 : i) + 1)
            .join(",");
        }
      }, "Удалить блок"),
    );
  }
  function nodes() {
    return [...flowBody.rows].map((row) => ({
      kind: row.cells[1].firstChild.value,
      text: row.cells[2].firstChild.value,
      next: row.cells[3].firstChild.value.trim()
        ? row.cells[3].firstChild.value
            .split(",")
            .map((s) => Number(s.trim()) - 1)
        : [],
      x: Number(row.dataset.x),
      y: Number(row.dataset.y),
    }));
  }
  function value() {
    const kind = $("chartKind").value,
      s = {
        type: "chart-object",
        chartVersion: 3,
        x: editing?.x ?? 70,
        y: editing?.y ?? 100,
        width: editing?.width ?? 540,
        height: editing?.height ?? 360,
        kind,
        title: $("chartName").value,
        color: $("chartColor").value,
        style: {
          theme: $("chartTheme").value,
          legend: $("chartLegend").checked,
          labels: $("chartLabels").checked,
          grid: $("chartGrid").checked,
          smooth: $("chartSmooth").checked,
          xTitle: $("chartXTitle").value,
          yTitle: $("chartYTitle").value,
          scale: ["bar", "line", "scatter"].includes(kind)
            ? $("chartScale").value
            : "linear",
          hidden: [...hidden],
        },
      };
    if (["bar", "line", "pie", "doughnut", "scatter"].includes(kind))
      s.data = [...dataBody.rows].map((row) => ({
        label: row.cells[0].firstChild.value,
        value: readNumber(row.cells[2].firstChild),
        ...(kind === "scatter"
          ? { x: readNumber(row.cells[1].firstChild) }
          : {}),
      }));
    else if (kind === "flow") s.nodes = nodes();
    else {
      for (const key of ["xMin", "xMax", "yMin", "yMax"])
        s[key] = readNumber($("chart" + key[0].toUpperCase() + key.slice(1)));
      s.points = [...pointBody.rows].map((row) => ({
        name: row.cells[0].firstChild.value,
        x: readNumber(row.cells[1].firstChild),
        y: readNumber(row.cells[2].firstChild),
      }));
      if (kind === "function") {
        s.functions = [...$("chartFunctions").children].map((row) => ({
          expression: row.children[0].value,
          name: row.children[1].value,
          color: row.children[2].value,
        }));
        for (const f of s.functions) MathExpression.compile(f.expression);
        s.expression = s.functions[0]?.expression;
      }
    }
    if (!Charts.valid(s))
      throw new Error(
        "Проверьте данные: до 100 значений, 6 функций, 40 точек или 24 блоков. Для круга нужна положительная сумма; для log — положительные Y; диапазоны осей должны возрастать. Связи ведут к другим существующим блокам.",
      );
    return s;
  }
  function sections() {
    const kind = $("chartKind").value,
      math = ["axes", "function"].includes(kind),
      data = ["bar", "line", "pie", "doughnut", "scatter"].includes(kind);
    $("chartDataSection").hidden = !data;
    $("chartAxesSection").hidden = !math;
    $("chartFunctionSection").hidden = kind !== "function";
    $("chartFlowSection").hidden = kind !== "flow";
    $("chartZoomControls").hidden = !math;
    $("chartAxisStyle").hidden = ![
      "bar",
      "line",
      "scatter",
      "axes",
      "function",
    ].includes(kind);
    $("chartScale").disabled = math;
    $("chartSmoothLabel").hidden = kind !== "line";
    $("chartColor").parentElement.hidden = kind === "function";
    $("chartGrid").parentElement.hidden = ![
      "bar",
      "line",
      "scatter",
      "axes",
      "function",
    ].includes(kind);
    $("chartLegend").parentElement.hidden = kind === "flow";
    $("chartLabels").parentElement.hidden = math || kind === "flow";
    $("chartDataTable").classList.toggle("studio-scatter", kind === "scatter");
    $("chartPreviewHint").textContent = math
      ? "Перетаскивайте плоскость, используйте pinch или + / −"
      : kind === "flow"
        ? "Перетаскивайте блоки — стрелки следуют за ними"
        : "Касайтесь легенды, чтобы скрыть или показать данные";
  }
  function syncBulk() {
    if ($("chartData").value !== dataBulk) {
      const raw = $("chartData").value;
      const parsed = raw
        .trim()
        .split("\n")
        .map((line) => {
          const a = line.split(";");
          if (a.length < 2 || a.length > 3 || !a.at(-1).trim())
            throw new Error("Список: подпись; Y, для точек: подпись; X; Y");
          return {
            label: a[0].trim(),
            x: a.length === 3 ? Number(a[1].replace(",", ".")) : 0,
            value: Number(a.at(-1).replace(",", ".")),
          };
        });
      if (parsed.length > 100) throw new Error("Не более 100 строк данных");
      dataBulk = raw;
      dataBody.replaceChildren();
      parsed.forEach(addData);
    }
    if ($("chartNodes").value !== flowBulk) {
      const raw = $("chartNodes").value;
      const parsed = raw
        .trim()
        .split("\n")
        .map((line, i) => {
          const a = line.split(";");
          if (a.length !== 3)
            throw new Error("Список блоков: тип; текст; номера");
          return {
            kind: a[0].trim(),
            text: a[1].trim(),
            next: a[2].trim()
              ? a[2].split(",").map((n) => Number(n.trim()) - 1)
              : [],
            x: 90 + (i % 3) * 210,
            y: 100 + Math.floor(i / 3) * 100,
          };
        });
      if (parsed.length > 24) throw new Error("Не более 24 блоков");
      flowBulk = raw;
      flowBody.replaceChildren();
      parsed.forEach(addNode);
    }
  }
  function refresh() {
    sections();
    $("chartAddRow").disabled = dataBody.rows.length >= 100;
    $("chartAddNode").disabled = flowBody.rows.length >= 24;
    $("chartAddPoint").disabled = pointBody.rows.length >= 40;
    $("chartAddFunction").disabled = $("chartFunctions").children.length >= 6;
    try {
      syncBulk();
      const s = value();
      $("chartError").textContent = "";
      $("applyChart").disabled = false;
      if (!instance) return;
      previewSource = structuredClone(s);
      instance.setOption(Charts.option(s, true, instance.getWidth()), {
        notMerge: true,
      });
      instance.getZr().flush();
      $("chartDraftStatus").textContent =
        "Черновик · " + Charts.studioKinds[s.kind];
    } catch (error) {
      $("chartError").textContent = error.message;
      $("applyChart").disabled = true;
      $("chartDraftStatus").textContent = "Исправьте данные перед сохранением";
    }
  }
  function captureView() {
    if (
      !instance ||
      !previewSource ||
      !["function", "axes"].includes(previewSource.kind)
    )
      return;
    const zoom = instance.getOption().dataZoom;
    for (const [i, axis] of ["x", "y"].entries()) {
      const min = previewSource[axis + "Min"],
        max = previewSource[axis + "Max"];
      $(axis === "x" ? "chartXMin" : "chartYMin").value = Number(
        (min + ((max - min) * (zoom[i].start ?? 0)) / 100).toPrecision(10),
      );
      $(axis === "x" ? "chartXMax" : "chartYMax").value = Number(
        (min + ((max - min) * (zoom[i].end ?? 100)) / 100).toPrecision(10),
      );
    }
    $("chartDraftStatus").textContent =
      "Диапазон изменён · сохранится вместе с объектом";
  }
  function zoom(factor) {
    if (!instance) return;
    const options = instance.getOption().dataZoom;
    if (
      factor > 1 &&
      options.slice(0, 2).every((z) => (z.end ?? 100) - (z.start ?? 0) > 99.9)
    ) {
      for (const axis of ["x", "y"]) {
        const min = previewSource[axis + "Min"],
          max = previewSource[axis + "Max"],
          center = (min + max) / 2,
          half = ((max - min) * factor) / 2;
        $(axis === "x" ? "chartXMin" : "chartYMin").value = Math.max(
          -1000000,
          center - half,
        );
        $(axis === "x" ? "chartXMax" : "chartYMax").value = Math.min(
          1000000,
          center + half,
        );
      }
      refresh();
      return;
    }
    instance.dispatchAction({
      type: "dataZoom",
      batch: [0, 1].map((i) => {
        const start = options[i].start ?? 0,
          end = options[i].end ?? 100,
          center = (start + end) / 2,
          half = Math.min(50, ((end - start) * factor) / 2);
        return {
          dataZoomIndex: i,
          start: Math.max(0, center - half),
          end: Math.min(100, center + half),
        };
      }),
    });
    captureView();
  }
  $("chartZoomIn").onclick = () => zoom(0.7);
  $("chartZoomOut").onclick = () => zoom(1.4);
  $("chartZoomReset").onclick = () => {
    for (const key of ["xMin", "xMax", "yMin", "yMax"])
      $("chart" + key[0].toUpperCase() + key.slice(1)).value = initialAxes[key];
    refresh();
  };
  function rememberNodes() {
    if (!instance || previewSource?.kind !== "flow") return;
    const data = instance.getModel().getSeriesByIndex(0).getData();
    [...flowBody.rows].forEach((row, i) => {
      const p = data.getItemLayout(i);
      if (p) {
        row.dataset.x = Math.max(0, Math.min(10000, p[0]));
        row.dataset.y = Math.max(0, Math.min(10000, p[1]));
      }
    });
    $("chartDraftStatus").textContent = "Положение блоков изменено · черновик";
  }
  for (const b of dialog.querySelectorAll("[data-align]"))
    b.onclick = () => {
      let rows = [...flowBody.rows].filter(
        (row) => row.cells[0].firstChild.checked,
      );
      if (!rows.length) rows = [...flowBody.rows];
      const mode = b.dataset.align;
      if (mode === "grid")
        rows.forEach((row, i) => {
          row.dataset.x = 90 + (i % 3) * 210;
          row.dataset.y = 100 + Math.floor(i / 3) * 100;
        });
      else if (mode === "left" || mode === "top") {
        const key = mode === "left" ? "x" : "y",
          min = Math.min(...rows.map((r) => Number(r.dataset[key])));
        rows.forEach((r) => (r.dataset[key] = min));
      } else if (rows.length > 1) {
        const key = mode === "horizontal" ? "x" : "y";
        rows.sort((a, b) => Number(a.dataset[key]) - Number(b.dataset[key]));
        const min = Number(rows[0].dataset[key]),
          max = Number(rows.at(-1).dataset[key]);
        rows.forEach(
          (r, i) =>
            (r.dataset[key] = min + ((max - min) * i) / (rows.length - 1)),
        );
      }
      refresh();
    };
  $("chartAddRow").onclick = () => {
    if (dataBody.rows.length < 100) addData();
    refresh();
  };
  $("chartAddPoint").onclick = () => {
    if (pointBody.rows.length < 40) addPoint();
    refresh();
  };
  $("chartAddFunction").onclick = () => {
    if ($("chartFunctions").children.length < 6) addFunction();
    refresh();
  };
  $("chartAddNode").onclick = () => {
    if (flowBody.rows.length < 24)
      addNode({
        kind: "rect",
        text: "Новый блок",
        next: [],
        x: 90 + (flowBody.rows.length % 3) * 210,
        y: Math.min(380, 100 + Math.floor(flowBody.rows.length / 3) * 75),
      });
    refresh();
  };
  function open(source, commit) {
    editing = source ? Charts.upgrade(source) : null;
    apply = commit || null;
    const s = editing || {
      kind: "bar",
      title: "",
      color: "#5369d8",
      style: {
        theme: "studio",
        legend: true,
        labels: false,
        grid: true,
        smooth: false,
        xTitle: "",
        yTitle: "",
        scale: "linear",
      },
    };
    $("chartKind").value = s.kind;
    $("chartName").value = s.title;
    $("chartColor").value = s.color;
    for (const [key, id] of [
      ["theme", "chartTheme"],
      ["xTitle", "chartXTitle"],
      ["yTitle", "chartYTitle"],
      ["scale", "chartScale"],
    ])
      $(id).value = s.style[key];
    for (const [key, id] of [
      ["legend", "chartLegend"],
      ["labels", "chartLabels"],
      ["grid", "chartGrid"],
      ["smooth", "chartSmooth"],
    ])
      $(id).checked = s.style[key];
    hidden = [...(s.style.hidden || [])];
    dataBody.replaceChildren();
    (
      s.data || [
        { label: "Понедельник", value: 3 },
        { label: "Вторник", value: 7 },
        { label: "Среда", value: 5 },
      ]
    ).forEach(addData);
    $("chartData").value = dataBulk = "";
    pointBody.replaceChildren();
    (s.points || []).forEach(addPoint);
    $("chartFunctions").replaceChildren();
    (
      s.functions || [{ expression: "sin(x)", name: "f(x)", color: s.color }]
    ).forEach(addFunction);
    flowBody.replaceChildren();
    (
      s.nodes || [
        { kind: "start", text: "Начало", next: [1] },
        { kind: "rect", text: "Действие", next: [2] },
        { kind: "diamond", text: "Условие", next: [1, 3] },
        { kind: "start", text: "Конец", next: [] },
      ]
    ).forEach((n, i) =>
      addNode({
        ...n,
        x: n.x ?? 90 + (i % 3) * 210,
        y: n.y ?? 100 + Math.floor(i / 3) * 100,
      }),
    );
    $("chartNodes").value = flowBulk = "";
    initialAxes = {
      xMin: s.xMin ?? -10,
      xMax: s.xMax ?? 10,
      yMin: s.yMin ?? -5,
      yMax: s.yMax ?? 5,
    };
    for (const key of Object.keys(initialAxes))
      $("chart" + key[0].toUpperCase() + key.slice(1)).value = initialAxes[key];
    $("applyChart").textContent = source
      ? "Применить изменения"
      : "Вставить на страницу";
    dialog.showModal();
    dialog.scrollTop = 0;
    if (instance) instance.dispose();
    instance = echarts.init($("chartPreview"), null, {
      renderer: "canvas",
      devicePixelRatio: Math.min(2, devicePixelRatio || 1),
    });
    instance.on("datazoom", captureView);
    instance.on("legendselectchanged", (e) => {
      hidden = Object.entries(e.selected)
        .filter(([, v]) => !v)
        .map(([key]) => key);
    });
    instance.getZr().on("mousedown", () => (dragging = true));
    instance.getZr().on("mouseup", () => {
      if (dragging) rememberNodes();
      dragging = false;
    });
    refresh();
  }
  // Edge uses ZRender's pointer branch, which omits touch gesture recognition.
  if (echarts.inputEnvironment.pointerEventsSupported) {
    for (const [name, phase] of [
      ["touchstart", "start"],
      ["touchmove", "change"],
      ["touchend", "end"],
    ])
      $("chartPreview").addEventListener(
        name,
        (e) => {
          if (!instance) return;
          const handler = instance.getZr().handler,
            event = echarts.normalizeInput(handler.proxy.dom, e);
          event.zrByTouch = true;
          handler.processGesture(event, phase);
          if (phase === "change" && e.touches.length === 1)
            handler.mousemove(event);
          e.preventDefault();
        },
        { passive: false },
      );
    $("chartPreview").addEventListener("pointermove", (e) => {
      if (instance && e.pointerType === "pen")
        instance
          .getZr()
          .handler.mousemove(
            echarts.normalizeInput(instance.getZr().handler.proxy.dom, e),
          );
    });
  }
  const observer = new ResizeObserver(() => {
    if (instance) {
      instance.resize();
      instance.getZr().flush();
    }
  });
  observer.observe($("chartPreview"));
  $("chartForm").addEventListener("input", (e) => {
    if (e.target.matches("[data-node-select]")) return;
    if (e.target.id === "chartTheme") {
      const colors = Charts.themes[$("chartTheme").value].colors,
        known = Object.values(Charts.themes).flatMap((t) => t.colors);
      $("chartColor").value = colors[0];
      [...$("chartFunctions").children].forEach((row, i) => {
        if (known.includes(row.children[2].value))
          row.children[2].value = colors[i % colors.length];
      });
    }
    refresh();
  });
  $("closeChart").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    if (instance) {
      instance.dispose();
      instance = null;
    }
    previewSource = null;
    editing = null;
    apply = null;
    dragging = false;
  });
  button.onclick = () => {
    finish();
    $("extraTools").open = false;
    open(null);
  };
  $("chartForm").onsubmit = (e) => {
    e.preventDefault();
    try {
      syncBulk();
      const s = value();
      if (apply) apply(s);
      else ObjectTools.add(s);
      dialog.close();
    } catch (error) {
      $("chartError").textContent = error.message;
    }
  };
  ObjectTools.register("chart-object", {
    label: "Студия диаграмм",
    valid: Charts.valid,
    bounds: (s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }),
    resize: (s, dx, dy) => ({
      ...s,
      width: Math.max(80, Math.min(4000, s.width + dx)),
      height: Math.max(60, Math.min(4000, s.height + dy)),
    }),
    edit: open,
  });
  return { value, refresh, instance: () => instance, openKind(kind){open(null);$("chartKind").value=kind;refresh()} };
})();
