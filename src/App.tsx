import { lazy, Suspense } from 'react'
import { Route, Routes, Link } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Home from './pages/Home'
import Gallery from './pages/Gallery'
import Locations from './pages/Locations'
import Team from './pages/Team'
import Login from './pages/Login'
import Machine from './pages/Machine'
import Rewards from './pages/Rewards'
import VerifyEmail from './pages/VerifyEmail'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const dashboard = <Suspense fallback={<div className="page-shell page-loading" role="status">Opening your field notes…</div>}><Dashboard /></Suspense>

export default function App() {
  return <Routes><Route element={<Layout />}>
    <Route path="/verify-email" element={<VerifyEmail />} />
    <Route index element={<Home />} />
    <Route path="dashboard" element={dashboard} />
    <Route path="dashboard/:nodeId" element={dashboard} />
    <Route path="locations" element={<Locations />} />
    <Route path="gallery" element={<Gallery />} />
    <Route path="team" element={<Team />} />
    <Route path="rewards" element={<RequireAuth><Rewards /></RequireAuth>} />
    <Route path="login" element={<Login />} />
    <Route path="m/:machineId" element={<Machine />} />
    <Route path="*" element={<div className="page-shell empty-page"><span className="eyebrow">A little off the path</span><h1>Let’s head back.</h1><p>This page doesn’t exist.</p><Link className="button button-primary" to="/">Back to home</Link></div>} />
  </Route></Routes>
}
