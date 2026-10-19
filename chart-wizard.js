const ChartWizard = (() => {
  const dialog = $("chartDialog"),
    form = $("chartForm"),
    controls = form.querySelector(".studio-controls"),
    layout = form.querySelector(".studio-layout"),
    preview = form.querySelector(".studio-preview-panel"),
    footer = form.querySelector(".studio-footer"),
    style = controls.querySelector("details.studio-section");
  const nav = document.createElement("nav");
  nav.id = "chartSteps";
  nav.setAttribute("aria-label", "Шаги создания диаграммы");
  for (const [index, label] of [
    "Тип",
    "Данные",
    "Оформление",
    "Предпросмотр",
  ].entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.chartStep = index + 1;
    const number = document.createElement("span");
    number.textContent = index + 1;
    button.append(number, document.createTextNode(label));
    button.onclick = () => go(index + 1);
    nav.append(button);
  }
  form.before(nav);
  const panes = [1, 2, 3, 4].map((n) => {
    const p = document.createElement("div");
    p.id = "chartStep" + n;
    p.className = "chart-step-pane";
    controls.append(p);
    return p;
  });
  panes[0].append($("chartKind").parentElement);
  const intro = document.createElement("p");
  intro.className = "hint";
  intro.textContent =
    "Выберите диаграмму. Графики функций, координатная плоскость и блок-схемы доступны в этом списке отдельными видами объектов.";
  panes[0].append(intro);
  panes[1].append($("chartDataSection"));
  const dataHint = document.createElement("p");
  dataHint.id = "chartDataHint";
  dataHint.className = "hint";
  panes[1].prepend(dataHint);
  panes[2].append($("chartName").parentElement, style);
  style.open = true;
  style.querySelector("summary").hidden = true;
  panes[3].innerHTML =
    '<h3>Проверьте результат</h3><p class="hint">Таблица, оформление и исходные данные сохраняются вместе с объектом. После вставки можно снова открыть редактор.</p><dl id="chartReview"></dl>';
  const back = document.createElement("button");
  back.type = "button";
  back.id = "chartPrevious";
  back.textContent = "Назад";
  const next = document.createElement("button");
  next.type = "button";
  next.id = "chartNext";
  next.className = "primary";
  next.textContent = "Далее";
  footer.insertBefore(back, $("applyChart"));
  footer.insertBefore(next, $("applyChart"));
  back.onclick = () => go(step - 1);
  next.onclick = () => go(step + 1);
  const dataDetails = $("chartData").closest("details");
  dataDetails.querySelector("summary").textContent =
    "Вставить таблицу из буфера";
  $("chartData").previousElementSibling.textContent =
    "Скопируйте ячейки из Numbers / Excel или введите строки «категория; значение». Для точек: «подпись; X; Y». Десятичная запятая поддерживается.";
  $("chartData").placeholder =
    "Категория\tЗначение\nМатематика\t85\nФизика\t72";
  const primary = ["bar", "line", "pie", "doughnut", "scatter"];
  const primaryOptions = document.createElement("optgroup"),
    otherOptions = document.createElement("optgroup");
  primaryOptions.label = "Диаграммы";
  otherOptions.label = "Другие объекты";
  for (const option of [...$("chartKind").options])
    (primary.includes(option.value) ? primaryOptions : otherOptions).append(option);
  $("chartKind").replaceChildren(primaryOptions, otherOptions);
  let step = 1,
    editing = false,
    enabled = true;
  function configure() {
    enabled = primary.includes($("chartKind").value);
    dialog.classList.toggle("chart-wizard", enabled);
    nav.hidden = !enabled;
    back.hidden = !enabled || step === 1;
    next.hidden = !enabled || step === 4;
    $("applyChart").hidden = enabled && step !== 4;
    for (const [i, p] of panes.entries())
      p.hidden = enabled ? i !== step - 1 : i === 3;
    for (const b of nav.children) {
      b.setAttribute(
        "aria-current",
        b.dataset.chartStep == step ? "step" : "false",
      );
      b.tabIndex = b.dataset.chartStep == step ? 0 : -1;
    }
    if (enabled) {
      $("chartTitle").textContent = editing
        ? "Редактирование диаграммы"
        : "Новая диаграмма";
      $("chartDataHint").textContent = editing
        ? "Данные сохранённой диаграммы. Меняйте ячейки, добавляйте или удаляйте строки."
        : "Показан пример. Замените его своими данными или вставьте ячейки из таблицы.";
    } else
      $("chartTitle").textContent =
        $("chartKind").selectedOptions[0]?.textContent || "Студия";
    if (step === 4 && enabled) {
      try {
        const s = ChartStudio.value();
        const dl = $("chartReview");
        dl.replaceChildren();
        for (const [name, value] of [
          ["Тип", Charts.studioKinds[s.kind]],
          ["Название", s.title || "Без названия"],
          ["Строк", s.data.length],
          ["Тема", Charts.themes[s.style.theme].label],
        ]) {
          const dt = document.createElement("dt"),
            dd = document.createElement("dd");
          dt.textContent = name;
          dd.textContent = value;
          dl.append(dt, dd);
        }
      } catch {}
    }
    requestAnimationFrame(() => {
      ChartStudio.instance()?.resize();
      ChartStudio.instance()?.getZr().flush();
    });
  }
  function go(target) {
    if (!enabled) return true;
    if (target < 1 || target > 4) return false;
    if (target > step && target > 2) {
      ChartStudio.refresh();
      try {
        ChartStudio.value();
      } catch (error) {
        $("chartError").textContent = error.message;
        return false;
      }
    }
    step = target;
    configure();
    dialog.scrollTop = 0;
    panes[step - 1]
      .querySelector("input,select,textarea")
      ?.focus({ preventScroll: true });
    return true;
  }
  form.addEventListener("keydown", (e) => {
    if (
      enabled &&
      step < 4 &&
      e.key === "Enter" &&
      !e.target.matches("textarea,button")
    ) {
      e.preventDefault();
      go(step + 1);
    }
  });
  nav.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const target = Math.max(
        1,
        Math.min(4, step + (e.key === "ArrowRight" ? 1 : -1)),
      );
      if (go(target)) nav.children[target - 1].focus();
    }
  });
  document.addEventListener("notepad:chart-open", (e) => {
    editing = e.detail.editing;
    step = 1;
    configure();
  });
  document.addEventListener("notepad:chart-refresh", configure);
  configure();
  return {
    go,
    get step() {
      return step;
    },
    get enabled() {
      return enabled;
    },
  };
})();
