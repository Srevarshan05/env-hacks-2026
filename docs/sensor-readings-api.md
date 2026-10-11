# Sensor readings API (backend reads DynamoDB, dashboard polls)

> **Implemented** as a standalone read-only Lambda in account 084897310212 (ap-south-1), next to the table, because the refill backend runs in another account:
> - Function `env-sensor-read-api` (Node.js 22, source in `sensor-api/index.mjs`), public Function URL `https://mqicbj5sbbmysitvpch6iptmbq0hbwpx.lambda-url.ap-south-1.on.aws` (`VITE_SENSOR_API_URL`).
> - Role `env-sensor-read-api-role`: `dynamodb:Query` on `AirPurifierTelemetry` only, plus CloudWatch logs (7-day retention).
> - CORS on the Function URL: the Amplify site and `http://localhost:5173`, GET only.
> - Table `AirPurifierTelemetry`: partition key `nodeId` (device `AirPurifierNode01`, mapped from dashboard node `ENV-001` via `sensorId` in `src/data/nodes.ts`), sort key `readingId` = `YYYYMMDDTHHMMSSffffffZ-<suffix>`. Items already use the `Reading` field names; items without a timestamped `readingId` or a valid `receivedAt` are skipped.
> - Update the code: zip `sensor-api/index.mjs` as `index.mjs` and run `aws lambda update-function-code --function-name env-sensor-read-api --zip-file fileb://function.zip --region ap-south-1`.
>
> The spec below remains the contract if the main backend takes these routes over later.

The dashboard (`/dashboard/:nodeId`) already has a live mode. It turns on when `VITE_USE_SAMPLE_DATA=false`. The browser never touches DynamoDB or AWS credentials; the FastAPI backend reads the table and serves two **public** (no auth) endpoints, the same way `/api/machines/{id}` is public.

## Endpoints the frontend calls

Every 10 seconds (`apiConfig.pollIntervalMs`), for the open node:

| Call | Response |
|---|---|
| `GET /api/nodes/{node_id}/readings/latest` | `{"reading": Reading}` (404 `{"error": "no_readings", ...}` if none) |
| `GET /api/nodes/{node_id}/readings?since=<ISO 8601 UTC>` | `{"readings": [Reading, ...]}`, oldest first |

`since` is 15 minutes, 1 hour or 24 hours ago, depending on the range selected on the Analytics tab.
Return **at most ~300 readings**: downsample evenly when the range holds more, for example 24 h at a 10 s interval is 8,640 items.
The frontend de-duplicates by `readingId` and sorts by `receivedAt` itself.

## `Reading` format (validated strictly by `src/services/readings.ts`)

```json
{
  "nodeId": "ENV-001",
  "readingId": "ENV-001#1739",
  "sequence": 1739,
  "receivedAt": "2026-10-11T09:15:20Z",
  "temperature": 29.8,
  "humidity": 68.1,
  "pressureHpa": 1009.2,
  "gasResistanceOhms": 118700,
  "uptimeMs": 17390000
}
```

- All numeric fields must be finite **numbers**. boto3 returns DynamoDB numbers as `Decimal`; convert them with `float()` / `int()`.
- `nodeId` must equal the `{node_id}` in the URL. A mismatch is rejected as invalid data.
- `gasResistanceOhms` is in Ω; the UI converts it to kΩ. `receivedAt` is when the reading arrived (UTC). The dashboard shows "Offline" when the latest one is more than 35 s old.
- If the device doesn't send `sequence` or `uptimeMs`, send `0`. If it has no unique ID, use `f"{nodeId}#{receivedAt}"`.

## FastAPI sketch (boto3)

Adjust `TABLE`, the key names and the field mapping to the real table. The backend's IAM role needs `dynamodb:Query` on the table (and on its index, if one is used).

```python
import os
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key
from fastapi import HTTPException, Query

table = boto3.resource("dynamodb", region_name=os.environ["SENSOR_TABLE_REGION"]).Table(os.environ["SENSOR_TABLE"])
PK, SK = "nodeId", "receivedAt"   # partition key / sort key of the table (or of a GSI)
MAX_POINTS = 300

def to_reading(item: dict) -> dict:
    return {
        "nodeId": item[PK],
        "readingId": str(item.get("readingId") or f"{item[PK]}#{item[SK]}"),
        "sequence": int(item.get("sequence", 0)),
        "receivedAt": str(item[SK]),
        "temperature": float(item["temperature"]),
        "humidity": float(item["humidity"]),
        "pressureHpa": float(item["pressure"]),            # map the device's field names here
        "gasResistanceOhms": float(item["gasResistance"]),
        "uptimeMs": int(item.get("uptimeMs", 0)),
    }

@app.get("/api/nodes/{node_id}/readings/latest")
def latest_reading(node_id: str):
    items = table.query(KeyConditionExpression=Key(PK).eq(node_id), ScanIndexForward=False, Limit=1)["Items"]
    if not items:
        raise HTTPException(404, detail="No readings for this node yet.")  # or the backend's {"error": ...} format
    return {"reading": to_reading(items[0])}

@app.get("/api/nodes/{node_id}/readings")
def reading_history(node_id: str, since: datetime = Query(...)):
    since_key = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # must sort like the stored SK
    kwargs = {"KeyConditionExpression": Key(PK).eq(node_id) & Key(SK).gte(since_key)}
    items = []
    while True:
        page = table.query(**kwargs)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    step = max(1, len(items) // MAX_POINTS)
    return {"readings": [to_reading(i) for i in items[::step]]}
```

If the sort key is a number (epoch seconds or milliseconds), compare `since` as the same kind of number and convert it to ISO 8601 for `receivedAt`.

## Turning it on in the frontend

```dotenv
VITE_USE_SAMPLE_DATA=false
```

Restart Vite (or redeploy on Amplify). The "Sample feed" badge then changes to Online or Offline. If the backend fails, the dashboard keeps the last readings it received and shows an error; it never falls back to fake data.
