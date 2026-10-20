window.SceneObjects = (() => {
  const types = new Set([
    "text",
    "text-block",
    "image-object",
    "chart-object",
    "math-object",
    "table-object",
    "sticker-object",
  ]);
  const eligible = (s) =>
    !!s &&
    (types.has(s.type) ||
      (!s.type && ["pen", "marker"].includes(s.tool) && s.points?.length));
  const ratio = () => Paper.geometry(book).outputHeight / 1123;
  function base(s) {
    if (!s.type && s.points?.length) {
      let x = Infinity,
        y = Infinity,
        right = -Infinity,
        bottom = -Infinity;
      for (const p of s.points) {
        x = Math.min(x, p.x);
        y = Math.min(y, p.y);
        right = Math.max(right, p.x);
        bottom = Math.max(bottom, p.y);
      }
      return { x, y, width: right - x, height: bottom - y };
    }
    return {
      x: s.x ?? (s.type === "text" ? 36 : 0),
      y: s.y ?? (s.type === "text" ? 50 : 0),
      width: s.width ?? 722,
      height:
        s.type === "text-block"
          ? TextBlocks.layout(s).height
          : s.type === "text"
            ? Math.max(26, s.text.split("\n").length * 26)
            : s.height,
    };
  }
  function rotate(p, center, degrees, scale = 1, dx = 0, dy = 0) {
    const r = ratio(),
      angle = (degrees * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle),
      x = (p.x - center.x) * scale,
      y = (p.y - center.y) * scale * r;
    return {
      ...p,
      x: center.x + dx + x * c - y * s,
      y: center.y + dy + (x * s + y * c) / r,
    };
  }
  function outline(s) {
    if (!s.type && s.points?.length) return s.points;
    const b = base(s),
      center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    return [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
    ].map((p) => rotate(p, center, s.rotation || 0));
  }
  function bounds(s) {
    const points = outline(s),
      margin = !s.type && s.points ? (s.width || 1) * 2 : 0;
    let x = Infinity,
      y = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const p of points) {
      x = Math.min(x, p.x);
      y = Math.min(y, p.y);
      right = Math.max(right, p.x);
      bottom = Math.max(bottom, p.y);
    }
    return {
      x: x - margin,
      y: y - margin,
      width: right - x + margin * 2,
      height: bottom - y + margin * 2,
    };
  }
  function contains(point, path) {
    let inside = false;
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const a = path[i],
        b = path[j];
      if (pointSegmentDistance(point, a, b) < 1e-7) return true;
      if (
        a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
    }
    return inside;
  }
  function cuts(a, b, c, d) {
    const x = b.x - a.x,
      y = b.y - a.y,
      u = d.x - c.x,
      v = d.y - c.y,
      den = x * v - y * u;
    if (Math.abs(den) < 1e-10) return null;
    const t = ((c.x - a.x) * v - (c.y - a.y) * u) / den,
      w = ((c.x - a.x) * y - (c.y - a.y) * x) / den;
    return t >= 0 && t <= 1 && w >= 0 && w <= 1 ? t : null;
  }
  function segmentInside(a, b, path) {
    if (!contains(a, path) || !contains(b, path)) return false;
    const ts = [0, 1];
    for (let i = 0; i < path.length; i++) {
      const t = cuts(a, b, path[i], path[(i + 1) % path.length]);
      if (t !== null) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    return ts.every(
      (t, i) =>
        !i ||
        contains(
          {
            x: a.x + ((b.x - a.x) * (t + ts[i - 1])) / 2,
            y: a.y + ((b.y - a.y) * (t + ts[i - 1])) / 2,
          },
          path,
        ),
    );
  }
  function selected(s, path, intersect = false) {
    if (!eligible(s) || path.length < 3) return false;
    const points = outline(s),
      closed = !!s.type || !s.points || Shapes.closed.has(s.shape);
    if (!intersect) {
      if (
        !points.every((p) => contains(p, path)) ||
        !points.every((p, i) => !i || segmentInside(points[i - 1], p, path)) ||
        (closed && !segmentInside(points.at(-1), points[0], path))
      )
        return false;
      if (!s.type && s.points) {
        const r = ratio(),
          physical = (p) => ({ x: p.x, y: p.y * r }),
          radius = (s.width || 1) * 2;
        for (let i = 0; i < points.length; i++)
          for (let j = 0; j < path.length; j++)
            if (
              segmentDistance(
                physical(points[Math.max(0, i - 1)]),
                physical(points[i]),
                physical(path[j]),
                physical(path[(j + 1) % path.length]),
              ) < radius
            )
              return false;
      }
      return true;
    }
    if (points.some((p) => contains(p, path))) return true;
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)],
        b = points[i];
      for (let j = 0; j < path.length; j++)
        if (
          segmentDistance(a, b, path[j], path[(j + 1) % path.length]) <=
          (!s.type && s.points ? (s.width || 1) / 2 : 0)
        )
          return true;
    }
    return closed && path.some((p) => contains(p, points));
  }
  function transform(s, { dx = 0, dy = 0, scale = 1, angle = 0 }, center) {
    const value = structuredClone(s);
    if (!s.type && s.points) {
      value.points = s.points.map((p) =>
        rotate(p, center, angle, scale, dx, dy),
      );
      if (s.rawPoints)
        value.rawPoints = s.rawPoints.map((p) =>
          rotate(p, center, angle, scale, dx, dy),
        );
      for (const key of ["shapeStart", "shapeEnd"])
        if (s[key]) value[key] = rotate(s[key], center, angle, scale, dx, dy);
      value.width = s.width * scale;
      if (value.radius) value.radius *= scale;
    } else {
      const b = base(s),
        position = rotate(
          { x: b.x + b.width / 2, y: b.y + b.height / 2 },
          center,
          angle,
          scale,
          dx,
          dy,
        );
      value.width = b.width * scale;
      if (s.type === "text-block") value.size = s.size * scale;
      else if (s.height !== undefined) value.height = s.height * scale;
      const height =
        s.type === "text-block"
          ? TextBlocks.layout(value).height
          : b.height * scale;
      value.x = position.x - value.width / 2;
      value.y = position.y - height / 2;
      value.rotation = ((s.rotation || 0) + angle + 360) % 360;
    }
    return value;
  }
  function valid(s) {
    try {
      Backups.validateLibrary({
        books: [
          {
            id: "selection-check",
            name: "Проверка",
            paper: "blank",
            pages: [[s]],
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }
  function render(context, s, draw) {
    const b = base(s);
    context.save();
    if (s.opacity !== undefined) context.globalAlpha *= s.opacity;
    if (s.rotation && s.type !== "image-object") {
      context.translate(b.x + b.width / 2, b.y + b.height / 2);
      context.scale(1, 1 / ratio());
      context.rotate((s.rotation * Math.PI) / 180);
      context.scale(1, ratio());
      context.translate(-b.x - b.width / 2, -b.y - b.height / 2);
    }
    try {
      draw();
    } finally {
      context.restore();
    }
  }
  function combined(values) {
    let x = Infinity,
      y = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const value of values) {
      const b = bounds(value);
      x = Math.min(x, b.x);
      y = Math.min(y, b.y);
      right = Math.max(right, b.x + b.width);
      bottom = Math.max(bottom, b.y + b.height);
    }
    return { x, y, width: right - x, height: bottom - y };
  }
  return {
    types,
    eligible,
    base,
    bounds,
    outline,
    contains,
    selected,
    transform,
    valid,
    render,
    combined,
    rotate,
  };
})();
