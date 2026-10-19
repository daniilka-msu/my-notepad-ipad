const ChartRequests = (() => {
  const kinds = ["bar", "line", "pie", "doughnut", "scatter"];
  let provider = null;
  const listeners = new Set();
  function validate(result) {
    if (
      !result ||
      Array.isArray(result) ||
      typeof result !== "object" ||
      Object.keys(result).some((k) => !["kind", "title", "data"].includes(k)) ||
      !kinds.includes(result.kind) ||
      typeof (result.title ?? "") !== "string" ||
      (result.title || "").length > 100 ||
      !Array.isArray(result.data) ||
      !result.data.length ||
      result.data.length > 100
    )
      throw new Error(
        "Результат должен содержать тип диаграммы, название и от 1 до 100 строк данных",
      );
    const data = result.data.map((row, i) => {
      if (
        !row ||
        Object.keys(row).some(
          (k) =>
            ![
              "label",
              "value",
              ...(result.kind === "scatter" ? ["x"] : []),
            ].includes(k),
        ) ||
        typeof row.label !== "string" ||
        !row.label.trim() ||
        row.label.trim().length > 60 ||
        typeof row.value !== "number" ||
        !Number.isFinite(row.value) ||
        Math.abs(row.value) > 1e9 ||
        (result.kind === "scatter" &&
          (typeof row.x !== "number" ||
            !Number.isFinite(row.x) ||
            Math.abs(row.x) > 1e9))
      )
        throw new Error("Неверная строка результата: " + (i + 1));
      return {
        label: row.label.trim(),
        value: row.value,
        ...(result.kind === "scatter" ? { x: row.x } : {}),
      };
    });
    if (
      ["pie", "doughnut"].includes(result.kind) &&
      (data.some((row) => row.value < 0) ||
        data.reduce((sum, row) => sum + row.value, 0) <= 0)
    )
      throw new Error(
        "Круговая диаграмма требует неотрицательные значения с положительной суммой",
      );
    return { kind: result.kind, title: result.title || "", data };
  }
  function request(text) {
    if (typeof text !== "string" || !text.trim() || text.length > 3000)
      throw new Error("Введите запрос длиной от 1 до 3000 символов");
    return text.trim();
  }
  function parse(text) {
    let body = request(text),
      kind = "bar";
    const prefix = body.match(
      /^(?:(?:построй|создай|сделай|нарисуй)\s+)?(?:(столбчат[а-яё]*|линейн[а-яё]*|кругов[а-яё]*|кольцев[а-яё]*)\s+)?диаграмм[а-яё]*\s*[:—-]?\s*/iu,
    );
    if (prefix) {
      const type = prefix[1] || "";
      kind = /кругов/iu.test(type)
        ? "pie"
        : /кольцев/iu.test(type)
          ? "doughnut"
          : /линейн/iu.test(type)
            ? "line"
            : "bar";
      body = body.slice(prefix[0].length);
    } else if (/^(?:построй|создай|сделай|нарисуй|график)(?:\s|$)/iu.test(body))
      throw new Error(
        "Локально поддерживаются только диаграммы с явными парами «название число». Для формул откройте «Графики».",
      );
    const chunks = body
      .split(/;|\r?\n|,\s*(?=[^\d\s+\-])/u)
      .filter((v) => v.trim());
    const rows = chunks.map((chunk, i) => {
      const match = chunk.match(
        /^\s*([^:=,;]+?)\s*(?:[:=]|\s)\s*([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?)\s*$/iu,
      );
      if (!match)
        throw new Error(
          "Фрагмент " +
            (i + 1) +
            ": укажите название и число, например «математика 85». Сложный запрос не распознаётся локальным парсером.",
        );
      return match[1].trim() + ";" + match[2];
    });
    return validate({ kind, data: ChartData.parse(rows.join("\n")) });
  }
  function connect(adapter) {
    if (
      adapter !== null &&
      (!adapter ||
        typeof adapter.generate !== "function" ||
        typeof adapter.label !== "string" ||
        !adapter.label.trim() ||
        adapter.label.length > 80)
    )
      throw new Error("Нужен адаптер generate с понятным названием");
    provider = adapter;
    for (const listener of listeners) listener();
  }
  async function generate(text, { signal } = {}) {
    const input = request(text),
      adapter = provider;
    if (!adapter)
      throw new Error(
        "ИИ не подключён. Можно использовать локальный разбор простых запросов.",
      );
    if (signal?.aborted) throw new Error("Запрос отменён");
    const result = await adapter.generate({ text: input, signal });
    if (signal?.aborted || adapter !== provider)
      throw new Error("Запрос отменён");
    return validate(result);
  }
  return {
    parse,
    validate,
    connect,
    generate,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get providerLabel() {
      return provider?.label || null;
    },
  };
})();
