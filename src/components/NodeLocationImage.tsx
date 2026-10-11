import { useState } from 'react'
import { MapPin } from 'lucide-react'
import type { NodeInfo } from '../types'

export default function NodeLocationImage({ node }: { node: NodeInfo }) {
  const [failed, setFailed] = useState<string | null>(null)
  return <div className="node-location-image">
    {node.image && failed !== node.image
      ? <img src={node.image} alt={node.imageAlt || node.name} loading="lazy" onError={() => setFailed(node.image)}/>
      : <div className="node-image-placeholder"><MapPin size={32} strokeWidth={1.3}/><span>{node.name}</span></div>}
  </div>
}

export function NodeImageCredit({ node }: { node: NodeInfo }) {
  if (!node.imageCredit) return null
  const credit = node.imageCredit
  return <p className="node-image-credit">Photo: <a href={credit.source} target="_blank" rel="noopener noreferrer">{credit.author}</a> · <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.license}</a>. Cropped for display.</p>
}
