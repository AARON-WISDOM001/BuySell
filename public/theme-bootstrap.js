try {
  document.documentElement.classList.toggle(
    'dark',
    localStorage.getItem('buysell-theme') === 'dark',
  );
} catch {}