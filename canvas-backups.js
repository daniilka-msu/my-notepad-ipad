(() => {
  const create = Backups.create,
    parse = Backups.parse;
  const asDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  function validateEntry(entry) {
    SpatialDocument.rectangle(entry.bounds);
    SpatialDocument.tiles(entry.bounds);
    if (
      !entry.value ||
      typeof entry.id !== "string" ||
      !Number.isFinite(entry.order)
    )
      throw new Error("Поврежден объект холста");
    const local = CanvasEditor.translate(
      entry.value,
      -entry.bounds.x,
      -entry.bounds.y,
    );
    Backups.validateLibrary({
      books: [
        {
          id: "validation",
          name: "Проверка",
          paper: "blank",
          pages: [[local]],
        },
      ],
    });
  }
  function imageIds(value, result = new Set()) {
    if (!value || typeof value !== "object") return result;
    if (value.type === "image-object") result.add(value.asset);
    for (const child of Object.values(value))
      if (child && typeof child === "object") imageIds(child, result);
    return result;
  }
  Backups.create = async function (library, preferences) {
    if (!library.books.some((b) => b.canvasDocument))
      return create(library, preferences);
    CanvasEditor.capture();
    if (
      CanvasEditor.session &&
      !(await CanvasEditor.session.model.save(activeInkInput))
    )
      throw new Error("Завершите штрих перед резервным копированием");
    const result = await create(
      NotepadStore.libraryValue(library),
      preferences,
    );
    result.version = 3;
    result.canvasRecords = [];
    const existing = new Set(result.assets.map((v) => v.id));
    for (const b of library.books.filter((b) => b.canvasDocument)) {
      const root = SpatialDocument.prefix(b.id),
        entries = await NotepadStore.entries(root);
      if (!entries.some(([key]) => key === root + "meta"))
        throw new Error("Холст ещё не сохранён: " + b.name);
      const values = entries.map(([key, value]) => [
        key.slice(root.length),
        value,
      ]);
      result.canvasRecords.push([b.id, values]);
      for (const id of imageIds(values))
        if (!existing.has(id)) {
          const blob = await NotepadStore.asset(id);
          if (!blob) throw new Error("Отсутствует изображение холста");
          result.assets.push({ id, data: await asDataURL(blob) });
          existing.add(id);
        }
    }
    return result;
  };
  Backups.parse = async function (text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      return parse(text);
    }
    const canvasBooks =
      (raw.library || raw)?.books?.filter((b) => b.canvasDocument) || [];
    if (!canvasBooks.length) return parse(text);
    if (raw.version !== 3 || !Array.isArray(raw.canvasRecords))
      throw new Error("В копии отсутствуют данные бесконечных документов");
    const result = await parse(JSON.stringify({ ...raw, version: 2 })),
      seen = new Set();
    result.canvasRecords = [];
    for (const pair of raw.canvasRecords) {
      if (!Array.isArray(pair) || pair.length !== 2)
        throw new Error("Повреждено хранилище холста");
      const [id, values] = pair,
        b = canvasBooks.find((b) => b.id === id);
      if (!b || seen.has(id) || !Array.isArray(values))
        throw new Error("Повреждено соответствие документов");
      seen.add(id);
      const keys = new Set(),
        objects = new Map(),
        tileEntries = new Map(), groupEntries = new Map();
      let meta;
      for (const [key, value] of values) {
        if (
          typeof key !== "string" ||
          keys.has(key) ||
          !value ||
          typeof value !== "object"
        )
          throw new Error("Повреждены записи холста");
        keys.add(key);
        if (key === "meta") {
          meta = value;
          if (
            meta.version !== 1 ||
            meta.format !== b.canvasDocument.format ||
            !Number.isSafeInteger(meta.cursor) ||
            meta.cursor < 0 ||
            !Number.isSafeInteger(meta.head) ||
            meta.cursor > meta.head
          )
            throw new Error("Повреждены метаданные холста");
          SpatialDocument.rectangle({ ...meta.camera, width: 0, height: 0 });
          if (
            !["revision", "order", "head", "cursor"].every(
              (k) => Number.isSafeInteger(meta[k]) && meta[k] >= 0,
            ) ||
            !Number.isFinite(meta.camera.zoom) ||
            meta.camera.zoom < 0.5 ||
            meta.camera.zoom > 3 ||
            !meta.occupied ||
            !Array.isArray(meta.bookmarks)
          )
            throw new Error("Повреждены параметры холста");
        } else if (key.startsWith("object/")) {
          if (
            key !== "object/" + value.id ||
            typeof value.id !== "string" ||
            !value.value ||
            !Number.isFinite(value.order)
          )
            throw new Error("Поврежден объект холста");
          validateEntry(value);
          objects.set(value.id, value);
        } else if (key.startsWith("tile/")) {
          if (
            !/^tile\/-?\d+,-?\d+$/.test(key) ||
            !Array.isArray(value) ||
            value.some((v) => typeof v !== "string")
          )
            throw new Error("Поврежден индекс холста");
          tileEntries.set(key.slice(5), value);
        } else if (key.startsWith("history/")) {
          if (!/^history\/\d+$/.test(key) || !Array.isArray(value.changes))
            throw new Error("Повреждена история холста");
          for (const change of value.changes)
            for (const entry of [change.before, change.after])
              if (entry) {
                validateEntry(entry);
                if (entry.id !== change.id)
                  throw new Error("Повреждена операция холста");
              }
        } else if(key.startsWith('group/')){
          if(!Array.isArray(value)||value.some(id=>typeof id!=='string')||new Set(value).size!==value.length)throw new Error('Повреждена группа объектов');
          groupEntries.set(key.slice(6),value);
        } else throw new Error("Неизвестная запись холста");
      }
      if (!meta) throw new Error("Нет метаданных холста");
      const expectedGroups = new Map();
      for(const entry of objects.values())if(entry.value.groupId){const key=encodeURIComponent(entry.value.groupId);if(!expectedGroups.has(key))expectedGroups.set(key,new Set());expectedGroups.get(key).add(entry.id)}
      for(const [key,ids]of groupEntries){const expected=expectedGroups.get(key)||new Set();if(ids.length!==expected.size||ids.some(id=>!expected.has(id)))throw new Error('Группа не соответствует объектам')}
      for(const key of expectedGroups.keys())if(!groupEntries.has(key))throw new Error('В копии отсутствует индекс группы');
      const expected = new Map();
      for (const entry of objects.values())
        for (const tile of SpatialDocument.tiles(entry.bounds)) {
          if (!expected.has(tile)) expected.set(tile, new Set());
          expected.get(tile).add(entry.id);
        }
      for (const [key, ids] of tileEntries) {
        const wanted = expected.get(key) || new Set();
        if (
          ids.length !== wanted.size ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !wanted.has(id))
        )
          throw new Error("Индекс не соответствует объектам");
      }
      for (const [key, ids] of expected)
        if (!tileEntries.has(key) || meta.occupied[key] !== ids.size)
          throw new Error("В копии отсутствует индекс области");
      if (meta.head > values.length) throw new Error("История холста неполна");
      for (let seq = 1; seq <= meta.head; seq++)
        if (!keys.has("history/" + seq))
          throw new Error("История холста неполна");
      for (const id of imageIds(values))
        if (!result.assets.has(id))
          throw new Error("В копии не хватает изображения холста");
      result.canvasRecords.push([id, values]);
    }
    if (seen.size !== canvasBooks.length)
      throw new Error("В копии не хватает холстов");
    return result;
  };
})();
