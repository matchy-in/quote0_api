# System Architecture

## Overview

Quote0 API is a lightweight microservice designed to aggregate and display daily events on a Quote/0 reminder device, with automatic integration of bin collection schedules.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    Quote0 Microservice                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         Scheduled Service (Cron)                       │    │
│  │         Triggers: 01:10, 07:10, 12:10, 17:10          │    │
│  │                                                        │    │
│  │  1. Fetch bin collections                             │    │
│  │  2. Query today's events                              │    │
│  │  3. Format display data                               │    │
│  │  4. Push to Quote/0 device                            │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         GET /api/display                               │    │
│  │         (Quote/0 hourly pull)                          │    │
│  │                                                        │    │
│  │  1. Fetch bin collections                             │    │
│  │  2. Query today's events                              │    │
│  │  3. Format and return display JSON                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         PUT /api/events                                │    │
│  │         (iPhone app event creation)                    │    │
│  │                                                        │    │
│  │  1. Validate input                                    │    │
│  │  2. Insert to database                                │    │
│  │  3. Return success                                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         Core Services                                  │    │
│  │                                                        │    │
│  │  ┌──────────────────────────────────────────────┐     │    │
│  │  │  Bin Collection Service                      │     │    │
│  │  │  - Fetch from Reading Council API            │     │    │
│  │  │  - Filter for tomorrow's collections         │     │    │
│  │  │  - Map service names to friendly format      │     │    │
│  │  │  - Cache for 12 hours                        │     │    │
│  │  └──────────────────────────────────────────────┘     │    │
│  │                                                        │    │
│  │  ┌──────────────────────────────────────────────┐     │    │
│  │  │  Event Service                               │     │    │
│  │  │  - Query events for specific date            │     │    │
│  │  │  - Create new events                         │     │    │
│  │  │  - Format events for display                 │     │    │
│  │  └──────────────────────────────────────────────┘     │    │
│  │                                                        │    │
│  │  ┌──────────────────────────────────────────────┐     │    │
│  │  │  Display Formatter                           │     │    │
│  │  │  - Format title (date)                       │     │    │
│  │  │  - Format message (3 lines, 29 chars each)   │     │    │
│  │  │  - Format signature (bin reminder)           │     │    │
│  │  │  - Enforce character limits                  │     │    │
│  │  └──────────────────────────────────────────────┘     │    │
│  │                                                        │    │
│  │  ┌──────────────────────────────────────────────┐     │    │
│  │  │  Quote/0 Client                              │     │    │
│  │  │  - Send formatted data to Quote/0 text API   │     │    │
│  │  │  - Handle errors and retries                 │     │    │
│  │  └──────────────────────────────────────────────┘     │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         Database (Events)                              │    │
│  │         Table: events                                  │    │
│  │         Fields: id, date, event, created_at            │    │
│  └────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                           │
                           │ External APIs
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌────────────────────┐              ┌────────────────────┐
│ Reading Council    │              │ Quote/0 Device     │
│ Bin Collection API │              │ Text API           │
│                    │              │                    │
│ GET /collections/  │              │ POST /text-api     │
│     {uprn}         │              │                    │
└────────────────────┘              └────────────────────┘
```

## Components

### 1. Scheduled Service (Cron Job)

**Purpose**: Proactively push updates to Quote/0 at specific times daily.

**Trigger Times**:
- 01:10 AM
- 07:10 AM
- 12:10 PM
- 17:10 PM

**Process Flow**:
```
1. Triggered by cron scheduler
2. Fetch bin collection data from Reading Council API
3. Filter for tomorrow's bin collections
4. Query database for today's events
5. Format display data (title, message, signature)
6. Send POST request to Quote/0 text API
7. Log success/failure
```

**Implementation**: 
- AWS EventBridge (for Lambda)
- Node-cron (for traditional server)
- System cron (for Linux server)

### 2. GET /api/display Endpoint

**Purpose**: Allow Quote/0 to pull current display data on demand (hourly).

**Use Case**: Backup mechanism if scheduled push fails, or for manual refresh.

**Process Flow**:
```
1. Quote/0 sends GET request
2. Fetch bin collection data (cached if available)
3. Query database for today's events
4. Format and return display JSON
5. Quote/0 receives and displays data
```

**Response Time**: < 500ms (typical)

### 3. PUT /api/events Endpoint

**Purpose**: Allow iPhone app to create new events.

**Process Flow**:
```
1. iPhone app sends PUT request with date and event
2. Validate input:
   - date format (YYYY/MM/DD or YYYY-MM-DD)
   - event text (not empty, reasonable length)
3. Insert record to database
4. Return success response
```

**Response**: 201 Created (success) or 400/422 (validation error)

### 4. Bin Collection Service

**Responsibilities**:
- Fetch bin collection schedule from Reading Council API
- Filter for tomorrow's collections
- Map service names to user-friendly format
- Cache results to minimize API calls

**Caching Strategy**:
- Cache duration: 12 hours
- Cache key: `bin_collections:{uprn}:{date}`
- Invalidation: Automatic after TTL

**Service Mapping**:
```javascript
{
  'Domestic Waste Collection Service': 'Grey bin',
  'Recycling Collection Service': 'Red bin',
  'Food Waste Collection Service': 'Food waste'
}
```

### 5. Event Service

**Responsibilities**:
- Query events for specific date
- Create new events
- Validate event data
- Format events for display

**DynamoDB Table Schema**:
```
Table Name: quote0-api-{stage}-events
Partition Key: date (String, YYYY-MM-DD)
Sort Key: id (String, UUID)
Attributes:
  - event (String): Event description
  - created_at (String): ISO 8601 timestamp
  - ttl (Number): Unix timestamp for auto-deletion (90 days)
Billing Mode: PAY_PER_REQUEST (on-demand)
```

### 6. Display Formatter

**Responsibilities**:
- Format data to match Quote/0 display constraints
- Enforce character limits
- Handle line breaks
- Generate bin collection signature

**Display Constraints**:
- Title: 25 characters (date: "YYYY/MM/DD" = 10 chars)
- Message: 3 lines × 29 characters = 87 characters total
- Signature: 29 characters (bin reminder)

**Formatting Logic**:
```
Title:     "2026/02/10"
Message:   "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
Signature: "collect Food waste, Red bin tmr"
```

### 7. Quote/0 Client

**Responsibilities**:
- Send formatted display data to Quote/0 text API
- Handle connection errors
- Retry logic for failed requests
- Logging

**Quote/0 Text API Format**:
```json
{
  "refreshNow": false,
  "title": "2026/02/10",
  "signature": "collect Food waste, Red bin tmr",
  "message": "Line 1\nLine 2\nLine 3"
}
```

## Data Flow

### Scheduled Update Flow

```
Cron Trigger (e.g., 07:10)
    ↓
Scheduled Service Handler
    ↓
    ├─→ Bin Collection Service
    │       ↓
    │   Reading Council API
    │       ↓
    │   [Filter tomorrow's collections]
    │       ↓
    │   [Map service names]
    │       ↓
    │   Return: ["Red bin", "Food waste"]
    │
    └─→ Event Service
            ↓
        Database Query (WHERE date = TODAY)
            ↓
        Return: [event1, event2, ...]
            ↓
Display Formatter
    ↓
    [Generate title: "2026/02/10"]
    [Generate message: event1\nevent2\nevent3]
    [Generate signature: "collect Red bin, Food waste tmr"]
    ↓
Quote/0 Client
    ↓
POST to Quote/0 Text API
    ↓
Quote/0 Device Display Updated
```

### On-Demand Pull Flow (GET /api/display)

```
Quote/0 Device (hourly)
    ↓
GET /api/display
    ↓
API Handler
    ↓
    [Check cache for bin data]
    [Query today's events]
    ↓
Display Formatter
    ↓
Return JSON Response
    ↓
Quote/0 Device Displays Data
```

### Event Creation Flow (PUT /api/events)

```
iPhone App
    ↓
PUT /api/events
Body: { date: "2026/02/10", event: "Dentist 3pm" }
    ↓
Validation
    ↓
    [Validate date format]
    [Validate event not empty]
    [Check date is not in past]
    ↓
Insert to Database
    ↓
Return 201 Created
    ↓
iPhone App Shows Success
```

## Technology Stack

### Runtime
- **Node.js 18+** with AWS Lambda
- **Serverless Framework** for deployment

### Database
- **Amazon DynamoDB** (serverless, pay-per-request)
  - No connection management required
  - Auto-scaling and high availability
  - Perfect for key-value lookups by date

### Hosting
- **AWS Lambda** with EventBridge (serverless, recommended)
- **API Gateway HTTP API** for REST endpoints
- **DynamoDB** for data persistence

### External APIs
- **Reading Council API**: Public REST API (no auth required)
- **Quote/0 Text API**: Device-specific endpoint

### Scheduling
- **AWS EventBridge** (for Lambda)
- **node-cron** (for Node.js server)
- **APScheduler** (for Python server)
- **System cron** (for Linux server)

## Deployment Architecture

### AWS Lambda (Serverless Architecture)

```
┌─────────────────────────────────────────┐
│  AWS EventBridge Rules                  │
│  - 01:10 → Invoke Lambda                │
│  - 07:10 → Invoke Lambda                │
│  - 12:10 → Invoke Lambda                │
│  - 17:10 → Invoke Lambda                │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  AWS Lambda Functions                   │
│  - scheduledUpdate handler              │
│  - GET /api/display handler             │
│  - PUT /api/events handler              │
└─────────────────┬───────────────────────┘
                  │
                  ├─→ DynamoDB (Events Table)
                  │
                  └─→ External APIs
```

### Cost Comparison: Lambda vs Traditional Server

| Feature | AWS Lambda + DynamoDB | Traditional Server |
|---------|----------------------|-------------------|
| **Monthly Cost** | ~$1.18 | ~$5-50 |
| **Scaling** | Automatic | Manual |
| **Maintenance** | None | OS updates, security patches |
| **Database** | DynamoDB (managed) | Self-managed PostgreSQL |
| **Connection Mgmt** | Not needed | Connection pooling required |

## Scalability & Performance

### Current Scale
- **Users**: 1 household
- **Requests**: 
  - Scheduled: 4 updates/day
  - On-demand: ~24 requests/day (hourly)
  - Event creation: ~5 requests/day
- **Total**: ~35 requests/day

### Performance Targets
- GET /api/display: < 500ms response time
- PUT /api/events: < 200ms response time
- Scheduled update: Complete within 30 seconds
- Uptime: 99.9%

### Optimization Strategies
1. **Caching**: Cache bin collection data (12 hours)
2. **Database Indexing**: Index on date column
3. **Connection Pooling**: Reuse database connections
4. **Timeout Handling**: 5-second timeout for external APIs

## Error Handling

### Bin Collection API Failure
- **Strategy**: Use cached data if available
- **Fallback**: Skip bin signature if no data available
- **Logging**: Log error for investigation
- **User Impact**: Minimal (signature just won't show)

### Database Failure
- **Strategy**: Retry once after 1 second delay
- **Fallback**: Return error response
- **Logging**: Critical error alert
- **User Impact**: No display update (retry at next schedule)

### Quote/0 Device Unreachable
- **Strategy**: Retry 3 times with exponential backoff
- **Fallback**: Log failure, wait for next schedule/pull
- **Logging**: Warning level log
- **User Impact**: Device shows stale data until next successful update

## Security Considerations

### API Security
- **Rate Limiting**: 100 requests/hour per IP (for PUT endpoint)
- **Input Validation**: Strict validation on all inputs
- **SQL Injection Prevention**: Use parameterized queries
- **HTTPS**: All API calls over HTTPS

### Database Security
- **Access Control**: Database user has minimal required permissions
- **Connection Security**: Encrypted connections (SSL/TLS)
- **Backups**: Daily automated backups

### Secrets Management
- **Environment Variables**: Store sensitive config in .env
- **AWS Secrets Manager**: For Lambda deployment
- **No Hardcoded Secrets**: Never commit credentials to repo

---

For API details, see [02-api-reference.md](./02-api-reference.md).  
For scheduled service implementation, see [03-scheduled-service.md](./03-scheduled-service.md).
