import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Film, Image as ImageIcon, Play, X } from 'lucide-react'
import { gallery, type GalleryItem } from 'virtual:gallery'
import Botanical from '../components/Botanical'

const asDate = (taken: string) => new Date(taken.length === 10 ? `${taken}T00:00` : taken)
const dayLabel = (day: string) => asDate(day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
const whenLabel = (taken: string) => taken.length === 10
  ? asDate(taken).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : asDate(taken).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const kind = (item: GalleryItem) => item.type === 'video' ? 'Video' : 'Photo'
const heading = (item: GalleryItem) => item.title ?? (item.taken ? whenLabel(item.taken) : kind(item))
const details = (item: GalleryItem) => [item.caption, item.album, item.title && item.taken ? whenLabel(item.taken) : null].filter(Boolean).join(' · ')
const autoplayAllowed = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData

// Grid video: plays muted while mostly on screen, pauses when scrolled away.
function TileVideo({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = video.current
    if (!element || !autoplayAllowed()) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void element.play().catch(() => {})
      else element.pause()
    }, { threshold: .6 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // #t=0.1 makes browsers paint the first frame before playback starts.
  return <video ref={video} src={`${src}#t=0.1`} muted loop playsInline preload="metadata" aria-hidden="true"/>
}

function Lightbox({ items, index, onClose, onMove }: { items: GalleryItem[]; index: number; onClose: () => void; onMove: (index: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const touchX = useRef<number | null>(null)
  const item = items[index]
  const move = (step: number) => onMove((index + step + items.length) % items.length)
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') move(1)
      if (event.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  return <dialog ref={dialog} className="gallery-lightbox" aria-label={heading(item)} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === dialog.current || (event.target as Element).classList.contains('lightbox-figure')) onClose() }}
    onTouchStart={event => { touchX.current = event.touches[0].clientX }}
    onTouchEnd={event => { if (touchX.current === null) return; const delta = event.changedTouches[0].clientX - touchX.current; touchX.current = null; if (Math.abs(delta) > 50) move(delta < 0 ? 1 : -1) }}>
    <div className="lightbox-top"><span>{index + 1} / {items.length}</span><button className="icon-button" onClick={onClose} aria-label="Close"><X size={22}/></button></div>
    <figure className="lightbox-figure">
      {item.type === 'video'
        ? <video key={item.src} src={item.src} controls autoPlay loop playsInline muted/>
        : <img key={item.src} src={item.src} alt={item.caption ?? heading(item)} width={item.width ?? undefined} height={item.height ?? undefined}/>}
      <figcaption><strong>{heading(item)}</strong>{details(item) && <span>{details(item)}</span>}</figcaption>
    </figure>
    {items.length > 1 && <>
      <button className="lightbox-nav lightbox-prev icon-button" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft size={26}/></button>
      <button className="lightbox-nav lightbox-next icon-button" onClick={() => move(1)} aria-label="Next"><ChevronRight size={26}/></button>
    </>}
  </dialog>
}

export default function Gallery() {
  const [filter, setFilter] = useState('All')
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { document.title = 'Behind the scenes — .env' }, [])

  const photos = gallery.filter(item => item.type === 'image').length, videos = gallery.length - photos
  const albums = useMemo(() => [...new Set(gallery.map(item => item.album).filter((album): album is string => !!album))], [])
  const filters = ['All', ...(photos && videos ? ['Videos', 'Photos'] : []), ...albums]
  const items = gallery.filter(item => filter === 'All' || (filter === 'Videos' ? item.type === 'video' : filter === 'Photos' ? item.type === 'image' : item.album === filter))
  // Day sections, newest first; the lightbox walks the same order.
  const days = useMemo(() => {
    const groups = new Map<string, { item: GalleryItem; index: number }[]>()
    items.forEach((item, index) => {
      const day = item.taken?.slice(0, 10) ?? ''
      groups.set(day, [...(groups.get(day) ?? []), { item, index }])
    })
    return [...groups]
  }, [items])

  return <div className="page-shell gallery-page">
    <div className="page-heading"><div><span className="eyebrow"><span className="small-dot"/> BEHIND THE SCENES</span><h1>Built by hand.<br/>Grown in <em>time.</em></h1><p>Time-lapses, clips, and photos from building the .env unit and growing its algae.</p></div><span className="page-index">{gallery.length ? `${photos} PHOTOS / ${videos} VIDEOS` : 'THE GALLERY'}</span></div>

    {gallery.length ? <>
      {filters.length > 1 && <div className="reward-filters" aria-label="Gallery filters">{filters.map(item => <button key={item} className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>}
      {days.map(([day, entries]) => <section className="gallery-day" key={day || 'undated'}>
        <div className="gallery-day-label"><h2>{day ? dayLabel(day) : 'More moments'}</h2><span>{entries.length} {entries.length === 1 ? 'moment' : 'moments'}</span></div>
        <div className="gallery-grid">{entries.map(({ item, index }) => <button key={item.id} className={`gallery-tile gallery-${item.type}`} onClick={() => setOpen(index)} aria-label={`Open ${kind(item).toLowerCase()}: ${heading(item)}`}>
          {item.type === 'video' ? <TileVideo src={item.src}/> : <img src={item.thumb ?? item.src} width={item.width ?? undefined} height={item.height ?? undefined} alt={item.caption ?? heading(item)} loading="lazy" decoding="async"/>}
          <span className="gallery-badge">{item.type === 'video' ? <><Play size={11} fill="currentColor"/> Video</> : <><ImageIcon size={11}/> Photo</>}</span>
          <span className="gallery-caption"><strong>{heading(item)}</strong>{details(item) && <small>{details(item)}</small>}</span>
        </button>)}</div>
      </section>)}
    </> : <div className="gallery-empty"><Botanical complete/><Film size={28} strokeWidth={1.3}/><h2>The first frames are on their way.</h2><p>Time-lapses and photos from the build will appear here.</p>{import.meta.env.DEV && <p className="small-note">Add .jpg, .png, .webp, .mp4 or .webm files to <code>public/gallery</code>.</p>}</div>}

    {open !== null && items[open] && <Lightbox items={items} index={open} onClose={() => setOpen(null)} onMove={setOpen}/>}
  </div>
}
