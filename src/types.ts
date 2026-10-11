export type SensorReading = {
  nodeId: string
  readingId: string
  gasResistanceOhms: number
  humidity: number
  pressureHpa: number
  receivedAt: string
  sequence: number
  temperature: number
  uptimeMs: number
}

export type NodeInfo = {
  id: string
  name: string
  location: string
  state: string
  latitude: number
  longitude: number
  description: string
  image: string | null
  machineId?: string | null
  // Device ID the sensor writes to DynamoDB (nodeId in AirPurifierTelemetry), when it differs from `id`.
  sensorId?: string
  imageAlt?: string
  imageCredit?: { author: string; source: string; license: string; licenseUrl: string }
}
