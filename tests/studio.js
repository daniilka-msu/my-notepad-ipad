async function runStudioTests(check) {
  const originalBook = book,
    originalPage = page,
    fixture = {
      id: "studio-gallery",
      name: "Studio 3.0",
      paper: "grid",
      gridMm: 5,
      pages: [[]],
    };
  data.books.push(fixture);
  data.selected = fixture.id;
  page = 0;
  render();
  PageView.fit();
  const legacy = {
      type: "chart-object",
      kind: "bar",
      x: 70,
      y: 100,
      width: 540,
      height: 360,
      title: "Старая диаграмма",
      color: "#4567d9",
      data: [
        { label: "А", value: 2 },
        { label: "Б", value: 5 },
      ],
    },
    before = JSON.stringify(legacy);
  fixture.pages[0].push(legacy);
  render();
  ObjectTools.select(0);
  $("editObject").click();
  check(
    "legacy opens in Studio without changing original",
    JSON.stringify(legacy) === before &&
      $("chartDataTable").tBodies[0].rows.length === 2,
  );
  $("closeChart").click();
  check(
    "cancel legacy edit preserves legacy renderer",
    fixture.pages[0].length === 1 && !fixture.pages[0][0].chartVersion,
  );
  $("editObject").click();
  $("applyChart").click();
  check(
    "legacy upgrade is undoable and retains source",
    fixture.pages[0][1].type === "object-edit" &&
      Charts.valid(Shapes.resolve(fixture.pages[0], false)[0]) &&
      JSON.stringify(fixture.pages[0][0]) === before,
  );
  $("undo").click();
  check(
    "undo upgrade restores legacy data",
    Shapes.resolve(fixture.pages[0], false)[0].chartVersion === undefined,
  );
  check(
    "legacy large values remain editable",
    Charts.valid(
      Charts.upgrade({
        ...legacy,
        data: [{ label: "Большое значение", value: 1000000000 }],
      }),
    ),
  );
  const a = document.createElement("canvas"),
    b = document.createElement("canvas");
  for (const c of [a, b]) {
    c.width = W;
    c.height = H;
  }
  Charts.render(a.getContext("2d"), legacy);
  LegacyCharts.render(b.getContext("2d"), legacy);
  check(
    "legacy chart appearance retained exactly",
    a.toDataURL() === b.toDataURL(),
  );
  fixture.pages = [[]];
  render();
  const exports = [];
  for (const kind of Object.keys(Charts.studioKinds)) {
    if (fixture.pages[page].length) {
      fixture.pages.push([]);
      page++;
      render();
    }
    $("insertChart").click();
    $("chartKind").value = kind;
    $("chartName").value = "Studio · " + Charts.studioKinds[kind];
    $("chartForm").dispatchEvent(new Event("input"));
    if (["pie", "doughnut"].includes(kind)) {
      $("chartData").value = "Опыт 1; 2\nОпыт 2; 4\nОпыт 3; 6";
      $("chartForm").dispatchEvent(new Event("input"));
    }
    if (kind === "bar") {
      $("chartData").value = "Неверная строка";
      ChartStudio.refresh();
      check("invalid pasted data blocks save", $("applyChart").disabled);
      $("chartName").value = "Изменение оформления";
      ChartStudio.refresh();
      check(
        "format changes cannot bypass invalid pasted data",
        $("applyChart").disabled,
      );
      $("chartData").value = "A; 3\nB; 7";
      ChartStudio.refresh();
      $("chartXTitle").value = "Время";
      $("chartYTitle").value = "Результат";
      $("chartScale").value = "log";
      $("chartForm").dispatchEvent(new Event("input"));
      check(
        "axis labels and logarithmic scale apply",
        !$("applyChart").disabled &&
          ChartStudio.instance().getOption().yAxis[0].type === "log" &&
          ChartStudio.instance().getOption().xAxis[0].name === "Время",
      );
      $("chartScale").value = "linear";
    }
    if (kind === "function") {
      $("chartAddFunction").click();
      $("chartFunctions").children[1].children[0].value = "x^2/4";
      $("chartAddPoint").click();
      $("chartPoints").tBodies[0].rows[0].cells[0].firstChild.value = "A";
      $("chartPoints").tBodies[0].rows[0].cells[1].firstChild.value = "2";
      $("chartPoints").tBodies[0].rows[0].cells[2].firstChild.value = "1";
      $("chartForm").dispatchEvent(new Event("input"));
      $("chartZoomIn").click();
      check(
        "graph zoom changes draft axes only",
        Number($("chartXMax").value) < 10 && fixture.pages[page].length === 0,
      );
      $("chartZoomReset").click();
      $("chartZoomOut").click();
      check(
        "graph zoom out expands the initial domain",
        Number($("chartXMax").value) > 10,
      );
      $("chartZoomReset").click();
      check(
        "graph reset restores saved range",
        Number($("chartXMin").value) === -10 &&
          Number($("chartXMax").value) === 10,
      );
    }
    if (kind === "flow") {
      $("chartFlowTable").tBodies[0].rows[1].cells[1].firstChild.value = "io";
      $("chartForm").dispatchEvent(new Event("input"));
      const option = ChartStudio.instance().getOption();
      check(
        "flow uses attached arrow links and four node types",
        option.series[0].links.length === 4 &&
          option.series[0].edgeSymbol[1] === "arrow" &&
          option.series[0].data[1].symbol.startsWith("path://"),
      );
      $("chartFlowTable").tBodies[0].rows[0].cells[0].firstChild.checked = true;
      $("chartFlowTable").tBodies[0].rows[1].cells[0].firstChild.checked = true;
      dialogButton("left");
      check(
        "flow alignment changes selected nodes",
        ChartStudio.value().nodes[0].x === ChartStudio.value().nodes[1].x,
      );
      dialogButton("grid");
    }
    for (const theme of Object.keys(Charts.themes)) {
      $("chartTheme").value = theme;
      $("chartLabels").checked = true;
      $("chartForm").dispatchEvent(new Event("input"));
      check(
        "live library preview " + kind + " " + theme,
        !$("applyChart").disabled &&
          ChartStudio.instance().getOption().backgroundColor ===
            Charts.themes[theme].background,
      );
    }
    if (kind === "function") {
      ChartStudio.instance().dispatchAction({
        type: "legendToggleSelect",
        name: "f(x)",
      });
      check(
        "legend selection changes editable source",
        ChartStudio.value().style.hidden.includes("f(x)"),
      );
    }
    $("applyChart").click();
    let object = fixture.pages[page][0];
    check(
      "Studio object remains structured " + kind,
      Charts.valid(object) &&
        object.chartVersion === 3 &&
        !object.image &&
        !object.png,
    );
    const saved = JSON.stringify(object);
    ObjectTools.select(0);
    $("editObject").click();
    check(
      "Studio reopens full source " + kind,
      JSON.stringify(ChartStudio.value()) === saved,
    );
    $("closeChart").click();
    const image = await Documents.compose(fixture, page);
    exports.push(image.toDataURL());
    check(
      "Studio image export " + kind,
      image
        .getContext("2d")
        .getImageData(70, 100, 540, 360)
        .data.some((v, i) => i % 4 === 0 && v < 70),
    );
    if (kind === "function")
      check(
        "multiple functions and coordinates persist",
        object.functions.length === 2 &&
          object.points[0].name === "A" &&
          object.points[0].x === 2,
      );
  }
  function dialogButton(mode) {
    document.querySelector('#chartDialog [data-align="' + mode + '"]').click();
  }
  page = 0;
  render();
  ObjectTools.select(0);
  $("objectFront").click();
  check(
    "chart ordering accepted by backups",
    Backups.validateLibrary({ books: [fixture] }) !== null,
  );
  $("undo").click();
  const backup = await Backups.parse(
    JSON.stringify(
      await Backups.create(
        { books: [fixture], selected: fixture.id },
        preferences,
      ),
    ),
  );
  check(
    "Studio round trip preserves editable data",
    JSON.stringify(backup.library.books[0].pages) ===
      JSON.stringify(fixture.pages),
  );
  const graph = fixture.pages.find((items) => items[0].kind === "function")[0];
  for (const patch of [
    {
      functions: [
        { name: "bad", color: "#000000", expression: "globalThis.alert(x)" },
      ],
    },
    { style: { ...graph.style, hidden: [{}] } },
    { points: [{ name: "A", x: Infinity, y: 0 }] },
    { style: { ...graph.style, scale: "arbitrary" } },
  ])
    check(
      "malformed Studio metadata rejected",
      !Charts.valid({ ...graph, ...patch }),
    );
  const oldOpen = window.open;
  let printed = false;
  const frame = document.createElement("iframe");
  frame.hidden = true;
  document.body.append(frame);
  const printWindow = frame.contentWindow,
    printDocument = printWindow.document;
  printWindow.print = () => {
    printed = true;
  };
  printWindow.focus = () => {};
  window.open = () => printWindow;
  try {
    await $("exportPdf").onclick();
    check(
      "PDF print path includes every Studio page",
      printed &&
        printDocument.images.length === 8 &&
        [...printDocument.images].every((image, i) => image.src === exports[i]),
    );
    localStorage.setItem(
      "studio-pdf-html",
      "<!doctype html>" + printDocument.documentElement.outerHTML,
    );
  } finally {
    window.open = oldOpen;
    frame.remove();
  }
  localStorage.setItem("test-studio-export", JSON.stringify(exports));
  ObjectTools.clear();
  data.selected = originalBook.id;
  page = originalPage;
  Editor.choose("pen");
  render();
  PageView.fit();
  await save();
  check(
    "Studio saves to IndexedDB",
    (await NotepadStore.read()).books.find((b) => b.id === fixture.id).pages
      .length === 8,
  );
}
