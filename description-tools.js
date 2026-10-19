const DescriptionTools = (() => {
  const pane = $("chartStep2"),
    table = $("chartDataSection"),
    hint = $("chartDataHint");
  const tabs = document.createElement("div");
  tabs.id = "chartInputTabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Способ ввода диаграммы");
  tabs.innerHTML =
    '<button id="chartTableTab" type="button" role="tab" aria-controls="chartTableInput">Таблица</button><button id="chartDescriptionTab" type="button" role="tab" aria-controls="chartDescriptionInput">По описанию</button>';
  const tablePanel = document.createElement("div");
  tablePanel.id = "chartTableInput";
  tablePanel.setAttribute("role", "tabpanel");
  tablePanel.setAttribute("aria-labelledby", "chartTableTab");
  tablePanel.append(hint, table);
  const description = document.createElement("div");
  description.id = "chartDescriptionInput";
  description.setAttribute("role", "tabpanel");
  description.setAttribute("aria-labelledby", "chartDescriptionTab");
  description.innerHTML =
    '<p id="descriptionProvider" class="hint"></p><label>Запрос<textarea id="chartDescription" maxlength="3000" rows="5" placeholder="Построй диаграмму: математика 85, физика 72, информатика 94"></textarea></label><label id="descriptionModeLabel" hidden>Обработка<select id="descriptionMode"><option value="local">Локальный парсер — без сети</option><option value="provider">Подключённый сервис</option></select></label><div class="description-actions"><button type="button" id="parseDescription" class="primary">Разобрать локально</button><button type="button" id="cancelDescription" hidden>Отменить запрос</button></div><p id="descriptionError" role="alert"></p><details><summary>Ограничения и будущее подключение ИИ</summary><p class="hint">Сейчас локальный парсер понимает явные пары «название число», разделённые запятыми, точками с запятой или строками. Он не является нейросетью и не придумывает данные. Для сложных запросов нужен отдельно настроенный серверный адаптер; внешние API и платные сервисы не подключены. Результат любого будущего адаптера проходит ту же проверку и остаётся черновиком до вашего подтверждения.</p></details>';
  const result = document.createElement("p");
  result.id = "descriptionResult";
  result.className = "hint";
  result.setAttribute("role", "status");
  result.hidden = true;
  pane.prepend(tabs, description, tablePanel, result);
  let current = "table",
    pending = null,
    serial = 0;
  function select(tab) {
    current = tab;
    tablePanel.hidden = tab !== "table";
    description.hidden = tab !== "description";
    for (const [id, name] of [
      ["chartTableTab", "table"],
      ["chartDescriptionTab", "description"],
    ]) {
      $(id).setAttribute("aria-selected", String(tab === name));
      $(id).tabIndex = tab === name ? 0 : -1;
    }
  }
  $("chartTableTab").onclick = () => select("table");
  $("chartDescriptionTab").onclick = () => select("description");
  tabs.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      select(current === "table" ? "description" : "table");
      $(current === "table" ? "chartTableTab" : "chartDescriptionTab").focus();
    }
  });
  function providerState() {
    $("descriptionProvider").textContent = ChartRequests.providerLabel
      ? "Доступен сервис: " +
        ChartRequests.providerLabel +
        ". Передаётся только введённый запрос; блокноты не отправляются."
      : "Локальный разбор · без сети · ИИ не подключён";
    $("descriptionModeLabel").hidden = !ChartRequests.providerLabel;
    if (!ChartRequests.providerLabel) $("descriptionMode").value = "local";
    $("parseDescription").textContent =
      $("descriptionMode").value === "local"
        ? "Разобрать локально"
        : "Подготовить вариант";
  }
  function cancel() {
    serial++;
    pending?.abort();
    pending = null;
    $("parseDescription").disabled = false;
    $("cancelDescription").hidden = true;
    description.removeAttribute("aria-busy");
  }
  $("cancelDescription").onclick = () => {
    cancel();
    $("descriptionError").textContent =
      "Запрос отменён. Данные диаграммы не изменены.";
  };
  $("chartDescription").addEventListener("input", () => {
    if (pending) cancel();
  });
  $("descriptionMode").onchange = () => {
    cancel();
    providerState();
  };
  ChartRequests.subscribe(() => {
    cancel();
    providerState();
  });
  $("parseDescription").onclick = async () => {
    cancel();
    const run = serial,
      context = { book, page, items: book.pages[page] },
      text = $("chartDescription").value,
      mode = $("descriptionMode").value;
    try {
      pending = new AbortController();
      description.setAttribute("aria-busy", "true");
      $("parseDescription").disabled = true;
      $("cancelDescription").hidden = mode === "local";
      $("descriptionError").textContent = "";
      const specification =
        mode === "local"
          ? ChartRequests.parse(text)
          : await ChartRequests.generate(text, { signal: pending.signal });
      if (
        run !== serial ||
        !$("chartDialog").open ||
        context.book !== book ||
        context.page !== page ||
        context.items !== book.pages[page]
      )
        return;
      ChartStudio.replaceData(specification);
      result.textContent =
        (mode === "local"
          ? "Разобрано локальным парсером"
          : "Получен вариант от " + ChartRequests.providerLabel) +
        ": " +
        specification.data.length +
        " строк. Проверьте и отредактируйте таблицу; вставка потребует отдельного подтверждения.";
      result.hidden = false;
      select("table");
    } catch (error) {
      if (run === serial)
        $("descriptionError").textContent =
          error?.message || "Не удалось подготовить диаграмму";
    } finally {
      if (run === serial) cancel();
    }
  };
  document.addEventListener("notepad:chart-open", () => {
    cancel();
    $("chartDescription").value = "";
    $("descriptionError").textContent = "";
    result.hidden = true;
    select("table");
    providerState();
    pane.hidden = !ChartWizard.enabled || ChartWizard.step !== 2;
  });
  document.addEventListener("notepad:chart-refresh", () => {
    pane.hidden = !ChartWizard.enabled || ChartWizard.step !== 2;
  });
  $("chartDialog").addEventListener("close", cancel);
  select("table");
  providerState();
  return { select, canProceed: () => current === "table" };
})();
