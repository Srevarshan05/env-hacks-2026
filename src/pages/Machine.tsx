import { useEffect, useState } from 'react'
import { Droplets, MapPin } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import FormNotice from '../components/FormNotice'
import RefillStatus from '../components/RefillStatus'
import { useAuth } from '../hooks/useAuth'
import { useRefill } from '../hooks/useRefill'
import { getMachine, type Machine as MachineInfo } from '../services/apiService'

// QR landing page: /m/<machine_id>. Machine details are public; starting a refill needs a signed-in user.
export default function Machine() {
  const { machineId = '' } = useParams()
  const location = useLocation()
  const auth = useAuth()
  const [machine, setMachine] = useState<MachineInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const refill = useRefill(machineId)

  useEffect(() => { document.title = `${machine?.name ?? machineId} — .env` }, [machine, machineId])
  useEffect(() => {
    const controller = new AbortController()
    setMachine(null); setLoadError('')
    getMachine(machineId, controller.signal).then(setMachine).catch(error => { if (!controller.signal.aborted) setLoadError(error.message) })
    return () => controller.abort()
  }, [machineId])

  if (loadError) return <div className="page-shell empty-page"><span className="eyebrow">MACHINE {machineId}</span><h1>We couldn’t find this machine.</h1><p>{loadError}</p><Link className="button button-primary" to="/">Back to home</Link></div>
  if (!machine) return <div className="page-shell page-loading" role="status">Finding this machine…</div>

  const unavailable = !machine.active || machine.available === false

  return (
    <div className="page-shell">
      <section className="auth-form-panel verify-panel">
        <div className="auth-form-heading">
          <span className="eyebrow">{machine.machine_id}</span>
          <h2>{machine.name}</h2>
          <p><MapPin size={13} /> {machine.location}</p>
        </div>

        {auth.status === 'signedIn'
          ? <button className="button button-primary auth-submit" type="button" onClick={() => void refill.start()} disabled={refill.starting || refill.active || unavailable}>
              {refill.starting ? 'Starting...' : refill.active ? 'Refill in progress...' : 'Hydrate algae'}
              <Droplets size={17} />
            </button>
          : <Link className="button button-primary auth-submit" to="/login" state={{ from: location.pathname }}>Log in to hydrate algae <Droplets size={17} /></Link>}
        {unavailable && <FormNotice notice={{ tone: 'info', text: 'This machine isn’t available right now.' }} />}

        <RefillStatus refill={refill} />
        {refill.session && <details className="session-raw"><summary>Session details</summary><pre>{JSON.stringify(refill.session, null, 2)}</pre></details>}
      </section>
    </div>
  )
}
