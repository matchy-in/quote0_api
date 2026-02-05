# Architecture Changes Summary

## Date: 2026-02-05

## Overview

**Major architectural revision**: Changed from a **pull model** to a **push-only model** based on the constraint that Quote/0 devices can only call the official Quote/0 API service, not custom APIs.

---

## Key Changes

### 1. Removed GET /api/display Endpoint ❌

**Reason**: Quote/0 device cannot call custom APIs

**Before**:
```
Quote/0 device → GET /api/display (hourly) → Returns formatted data
```

**After**:
```
Quote/0 device receives pushes from official Quote/0 Text API only
```

---

### 2. Added bin_collection DynamoDB Table ⭐ NEW

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

### 3. Revised Scheduled Service (01:10 UTC daily)

**New Workflow**:

| Step | Action | Purpose |
|------|--------|---------|
| 1 | Fetch bin collections from Reading API | Get ~9 upcoming collections |
| 2 | **Store in DynamoDB bin_collection table** | Persist for on-demand access |
| 3 | Query tomorrow's bins from DB | Get tomorrow's schedule |
| 4 | Query today's events from DB | Get user-created events |
| 5 | Format display data | Prepare for Quote/0 |
| 6 | Push to Quote/0 Text API | Update device |

**Key Change**: Now stores bin data instead of just fetching and using it

**Reduced Frequency**: From 4 daily updates (01:10, 07:10, 12:10, 17:10) to **1 daily update (01:10)**

---

### 4. Enhanced POST /api/events Endpoint

**New Behavior**: After creating an event, **immediately updates Quote/0**

**Workflow**:

| Step | Action |
|------|--------|
| 1 | Insert event to DynamoDB events table |
| 2 | Query tomorrow's bins from bin_collection table |
| 3 | Query today's events from events table |
| 4 | Format display data |
| 5 | Push to Quote/0 Text API |

**Response**:
```json
{
  "date": "2026-02-10",
  "id": "a3f8b2c1-5e4d-4a9b-8c6d-1234567890ab",
  "event": "Event text",
  "created_at": "2026-02-05T10:30:00.123Z",
  "ttl": 1746316800,
  "quote0_updated": true  ⭐ NEW
}
```

---

## Code Changes

### New Files Created

1. **`src/services/binCollectionDbService.js`** ⭐ NEW
   - Handles DynamoDB operations for bin_collection table
   - Methods: `upsertBinCollection()`, `getBinCollectionsByDate()`, `getTomorrowCollections()`, `storeBinCollections()`

### Modified Files

1. **`serverless.yml`**
   - Added `BIN_COLLECTION_TABLE` environment variable
   - Added `BinCollectionTable` DynamoDB resource definition
   - Removed GET /api/display endpoint configuration
   - Changed schedule from 4 cron rules to 1 (01:10 UTC only)
   - Updated IAM permissions for new table

2. **`src/lambda/handlers.js`**
   - Removed `getDisplay` handler
   - Updated `createEvent` handler to trigger Quote/0 update after event creation
   - Updated imports to use `binCollectionDbService`

3. **`src/services/scheduledUpdateService.js`**
   - Added Step 1: Fetch bin collections from Reading API
   - Added Step 2: Store in DynamoDB
   - Updated Step 3: Query from database instead of API
   - Updated to use `binCollectionDbService`

4. **`src/services/binCollectionService.js`**
   - Added new method: `fetchBinCollections()` (returns raw API data)
   - Kept legacy methods for compatibility

5. **`src/services/displayFormatterService.js`**
   - Added new method: `formatDisplayFromDb()` (formats from database objects)
   - Kept legacy methods for compatibility

### Documentation Updates

1. **`docs/README.md`** - Updated to reflect push-only architecture
2. **`docs/02-api-reference.md`** - Removed GET endpoint, updated PUT behavior
3. **`docs/03-scheduled-service.md`** - Updated workflow to include database storage

---

## Benefits of New Architecture

### 1. **Correct Architecture** ✅
- Aligns with Quote/0 device limitations (can only call official API)
- Lambda functions actively push to Quote/0 via official Text API

### 2. **Reduced API Calls** 📉
- Reading Council API: Called once daily instead of 4 times
- Reduces load on external service
- Faster response times (query DB instead of API)

### 3. **Better Data Persistence** 💾
- Bin collection data stored in DynamoDB
- Survives API outages (can use cached data)
- Enables historical queries if needed

### 4. **Instant Updates** ⚡
- Creating an event via PUT immediately updates Quote/0
- No need to wait for next scheduled update

### 5. **Simplified Scheduling** 🕐
- One scheduled job instead of four
- Easier to maintain and monitor
- Lower Lambda execution costs

---

## Migration Steps

### For Existing Deployments

1. **Deploy Updated Code**:
   ```bash
   npm install
   npm run deploy:dev
   ```

2. **Verify New Table Created**:
   ```bash
   aws dynamodb describe-table --table-name quote0-api-dev-bin-collection
   ```

3. **Test Scheduled Function**:
   ```bash
   aws lambda invoke \
     --function-name quote0-api-dev-scheduledUpdate \
     --payload '{}' \
     response.json
   ```

4. **Verify Bin Data Stored**:
   ```bash
   aws dynamodb scan --table-name quote0-api-dev-bin-collection
   ```

5. **Test POST Endpoint**:
   ```bash
   curl -X POST https://your-api.com/api/events \
     -H "Content-Type: application/json" \
     -d '{"date":"2026/02/10","event":"Test event"}'
   ```

---

## Breaking Changes

### Removed Endpoint

- **GET /api/display** - No longer available

### Impact

- Quote/0 device should NOT be configured to call GET /api/display
- Quote/0 device receives updates via official Quote/0 Text API only

---

## Environment Variables

### Unchanged

- `UPRN`: Reading Council property reference (default: 310022781)
- `QUOTE0_TEXT_API`: Quote/0 device Text API endpoint (required)
- `READING_API_URL`: Reading Council API URL
- `READING_API_TIMEOUT`: API timeout in milliseconds
- `CACHE_TTL_HOURS`: Cache TTL (still used for in-memory cache)

### New

- `BIN_COLLECTION_TABLE`: DynamoDB table name (auto-set by Serverless Framework)

---

## Cost Implications (AWS)

### Before (4 daily scheduled updates)

- **Lambda Executions**: 120/month (4 × 30 days)
- **DynamoDB**: Reads/Writes for events table only
- **External API Calls**: 120/month to Reading Council

### After (1 daily scheduled update + on-demand)

- **Lambda Executions**: ~40/month (30 scheduled + ~10 POST requests)
- **DynamoDB**: Reads/Writes for events + bin_collection tables
- **External API Calls**: 30/month to Reading Council (75% reduction)

**Estimated Savings**: ~$0.50-$1.00/month (still well within AWS Free Tier)

---

## Testing Recommendations

1. **Test Scheduled Update**:
   ```bash
   serverless logs -f scheduledUpdate --tail
   aws lambda invoke --function-name quote0-api-dev-scheduledUpdate --payload '{}' response.json
   ```

2. **Test POST Endpoint**:
   ```bash
   curl -X POST {API_URL}/api/events \
     -H "Content-Type: application/json" \
     -d '{"date":"2026/02/10","event":"Test event"}'
   ```

3. **Verify Database**:
   ```bash
   aws dynamodb scan --table-name quote0-api-dev-bin-collection
   aws dynamodb scan --table-name quote0-api-dev-events
   ```

4. **Check Quote/0 Device**:
   - Verify display shows correct data
   - Check timestamp on Quote/0 matches Lambda execution time

---

## Rollback Plan

If issues arise:

1. **Revert to previous version**:
   ```bash
   git revert HEAD
   npm run deploy:dev
   ```

2. **Delete new DynamoDB table** (optional):
   ```bash
   aws dynamodb delete-table --table-name quote0-api-dev-bin-collection
   ```

---

## Future Enhancements

1. **Add GET /api/bin-collections/{date}**: Query bin collections for specific dates
2. **Webhook for Quote/0 updates**: Receive confirmation of successful display updates
3. **Event priorities**: Display high-priority events first
4. **Multi-day view**: Show events for next 3 days
5. **Push notifications**: Alert on failed updates

---

## Questions?

If you encounter issues or have questions about the new architecture:
1. Check CloudWatch Logs: `/aws/lambda/quote0-api-dev-scheduledUpdate`
2. Review DynamoDB tables: Verify data is being stored correctly
3. Test Quote/0 Text API: Ensure endpoint is reachable

---

**Architecture revised on**: 2026-02-05  
**Reason**: Quote/0 device limitation (can only call official Quote/0 API)  
**Impact**: Major - Changed from pull to push model
