// Behind-the-scenes gallery: lists public/gallery as the `virtual:gallery` module (live in dev, fixed at build).
// - Photos get two cached WebP renditions (grid 900px, viewer 2000px) so 4000px phone photos stay light.
//   In the build, the originals are dropped from dist/ once their renditions exist; videos ship as they are.
// - Dates come from file names: 2026-10-09_title.jpg, camera 20261009_131932.jpg, or
//   "WhatsApp Video 2026-10-11 at 8.47.56 PM.mp4". Any remaining words become the title.
// - Sub-folders become albums. Optional captions.json: { "file.jpg": "Caption" } or { "file.jpg": { "title", "caption" } }.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import sharp from 'sharp'

const ID = 'virtual:gallery', RESOLVED = '\0' + ID
const IMAGE = /\.(jpe?g|png|webp|avif|gif)$/i, VIDEO = /\.(mp4|webm|mov|m4v)$/i
const EXTENSIONS = /(\.(jpe?g|png|webp|avif|gif|mp4|webm|mov|m4v))+$/i
const SIZES = { thumb: 900, large: 2000 } as const
const pad = (value: string | number) => String(value).padStart(2, '0')

function parseName(name: string) {
  let rest = name.replace(EXTENSIONS, '')
  let taken: string | null = null
  const camera = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(rest)
  const whatsapp = /(\d{4}-\d{2}-\d{2}) at (\d{1,2})\.(\d{2})\.(\d{2}) ?(AM|PM)/i.exec(rest)
  const dated = /^(\d{4}-\d{2}-\d{2})/.exec(rest)
  if (camera) { taken = `${camera[1]}-${camera[2]}-${camera[3]}T${camera[4]}:${camera[5]}`; rest = rest.slice(camera[0].length) }
  else if (whatsapp) {
    const hour = (+whatsapp[2] % 12) + (whatsapp[5].toUpperCase() === 'PM' ? 12 : 0)
    taken = `${whatsapp[1]}T${pad(hour)}:${whatsapp[3]}`
    rest = rest.replace(whatsapp[0], '').replace(/WhatsApp (Image|Video)/i, '')
  } else if (dated) { taken = dated[1]; rest = rest.slice(dated[0].length) }
  const words = rest.replace(/\(\d+\)/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return { taken, title: words ? words[0].toUpperCase() + words.slice(1) : null }
}

export function galleryPlugin(): Plugin {
  let config: ResolvedConfig
  let dir = '', cacheDir = ''
  const renditions = new Map<string, string>() // public URL -> cached file
  const inGallery = (file: string) => !!dir && !path.relative(dir, path.resolve(file)).startsWith('..')

  async function rendition(full: string, stat: fs.Stats, size: keyof typeof SIZES) {
    const key = crypto.createHash('sha1').update(`${full}|${stat.size}|${stat.mtimeMs}|${size}`).digest('hex').slice(0, 16)
    const file = path.join(cacheDir, `${key}.webp`)
    if (!fs.existsSync(file)) {
      fs.mkdirSync(cacheDir, { recursive: true })
      await sharp(full).rotate().resize({ width: SIZES[size], height: SIZES[size], fit: 'inside', withoutEnlargement: true }).webp({ quality: size === 'thumb' ? 72 : 80 }).toFile(file)
    }
    const url = `/gallery-renditions/${key}.webp`
    renditions.set(url, file)
    return url
  }

  async function scan() {
    if (!fs.existsSync(dir)) return []
    let captions: Record<string, string | { title?: string; caption?: string }> = {}
    try { captions = JSON.parse(fs.readFileSync(path.join(dir, 'captions.json'), 'utf8')) } catch { /* optional */ }
    const files: string[] = []
    const walk = (folder: string) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const full = path.join(folder, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (IMAGE.test(entry.name) || VIDEO.test(entry.name)) files.push(full)
      }
    }
    walk(dir)
    const items = await Promise.all(files.map(async full => {
      const stat = fs.statSync(full)
      const rel = path.relative(dir, full).split(path.sep).join('/')
      const original = '/gallery/' + rel.split('/').map(encodeURIComponent).join('/')
      const { taken, title } = parseName(path.basename(full))
      const meta = captions[rel] ?? captions[path.basename(full)]
      const extra = typeof meta === 'string' ? { caption: meta } : meta ?? {}
      const base = {
        id: rel, title: extra.title ?? title, caption: extra.caption ?? null,
        album: rel.includes('/') ? rel.split('/')[0].replace(/[_-]+/g, ' ') : null,
        taken, modified: stat.mtimeMs,
      }
      if (VIDEO.test(full)) return { ...base, type: 'video' as const, src: original, thumb: null, width: null, height: null }
      try {
        const { width, height } = await sharp(full).rotate().metadata().then(m => (m.orientation ?? 1) >= 5 ? { width: m.height, height: m.width } : m)
        return { ...base, type: 'image' as const, src: await rendition(full, stat, 'large'), thumb: await rendition(full, stat, 'thumb'), width: width ?? null, height: height ?? null }
      } catch (error) {
        config.logger.warn(`[gallery] Could not process ${rel}: ${(error as Error).message}`)
        return { ...base, type: 'image' as const, src: original, thumb: original, width: null, height: null }
      }
    }))
    return items.sort((a, b) => (b.taken ?? '').localeCompare(a.taken ?? '') || b.modified - a.modified)
  }

  return {
    name: 'env-gallery',
    configResolved(resolved) {
      config = resolved
      dir = path.join(resolved.publicDir, 'gallery')
      cacheDir = path.join(resolved.cacheDir, 'gallery-renditions')
    },
    resolveId: source => source === ID ? RESOLVED : undefined,
    async load(moduleId) {
      if (moduleId === RESOLVED) return `export const gallery = ${JSON.stringify(await scan())}`
    },
    configureServer(server) {
      server.watcher.add(dir)
      const refresh = (file: string) => {
        if (!inGallery(file)) return
        const module = server.moduleGraph.getModuleById(RESOLVED)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      }
      for (const event of ['add', 'unlink', 'change', 'addDir', 'unlinkDir'] as const) server.watcher.on(event, refresh)
      server.middlewares.use((req, res, next) => {
        const file = req.url && renditions.get(req.url.split('?')[0])
        if (!file || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', 'image/webp')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        fs.createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const [url, file] of renditions) this.emitFile({ type: 'asset', fileName: url.slice(1), source: fs.readFileSync(file) })
    },
    closeBundle() {
      // Photos are served from their WebP renditions, so the multi-megabyte originals don't need to ship.
      const out = path.join(config.root, config.build.outDir, 'gallery')
      if (!renditions.size || !fs.existsSync(out)) return
      const walk = (folder: string) => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
          const full = path.join(folder, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (IMAGE.test(entry.name)) fs.rmSync(full)
        }
      }
      walk(out)
    },
  }
}
