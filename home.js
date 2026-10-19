const Home = (() => {
  const root = document.createElement("main");
  root.id = "home";
  root.setAttribute("aria-label", "Домашняя страница My Notepad");
  root.innerHTML =
    '<header class="home-header"><a class="home-brand" href="#home" aria-label="My Notepad — главная"><img src="icon.svg" alt=""><span>My Notepad<small>HOME & STUDIO · 3.5</small></span></a><div id="homeHeaderActions"></div></header><div class="home-layout"><nav id="homeNav" aria-label="Разделы библиотеки"><button data-view="all">Все блокноты</button><button data-view="favorites">Избранное</button><button data-view="trash">Корзина</button><div class="home-folder-heading"><span>Папки</span><button id="newFolder" aria-label="Создать папку"></button></div><div id="homeFolders"></div><p class="home-local-note">Ваше пространство для мыслей.<br>Сохранение на этом устройстве, работа без сети.</p></nav><div class="home-content"><div class="home-intro"><div><p class="eyebrow">ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО</p><h1 id="homeTitle">Все блокноты</h1><p id="homeCount" class="hint"></p></div><button id="homeNewBook" class="primary">Новый блокнот</button></div><div class="home-controls"><label class="home-search"><span id="homeSearchIcon"></span><input id="homeSearch" type="search" placeholder="Найти блокнот…" aria-label="Поиск блокнотов"></label><select id="homeSort" aria-label="Сортировка блокнотов"><option value="modified">По дате изменения</option><option value="name">По названию</option></select></div><div id="homeRecent"><h2>Недавно открытые</h2><div id="recentBooks" class="home-recent-grid"></div></div><h2 id="homeGridTitle">Все блокноты</h2><div id="homeBooks" class="home-grid"></div><div id="homeEmpty" class="home-empty" hidden></div></div></div><p id="homeNotice" role="status" aria-live="polite" hidden></p>';
  document.body.append(root);
  $("homeSearchIcon").append(NotepadIcons.create("search"));
  Interface.decorate($("newFolder"), "plus", "Создать папку", true);
  const back = document.createElement("button");
  back.id = "goHome";
  Interface.decorate(back, "home", "На главную", true);
  $("topbar").prepend(back);
  const formDialog = document.createElement("dialog");
  formDialog.id = "notebookDialog";
  formDialog.setAttribute("aria-labelledby", "notebookDialogTitle");
  formDialog.innerHTML =
    '<div class="dialog-header"><h2 id="notebookDialogTitle">Новый блокнот</h2><button id="closeNotebookDialog" aria-label="Закрыть мастер"></button></div><form id="notebookForm" class="settings-content"><label>Название<input id="notebookName" maxlength="120" required autocomplete="off"></label><label>Шаблон<select id="notebookTemplate"></select></label><div class="notebook-wizard-grid"><div id="wizardCover" class="home-cover" aria-hidden="true"><span>My Notepad</span></div><div><label>Обложка<select id="notebookPattern"><option value="plain">Классическая</option><option value="band">Полоса</option><option value="dots">Точки</option></select></label><label>Цвет<input type="color" id="notebookColor" value="#5369d8"></label><label>Формат<select id="notebookSize"><option value="a4">A4</option><option value="a5">A5</option><option value="square">Квадрат</option></select></label><label>Бумага<select id="notebookPaper"><option value="grid">Клетка 5 мм</option><option value="lines">Линейка</option><option value="dots">Точки</option><option value="blank">Чистая</option></select></label></div></div><label>Папка<select id="notebookFolder"></select></label><p id="notebookError" role="alert"></p><button class="primary" id="createNotebook">Создать</button></form>';
  document.body.append(formDialog);
  Interface.decorate($("closeNotebookDialog"), "close", "Закрыть мастер", true);
  $("closeNotebookDialog").onclick = () => formDialog.close();
  for (const [value, t] of Object.entries(Library.templates))
    $("notebookTemplate").add(new Option(t.label, value));
  const details = document.createElement("dialog");
  details.id = "notebookActions";
  details.setAttribute("aria-labelledby", "notebookActionsTitle");
  details.innerHTML =
    '<div class="dialog-header"><h2 id="notebookActionsTitle">Блокнот</h2><button id="closeNotebookActions" aria-label="Закрыть свойства"></button></div><form id="notebookProperties" class="settings-content"><label>Название<input id="renameNotebook" maxlength="120" required></label><label>Папка<select id="moveNotebookFolder"></select></label><label>Цвет обложки<input id="changeCoverColor" type="color"></label><button class="primary" id="saveNotebookProperties">Сохранить</button><div class="home-action-row"><button id="duplicateNotebook" type="button">Дублировать</button><button id="trashNotebook" type="button">Переместить в корзину</button></div><p id="notebookActionError" role="alert"></p></form>';
  document.body.append(details);
  Interface.decorate(
    $("closeNotebookActions"),
    "close",
    "Закрыть свойства",
    true,
  );
  $("closeNotebookActions").onclick = () => details.close();
  const folderDialog = document.createElement("dialog");
  folderDialog.id = "folderDialog";
  folderDialog.innerHTML =
    '<div class="dialog-header"><h2 id="folderTitle">Папка</h2><button id="closeFolderDialog" aria-label="Закрыть папку"></button></div><form id="folderForm" class="settings-content"><label>Название папки<input id="folderName" maxlength="120" required></label><button id="saveFolder" class="primary">Сохранить</button><button id="removeFolder" type="button">Удалить папку, сохранив блокноты</button><p id="folderError" role="alert"></p></form>';
  document.body.append(folderDialog);
  Interface.decorate($("closeFolderDialog"), "close", "Закрыть папку", true);
  $("closeFolderDialog").onclick = () => folderDialog.close();
  let active = true,
    view = "all",
    busy = false,
    actionId = null,
    shownBookId = null,
    folderId = null,
    noticeTimer;
  const views = new Map(),
    editorImportParent = $("importFile").parentElement,
    editorSettingsParent = $("openSettings").parentElement,
    paperSection = $("settingsPaper").closest("section");
  const date = (value) =>
    value
      ? new Intl.DateTimeFormat("ru", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(value)
      : "Сохранён ранее";
  function notice(message) {
    clearTimeout(noticeTimer);
    $("homeNotice").textContent = message;
    $("homeNotice").hidden = false;
    noticeTimer = setTimeout(() => ($("homeNotice").hidden = true), 4500);
  }
  function remember() {
    if (!active && book?.id)
      views.set(book.id, {
        page,
        zoom: PageView.zoom,
        x: $("workspace").scrollLeft,
        y: $("workspace").scrollTop,
      });
  }
  function route(id, replace = false) {
    history[replace ? "replaceState" : "pushState"](
      { notepadHome: !id, id },
      "",
      id ? "#notebook/" + encodeURIComponent(id) : "#home",
    );
  }
  function display(home) {
    active = home;
    document.body.classList.toggle("home-view", home);
    root.hidden = !home;
    $("app").hidden = home;
    $("app").inert = home;
    paperSection.hidden = home;
    $("showSidebar").closest("label").hidden = home;
    root.inert = !home;
    if (home) {
      Sidebar.close({ restoreFocus: false });
      if (document.body.classList.contains("focus-mode"))
        $("focusMode").click();
      $("homeHeaderActions").append($("importFile"), $("openSettings"));
      Interface.decorate($("importFile"), "upload", "Импортировать");
      renderHome();
    } else {
      editorImportParent.append($("importFile"));
      editorSettingsParent.append($("openSettings"));
      PageView.layout();
    }
    document.dispatchEvent(new Event("notepad:screen"));
  }
  function show({ history: push = true } = {}) {
    finish();
    remember();
    ShapeTools.clear();
    TextTools.clear();
    ObjectTools.clear();
    document.dispatchEvent(new Event("notepad:gesture-start"));
    for (const d of document.querySelectorAll("details[open]"))
      if (d.closest("#app")) d.open = false;
    display(true);
    if (push) route(null);
    $("homeTitle").focus({ preventScroll: true });
  }
  function open(id, { history: push = true } = {}) {
    const b = Library.active(data).find((b) => b.id === id);
    if (!b) {
      show({ history: false });
      return false;
    }
    finish();
    remember();
    Sidebar.close({ restoreFocus: false });
    data.selected = b.id;
    page = views.get(id)?.page ?? 0;
    redo = [];
    if (active || shownBookId !== id) b.lastOpenedAt = Date.now();
    shownBookId = id;
    display(false);
    render();
    const saved = views.get(id);
    if (saved) {
      PageView.setZoom(saved.zoom);
      $("workspace").scrollLeft = saved.x;
      $("workspace").scrollTop = saved.y;
    } else PageView.fit();
    if (push) route(id);
    $("bookTitle").setAttribute("tabindex", "-1");
    $("bookTitle").focus({ preventScroll: true });
    return true;
  }
  async function commit(change, message) {
    if (busy) return false;
    if (!storageReady || storageFailed) {
      notice("Хранилище недоступно. Сначала сохраните резервную копию.");
      return false;
    }
    busy = true;
    root.inert = true;
    try {
      finish();
      const next = {
        ...data,
        folders: structuredClone(data.folders || []),
        books: data.books.map((b) => ({ ...b, cover: { ...b.cover } })),
      };
      change(next);
      Backups.validateLibrary(next);
      await NotepadStore.write(next);
      next.books = next.books.map((b) => {
        const previous = data.books.find((old) => old.id === b.id);
        if (previous) {
          Object.assign(previous, b);
          return previous;
        }
        return b;
      });
      data = next;
      render();
      notice(message);
      return true;
    } catch (error) {
      notice(error?.message || "Не удалось сохранить изменения");
      return false;
    } finally {
      busy = false;
      root.inert = !active;
    }
  }
  function folders(select, current) {
    select.replaceChildren(new Option("Без папки", ""));
    for (const f of data.folders || []) select.add(new Option(f.name, f.id));
    select.value = current || "";
  }
  function wizard() {
    folders(
      $("notebookFolder"),
      view.startsWith("folder:") ? view.slice(7) : null,
    );
    $("notebookName").value = "";
    $("notebookTemplate").value = "plain";
    $("notebookPaper").value = "grid";
    $("notebookSize").value = "a4";
    $("notebookPattern").value = "plain";
    $("notebookColor").value = Library.colors[0];
    $("notebookError").textContent = "";
    coverPreview();
    formDialog.showModal();
    $("notebookName").focus();
  }
  function coverPreview() {
    $("wizardCover").style.setProperty("--cover", $("notebookColor").value);
    $("wizardCover").dataset.pattern = $("notebookPattern").value;
  }
  for (const id of ["notebookColor", "notebookPattern"])
    $(id).addEventListener("input", coverPreview);
  $("notebookTemplate").onchange = () => {
    $("notebookPaper").value =
      Library.templates[$("notebookTemplate").value].paper;
  };
  $("newBook").onclick = wizard;
  $("homeNewBook").onclick = wizard;
  $("notebookForm").onsubmit = async (e) => {
    e.preventDefault();
    let b;
    try {
      b = Library.newBook({
        name: $("notebookName").value,
        template: $("notebookTemplate").value,
        pageSize: $("notebookSize").value,
        paper: $("notebookPaper").value,
        color: $("notebookColor").value,
        pattern: $("notebookPattern").value,
      });
      b.folderId = $("notebookFolder").value || null;
    } catch (error) {
      $("notebookError").textContent = error.message;
      return;
    }
    if (
      await commit((next) => {
        next.books.push(b);
        next.selected = b.id;
      }, "Блокнот создан")
    ) {
      formDialog.close();
      open(b.id);
    }
  };
  function properties(id) {
    const b = data.books.find((b) => b.id === id);
    if (!b) return;
    actionId = id;
    $("notebookActionsTitle").textContent = "Свойства блокнота";
    $("renameNotebook").value = b.name;
    $("changeCoverColor").value = b.cover.color;
    folders($("moveNotebookFolder"), b.folderId);
    $("notebookActionError").textContent = "";
    details.showModal();
  }
  $("notebookProperties").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("renameNotebook").value.trim();
    if (!name) {
      $("notebookActionError").textContent = "Введите название";
      return;
    }
    if (
      await commit((next) => {
        const b = next.books.find((b) => b.id === actionId);
        if (!b) throw new Error("Блокнот не найден");
        b.name = name;
        b.folderId = $("moveNotebookFolder").value || null;
        b.cover.color = $("changeCoverColor").value;
        b.modifiedAt = Date.now();
      }, "Свойства сохранены")
    )
      details.close();
  };
  $("duplicateNotebook").onclick = async () => {
    const id = Library.id();
    if (
      await commit((next) => {
        const source = next.books.find((b) => b.id === actionId);
        if (!source) throw new Error("Блокнот не найден");
        const copy = structuredClone(source);
        Object.assign(copy, {
          id,
          name: source.name + " (копия)",
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          lastOpenedAt: 0,
          favorite: false,
          deletedAt: null,
        });
        next.books.push(copy);
      }, "Копия создана")
    )
      details.close();
  };
  $("trashNotebook").onclick = async () => {
    if (
      await commit((next) => {
        const b = next.books.find((b) => b.id === actionId);
        if (!b) throw new Error("Блокнот не найден");
        b.deletedAt = Date.now();
        if (next.selected === b.id)
          next.selected = Library.active(next)[0]?.id || null;
      }, "Блокнот в корзине. Его можно восстановить.")
    )
      details.close();
  };
  function folderEditor(id = null) {
    folderId = id;
    const f = data.folders.find((f) => f.id === id);
    $("folderTitle").textContent = f ? "Свойства папки" : "Новая папка";
    $("folderName").value = f?.name || "";
    $("removeFolder").hidden = !id;
    $("folderError").textContent = "";
    folderDialog.showModal();
    $("folderName").focus();
  }
  $("newFolder").onclick = () => folderEditor();
  $("folderForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("folderName").value.trim();
    if (!name) return;
    if (
      data.folders.some(
        (f) =>
          f.id !== folderId &&
          f.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"),
      )
    ) {
      $("folderError").textContent = "Папка с таким названием уже существует";
      return;
    }
    if (
      await commit((next) => {
        if (folderId) next.folders.find((f) => f.id === folderId).name = name;
        else next.folders.push({ id: Library.id(), name });
      }, "Папка сохранена")
    )
      folderDialog.close();
  };
  $("removeFolder").onclick = async () => {
    if (
      await commit((next) => {
        next.folders = next.folders.filter((f) => f.id !== folderId);
        for (const b of next.books)
          if (b.folderId === folderId) b.folderId = null;
      }, "Папка удалена. Блокноты сохранены.")
    ) {
      view = "all";
      folderDialog.close();
      renderHome();
    }
  };
  function card(b, recent = false) {
    const article = document.createElement("article");
    article.className = "home-card";
    article.dataset.bookId = b.id;
    const button = document.createElement("button");
    button.className = "home-book-open";
    button.setAttribute(
      "aria-label",
      (b.deletedAt ? "Удалённый блокнот: " : "Открыть: ") + b.name,
    );
    const cover = document.createElement("span");
    cover.className = "home-cover";
    cover.style.setProperty("--cover", b.cover.color);
    cover.dataset.pattern = b.cover.pattern;
    const title = document.createElement("strong");
    title.textContent = b.name;
    cover.append(NotepadIcons.create("notebook"), title);
    const caption = document.createElement("span");
    caption.className = "home-book-caption";
    const name = document.createElement("strong");
    name.textContent = b.name;
    const meta = document.createElement("small");
    meta.textContent =
      b.pages.length +
      " стр. · " +
      date(recent ? b.lastOpenedAt : b.modifiedAt);
    caption.append(name, meta);
    button.append(cover, caption);
    button.disabled = b.deletedAt != null;
    button.onclick = () => open(b.id);
    article.append(button);
    const actions = document.createElement("div");
    actions.className = "home-card-actions";
    if (b.deletedAt != null) {
      const restore = document.createElement("button");
      restore.className = "restore-notebook";
      restore.textContent = "Восстановить";
      restore.onclick = () =>
        commit((next) => {
          next.books.find((x) => x.id === b.id).deletedAt = null;
        }, "Блокнот восстановлен");
      actions.append(restore);
    } else {
      const favorite = document.createElement("button");
      favorite.className = "home-favorite";
      Interface.decorate(
        favorite,
        "star",
        (b.favorite ? "Убрать из избранного: " : "В избранное: ") + b.name,
        true,
      );
      favorite.setAttribute("aria-pressed", String(b.favorite));
      favorite.onclick = () =>
        commit(
          (next) => {
            const item = next.books.find((x) => x.id === b.id);
            item.favorite = !item.favorite;
          },
          b.favorite ? "Удалено из избранного" : "Добавлено в избранное",
        );
      const more = document.createElement("button");
      more.className = "home-book-more";
      Interface.decorate(more, "more", "Свойства: " + b.name, true);
      more.onclick = () => properties(b.id);
      actions.append(favorite, more);
    }
    article.append(actions);
    return article;
  }
  function renderHome() {
    if (!storageReady) {
      $("homeCount").textContent = storageFailed
        ? "Хранилище недоступно. Исходные данные не перезаписаны."
        : "Открываем вашу библиотеку…";
      return;
    }
    for (const b of data.books) Library.initialize(b);
    const folder = view.startsWith("folder:")
      ? data.folders?.find((f) => f.id === view.slice(7))
      : null;
    if (view.startsWith("folder:") && !folder) view = "all";
    const title =
      folder?.name ||
      { all: "Все блокноты", favorites: "Избранное", trash: "Корзина" }[view];
    $("homeTitle").textContent = title;
    $("homeGridTitle").textContent = title;
    const query = $("homeSearch").value.trim().toLocaleLowerCase("ru");
    let books = data.books.filter(
      (b) =>
        (view === "trash" ? b.deletedAt != null : b.deletedAt == null) &&
        (view !== "favorites" || b.favorite) &&
        (!folder || b.folderId === folder.id) &&
        b.name.toLocaleLowerCase("ru").includes(query),
    );
    books.sort(
      $("homeSort").value === "name"
        ? (a, b) => a.name.localeCompare(b.name, "ru")
        : (a, b) =>
            b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name, "ru"),
    );
    $("homeBooks").replaceChildren(...books.map((b) => card(b)));
    $("homeCount").textContent =
      books.length + " " + (view === "trash" ? "в корзине" : "в библиотеке");
    $("homeEmpty").hidden = books.length > 0;
    $("homeEmpty").textContent = query
      ? "По этому запросу ничего не найдено."
      : view === "trash"
        ? "Корзина пуста. Удалённые блокноты будут храниться здесь до восстановления."
        : view === "favorites"
          ? "Добавляйте важные блокноты в избранное звездой на обложке."
          : folder
            ? "В этой папке пока нет блокнотов. Выберите её при создании или в свойствах блокнота."
            : "Здесь начнётся ваша следующая идея. Создайте блокнот или импортируйте документ.";
    const recent = Library.active(data)
      .filter((b) => b.lastOpenedAt > 0)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 4);
    $("homeRecent").hidden = view !== "all" || !!query || !recent.length;
    $("recentBooks").replaceChildren(...recent.map((b) => card(b, true)));
    $("homeFolders").replaceChildren();
    for (const f of data.folders || []) {
      const row = document.createElement("div");
      row.className = "home-folder-row";
      const select = document.createElement("button");
      select.textContent = f.name;
      select.dataset.folderId = f.id;
      select.setAttribute("aria-current", String(view === "folder:" + f.id));
      select.onclick = () => {
        view = "folder:" + f.id;
        renderHome();
      };
      const edit = document.createElement("button");
      Interface.decorate(edit, "more", "Свойства папки: " + f.name, true);
      edit.onclick = () => folderEditor(f.id);
      row.append(select, edit);
      $("homeFolders").append(row);
    }
    for (const b of root.querySelectorAll("[data-view]"))
      b.setAttribute("aria-current", String(b.dataset.view === view));
  }
  $("homeTitle").tabIndex = -1;
  for (const b of root.querySelectorAll("[data-view]"))
    b.onclick = () => {
      view = b.dataset.view;
      renderHome();
    };
  $("homeSearch").oninput = renderHome;
  $("homeSort").value = preferences.homeSort || "modified";
  $("homeSort").onchange = () => {
    preferences.homeSort = $("homeSort").value;
    Editor.persist();
    renderHome();
  };
  back.onclick = () => show();
  root.querySelector(".home-brand").onclick = (e) => {
    e.preventDefault();
    view = "all";
    show({ history: false });
  };
  function fromLocation() {
    let id;
    try {
      id = location.hash.startsWith("#notebook/")
        ? decodeURIComponent(location.hash.slice(10))
        : null;
    } catch {}
    if (id && open(id, { history: false })) return;
    show({ history: false });
    route(null, true);
  }
  window.addEventListener("popstate", fromLocation);
  document.addEventListener("notepad:book-selected", () => {
    const id = data.selected;
    open(id);
  });
  document.addEventListener("notepad:render", () => {
    if (active) renderHome();
  });
  const initialEditor = location.hash.startsWith("#notebook/");
  if (!initialEditor) {
    display(true);
    root.inert = true;
  } else {
    root.hidden = true;
    active = false;
  }
  const initialized = ready.then(() => {
    root.inert = false;
    if (!data.folders) data.folders = [];
    fromLocation();
  });
  return {
    open,
    show,
    refresh: renderHome,
    ready: initialized,
    get active() {
      return active;
    },
  };
})();
