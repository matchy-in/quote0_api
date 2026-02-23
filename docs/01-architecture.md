# System Architecture

## Overview

Quote0 API is a lightweight serverless microservice designed to aggregate and display daily events on a Quote/0 reminder device, with automatic integration of bin collection schedules. It uses a **push-only** architecture where Lambda functions actively push updates to the Quote/0 device.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    Quote0 Microservice (AWS)                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │         Scheduled Service (EventBridge Cron)           │     │
│  │         Trigger: 01:10 UTC daily                       │     │
│  │                                                        │     │
│  │  1. Fetch bin collections from Reading API             │     │
│  │  2. Store in DynamoDB bin_collection table              │     │
│  │  3. Query tomorrow's bins from DB                      │     │
│  │  4. Query today's events from DB                       │     │
│  │  5. Format display data                                │     │
│  │  6. Push to Quote/0 device                             │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │         POST /api/events                               │     │
│  │         Authorization: Bearer <API_AUTH_TOKEN>          │     │
│  │         (iPhone app / PC - single event creation)      │     │
│  │                                                        │     │
│  │  1. Authorize request                                  │     │
│  │  2. Upsert event to DynamoDB                           │     │
│  │  3. Query bins + events, format, push to Quote/0       │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │         POST /api/events/batch                         │     │
│  │         Authorization: Bearer <API_AUTH_TOKEN>          │     │
│  │         (iPhone app / PC - batch event creation)       │     │
│  │                                                        │     │
│  │  1. Authorize request                                  │     │
│  │  2. Validate and upsert all events to DynamoDB         │     │
│  │  3. Query bins + events, format, push to Quote/0       │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │         Core Services                                  │     │
│  │                                                        │     │
│  │  ┌──────────────────────────────────────────────┐     │     │
│  │  │  Bin Collection Service                      │     │     │
│  │  │  - Fetch from Reading Council API            │     │     │
│  │  │  - Filter for tomorrow's collections         │     │     │
│  │  │  - Map service names to friendly format      │     │     │
│  │  └──────────────────────────────────────────────┘     │     │
│  │                                                        │     │
│  │  ┌──────────────────────────────────────────────┐     │     │
│  │  │  Bin Collection DB Service                   │     │     │
│  │  │  - Store collections in DynamoDB             │     │     │
│  │  │  - Query by date                             │     │     │
│  │  │  - Get tomorrow's collections                │     │     │
│  │  └──────────────────────────────────────────────┘     │     │
│  │                                                        │     │
│  │  ┌──────────────────────────────────────────────┐     │     │
│  │  │  DynamoDB Service (Events)                   │     │     │
│  │  │  - Query events for specific date            │     │     │
│  │  │  - Create / update / upsert events           │     │     │
│  │  │  - Batch event creation                      │     │     │
│  │  └──────────────────────────────────────────────┘     │     │
│  │                                                        │     │
│  │  ┌──────────────────────────────────────────────┐     │     │
│  │  │  Display Formatter                           │     │     │
│  │  │  - Format date header                        │     │     │
│  │  │  - Format message (events + bins)            │     │     │
│  │  │  - Enforce character limits                  │     │     │
│  │  │  - Sanitize special characters               │     │     │
│  │  └──────────────────────────────────────────────┘     │     │
│  │                                                        │     │
│  │  ┌──────────────────────────────────────────────┐     │     │
│  │  │  Quote/0 Client                              │     │     │
│  │  │  - Send formatted data to Quote/0 text API   │     │     │
│  │  │  - Bearer token authentication               │     │     │
│  │  │  - Handle errors and retries                 │     │     │
│  │  └──────────────────────────────────────────────┘     │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │         DynamoDB Tables                                │     │
│  │                                                        │     │
│  │  events:                                               │     │
│  │    PK: date (YYYY-MM-DD), SK: id (UUID)               │     │
│  │    Fields: event, created_at, updated_at, ttl          │     │
│  │                                                        │     │
│  │  bin_collection:                                       │     │
│  │    PK: date (YYYY-MM-DD), SK: service                 │     │
│  │    Fields: day, round, schedule, updated_at, ttl       │     │
│  └────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
                           │
                           │ External APIs
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        v                                     v
┌────────────────────┐              ┌────────────────────┐
│ Reading Council    │              │ Quote/0 Device     │
│ Bin Collection API │              │ Text API           │
│                    │              │                    │
│ GET /collections/  │              │ POST /text         │
│     {uprn}         │              │ (Bearer auth)      │
└────────────────────┘              └────────────────────┘
```

## Components

### 1. Scheduled Service (EventBridge Cron)

**Purpose**: Proactively push updates to Quote/0 daily.

**Trigger Time**: 01:10 UTC daily

**Process Flow**:
```
1. Triggered by EventBridge cron
2. Fetch bin collection data from Reading Council API
3. Store collections in DynamoDB bin_collection table
4. Query tomorrow's bin collections from DB
5. Query database for today's events
6. Format display data
7. Send POST request to Quote/0 Text API (with Bearer token)
8. Log success/failure
```

**Implementation**: AWS EventBridge with Lambda

### 2. POST /api/events Endpoint

**Purpose**: Allow iPhone app or PC to create events, with immediate Quote/0 update.

**Authorization**: `Authorization: Bearer <API_AUTH_TOKEN>` header required.

**Process Flow**:
```
1. Validate Authorization header
2. Parse and validate request body
3. Upsert event to DynamoDB (update if exists for date, create if new)
4. Query tomorrow's bins from DB
5. Query today's events from DB
6. Format and push display data to Quote/0
7. Return created event with quote0_updated status
```

**Response**: 201 Created (success), 401 (no auth), 403 (bad token), 400/422 (validation error)

### 3. POST /api/events/batch Endpoint

**Purpose**: Create multiple events (up to 100) in a single API call.

**Authorization**: `Authorization: Bearer <API_AUTH_TOKEN>` header required.

**Process Flow**:
```
1. Validate Authorization header
2. Parse and validate all events in batch
3. Upsert each event to DynamoDB
4. Query tomorrow's bins from DB
5. Query today's events from DB
6. Format and push display data to Quote/0
7. Return batch results with succeeded/failed counts
```

**Response**: 201 (all success), 207 (partial), 401 (no auth), 403 (bad token), 400/422 (validation)

### 4. Bin Collection Service

**Responsibilities**:
- Fetch bin collection schedule from Reading Council API
- Return raw collection data for storage

### 5. Bin Collection DB Service

**Responsibilities**:
- Store bin collections in DynamoDB `bin_collection` table
- Query collections by date
- Get tomorrow's collections with friendly name mapping

**Service Mapping**:
```javascript
{
  'Domestic Waste Collection Service': 'Grey bin',
  'Recycling Collection Service': 'Red bin',
  'Food Waste Collection Service': 'Food waste'
}
```

### 6. DynamoDB Service (Events)

**Responsibilities**:
- Query events for specific date
- Create, update, and upsert events
- Batch event creation
- Health check

**Events Table Schema**:
```
Table Name: quote0-api-{stage}-events
Partition Key: date (String, YYYY-MM-DD)
Sort Key: id (String, UUID)
Attributes:
  - event (String): Event description
  - created_at (String): ISO 8601 timestamp
  - updated_at (String): ISO 8601 timestamp (if updated)
  - ttl (Number): Unix timestamp for auto-deletion (90 days)
Billing Mode: PAY_PER_REQUEST (on-demand)
```

### 7. Display Formatter

**Responsibilities**:
- Format data to match Quote/0 display constraints
- Combine bin collection reminders and events into message
- Enforce character limits
- Sanitize special characters (e.g., `&` -> `+`)

### 8. Quote/0 Client

**Responsibilities**:
- Send formatted display data to Quote/0 Text API
- Include `Authorization: Bearer <QUOTE0_AUTH_TOKEN>` header
- Handle connection errors
- Retry logic for failed requests

## Data Flow

### Scheduled Update Flow

```
EventBridge Trigger (01:10 UTC)
    |
Scheduled Service Handler
    |
    +--> Bin Collection Service
    |       |
    |   Reading Council API
    |       |
    |   [Fetch all upcoming collections]
    |       |
    +--> Bin Collection DB Service
    |       |
    |   [Store in DynamoDB bin_collection table]
    |       |
    |   [Query tomorrow's collections]
    |       |
    |   Return: [{service: "Red bin"}, {service: "Food waste"}]
    |
    +--> DynamoDB Service
            |
        Query events WHERE date = TODAY
            |
        Return: [event1, event2, ...]
            |
Display Formatter
    |
    [Generate date: "2026/02/10"]
    [Generate message: "collect Red bin tmr\nevent1\nevent2"]
    |
Quote/0 Client (with Bearer auth)
    |
POST to Quote/0 Text API
    |
Quote/0 Device Display Updated
```

### Event Creation Flow (POST /api/events)

```
iPhone App / PC
    |
POST /api/events
Headers: Authorization: Bearer <API_AUTH_TOKEN>
Body: { date: "2026/02/10", event: "Dentist 3pm" }
    |
Authorization Check
    |
    [Validate Bearer token]
    |
Validation
    |
    [Validate date format]
    [Validate event text length]
    |
Upsert to DynamoDB
    |
    [Update if event exists for date, create if new]
    |
Query bins + events, format, push to Quote/0
    |
Return 201 Created with quote0_updated: true
```

## Technology Stack

### Runtime
- **Node.js 18** with AWS Lambda
- **Serverless Framework v3** for deployment and infrastructure

### Database
- **Amazon DynamoDB** (serverless, pay-per-request)
  - `events` table: User-created events
  - `bin_collection` table: Bin collection schedules
  - Auto-scaling and high availability
  - TTL for automatic data cleanup (90 days)

### API
- **AWS API Gateway HTTP API** for REST endpoints
- **Bearer token authorization** on all HTTP endpoints

### Scheduling
- **AWS EventBridge** for cron-based scheduling (01:10 UTC daily)

### External APIs
- **Reading Council API**: Public REST API (no auth required)
- **Quote/0 Text API**: Device-specific endpoint (Bearer auth required)

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│  AWS EventBridge Rule                   │
│  - 01:10 UTC -> Invoke Lambda           │
└─────────────────┬───────────────────────┘
                  │
                  v
┌─────────────────────────────────────────┐
│  AWS Lambda Functions                   │
│  - scheduledUpdate handler              │
│  - POST /api/events handler             │
│  - POST /api/events/batch handler       │
│  - POST /test/scheduled-update (dev)    │
│                                         │
│  Authorization: Bearer <API_AUTH_TOKEN>  │
│  (on HTTP endpoints only)               │
└─────────────────┬───────────────────────┘
                  │
                  ├--> DynamoDB (events table)
                  ├--> DynamoDB (bin_collection table)
                  └--> External APIs (Reading Council, Quote/0)
```

## Scalability & Performance

### Current Scale
- **Users**: 1 household
- **Requests**:
  - Scheduled: 1 update/day
  - Event creation: ~5-10 requests/day
- **Total**: ~10-15 requests/day

### Performance Targets
- POST /api/events: < 2s response time (includes Quote/0 push)
- POST /api/events/batch: < 5s response time
- Scheduled update: Complete within 60 seconds

## Error Handling

### Bin Collection API Failure
- **Strategy**: Use cached data from DynamoDB (previous fetch)
- **Fallback**: Skip bin signature if no data available
- **User Impact**: Minimal (signature just won't show)

### Database Failure
- **Strategy**: Return error response
- **Logging**: Critical error alert
- **User Impact**: No display update (retry at next schedule)

### Quote/0 Device Unreachable
- **Strategy**: Retry 3 times with exponential backoff
- **Fallback**: Log failure, wait for next schedule
- **User Impact**: Device shows stale data until next successful update

## Security

### API Authorization
- **Bearer Token**: All HTTP endpoints require `Authorization: Bearer <API_AUTH_TOKEN>`
- **401 Unauthorized**: Missing Authorization header
- **403 Forbidden**: Invalid token
- **Scheduled triggers**: No auth needed (internal EventBridge)
- **Local dev**: Auth skipped if `API_AUTH_TOKEN` is empty

### Outbound Authentication
- **Quote/0 Text API**: `Authorization: Bearer <QUOTE0_AUTH_TOKEN>`

### Infrastructure Security
- **IAM roles**: Minimal required permissions for Lambda
- **DynamoDB**: Encryption at rest
- **HTTPS**: All API Gateway traffic over HTTPS
- **Secrets**: Environment variables, never hardcoded

---

For API details, see [02-api-reference.md](./02-api-reference.md).
For scheduled service implementation, see [03-scheduled-service.md](./03-scheduled-service.md).
