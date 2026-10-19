const Library = (() => {
  const version = 1,
    colors = ["#5369d8", "#248575", "#b76750", "#7b66ac", "#3d789f", "#a17b33"];
  const id = () => crypto.randomUUID?.() || String(Date.now() + Math.random());
  const templates = {
    plain: { label: "Обычный", paper: "grid" },
    math: { label: "Математика", paper: "grid" },
    lecture: { label: "Лекция", paper: "lines" },
    planner: { label: "Планировщик", paper: "dots" },
    algorithms: { label: "Алгоритмы", paper: "grid" },
  };
  function initialize(b) {
    const code = [...b.id].reduce((n, c) => n + c.charCodeAt(0), 0);
    b.cover ??= { color: colors[code % colors.length], pattern: "plain" };
    b.createdAt ??= 0;
    b.modifiedAt ??= b.createdAt;
    b.lastOpenedAt ??= 0;
    b.favorite ??= false;
    b.folderId ??= null;
    b.deletedAt ??= null;
    return b;
  }
  function migrate(source) {
    if (source.libraryVersion > version)
      throw new Error("Эта библиотека создана более новой версией приложения");
    const next = structuredClone(source);
    next.libraryVersion = version;
    next.folders ??= [];
    for (const b of next.books) initialize(b);
    return next;
  }
  const active = (library) => library.books.filter((b) => b.deletedAt == null);
  function newBook(options) {
    const name = options.name?.trim();
    if (
      !name ||
      name.length > 120 ||
      !Object.hasOwn(templates, options.template || "plain") ||
      !["a4", "a5", "square"].includes(options.pageSize) ||
      !["grid", "lines", "dots", "blank"].includes(options.paper) ||
      !/^#[0-9a-f]{6}$/i.test(options.color) ||
      !["plain", "band", "dots"].includes(options.pattern)
    )
      throw new Error("Проверьте название и параметры блокнота");
    const now = Date.now(),
      b = initialize({
        id: id(),
        name,
        paper: options.paper,
        pageSize: options.pageSize,
        gridMm: 5,
        pages: [[]],
        createdAt: now,
        modifiedAt: now,
        cover: { color: options.color, pattern: options.pattern },
        template: options.template || "plain",
      });
    if (b.template === "planner")
      b.pages[0].push({
        type: "table-object",
        x: 50,
        y: 100,
        width: 694,
        height: 700,
        color: "#5369d8",
        fill: "#ffffff",
        cells: [
          ["День", "Главная задача", "Заметки"],
          ...[
            "Понедельник",
            "Вторник",
            "Среда",
            "Четверг",
            "Пятница",
            "Суббота",
            "Воскресенье",
          ].map((day) => [day, "", ""]),
        ],
      });
    if (b.template === "lecture")
      b.pages[0].push({
        type: "text-block",
        x: 45,
        y: 40,
        width: 700,
        text: "Тема лекции:",
        font: "Arial",
        size: 24,
        color: "#5369d8",
        bold: true,
        italic: false,
        align: "left",
      });
    if (b.template === "algorithms")
      b.pages[0].push({
        type: "table-object",
        x: 45,
        y: 100,
        width: 700,
        height: 350,
        color: "#5369d8",
        fill: "#ffffff",
        cells: [
          ["Входные данные", "Алгоритм", "Результат"],
          ["", "", ""],
          ["", "", ""],
          ["", "", ""],
        ],
      });
    return b;
  }
  const tracked = new WeakMap();
  function track(b) {
    if (!b?.id) return;
    initialize(b);
    const snapshot = {
        paper: JSON.stringify([
          b.paper,
          b.paperColor,
          b.pageSize,
          b.gridMm,
          b.backgrounds,
        ]),
        pages: b.pages.map((items) => [items, items.length, items.at(-1)]),
      },
      old = tracked.get(b);
    if (
      old &&
      (old.paper !== snapshot.paper ||
        old.pages.length !== snapshot.pages.length ||
        old.pages.some((v, i) =>
          v.some((item, j) => item !== snapshot.pages[i]?.[j]),
        ))
    )
      b.modifiedAt = Date.now();
    tracked.set(b, snapshot);
  }
  return {
    version,
    colors,
    templates,
    id,
    initialize,
    migrate,
    active,
    newBook,
    track,
  };
})();
