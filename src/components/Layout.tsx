import { useEffect, useState } from 'react'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import ProfileMenu from './ProfileMenu'

const links = [{ to: '/', label: 'Home' }, { to: '/dashboard', label: 'Dashboard' }, { to: '/locations', label: 'Locations' }, { to: '/rewards', label: 'Rewards' }, { to: '/gallery', label: 'Gallery' }, { to: '/team', label: 'Our team' }]

export function Logo({ light = false }: { light?: boolean }) {
  return <Link to="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label=".env home"><span>.env</span></Link>
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const auth = useAuth()
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }) }, [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <div className="header-inner">
        <Logo />
        <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation" id="main-navigation">
          {links.map(link => <NavLink key={link.to} to={link.to} end={link.to === '/'}>{link.label}</NavLink>)}
          {auth.status === 'signedIn'
            ? <ProfileMenu user={auth} />
            : <NavLink to="/login" className="login-link">Log in <ArrowUpRight size={15} /></NavLink>}
        </nav>
        <button className="menu-toggle icon-button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(v => !v)}>{open ? <X /> : <Menu />}</button>
      </div>
    </header>
    <main id="main"><Outlet /></main>
    <footer className="site-footer"><div className="footer-inner"><Logo /><p>A little greener, together.</p><span>Built by team .env <span className="small-dot" /></span></div></footer>
  </>
}
