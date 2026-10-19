const PenDock = (() => {
  const dock = document.createElement("section");
  dock.id = "penDock";
  dock.setAttribute("aria-label", "Pen Dock — избранные инструменты");
  dock.innerHTML =
    '<button id="togglePenDock" aria-controls="penDockContent"></button><div id="penDockContent"><div class="dock-heading"><strong>Pen Dock</strong><button id="managePenDock" aria-controls="penDockManage">Управлять</button></div><p id="penDockHint" class="hint" role="status"></p><div id="penDockManage" hidden></div></div>';
  document.body.append(dock);
  $("penDockHint").before($("penPresets"));
  $("penDockManage").before($("savePreset"));
  Interface.decorate($("togglePenDock"), "star", "Избранные ручки", true);
  $("savePreset").textContent = "Закрепить текущее перо";
  let expanded = preferences.penDockOpen ?? !!preferences.penPresets?.length,
    managing = false;
  const same = (a, b) =>
    [
      "color",
      "width",
      "penType",
      "opacity",
      "smoothing",
      "stabilization",
    ].every((k) => (a[k] ?? preferences[k]) === (b[k] ?? preferences[k]));
  const save = $("savePreset").onclick;
  $("savePreset").onclick = () => {
    const presets = preferences.penPresets || [];
    if (presets.some((p) => same(p, preferences))) {
      $("penDockHint").textContent = "Это перо уже закреплено.";
      return;
    }
    if (presets.length >= 6) {
      $("penDockHint").textContent =
        "Можно закрепить шесть перьев. Удалите ненужное в разделе «Управлять».";
      return;
    }
    save();
    expanded = true;
    preferences.penDockOpen = true;
    Editor.persist();
    refresh();
    $("penDockHint").textContent = "Перо закреплено.";
  };
  $("togglePenDock").onclick = () => {
    expanded = !expanded;
    preferences.penDockOpen = expanded;
    Editor.persist();
    refresh();
  };
  $("managePenDock").onclick = () => {
    managing = !managing;
    refresh();
  };
  function remove(index) {
    preferences.penPresets = preferences.penPresets.filter(
      (_, i) => i !== index,
    );
    Editor.persist();
    Editor.refreshPresets();
    refresh();
  }
  function reorder(index, delta) {
    const list = preferences.penPresets.slice(),
      target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    preferences.penPresets = list;
    Editor.persist();
    Editor.refreshPresets();
    refresh();
  }
  function refresh() {
    $("penDockContent").hidden = !expanded;
    $("togglePenDock").setAttribute("aria-expanded", String(expanded));
    $("managePenDock").setAttribute("aria-expanded", String(managing));
    $("penDockManage").hidden = !managing;
    const presets = preferences.penPresets || [];
    dock.dataset.populated = String(presets.length > 0);
    dock.dataset.managing = String(managing);
    $("penDockHint").textContent = presets.length
      ? "До шести перьев. Выбор восстанавливает цвет, толщину, прозрачность и коррекцию."
      : "Настройте ручку или маркер и закрепите здесь.";
    for (const b of $("penPresets").children) {
      const p = presets[Number(b.dataset.preset)];
      b.setAttribute(
        "aria-pressed",
        String(!!p && ["pen", "marker"].includes(tool) && same(p, preferences)),
      );
      b.classList.add("pen-preset");
    }
    $("penDockManage").replaceChildren();
    if (managing)
      presets.forEach((p, index) => {
        const row = document.createElement("div");
        row.className = "dock-manage-row";
        const label = document.createElement("span");
        label.textContent =
          (Brushes.labels[p.penType] || "Перо") + " · " + p.width + " px";
        row.append(label);
        for (const [text, action, disabled] of [
          ["Раньше", () => reorder(index, -1), index === 0],
          ["Позже", () => reorder(index, 1), index === presets.length - 1],
          ["Удалить", () => remove(index), false],
        ]) {
          const b = document.createElement("button");
          b.textContent = text;
          b.disabled = disabled;
          b.setAttribute("aria-label", text + ": " + label.textContent);
          b.onclick = action;
          row.append(b);
        }
        $("penDockManage").append(row);
      });
    position();
  }
  function position() {
    const toolbar = $("toolbar");
    if (!dock.isConnected || !toolbar) return;
    const r = toolbar.getBoundingClientRect();
    dock.style.top =
      (preferences.toolbarPosition === "bottom"
        ? Math.max(12, r.top - dock.offsetHeight - 8)
        : r.bottom + 8) + "px";
  }
  new MutationObserver(refresh).observe($("penPresets"), { childList: true });
  document.addEventListener("notepad:tool", () => {
    if (!["pen", "marker", "eraser", "hand"].includes(tool)) expanded = false;
    refresh();
  });
  document.addEventListener("notepad:render", refresh);
  for (const id of [
    "color",
    "width",
    "penType",
    "opacity",
    "smoothing",
    "stabilization",
  ])
    $(id).addEventListener("input", refresh);
  $("toolbarPosition").addEventListener("change", () =>
    requestAnimationFrame(position),
  );
  window.addEventListener("resize", position);
  new ResizeObserver(position).observe($("toolbar"));
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      expanded &&
      !document.querySelector("dialog[open]")
    ) {
      expanded = false;
      preferences.penDockOpen = false;
      Editor.persist();
      refresh();
      $("togglePenDock").focus();
    }
  });
  refresh();
  return { refresh };
})();
