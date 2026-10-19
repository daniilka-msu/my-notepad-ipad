const InkSurface = (() => {
  const bounds = new WeakMap();
  function intersects(s, v) {
    if (!s.points?.length || s.tool === "eraser") return true;
    let b = bounds.get(s);
    if (!b) {
      b = {
        left: Infinity,
        top: Infinity,
        right: -Infinity,
        bottom: -Infinity,
      };
      const margin = Math.max(4, s.width * 3);
      for (const p of s.points) {
        b.left = Math.min(b.left, p.x - margin);
        b.right = Math.max(b.right, p.x + margin);
        b.top = Math.min(b.top, p.y - margin);
        b.bottom = Math.max(b.bottom, p.y + margin);
      }
      bounds.set(s, b);
    }
    return (
      b.right >= v.x &&
      b.bottom >= v.y &&
      b.left <= v.x + v.width &&
      b.top <= v.y + v.height
    );
  }
  function create(target, maxPixels = 4000000) {
    const scratch = document.createElement("canvas"),
      committed = document.createElement("canvas");
    let key,
      cachedItems,
      count = -1,
      last;
    function draw(items, view, cssWidth, cssHeight, current = null) {
      const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
      const density = Math.min(
        dpr,
        Math.sqrt(maxPixels / Math.max(1, cssWidth * cssHeight)),
      );
      const width = Math.max(1, Math.round(cssWidth * density)),
        height = Math.max(1, Math.round(cssHeight * density));
      const nextKey = [
        width,
        height,
        view.x,
        view.y,
        view.width,
        view.height,
      ].join(",");
      if (key !== nextKey) {
        for (const layer of [target, scratch, committed]) {
          layer.width = width;
          layer.height = height;
        }
        key = nextKey;
        cachedItems = null;
      }
      const sx = width / view.width,
        sy = height / view.height;
      const c = target.getContext("2d"),
        surface = { scratch, view, sx, sy };
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, width, height);
      const preview =
        Shapes.hasPreview(items) || current?.tool === "stroke-eraser";
      const cached =
        !preview &&
        cachedItems === items &&
        count === items.length &&
        last === items.at(-1);
      const append =
        !preview &&
        cachedItems === items &&
        count === items.length - 1 &&
        last === items.at(-2) &&
        ["pen", "marker"].includes(items.at(-1)?.tool) &&
        !items.at(-1)?.type &&
        !items.some((s) => s.type === "object-order");
      if (cached || append) c.drawImage(committed, 0, 0);
      c.setTransform(sx, 0, 0, sy, -view.x * sx, -view.y * sy);
      if (append) {
        if (intersects(items.at(-1), view)) stroke(items.at(-1), c, surface);
      } else if (!cached) {
        const hidden = new Set(
          items
            .filter((s) => s.tool === "stroke-eraser")
            .flatMap((s) => s.targets),
        );
        if (current?.tool === "stroke-eraser")
          for (const i of erasedTargets(current, items)) hidden.add(i);
        for (const [i, s] of Shapes.ordered(items))
          if (
            s &&
            !hidden.has(i) &&
            s.tool !== "stroke-eraser" &&
            intersects(s, view)
          )
            stroke(s, c, surface);
      }
      if (!preview && !cached) {
        const base = committed.getContext("2d");
        base.clearRect(0, 0, width, height);
        base.drawImage(target, 0, 0);
        cachedItems = items;
        count = items.length;
        last = items.at(-1);
      }
      if (preview) cachedItems = null;
      if (current && current.tool !== "stroke-eraser")
        stroke(current, c, surface);
      return { sx, sy, density, width, height };
    }
    function invalidate() {
      cachedItems = null;
    }
    function release() {
      for (const layer of [target, scratch, committed])
        layer.width = layer.height = 1;
      key = null;
      invalidate();
    }
    return { draw, invalidate, release };
  }
  return { create };
})();
