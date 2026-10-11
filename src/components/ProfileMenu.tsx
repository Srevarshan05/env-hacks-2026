import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Droplets, Gift, LogOut } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getProfile, type Profile } from '../services/apiService'
import { getSignInTime, logoutUser, type AuthState } from '../services/authService'

type User = Extract<AuthState, { status: 'signedIn' }>

const initials = (name: string, email: string) =>
  (name.trim() ? name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('') : email[0] ?? '?').toUpperCase()
const formatDate = (date: Date, withTime = false) => date.toLocaleString('en-IN', withTime
  ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
  : { day: 'numeric', month: 'short', year: 'numeric' })
export const formatLitres = (value: number) => `${Number(value.toFixed(2))} L`

export default function ProfileMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState(false)
  const [signedInAt, setSignedInAt] = useState<Date | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const onClick = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [open])
  // Fresh numbers every time the panel opens.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    getSignInTime().then(setSignedInAt).catch(() => setSignedInAt(null))
    getProfile(controller.signal).then(data => { setProfile(data); setProfileError(false) }).catch(() => { if (!controller.signal.aborted) setProfileError(true) })
    return () => controller.abort()
  }, [open])

  const name = profile?.user.full_name || user.name
  const displayName = name || user.email.split('@')[0]
  const stats = profile?.stats
  const logOut = async () => { setOpen(false); await logoutUser(); navigate('/') }

  return (
    <div className="profile-menu" ref={root}>
      <button type="button" className="profile-trigger" aria-expanded={open} aria-controls="profile-panel" onClick={() => setOpen(v => !v)}>
        <span className="profile-avatar" aria-hidden="true">{initials(name, user.email)}</span>
        <span className="profile-trigger-name">{displayName.split(' ')[0]}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="profile-panel" id="profile-panel" role="region" aria-label="Your profile">
          <div className="profile-panel-head">
            <span className="profile-avatar profile-avatar-large" aria-hidden="true">{initials(name, user.email)}</span>
            <div>
              <strong>{displayName}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <div className="profile-stats">
            <div><Gift size={16} aria-hidden="true" /><strong>{stats ? stats.points : '–'}</strong><span>credits now</span></div>
            <div><Droplets size={16} aria-hidden="true" /><strong>{stats ? formatLitres(stats.liters) : '–'}</strong><span>water contributed</span></div>
          </div>
          <dl className="profile-details">
            {stats && <div><dt>Refills</dt><dd>{stats.refills}</dd></div>}
            {stats && <div><dt>Points earned all-time</dt><dd>{stats.lifetime_points}</dd></div>}
            {profile?.rank != null && <div><dt>Rank</dt><dd>#{profile.rank}</dd></div>}
            {signedInAt && <div><dt>Signed in</dt><dd>{formatDate(signedInAt, true)}</dd></div>}
            {profile && <div><dt>Member since</dt><dd>{formatDate(new Date(profile.user.created_at))}</dd></div>}
          </dl>
          {profileError && <p className="profile-note">Couldn’t load your credits from the server.</p>}
          <div className="profile-actions">
            <Link to="/rewards" className="text-link"><Gift size={15} /> Rewards &amp; activity</Link>
            <button type="button" className="button button-outline profile-logout" onClick={logOut}><LogOut size={15} /> Log out</button>
          </div>
        </div>
      )}
    </div>
  )
}
