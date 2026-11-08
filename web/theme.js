  // 提前应用主题，避免刷新闪烁
  (function(){var p=localStorage.getItem('ag_theme')||'system';
    document.documentElement.dataset.theme = p==='system'
      ? (matchMedia('(prefers-color-scheme: light)').matches?'light':'dark') : p;})();
