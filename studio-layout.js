(() => {
  const views = document.createElement('div');
  views.className = 'library-views';
  views.setAttribute('role', 'group');
  views.setAttribute('aria-label', 'Представление библиотеки');
  for (const [value, icon, label] of [
    ['covers', 'table', 'Обложки'],
    ['list', 'menu', 'Список'],
  ]) {
    const button = document.createElement('button');
    button.id = 'libraryView-' + value;
    button.type = 'button';
    Interface.decorate(button, icon, label, true);
    button.onclick = () => {
      preferences.libraryView = value;
      Editor.persist();
      sync();
    };
    views.append(button);
  }
  $('homeSort').after(views);
  function sync() {
    const value = preferences.libraryView === 'list' ? 'list' : 'covers';
    $('homeBooks').dataset.view = value;
    for (const button of views.children)
      button.setAttribute('aria-pressed', String(button.id === 'libraryView-' + value));
  }
  sync();
})();
