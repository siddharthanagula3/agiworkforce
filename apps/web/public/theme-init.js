
(() => {
  const root = document.documentElement;
  let selected = 'system';

  try {
    selected = localStorage.getItem('theme') || selected;
  } catch {
    // Storage can be unavailable in hardened or private browsing contexts.
  }

  const resolved =
    selected === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : selected;
  const theme = resolved === 'light' ? 'light' : 'dark';

  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
})();
