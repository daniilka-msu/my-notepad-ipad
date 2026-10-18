const StudyObjects = (() => {
  const types = ["math-object", "table-object", "sticker-object"];
  const color = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  let loading;
  const cache = new Map();
  function valid(s) {
    if (
      !s ||
      !types.includes(s.type) ||
      !["x", "y", "width", "height"].every(
        (k) => Number.isFinite(s[k]) && Math.abs(s[k]) <= 100000,
      ) ||
      s.width < 40 ||
      s.height < 20 ||
      !color(s.color)
    )
      return false;
    if (s.type === "math-object")
      return (
        typeof s.tex === "string" &&
        s.tex.length > 0 &&
        s.tex.length <= 2000 &&
        !/\\(?:require|href|url|html\w*|class|style|cssId|includegraphics|def|newcommand|renewcommand|let|catcode)\b/.test(
          s.tex,
        )
      );
    if (s.type === "sticker-object")
      return (
        ["important", "question", "done", "idea"].includes(s.symbol) &&
        typeof s.text === "string" &&
        s.text.length <= 80 &&
        color(s.fill)
      );
    return (
      Array.isArray(s.cells) &&
      s.cells.length > 0 &&
      s.cells.length <= 20 &&
      s.cells.every(
        (row) =>
          Array.isArray(row) &&
          row.length === s.cells[0].length &&
          row.length > 0 &&
          row.length <= 8 &&
          row.every((v) => typeof v === "string" && v.length <= 300),
      ) &&
      color(s.fill)
    );
  }
  function engine() {
    if (!loading) {
      window.MathJax = {
        loader: { load: [] },
        tex: {
          packages: ["base", "ams"],
          maxBuffer: 4096,
          maxMacros: 500,
          formatError(_jax, error) {
            throw new Error(error.message);
          },
        },
        svg: { fontCache: "none" },
        startup: { typeset: false },
        options: { enableMenu: false },
      };
      loading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "vendor/mathjax/tex-svg.js";
        script.onload = () => MathJax.startup.promise.then(resolve, reject);
        script.onerror = () =>
          reject(new Error("Не удалось загрузить локальный редактор формул"));
        document.head.append(script);
      });
    }
    return loading;
  }
  function formula(s) {
    const key = s.tex + "|" + s.color;
    if (!cache.has(key)) {
      const promise = (async () => {
        if (!valid(s))
          throw new Error("Неверная формула или запрещённая команда");
        let depth = 0;
        for (const c of s.tex) {
          if (c === "{") depth++;
          if (c === "}") depth--;
          if (depth > 40 || depth < 0)
            throw new Error("Проверьте вложенность скобок");
        }
        if (depth) throw new Error("Закройте фигурные скобки");
        await engine();
        const node = MathJax.tex2svg(s.tex, { display: true });
        const svg = node.querySelector("svg");
        if (!svg || node.querySelector('[data-mml-node="merror"]'))
          throw new Error("Не удалось разобрать формулу");
        const box = svg.getAttribute("viewBox").split(/\s+/).map(Number);
        if (!box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0)
          throw new Error("Введите непустую формулу");
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svg.setAttribute("width", Math.max(1, Math.ceil(box[2] / 40)));
        svg.setAttribute("height", Math.max(1, Math.ceil(box[3] / 40)));
        svg.style.color = s.color;
        svg
          .querySelectorAll('[fill="currentColor"]')
          .forEach((n) => n.setAttribute("fill", s.color));
        svg
          .querySelectorAll('[stroke="currentColor"]')
          .forEach((n) => n.setAttribute("stroke", s.color));
        const text = new XMLSerializer().serializeToString(svg);
        if (text.length > 2000000) throw new Error("Формула слишком сложная");
        const url = URL.createObjectURL(
          new Blob([text], { type: "image/svg+xml" }),
        );
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          return { image, ratio: box[3] / box[2], svg: text };
        } finally {
          URL.revokeObjectURL(url);
        }
      })();
      cache.set(key, promise);
      promise.then(
        (result) => {
          promise.result = result;
        },
        () => cache.delete(key),
      );
      if (cache.size > 16) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  }
  async function prepare(items) {
    await Promise.all(
      Shapes.resolve(items, false)
        .filter((s) => s?.type === "math-object")
        .map(formula),
    );
  }
  function render(c, s) {
    if (s.type === "math-object") {
      const result = cache.get(s.tex + "|" + s.color)?.result;
      if (result) c.drawImage(result.image, s.x, s.y, s.width, s.height);
      else
        formula(s).then(
          () => {
            cachedLength = -1;
            paint();
          },
          () => {
            $("saveStatus").textContent =
              "Ошибка формулы. Откройте её редактор.";
          },
        );
      return;
    }
    c.save();
    c.translate(s.x, s.y);
    c.fillStyle = s.fill;
    c.fillRect(0, 0, s.width, s.height);
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    c.lineWidth = 1.2;
    if (s.type === "table-object") {
      const rows = s.cells.length,
        cols = s.cells[0].length,
        w = s.width / cols,
        h = s.height / rows;
      c.font = Math.max(10, Math.min(18, h * 0.35)) + "px Arial, sans-serif";
      c.textBaseline = "middle";
      s.cells.forEach((row, i) =>
        row.forEach((text, j) => {
          c.strokeRect(j * w, i * h, w, h);
          c.save();
          c.beginPath();
          c.rect(j * w + 5, i * h + 2, w - 10, h - 4);
          c.clip();
          c.fillText(text, j * w + 7, (i + 0.5) * h, w - 14);
          c.restore();
        }),
      );
    } else {
      c.lineWidth = 3;
      c.strokeRect(2, 2, s.width - 4, s.height - 4);
      c.font = "bold " + Math.min(28, s.height * 0.28) + "px Arial";
      c.textBaseline = "middle";
      c.fillText(
        { important: "!", question: "?", done: "✓", idea: "★" }[s.symbol],
        12,
        s.height / 2,
      );
      c.font = "16px Arial";
      const words = s.text.split(/\s+/);
      let line = "",
        y = 25;
      for (const word of words) {
        if (c.measureText(line + " " + word).width > s.width - 60 && line) {
          c.fillText(line, 44, y, s.width - 54);
          line = "";
          y += 22;
        }
        line += (line ? " " : "") + word;
      }
      c.fillText(line, 44, y, s.width - 54);
    }
    c.restore();
  }
  return { types, valid, formula, prepare, render };
})();
