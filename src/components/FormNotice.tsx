import { Check, CircleAlert, Info } from 'lucide-react'

export type Notice = { tone: 'success' | 'error' | 'info'; text: string }

export default function FormNotice({ notice }: { notice: Notice }) {
  const Icon = notice.tone === 'error' ? CircleAlert : notice.tone === 'info' ? Info : Check
  return <div className={`form-notice form-notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}><Icon size={16} /><p>{notice.text}</p></div>
}
