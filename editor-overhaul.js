(() => {
  const toolbar = $("toolbar");
  const shelf = document.createElement("div");
  shelf.id = "writingShelf";
  shelf.setAttribute("aria-label", "Быстрые параметры письма");
  const colors = document.createElement("div");
  colors.className = "writing-colors";
  colors.setAttribute("role", "group");
  colors.setAttribute("aria-label", "Цвет пера");
  const widths = document.createElement("div");
  widths.className = "writing-widths";
  widths.setAttribute("role", "group");
  widths.setAttribute("aria-label", "Толщина пера");
  const precise = document.createElement("details");
  precise.id = "preciseInk";
  const summary = document.createElement("summary");
  Interface.decorate(summary, "pen", "Точная настройка цвета и толщины", true);
  const contents = document.createElement("div");
  contents.className = "precise-ink-content";
  contents.append(document.querySelector(".pen-properties"));
  precise.append(summary, contents);
  shelf.append(colors, widths, precise);
  toolbar.append(shelf);
  let colorKey = "";
  function sync() {
    const palette = (
      preferences.favoriteColors || ["#222222", "#365ecc", "#c03943", "#23856b"]
    ).slice(0, 4);
    const key = palette.join(",");
    if (key !== colorKey) {
      colorKey = key;
      colors.replaceChildren();
      for (const color of palette) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.color = color;
        button.setAttribute("aria-label", "Цвет " + color);
        const dot = document.createElement("span");
        dot.style.background = color;
        button.append(dot);
        button.onclick = () => change("color", color);
        colors.append(button);
      }
    }
    for (const button of colors.children)
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.color === preferences.color),
      );
    for (const button of widths.children)
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.width) === preferences.width),
      );
    shelf.hidden = !["pen", "marker"].includes(tool);
    $("navigationMode").setAttribute("aria-pressed", String(tool === "hand"));
  }
  function change(id, value) {
    finish();
    $(id).value = value;
    $(id).dispatchEvent(new Event("input"));
    sync();
  }
  for (const width of [1, 3, 6]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.width = width;
    button.setAttribute("aria-label", "Толщина " + width + " px");
    const sample = document.createElement("span");
    sample.style.height = Math.max(2, width) + "px";
    button.append(sample);
    button.onclick = () => change("width", width);
    widths.append(button);
  }
  const mode = document.querySelector("[data-tool=hand]");
  mode.id = "navigationMode";
  Interface.decorate(mode, "hand", "Навигация без письма", true);
  mode.onclick = () => Editor.choose(tool === "hand" ? "pen" : "hand");
  $("toggleSidebar").after(mode);
  $("focusMode").addEventListener("click", () => {
    if (document.body.classList.contains("focus-mode")) toolbar.prepend(mode);
    else $("toggleSidebar").after(mode);
  });
  const quickEraser = document.createElement("button");
  quickEraser.id = "toggleEraserMode";
  Interface.decorate(quickEraser, "eraser", "Режим ластика");
  toolbar.append(quickEraser);
  function eraserState() {
    quickEraser.hidden = tool !== "eraser";
    const whole = preferences.eraserMode === "stroke";
    quickEraser.querySelector(".button-label").textContent = whole
      ? "Целый штрих"
      : "Участок линии";
    quickEraser.setAttribute(
      "aria-label",
      (whole ? "Целый штрих" : "Участок линии") +
        " · переключить режим ластика",
    );
  }
  quickEraser.onclick = () => {
    finish();
    $("eraserMode").value =
      preferences.eraserMode === "stroke" ? "pixel" : "stroke";
    $("eraserMode").dispatchEvent(new Event("input"));
    eraserState();
  };
  for (const id of ["color", "width", "favoriteColor", "eraserMode"])
    $(id).addEventListener(id === "favoriteColor" ? "click" : "input", () => {
      sync();
      eraserState();
    });
  document.addEventListener("notepad:tool", () => {
    sync();
    eraserState();
  });
  for (const [id, tools] of [
    ["brushDialog", ["pen", "marker"]],
    ["eraserDialog", ["eraser"]],
  ]) {
    const panel = $(id);
    panel.classList.add("floating-tool-panel");
    panel.setAttribute("aria-modal", "false");
    const state = () => {
      for (const name of tools) {
        const button = document.querySelector('[data-tool="' + name + '"]');
        button.setAttribute("aria-controls", id);
        button.setAttribute(
          "aria-expanded",
          String(panel.open && tool === name),
        );
      }
      if (panel.open) precise.open = false;
    };
    new MutationObserver(state).observe(panel, {
      attributes: true,
      attributeFilter: ["open"],
    });
    state();
  }
  function closePanels() {
    precise.open = false;
    for (const id of ["brushDialog", "eraserDialog"])
      if ($(id).open) $(id).close();
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target.closest?.("input,textarea,select,[contenteditable=true]"))
        return;
      const open = [...document.querySelectorAll(".floating-tool-panel[open]")];
      if (!precise.open && !open.length) return;
      if (e.target.closest?.("#toolbar,.floating-tool-panel,#penDock")) return;
      closePanels();
      if (e.target.closest?.("#page")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      (precise.open || document.querySelector(".floating-tool-panel[open]"))
    ) {
      closePanels();
      document
        .querySelector('[data-tool="' + tool + '"]')
        ?.focus({ preventScroll: true });
      e.preventDefault();
    }
  });
  document.addEventListener("notepad:tool", () => {
    precise.open = false;
    if (!["pen", "marker"].includes(tool) && $("brushDialog").open)
      $("brushDialog").close();
    if (tool !== "eraser" && $("eraserDialog").open) $("eraserDialog").close();
  });
  document.addEventListener("notepad:screen", closePanels);
  // Touch styluses must not start selection or a callout on the application chrome.
  document.addEventListener("selectstart", (e) => {
    const target = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    if (
      target?.closest(
        "#app,#pagesDialog,#brushDialog,#eraserDialog,#penDock,#settingsDialog label",
      ) &&
      !target.closest(
        "input,textarea,[contenteditable=true],.selectable-content",
      )
    )
      e.preventDefault();
  });
  sync();
  eraserState();
})();
