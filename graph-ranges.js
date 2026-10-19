const GraphRanges = (() => {
  function normalize(expression) {
    if (typeof expression !== "string") throw new Error("Введите формулу");
    return expression.trim().replace(/^y\s*=\s*/i, "");
  }
  function automatic(functions, xMin, xMax, points = []) {
    if (
      !Number.isFinite(xMin) ||
      !Number.isFinite(xMax) ||
      xMax - xMin < 0.001 ||
      Math.abs(xMin) > 1e6 ||
      Math.abs(xMax) > 1e6
    )
      throw new Error(
        "Диапазон X должен возрастать и находиться в пределах ±1 000 000",
      );
    const values = points
      .map((p) => p.y)
      .filter((y) => Number.isFinite(y) && Math.abs(y) <= 1e6);
    for (const f of functions) {
      const evaluate = MathExpression.compile(normalize(f.expression));
      for (let i = 0; i <= 400; i++) {
        const y = evaluate(xMin + ((xMax - xMin) * i) / 400);
        if (Number.isFinite(y) && Math.abs(y) <= 1e6) values.push(y);
      }
    }
    if (!values.length)
      throw new Error(
        "На этом диапазоне нет конечных значений. Измените X или задайте Y вручную.",
      );
    const min = Math.min(...values),
      max = Math.max(...values),
      pad = Math.max(
        (max - min) * 0.08,
        max === min ? Math.max(1, Math.abs(max) * 0.1) : 0.01,
      );
    return { yMin: Math.max(-1e6, min - pad), yMax: Math.min(1e6, max + pad) };
  }
  return { normalize, automatic };
})();
