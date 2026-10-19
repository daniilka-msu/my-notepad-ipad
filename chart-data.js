const ChartData = (() => {
  function number(raw) {
    const value = raw.trim().replace(/\s/g, "").replace(",", ".");
    if (
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ||
      !Number.isFinite(Number(value)) ||
      Math.abs(Number(value)) > 1e9
    )
      throw new Error(
        "Введите конечное число от −1 000 000 000 до 1 000 000 000",
      );
    return Number(value);
  }
  function parse(text, scatter = false) {
    if (typeof text !== "string" || text.length > 12000)
      throw new Error("Таблица слишком большая");
    const lines = text
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.trim());
    if (!lines.length) throw new Error("Вставьте хотя бы одну строку");
    const rows = lines.map((line) =>
      line.split(line.includes("\t") ? "\t" : ";").map((v) => v.trim()),
    );
    if (
      rows[0].length === (scatter ? 3 : 2) &&
      /^(?:значение|значение y|value|y)$/i.test(rows[0].at(-1))
    )
      rows.shift();
    if (!rows.length || rows.length > 100)
      throw new Error("От 1 до 100 строк данных");
    return rows.map((cells, i) => {
      try {
        if (
          cells.length !== (scatter ? 3 : 2) ||
          !cells[0] ||
          cells[0].length > 60
        )
          throw new Error(
            scatter
              ? "Ожидаются подпись, X и Y"
              : "Ожидаются категория и значение",
          );
        return {
          label: cells[0],
          ...(scatter ? { x: number(cells[1]) } : {}),
          value: number(cells.at(-1)),
        };
      } catch (error) {
        throw new Error("Строка " + (i + 1) + ": " + error.message);
      }
    });
  }
  return { parse };
})();
