import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
await fs.mkdir(path.join(root, 'public', 'assets'), { recursive: true })
let seed = 4821
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
let forest = ''
const greens = ['#405c3c', '#56704a', '#698254', '#7e905e', '#354f36', '#8f9c6b']
for (let i = 0; i < 185; i++) {
  const side = i % 2
  const x = side ? 1320 + rand() * 440 : -100 + rand() * 750
  const y = 920 + rand() * 2640
  const r = 28 + rand() * 95
  forest += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * .66).toFixed(1)}" fill="${greens[i % greens.length]}" opacity="${(.3 + rand() * .4).toFixed(2)}"/>`
}
let streams = ''
for (let i = 0; i < 36; i++) {
  const x = 973 + rand() * 195
  streams += `<path d="M${x.toFixed(1)} 1330C${(x + 14).toFixed(1)} 1880 ${(x - 38).toFixed(1)} 2200 ${(x + 20).toFixed(1)} 2690S${(x + 70).toFixed(1)} 3210 ${(x + 80).toFixed(1)} 3570" stroke="${i % 3 ? '#e4f4e6' : '#ffffff'}" stroke-width="${(2 + rand() * 6).toFixed(1)}" opacity="${(.16 + rand() * .42).toFixed(2)}" fill="none"/>`
}
let algae = ''
for (let i = 0; i < 140; i++) {
  const x = 910 + rand() * 485
  const y = 4495 + ((x - 1150) ** 2 / 850) + rand() * 125
  algae += `<path d="M${x.toFixed(1)} ${(y + 42).toFixed(1)}q${(-15 + rand() * 30).toFixed(1)} -36 ${(-18 + rand() * 36).toFixed(1)} -${(35 + rand() * 65).toFixed(1)}" stroke="${['#a1b955', '#b7c878', '#567c39', '#80a54f'][i % 4]}" stroke-width="${(3 + rand() * 6).toFixed(1)}" fill="none" stroke-linecap="round"/>`
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="5000" viewBox="0 0 1600 5000">
<defs>
  <linearGradient id="sky" x2=".85" y2="1"><stop stop-color="#f1f2e8"/><stop offset=".46" stop-color="#e5ece0"/><stop offset="1" stop-color="#cadace"/></linearGradient>
  <linearGradient id="mountain" x2="0" y2="1"><stop stop-color="#a8bd9e"/><stop offset="1" stop-color="#6e895f"/></linearGradient>
  <linearGradient id="rock" x2="1" y2=".25"><stop stop-color="#637451"/><stop offset=".62" stop-color="#56694a"/><stop offset="1" stop-color="#354e3c"/></linearGradient>
  <linearGradient id="fall" x2="1" y2=".1"><stop stop-color="#8fae9e"/><stop offset=".5" stop-color="#eff5df"/><stop offset="1" stop-color="#a5c9bc"/></linearGradient>
  <linearGradient id="water" x2="0" y2="1"><stop stop-color="#a1c2ad"/><stop offset=".19" stop-color="#689b8b"/><stop offset=".5" stop-color="#3c796d"/><stop offset="1" stop-color="#1c5048"/></linearGradient>
  <linearGradient id="stone" x2="0" y2="1"><stop stop-color="#748769"/><stop offset="1" stop-color="#28483c"/></linearGradient>
  <radialGradient id="mist"><stop stop-color="#f0f4e0" stop-opacity=".85"/><stop offset="1" stop-color="#e8f2df" stop-opacity="0"/></radialGradient>
  <pattern id="grain" width="180" height="180" patternUnits="userSpaceOnUse"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="180" height="180" opacity=".12" filter="url(#noise)"/></pattern>
</defs>
<path fill="url(#sky)" d="M0 0h1600v1600H0z"/>
<circle cx="1190" cy="275" r="115" fill="#f7f3d9" opacity=".95"/>
<g fill="#faf9ef" opacity=".55"><path d="M925 390c80-33 120-28 158-15 50-19 115-16 149 10 52-10 126 0 176 27H925z"/><path d="M70 455c77-25 98-28 153-13 57-20 153-18 200 25H70z"/><path d="M690 166c42-21 98-10 124 10 29-12 93 3 116 15H662z"/></g>
<g stroke="#62786a" stroke-width="2.2" fill="none" opacity=".6"><path d="M1080 482q12-13 23 0 12-12 23 0"/><path d="M1153 449q9-10 18 0 8-11 16 0"/><path d="M1200 498q7-7 14 0 7-8 13 0"/></g>
<path d="M0 1030 80 850 230 929 430 748 535 781 698 619 836 712 984 568 1140 648 1255 580 1420 730 1600 603V1450H0Z" fill="#bed0b3" opacity=".6"/>
<path d="M0 1100 154 1045 370 916 541 977 660 858 810 811 955 916 1090 716 1220 670 1320 781 1440 662 1600 810V1750H0Z" fill="url(#mountain)"/>
<path d="M0 1070C260 1050 358 990 504 1102S797 1130 906 1190L969 1340 932 1540 955 1790 928 2070 955 2380 952 2700 1010 3200 1020 3660H0Z" fill="url(#rock)"/>
<path d="M1600 897C1450 810 1409 956 1300 1098L1207 1290 1180 1560 1257 1860 1200 2200 1230 2510 1225 2790 1290 3200 1300 3650H1600Z" fill="#455e41"/>
<path d="M0 1310 228 1170 300 1270 442 1228 637 1319 867 1239 967 1340 869 1608 610 1640 676 1850 496 1907 492 2150 304 2192 368 2470 220 2610 282 2890 158 3180 370 3330 266 3640H0Z" fill="#82916a" opacity=".42"/>
<g stroke="#a1ae81" stroke-width="2" opacity=".22" fill="none"><path d="m45 1290 379-40 88 220-82 330 118 416-192 180 133 480-80 442"/><path d="m650 1350-65 260 128 364-143 294 86 340-54 540 270 360"/><path d="m1430 1160-126 324 97 290-70 260 57 297-24 380 88 390-67 337"/></g>
${forest}
<path d="M962 1315C998 1338 1120 1330 1200 1280L1180 1430C1110 1890 1225 2260 1168 2780S1300 3340 1280 3590L1040 3670C985 3200 924 2810 962 2420S909 1740 962 1315Z" fill="url(#fall)"/>
${streams}
<path d="M860 1258q156-76 361-45l-19 110q-138 35-236-7Z" fill="#b6cfc0"/><path d="M816 1266q175-42 395-47" stroke="#dbe7cf" stroke-width="5" fill="none"/>
<g fill="url(#mist)"><ellipse cx="1067" cy="1500" rx="250" ry="170" opacity=".35"/><ellipse cx="1200" cy="3515" rx="410" ry="280"/><ellipse cx="780" cy="3640" rx="340" ry="180"/></g>
<path d="M0 3650q360-99 725 0t875-20v1370H0Z" fill="url(#water)"/>
<g stroke="#e0e9cc" fill="none" opacity=".58"><path d="M0 3690q220-60 480-10t630 9 490-27" stroke-width="4"/><path d="M765 3625q241-45 554-9" stroke-width="3"/><ellipse cx="1160" cy="3700" rx="245" ry="30" stroke-width="3"/><ellipse cx="1160" cy="3700" rx="325" ry="46" stroke-width="2"/><ellipse cx="1160" cy="3700" rx="460" ry="70" stroke-width="2"/><path d="M88 3820q209-31 405-4m-280 115q121-17 242-5m690-121q198-13 400-4" stroke-width="2"/></g>
<g fill="#d6e5b6" opacity=".09"><path d="m850 3730-220 990 375-1080z"/><path d="m1130 3730-40 1270 250-1290z"/><path d="m350 3740-325 1050 525-1080z"/></g>
<path d="M0 4840c318-157 401 54 704-33s623-79 896-90v283H0Z" fill="#275c4c"/><path d="M790 4760c37-181 145-207 292-245s293 37 370 187l-10 185c-226 107-475 113-652-9Z" fill="url(#stone)"/><path d="M813 4705c33-122 179-203 323-208 118 8 233 85 292 178-171-24-351 11-615 30Z" fill="#688454"/>
${algae}
<g fill="none" stroke="#c8e4c4" opacity=".65"><circle cx="1060" cy="4370" r="10"/><circle cx="1200" cy="4270" r="7"/><circle cx="1108" cy="4130" r="13"/><circle cx="1270" cy="3980" r="6"/><circle cx="980" cy="4210" r="5"/><circle cx="1180" cy="4440" r="4"/></g>
<g stroke="#609874" fill="none" stroke-linecap="round"><path d="M90 5000q-20-200 88-314m-82 296q109-160 111-240m-92 258q-99-191-55-361" stroke-width="16"/><path d="M1500 5000q-102-278-67-410m61 355q61-140 40-254" stroke-width="18"/></g>
<rect width="1600" height="5000" fill="url(#grain)" opacity=".34"/>
</svg>`
await fs.writeFile(path.join(root, 'public/assets/river-story.svg'), svg)

// Natural Earth public-domain country outline. Keep geodata local at runtime.
try {
  const response = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
  if (!response.ok) throw new Error(String(response.status))
  const data = await response.json()
  const india = data.features.find(f => f.properties.ADM0_A3 === 'IND')
  await fs.mkdir(path.join(root, 'src/data'), { recursive: true })
  await fs.writeFile(path.join(root, 'src/data/india.json'), JSON.stringify(india.geometry))
  console.log('Created river landscape and local India outline.')
} catch (error) { console.error('India outline download failed:', error.message); process.exitCode = 1 }

// Self-host Google Fonts so the interface has no third-party font request.
for (const [family, file] of [['DM Sans:wght@400;500;600;700', 'dm-sans'], ['DM Serif Display:ital@0;1', 'dm-serif']]) {
  try {
    const cssResponse = await fetch(`https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}&display=swap`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const css = await cssResponse.text()
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))]
    let localCss = css
    await fs.mkdir(path.join(root, 'public/fonts'), { recursive: true })
    for (let i = 0; i < urls.length; i++) {
      const response = await fetch(urls[i])
      if (!response.ok) throw new Error('Font download failed')
      const extension = urls[i].split('.').at(-1)
      const local = `/fonts/${file}-${i}.${extension}`
      await fs.writeFile(path.join(root, 'public', local), Buffer.from(await response.arrayBuffer()))
      localCss = localCss.replaceAll(urls[i], local)
    }
    await fs.writeFile(path.join(root, 'public/fonts', `${file}.css`), localCss)
  } catch (error) { console.error('Font download failed:', error.message); process.exitCode = 1 }
}
