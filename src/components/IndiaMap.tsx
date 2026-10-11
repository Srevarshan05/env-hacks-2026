import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import geometry from '../data/india.json'
import NodeMapPopup from './NodeMapPopup'
import type { NodeInfo } from '../types'

const project = (longitude: number, latitude: number) => [(longitude - 66) * 19, (38 - latitude) * 19]
const polygonPath = (ring: number[][]) => ring.map(([longitude, latitude], index) => `${index ? 'L' : 'M'}${project(longitude, latitude).map(n => n.toFixed(2)).join(',')}`).join(' ') + 'Z'
const outlines = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
const paths = (outlines as number[][][][]).map(polygon => polygon.map(polygonPath).join(' '))

export default function IndiaMap({ nodes, compact = false }: { nodes: NodeInfo[]; compact?: boolean }) {
  const id = useId().replaceAll(':', '')
  const [zoom, setZoom] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const selected = nodes.find(node => node.id === selectedId)
  const close = () => {
    setSelectedId(null)
    container.current?.querySelector<SVGGElement>(`[data-node-id="${selectedId}"]`)?.focus()
  }
  useEffect(() => {
    if (!selectedId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId(null)
        container.current?.querySelector<SVGGElement>(`[data-node-id="${selectedId}"]`)?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setSelectedId(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer) }
  }, [selectedId])
  useEffect(() => { if (selectedId && !nodes.some(node => node.id === selectedId)) setSelectedId(null) }, [nodes, selectedId])
  return <div ref={container} className={`india-map ${compact ? 'india-map-compact' : ''}`}>
    <div className="map-top-label"><span className="eyebrow">THE .ENV FIELD MAP</span><span>INDIA / 01</span></div>
    <svg viewBox={`${325 - 325 / zoom} ${335 - 335 / zoom} ${650 / zoom} ${670 / zoom}`} role="group" aria-label={nodes.length ? `Map of India with locations at ${nodes.map(node => node.name).join(', ')}` : 'Map of India. No locations match your search.'} onClick={event => { if (!(event.target as Element).closest('.map-pin-link')) setSelectedId(null) }}>
      <defs><pattern id={`${id}-dots`} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.05" fill="#9eaa80" /></pattern><pattern id={`${id}-grid`} width="95" height="95" patternUnits="userSpaceOnUse"><path d="M95 0H0V95" fill="none" stroke="#c9cfbb" strokeWidth=".6" strokeDasharray="2 5" /></pattern><clipPath id={`${id}-land`}>{paths.map((d, index) => <path key={index} d={d} />)}</clipPath></defs>
      <rect width="650" height="670" fill={`url(#${id}-grid)`} />
      <g stroke="#bdc6a5" strokeWidth="1.2" fill="#ecedde">{paths.map((d, index) => <path key={index} d={d} />)}</g>
      <g fill={`url(#${id}-dots)`}>{paths.map((d, index) => <path key={index} d={d} />)}</g>
      <g clipPath={`url(#${id}-land)`} stroke="#899d68" opacity=".17" fill="none" strokeWidth="1.4">{[0, 1, 2, 3, 4, 5, 6].map(i => <path key={i} d={`M0 ${150 + i * 50}Q120 ${110 + i * 45} 240 ${240 + i * 40}T570 ${190 + i * 50}`} />)}</g>
      <g className="map-geo-labels" fill="#929c86" fontSize="9" letterSpacing="2"><text x="59" y="645">70° E</text><text x="250" y="645">80° E</text><text x="442" y="645">90° E</text><text transform="translate(608 170) rotate(90)">30° N</text><text transform="translate(608 380) rotate(90)">20° N</text></g>
      <text x="124" y="405" className="sea-label" transform="rotate(-60 124 405)">ARABIAN SEA</text><text x="384" y="454" className="sea-label">BAY OF BENGAL</text>
      <g stroke="#748b66" strokeWidth="1" fill="none" transform="translate(563 50)"><path d="M0 38V0l-5 11M0 0l5 11"/><text y="-8" x="0" textAnchor="middle" fill="#748b66" stroke="none" fontSize="11">N</text></g>
      {nodes.map(node => {
        const [x, y] = project(node.longitude, node.latitude)
        return <g key={node.id} role="button" tabIndex={0} data-node-id={node.id} aria-label={`Show ${node.name} node details`} aria-expanded={selectedId === node.id} aria-haspopup="dialog" aria-controls={selectedId === node.id ? `${id}-popup` : undefined} className="map-pin-link" onClick={() => setSelectedId(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id) } }}><title>{node.name} — View node details.</title><rect x={x - 25} y={y - 48} width="220" height="78" rx="6" fill="transparent" pointerEvents="all"/><circle cx={x} cy={y} r="25" className="map-pin-halo"/><circle cx={x} cy={y} r="14" fill="#d9e4c1" stroke="#6d894e" strokeWidth="1"/><circle cx={x} cy={y} r="5.5" fill="#35563c"/><path d={`M${x + 20} ${y}h25l20-21h81`} stroke="#738365" strokeWidth="1" fill="none"/><text x={x + 68} y={y - 32} className="map-node-name">{node.name.toUpperCase()}</text><text x={x + 68} y={y - 6} className="map-node-id">{node.id}</text></g>
      })}
    </svg>
    {!compact && <div className="map-controls"><button className="icon-button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(2.4, z + .35))} disabled={zoom >= 2.4}><Plus size={17}/></button><button className="icon-button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z - .35))} disabled={zoom <= 1}><Minus size={17}/></button><button className="icon-button" aria-label="Reset map zoom" onClick={() => setZoom(1)}><RotateCcw size={15}/></button></div>}
    <div className="map-bottom-label"><span><span className="small-dot"/> Nodes</span><span>Select a point for node details</span></div>
    {selected && <NodeMapPopup key={selected.id} node={selected} id={`${id}-popup`} onClose={close}/>}
  </div>
}
