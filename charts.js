const Charts = (() => {
  const studioKinds = {
    ...LegacyCharts.kinds,
    doughnut: "Кольцевая диаграмма",
    scatter: "Точечная диаграмма",
  };
  const themes = {
    studio: {
      label: "Studio · индиго",
      background: "#ffffff",
      text: "#26334d",
      grid: "#e5eaf3",
      colors: ["#5369d8", "#16a394", "#e6a03e", "#cf6282", "#8b6ed0"],
    },
    ink: {
      label: "Чернила · монохром",
      background: "#fffdf8",
      text: "#30302e",
      grid: "#e6e1d6",
      colors: ["#303f58", "#64778f", "#93a4b4", "#b9c2cc", "#758d89"],
    },
    aurora: {
      label: "Аврора · тёмная",
      background: "#1e293d",
      text: "#ecf0fa",
      grid: "#39455b",
      colors: ["#98abff", "#6bdcc1", "#f4c276", "#f39bb4", "#c2acfa"],
    },
  };
  const color = (value) =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  const dataNumber = (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 1e9;
  const number = (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 1e6;
  function upgrade(source) {
    const s = structuredClone(source);
    if (s.chartVersion === 3) return s;
    s.chartVersion = 3;
    s.style = {
      theme: "studio",
      legend: true,
      labels: false,
      grid: true,
      smooth: false,
      xTitle: "",
      yTitle: "",
      scale: "linear",
    };
    if (s.kind === "function")
      s.functions = [
        { expression: s.expression, color: s.color, name: "f(x)" },
      ];
    if (["function", "axes"].includes(s.kind)) s.points = [];
    if (s.kind === "flow")
      s.nodes = s.nodes.map((n, i) => ({
        ...n,
        x: 90 + (i % 3) * 210,
        y: 100 + Math.floor(i / 3) * 100,
      }));
    return s;
  }
  function valid(s) {
    if (s?.chartVersion === undefined) return LegacyCharts.valid(s);
    if (
      s.chartVersion !== 3 ||
      s.type !== "chart-object" ||
      !Object.hasOwn(studioKinds, s.kind) ||
      !["x", "y", "width", "height"].every((k) => number(s[k])) ||
      s.width < 80 ||
      s.height < 60 ||
      typeof s.title !== "string" ||
      s.title.length > 100 ||
      !color(s.color)
    )
      return false;
    const style = s.style;
    if (
      style?.hidden !== undefined &&
      (!Array.isArray(style.hidden) ||
        style.hidden.length > 100 ||
        style.hidden.some((n) => typeof n !== "string" || n.length > 100))
    )
      return false;
    if (
      !style ||
      !Object.hasOwn(themes, style.theme) ||
      !["legend", "labels", "grid", "smooth"].every(
        (k) => typeof style[k] === "boolean",
      ) ||
      !["linear", "log"].includes(style.scale) ||
      !["xTitle", "yTitle"].every(
        (k) => typeof style[k] === "string" && style[k].length <= 60,
      )
    )
      return false;
    if (["bar", "line", "pie", "doughnut", "scatter"].includes(s.kind))
      return (
        Array.isArray(s.data) &&
        s.data.length > 0 &&
        s.data.length <= 100 &&
        s.data.every(
          (v) =>
            v &&
            typeof v.label === "string" &&
            v.label.length <= 60 &&
            dataNumber(v.value) &&
            (v.color === undefined || color(v.color)) &&
            (!["pie", "doughnut"].includes(s.kind) || v.value >= 0) &&
            (s.kind !== "scatter" || dataNumber(v.x)) &&
            (style.scale !== "log" ||
              !["bar", "line", "scatter"].includes(s.kind) ||
              v.value > 0),
        ) &&
        (!["pie", "doughnut"].includes(s.kind) ||
          s.data.some((v) => v.value > 0))
      );
    if (s.kind === "flow")
      return (
        Array.isArray(s.nodes) &&
        s.nodes.length > 0 &&
        s.nodes.length <= 24 &&
        s.nodes.every(
          (n, index) =>
            n &&
            ["rect", "diamond", "start", "io"].includes(n.kind) &&
            typeof n.text === "string" &&
            n.text.length <= 60 &&
            number(n.x) &&
            number(n.y) &&
            Array.isArray(n.next) &&
            n.next.length <= 24 &&
            n.next.every(
              (i) =>
                Number.isInteger(i) &&
                i >= 0 &&
                i < s.nodes.length &&
                i !== index,
            ),
        )
      );
    if (
      !["xMin", "xMax", "yMin", "yMax"].every((k) => number(s[k])) ||
      s.xMax - s.xMin < 0.001 ||
      s.yMax - s.yMin < 0.001 ||
      style.scale === "log"
    )
      return false;
    if (
      !Array.isArray(s.points) ||
      s.points.length > 40 ||
      s.points.some(
        (p) =>
          !p ||
          !number(p.x) ||
          !number(p.y) ||
          typeof p.name !== "string" ||
          p.name.length > 40,
      )
    )
      return false;
    if (s.kind === "function") {
      if (s.autoY !== undefined && typeof s.autoY !== "boolean") return false;
      if (
        !Array.isArray(s.functions) ||
        !s.functions.length ||
        s.functions.length > 6
      )
        return false;
      try {
        if (s.expression !== s.functions[0].expression) return false;
        for (const f of s.functions) {
          if (
            !f ||
            !color(f.color) ||
            typeof f.name !== "string" ||
            f.name.length > 40
          )
            return false;
          MathExpression.compile(f.expression);
        }
      } catch {
        return false;
      }
    }
    return true;
  }
  function samples(s, expression = s.expression) {
    const fn = MathExpression.compile(expression),
      height = s.yMax - s.yMin;
    let previous = null;
    return Array.from({ length: 1201 }, (_, i) => {
      const x = s.xMin + ((s.xMax - s.xMin) * i) / 1200,
        y = fn(x),
        jump = previous !== null && Math.abs(y - previous) > height * 2;
      previous = Number.isFinite(y) ? y : null;
      return {
        x,
        y:
          Number.isFinite(y) &&
          !jump &&
          y >= s.yMin - height * 3 &&
          y <= s.yMax + height * 3
            ? y
            : NaN,
      };
    });
  }
  function option(raw, interactive = false, width = 640) {
    const s = upgrade(raw),
      style = s.style,
      t = themes[style.theme],
      colors = [s.color, ...t.colors.filter((c) => c !== s.color)],
      base = {
        animation: false,
        backgroundColor: t.background,
        color: colors,
        textStyle: { fontFamily: "Arial, sans-serif", color: t.text },
        aria: { enabled: true },
        title: {
          text: s.title || studioKinds[s.kind],
          left: 24,
          top: 18,
          textStyle: {
            color: t.text,
            fontSize: 18,
            fontWeight: 600,
            width: Math.max(100, width - 48),
            overflow: "truncate",
            ellipsis: "…",
          },
        },
        tooltip: { show: interactive, renderMode: "richText", confine: true },
        legend: {
          show: style.legend && s.kind !== "flow",
          type: "scroll",
          top: 53,
          left: 24,
          right: 24,
          textStyle: { color: t.text },
          inactiveColor: "#7e8798",
          selectedMode: interactive,
          selected: Object.fromEntries(
            (style.hidden || []).map((n) => [n, false]),
          ),
        },
        series: [],
      };
    const label = { show: style.labels, color: t.text, fontSize: 12 };
    if (s.kind === "pie" || s.kind === "doughnut") {
      base.series = [
        {
          name: s.title || "Значения",
          type: "pie",
          radius: s.kind === "doughnut" ? ["38%", "66%"] : ["0%", "66%"],
          center: ["50%", "58%"],
          avoidLabelOverlap: true,
          label: {
            ...label,
            formatter: "{b}: {c}",
            overflow: "truncate",
            width: 100,
          },
          labelLayout: { hideOverlap: true },
          itemStyle: {
            borderRadius: 5,
            borderColor: t.background,
            borderWidth: 3,
          },
          data: s.data.map((d, i) => ({
            name: d.label,
            value: d.value,
            itemStyle: { color: d.color || colors[i % colors.length] },
          })),
        },
      ];
      base.legend.data = s.data.map((d) => d.label);
      return base;
    }
    if (s.kind === "flow") {
      base.series = [
        {
          type: "graph",
          layout: "none",
          left: 45,
          right: 45,
          top: 105,
          bottom: 45,
          roam: false,
          draggable: interactive,
          symbolSize: [124, 52],
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: [0, 10],
          lineStyle: {
            color: s.color,
            width: 2,
            opacity: 0.85,
            curveness: 0.12,
          },
          label: {
            show: true,
            color: t.text,
            fontSize: 12,
            overflow: "break",
            width: 105,
          },
          itemStyle: {
            color: t.background,
            borderColor: s.color,
            borderWidth: 2,
            shadowBlur: 8,
            shadowColor: "#00000012",
          },
          emphasis: { focus: "adjacency" },
          data: s.nodes
            .map((n, i) => ({
              id: String(i),
              name: n.text,
              x: n.x,
              y: n.y,
              symbol:
                n.kind === "diamond"
                  ? "diamond"
                  : n.kind === "start"
                    ? "roundRect"
                    : n.kind === "io"
                      ? "path://M-60,-26L72,-26L60,26L-72,26Z"
                      : "rect",
              symbolSize: n.kind === "diamond" ? [142, 76] : [124, 52],
            }))
            .concat([
              {
                id: "anchor-a",
                x: 0,
                y: 0,
                symbolSize: 0,
                label: { show: false },
                draggable: false,
              },
              {
                id: "anchor-b",
                x: 640,
                y: 420,
                symbolSize: 0,
                label: { show: false },
                draggable: false,
              },
            ]),
          links: s.nodes.flatMap((n, i) =>
            n.next.map((j) => ({ source: String(i), target: String(j) })),
          ),
        },
      ];
      return base;
    }
    const math = ["function", "axes"].includes(s.kind),
      scatter = s.kind === "scatter";
    base.grid = {
      left: 68,
      right: 30,
      top: style.legend ? 100 : 80,
      bottom: interactive && math ? 72 : 56,
      containLabel: false,
    };
    const axis = (name) => ({
      name,
      nameLocation: "middle",
      nameGap: 34,
      nameTextStyle: { color: t.text },
      axisLine: { show: true, lineStyle: { color: t.text, opacity: 0.35 } },
      axisTick: { show: false },
      axisLabel: { color: t.text, hideOverlap: true },
      splitLine: { show: style.grid, lineStyle: { color: t.grid } },
      minorTick: { show: false },
    });
    base.xAxis = {
      ...axis(style.xTitle || (math || scatter ? "x" : "")),
      type: math || scatter ? "value" : "category",
      ...(math
        ? { min: s.xMin, max: s.xMax }
        : scatter
          ? {}
          : { data: s.data.map((d) => d.label) }),
      boundaryGap: !math && !scatter && s.kind === "bar",
    };
    base.yAxis = {
      ...axis(style.yTitle || (math || scatter ? "y" : "")),
      type: style.scale === "log" ? "log" : "value",
      ...(math ? { min: s.yMin, max: s.yMax } : { scale: s.kind !== "bar" }),
    };
    if (math) {
      base.series =
        s.kind === "function"
          ? s.functions.map((f) => ({
              name: f.name || f.expression,
              type: "line",
              symbol: "none",
              connectNulls: false,
              clip: true,
              lineStyle: { width: 2.5, color: f.color },
              itemStyle: { color: f.color },
              data: samples(s, f.expression).map((p) => [
                p.x,
                Number.isFinite(p.y) ? p.y : null,
              ]),
            }))
          : [];
      if (s.points.length)
        base.series.push({
          name: "Точки",
          type: "scatter",
          symbolSize: 10,
          label: {
            show: true,
            position: "top",
            color: t.text,
            formatter: (p) => p.data.name || "(" + p.value.join("; ") + ")",
          },
          data: s.points.map((p) => ({ name: p.name, value: [p.x, p.y] })),
        });
      if (interactive)
        base.dataZoom = [
          {
            type: "inside",
            xAxisIndex: 0,
            filterMode: "none",
            minValueSpan: 0.001,
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            moveOnMouseWheel: false,
          },
          {
            type: "inside",
            yAxisIndex: 0,
            filterMode: "none",
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
          },
          {
            type: "slider",
            xAxisIndex: 0,
            bottom: 12,
            height: 18,
            showDetail: false,
          },
        ];
    } else
      base.series = [
        {
          name: s.title || "Значения",
          type: scatter ? "scatter" : s.kind,
          smooth: style.smooth && s.kind === "line",
          symbolSize: scatter ? 12 : 7,
          barMaxWidth: 60,
          itemStyle: {
            borderRadius: s.kind === "bar" ? [5, 5, 0, 0] : 0,
            color: s.color,
          },
          lineStyle: { width: 3 },
          label: {
            ...label,
            position: "top",
            formatter: scatter
              ? (p) => (p.name ? p.name + ": " : "") + p.value[1]
              : "{c}",
          },
          data: s.data.map((d) =>
            scatter ? { name: d.label, value: [d.x, d.value] } : d.value,
          ),
        },
      ];
    return base;
  }
  const cache = new Map();
  function render(context, s) {
    if (s.chartVersion === undefined) {
      LegacyCharts.render(context, s);
      return;
    }
    const { x, y, width, height, ...content } = s,
      key = JSON.stringify(content);
    let image = cache.get(key);
    if (!image) {
      const target = document.createElement("canvas"),
        instance = echarts.init(target, null, {
          renderer: "canvas",
          width: 640,
          height: 420,
          devicePixelRatio: 2,
        });
      try {
        instance.setOption(option(s), { notMerge: true });
        instance.getZr().flush();
        image = document.createElement("canvas");
        image.width = 1280;
        image.height = 840;
        image.getContext("2d").drawImage(target, 0, 0);
        cache.set(key, image);
        if (cache.size > 3) cache.delete(cache.keys().next().value);
      } finally {
        instance.dispose();
      }
    } else {
      cache.delete(key);
      cache.set(key, image);
    }
    context.drawImage(image, x, y, width, height);
  }
  return {
    kinds: LegacyCharts.kinds,
    studioKinds,
    themes,
    valid,
    upgrade,
    option,
    render,
    samples,
  };
})();
