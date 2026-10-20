const SpatialDocument = (() => {
  const tileSize = 512,
    coordinateLimit = 10000000;
  const copy = (value) => (value == null ? value : structuredClone(value));
  const prefix = (id) => "canvas-v1/" + encodeURIComponent(id) + "/";
  function rectangle(value) {
    if (
      !value ||
      !["x", "y", "width", "height"].every((k) => Number.isFinite(value[k])) ||
      value.width < 0 ||
      value.height < 0 ||
      Math.abs(value.x) + value.width > coordinateLimit ||
      Math.abs(value.y) + value.height > coordinateLimit
    )
      throw new Error("Область выходит за безопасные пределы координат");
    return value;
  }
  function tiles(area) {
    rectangle(area);
    const result = [];
    for (
      let y = Math.floor(area.y / tileSize);
      y <= Math.floor((area.y + area.height) / tileSize);
      y++
    ) {
      for (
        let x = Math.floor(area.x / tileSize);
        x <= Math.floor((area.x + area.width) / tileSize);
        x++
      ) {
        if (result.length >= 4096)
          throw new Error("Объект слишком велик для безопасной обработки");
        result.push(x + "," + y);
      }
    }
    return result;
  }
  const intersects = (a, b) =>
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y;
  class LRU {
    constructor(limit) {
      this.limit = limit;
      this.values = new Map();
    }
    get(key) {
      const value = this.values.get(key);
      if (value !== undefined) {
        this.values.delete(key);
        this.values.set(key, value);
      }
      return value;
    }
    set(key, value) {
      this.values.delete(key);
      this.values.set(key, value);
      while (this.values.size > this.limit)
        this.values.delete(this.values.keys().next().value);
    }
    clear() {
      this.values.clear();
    }
  }
  async function open(id, format, store = NotepadStore) {
    if (!["continuous", "infinite"].includes(format))
      throw new Error("Неизвестный формат холста");
    const root = prefix(id),
      metaKey = root + "meta";
    const initial = await store.read(metaKey);
    let meta = initial || {
      version: 1,
      revision: 0,
      format,
      camera: { x: 0, y: 0, zoom: 1 },
      cursor: 0,
      head: 0,
      order: 0,
      occupied: {},
      bookmarks: [],
    };
    if (meta.version !== 1 || meta.format !== format)
      throw new Error("Неподдерживаемая версия документа");
    const objects = new LRU(512),
      regions = new LRU(32),
      staged = new Map(),
      history = new Map();
    let version = 0,
      saved = 0,
      pending = null;
    const dirty = () => {
      version++;
    };
    async function readObject(id) {
      if (staged.has(id)) return staged.get(id);
      const cached = objects.get(id);
      if (cached !== undefined) return cached;
      const value = await store.read(root + "object/" + id);
      objects.set(id, value || null);
      return value || null;
    }
    async function query(area) {
      const keys = tiles(area),
        ids = new Set();
      for (const key of keys) {
        let region = regions.get(key);
        if (!region) {
          region = (await store.read(root + "tile/" + key)) || [];
          regions.set(key, region);
        }
        for (const id of region) ids.add(id);
      }
      for (const [id, entry] of staged)
        if (entry && intersects(entry.bounds, area)) ids.add(id);
      const result = [];
      for (const id of ids) {
        const entry = await readObject(id);
        if (entry && intersects(entry.bounds, area)) result.push(copy(entry));
      }
      return result.sort(
        (a, b) => a.order - b.order || a.id.localeCompare(b.id),
      );
    }
    function commit(changes) {
      if (!changes.length) return;
      const unique = new Set();
      for (const change of changes) {
        if (
          typeof change.id !== "string" ||
          !change.id ||
          change.id.length > 160 ||
          unique.has(change.id)
        )
          throw new Error("Неверный идентификатор объекта");
        unique.add(change.id);
        if (change.after) {
          if (
            change.after.id !== change.id ||
            !change.after.value ||
            !Number.isSafeInteger(change.after.order)
          )
            throw new Error("Поврежден объект документа");
          rectangle(change.after.bounds);
          tiles(change.after.bounds);
          if (
            format === "continuous" &&
            (change.after.bounds.x < 0 ||
              change.after.bounds.x + change.after.bounds.width > 794.001 ||
              change.after.bounds.y < 0)
          )
            throw new Error(
              "Содержимое должно находиться в пределах ширины A4",
            );
        }
      }
      const operation = { changes: copy(changes) };
      meta.cursor++;
      meta.head = meta.cursor;
      history.set(meta.cursor, operation);
      for (const change of changes) {
        staged.set(change.id, copy(change.after));
        objects.values.delete(change.id);
      }
      regions.clear();
      dirty();
    }
    async function travel(direction) {
      if (
        (direction < 0 && meta.cursor === 0) ||
        (direction > 0 && meta.cursor === meta.head)
      )
        return false;
      const seq = direction < 0 ? meta.cursor : meta.cursor + 1;
      const operation =
        history.get(seq) || (await store.read(root + "history/" + seq));
      if (!operation) throw new Error("История документа недоступна");
      for (const change of operation.changes) {
        staged.set(
          change.id,
          copy(direction < 0 ? change.before : change.after),
        );
        objects.values.delete(change.id);
      }
      meta.cursor += direction;
      regions.clear();
      dirty();
      return true;
    }
    function save(active = () => false) {
      if (pending)
        return pending.then(() => (version !== saved ? save(active) : true));
      if (version === saved) return Promise.resolve(true);
      if (active()) return Promise.resolve(false);
      const revision = version,
        edits = new Map(staged),
        operations = new Map(history),
        snapshot = copy(meta);
      pending = (async () => {
        const entries = [],
          touched = new Map(),
          groups = new Map();
        async function group(id) {
          if (!groups.has(id))
            groups.set(
              id,
              new Set(
                (await store.read(root + "group/" + encodeURIComponent(id))) ||
                  [],
              ),
            );
          return groups.get(id);
        }
        async function region(key) {
          if (!touched.has(key))
            touched.set(
              key,
              new Set((await store.read(root + "tile/" + key)) || []),
            );
          return touched.get(key);
        }
        for (const [id, entry] of edits) {
          const previous = await store.read(root + "object/" + id);
          if (previous?.value.groupId)
            (await group(previous.value.groupId)).delete(id);
          if (entry?.value.groupId) (await group(entry.value.groupId)).add(id);
          for (const key of previous ? tiles(previous.bounds) : [])
            (await region(key)).delete(id);
          for (const key of entry ? tiles(entry.bounds) : [])
            (await region(key)).add(id);
          if (entry) entries.push([root + "object/" + id, entry]);
        }
        for (const [key, ids] of touched) {
          entries.push([root + "tile/" + key, [...ids]]);
          if (ids.size) snapshot.occupied[key] = ids.size;
          else delete snapshot.occupied[key];
        }
        for (const [id, values] of groups)
          entries.push([root + "group/" + encodeURIComponent(id), [...values]]);
        for (const [seq, operation] of operations)
          entries.push([root + "history/" + seq, operation]);
        snapshot.revision = meta.revision + 1;
        entries.push([metaKey, snapshot]);
        const success = await store.batchRecords(
          entries,
          [...edits]
            .filter(([, value]) => !value)
            .map(([id]) => root + "object/" + id),
          { key: metaKey, revision: meta.revision },
          () => !active(),
        );
        if (success === false) return false;
        meta.revision = snapshot.revision;
        meta.occupied = snapshot.occupied;
        saved = revision;
        for (const [id, value] of edits)
          if (staged.get(id) === value) staged.delete(id);
        for (const [seq, value] of operations)
          if (history.get(seq) === value) history.delete(seq);
        regions.clear();
        return true;
      })().finally(() => {
        pending = null;
      });
      return pending;
    }
    return {
      query,
      reindex(entry) {
        rectangle(entry.bounds);
        tiles(entry.bounds);
        staged.set(entry.id, copy(entry));
        objects.values.delete(entry.id);
        regions.clear();
        dirty();
      },
      async group(id) {
        const ids = new Set(
          (await store.read(root + "group/" + encodeURIComponent(id))) || [],
        );
        for (const [key, entry] of staged)
          if (entry?.value.groupId === id) ids.add(key);
        const values = [];
        for (const key of ids) {
          const value = await readObject(key);
          if (value?.value.groupId === id) values.push(copy(value));
        }
        return values.sort((a, b) => a.order - b.order);
      },
      readObject,
      commit,
      save,
      undo: () => travel(-1),
      redo: () => travel(1),
      nextOrder() {
        meta.order++;
        return meta.order;
      },
      get metadata() {
        return copy(meta);
      },
      get overview() {
        return {
          tiles: Object.keys(meta.occupied).filter(
            (key) => meta.occupied[key] > 0,
          ),
          pending: [...staged.values()]
            .filter(Boolean)
            .map((entry) => copy(entry.bounds)),
          bookmarks: copy(meta.bookmarks),
        };
      },
      get dirty() {
        return version !== saved;
      },
      get cursor() {
        return meta.cursor;
      },
      get head() {
        return meta.head;
      },
      camera(value) {
        if (value) {
          rectangle({ x: value.x, y: value.y, width: 0, height: 0 });
          if (
            !Number.isFinite(value.zoom) ||
            value.zoom < 0.5 ||
            value.zoom > 3
          )
            throw new Error("Неверный масштаб");
          meta.camera = copy(value);
          dirty();
        }
        return copy(meta.camera);
      },
      bookmark(name, camera) {
        if (typeof name !== "string" || !name.trim() || name.length > 120)
          throw new Error("Введите название закладки");
        if (meta.bookmarks.length >= 200)
          throw new Error("Не более 200 закладок на документ");
        rectangle({ ...camera, width: 0, height: 0 });
        if (
          !Number.isFinite(camera.zoom) ||
          camera.zoom < 0.5 ||
          camera.zoom > 3
        )
          throw new Error("Неверный масштаб закладки");
        const id =
          crypto.randomUUID?.() ||
          "bookmark-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        meta.bookmarks.push({
          id,
          name: name.trim(),
          camera: copy(camera),
        });
        dirty();
        return id;
      },
      removeBookmark(id) {
        const index = meta.bookmarks.findIndex((value) => value.id === id);
        if (index < 0) return false;
        meta.bookmarks.splice(index, 1);
        dirty();
        return true;
      },
      get stats() {
        return {
          regionCache: regions.values.size,
          objectCache: objects.values.size,
          dirtyObjects: staged.size,
        };
      },
      clearCache() {
        objects.clear();
        regions.clear();
      },
    };
  }
  return {
    open,
    tiles,
    rectangle,
    intersects,
    LRU,
    prefix,
    tileSize,
    coordinateLimit,
  };
})();
