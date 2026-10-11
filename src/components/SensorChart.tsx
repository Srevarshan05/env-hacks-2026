import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SensorReading } from '../types'

export const metrics = [
  { key: 'temperature', title: 'Temperature', unit: '°C', color: '#b67b54', description: 'Ambient temperature' },
  { key: 'humidity', title: 'Humidity', unit: '%', color: '#668b90', description: 'Relative humidity' },
  { key: 'pressureHpa', title: 'Barometric pressure', unit: 'hPa', color: '#83936a', description: 'Atmospheric pressure' },
  { key: 'gasResistanceOhms', title: 'Gas resistance', unit: 'kΩ', color: '#8c83a0', description: 'BME680 resistance · not a pollutant concentration' },
] as const

export default function SensorChart({ metric, readings }: { metric: typeof metrics[number]; readings: SensorReading[] }) {
  const latest = readings.at(-1)
  const data = readings.map(r => ({ timestamp: Date.parse(r.receivedAt), value: metric.key === 'gasResistanceOhms' ? r[metric.key] / 1000 : r[metric.key] }))
  const value = latest ? (metric.key === 'gasResistanceOhms' ? latest[metric.key] / 1000 : latest[metric.key]).toFixed(1) : '—'
  const time = (timestamp: number) => new Date(timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
  return <article className="chart-card"><div className="chart-heading"><div><h3><span style={{ background: metric.color }} className="chart-dot"/>{metric.title}</h3><p>{metric.description}</p></div><span className="chart-value">{value}<small>{metric.unit}</small></span></div>
    {data.length ? <div className="chart-plot" role="img" aria-label={`${metric.title} over time. Latest reading ${value} ${metric.unit}.`}><ResponsiveContainer width="100%" height={205}><LineChart data={data} margin={{ top: 15, right: 10, bottom: 3, left: -14 }}><CartesianGrid stroke="#e8e9e1" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} tickFormatter={time} minTickGap={38} tick={{ fontSize: 12, fill: '#53634e' }} axisLine={false} tickLine={false} dy={8}/><YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#53634e' }} axisLine={false} tickLine={false} tickFormatter={n => String(+Number(n).toFixed(1))}/><Tooltip labelFormatter={n => new Date(Number(n)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeZoneName: 'short' })} formatter={v => [`${Number(v).toFixed(1)} ${metric.unit}`, metric.title]} contentStyle={{ borderRadius: '9px', border: '1px solid #e2e5d9', fontSize: '14px', boxShadow: '0 3px 16px #2646320d' }}/><Line dataKey="value" type="monotone" stroke={metric.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false}/></LineChart></ResponsiveContainer></div> : <div className="chart-empty">Waiting for sensor history.</div>}
  </article>
}
