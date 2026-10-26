// v1.5 test photo: Reed's mock plate (rice, ayam goreng, sambal, lodeh) drawn as SVG and saved as a 1400x840 JPEG,
// bigger than 1024 so the client downscale is exercised. Written to node_modules/.tmp, never committed.
import { mkdirSync, existsSync } from 'node:fs'
const DIR = new URL('../node_modules/.tmp/', import.meta.url).pathname
export const PLATE = DIR + 'v15-plate.jpg'

const grains = Array.from({ length: 22 }, (_, i) => {
  const x = 92 + (i * 37) % 64, y = 80 + (i * 23) % 44
  return `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="1.6" fill="#ECE5D6" transform="rotate(${(i * 47) % 180} ${x} ${y})"/>`
}).join('')
export const PLATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 210" width="1400" height="840">
<defs>
<linearGradient id="tbl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B98B5E"/><stop offset="1" stop-color="#8E6440"/></linearGradient>
<radialGradient id="plate" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9E3D8"/></radialGradient>
<radialGradient id="chk" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#D99A4E"/><stop offset="1" stop-color="#9A5A22"/></radialGradient>
</defs>
<rect width="350" height="210" fill="url(#tbl)"/>
<path d="M0 40h350M0 95h350M0 150h350" stroke="#7d5636" stroke-opacity=".25" stroke-width="2"/>
<ellipse cx="160" cy="112" rx="128" ry="86" fill="#000" opacity=".18"/>
<ellipse cx="156" cy="105" rx="126" ry="84" fill="url(#plate)"/>
<ellipse cx="156" cy="105" rx="100" ry="64" fill="none" stroke="#E2DACB" stroke-width="2"/>
<path d="M78 112c-6-30 22-50 52-46 26 3 40 22 34 44-5 20-30 28-52 26-20-2-31-10-34-24z" fill="#FBF8F0" stroke="#E5DED0" stroke-width="1.5"/>
${grains}
<path d="M170 60c22-10 52-4 60 14 7 16-6 30-24 34-20 4-40-2-44-16-3-12-2-26 8-32z" fill="url(#chk)"/>
<path d="M176 72c8 4 16 2 24 6M184 90c10 2 20 0 28-4" stroke="#7A4517" stroke-opacity=".45" stroke-width="3" stroke-linecap="round" fill="none"/>
<ellipse cx="236" cy="120" rx="20" ry="13" fill="#B8321F"/>
<ellipse cx="231" cy="116" rx="7" ry="3" fill="#E0573C" opacity=".7"/>
<ellipse cx="190" cy="150" rx="44" ry="26" fill="#F1EBDF" stroke="#DCD2C0" stroke-width="2"/>
<ellipse cx="190" cy="148" rx="36" ry="19" fill="#EBCB6E"/>
<rect x="170" y="139" width="12" height="7" rx="2" fill="#7BA04A" transform="rotate(-18 176 142)"/>
<rect x="194" y="150" width="13" height="6" rx="2" fill="#5E8A3A" transform="rotate(12 200 153)"/>
<circle cx="205" cy="141" r="4.5" fill="#E89A3C"/>
</svg>`

export async function makePlate(browser) {
  if (existsSync(PLATE)) return PLATE
  mkdirSync(DIR, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 840 } })
  const pg = await ctx.newPage()
  await pg.setContent(`<body style="margin:0">${PLATE_SVG}</body>`)
  await pg.screenshot({ path: PLATE, type: 'jpeg', quality: 85 })
  await ctx.close()
  return PLATE
}

/** Width/height from a JPEG's SOF marker (to check the 1024 px downscale). */
export function jpegSize(buf) {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const TODAY = key(new Date())

// Model answers (the JSON our schema asks for). v1.6: rice, chicken and sambal have the same names as foods on our list,
// but the AI's own numbers must be used (our list would give rice 192 kcal and chicken 320); the salsa isn't on the list.
export const EST = {
  dish: 'Nasi ayam goreng',
  items: [
    { name: 'Nasi putih', portion: '1 plate', grams: 150, kcal: 250, protein_g: 4.5, carbs_g: 55, fat_g: 0.5, confidence: 'high' },
    { name: 'Ayam goreng', portion: '1 thigh', grams: 120, kcal: 330, protein_g: 25, carbs_g: 5, fat_g: 23, confidence: 'medium' },
    { name: 'Sambal', portion: '1 tbsp', grams: 15, kcal: 30, protein_g: 0.3, carbs_g: 2, fat_g: 2.4, confidence: 'high' },
    { name: 'Dragonfruit salsa', portion: 'a small bowl with extra lime', grams: 80, kcal: 60, protein_g: 1, carbs_g: 13, fat_g: 0.2, confidence: 'low' },
  ],
}
export const geminiOk = (obj) => ({ candidates: [{ content: { role: 'model', parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 2900, candidatesTokenCount: 300 } })
export const openaiOk = (obj) => ({ id: 'chatcmpl-x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: typeof obj === 'string' ? obj : JSON.stringify(obj), refusal: null }, finish_reason: 'stop' }] })
