import fs from 'node:fs/promises'

await fs.mkdir('public/fonts', { recursive: true })
for (const [family, name, licenseFolder] of [['DM+Serif+Display:ital@0;1', 'dm-serif', 'dmserifdisplay'], ['DM+Sans:wght@400;500;600;700', 'dm-sans', 'dmsans']]) {
  const response = await fetch(`https://fonts.googleapis.com/css2?family=${family}&display=swap`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) throw new Error(`Font stylesheet: ${response.status}`)
  let css = await response.text()
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(match => match[1]))]
  for (let i = 0; i < urls.length; i++) {
    const response = await fetch(urls[i])
    if (!response.ok) throw new Error(`Font download: ${response.status}`)
    const extension = urls[i].split('.').at(-1)
    const nameAt = `${name}-${i}.${extension}`
    await fs.writeFile(`public/fonts/${nameAt}`, Buffer.from(await response.arrayBuffer()))
    css = css.replaceAll(urls[i], `/fonts/${nameAt}`)
  }
  await fs.writeFile(`public/fonts/${name}.css`, css)
  const license = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${licenseFolder}/OFL.txt`)
  if (!license.ok) throw new Error(`Font license: ${license.status}`)
  await fs.writeFile(`public/fonts/${name}-OFL.txt`, await license.text())
}
console.log('DM Serif Display and DM Sans are saved locally with their licenses.')
