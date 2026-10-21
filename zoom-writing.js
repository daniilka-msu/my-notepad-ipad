window.ZoomWriting = (() => {
  const button = document.createElement("button");
  button.id = "openZoomWriting";
  button.append(
    NotepadIcons.create("pen"),
    document.createTextNode("Окно письма"),
  );
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "zoomWriting");
  $("viewControls").append(button);
  const panel = document.createElement("section");
  panel.id = "zoomWriting";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Окно компактного письма");
  panel.innerHTML =
    '<div class="zoom-writing-controls"><strong>Окно письма</strong><button id="pickWritingArea" aria-pressed="false">Область</button><label>Увеличение <select id="writingMagnification"><option value="2">2×</option><option value="3" selected>3×</option><option value="4">4×</option><option value="6">6×</option></select></label><label><input id="writingAuto" type="checkbox" checked> Автосдвиг</label><button id="writingRight" aria-label="Область письма вправо">Вправо →</button><button id="writingLine">Новая строка</button><button id="writingErase">Ластик</button><button id="closeZoomWriting" aria-label="Закрыть окно письма">Закрыть</button></div><p id="writingHint" class="hint" role="status">Выберите область на листе. Пишите в увеличенном поле ручкой, маркером или ластиком.</p><canvas id="writingCanvas" aria-label="Увеличенное поле для рукописного ввода"></canvas>';
  $("workspace").after(panel);
  const area = document.createElement("div");
  area.id = "writingArea";
  area.setAttribute("aria-hidden", "true");
  area.hidden = true;
  $("page").append(area);
  const field = $("writingCanvas"),
    surface = InkSurface.create(field),
    paper = document.createElement("canvas");
  let view = { x: 40, y: 80, width: 250, height: 60 },
    frame = null,
    picking = false,
    movingPointer = null,
    notebook = null;
  let magnification = [2, 3, 4, 6].includes(preferences.writingMagnification)
    ? preferences.writingMagnification
    : 3;
  $("writingMagnification").value = magnification;
  function clamp() {
    view.x = Math.max(0, Math.min(W - view.width, view.x));
    view.y = Math.max(0, Math.min(H - view.height, view.y));
  }
  function lockArea() {
    for (const id of [
      "pickWritingArea",
      "writingMagnification",
      "writingRight",
      "writingLine",
      "writingAuto",
    ])
      $(id).disabled = movingPointer !== null;
  }
  function fieldRect() {
    const r = field.getBoundingClientRect();
    return {
      left: r.left + field.clientLeft,
      top: r.top + field.clientTop,
      width: field.clientWidth,
      height: field.clientHeight,
    };
  }
  function refresh() {
    frame = null;
    if (panel.hidden || !panel.isConnected) return;
    try {
      const r = fieldRect();
      if (!r.width || !r.height) return;
      if (movingPointer === null) {
        view.width = Math.min(W, r.width / magnification);
        view.height = Math.min(
          H,
          r.height / ((magnification * Paper.geometry(book).outputHeight) / H),
        );
        clamp();
      }
      const metrics = surface.draw(
        book.pages[page],
        view,
        r.width,
        r.height,
        drawing,
      );
      const c = field.getContext("2d");
      const background = book.backgrounds?.[page],
        image = $("pageBackground");
      const paperKey = JSON.stringify([
        metrics.width,
        metrics.height,
        view,
        book.paper,
        book.paperColor,
        book.gridMm,
        book.pageSize,
        background?.id,
        image.currentSrc,
        image.naturalWidth,
        !image.hidden && image.complete,
      ]);
      if (paper.dataset.key !== paperKey) {
        paper.dataset.key = paperKey;
        paper.width = metrics.width;
        paper.height = metrics.height;
        const p = paper.getContext("2d");
        p.setTransform(
          metrics.sx,
          0,
          0,
          metrics.sy,
          -view.x * metrics.sx,
          -view.y * metrics.sy,
        );
        if (!background) Paper.draw(p, book);
        else if (!image.hidden && image.complete && image.naturalWidth) {
          const height = Paper.geometry(book).outputHeight,
            scale = Math.min(
              W / image.naturalWidth,
              height / image.naturalHeight,
            );
          const width = image.naturalWidth * scale,
            docHeight = (image.naturalHeight * scale * H) / height;
          p.drawImage(
            image,
            (W - width) / 2,
            (H - docHeight) / 2,
            width,
            docHeight,
          );
        }
      }
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "destination-over";
      c.drawImage(paper, 0, 0);
      c.restore();
      field.style.background =
        paperColors[book.paperColor] || paperColors.white;
      area.style.left = (view.x / W) * 100 + "%";
      area.style.top = (view.y / H) * 100 + "%";
      area.style.width = (view.width / W) * 100 + "%";
      area.style.height = (view.height / H) * 100 + "%";
      area.hidden = false;
      panel.dataset.x = view.x;
      panel.dataset.y = view.y;
      panel.dataset.width = view.width;
      panel.dataset.height = view.height;
    } catch {
      close();
      $("operationStatus").textContent =
        "Не удалось выделить память для окна письма. Продолжайте на основном листе.";
      $("operationStatus").hidden = false;
    }
  }
  function schedule() {
    if (!panel.hidden && frame === null) frame = requestAnimationFrame(refresh);
  }
  function setPicking(value) {
    picking = value;
    $("pickWritingArea").setAttribute("aria-pressed", String(value));
    $("writingHint").textContent = value
      ? "Коснитесь нужного места на странице."
      : "Пишите в увеличенном поле. Автосдвиг происходит только после завершения штриха.";
  }
  function close() {
    finish();
    panel.hidden = true;
    area.hidden = true;
    setPicking(false);
    button.setAttribute("aria-expanded", "false");
    surface.release();
    paper.width = paper.height = 1;
    paper.dataset.key = "";
    movingPointer = null;
    lockArea();
    button.focus({ preventScroll: true });
  }
  button.onclick = () => {
    if (!panel.hidden) {
      close();
      return;
    }
    finish();
    window.LectureUI?.hide();
    panel.hidden = false;
    notebook = book.id;
    button.setAttribute("aria-expanded", "true");
    if (!["pen", "marker", "eraser"].includes(tool)) Editor.choose("pen");
    setPicking(true);
    schedule();
  };
  $("closeZoomWriting").onclick = close;
  $("pickWritingArea").onclick = () => {
    finish();
    setPicking(!picking);
  };
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (panel.hidden || !picking) return;
      if (
        !["touch", "pen", "mouse"].includes(e.pointerType) ||
        (e.pointerType === "mouse" && e.button !== 0)
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const point = pos(e);
      view.x = point.x;
      view.y = point.y;
      clamp();
      setPicking(false);
      surface.invalidate();
      schedule();
    },
    true,
  );
  function move(line = false) {
    finish();
    if (line || view.x + view.width * 1.75 > W) {
      view.x = 40;
      view.y = Math.min(H - view.height, view.y + view.height * 0.8);
    } else view.x += view.width * 0.75;
    clamp();
    surface.invalidate();
    schedule();
  }
  $("writingRight").onclick = () => move();
  $("writingLine").onclick = () => move(true);
  $("writingErase").onclick = () => {
    Editor.choose(tool === "eraser" ? "pen" : "eraser");
    $("writingErase").setAttribute("aria-pressed", String(tool === "eraser"));
  };
  $("writingMagnification").onchange = () => {
    finish();
    magnification = Number($("writingMagnification").value);
    preferences.writingMagnification = magnification;
    Editor.persist();
    surface.invalidate();
    schedule();
  };
  function mapped(e) {
    const r = fieldRect(),
      main = canvas.getBoundingClientRect();
    const x = view.x + ((e.clientX - r.left) / r.width) * view.width,
      y = view.y + ((e.clientY - r.top) / r.height) * view.height;
    const event = new PointerEvent(e.type, {
      bubbles: true,
      cancelable: true,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      button: e.button,
      buttons: e.buttons,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      clientX: main.left + (x / W) * main.width,
      clientY: main.top + (y / H) * main.height,
    });
    Object.defineProperties(event, {
      tiltX: { value: e.tiltX },
      tiltY: { value: e.tiltY },
      notepadCaptureTarget: { value: field },
      notepadInputX: { value: e.clientX },
      notepadInputY: { value: e.clientY },
      timeStamp: { value: e.timeStamp },
    });
    return event;
  }
  for (const type of [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ])
    field.addEventListener(type, (e) => {
      if (panel.hidden) return;
      if (type === "pointerdown") {
        if (
          movingPointer !== null &&
          !(e.pointerType === "pen" && activeType === "touch")
        )
          return;
        if (!["pen", "marker", "eraser"].includes(tool)) Editor.choose("pen");
        refresh();
        if (panel.hidden) return;
      } else if (movingPointer !== e.pointerId) return;
      e.preventDefault();
      const event = mapped(e);
      if (type === "pointermove" || type === "pointerup")
        Object.defineProperty(event, "getCoalescedEvents", {
          value: () => {
            let samples = [];
            try {
              samples = e.getCoalescedEvents?.() || [];
            } catch {}
            return samples.map((sample) => mapped(sample));
          },
        });
      if (type === "pointerdown") movingPointer = e.pointerId;
      canvas.dispatchEvent(event);
      if (type === "pointerdown" && !drawing) movingPointer = null;
      lockArea();
      if (["pointerup", "pointercancel", "lostpointercapture"].includes(type)) {
        const completed = book.pages[page].at(-1);
        movingPointer = null;
        lockArea();
        if (
          $("writingAuto").checked &&
          completed?.tool !== "eraser" &&
          completed?.tool !== "stroke-eraser" &&
          completed?.points?.at(-1)?.x > view.x + view.width * 0.84
        )
          move();
      }
      schedule();
    });
  new ResizeObserver(schedule).observe(field);
  $("pageBackground").addEventListener("load", schedule);
  document.addEventListener("notepad:render", () => {
    if (!panel.hidden && book.id !== notebook) {
      close();
      return;
    }
    schedule();
  });
  document.addEventListener("notepad:screen", () => {
    if (document.body.classList.contains("home-view") && !panel.hidden) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) close();
  });
  return {
    schedule,
    close,
    invalidate: surface.invalidate,
    get view() {
      return { ...view };
    },
  };
})();
