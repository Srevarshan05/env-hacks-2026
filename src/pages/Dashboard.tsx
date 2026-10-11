import { useEffect, useState } from 'react'
import { Activity, ArrowLeft, ArrowUpRight, Check, ChevronRight, Clock3, Droplets, Gauge, MapPin, Radio, RefreshCw, Search, Thermometer, Wind } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { nodes, mapUrl } from '../data/nodes'
import IndiaMap from '../components/IndiaMap'
import SensorChart, { metrics } from '../components/SensorChart'
import Hydration from '../components/Hydration'
import NodeLocationImage from '../components/NodeLocationImage'
import { tabKeyboard } from '../components/tabKeyboard'
import { useSensorFeed } from '../hooks/useSensorFeed'
import { apiConfig } from '../config/api'
import type { NodeInfo, SensorReading } from '../types'

const durations = [{ label: '15 min', ms: 900_000 }, { label: '1 hour', ms: 3_600_000 }, { label: '24 hours', ms: 86_400_000 }]
const metricIcons = [Thermometer, Droplets, Gauge, Wind]
const ageLabel = (seconds: number) => seconds < 60 ? `${seconds}s` : seconds < 3_600 ? `${Math.floor(seconds / 60)}m` : seconds < 86_400 ? `${Math.floor(seconds / 3_600)}h` : `${Math.floor(seconds / 86_400)}d`
const uptime = (value: number) => `${Math.floor(value / 3_600_000)}h ${Math.floor(value % 3_600_000 / 60_000)}m`

function sparkline(readings: SensorReading[], key: typeof metrics[number]['key']) {
  const values = readings.slice(-20).map(reading => reading[key])
  if (values.length < 2) return ''
  const min = Math.min(...values), range = Math.max(...values) - min || 1
  return values.map((value, index) => `${index ? 'L' : 'M'}${(index / (values.length - 1) * 120).toFixed(1)},${(24 - (value - min) / range * 21).toFixed(1)}`).join(' ')
}

function NodeSelection() {
  const [search, setSearch] = useState('')
  const filtered = nodes.filter(node => `${node.name} ${node.location} ${node.id}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="page-shell node-selection">
    <div className="page-heading"><div><span className="eyebrow"><span className="small-dot"/> THE ENVIRONMENT, IN VIEW</span><h1>Find your <em>node.</em></h1><p>A small window into the world around each unit.</p></div><span className="page-index">FIELD NOTES / 01</span></div>
    <div className="network-summary"><span><strong>{nodes.length.toString().padStart(2, '0')}</strong>node</span><span><strong>04</strong>sensor measurements</span><span><strong>10<small>s</small></strong>reading interval</span><span><Radio size={22} strokeWidth={1.4}/><div>LoRa + Wi-Fi<small>Two communication paths</small></div></span></div>
    <div className="node-selection-layout"><section><div className="section-label-row"><h2>Your field nodes <span>{nodes.length}</span></h2></div><label className="search-field"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or location" aria-label="Search nodes"/><kbd>/</kbd></label>
      {filtered.length ? filtered.map(node => <Link key={node.id} to={`/dashboard/${node.id}`} className="node-select-card"><div className="node-select-art"><NodeLocationImage node={node}/></div><div className="node-select-info"><div><span className="node-id">{node.id}</span><h3>{node.name}</h3><p><MapPin size={13}/>{node.location}</p></div><span className="round-arrow"><ArrowUpRight size={22}/></span></div><div className="node-select-footer"><span><span className="small-dot"/>{apiConfig.useSampleData ? 'Sample feed available' : 'Open sensor feed'}</span><span>Open dashboard <ChevronRight size={14}/></span></div></Link>) : <div className="empty-search"><Search size={25}/><h3>No nodes found.</h3><p>Try “Trichy” or “Tamil Nadu”.</p><button className="text-link" onClick={() => setSearch('')}>Clear search</button></div>}
      <p className="field-note">One location today. Room for a whole network tomorrow.</p>
    </section><section className="selection-map-panel"><IndiaMap nodes={filtered} compact/><Link to="/locations" className="text-link">Explore the locations map <ArrowUpRight size={16}/></Link></section></div>
  </div>
}

function NodeDashboard({ node }: { node: NodeInfo }) {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'analytics' ? 'analytics' : 'overview'
  const [duration, setDuration] = useState(3_600_000)
  const feed = useSensorFeed(node.sensorId ?? node.id, duration)
  const [refreshed, setRefreshed] = useState(false)
  useEffect(() => { document.title = `${node.name} — .env dashboard` }, [node.name])
  const refresh = () => { feed.refresh(); setRefreshed(true); setTimeout(() => setRefreshed(false), 1800) }
  return <div className="page-shell dashboard-page">
    <div className="dashboard-breadcrumb"><Link to="/dashboard"><ArrowLeft size={14}/> All nodes</Link><ChevronRight size={13}/><span>{node.id}</span><span className="auto-refresh"><span className="small-dot"/><span>Updates every 10 seconds</span></span></div>
    <div className="dashboard-title-row"><div><div className="node-title-meta"><span className="eyebrow">YOUR LOCAL ENVIRONMENT</span><span className={`feed-status ${feed.status === 'Offline' || feed.status === 'Unavailable' ? 'status-offline' : ''}`}><span className="small-dot"/>{feed.status}</span></div><h1>{node.name}<span className="title-period">.</span></h1><p><MapPin size={14}/>{node.location}</p></div><div className="dashboard-actions"><button className="icon-button refresh-button" aria-label="Refresh readings" onClick={refresh} disabled={feed.loading}>{refreshed ? <Check size={17}/> : <RefreshCw size={17} className={feed.loading ? 'spinning' : ''}/>}</button><a href={mapUrl(node)} target="_blank" rel="noopener noreferrer" className="button button-outline"><MapPin size={16}/>View on map <ArrowUpRight size={15}/></a></div></div>
    <div className="dashboard-tab-row"><div role="tablist" aria-label="Dashboard views" onKeyDown={tabKeyboard}><button id="overview-tab" role="tab" tabIndex={view === 'overview' ? 0 : -1} aria-selected={view === 'overview'} aria-controls="overview-panel" className={view === 'overview' ? 'active' : ''} onClick={() => setParams({ view: 'overview' })}>Overview</button><button id="analytics-tab" role="tab" tabIndex={view === 'analytics' ? 0 : -1} aria-selected={view === 'analytics'} aria-controls="analytics-panel" className={view === 'analytics' ? 'active' : ''} onClick={() => setParams({ view: 'analytics' })}>Analytics <span>04</span></button></div><span className="last-sync"><Clock3 size={12}/>{feed.age !== null ? `Last reading ${ageLabel(feed.age)} ago` : 'Waiting for readings'}</span></div>
    {feed.sample && <div className="feed-banner"><span className="feed-label">SAMPLE READINGS</span><p>Sample readings for exploring the dashboard. The live sensor feed is not connected yet.</p></div>}
    {feed.error && <div className="error-banner" role="alert"><Activity size={18}/><div><strong>Sensor feed unavailable.</strong><p>{feed.error}{feed.latest ? ' Showing the last received readings.' : ' No readings to display yet.'}</p></div><button className="text-link" onClick={feed.refresh}>Try again <RefreshCw size={14}/></button></div>}
    {view === 'overview' ? <div id="overview-panel" role="tabpanel" aria-labelledby="overview-tab">
      <div className="metric-grid">{metrics.map((metric, index) => {
        const Icon = metricIcons[index]
        const raw = feed.latest?.[metric.key]
        const value = raw === undefined ? '—' : (metric.key === 'gasResistanceOhms' ? raw / 1000 : raw).toFixed(1)
        return <article className={`metric-card metric-${index}`} key={metric.key}><div className="metric-label"><span>{metric.title}</span><Icon size={19} strokeWidth={1.4}/></div><div className="metric-number">{value}<span>{metric.unit}</span></div><span className="metric-note">{index === 3 ? 'BME680 · resistance reading' : metric.description}</span><svg viewBox="0 0 120 27" className="metric-spark" aria-hidden="true"><path d={sparkline(feed.history, metric.key)} fill="none" stroke={metric.color} strokeWidth="1.4"/></svg></article>
      })}</div>
      <p className="sensor-note">Gas resistance is a sensor response, not a CO₂, particulate, or air-quality measurement.</p>
      <div className="overview-middle"><div className="overview-trend"><div className="section-label-row"><h2>Recent temperature readings</h2><button className="text-link" onClick={() => setParams({ view: 'analytics' })}>All trends <ArrowUpRight size={15}/></button></div><SensorChart metric={metrics[0]} readings={feed.history}/></div></div>
      <Hydration machineId={node.machineId ?? null}/>
      <div className="telemetry-details"><div className="section-label-row"><h2>The latest field note</h2><span className="tag tag-outline">{feed.sample ? 'Sample telemetry' : 'Device telemetry'}</span></div><dl><div><dt>Node ID</dt><dd>{node.id}</dd></div><div><dt>Reading sequence</dt><dd>{feed.latest?.sequence.toLocaleString('en-IN') ?? '—'}</dd></div><div><dt>Module uptime</dt><dd>{feed.latest ? uptime(feed.latest.uptimeMs) : '—'}</dd></div><div><dt>Received at (IST)</dt><dd>{feed.latest ? new Date(feed.latest.receivedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</dd></div></dl>{feed.latest && <p className="reading-id">Reading ID <span>{feed.latest.readingId}</span></p>}</div>
    </div> : <div id="analytics-panel" role="tabpanel" aria-labelledby="analytics-tab"><div className="analytics-heading"><div><h2>The environment over time.</h2><p>Follow the changes, one reading at a time.</p></div><div className="range-control" aria-label="Historical time range">{durations.map(option => <button key={option.ms} aria-pressed={duration === option.ms} onClick={() => setDuration(option.ms)} className={duration === option.ms ? 'active' : ''}>{option.label}</button>)}</div></div><div className="charts-grid">{metrics.map(metric => <SensorChart key={metric.key} metric={metric} readings={feed.history}/>)}</div><div className="analytics-note"><span><Activity size={14}/>{feed.history.length} {feed.sample ? 'sample points' : 'readings'} in view</span><p>Gas resistance is shown in kΩ. It does not measure a specific pollutant or purification performance.</p></div></div>}
    <div className="development-note"><span className="small-dot"/><p>Growing next: purification hardware, algae conditions, and measured inlet/outlet performance.</p><span>IN DEVELOPMENT</span></div>
  </div>
}

export default function Dashboard() {
  const { nodeId } = useParams()
  useEffect(() => { if (!nodeId) document.title = 'Find your node — .env' }, [nodeId])
  if (!nodeId) return <NodeSelection/>
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return <div className="page-shell empty-page"><span className="eyebrow">NODE NOT FOUND</span><h1>This node isn’t in our network.</h1><Link to="/dashboard" className="button button-primary">Choose a node <ArrowUpRight size={17}/></Link></div>
  return <NodeDashboard key={node.id} node={node}/>
}
