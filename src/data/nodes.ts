import type { NodeInfo } from '../types'

// Node locations supplied by the project team. Connectivity comes from telemetry.
// Station coordinates: https://mapcarta.com/N2669085028 (OpenStreetMap).
export const nodes: NodeInfo[] = [
  {
    id: 'ENV-001',
    name: 'Trichy Junction',
    location: 'Tiruchirappalli, Tamil Nadu',
    state: 'Tamil Nadu',
    latitude: 10.79427,
    longitude: 78.68529,
    description: 'Environmental monitoring at Trichy Junction.',
    image: '/images/nodes/trichy-junction.jpg',
    // Backend machine that receives refills (POST /api/refill-sessions) for this node.
    machineId: 'NODE-001',
    // Device that writes this node's readings to DynamoDB.
    sensorId: 'AirPurifierNode01',
    imageAlt: 'A train platform and footbridge at Tiruchirappalli Junction railway station.',
    imageCredit: {
      author: 'Dr. Chinchu C.',
      source: 'https://commons.wikimedia.org/wiki/File:Tiruchirappalli_Junction_railway_station.jpg',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
]

export const mapUrl = (node: NodeInfo) =>
  `https://www.google.com/maps/search/?api=1&query=${node.latitude},${node.longitude}`
