import { useEffect } from 'react'
import { ArrowUpRight, Github, Linkedin, Link2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Botanical from '../components/Botanical'
import { team } from '../data/team'

export default function Team() {
  useEffect(() => { document.title = 'The people behind .env' }, [])
  return <div className="page-shell team-page"><div className="team-heading"><div><span className="eyebrow"><span className="small-dot"/> THE PEOPLE BEHIND THE PROJECT</span><h1>Different minds.<br/>One shared <em>environment.</em></h1><p>We’re team <strong>.env</strong>. Four people connecting a living idea<br className="desktop-break"/> with the technology to help it grow.</p></div></div>
    <div className="team-grid">{team.map((member, index) => <article key={member.name} className="team-member"><div className={`member-portrait color-${member.color}`}><span className="portrait-top">.env <span>MEMBER / 0{index + 1}</span></span><Botanical variant={index}/><span className="member-initials">{member.initials}<span>.</span></span></div><div className="member-details"><span className="eyebrow">TEAM .ENV</span><h2>{member.name}</h2><div className="member-links">{[{ key: 'portfolio' as const, label: 'Portfolio', Icon: Link2 }, { key: 'github' as const, label: 'GitHub', Icon: Github }, { key: 'linkedin' as const, label: 'LinkedIn', Icon: Linkedin }].map(({ key, label, Icon }) => member[key] ? <a key={key} href={member[key]!} target="_blank" rel="noopener noreferrer" className="icon-button" aria-label={`${member.name} — ${label}`}><Icon size={16}/></a> : <span key={key} className="profile-link-unavailable" title={`${label} not available`} aria-label={`${label} not available`}><Icon size={16}/></span>)}</div></div></article>)}</div>
    <section className="team-manifesto"><div><span className="eyebrow">WHAT WE’RE BUILDING</span><h2>Curious by nature.<br/><em>Connected</em> by purpose.</h2></div><div><p>Our project is a thin-film algae-based air purifier with AWS cloud integration, bringing together algae-based air treatment, environmental sensing, LoRa communication, and cloud monitoring.</p><p>Today, our hardware prototype gathers environmental readings. Next, we’re working toward integrating the treatment system and measuring what it can do.</p><Link className="text-link" to="/dashboard">Take a look at the network <ArrowUpRight size={17}/></Link></div></section>
  </div>
}
