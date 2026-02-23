# Implementation Guide

## Overview

This guide covers the implementation details of the Quote0 API serverless microservice, built with AWS Lambda, DynamoDB, and the Serverless Framework.

---

## Prerequisites

- **Node.js 18+** installed
- **AWS Account** with CLI configured
- **Serverless Framework** installed globally (`npm install -g serverless`)
- **Git** for version control

---

## Project Structure

```
quote0_api/
├── serverless.yml                    # AWS infrastructure definition
├── package.json                      # Dependencies and npm scripts
├── .env                              # Environment variables (not committed)
├── .gitignore                        # Git ignore rules
├── src/
│   ├── lambda/
│   │   └── handlers.js               # Lambda handlers with auth
│   └── services/
│       ├── dynamoDbService.js         # DynamoDB operations (events)
│       ├── binCollectionDbService.js   # DynamoDB operations (bin collections)
│       ├── binCollectionService.js     # Reading Council API client
│       ├── displayFormatterService.js  # Quote/0 display formatting
│       ├── quote0ClientService.js      # Quote/0 device API client
│       └── scheduledUpdateService.js   # Scheduled update orchestration
├── docs/                              # Documentation
└── node_modules/                      # Dependencies (not committed)
```

---

## Step 1: Project Setup

```bash
# Navigate to project
cd quote0_api

# Install dependencies
npm install
```

### Dependencies

**Production:**
- `@aws-sdk/client-dynamodb` - DynamoDB client (v3)
- `@aws-sdk/lib-dynamodb` - Document client wrapper
- `axios` - HTTP client for external APIs
- `uuid` - Unique ID generation

**Development:**
- `dotenv` - Environment variable management
- `serverless-offline` - Local development server

---

## Step 2: Environment Configuration

Create a `.env` file in the project root:

```bash
# Reading Council UPRN
UPRN=310022781

# Quote/0 Device API
QUOTE0_TEXT_API=https://dot.mindreset.tech/api/authV2/open/device/YOUR_DEVICE_ID/text
QUOTE0_AUTH_TOKEN=your_quote0_bearer_token

# API Authorization (protects your endpoints)
API_AUTH_TOKEN=your-secret-api-key

# Reading Council API
READING_API_URL=https://api.reading.gov.uk/api/collections
READING_API_TIMEOUT=5000
CACHE_TTL_HOURS=12
```

---

## Step 3: Infrastructure (serverless.yml)

The `serverless.yml` file defines all AWS resources:

### Lambda Functions

| Function | Handler | Trigger | Auth |
|----------|---------|---------|------|
| `createEvent` | `src/lambda/handlers.createEvent` | POST /api/events | Bearer token |
| `createEventsBatch` | `src/lambda/handlers.createEventsBatch` | POST /api/events/batch | Bearer token |
| `scheduledUpdate` | `src/lambda/handlers.scheduledUpdate` | EventBridge cron (01:10 UTC) | None (internal) |
| `testScheduledUpdate` | `src/lambda/handlers.scheduledUpdate` | POST /test/scheduled-update | Bearer token |

### DynamoDB Tables

**Events Table:**
- Partition Key: `date` (String, YYYY-MM-DD)
- Sort Key: `id` (String, UUID)
- TTL: `ttl` attribute (auto-delete after 90 days)

**Bin Collection Table:**
- Partition Key: `date` (String, YYYY-MM-DD)
- Sort Key: `service` (String, service name)
- TTL: `ttl` attribute (auto-delete after 90 days)

### EventBridge Schedule
- 01:10 UTC daily: `cron(10 1 * * ? *)`

---

## Step 4: Lambda Handlers (src/lambda/handlers.js)

The handlers file contains:

1. **`authorize(event)`** - Validates Bearer token from Authorization header
2. **`createEvent(event)`** - Creates/upserts a single event, then pushes to Quote/0
3. **`createEventsBatch(event)`** - Creates multiple events in batch, then pushes to Quote/0
4. **`scheduledUpdate(event)`** - Daily scheduled sync of bins and display push

### Authorization Flow

```
Request arrives
    |
    v
authorize(event)
    |
    +--> No API_AUTH_TOKEN set? -> Skip auth (local dev)
    |
    +--> No Authorization header? -> Return 401
    |
    +--> Extract token from "Bearer <token>"
    |
    +--> Token matches API_AUTH_TOKEN? -> Continue
    |
    +--> Token doesn't match? -> Return 403
```

---

## Step 5: Service Layer

### DynamoDB Service (dynamoDbService.js)

Handles all event operations:

| Method | Description |
|--------|-------------|
| `getEventsByDate(date)` | Query events for a specific date |
| `createEvent(date, eventText)` | Create a new event with UUID |
| `updateEvent(date, id, eventText)` | Update an existing event |
| `upsertEvent(date, eventText)` | Update if exists, create if not |
| `createEventsBatch(events)` | Create multiple events sequentially |
| `healthCheck()` | Verify DynamoDB connection |

### Bin Collection DB Service (binCollectionDbService.js)

Handles bin collection storage:

| Method | Description |
|--------|-------------|
| `storeBinCollections(collections)` | Upsert collections from Reading API |
| `getBinCollectionsByDate(date)` | Query collections for a date |
| `getTomorrowCollections()` | Get tomorrow's collections |

### Bin Collection Service (binCollectionService.js)

Fetches data from Reading Council API:

| Method | Description |
|--------|-------------|
| `fetchBinCollections()` | Fetch upcoming collections from API |

### Display Formatter Service (displayFormatterService.js)

Formats data for Quote/0 device:

| Method | Description |
|--------|-------------|
| `formatDisplayFromDb(events, binCollections)` | Format display data from DB objects |
| `sanitizeForQuote0(text)` | Replace unsupported characters |

### Quote/0 Client Service (quote0ClientService.js)

Pushes updates to Quote/0 device:

| Method | Description |
|--------|-------------|
| `updateDisplay(displayData)` | POST to Quote/0 Text API with Bearer auth |

### Scheduled Update Service (scheduledUpdateService.js)

Orchestrates the daily update:

| Method | Description |
|--------|-------------|
| `executeUpdate()` | Run full update cycle (fetch, store, format, push) |

---

## Step 6: Local Development

### Run Locally with serverless-offline

```bash
# Start local server
npm start
# or
npm run offline
```

This starts a local API Gateway at `http://localhost:3000`.

### Test Endpoints Locally

```bash
# Create event (include auth header if API_AUTH_TOKEN is set in .env)
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{"date":"2026/02/10","event":"Test event"}'

# Create batch events
curl -X POST http://localhost:3000/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{
    "events": [
      {"date":"2026/02/10","event":"Test 1"},
      {"date":"2026/02/11","event":"Test 2"}
    ]
  }'

# Trigger scheduled update manually
curl -X POST http://localhost:3000/test/scheduled-update
```

### Test Scheduled Update Locally

```bash
node test-scheduled-update.js
```

---

## Step 7: npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `start` | `serverless offline` | Start local dev server |
| `offline` | `serverless offline` | Start local dev server |
| `test:local` | `node test-scheduled-update.js` | Test scheduled update locally |
| `deploy:dev` | `serverless deploy --stage dev` | Deploy to dev |
| `deploy:prod` | `serverless deploy --stage prod` | Deploy to production |
| `logs` | `serverless logs --function scheduledUpdate --stage dev --tail` | Tail scheduled update logs |
| `logs:create` | `serverless logs --function createEvent --stage dev --tail` | Tail create event logs |
| `logs:batch` | `serverless logs --function createEventsBatch --stage dev --tail` | Tail batch event logs |
| `invoke` | `serverless invoke local --function scheduledUpdate` | Invoke scheduled update locally |
| `remove:dev` | `serverless remove --stage dev` | Remove dev deployment |
| `remove:prod` | `serverless remove --stage prod` | Remove prod deployment |

---

## Next Steps

1. **Deploy to AWS** - See [05-deployment.md](./05-deployment.md)
2. **Configure Quote/0 Device** - See [QUOTE0-SETUP.md](../QUOTE0-SETUP.md)
3. **Create Events** - Use POST /api/events or POST /api/events/batch
4. **Monitor Logs** - Check scheduled update execution

---

Your Quote0 API is ready for deployment!
