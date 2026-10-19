(() => {
  document.body.append($("homeNotice"));
  for (const [value, icon, label] of [
    ["all", "pages", "Все блокноты"],
    ["favorites", "star", "Избранное"],
    ["trash", "trash", "Корзина"],
  ])
    Interface.decorate(
      document.querySelector("#homeNav [data-view=" + value + "]"),
      icon,
      label,
    );
  Interface.decorate($("homeNewBook"), "plus", "Новый блокнот");
  const labels = {
    "chart-object": "Диаграмма добавлена. Выделите объект для редактирования.",
    "image-object": "Изображение добавлено.",
    "math-object": "Формула добавлена.",
    "table-object": "Таблица добавлена.",
    "sticker-object": "Стикер добавлен.",
  };
  document.addEventListener("notepad:object-added", (e) =>
    requestAnimationFrame(() =>
      Home.notify(
        e.detail.type === "chart-object" &&
          ["function", "axes"].includes(e.detail.kind)
          ? "График добавлен и остаётся редактируемым."
          : e.detail.kind === "flow"
            ? "Блок-схема добавлена."
            : labels[e.detail.type] || "Объект добавлен.",
      ),
    ),
  );
  document.addEventListener("notepad:text-added", () =>
    requestAnimationFrame(() =>
      Home.notify("Текст добавлен и остаётся редактируемым."),
    ),
  );
  const dialogs = [
    "chartDialog",
    "studyDialog",
    "textDialog",
    "imageDialog",
    "contextDialog",
    "shapeDialog",
    "notebookDialog",
    "notebookActions",
    "folderDialog",
    "templateDialog",
  ];
  for (const id of dialogs)
    $(id)?.addEventListener("close", () =>
      requestAnimationFrame(() => {
        if (document.querySelector("dialog[open]")) return;
        const active = document.activeElement;
        if (
          active &&
          active !== document.body &&
          active.getClientRects().length
        )
          return;
        const target = Home.active
          ? $("homeTitle")
          : TextTools.current()
            ? $("editText")
            : ShapeTools.current()
              ? $("editShape")
              : ObjectTools.current()
                ? $("contextobject")
                : $("extraTools").querySelector("summary");
        if (target && !target.disabled) target.focus({ preventScroll: true });
      }),
    );
  for (const id of [
    "chartDataTable",
    "chartFunctions",
    "graphXRange",
    "graphYRange",
  ])
    $(id).setAttribute("aria-describedby", "chartError");
})();
