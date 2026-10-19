const GraphTools = (() => {
  const controls = $("chartForm").querySelector(".studio-controls"),
    axes = $("chartAxesSection"),
    ranges = axes.querySelector(".chart-ranges"),
    functions = $("chartFunctionSection"),
    stepOne = $("chartStep1"),
    style = $("chartStep3");
  const typeAnchor = document.createComment("graph type return"),
    styleAnchor = document.createComment("graph style return");
  stepOne.before(typeAnchor);
  style.before(styleAnchor);
  const xRange = document.createElement("div");
  xRange.id = "graphXRange";
  xRange.className = "chart-ranges";
  const yRange = document.createElement("div");
  yRange.id = "graphYRange";
  yRange.className = "chart-ranges";
  xRange.append($("chartXMin").parentElement, $("chartXMax").parentElement);
  yRange.append($("chartYMin").parentElement, $("chartYMax").parentElement);
  ranges.replaceWith(xRange, yRange);
  const auto = document.createElement("label");
  auto.id = "graphAutoLabel";
  auto.innerHTML =
    '<input id="graphAutoY" type="checkbox"> Подобрать диапазон Y автоматически';
  yRange.before(auto);
  const status = document.createElement("p");
  status.id = "graphRangeStatus";
  status.className = "hint";
  yRange.after(status);
  const points = document.createElement("details");
  points.id = "graphPointsDetails";
  const summary = document.createElement("summary");
  summary.textContent = "Точки с координатами";
  points.append(summary, $("chartPoints").parentElement, $("chartAddPoint"));
  const heading = [...axes.querySelectorAll("h3")].find(
    (h) => h.textContent === "Точки с координатами",
  );
  heading.replaceWith(points);
  const advanced = document.createElement("details");
  advanced.id = "graphAdvanced";
  advanced.innerHTML = "<summary>Название и оформление</summary>";
  axes.after(advanced);
  const examples = document.createElement("div");
  examples.id = "graphExamples";
  const presets = {
    Парабола: ["y=x^2-4", -5, 5],
    Прямая: ["y=2*x+1", -5, 5],
    Синусоида: ["y=sin(x)", -6.283185307, 6.283185307],
    Гипербола: ["y=1/x", -5, 5],
  };
  for (const [label, [expression, min, max]] of Object.entries(presets)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = () => {
      $("chartExpression").value = expression;
      $("chartXMin").value = min;
      $("chartXMax").value = max;
      $("graphAutoY").checked = true;
      ChartStudio.refresh();
      ChartStudio.rememberAxes();
    };
    examples.append(b);
  }
  functions.firstElementChild.after(examples);
  let active = false;
  function configure() {
    for (const input of $("chartFunctions").querySelectorAll(
      "input[type=color]",
    ))
      input.style.backgroundColor = input.value;
    const next = $("chartKind").value === "function",
      entering = next && !active;
    active = next;
    if (entering) {
      points.open = false;
      queueMicrotask(() => ChartStudio.rememberAxes());
    }
    $("chartDialog").classList.toggle("function-editor", active);
    auto.hidden = !active;
    status.hidden = !active;
    advanced.hidden = !active;
    yRange.hidden = active && $("graphAutoY").checked;
    if (active) {
      axes.prepend(functions);
      advanced.append(stepOne, style);
      $("chartTitle").textContent = "Графики функций";
      status.textContent = $("graphAutoY").checked
        ? "Y подбирается по конечным значениям функций. Панорамирование и zoom переключают диапазон в ручной режим."
        : "Ручной диапазон. Его можно менять полями или движением плоскости.";
    } else {
      typeAnchor.after(stepOne);
      styleAnchor.after(style);
      xRange.after(functions);
      points.open = true;
    }
  }
  function manualView() {
    if (active) {
      $("graphAutoY").checked = false;
      configure();
    }
  }
  document.addEventListener("notepad:chart-open", (e) => {
    $("graphAutoY").checked = e.detail.autoY;
    advanced.open = false;
    points.open = false;
    configure();
  });
  document.addEventListener("notepad:chart-refresh", configure);
  $("graphAutoY").onchange = () => ChartStudio.refresh();
  configure();
  return { manualView };
})();
