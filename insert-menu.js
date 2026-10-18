const InsertMenu = (() => {
  const menu = $("extraTools"),
    panel = menu.querySelector(".tool-options"),
    summary = menu.querySelector("summary");
  Interface.decorate(summary, "plus", "Вставить");
  summary.setAttribute("aria-controls", "insertPanel");
  panel.id = "insertPanel";
  panel.setAttribute("aria-label", "Вставить объект");
  const writing = document.createElement("details");
  writing.id = "writingTools";
  writing.innerHTML =
    '<summary aria-label="Настройки письма"></summary><div class="writing-options"></div>';
  $("toolbar").insertBefore(writing, menu);
  Interface.decorate(writing.querySelector("summary"), "pen", "Письмо", true);
  for (const id of [
    "openBrushes",
    "favoriteColors",
    "favoriteColor",
    "favoriteWidths",
    "penPresets",
    "savePreset",
  ])
    writing.lastChild.append($(id));
  writing.lastChild.append(
    $("holdShape").parentElement,
    $("paper").parentElement,
    $("clear"),
  );
  writing.addEventListener("click", (e) => {
    if (e.target.closest("button")) writing.open = false;
  });
  const original = Object.fromEntries(
    ["textTool", "insertImage", "drawShape", "insertChart"].map((id) => [
      id,
      $(id),
    ]),
  );
  const cards = document.createElement("div");
  cards.id = "insertCards";
  const head = document.createElement("div");
  head.className = "insert-head";
  head.innerHTML =
    '<label for="insertSearch">Вставить объект</label><input id="insertSearch" type="search" placeholder="Найти инструмент…" autocomplete="off"><div id="insertFilters"><button type="button" data-filter="all" aria-pressed="true">Все</button><button type="button" data-filter="favorites" aria-pressed="false">Избранное</button><button type="button" data-filter="recent" aria-pressed="false">Недавние</button></div>';
  const selection = document.createElement("div");
  selection.className = "insert-selection";
  selection.append($("selectShape"), $("selectObject"));
  const status = $("imageStatus");
  panel.replaceChildren(head, cards, selection, status);
  const empty = document.createElement("p");
  empty.id = "insertEmpty";
  empty.className = "hint";
  empty.hidden = true;
  empty.textContent =
    "Ничего не найдено. Измените поиск или добавьте инструмент в избранное.";
  cards.after(empty);
  function make(id, label, icon, action) {
    const b = document.createElement("button");
    b.id = id;
    Interface.decorate(b, icon, label);
    b.onclick = () => {
      menu.open = false;
      finish();
      action();
    };
    return b;
  }
  const graph = make("insertGraph", "Графики", "chart", () =>
    ChartStudio.openKind("function"),
  );
  const formula = make("insertFormula", "Формулы", "formula", () =>
    StudyTools.open("math-object"),
  );
  const table = make("insertTable", "Таблицы", "table", () =>
    StudyTools.open("table-object"),
  );
  const sticker = make("insertSticker", "Стикеры", "star", () =>
    StudyTools.open("sticker-object"),
  );
  const templates = make("insertTemplate", "Шаблоны", "pages", () =>
    templateDialog.showModal(),
  );
  const templateDialog = document.createElement("dialog");
  templateDialog.id = "templateDialog";
  templateDialog.innerHTML =
    '<div class="dialog-header"><h2>Учебные шаблоны</h2><button id="closeTemplates" aria-label="Закрыть шаблоны"></button></div><div id="templateChoices" class="settings-content"><p class="hint">Шаблон вставляется как редактируемая таблица. Существующая бумага и записи не меняются.</p></div>';
  document.body.append(templateDialog);
  Interface.decorate($("closeTemplates"), "close", "Закрыть шаблоны", true);
  $("closeTemplates").onclick = () => templateDialog.close();
  for (const [name, cells] of [
    [
      "Математика",
      [
        ["Определение", "Формула", "Пример"],
        ["", "", ""],
        ["", "", ""],
      ],
    ],
    [
      "Физика",
      [
        ["Величина", "Обозначение", "Единица"],
        ["", "", ""],
        ["", "", ""],
      ],
    ],
    [
      "Программирование",
      [
        ["Вход", "Ожидаемый результат", "Проверка"],
        ["", "", ""],
        ["", "", ""],
      ],
    ],
  ]) {
    const b = document.createElement("button");
    b.textContent = name;
    b.onclick = () => {
      templateDialog.close();
      StudyTools.open("table-object", null, null, cells);
    };
    $("templateChoices").append(b);
  }
  const entries = [
    [original.textTool, "Текст", "шрифт клавиатура"],
    [original.insertImage, "Изображения", "фото картинка png jpeg"],
    [original.drawShape, "Фигуры", "круг стрелка геометрия"],
    [formula, "Формулы", "дробь корень интеграл матрица"],
    [original.insertChart, "Диаграммы", "столбцы круг данные"],
    [graph, "Графики", "функция координаты"],
    [table, "Таблицы", "ячейка строки"],
    [sticker, "Стикеры", "важно вопрос идея"],
    [templates, "Шаблоны", "математика физика программирование"],
  ];
  let filter = "all";
  const allowed = new Set(entries.map(([b]) => b.id));
  function favorites() {
    return Array.isArray(preferences.insertFavorites)
      ? preferences.insertFavorites.filter((id) => allowed.has(id))
      : [];
  }
  function recent() {
    return Array.isArray(preferences.insertRecent)
      ? preferences.insertRecent.filter((id) => allowed.has(id))
      : [];
  }
  for (const [b, label, keywords] of entries) {
    const card = document.createElement("div");
    card.className = "insert-card";
    card.dataset.key = b.id;
    card.dataset.search = (label + " " + keywords).toLocaleLowerCase("ru");
    Interface.decorate(
      b,
      {
        textTool: "text",
        insertImage: "image",
        drawShape: "shapes",
        insertChart: "chart",
      }[b.id] ||
        {
          insertFormula: "formula",
          insertTable: "table",
          insertSticker: "star",
          insertTemplate: "pages",
          insertGraph: "chart",
        }[b.id],
      label,
    );
    b.classList.add("insert-action");
    const star = document.createElement("button");
    star.className = "insert-favorite";
    star.type = "button";
    star.setAttribute("aria-label", "В избранное: " + label);
    Interface.decorate(star, "star", "В избранное: " + label, true);
    star.onclick = () => {
      const list = favorites();
      preferences.insertFavorites = list.includes(b.id)
        ? list.filter((id) => id !== b.id)
        : [...list, b.id];
      Editor.persist();
      update();
    };
    card.append(b, star);
    cards.append(card);
    b.addEventListener("click", () => {
      preferences.insertRecent = [
        b.id,
        ...recent().filter((id) => id !== b.id),
      ].slice(0, 9);
      Editor.persist();
      menu.open = false;
    });
  }
  function update() {
    const query = $("insertSearch").value.trim().toLocaleLowerCase("ru"),
      fav = favorites(),
      rec = recent();
    let count = 0;
    for (const card of cards.children) {
      const chosen =
        filter === "all" ||
        (filter === "favorites" ? fav : rec).includes(card.dataset.key);
      card.hidden = !chosen || !card.dataset.search.includes(query);
      if (!card.hidden) count++;
      card
        .querySelector(".insert-favorite")
        .setAttribute("aria-pressed", String(fav.includes(card.dataset.key)));
      card.style.order =
        filter === "recent" ? rec.indexOf(card.dataset.key) : 0;
    }
    $("insertEmpty").hidden = count > 0;
    for (const b of $("insertFilters").children)
      b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
  }
  $("insertSearch").oninput = update;
  for (const b of $("insertFilters").children)
    b.onclick = () => {
      filter = b.dataset.filter;
      update();
    };
  menu.addEventListener("toggle", () => {
    summary.setAttribute("aria-expanded", String(menu.open));
    if (menu.open) {
      writing.open = false;
      filter = "all";
      $("insertSearch").value = "";
      update();
    }
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (writing.open && !writing.contains(e.target)) {
        writing.open = false;
        if (e.target === canvas) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    },
    true,
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && writing.open) {
      writing.open = false;
      writing.querySelector("summary").focus();
    }
  });
  update();
  return { update };
})();
