import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import FormNotice, { type Notice } from '../components/FormNotice'
import { authErrorMessage, resendVerificationCode, verifyEmail } from '../services/authService'

export default function VerifyEmail() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const emailFromLink = params.get('email') ?? ''

  const [email, setEmail] = useState(emailFromLink)
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  useEffect(() => { document.title = 'Verify your email — .env' }, [])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setNotice(null)

    try {
      await verifyEmail(email, code)
      navigate('/login', { replace: true, state: { email: email.trim().toLowerCase(), notice: { tone: 'success', text: 'Email verified. You can log in now.' } } })
    } catch (error) {
      setNotice({ tone: 'error', text: authErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email.trim()) { setNotice({ tone: 'error', text: 'Enter your email address first.' }); return }
    setResending(true)
    setNotice(null)
    try {
      await resendVerificationCode(email)
      setNotice({ tone: 'success', text: 'A new verification code was sent.' })
    } catch (error) {
      setNotice({ tone: 'error', text: authErrorMessage(error) })
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="page-shell">
      <section className="auth-form-panel verify-panel">
        <div className="auth-form-heading">
          <span className="eyebrow">ONE LAST STEP</span>
          <h2>Verify your<br /><em>email.</em></h2>
          <p>{emailFromLink ? <>Enter the code we sent to <strong>{emailFromLink}</strong>.</> : 'Enter your email and the code we sent you.'}</p>
        </div>

        <form onSubmit={handleVerify}>
          {!emailFromLink && (
            <label className="form-field">
              Email address
              <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </label>
          )}

          <label className="form-field">
            Verification code
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} />
          </label>

          <button className="button button-primary auth-submit" type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify email'}
            <ArrowRight size={17} />
          </button>

          <button className="text-button" type="button" onClick={handleResend} disabled={resending}>
            {resending ? 'Sending...' : 'Resend code'}
          </button>

          {notice && <FormNotice notice={notice} />}
        </form>

        <Link className="text-link" to="/login">Back to log in</Link>
      </section>
    </div>
  )
}
