window.CanvasOverview = (() => {
  const button = document.createElement("button");
  button.id = "canvasOverviewToggle";
  button.textContent = "Обзор";
  button.setAttribute("aria-controls", "canvasOverview");
  button.setAttribute("aria-expanded", "false");
  $("canvasNavigation").append(button);
  const panel = document.createElement("section");
  panel.id = "canvasOverview";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Обзор документа и закладки");
  panel.innerHTML =
    '<div class="lasso-heading"><strong>Обзор документа</strong><button id="canvasOverviewClose" aria-label="Закрыть обзор"></button></div><p class="hint">Занятые области и текущее окно. Коснитесь карты для перехода; стрелки клавиатуры перемещают окно.</p><canvas id="canvasMinimap" width="400" height="360" tabindex="0" role="img" aria-label="Мини-карта документа. Стрелки — перемещение, Home — начало."></canvas><form id="canvasBookmarkForm"><label for="canvasBookmarkName">Закладка текущего положения</label><div><input id="canvasBookmarkName" maxlength="120" placeholder="Например, Производные" required><button id="canvasBookmarkAdd" type="submit" aria-label="Добавить закладку">+</button></div></form><p id="canvasOverviewStatus" role="status"></p><ul id="canvasBookmarks" aria-label="Закладки документа"></ul>';
  $("workspace").append(panel);
  Interface.decorate($("canvasOverviewClose"), "close", "Закрыть обзор", true);
  const map = $("canvasMinimap"),
    context = map.getContext("2d");
  let timer = null,
    frame = null,
    opened = !!preferences.canvasOverview,
    source = null,
    bookmarkSignature = "",
    lastBook = null,
    busy = false;
  function available() {
    return (
      !!book?.canvasDocument &&
      CanvasEditor.session?.book.id === book.id &&
      !Home.active
    );
  }
  function message(text) {
    $("canvasOverviewStatus").textContent = text;
  }
  function updateVisibility() {
    const visible = opened && available();
    panel.hidden = !visible;
    button.setAttribute("aria-expanded", String(visible));
    if (visible) schedule();
  }
  function toggle(value) {
    opened = value;
    preferences.canvasOverview = value;
    Editor.persist();
    updateVisibility();
    if (!value) button.focus();
  }
  button.onclick = () => toggle(!opened);
  $("canvasOverviewClose").onclick = () => toggle(false);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      toggle(false);
    }
  });
  function schedule() {
    if (timer !== null || panel.hidden) return;
    timer = setTimeout(() => {
      timer = null;
      if (activeInkInput() || CanvasEditor.loading) {
        schedule();
        return;
      }
      draw();
    }, 180);
  }
  function list(bookmarks) {
    const signature = book.id + JSON.stringify(bookmarks);
    if (signature === bookmarkSignature) return;
    bookmarkSignature = signature;
    const list = $("canvasBookmarks");
    list.replaceChildren();
    if (!bookmarks.length) {
      const item = document.createElement("li");
      item.className = "hint";
      item.textContent = "Пока нет закладок";
      list.append(item);
    }
    for (const value of bookmarks) {
      const item = document.createElement("li"),
        go = document.createElement("button"),
        remove = document.createElement("button");
      go.textContent = value.name;
      go.title =
        "X " +
        Math.round(value.camera.x) +
        " · Y " +
        Math.round(value.camera.y);
      go.onclick = () => navigate(value.camera);
      Interface.decorate(
        remove,
        "delete",
        "Удалить закладку «" + value.name + "»",
        true,
      );
      remove.onclick = () => {
        if (activeInkInput() || busy) return;
        CanvasEditor.session.model.removeBookmark(value.id);
        CanvasEditor.session.autosave.dirty();
        draw();
        message("Закладка удалена. Изменение будет сохранено автоматически.");
      };
      item.append(go, remove);
      list.append(item);
    }
  }
  function draw() {
    if (panel.hidden || !available() || activeInkInput()) return;
    const session = CanvasEditor.session,
      overview = session.model.overview,
      visible = CanvasExport.visible(),
      continuous = book.canvasDocument.format === "continuous",
      size = SpatialDocument.tileSize;
    if (lastBook !== book.id) {
      lastBook = book.id;
      message("");
      $("canvasBookmarkName").value = "";
    }
    let left = continuous ? 0 : visible.x,
      top = visible.y,
      right = continuous ? 794 : visible.x + visible.width,
      bottom = visible.y + visible.height;
    const rectangles = overview.tiles
      .map((key) => {
        const [x, y] = key.split(",").map(Number);
        return { x: x * size, y: y * size, width: size, height: size };
      })
      .concat(overview.pending);
    for (const box of rectangles) {
      left = Math.min(left, continuous ? 0 : box.x);
      top = Math.min(top, box.y);
      right = Math.max(right, continuous ? 794 : box.x + box.width);
      bottom = Math.max(bottom, box.y + box.height);
    }
    if (continuous) top = 0;
    const width = Math.max(794, right - left),
      height = Math.max(1123, bottom - top),
      scale = Math.min((map.width - 32) / width, (map.height - 32) / height),
      offsetX = (map.width - width * scale) / 2,
      offsetY = (map.height - height * scale) / 2;
    frame = { left, top, scale, offsetX, offsetY, visible };
    source = book.id;
    context.clearRect(0, 0, map.width, map.height);
    const style = getComputedStyle(panel),
      accent = style.getPropertyValue("--accent").trim() || "#5369d8",
      muted = style.getPropertyValue("--muted").trim() || "#68718b";
    context.fillStyle = muted;
    context.globalAlpha = 0.12;
    context.fillRect(offsetX, offsetY, width * scale, height * scale);
    context.globalAlpha = 0.45;
    for (const box of rectangles) {
      const x = continuous ? 0 : box.x,
        w = continuous ? 794 : box.width;
      context.fillRect(
        offsetX + (x - left) * scale,
        offsetY + (box.y - top) * scale,
        Math.max(2, w * scale),
        Math.max(2, box.height * scale),
      );
    }
    context.globalAlpha = 0.14;
    context.fillStyle = accent;
    context.fillRect(
      offsetX + (visible.x - left) * scale,
      offsetY + (visible.y - top) * scale,
      Math.max(6, visible.width * scale),
      Math.max(6, visible.height * scale),
    );
    context.globalAlpha = 1;
    context.strokeStyle = accent;
    context.lineWidth = 3;
    context.strokeRect(
      offsetX + (visible.x - left) * scale,
      offsetY + (visible.y - top) * scale,
      Math.max(6, visible.width * scale),
      Math.max(6, visible.height * scale),
    );
    map.setAttribute(
      "aria-label",
      "Мини-карта: X " +
        Math.round(visible.x) +
        ", Y " +
        Math.round(visible.y) +
        ". Стрелки — перемещение, Home — начало.",
    );
    list(overview.bookmarks);
  }
  async function navigate(camera) {
    if (busy || !available() || activeInkInput()) return;
    busy = true;
    const id = book.id;
    panel.setAttribute("aria-busy", "true");
    try {
      const moved = await CanvasEditor.move(camera);
      if (!moved || book.id !== id) {
        message("Переход не выполнен. Проверьте состояние сохранения.");
        return;
      }
      if (camera.zoom !== undefined) {
        PageView.setZoom(camera.zoom);
        $("workspace").scrollLeft = camera.scrollX || 0;
        $("workspace").scrollTop = camera.scrollY || 0;
        CanvasEditor.capture();
      }
      message("Положение восстановлено.");
    } catch (error) {
      message(error.message);
    } finally {
      busy = false;
      panel.removeAttribute("aria-busy");
      schedule();
    }
  }
  map.addEventListener("pointerup", (event) => {
    if (!frame || source !== book.id || event.button > 0) return;
    const box = map.getBoundingClientRect(),
      px = ((event.clientX - box.left) / box.width) * map.width,
      py = ((event.clientY - box.top) / box.height) * map.height;
    const x =
        frame.left +
        (px - frame.offsetX) / frame.scale -
        frame.visible.width / 2,
      y =
        frame.top +
        (py - frame.offsetY) / frame.scale -
        frame.visible.height / 2;
    navigate({ x, y, scrollX: 0, scrollY: 0 });
  });
  map.addEventListener("keydown", (event) => {
    const delta = {
      ArrowLeft: [-500, 0],
      ArrowRight: [500, 0],
      ArrowUp: [0, -600],
      ArrowDown: [0, 600],
    }[event.key];
    if (!delta && event.key !== "Home") return;
    event.preventDefault();
    event.stopPropagation();
    const camera = CanvasEditor.session.camera;
    navigate(
      event.key === "Home"
        ? { x: 0, y: 0 }
        : { x: camera.x + delta[0], y: camera.y + delta[1] },
    );
  });
  $("canvasBookmarkForm").onsubmit = (event) => {
    event.preventDefault();
    if (!available() || activeInkInput() || busy) return;
    try {
      CanvasEditor.capture();
      const session = CanvasEditor.session;
      session.model.bookmark($("canvasBookmarkName").value, {
        ...session.camera,
        zoom: PageView.zoom,
        scrollX: $("workspace").scrollLeft,
        scrollY: $("workspace").scrollTop,
      });
      session.autosave.dirty();
      $("canvasBookmarkName").value = "";
      draw();
      message("Закладка добавлена. Изменение будет сохранено автоматически.");
    } catch (error) {
      message(error.message);
    }
  };
  for (const type of ["notepad:render", "notepad:screen"])
    document.addEventListener(type, updateVisibility);
  $("workspace").addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  new MutationObserver(schedule).observe($("zoomValue"), { childList: true });
  new MutationObserver(schedule).observe($("saveStatus"), { childList: true });
  document.addEventListener("change", schedule);
  updateVisibility();
  return {
    draw,
    navigate,
    get frame() {
      return frame;
    },
    get visible() {
      return !panel.hidden;
    },
  };
})();
