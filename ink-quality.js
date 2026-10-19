window.InkQuality = (() => {
  const detail = document.createElement("canvas"),
    ruling = document.createElement("canvas");
  detail.id = "inkDetail";
  ruling.id = "rulingDetail";
  for (const layer of [ruling, detail]) {
    layer.setAttribute("aria-hidden", "true");
    $("page").append(layer);
  }
  const surface = InkSurface.create(detail);
  let frame = null,
    paperKey = "",
    fallbackUntil = 0;
  function refresh() {
    frame = null;
    if (performance.now() < fallbackUntil) {
      hide();
      return;
    }
    try {
      if (!canvas.isConnected || !$("workspace")) return;
      if (!book || document.body.classList.contains("home-view")) {
        hide();
        return;
      }
      const r = canvas.getBoundingClientRect(),
        wr = $("workspace").getBoundingClientRect();
      const left = Math.max(r.left, wr.left),
        top = Math.max(r.top, wr.top);
      const right = Math.min(r.right, wr.right),
        bottom = Math.min(r.bottom, wr.bottom);
      if (right <= left || bottom <= top) {
        hide();
        return;
      }
      const width = right - left,
        height = bottom - top;
      const view = {
        x: ((left - r.left) / r.width) * W,
        y: ((top - r.top) / r.height) * H,
        width: (width / r.width) * W,
        height: (height / r.height) * H,
      };
      const metrics = surface.draw(
        book.pages[page],
        view,
        width,
        height,
        drawing,
      );
      for (const layer of [detail, ruling]) {
        layer.style.left = left - r.left + "px";
        layer.style.top = top - r.top + "px";
        layer.style.width = width + "px";
        layer.style.height = height + "px";
        layer.hidden = false;
      }
      const nextPaper = JSON.stringify([
        metrics.width,
        metrics.height,
        view,
        book.paper,
        book.paperColor,
        book.gridMm,
        book.pageSize,
        !!book.backgrounds?.[page],
      ]);
      if (paperKey !== nextPaper) {
        paperKey = nextPaper;
        ruling.width = metrics.width;
        ruling.height = metrics.height;
        const c = ruling.getContext("2d");
        c.setTransform(
          metrics.sx,
          0,
          0,
          metrics.sy,
          -view.x * metrics.sx,
          -view.y * metrics.sy,
        );
        if (!book.backgrounds?.[page]) Paper.draw(c, book);
      }
      canvas.style.opacity = "0";
      if ($("paperRuling")) $("paperRuling").style.opacity = "0";
      detail.dataset.documentScale = metrics.sx;
      detail.dataset.density = metrics.density;
    } catch {
      fallbackUntil = performance.now() + 10000;
      hide();
    }
  }
  function hide() {
    detail.hidden = ruling.hidden = true;
    canvas.style.opacity = "";
    if ($("paperRuling")) $("paperRuling").style.opacity = "";
    surface.release();
    ruling.width = ruling.height = 1;
    paperKey = "";
  }
  function schedule() {
    if (frame === null) frame = requestAnimationFrame(refresh);
  }
  $("workspace").addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  new ResizeObserver(schedule).observe($("workspace"));
  new MutationObserver(schedule).observe($("page"), {
    attributes: true,
    attributeFilter: ["style"],
  });
  document.addEventListener("notepad:screen", schedule);
  document.addEventListener("notepad:render", schedule);
  return { schedule, refresh, invalidate: surface.invalidate };
})();
