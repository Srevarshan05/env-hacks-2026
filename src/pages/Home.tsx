import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUpRight, ChevronsDown, Expand, GitBranch, Github } from 'lucide-react'
import { Link } from 'react-router-dom'
import BioreactorScene from '../components/BioreactorScene'
import HowItFlows from '../components/HowItFlows'
import LandingNav, { scrollToSection } from '../components/LandingNav'
import WhyRefills from '../components/WhyRefills'
import { links, repoBranches } from '../config/links'
import { useStoryMotion } from '../hooks/useStoryMotion'

const DEMO_VIDEO = { id: 'zw1ZXmUXFCU', start: 3 }

// Numbers match the circled steps in public/assets/aws-architecture.png.
const awsFlow = [
  { title: 'Sensor data reaches AWS', text: 'Every 10 seconds the node sends a reading over HTTPS to Amazon API Gateway. A Lambda function checks the device token and stores it in Amazon DynamoDB. With no Wi-Fi, readings hop node to node over LoRa until a fog node with internet forwards them.' },
  { title: 'Live dashboard', text: 'A read-only Lambda queries DynamoDB for the latest reading and history, and the dashboard refreshes every 10 seconds.' },
  { title: 'Secure sign-in', text: 'Amazon Cognito handles sign-up, email verification, and login through the AWS Amplify JS library. Its ID token authorises every app request.' },
  { title: 'Refills, points, and rewards', text: 'A FastAPI backend on AWS Lambda (container image from Amazon ECR) runs inside a private VPC with Amazon RDS for PostgreSQL.' },
  { title: 'The unit talks back', text: 'Scanning the QR code on a unit starts a refill session; the unit reports the litres it measured, and the backend awards 1 point per verified litre.' },
]

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
        <button className="skip-intro" onClick={() => scrollToSection('demo')}>Skip intro <ChevronsDown size={15}/></button>
        <button className="slide-next" onClick={() => goTo(phase + 1)} aria-label={phase === 4 ? 'Watch the demo' : 'Next story slide'}><ArrowDown size={19}/></button>
      </div>
    </section>}
    <LandingNav/>
    <section className="demo-section page-shell" id="demo">
      <div className="section-intro"><span className="eyebrow">SEE IT WORKING</span><h2>The unit, <em>in action.</em></h2><p>A walkthrough of the thin-film algae air purifier, its sensors, and the cloud platform behind it.</p></div>
      <div className="video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO.id}?start=${DEMO_VIDEO.start}&rel=0`} title=".env project demonstration video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div>
      <div className="video-links"><a className="text-link" href={`https://youtu.be/${DEMO_VIDEO.id}?t=${DEMO_VIDEO.start}`} target="_blank" rel="noopener noreferrer">Watch on YouTube <ArrowUpRight size={15}/></a><a className="text-link" href={links.repo} target="_blank" rel="noopener noreferrer"><Github size={15}/> View the code on GitHub</a></div>
    </section>
    <section className="product-section page-shell" id="product">
      <div className="product-copy"><span className="eyebrow">THE SYSTEM</span><h2>One unit.<br/>A living <em>system.</em></h2><p>A suction fan, a pump-fed thin film of algae, a filter column, and environmental sensing come together in one connected unit.</p>
        <dl className="product-details"><div><dt>Environmental sensing</dt><dd>BME680 readings, collected every ten seconds.</dd></div><div><dt>Connected monitoring</dt><dd>LoRa communication and Wi-Fi telemetry to AWS.</dd></div><div><dt>Thin-film algae bioreactor</dt><dd>Algae water flows over an inclined panel as the air passes. Purification hardware under development.</dd></div></dl>
        <div className="product-actions"><Link to="/dashboard" className="button button-primary">Open dashboard <ArrowUpRight size={17}/></Link><Link to="/team" className="text-link">Our team <ArrowUpRight size={16}/></Link></div>
      </div>
      <figure className="product-image"><img src="/assets/env-thin-film-unit.webp" width="1230" height="1278" alt="Cutaway of the .env unit: polluted air enters through an air suction fan with a fine mesh; a water pump lifts algae water through a hose and releases it over an inclined panel above the algae water tank; air rises through a filter column to the oxygen outlet. A BME680 environmental sensor and a LoRa RF antenna sit on top." loading="lazy"/><figcaption>Thin-film algae bioreactor unit</figcaption></figure>
    </section>
    <WhyRefills/>
    <HowItFlows/>
    <section className="architecture-section page-shell" id="architecture">
      <div className="section-intro"><span className="eyebrow">HOW IT'S BUILT ON AWS</span><h2>From sensor to cloud <em>to you.</em></h2><p>Every reading, sign-in, and refill travels through AWS. Follow the numbered steps on the diagram.</p></div>
      <figure className="architecture-figure">
        <div className="architecture-scroll"><a href="/assets/aws-architecture.png" target="_blank" rel="noopener" aria-label="Open the architecture diagram full size"><img src="/assets/aws-architecture.webp" width="3600" height="2420" alt="AWS architecture: the air-purifier node sends readings over HTTPS (or over LoRa through a fog node) to Amazon API Gateway, a Lambda function stores them in Amazon DynamoDB, and a read-only Lambda serves them to the dashboard on AWS Amplify Hosting. Users sign in with Amazon Cognito; a FastAPI backend on AWS Lambda, built from an Amazon ECR image, runs in a VPC with Amazon RDS for PostgreSQL and exchanges refill sessions with the unit. IAM, CloudWatch Logs, and the AWS CLI support everything." loading="lazy"/></a></div>
        <figcaption><span className="architecture-hint">Swipe to explore the diagram.</span><a className="text-link" href="/assets/aws-architecture.png" target="_blank" rel="noopener"><Expand size={15}/> Open full size</a></figcaption>
      </figure>
      <ol className="architecture-steps">{awsFlow.map((item, index) => <li key={item.title}><span className={`step-dot step-${index + 1}`}>{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></li>)}</ol>
      <div className="repo-card">
        <div className="repo-card-head"><span className="repo-icon"><Github size={24} strokeWidth={1.6}/></span><div><span className="eyebrow">OPEN SOURCE</span><h3>Explore the code</h3><p>Firmware, backend, and website live in one repository, one branch each.</p></div><a className="button button-primary" href={links.repo} target="_blank" rel="noopener noreferrer"><Github size={16}/> View on GitHub <ArrowUpRight size={15}/></a></div>
        <ul className="repo-branches">{repoBranches.map(branch => <li key={branch.name}><a href={links.branch(branch.name)} target="_blank" rel="noopener noreferrer"><GitBranch size={15}/><code>{branch.name}</code></a><span>{branch.what}</span></li>)}</ul>
      </div>
    </section>
  </>
}
