import { useEffect, useState } from 'react'

export const landingSections = [
  { id: 'demo', label: 'Demo' },
  { id: 'product', label: 'The unit' },
  { id: 'why-refills', label: 'Why refills' },
  { id: 'flow', label: 'How it flows' },
  { id: 'architecture', label: 'Architecture' },
] as const

export const scrollToSection = (id: string) => {
  document.documentElement.classList.remove('snap-home')
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(null, '', `#${id}`)
}

// Sticky "on this page" bar under the header, so the sections after the scroll story are one click away.
export default function LandingNav() {
  const [active, setActive] = useState<string>('')
  useEffect(() => {
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0)
      const best = [...visible].sort((a, b) => b[1] - a[1])[0]
      setActive(best && best[1] > 0 ? best[0] : '')
    }, { rootMargin: '-120px 0px -40% 0px', threshold: [0, .15, .4, .7] })
    landingSections.forEach(({ id }) => { const element = document.getElementById(id); if (element) observer.observe(element) })
    return () => observer.disconnect()
  }, [])
  return <nav className="landing-nav" aria-label="On this page">
    <div className="landing-nav-inner page-shell">
      <span className="landing-nav-label">On this page</span>
      {landingSections.map(({ id, label }) => <a key={id} href={`#${id}`} className={active === id ? 'active' : ''} aria-current={active === id ? 'location' : undefined} onClick={event => { event.preventDefault(); scrollToSection(id) }}>{label}</a>)}
    </div>
  </nav>
}
