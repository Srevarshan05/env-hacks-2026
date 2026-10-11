import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Droplets, Leaf, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import RefillStatus from './RefillStatus'
import { useAuth } from '../hooks/useAuth'
import { useRefill } from '../hooks/useRefill'
import { getProfile } from '../services/apiService'

// Refills go to the backend machine linked to this node; the backend verifies them and awards points.
export default function Hydration({ machineId }: { machineId: string | null }) {
  const auth = useAuth()
  const location = useLocation()
  const refill = useRefill(machineId)
  const [open, setOpen] = useState(false)
  const [points, setPoints] = useState<number | undefined>()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else if (dialog.current?.open) { dialog.current.close(); trigger.current?.focus() }
  }, [open])
  // Account points: loaded on sign-in and refreshed after an approved refill.
  useEffect(() => {
    if (auth.status !== 'signedIn') { setPoints(undefined); return }
    const controller = new AbortController()
    getProfile(controller.signal).then(data => setPoints(data.stats.points)).catch(() => {})
    return () => controller.abort()
  }, [auth.status, refill.approved])
  const confirm = async () => { await refill.start(); setOpen(false) }
  const pending = refill.starting
  return <article className="hydration-card"><div className="card-title-row"><span className="eyebrow">A LITTLE CARE GOES A LONG WAY</span><span className="tag tag-outline">Points</span></div><div className="hydration-body"><div className="hydration-plant" aria-hidden="true"><Leaf size={45} strokeWidth={1}/><span className="plant-water"/></div><div><h3>Give your algae a little love.</h3><p>Refill the algae tank and earn 1 point per verified litre.<br/>The machine verifies each refill before points are added.</p>{auth.status !== 'signedIn' ? <Link className="button button-primary" to="/login" state={{ from: location.pathname + location.search }}><Droplets size={16}/>Log in to hydrate</Link> : machineId ? <button ref={trigger} className="button button-primary" onClick={() => setOpen(true)} disabled={pending || refill.active}><Droplets size={16}/>{refill.active ? 'Verifying refill…' : 'Hydrate Algae'}</button> : <button className="button button-primary" disabled><Droplets size={16}/>Not linked to a machine yet</button>}<RefillStatus refill={refill}/></div><div className="credit-total"><span>{points != null ? points.toString().padStart(2, '0') : '--'}</span><small>points</small><span className="credit-caption">{auth.status === 'signedIn' ? 'From your account' : 'Log in to see your points'}</span><Link className="text-link" to="/rewards">Browse rewards <ArrowUpRight size={14}/></Link></div></div>
    <dialog ref={dialog} className="hydration-dialog" aria-labelledby="hydration-title" onCancel={() => { if (!pending) setOpen(false) }} onClick={event => { if (event.target === dialog.current && !pending) setOpen(false) }}><button className="dialog-close icon-button" aria-label="Close hydration confirmation" disabled={pending} onClick={() => setOpen(false)}><X size={20}/></button><div className="modal-symbol"><Droplets size={28}/></div><span className="eyebrow">ALGAE CARE</span><h2 id="hydration-title">A small act of care.</h2><p>Confirm that you are refilling this node ({machineId}). The machine verifies the refill, then points are added to your account. This button does not operate the water pump.</p><button className="button button-primary" disabled={pending} onClick={() => void confirm()}>{pending ? 'Starting…' : 'Confirm refill'}<Droplets size={16}/></button><button className="text-button" disabled={pending} onClick={() => setOpen(false)}>Maybe later</button></dialog>
  </article>
}
