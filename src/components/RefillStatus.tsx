import FormNotice from './FormNotice'
import type { useRefill } from '../hooks/useRefill'

const litres = (value: number) => `${Number(value.toFixed(2))} L`
const readable = (value: string) => value.replace(/_/g, ' ')

export default function RefillStatus({ refill }: { refill: ReturnType<typeof useRefill> }) {
  const { session } = refill
  if (refill.error) return <FormNotice notice={{ tone: 'error', text: refill.error }} />
  if (!session) return null
  if (refill.approved) return <FormNotice notice={{ tone: 'success', text: `Refill approved: ${litres(session.verified_liters ?? session.measured_liters)} verified. +${session.points_awarded} ${session.points_awarded === 1 ? 'point' : 'points'} added to your account.` }} />
  if (refill.finished) return <FormNotice notice={{ tone: 'error', text: `The refill wasn’t approved${session.failure_reason ? `: ${readable(session.failure_reason)}` : ` (${session.status})`}. No points were added.` }} />
  if (refill.timedOut) return <FormNotice notice={{ tone: 'info', text: 'Still waiting on the machine. Check your points again later.' }} />
  const step = session.status === 'measuring' ? `Measuring water: ${litres(session.measured_liters)}` : session.status === 'verifying' ? `Verifying ${litres(session.measured_liters)}` : 'Waiting for the machine to start'
  return <FormNotice notice={{ tone: 'info', text: `${step}…${session.is_simulated ? ' (simulated)' : ''}` }} />
}
