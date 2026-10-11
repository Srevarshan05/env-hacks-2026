// Read-only sensor API for the dashboard (AWS Lambda, Node.js 22, Function URL).
// GET /api/nodes/{nodeId}/readings/latest          -> { reading }
// GET /api/nodes/{nodeId}/readings?since=<ISO 8601> -> { readings: [...] } (oldest first, at most MAX_POINTS)
// CORS is configured on the Function URL, not here, so headers are never duplicated.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE = process.env.TABLE_NAME
const MAX_POINTS = 300
const MAX_RANGE_MS = 7 * 24 * 3_600_000
// readingId starts with a UTC timestamp (20261010T182237238928Z-…). Bounding the key to that format skips stray test items.
const KEY_MIN = '20000101T'
const KEY_MAX = '21000101T'
const NUMBER_FIELDS = ['sequence', 'temperature', 'humidity', 'pressureHpa', 'gasResistanceOhms', 'uptimeMs']

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) })
const error = (statusCode, code, message) => json(statusCode, { error: code, message })
// Timestamp key prefix with second precision: 2026-10-10T18:22:37.238Z -> 20261010T182237
const keyFor = date => date.toISOString().slice(0, 19).replace(/[-:]/g, '')

function toReading(item) {
  if (typeof item.nodeId !== 'string' || typeof item.readingId !== 'string' || typeof item.receivedAt !== 'string' || !Number.isFinite(Date.parse(item.receivedAt))) return null
  const reading = { nodeId: item.nodeId, readingId: item.readingId, receivedAt: item.receivedAt }
  for (const field of NUMBER_FIELDS) {
    const value = Number(item[field])
    if (!Number.isFinite(value)) return null
    reading[field] = value
  }
  return reading
}

async function latest(nodeId) {
  let ExclusiveStartKey
  // Walk back from the newest item until one is a complete reading.
  do {
    const page = await db.send(new QueryCommand({
      TableName: TABLE, ScanIndexForward: false, Limit: 10, ExclusiveStartKey,
      KeyConditionExpression: 'nodeId = :n AND readingId BETWEEN :lo AND :hi',
      ExpressionAttributeValues: { ':n': nodeId, ':lo': KEY_MIN, ':hi': KEY_MAX },
    }))
    for (const item of page.Items ?? []) {
      const reading = toReading(item)
      if (reading) return json(200, { reading })
    }
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return error(404, 'no_readings', 'No readings for this node yet.')
}

async function history(nodeId, sinceParam) {
  const since = new Date(sinceParam ?? '')
  if (!sinceParam || !Number.isFinite(since.getTime())) return error(400, 'invalid_since', 'Pass ?since= as an ISO 8601 timestamp.')
  const from = new Date(Math.max(since.getTime(), Date.now() - MAX_RANGE_MS))
  const items = []
  let ExclusiveStartKey
  do {
    const page = await db.send(new QueryCommand({
      TableName: TABLE, ExclusiveStartKey,
      KeyConditionExpression: 'nodeId = :n AND readingId BETWEEN :lo AND :hi',
      ExpressionAttributeValues: { ':n': nodeId, ':lo': keyFor(from), ':hi': KEY_MAX },
    }))
    for (const item of page.Items ?? []) {
      const reading = toReading(item)
      if (reading && Date.parse(reading.receivedAt) >= from.getTime()) items.push(reading)
    }
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)
  const step = Math.max(1, Math.ceil(items.length / MAX_POINTS))
  const readings = items.filter((_, index) => index % step === 0)
  if (items.length && readings.at(-1) !== items.at(-1)) readings.push(items.at(-1)) // always keep the newest point
  return json(200, { readings })
}

export const handler = async event => {
  if (event.requestContext?.http?.method !== 'GET') return error(405, 'method_not_allowed', 'Only GET is supported.')
  const match = /^\/api\/nodes\/([^/]+)\/readings(\/latest)?\/?$/.exec(event.rawPath ?? '')
  if (!match) return error(404, 'not_found', 'Unknown route.')
  const nodeId = decodeURIComponent(match[1])
  try {
    return match[2] ? await latest(nodeId) : await history(nodeId, event.queryStringParameters?.since)
  } catch (e) {
    console.error(e)
    return error(503, 'sensor_store_unavailable', 'Sensor data is temporarily unavailable.')
  }
}
