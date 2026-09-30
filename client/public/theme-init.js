// Run before the application and its stylesheet to avoid a theme flash.
;(function () {
  let preference = 'light'
  try { preference = localStorage.getItem('cartcheck.appearance') || 'light' } catch {}
  if (!['light', 'dark', 'system'].includes(preference)) preference = 'light'
  const dark = preference === 'dark' || (preference === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
})()
