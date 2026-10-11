import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import BioreactorScene from '../components/BioreactorScene'
import { useStoryMotion } from '../hooks/useStoryMotion'

const chapters = [
  { label: 'Overview', title: <>Small algae.<br/>A bigger <em>breath.</em></>, text: 'A thin-film algae bioreactor with environmental sensing and a connected IoT network. Built by team .env.' },
  { label: 'Air intake', title: <>It starts<br/>with the <em>air.</em></>, text: 'A suction fan draws outside air into the unit through a fine mesh, which holds back dust before the air reaches the algae.' },
  { label: 'Thin film', title: <>Air meets a<br/>living <em>film.</em></>, text: 'A pump lifts algae water through a hose and releases it over an inclined panel. The thin film of algae gives the passing air a wide surface to meet.' },
  { label: 'Air outlet', title: <>Back to<br/>the <em>environment.</em></>, text: 'With light, algae take up carbon dioxide and release oxygen. The air then rises through the filter column and leaves through the outlet at the top.' },
  { label: 'Sensing and cloud', title: <>Sensed, sent,<br/>and <em>seen.</em></>, text: 'A BME680 sensor reads the air every ten seconds. LoRa carries each reading to AWS, where it appears on the dashboard.' },
]

export default function Home() {
  const track = useRef<HTMLElement>(null)
  const camera = useRef<HTMLDivElement>(null)
  const visual = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLDivElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const { phase, goTo } = useStoryMotion(track, camera, visual, image, copy, reduced)

  useEffect(() => {
    document.title = '.env — A little greener, together.'
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  return <>
    {reduced ? <section className="reduced-story">
      {chapters.map((chapter, index) => <article key={chapter.label} className={`reduced-chapter reduced-chapter-${index}`}><h1>{chapter.title}</h1><p>{chapter.text}</p>{index === 0 && <Link className="button button-primary" to="/dashboard">Explore the network <ArrowUpRight size={17}/></Link>}<BioreactorScene className="reduced-scene"/></article>)}
    </section> : <section className="story-track photo-story air-story" ref={track} aria-label="Our project: how the thin-film algae bioreactor works">
      {chapters.map((chapter, index) => <div key={chapter.label} className="story-snap-anchor" style={{ top: `calc(${index} * var(--story-height, (100svh - var(--header))))` }} aria-hidden="true"/>)}
      <div className="story-camera" ref={camera}>
        <div ref={visual} className="story-visual"><div ref={image} className="story-landscape story-world">
          <BioreactorScene className="story-backdrop"/>
        </div></div>
        <div className="story-shade"/>
        <div className="story-copy-wrap" ref={copy}>
          {chapters.map((chapter, index) => <article className={`story-copy chapter-${index}`} key={chapter.label} style={{ opacity: index === 0 ? 1 : 0, visibility: index === 0 ? 'visible' : 'hidden' }} aria-hidden={phase !== index} inert={phase !== index}>
            {index === 0 && <span className="hero-project-label">THIN-FILM ALGAE AIR PURIFIER · AWS CLOUD INTEGRATION</span>}
            <h1>{chapter.title}</h1><p>{chapter.text}</p>
            {index === 0 && <div className="hero-actions"><Link to="/dashboard" className="button button-primary">Explore the network <ArrowUpRight size={17}/></Link><button className="text-button" onClick={() => goTo(1)}>Our story <ArrowDown size={16}/></button></div>}
            {index === 4 && <Link to="/dashboard" className="button button-primary">Explore the network <ArrowUpRight size={17}/></Link>}
          </article>)}
        </div>
        <nav className="chapter-nav" aria-label="Story slides">{chapters.map((chapter, index) => <button key={chapter.label} className={phase === index ? 'active' : ''} onClick={() => goTo(index)} aria-label={`Slide ${index + 1}: ${chapter.label}`} aria-current={phase === index ? 'step' : undefined}><span/></button>)}</nav>
        <button className="slide-next" onClick={() => goTo(phase + 1)} aria-label={phase === 4 ? 'View the product model' : 'Next story slide'}><ArrowDown size={19}/></button>
      </div>
    </section>}
    <section className="product-section page-shell" id="product">
      <div className="product-copy"><span className="eyebrow">THE SYSTEM</span><h2>One unit.<br/>A living <em>system.</em></h2><p>A suction fan, a pump-fed thin film of algae, a filter column, and environmental sensing come together in one connected unit.</p>
        <dl className="product-details"><div><dt>Environmental sensing</dt><dd>BME680 readings, collected every ten seconds.</dd></div><div><dt>Connected monitoring</dt><dd>LoRa communication and Wi-Fi telemetry to AWS.</dd></div><div><dt>Thin-film algae bioreactor</dt><dd>Algae water flows over an inclined panel as the air passes. Purification hardware under development.</dd></div></dl>
        <div className="product-actions"><Link to="/dashboard" className="button button-primary">Open dashboard <ArrowUpRight size={17}/></Link><Link to="/team" className="text-link">Our team <ArrowUpRight size={16}/></Link></div>
      </div>
      <figure className="product-image"><img src="/assets/env-thin-film-unit.webp" width="1230" height="1278" alt="Cutaway of the .env unit: polluted air enters through an air suction fan with a fine mesh; a water pump lifts algae water through a hose and releases it over an inclined panel above the algae water tank; air rises through a filter column to the oxygen outlet. A BME680 environmental sensor and a LoRa RF antenna sit on top." loading="lazy"/><figcaption>Thin-film algae bioreactor unit</figcaption></figure>
    </section>
  </>
}
