# Architecture Changes Summary

## Date: 2026-02-05 (updated 2026-02-23)

## Overview

**Major architectural revision**: Changed from a **pull model** to a **push-only model** based on the constraint that Quote/0 devices can only call the official Quote/0 API service, not custom APIs.

**Additional changes (2026-02-23)**: Added Bearer token API authorization on all HTTP endpoints.

---

## Key Changes

### 1. Removed GET /api/display Endpoint

**Reason**: Quote/0 device cannot call custom APIs. It receives pushes from the official Quote/0 Text API only.

---

### 2. POST /api/events

**Method**: `POST /api/events` — the correct HTTP method for resource creation.

---

### 3. Added POST /api/events/batch

**Purpose**: Create multiple events (up to 100) in a single API call

- More efficient than calling POST /api/events multiple times
- Validates all events before creating any
- Supports partial success (207 Multi-Status)
- Triggers a single Quote/0 update after all events are created

---

### 4. Added bin_collection DynamoDB Table

**Purpose**: Store bin collection data for on-demand querying

**Schema**:
```yaml
Table: bin_collection
Primary Key:
  - date (HASH): YYYY-MM-DD
  - service (RANGE): Original service name
Attributes:
  - day: Day of week
  - round: Collection round
  - schedule: Schedule name
  - updated_at: Last update timestamp
  - ttl: Auto-delete timestamp (90 days)
```

**Benefits**:
- Eliminates need for repeated API calls to Reading Council
- Enables fast querying by date
- Automatically cleans up old data with TTL

---

### 5. Single Daily Scheduled Update

**Schedule**: 1 daily update at 01:10 UTC

The iPhone app triggers immediate updates when events are created, making frequent scheduled updates unnecessary. The single daily update handles the bin collection sync.

---

### 6. Added API Authorization (2026-02-23)

**Purpose**: Protect HTTP endpoints from unauthorized access

**Implementation**:
- New `API_AUTH_TOKEN` environment variable
- All HTTP endpoints (`POST /api/events`, `POST /api/events/batch`) require `Authorization: Bearer <token>` header
- Missing header returns 401 Unauthorized
- Wrong token returns 403 Forbidden
- Scheduled EventBridge handler is NOT protected (internal trigger)
- If `API_AUTH_TOKEN` is empty/unset, auth is skipped (for local dev convenience)

---

### 7. Revised Scheduled Service (01:10 UTC daily)

**Workflow**:

| Step | Action | Purpose |
|------|--------|---------|
| 1 | Fetch bin collections from Reading API | Get ~9 upcoming collections |
| 2 | **Store in DynamoDB bin_collection table** | Persist for on-demand access |
| 3 | Query tomorrow's bins from DB | Get tomorrow's schedule |
| 4 | Query today's events from DB | Get user-created events |
| 5 | Format display data | Prepare for Quote/0 |
| 6 | Push to Quote/0 Text API | Update device |

---

### 8. Enhanced POST /api/events Endpoint

**Behavior**: After creating/upserting an event, **immediately updates Quote/0**

**Workflow**:

| Step | Action |
|------|--------|
| 1 | Authorize request (Bearer token) |
| 2 | Upsert event to DynamoDB events table |
| 3 | Query tomorrow's bins from bin_collection table |
| 4 | Query today's events from events table |
| 5 | Format display data |
| 6 | Push to Quote/0 Text API |

**Response**:
```json
{
  "date": "2026-02-10",
  "id": "a3f8b2c1-5e4d-4a9b-8c6d-1234567890ab",
  "event": "Event text",
  "created_at": "2026-02-05T10:30:00.123Z",
  "ttl": 1746316800,
  "quote0_updated": true
}
```

---

## Code Changes

### New Files Created

1. **`src/services/binCollectionDbService.js`**
   - Handles DynamoDB operations for bin_collection table
   - Methods: `upsertBinCollection()`, `getBinCollectionsByDate()`, `getTomorrowCollections()`, `storeBinCollections()`

### Modified Files

1. **`serverless.yml`**
   - Added `BIN_COLLECTION_TABLE` environment variable
   - Added `API_AUTH_TOKEN` environment variable
   - Added `BinCollectionTable` DynamoDB resource definition
   - Removed GET /api/display endpoint
   - Changed PUT /api/events to POST /api/events
   - Added POST /api/events/batch endpoint
   - Changed from 4 cron rules to 1 (01:10 UTC only)
   - Updated IAM permissions for new table

2. **`src/lambda/handlers.js`**
   - Removed `getDisplay` handler
   - Added `authorize()` function for Bearer token validation
   - Added auth check to `createEvent` and `createEventsBatch` handlers
   - Updated `createEvent` handler to trigger Quote/0 update after event creation
   - Added `createEventsBatch` handler
   - Updated imports to use `binCollectionDbService`

3. **`src/services/scheduledUpdateService.js`**
   - Added Step 1: Fetch bin collections from Reading API
   - Added Step 2: Store in DynamoDB
   - Updated Step 3: Query from database instead of API
   - Updated to use `binCollectionDbService`

4. **`src/services/binCollectionService.js`**
   - Added new method: `fetchBinCollections()` (returns raw API data)

5. **`src/services/displayFormatterService.js`**
   - Added new method: `formatDisplayFromDb()` (formats from database objects)

6. **`src/services/dynamoDbService.js`**
   - Added `upsertEvent()` method (update if exists, create if not)
   - Added `updateEvent()` method
   - Added `createEventsBatch()` method

---

## Environment Variables

### Current

| Variable | Description |
|----------|-------------|
| `UPRN` | Reading Council property reference (default: 310022781) |
| `QUOTE0_TEXT_API` | Quote/0 device Text API endpoint (required) |
| `QUOTE0_AUTH_TOKEN` | Bearer token for Quote/0 device API |
| `API_AUTH_TOKEN` | Bearer token to protect HTTP endpoints |
| `READING_API_URL` | Reading Council API URL |
| `READING_API_TIMEOUT` | API timeout in milliseconds |
| `CACHE_TTL_HOURS` | Cache TTL |
| `BIN_COLLECTION_TABLE` | DynamoDB table name (auto-set by Serverless Framework) |
| `EVENTS_TABLE` | DynamoDB table name (auto-set by Serverless Framework) |

---

## Security

### API Authorization
- All HTTP endpoints require `Authorization: Bearer <API_AUTH_TOKEN>`
- Missing header: 401 Unauthorized
- Invalid token: 403 Forbidden
- Scheduled EventBridge triggers: No auth needed (internal)
- Local dev: Auth skipped if `API_AUTH_TOKEN` is empty

### Outbound Authentication
- Quote/0 Text API: `Authorization: Bearer <QUOTE0_AUTH_TOKEN>`

---

## Important Notes

- Quote/0 device receives updates via official Quote/0 Text API only (no GET endpoint)
- All API clients must include `Authorization: Bearer <token>` header
- Endpoints: `POST /api/events` and `POST /api/events/batch`

---

## Cost Implications (AWS)

- **Lambda Executions**: ~40/month (30 scheduled + ~10 POST requests)
- **DynamoDB**: Reads/Writes for events + bin_collection tables
- **External API Calls**: 30/month to Reading Council

**Estimated Cost**: Well within AWS Free Tier

---

**Architecture revised on**: 2026-02-05
**Authorization added on**: 2026-02-23
**Reason**: Quote/0 device limitation (push-only) + API security
