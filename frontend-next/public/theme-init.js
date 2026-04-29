(function () {
  try {
    var storedTheme = localStorage.getItem('ui_theme');
    document.documentElement.setAttribute(
      'data-theme',
      storedTheme === 'light' ? 'light' : 'dark',
    );
  } catch (_error) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
