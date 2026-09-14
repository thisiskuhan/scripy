;(() => {
  let preference = 'system'
  try {
    const saved = localStorage.getItem('scripy.appearance')
    if (['light', 'dark', 'system'].includes(saved)) preference = saved
  } catch {
    preference = 'system'
  }
  const dark =
    preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  const theme = dark ? 'dark' : 'light'
  const background = dark ? '#181c1a' : '#f0f2f3'
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.documentElement.style.backgroundColor = background
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
})()
