# Scheduled Service

## Overview

The scheduled service runs **once daily at 01:10 UTC** to:
1. **Fetch** bin collections from Reading Council API
2. **Store** collections in DynamoDB `bin_collection` table
3. **Query** tomorrow's bins and today's events from database
4. **Push** formatted display to Quote/0 device

> **Reduced from 4 daily updates**: The system now stores bin collection data in DynamoDB, eliminating the need for frequent API calls. The iPhone app triggers immediate updates when events are created.

---

## Schedule Time (UTC)

| Time (UTC) | Purpose |
|------------|---------|
| **01:10** | Daily bin collection sync and Quote/0 update |

**Cron Expression**: `cron(10 1 * * ? *)` (AWS EventBridge format)

---

## Workflow

### Process Flow

```
AWS EventBridge Schedule (01:10 UTC daily)
         ↓
┌─────────────────────────────────────────────┐
│  scheduledUpdate Lambda Function           │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 1: Fetch Bin Collections from API    │
│  - GET https://api.reading.gov.uk/api/     │
│    collections/310022781                    │
│  - Returns ~9 upcoming collections          │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 2: Store in DynamoDB ⭐ NEW          │
│  - Upsert to bin_collection table           │
│  - Primary Key: date + service              │
│  - Auto-update existing records             │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 3: Query Tomorrow's Bins from DB     │
│  - Query bin_collection WHERE date=tmr      │
│  - Map service names to friendly format     │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 4: Query Today's Events from DB      │
│  - Query events WHERE date=today            │
│  - Retrieve user-created events             │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 5: Format Display Data               │
│  - Title: Today's date (YYYY/MM/DD)        │
│  - Signature: Tomorrow's bin reminder       │
│  - Message: Today's events (3×27 chars + \n)│
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 6: Push to Quote/0                   │
│  - POST to Quote/0 Text API                 │
│  - Send formatted display JSON              │
└─────────────────────────────────────────────┘
```

---

## Step-by-Step Details

### Step 1: Fetch Bin Collections from Reading API

**Purpose**: Get upcoming bin collection schedule from Reading Council

**API Call**:
```http
GET https://api.reading.gov.uk/api/collections/310022781
```

**Response Example**:
```json
{
  "uprn": "310022781",
  "success": true,
  "collections": [
    {
      "service": "Domestic Waste Collection Service",
      "round": "3ADOM",
      "schedule": "TueFort1",
      "day": "Tuesday",
      "date": "03/02/2026 00:00:00",
      "read_date": "Tuesday 3rd of February"
    },
    {
      "service": "Recycling Collection Service",
      "round": "3BREC",
      "schedule": "ThuFort1",
      "day": "Thursday",
      "date": "05/02/2026 00:00:00",
      "read_date": "Thursday 5th of February"
    }
    // ... typically returns 9 upcoming collections
  ]
}
```

**Code**:
```javascript
const collections = await binCollectionService.fetchBinCollections();
console.log(`Fetched ${collections.length} collections from Reading API`);
```

---

### Step 2: Store Bin Collections in DynamoDB ⭐ NEW

**Purpose**: Persist bin collection data for on-demand querying

**Database**: `bin_collection` table

**Primary Key**:
- `date` (Partition Key): YYYY-MM-DD format
- `service` (Sort Key): Original service name from API

**Upsert Behavior**:
- If record exists (same date + service) → **Update**
- If record doesn't exist → **Insert**

**TTL**: Auto-delete 90 days after collection date

**Code**:
```javascript
const storedCount = await binCollectionDbService.storeBinCollections(collections);
console.log(`Stored ${storedCount} bin collections in DynamoDB`);
```

**DynamoDB Item Example**:
```json
{
  "date": "2026-02-05",
  "service": "Recycling Collection Service",
  "day": "Thursday",
  "round": "3BREC",
  "schedule": "ThuFort1",
  "updated_at": "2026-02-05T01:10:15.123Z",
  "ttl": 1748995200
}
```

---

### Step 3: Query Tomorrow's Bin Collections from Database

**Purpose**: Get bins being collected tomorrow

**Database Query**:
```javascript
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowDate = tomorrow.toISOString().split('T')[0]; // "2026-02-06"

const binCollections = await binCollectionDbService.getBinCollectionsByDate(tomorrowDate);
```

**Service Name Mapping**:
| Original Service Name | Friendly Name |
|----------------------|---------------|
| Domestic Waste Collection Service | Grey bin |
| Recycling Collection Service | Red bin |
| Food Waste Collection Service | Food waste |

**Example Result**:
```javascript
[
  {
    date: "2026-02-06",
    service: "Recycling Collection Service", // Will be mapped to "Red bin"
    day: "Thursday"
  },
  {
    date: "2026-02-06",
    service: "Food Waste Collection Service", // Will be mapped to "Food waste"
    day: "Thursday"
  }
]
```

---

### Step 4: Query Today's Events from Database

**Purpose**: Get user-created events for today

**Database Query**:
```javascript
const today = new Date().toISOString().split('T')[0]; // "2026-02-05"
const events = await dynamoDbService.getEventsByDate(today);
```

**Example Result**:
```javascript
[
  {
    date: "2026-02-05",
    id: "a3f8b2c1-5e4d-4a9b-8c6d-1234567890ab",
    event: "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes",
    created_at: "2026-02-03T10:30:00.123Z",
    ttl: 1746316800
  }
]
```

---

### Step 5: Format Display Data

**Purpose**: Format data to fit Quote/0 display constraints

**Display Constraints**:
- **Title**: 25 characters max (today's date)
- **Signature**: 29 characters max (tomorrow's bin reminder)
- **Message**: 3 lines × 27 characters (today's events)

**Formatting Logic**:

**Title**:
```javascript
const title = new Date().toISOString().split('T')[0].replace(/-/g, '/'); // "2026/02/05"
```

**Signature**:
```javascript
const binNames = binCollections.map(bc => friendlyName(bc.service)); // ["Red bin", "Food waste"]
const signature = `collect ${binNames.join(', ')} tmr`; // "collect Red bin, Food waste tmr"
```

**Message**:
```javascript
const message = events.map(e => e.event).join('\n').substring(0, 84); // Max 84 chars (3×27 + 3 line breaks)
```

**Formatted Display Data**:
```json
{
  "refreshNow": false,
  "title": "2026/02/05",
  "signature": "collect Red bin, Food waste tmr",
  "message": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}
```

---

### Step 6: Push to Quote/0 Device

**Purpose**: Send formatted display to Quote/0 via official Text API

**API Call**:
```javascript
await quote0ClientService.updateDisplay(displayData);
```

**HTTP Request**:
```http
POST {QUOTE0_TEXT_API}
Content-Type: application/json

{
  "refreshNow": false,
  "title": "2026/02/05",
  "signature": "collect Red bin, Food waste tmr",
  "message": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}
```

**Success**: Quote/0 device displays updated information

---

## Implementation (AWS Lambda)

### serverless.yml Configuration

```yaml
functions:
  scheduledUpdate:
    handler: src/lambda/handlers.scheduledUpdate
    description: Fetch bin collections, store in DB, and push to Quote/0
    timeout: 60
    events:
      - schedule:
          name: ${self:service}-${self:provider.stage}-schedule-0110
          description: Daily bin collection sync and Quote/0 update at 01:10 UTC
          rate: cron(10 1 * * ? *)
          enabled: true
```

### Lambda Handler

```javascript
// src/lambda/handlers.js

exports.scheduledUpdate = async (event) => {
  console.log('Scheduled update triggered');
  
  try {
    const result = await scheduledUpdateService.executeUpdate();
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Scheduled update failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Scheduled update failed',
        message: error.message
      })
    };
  }
};
```

### Service Implementation

```javascript
// src/services/scheduledUpdateService.js

class ScheduledUpdateService {
  async executeUpdate() {
    console.log('Starting scheduled update...');
    
    // Step 1: Fetch bin collections from Reading API
    const apiCollections = await binCollectionService.fetchBinCollections();
    console.log(`Fetched ${apiCollections.length} collections`);
    
    // Step 2: Store in DynamoDB
    const storedCount = await binCollectionDbService.storeBinCollections(apiCollections);
    console.log(`Stored ${storedCount} collections`);
    
    // Step 3: Query tomorrow's bins
    const tomorrowCollections = await binCollectionDbService.getTomorrowCollections();
    console.log(`Found ${tomorrowCollections.length} collections for tomorrow`);
    
    // Step 4: Query today's events
    const today = new Date().toISOString().split('T')[0];
    const events = await dynamoDbService.getEventsByDate(today);
    console.log(`Found ${events.length} events for today`);
    
    // Step 5: Format display
    const displayData = displayFormatterService.formatDisplayFromDb(events, tomorrowCollections);
    
    // Step 6: Push to Quote/0
    await quote0ClientService.updateDisplay(displayData);
    console.log('Quote/0 updated successfully');
    
    return {
      success: true,
      timestamp: new Date().toISOString(),
      binCollectionsFetched: apiCollections.length,
      binCollectionsStored: storedCount,
      tomorrowCollections: tomorrowCollections.length,
      events: events.length
    };
  }
}

module.exports = new ScheduledUpdateService();
```

---

## Error Handling

### Bin Collection API Failure

**Scenario**: Reading Council API is down or times out

**Strategy**:
1. **Log error** but don't fail the entire update
2. **Use cached data** from DynamoDB (previous fetch)
3. **Continue** with empty bin signature if no data available
4. Quote/0 will still display events

```javascript
try {
  const collections = await binCollectionService.fetchBinCollections();
  await binCollectionDbService.storeBinCollections(collections);
} catch (error) {
  console.error('Failed to fetch bin collections:', error.message);
  console.log('Continuing with existing database data...');
}
```

### Database Connection Failure

**Scenario**: Cannot connect to DynamoDB

**Strategy**:
1. **Retry** once after 2-second delay
2. **Fail the update** if still unsuccessful
3. **Log critical error** for monitoring
4. Next scheduled run will retry

```javascript
try {
  const events = await dynamoDbService.getEventsByDate(today);
} catch (error) {
  console.error('Database query failed:', error);
  throw new Error('Cannot retrieve events from database');
}
```

### Quote/0 Device Unreachable

**Scenario**: Cannot reach Quote/0 Text API

**Strategy**:
1. **Retry** 3 times with exponential backoff (1s, 2s, 4s)
2. **Log warning** if all retries fail
3. **Continue** - device state unchanged until next update

```javascript
try {
  await quote0ClientService.updateDisplay(displayData);
} catch (error) {
  console.error('Failed to update Quote/0:', error.message);
  // Don't throw - update was prepared correctly, just delivery failed
}
```

---

## Monitoring & Logging

### CloudWatch Logs

**Log Group**: `/aws/lambda/quote0-api-dev-scheduledUpdate`

**Successful Update**:
```
2026-02-05T01:10:00.123Z  Starting scheduled update...
2026-02-05T01:10:00.456Z  Fetched 9 collections from Reading API
2026-02-05T01:10:01.234Z  Stored 9 bin collections in DynamoDB
2026-02-05T01:10:01.567Z  Found 2 bin collections for tomorrow
2026-02-05T01:10:01.890Z  Found 3 events for today
2026-02-05T01:10:02.123Z  Display data formatted
2026-02-05T01:10:02.456Z  Quote/0 updated successfully
2026-02-05T01:10:02.789Z  Update completed in 2666ms
```

**Failed Update (with recovery)**:
```
2026-02-05T01:10:00.123Z  Starting scheduled update...
2026-02-05T01:10:00.456Z  Failed to fetch bin collections: ETIMEDOUT
2026-02-05T01:10:00.789Z  Continuing with existing database data...
2026-02-05T01:10:01.012Z  Found 2 bin collections for tomorrow
2026-02-05T01:10:01.345Z  Found 3 events for today
2026-02-05T01:10:01.678Z  Quote/0 updated successfully
```

### Metrics to Track

- **Execution Duration**: Time to complete full update cycle
- **API Success Rate**: % of successful Reading API calls
- **Database Writes**: Number of bin collections stored
- **Quote/0 Delivery**: Success rate of Quote/0 pushes

### CloudWatch Alarms

**Critical Alerts**:
- Lambda function errors (3 consecutive failures)
- Database connection failures
- Quote/0 delivery failures (3 consecutive)

---

## Testing

### Manual Trigger

**Invoke Lambda Manually**:
```bash
aws lambda invoke \
  --function-name quote0-api-dev-scheduledUpdate \
  --payload '{}' \
  response.json

cat response.json
```

**View Logs**:
```bash
serverless logs -f scheduledUpdate --tail
```

### Test Locally

```bash
# Using serverless-offline
npm start

# In another terminal, trigger the scheduled function
curl -X POST http://localhost:3000/test/scheduled-update
```

---

For implementation details, see [04-implementation.md](./04-implementation.md).  
For deployment configuration, see [05-deployment.md](./05-deployment.md).
