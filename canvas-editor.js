window.CanvasEditor = (() => {
  let session = null,
    loading = false,
    swapping = false,
    sequence = 0,
    inputGeneration = 0;
  const originalRender = render,
    originalSave = save,
    originalCompose = Documents.compose;
  const undo = $("undo").onclick,
    redoAction = $("redo").onclick;
  const originalClear = $("clear").onclick;
  $("clear").onclick = () => {
    if (!book.canvasDocument) return originalClear();
    if (
      !confirm(
        "Удалить все объекты текущего участка листа, включая выходящие за его границы? Действие можно отменить.",
      )
    )
      return;
    finish();
    book.pages[0].push({
      tool: "stroke-eraser",
      color: "#000000",
      width: 1,
      points: [],
      targets: book.pages[0].map((_, index) => index),
    });
    redo = [];
    render();
  };
  const legacyTrack = Library.track;
  Library.track = (value) => {
    if (!value.canvasDocument) legacyTrack(value);
  };
  const status = (text) => {
    $("operationStatus").hidden = false;
    $("operationStatus").textContent = text;
  };
  const formats = document.createElement("fieldset");
  formats.id = "documentFormats";
  formats.innerHTML =
    '<legend>Формат документа</legend><label><input type="radio" name="documentFormat" value="paged"><span><strong>Обычный A4</strong><small>Отдельные страницы</small></span></label><label><input type="radio" name="documentFormat" value="continuous" checked><span><strong>Бесконечный A4</strong><small>Ширина A4, письмо вниз без разрывов</small></span></label><label><input type="radio" name="documentFormat" value="infinite"><span><strong>Бескрайнее поле</strong><small>Схемы во всех направлениях</small></span></label>';
  $("notebookName").closest("label").after(formats);
  const paperOptions = document.createElement("div");
  paperOptions.innerHTML =
    '<label>Цвет бумаги<select id="notebookPaperColor"><option value="white">Белая</option><option value="cream">Кремовая</option><option value="gray">Тёмно-серая</option><option value="black">Чёрная</option></select></label><label>Начальный масштаб<select id="notebookZoom"><option value="0.5">50%</option><option value="1" selected>100%</option><option value="2">200%</option><option value="3">300%</option></select></label>';
  formats.after(paperOptions);
  const nativePos = pos;
  pos = function (event, rectangle) {
    const value = nativePos(event, rectangle);
    if (book.canvasDocument?.format === "continuous")
      value.x = Math.max(0, Math.min(W, value.x));
    return value;
  };
  function bounds(s) {
    if(window.SceneObjects)return SceneObjects.bounds(s);
    if (!s.type&&s.points?.length) {
      const box = s.points.reduce(
          (r, p) => ({
            x: Math.min(r.x, p.x),
            y: Math.min(r.y, p.y),
            right: Math.max(r.right, p.x),
            bottom: Math.max(r.bottom, p.y),
          }),
          { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity },
        ),
        margin = (s.width || 1) * 2;
      return {
        x: box.x - margin,
        y: box.y - margin,
        width: box.right - box.x + margin * 2,
        height: box.bottom - box.y + margin * 2,
      };
    }
    if (s.type === "image-object")
      return ImageObjects.bounds(s, { pageSize: "a4" });
    return {
      x: s.x || 0,
      y: s.y || 0,
      width: s.width || 320,
      height:
        s.type === "text-block" ? TextBlocks.layout(s).height : s.height || 200,
    };
  }
  function translate(s, x, y) {
    const result = structuredClone(s);
    if (result.type === "text") {
      result.x ??= 36;
      result.y ??= 50;
    }
    if (result.points&&(!result.type||result.type==='chart-object'&&result.pointSpace!=='math'))
      result.points = result.points.map((p) => ({
        ...p,
        x: p.x + x,
        y: p.y + y,
      }));
    if (!result.type&&result.rawPoints)
      result.rawPoints = result.rawPoints.map((p) => ({
        ...p,
        x: p.x + x,
        y: p.y + y,
      }));
    for (const key of ["shapeStart", "shapeEnd"])
      if (!result.type&&result[key]) {
        result[key].x += x;
        result[key].y += y;
      }
    if (typeof result.x === "number") result.x += x;
    if (typeof result.y === "number") result.y += y;
    delete result.canvasObjectId;
    return result;
  }
  function capture() {
    const s = session;
    if (!s || loading || swapping || s.book.id !== book.id) return;
    if (s.book.pages.length > 1) {
      const combined = s.book.pages[0];
      for (let index = 1; index < s.book.pages.length; index++) {
        const source = s.book.pages[index],
          hidden = new Set(
            source
              .filter((v) => v.tool === "stroke-eraser")
              .flatMap((v) => v.targets),
          );
        for (const [i, item] of Shapes.ordered(source, false))
          if (item && !hidden.has(i) && item.tool !== "stroke-eraser")
            combined.push({
              ...translate(item, 0, index * H),
              canvasObjectId: uid(),
            });
      }
      s.book.pages = [combined];
      page = 0;
      redo = [];
    }
    const workspace = $("workspace");
    if (
      s.camera.zoom !== PageView.zoom ||
      s.camera.scrollX !== workspace.scrollLeft ||
      s.camera.scrollY !== workspace.scrollTop
    ) {
      s.camera.zoom = PageView.zoom;
      s.camera.scrollX = workspace.scrollLeft;
      s.camera.scrollY = workspace.scrollTop;
      s.model.camera(s.camera);
      s.autosave.dirty();
    }
    const items = s.book.pages[0],
      hidden = new Set(
        items
          .filter((v) => v.tool === "stroke-eraser")
          .flatMap((v) => v.targets),
      );
    const next = new Map(),
      orders = new Map();
    for (const action of items)
      if (action.type === "object-order" && !action.canvasApplied) {
        const id = items[action.target]?.canvasObjectId;
        if (id)
          orders.set(
            id,
            (action.placement === "back" ? -1 : 1) * s.model.nextOrder(),
          );
        action.canvasApplied = true;
      }
    for(const action of items)if(action.type==='selection-edit'&&action.placement&&!action.canvasApplied){
      const targets=action.placement==='back'?[...action.targets].reverse():action.targets;
      for(const target of targets){const id=items[target]?.canvasObjectId;if(id)orders.set(id,(action.placement==='back'?-1:1)*s.model.nextOrder())}
      action.canvasApplied=true;
    }
    for (const [index, value] of Shapes.ordered(items, false)) {
      if (!value || hidden.has(index) || value.tool === "stroke-eraser")
        continue;
      const id = value.canvasObjectId || items[index]?.canvasObjectId || uid();
      value.canvasObjectId = id;
      const content =
        value.type === "text"
          ? {
              type: "text-block",
              text: value.text,
              x: value.x ?? 36,
              y: value.y ?? 50,
              width: 722,
              size: 18,
              font: "Arial",
              color: value.color || "#222222",
              align: "left",
              bold: false,
              italic: false,
            }
          : value;
      const previous = s.visible.get(id);
      if(value.type==='chart-object'&&(!previous||items.some(action=>action.type==='object-edit'&&action.value===value)))value.pointSpace='math';
      const cached = s.localCache.get(value),
        reuse =
          cached &&
          cached.x === s.camera.x &&
          cached.y === s.camera.y &&
          cached.strokeId === value.strokeId &&
          cached.lectureActionId === value.lectureActionId;
      const canonical = reuse
        ? cached.value
        : translate(content, s.camera.x, s.camera.y);
      const box = reuse ? cached.bounds : bounds(canonical);
      if (!reuse && s.book.canvasDocument.format === "continuous") {
        const right = Math.min(794, box.x + box.width),
          bottom = Math.max(0, box.y + box.height);
        box.x = Math.max(0, box.x);
        box.y = Math.max(0, box.y);
        box.width = right - box.x;
        box.height = bottom - box.y;
      }
      s.localCache.set(value, {
        x: s.camera.x,
        y: s.camera.y,
        strokeId: value.strokeId,
        lectureActionId: value.lectureActionId,
        value: canonical,
        bounds: box,
      });
      const order = orders.get(id) ?? previous?.order ?? s.model.nextOrder();
      next.set(
        id,
        previous?.value === canonical && previous.order === order
          ? previous
          : { id, order, value: canonical, bounds: box },
      );
    }
    const changes = [];
    for (const [id, value] of next)
      if (
        value !== s.visible.get(id) &&
        JSON.stringify(value) !== JSON.stringify(s.visible.get(id))
      )
        changes.push({ id, before: s.visible.get(id) || null, after: value });
    for (const [id, value] of s.visible)
      if (!next.has(id)) changes.push({ id, before: value, after: null });
    if (changes.length) {
      s.model.commit(changes);
      s.book.modifiedAt = Date.now();
      s.visible = next;
      s.autosave.dirty();
    }
    $("undo").disabled = s.model.cursor === 0;
    $("redo").disabled = s.model.cursor === s.model.head;
  }
  async function install(
    items,
    camera = session?.camera,
    expectedGeneration = null,
  ) {
    const s = session;
    if (!s) return;
    await Promise.all([
      ImageObjects.prepare(items.map((v) => v.value)),
      StudyObjects.prepare(items.map((v) => v.value)),
    ]);
    if (
      session !== s ||
      (expectedGeneration !== null &&
        (drawing || inputGeneration !== expectedGeneration))
    )
      return false;
    swapping = true;
    ShapeTools.clear();
    TextTools.clear();
    ObjectTools.clear();
    s.camera = camera;
    items=items.map(entry=>{
      if(entry.value.type!=='chart-object')return entry;
      const box=bounds(entry.value);if(s.book.canvasDocument.format==='continuous'){const right=Math.min(794,box.x+box.width),bottom=Math.max(0,box.y+box.height);box.x=Math.max(0,box.x);box.y=Math.max(0,box.y);box.width=right-box.x;box.height=bottom-box.y}
      if(JSON.stringify(box)!==JSON.stringify(entry.bounds)){const next={...entry,bounds:box};s.model.reindex(next);return next}return entry;
    });
    s.visible = new Map(items.map((v) => [v.id, v]));
    s.book.canvasCamera = { ...s.camera };
    ImageObjects.retain(
      items
        .filter((v) => v.value.type === "image-object")
        .map((v) => v.value.asset),
    );
    s.localCache = new WeakMap();
    s.book.pages = [
      items.map((v) => {
        const local = {
          ...translate(v.value, -s.camera.x, -s.camera.y),
          canvasObjectId: v.id,
        };
        s.localCache.set(local, {
          x: s.camera.x,
          y: s.camera.y,
          strokeId: local.strokeId,
          lectureActionId: local.lectureActionId,
          value: v.value,
          bounds: v.bounds,
        });
        return local;
      }),
    ];
    page = 0;
    redo = [];
    originalRender();
    swapping = false;
    $("undo").disabled = s.model.cursor === 0;
    $("redo").disabled = s.model.cursor === s.model.head;
    $("canvasPosition").textContent =
      "X " + Math.round(s.camera.x) + " · Y " + Math.round(s.camera.y);
    $("canvasLeft").hidden = $("canvasRight").hidden =
      s.book.canvasDocument.format === "continuous";
    return true;
  }
  async function queryWindow(s, camera) {
    const continuous = s.book.canvasDocument.format === "continuous",
      down = camera.y >= s.camera.y;
    const area = {
      x: continuous ? 0 : camera.x - 256,
      y: camera.y - (down ? 128 : 512),
      width: continuous ? 794 : 1306,
      height: 1763,
    };
    if (continuous && area.y < 0) {
      area.height += area.y;
      area.y = 0;
    }
    const values = await s.model.query(area),
      visible = { x: camera.x, y: camera.y, width: W, height: H };
    return values.filter((value) =>
      SpatialDocument.intersects(value.bounds, visible),
    );
  }
  async function include(entries){
    const s=session;if(!s||s.book.id!==book.id)return false;
    const incoming=entries.filter(value=>!s.visible.has(value.id));
    await Promise.all([ImageObjects.prepare(incoming.map(v=>v.value)),StudyObjects.prepare(incoming.map(v=>v.value))]);
    if(session!==s||activeInkInput())return false;
    for(const entry of incoming){const local={...translate(entry.value,-s.camera.x,-s.camera.y),canvasObjectId:entry.id};s.book.pages[0].push(local);s.visible.set(entry.id,entry);s.localCache.set(local,{x:s.camera.x,y:s.camera.y,strokeId:local.strokeId,lectureActionId:local.lectureActionId,value:entry.value,bounds:entry.bounds})}
    return true;
  }
  async function move(camera) {
    const s = session;
    if (!s || s.book.id !== book.id || activeInkInput() || window.AreaCapture?.busy || loading) return false;
    finish();
    capture();
    const generation = inputGeneration;
    camera = { ...s.camera, ...camera };
    if (s.book.canvasDocument.format === "continuous") {
      camera.x = 0;
      camera.y = Math.max(0, camera.y);
    }
    try {
      SpatialDocument.rectangle({
        x: camera.x,
        y: camera.y,
        width: W,
        height: H,
      });
    } catch (error) {
      status(error.message);
      return false;
    }
    loading = true;
    try {
      if (s.model.stats.dirtyObjects && !(await s.model.save(activeInkInput)))
        return false;
      const items = await queryWindow(s, camera);
      if (drawing || session !== s || inputGeneration !== generation)
        return false;
      if (!(await install(items, camera, generation))) return false;
      s.model.camera({ ...camera, zoom: PageView.zoom });
      s.autosave.dirty();
      return true;
    } catch (error) {
      status("Переход не выполнен: " + error.message);
      return false;
    } finally {
      loading = false;
      capture();
      if (book.id !== session?.book.id)
        open().catch((error) => status(error.message));
    }
  }
  async function open() {
    if (loading) return;
    const b = book;
    if (!b.canvasDocument) {
      document.body.classList.remove("canvas-mode");
      canvas.inert = false;
      $("toolbar").inert = false;
      $("pageSize").disabled = false;
      return;
    }
    if (session?.book.id === b.id) {
      document.body.classList.add("canvas-mode");
      canvas.inert = false;
      $("toolbar").inert = false;
      return;
    }
    const token = ++sequence;
    loading = true;
    canvas.inert = true;
    $("toolbar").inert = true;
    try {
      if (session) {
        if (!(await session.model.save(activeInkInput))) {
          status("Сначала завершите штрих");
          return;
        }
        session.autosave.dispose();
        session.model.clearCache();
        session.visible.clear();
        session.book.pages = [[]];
        delete session.book.canvasCamera;
        session = null;
      }
      const model = await SpatialDocument.open(b.id, b.canvasDocument.format);
      if (token !== sequence || book.id !== b.id) return;
      if (model.metadata.revision === 0)
        model.camera({
          ...model.camera(),
          zoom: b.canvasDocument.initialZoom || 1,
        });
      const camera = model.camera(),
        seed = b.pages[0];
      const current = {
        book: b,
        model,
        camera,
        visible: new Map(),
        localCache: new WeakMap(),
        autosave: null,
        saveState: "saved",
      };
      session = current;
      current.autosave = Autosave.create({
        write: () => model.save(activeInkInput),
        active: activeInkInput,
        state(value, dirty) {
          if (session !== current) return;
          current.saveState = value;
          if (value === "saved" && saving.dirtyState) value = "dirty";
          if (value === "saved") {
            $("saveWarning").hidden = true;
            storageFailed = false;
            if ($("operationStatus").dataset.canvasError) {
              $("operationStatus").hidden = true;
              delete $("operationStatus").dataset.canvasError;
            }
          }
          if (value === "error") {
            storageFailed = true;
            $("operationStatus").dataset.canvasError = "true";
          }
          unsaved = dirty || saving.dirtyState;
          $("saveStatus").textContent = {
            dirty: "Есть несохранённые изменения",
            saving: "Сохранение…",
            saved: "Все изменения сохранены",
            error: "Ошибка сохранения",
          }[value];
          $("saveStatus").dataset.state = value;
          if (value === "error") {
            $("saveWarning").hidden = false;
            status("Изменения холста остаются в памяти. Повторите сохранение.");
          }
        },
      });
      if (model.metadata.revision === 0 && seed.length) {
        loading = false;
        capture();
        loading = true;
      }
      const items = await queryWindow(current, camera);
      document.body.classList.add("canvas-mode");
      await install(items);
      PageView.setZoom(camera.zoom);
      $("workspace").scrollLeft = camera.scrollX || 0;
      $("workspace").scrollTop = camera.scrollY || 0;
      $("pageSize").disabled = true;
      if (model.dirty) current.autosave.dirty();
    } catch (error) {
      status("Холст не открыт: " + error.message);
    } finally {
      const ready = session?.book.id === book.id;
      canvas.inert = !ready;
      $("toolbar").inert = !ready;
      loading = false;
    }
  }
  render = function () {
    if (!swapping) {
      inputGeneration++;
    }
    originalRender();
    if (!swapping) capture();
  };
  save = async function () {
    capture();
    if (session) {
      await session.autosave.flush(true, true);
      if (session.model.dirty)
        throw new Error("Завершите штрих перед сохранением");
    }
    await originalSave();
  };
  document.addEventListener("notepad:render", () => {
    if (!swapping) open().catch((error) => status(error.message));
  });
  document.addEventListener("notepad:screen", () => {
    if (document.body.classList.contains("home-view")) {
      capture();
      session?.autosave.flush(false, true).catch(() => {});
    }
  });
  document.addEventListener("notepad:stroke-end", () =>
    session?.autosave.idle(),
  );
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (book.canvasDocument && session?.book.id !== book.id) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  async function travel(direction) {
    if (!session || drawing || loading) return;
    capture();
    loading = true;
    canvas.inert = true;
    try {
      if (await session.model[direction]()) {
        await install(
          await session.model.query({
            x: session.camera.x,
            y: session.camera.y,
            width: W,
            height: H,
          }),
        );
        session.autosave.dirty();
      }
    } finally {
      loading = false;
      canvas.inert = false;
    }
  }
  $("undo").onclick = () =>
    session && book.canvasDocument
      ? travel("undo").catch((error) => status(error.message))
      : undo();
  $("redo").onclick = () =>
    session && book.canvasDocument
      ? travel("redo").catch((error) => status(error.message))
      : redoAction();
  const nav = document.createElement("nav");
  nav.id = "canvasNavigation";
  nav.setAttribute("aria-label", "Навигация по холсту");
  nav.innerHTML =
    '<button id="canvasUp" aria-label="Выше">↑</button><button id="canvasDown" aria-label="Ниже">↓</button><button id="canvasLeft" aria-label="Левее">←</button><button id="canvasRight" aria-label="Правее">→</button><button id="canvasStart">Начало</button><output id="canvasPosition"></output>';
  $("workspace").append(nav);
  for (const [id, icon, label] of [
    ["canvasUp", "left", "Выше"],
    ["canvasDown", "right", "Ниже"],
    ["canvasLeft", "left", "Левее"],
    ["canvasRight", "right", "Правее"],
  ])
    Interface.decorate($(id), icon, label, true);
  for (const [id, dx, dy] of [
    ["canvasUp", 0, -600],
    ["canvasDown", 0, 600],
    ["canvasLeft", -500, 0],
    ["canvasRight", 500, 0],
  ])
    $(id).onclick = () =>
      move({ x: session.camera.x + dx, y: session.camera.y + dy });
  $("canvasStart").onclick = () => move({ x: 0, y: 0 });
  let wheel = 0,
    wheelFrame = null,
    requestedCamera = null,
    navigating = false;
  async function requestMove(camera) {
    requestedCamera = camera;
    if (navigating) return;
    navigating = true;
    try {
      while (requestedCamera) {
        const next = requestedCamera;
        requestedCamera = null;
        await move(next);
      }
    } finally {
      navigating = false;
    }
  }
  $("workspace").addEventListener(
    "wheel",
    (event) => {
      if (
        !book.canvasDocument ||
        session?.book.id !== book.id ||
        event.ctrlKey ||
        event.metaKey ||
        event.target.closest("button,input,select,textarea")
      )
        return;
      event.preventDefault();
      wheel += event.deltaY / PageView.zoom;
      if (wheelFrame === null)
        wheelFrame = requestAnimationFrame(() => {
          wheelFrame = null;
          const delta = wheel;
          wheel = 0;
          requestMove({ y: (requestedCamera?.y ?? session.camera.y) + delta });
        });
    },
    { passive: false },
  );
  const touches = new Map();
  let gesture = null;
  const inputRoot = $("page");
  function center() {
    const points = [...touches.values()];
    return points.length > 1
      ? {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
          d: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        }
      : null;
  }
  inputRoot.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target === canvas) inputGeneration++;
      if (event.target !== canvas || !book.canvasDocument || loading) return;
      if (event.pointerType === "touch")
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (tool !== "hand" && touches.size < 2) return;
      if (activeType === "pen" && event.pointerType === "touch") return;
      if (drawing) {
        drawing = null;
        activePointer = null;
        activeType = null;
        strokePage = null;
        lastSample = null;
        paint();
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      PageView.resetGesture();
      document.dispatchEvent(new Event('notepad:gesture-start'));
      const point = center() || { x: event.clientX, y: event.clientY, d: 0 };
      gesture = {
        id: event.pointerId,
        ...point,
        camera: { ...session.camera },
        zoom: PageView.zoom,
        scrollX: $("workspace").scrollLeft,
        last: { x: 0, y: 0 },
      };
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {}
    },
    true,
  );
  inputRoot.addEventListener(
    "pointermove",
    (event) => {
      if (
        !gesture ||
        !book.canvasDocument ||
        (!touches.has(event.pointerId) && gesture.id !== event.pointerId)
      )
        return;
      if (touches.has(event.pointerId))
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.preventDefault();
      event.stopImmediatePropagation();
      const point = center() || { x: event.clientX, y: event.clientY, d: 0 };
      if (point.d && gesture.d)
        PageView.setZoom(
          (gesture.zoom * point.d) / Math.max(1, gesture.d),
          point.x,
          point.y,
        );
      if (book.canvasDocument.format === "continuous")
        $("workspace").scrollLeft = gesture.scrollX - (point.x - gesture.x);
      gesture.last = {
        x: (point.x - gesture.x) / PageView.zoom,
        y: (point.y - gesture.y) / PageView.zoom,
      };
      requestMove({
        x: gesture.camera.x - gesture.last.x,
        y: gesture.camera.y - gesture.last.y,
      });
    },
    true,
  );
  for (const type of ["pointerup", "pointercancel"])
    inputRoot.addEventListener(
      type,
      (event) => {
        touches.delete(event.pointerId);
        if (!gesture) return;
        const previous = gesture;
        gesture = null;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (type === "pointerup")
          requestMove({
            x: previous.camera.x - previous.last.x,
            y: previous.camera.y - previous.last.y,
          });
      },
      true,
    );
  Documents.compose = async function (notebook, index) {
    if (!notebook.canvasDocument) return originalCompose(notebook, index);
    if (notebook.id !== session?.book.id)
      throw new Error("Откройте холст перед экспортом");
    capture();
    await session.model.save(activeInkInput);
    return originalCompose(notebook, index);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && session) {
      capture();
      session.autosave.flush(false, true).catch(() => {});
    }
  });
  window.addEventListener("pagehide", () => {
    capture();
    session?.autosave.flush(false, true).catch(() => {});
  });
  async function copyDocument(source, target) {
    if (source === session?.book.id) {
      capture();
      await session.model.save(activeInkInput);
    }
    const root = SpatialDocument.prefix(source),
      next = SpatialDocument.prefix(target),
      entries = await NotepadStore.entries(root);
    if (!entries.some(([key]) => key === root + "meta"))
      throw new Error("Исходный холст ещё не сохранён");
    await NotepadStore.batchRecords(
      entries.map(([key, value]) => [next + key.slice(root.length), value]),
    );
  }
  return {
    open,
    move,
    capture,
    bounds,
    translate,
    copyDocument,
    include,
    get session() {
      return session;
    },
    get loading() {
      return loading;
    },
    get projecting() {
      return swapping;
    },
  };
})();
