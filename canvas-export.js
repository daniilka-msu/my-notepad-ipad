window.CanvasExport = (() => {
  const maxPixels = 2000000;
  async function compose(area, notebook = book) {
    SpatialDocument.rectangle(area);
    if (
      area.width <= 0 ||
      area.height <= 0 ||
      area.width > 20000 ||
      area.height > 20000
    )
      throw new Error(
        "Область слишком велика. Выберите меньший участок или экспорт PDF по страницам.",
      );
    const s = CanvasEditor.session;
    if (!s || s.book.id !== notebook.id)
      throw new Error("Откройте холст перед экспортом");
    finish();
    CanvasEditor.capture();
    if (!(await s.model.save(activeInkInput)))
      throw new Error("Завершите штрих");
    const entries = await s.model.query(area),
      values = entries.map((v) => v.value);
    await Promise.all([
      ImageObjects.prepare(values),
      StudyObjects.prepare(values),
    ]);
    const scale = Math.min(
      1,
      Math.sqrt(maxPixels / (area.width * area.height)),
    );
    const target = document.createElement("canvas"),
      content = document.createElement("canvas"),
      scratch = document.createElement("canvas");
    target.width = Math.max(1, Math.ceil(area.width * scale));
    target.height = Math.max(1, Math.ceil(area.height * scale));
    content.width = scratch.width = target.width;
    content.height = scratch.height = target.height;
    const sx = target.width / area.width,
      sy = target.height / area.height,
      c = target.getContext("2d"),
      ink = content.getContext("2d");
    c.fillStyle = paperColors[notebook.paperColor] || paperColors.white;
    c.fillRect(0, 0, target.width, target.height);
    c.setTransform(sx, 0, 0, sy, -area.x * sx, -area.y * sy);
    if (notebook.paper !== "blank") {
      const step = Paper.ruling(notebook);
      c.strokeStyle = ["gray", "black"].includes(notebook.paperColor)
        ? "#596273"
        : "#dce7f6";
      c.fillStyle = c.strokeStyle;
      c.lineWidth = 1;
      if (notebook.paper === "dots") {
        for (
          let x = Math.floor(area.x / step.x) * step.x + step.dotX;
          x < area.x + area.width;
          x += step.x
        )
          for (
            let y = Math.floor(area.y / step.y) * step.y + step.dotY;
            y < area.y + area.height;
            y += step.y
          ) {
            c.beginPath();
            c.arc(x, y, 1, 0, Math.PI * 2);
            c.fill();
          }
      } else {
        for (
          let y = Math.floor(area.y / step.y) * step.y;
          y <= area.y + area.height;
          y += step.y
        ) {
          c.beginPath();
          c.moveTo(area.x, y);
          c.lineTo(area.x + area.width, y);
          c.stroke();
        }
        if (notebook.paper === "grid")
          for (
            let x = Math.floor(area.x / step.x) * step.x;
            x <= area.x + area.width;
            x += step.x
          ) {
            c.beginPath();
            c.moveTo(x, area.y);
            c.lineTo(x, area.y + area.height);
            c.stroke();
          }
      }
    }
    ink.setTransform(sx, 0, 0, sy, -area.x * sx, -area.y * sy);
    const oldBook = book;
    try {
      book = notebook;
      for (const entry of entries){
        const value=entry.value.type==='chart-object'&&entry.value.pointSpace!=='math'&&entry.value.points?{...entry.value,points:entry.value.points.map(point=>({...point,x:point.x-s.camera.x,y:point.y-s.camera.y}))}:entry.value;
        stroke(value, ink, { scratch, view: area, sx, sy });
      }
    } finally {
      book = oldBook;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(content, 0, 0);
    content.width = content.height = scratch.width = scratch.height = 1;
    return target;
  }
  function occupied() {
    const s = CanvasEditor.session,
      keys = Object.keys(s?.model.metadata.occupied || {});
    if (!keys.length) return { x: 0, y: 0, width: 794, height: 1123 };
    const positions = keys.map((key) => key.split(",").map(Number));
    const x = Math.min(...positions.map((v) => v[0])) * 512,
      y = Math.min(...positions.map((v) => v[1])) * 512;
    return {
      x,
      y,
      width: (Math.max(...positions.map((v) => v[0])) + 1) * 512 - x,
      height: (Math.max(...positions.map((v) => v[1])) + 1) * 512 - y,
    };
  }
  const oldCompose = Documents.compose;
  function visible() {
    const camera = CanvasEditor.session?.camera || { x: 0, y: 0 },
      r = canvas.getBoundingClientRect(),
      w = $("workspace").getBoundingClientRect();
    const left = Math.max(r.left, w.left),
      top = Math.max(r.top, w.top),
      right = Math.min(r.right, w.right),
      bottom = Math.min(r.bottom, w.bottom);
    if (right <= left || bottom <= top)
      throw new Error("Область документа сейчас не видна");
    return {
      x: camera.x + ((left - r.left) / r.width) * 794,
      y: camera.y + ((top - r.top) / r.height) * 1123,
      width: ((right - left) / r.width) * 794,
      height: ((bottom - top) / r.height) * 1123,
    };
  }
  Documents.compose = (notebook, index) =>
    notebook.canvasDocument
      ? compose(visible(), notebook)
      : oldCompose(notebook, index);
  const originalPdf = $("exportPdf").onclick;
  $("exportPdf").onclick = async () => {
    if (!book.canvasDocument) return originalPdf();
    finish();
    CanvasEditor.capture();
    const notebook = book,
      s = CanvasEditor.session;
    const win = window.open("", "_blank");
    if (!win) {
      alert("Разрешите всплывающие окна для экспорта PDF");
      return;
    }
    win.document.title = "My Notepad — экспорт холста";
    win.document.body.textContent = "Подготовка страниц…";
    try {
      await s.model.save(activeInkInput);
      const full = occupied();
      const continuous = notebook.canvasDocument.format === "continuous";
      const count = continuous
        ? Math.max(1, Math.ceil((full.y + full.height) / 1123))
        : 1;
      if (count > 100)
        throw new Error(
          "Документ длиннее 100 страниц. Экспортируйте отдельные области, чтобы не переполнить память браузера.",
        );
      const style = win.document.createElement("style");
      style.textContent =
        "@page{size:A4;margin:0}body{margin:0}img{display:block;width:210mm;height:297mm;object-fit:contain;break-after:page}img:last-child{break-after:auto}";
      win.document.head.append(style);
      const images = [];
      for (let i = 0; i < count; i++) {
        const area = continuous
          ? { x: 0, y: i * 1123, width: 794, height: 1123 }
          : { x: s.camera.x, y: s.camera.y, width: 794, height: 1123 };
        const canvas = await compose(area, notebook),
          img = win.document.createElement("img");
        img.src = canvas.toDataURL("image/png");
        canvas.width = canvas.height = 1;
        images.push(img);
      }
      win.document.body.replaceChildren(...images);
      await Promise.all(images.map((img) => img.decode()));
      win.focus();
      win.print();
    } catch (error) {
      win.document.body.textContent = "Экспорт не выполнен: " + error.message;
    }
  };
  const fullButton = document.createElement("button");
  fullButton.id = "exportCanvasContent";
  Interface.decorate(fullButton, "image", "Вся занятая область в PNG");
  $("exportPng").after(fullButton);
  fullButton.onclick = async () => {
    try {
      finish();
      CanvasEditor.capture();
      await CanvasEditor.session.model.save(activeInkInput);
      const image = await compose(occupied());
      image.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = "my-notepad-canvas.png";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        image.width = image.height = 1;
      }, "image/png");
    } catch (error) {
      $("operationStatus").hidden = false;
      $("operationStatus").textContent = error.message;
    }
  };
  return { compose, occupied, visible, maxPixels };
})();
