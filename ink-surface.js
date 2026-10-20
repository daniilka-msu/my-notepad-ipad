const InkSurface = (() => {
  const bounds = new WeakMap();
  function rectangle(s) {
    let b = s === drawing ? null : bounds.get(s);
    if (b) return b;
    if (s.type) {
      if (!window.SceneObjects) return null;
      const r = SceneObjects.bounds(s);
      b = {
        left: r.x - 4,
        top: r.y - 4,
        right: r.x + r.width + 4,
        bottom: r.y + r.height + 4,
      };
    } else {
      if (!s.points?.length) return null;
      const margin = Math.max(4, s.width * 3);
      b = {
        left: Infinity,
        top: Infinity,
        right: -Infinity,
        bottom: -Infinity,
      };
      for (const p of s.points) {
        b.left = Math.min(b.left, p.x - margin);
        b.right = Math.max(b.right, p.x + margin);
        b.top = Math.min(b.top, p.y - margin);
        b.bottom = Math.max(b.bottom, p.y + margin);
      }
    }
    if (s !== drawing) bounds.set(s, b);
    return b;
  }
  function intersects(s, v) {
    const b = rectangle(s);
    if (!b) return true;
    return (
      b.right >= v.x &&
      b.bottom >= v.y &&
      b.left <= v.x + v.width &&
      b.top <= v.y + v.height
    );
  }
  function reordered(items) {
    return items.some(
      (s) =>
        s.type === "object-order" ||
        (s.type === "selection-edit" && s.placement),
    );
  }
  function patch(context, items, added, view, sx, sy, surface = null) {
    const b = rectangle(added);
    if (!b) return false;
    const x = Math.max(
        view.x,
        view.x + Math.floor((b.left - view.x) * sx) / sx,
      ),
      y = Math.max(view.y, view.y + Math.floor((b.top - view.y) * sy) / sy),
      right = Math.min(
        view.x + view.width,
        view.x + Math.ceil((b.right - view.x) * sx) / sx,
      ),
      bottom = Math.min(
        view.y + view.height,
        view.y + Math.ceil((b.bottom - view.y) * sy) / sy,
      );
    if (right <= x || bottom <= y) return true;
    const area = { x, y, width: right - x, height: bottom - y },
      hidden = new Set(
        items
          .filter((s) => s.tool === "stroke-eraser")
          .flatMap((s) => s.targets),
      );
    context.save();
    context.beginPath();
    context.rect(x, y, area.width, area.height);
    context.clip();
    context.clearRect(x, y, area.width, area.height);
    for (const [index, value] of Shapes.ordered(items, false))
      if (
        value &&
        !hidden.has(index) &&
        value.tool !== "stroke-eraser" &&
        intersects(value, area)
      )
        stroke(value, context, surface);
    context.restore();
    return true;
  }
  function create(target, maxPixels = 4000000, activeTarget = null) {
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
        if (activeTarget) {
          activeTarget.width = width;
          activeTarget.height = height;
        }
        key = nextKey;
        cachedItems = null;
      }
      const sx = width / view.width,
        sy = height / view.height;
      const c = target.getContext("2d"),
        surface = { scratch, view, sx, sy };
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
        !items.at(-1)?.type;
      const separate =
        activeTarget &&
        current &&
        !current.shape &&
        ["pen", "marker"].includes(current.tool) &&
        !preview;
      if (activeTarget) {
        activeTarget.hidden = !separate;
        const overlay = activeTarget.getContext("2d");
        overlay.setTransform(1, 0, 0, 1, 0, 0);
        overlay.clearRect(0, 0, width, height);
      }
      if (!(cached && separate)) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, width, height);
        if (cached || append) c.drawImage(committed, 0, 0);
        c.setTransform(sx, 0, 0, sy, -view.x * sx, -view.y * sy);
        if (append) {
          if (intersects(items.at(-1), view)) {
            if (
              !reordered(items) ||
              !patch(c, items, items.at(-1), view, sx, sy, surface)
            )
              stroke(items.at(-1), c, surface);
          }
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
      }
      if (preview) cachedItems = null;
      if (current && current.tool !== "stroke-eraser") {
        const destination = separate ? activeTarget.getContext("2d") : c;
        destination.setTransform(sx, 0, 0, sy, -view.x * sx, -view.y * sy);
        stroke(current, destination, surface);
      }
      return { sx, sy, density, width, height };
    }
    function invalidate() {
      cachedItems = null;
    }
    function release() {
      for (const layer of [target, scratch, committed])
        layer.width = layer.height = 1;
      if (activeTarget) activeTarget.width = activeTarget.height = 1;
      key = null;
      invalidate();
    }
    return { draw, invalidate, release };
  }
  return { create, patch, reordered, rectangle };
})();
