import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Droplets, Gift, Info, Leaf, Sprout, Ticket, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import FormNotice, { type Notice } from '../components/FormNotice'
import { formatLitres } from '../components/ProfileMenu'
import { getPointsFeed, getProfile, getRewards, redeemReward, type LedgerRow, type PointsFeed, type Profile, type Reward } from '../services/apiService'

const artStyles = ['herb', 'seeds', 'plant', 'sapling', 'voucher'] as const
// The backend catalogue has no images or categories, so pick art from the title.
function rewardArt(reward: Reward, index: number) {
  const title = reward.title.toLowerCase()
  if (/voucher|coupon|bottle|bag|card/.test(title)) return { style: 'voucher', Icon: Ticket }
  if (/seed/.test(title)) return { style: 'seeds', Icon: Sprout }
  if (/plant|sapling|tree/.test(title)) return { style: 'plant', Icon: Leaf }
  return { style: artStyles[index % artStyles.length], Icon: Gift }
}
const formatWhen = (value: string) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function ActivityRow({ row }: { row: LedgerRow }) {
  const credit = row.delta >= 0
  const Icon = row.type === 'contribution_credit' ? Droplets : row.type === 'redemption_debit' ? Gift : Info
  const title = row.type === 'contribution_credit'
    ? <>Refilled <b>{formatLitres(row.liters ?? 0)}</b> at {row.machine_name ?? row.machine_id}</>
    : row.type === 'redemption_debit' ? <>Redeemed <b>{row.reward_title}</b></> : row.reason
  return <li><span className={`redemption-check activity-${credit ? 'credit' : 'debit'}`}><Icon size={18}/></span><div><h3>{title}</h3><p>{formatWhen(row.created_at)}{row.is_simulated ? ' · Simulated' : ''}</p></div><strong className={credit ? 'activity-plus' : undefined}>{credit ? '+' : '−'}{Math.abs(row.delta)}<small> {Math.abs(row.delta) === 1 ? 'credit' : 'credits'}</small></strong></li>
}

export default function Rewards() {
  const [points, setPoints] = useState<number | null>(null)
  const [catalogue, setCatalogue] = useState<Reward[]>([])
  const [feed, setFeed] = useState<PointsFeed | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<Reward | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dialogError, setDialogError] = useState('')
  const [pending, setPending] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const idempotencyKey = useRef('')
  const busy = useRef(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [rewards, points, profile] = await Promise.all([getRewards(signal), getPointsFeed(50, signal), getProfile(signal)])
      setPoints(rewards.points); setCatalogue(rewards.rewards.filter(reward => reward.active)); setFeed(points); setProfile(profile); setLoadError('')
    } catch (error) {
      if (!signal?.aborted) setLoadError((error as Error).message)
    }
  }, [])
  useEffect(() => { document.title = 'Care rewards — .env' }, [])
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  useEffect(() => {
    if (selected) dialog.current?.showModal()
    else if (dialog.current?.open) { dialog.current.close(); trigger.current?.focus() }
  }, [selected])

  const choose = (reward: Reward, button: HTMLButtonElement) => {
    trigger.current = button; setNotice(null); setDialogError('')
    idempotencyKey.current = crypto.randomUUID() // one key per tap; reused only when retrying this same tap
    setSelected(reward)
  }
  const confirm = async () => {
    if (!selected || busy.current) return
    busy.current = true; setPending(true); setDialogError('')
    try {
      const result = await redeemReward(selected.id, idempotencyKey.current)
      setPoints(result.balance)
      setNotice({ tone: 'success', text: `${result.reward_title} is reserved for you. ${result.points_spent} credits used; ${result.balance} left.` })
      setSelected(null)
      void load()
    } catch (error) {
      setDialogError((error as Error).message)
    } finally { busy.current = false; setPending(false) }
  }

  if (loadError && points == null) return <div className="page-shell empty-page"><span className="eyebrow">REWARDS</span><h1>We couldn’t load your rewards.</h1><p>{loadError}</p><button className="button button-primary" onClick={() => void load()}>Try again</button></div>
  if (points == null) return <div className="page-shell page-loading" role="status">Loading your credits…</div>

  return <div className="page-shell rewards-page">
    <div className="page-heading"><div><span className="eyebrow"><span className="small-dot"/> A LITTLE CARE, SOMETHING BACK</span><h1>Care that keeps<br/><em>growing.</em></h1><p>Use your care credits for plants, seeds, and everyday rewards.</p></div><span className="page-index">YOUR CARE / REWARDS</span></div>
    <section className="rewards-balance"><div className="balance-number"><Gift size={24} strokeWidth={1.4}/><div><strong>{points}</strong><span>care credits available</span></div></div><div><h2>Small actions add up.</h2><p>Earn 1 credit for every verified litre of water you refill.</p>{(feed || profile) && <ul className="rewards-totals">{profile && <li><strong>{formatLitres(profile.stats.liters)}</strong> water contributed</li>}{feed && <li><strong>{feed.earned}</strong> earned</li>}{feed && <li><strong>{feed.spent}</strong> spent</li>}</ul>}<Link to="/dashboard" className="text-link">Care for a node <ArrowUpRight size={16}/></Link></div></section>
    <p className="rewards-storage-note">Redeemed rewards are reserved for you. Collection and voucher delivery are not connected yet.</p>
    {notice && <FormNotice notice={notice}/>}
    {catalogue.length ? <div className="rewards-grid">{catalogue.map((reward, index) => {
      const { style, Icon } = rewardArt(reward, index)
      const shortage = Math.max(0, reward.points_cost - points)
      const soldOut = reward.stock === 0
      return <article className="reward-card" key={reward.id}><div className={`reward-art reward-art-${style}`} aria-hidden="true"><Icon size={78} strokeWidth={.85}/><span className="reward-art-line"/></div><div className="reward-card-body"><span className="eyebrow">{soldOut ? 'Out of stock' : `${reward.stock} left`}</span><h2>{reward.title}</h2><p>{reward.description}</p><div className="reward-price"><strong>{reward.points_cost}<small> credits</small></strong><button className="button button-outline" disabled={shortage > 0 || soldOut} aria-label={`Redeem ${reward.title}`} onClick={event => choose(reward, event.currentTarget)}>Redeem <ArrowUpRight size={15}/></button></div><span className="reward-shortage">{soldOut ? 'Check back soon' : shortage > 0 ? `${shortage} more credits to go` : 'Available with your credits'}</span></div></article>
    })}</div> : <p className="rewards-storage-note">No rewards are available right now.</p>}
    <section className="redemption-history"><div className="section-label-row"><h2>Your activity <span>{feed?.ledger.length ?? 0}</span></h2></div>{feed?.ledger.length ? <ul>{feed.ledger.map(row => <ActivityRow key={row.id} row={row}/>)}</ul> : <div className="redemption-empty"><Sprout size={24} strokeWidth={1.3}/><p>Your first credits start with a little care.</p><Link to="/dashboard" className="text-link">Explore your nodes <ArrowUpRight size={15}/></Link></div>}</section>
    <dialog ref={dialog} className="hydration-dialog reward-dialog" onCancel={() => { if (!pending) setSelected(null) }} onClick={event => { if (event.target === dialog.current && !pending) setSelected(null) }} aria-labelledby="reward-dialog-title"><button className="dialog-close icon-button" aria-label="Close reward confirmation" disabled={pending} onClick={() => setSelected(null)}><X size={20}/></button><div className="modal-symbol"><Gift size={27}/></div><span className="eyebrow">USE YOUR CARE CREDITS</span><h2 id="reward-dialog-title">{selected?.title}</h2><p>This uses {selected?.points_cost} credits and reserves the reward for you. Collection and voucher delivery are not connected yet.</p><div className="reward-confirm-balance"><span>Balance after redemption</span><strong>{points - (selected?.points_cost || 0)} credits</strong></div>{dialogError && <FormNotice notice={{ tone: 'error', text: dialogError }}/>}<button className="button button-primary" disabled={pending || !selected || points < selected.points_cost} onClick={() => void confirm()}>{pending ? 'Redeeming…' : dialogError ? 'Try again' : 'Confirm redemption'}<Check size={16}/></button><button className="text-button" disabled={pending} onClick={() => setSelected(null)}>Keep my credits</button></dialog>
  </div>
}
