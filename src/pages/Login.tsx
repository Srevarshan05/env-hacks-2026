import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Botanical from '../components/Botanical'
import FormNotice, { type Notice } from '../components/FormNotice'
import { tabKeyboard } from '../components/tabKeyboard'
import { apiConfig } from '../config/api'
import { useAuth } from '../hooks/useAuth'
import { startSession } from '../services/apiService'
import { authErrorMessage, loginUser, logoutUser, refreshAuth, registerUser } from "../services/authService";

type LoginState = { from?: string; email?: string; notice?: Notice } | null

export default function Login() {
  const location = useLocation()
  const state = location.state as LoginState
  const auth = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [show, setShow] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(state?.notice ?? null)
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const [email, setEmail] = useState(state?.email ?? '')
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  useEffect(() => { document.title = `${mode === 'login' ? 'Log in' : 'Join the network'} — .env` }, [mode])
  const switchMode = (value: 'login' | 'register') => { setMode(value); setNotice(null); setPassword(''); setShow(false) }
  const goToVerify = () => navigate(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`)
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setNotice(null)
    setLoading(true)

    try {
      if (mode === 'register') {
        const result = await registerUser(name, email, password)
        setPassword('')

        if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
          goToVerify()
        } else if (result.isSignUpComplete) {
          setNotice({ tone: 'success', text: 'Registration successful! Please log in.' })
          setMode('login')
        }
      } else {
        const result = await loginUser(email, password)

        if (result.isSignedIn) {
          if (apiConfig.profileSync) {
            try {
              // Pass the QR machine when the user came from /m/<machine_id>.
              await startSession(state?.from?.match(/^\/m\/([^/?#]+)/)?.[1])
            } catch (error) {
              await logoutUser()
              setNotice({ tone: 'error', text: `You signed in, but we couldn’t load your profile. ${error instanceof Error ? error.message : ''}`.trim() })
            }
          }
          // When signed in, the redirect below takes over once loading ends.
        } else if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
          goToVerify()
        } else {
          setNotice({ tone: 'error', text: `Additional sign-in step required: ${result.nextStep.signInStep}` })
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'UserAlreadyAuthenticatedException') await refreshAuth()
      else setNotice({ tone: 'error', text: authErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }
  if (auth.status === 'signedIn' && !loading) return <Navigate to={state?.from ?? '/dashboard'} replace />
return (
    <div className="auth-page page-shell">
      <section className="auth-art">
        <span className="eyebrow">A LITTLE GREENER, TOGETHER.</span>

        <h1>
          Good things<br />
          grow with<br />
          <em>care.</em>
        </h1>

        <p>
          A closer connection to your environment.<br />
          One small action at a time.
        </p>

        <div className="auth-botanical-wrap">
          <span className="auth-sun" />
          <Botanical complete />
          <Botanical
            complete
            variant={1}
            className="auth-second-plant"
          />
          <span className="auth-ground" />
        </div>

        <span className="auth-art-foot">
          <span>ROOTED IN NATURE. BUILT BY .ENV.</span>
        </span>
      </section>

      <section className="auth-form-panel">
        <div
          className="auth-mode-switch"
          role="tablist"
          aria-label="Account form"
          onKeyDown={tabKeyboard}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            aria-controls="account-form"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Log in
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            aria-controls="account-form"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Create account
          </button>
        </div>

        <div className="auth-form-heading">
          <span className="eyebrow">
            {mode === 'login' ? 'WELCOME BACK' : 'ROOM FOR ONE MORE'}
          </span>

          <h2>
            {mode === 'login' ? (
              <>
                Back to your<br />
                <em>little corner.</em>
              </>
            ) : (
              <>
                Let’s grow<br />
                <em>together.</em>
              </>
            )}
          </h2>

          <p>
            {mode === 'login'
              ? 'Log in to care for your nodes and follow their story.'
              : 'Make a place for yourself in a greener network.'}
          </p>
        </div>

        {/* Cognito Login and Registration Form */}
        <form id="account-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="form-field">
              Full name
              <input
                name="name"
                required
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}

          <label className="form-field">
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="form-field">
            Password
            <span className="password-input">
              <input
                name="password"
                type={show ? 'text' : 'password'}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === 'login'
                    ? 'current-password'
                    : 'new-password'
                }
                placeholder={
                  mode === 'login'
                    ? 'Enter your password'
                    : 'At least 8 characters'
                }
              />

              <button
                type="button"
                className="icon-button"
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show}
                onClick={() => setShow((v) => !v)}
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          {mode === 'login' && (
            <div className="form-options">
              <span>
                <LockKeyhole size={12} />
                Your account, your corner.
              </span>

              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setNotice({ tone: 'info', text: 'Password reset is not connected yet.' })
                }
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            className="button button-primary auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? mode === 'login'
                ? 'Logging in...'
                : 'Creating account...'
              : mode === 'login'
                ? 'Log in'
                : 'Create account'}

            <ArrowRight size={17} />
          </button>

          {notice && <FormNotice notice={notice} />}
        </form>

        <Link className="text-link" to="/dashboard">
          Explore the nodes
          <ArrowUpRight size={15} />
        </Link>
      </section>
    </div>
  )
}

