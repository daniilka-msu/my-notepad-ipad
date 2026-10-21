window.PageBrowser = (() => {
  const dialog = $("pagesDialog"),
    list = $("pageThumbnails");
  let token = 0,
    observer = null,
    timer = null,
    busy = false,
    notebook = null;
  const waiting = new Set(),
    visible = new Set(),
    loaded = new Map();
  function release(button) {
    const image = button.querySelector("canvas");
    if (image) {
      image.width = image.height = 1;
      image.remove();
    }
    loaded.delete(button);
  }
  function stop() {
    token++;
    clearTimeout(timer);
    timer = null;
    observer?.disconnect();
    observer = null;
    waiting.clear();
    visible.clear();
    for (const button of [...loaded.keys()]) release(button);
    $("showPages").setAttribute("aria-expanded", "false");
  }
  async function work() {
    timer = null;
    if (busy || !dialog.open || !waiting.size) return;
    if (activeInkInput()) {
      timer = setTimeout(work, 100);
      return;
    }
    const button = waiting.values().next().value;
    waiting.delete(button);
    if (loaded.has(button) || !visible.has(button) || !button.isConnected) {
      schedule();
      return;
    }
    if (loaded.size >= 8) {
      waiting.add(button);
      return;
    }
    busy = true;
    const version = token,
      source = notebook;
    let image;
    try {
      image = await Documents.thumbnail(source, Number(button.dataset.page));
      if (
        version !== token ||
        !dialog.open ||
        !visible.has(button) ||
        !button.isConnected ||
        activeInkInput()
      ) {
        image.width = image.height = 1;
        if (version === token && visible.has(button)) waiting.add(button);
      } else {
        image.setAttribute("aria-hidden", "true");
        button.prepend(image);
        loaded.set(button, image);
      }
    } catch (error) {
      if (version === token) {
        if (error.name === "InkBusyError" && visible.has(button))
          waiting.add(button);
        else button.title = "Предпросмотр недоступен: " + error.message;
      }
    } finally {
      busy = false;
      schedule();
    }
  }
  function schedule() {
    if (timer === null && waiting.size && dialog.open)
      timer = setTimeout(work, 30);
  }
  function refresh() {
    stop();
    notebook = book;
    list.replaceChildren();
    $("pageNumber").max = book.pages.length;
    $("pageNumber").value = page + 1;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < book.pages.length; i++) {
      const button = document.createElement("button");
      button.className = "page-thumb";
      button.dataset.page = i;
      button.setAttribute("aria-label", "Страница " + (i + 1));
      button.setAttribute("aria-current", String(i === page));
      button.textContent = String(i + 1);
      button.onclick = () => {
        if (book !== notebook) return;
        Editor.go(i);
        dialog.close();
      };
      fragment.append(button);
    }
    list.append(fragment);
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const button = entry.target;
          if (entry.isIntersecting) {
            visible.add(button);
            if (!loaded.has(button)) waiting.add(button);
          } else {
            visible.delete(button);
            waiting.delete(button);
            release(button);
          }
        }
        schedule();
      },
      { root: dialog, rootMargin: "80px" },
    );
    for (const button of list.children) observer.observe(button);
    $("showPages").setAttribute("aria-expanded", "true");
  }
  async function toggle() {
    if (dialog.open) {
      dialog.close();
      return;
    }
    if (!book || book.canvasDocument) return;
    finish();
    Sidebar.close({ restoreFocus: false });
    dialog.show();
    refresh();
    PageActions.refresh();
    if (book.pages.length <= 4) {
      observer.disconnect();
      for (const button of list.children) {
        visible.add(button);
        waiting.add(button);
      }
      while (waiting.size && dialog.open && !activeInkInput()) await work();
    }
  }
  const management = document.createElement("details");
  management.className = "page-management";
  const summary = document.createElement("summary");
  summary.textContent = "Управление страницей";
  $("pageActions").before(management);
  management.append(summary, $("pageActions"));
  const add = document.createElement("button");
  add.id = "panelAddPage";
  add.textContent = "Добавить страницу";
  $("pageActions").prepend(add);
  add.onclick = () => $("addPage").click();
  $("showPages").setAttribute("aria-controls", "pagesDialog");
  $("showPages").setAttribute("aria-expanded", "false");
  dialog.addEventListener("close", stop);
  document.addEventListener("notepad:screen", () => {
    if (dialog.open) dialog.close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dialog.open) {
      dialog.close();
      $("showPages").focus({ preventScroll: true });
    }
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!dialog.open || e.target.closest?.("#pagesDialog,#showPages")) return;
      dialog.close();
      if (e.target.closest?.("#page")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  return {
    toggle,
    refresh,
    get loaded() {
      return loaded.size;
    },
  };
})();
