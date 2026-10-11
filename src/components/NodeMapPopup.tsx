import { ArrowUpRight, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { mapUrl } from '../data/nodes'
import { useSensorFeed } from '../hooks/useSensorFeed'
import type { NodeInfo } from '../types'

export default function NodeMapPopup({ node, id, onClose }: { node: NodeInfo; id: string; onClose: () => void }) {
  const feed = useSensorFeed(node.id, 900_000)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => { close.current?.focus() }, [node.id])
  return <section className="map-node-popup" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} id={id}>
    <button ref={close} className="icon-button map-popup-close" aria-label="Close node details" onClick={onClose}><X size={17}/></button>
    <span className="eyebrow">NODE DETAILS</span>
    <h3 id={`${id}-title`}>{node.name}</h3>
    <p>{node.location}</p>
    <dl><div><dt>Node ID</dt><dd>{node.id}</dd></div><div><dt>Current status</dt><dd className={`map-popup-status ${feed.status === 'Offline' || feed.status === 'Unavailable' ? 'status-offline' : ''}`}><span className="small-dot"/>{feed.loading && !feed.latest ? 'Checking…' : feed.status}</dd></div><div className="map-popup-reading"><dt>Last reading</dt><dd>{feed.age === null ? 'No readings available' : `${feed.age < 60 ? `${feed.age}s` : `${Math.floor(feed.age / 60)}m`} ago`}</dd></div></dl>
    <div className="map-popup-actions"><Link to={`/dashboard/${node.id}`} className="text-link">View node <ArrowUpRight size={15}/></Link><a href={mapUrl(node)} className="button button-outline" target="_blank" rel="noopener noreferrer">View on map <ArrowUpRight size={15}/></a></div>
  </section>
}
