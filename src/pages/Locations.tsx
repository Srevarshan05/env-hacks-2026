import { useEffect, useState } from 'react'
import { ArrowUpRight, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { nodes, mapUrl } from '../data/nodes'
import IndiaMap from '../components/IndiaMap'
import NodeLocationImage, { NodeImageCredit } from '../components/NodeLocationImage'

export default function Locations() {
  const [search, setSearch] = useState('')
  useEffect(() => { document.title = 'Our locations — .env' }, [])
  const filtered = nodes.filter(node => `${node.name} ${node.location} ${node.id}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="page-shell locations-page"><div className="page-heading"><div><span className="eyebrow"><span className="small-dot"/> ROOTED IN REAL PLACES</span><h1>A small start.<br/>A wider <em>map.</em></h1><p>Every point is a place to learn, care, and grow.</p></div><span className="page-index">FIELD MAP / INDIA</span></div><div className="locations-layout"><section className="locations-sidebar"><div className="section-label-row"><h2>Our locations <span>{nodes.length.toString().padStart(2, '0')}</span></h2></div><label className="search-field"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search locations" placeholder="Find a location"/></label>{filtered.length ? filtered.map(node => <article className="location-card" key={node.id}><div className="location-card-top"><span className="node-id">{node.id}</span></div><NodeLocationImage node={node}/><h3>{node.name}</h3><p>{node.location}</p><span className="coordinates">{node.latitude.toFixed(5)}° N<br/>{node.longitude.toFixed(5)}° E</span><div className="location-card-actions"><Link to={`/dashboard/${node.id}`} className="text-link">View node <ArrowUpRight size={16}/></Link><a href={mapUrl(node)} target="_blank" rel="noopener noreferrer" className="button button-outline" aria-label={`View ${node.name} on map`}>View on map <ArrowUpRight size={15}/></a></div><NodeImageCredit node={node}/></article>) : <div className="empty-search"><p>No locations match your search.</p><button className="text-link" onClick={() => setSearch('')}>Clear search</button></div>}</section><IndiaMap nodes={filtered}/></div><p className="map-credit">Map outline: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a> · Location data: <a href="https://mapcarta.com/N2669085028" target="_blank" rel="noopener noreferrer">OpenStreetMap via Mapcarta</a></p></div>
}
