# Batch Events Creation Guide

## Overview

The **batch events endpoint** (`POST /api/events/batch`) allows you to create multiple events in a single API call, which is more efficient than calling `POST /api/events` multiple times.

## When to Use Batch vs Single

### Use `POST /api/events` (Single Event) When:
- Creating 1 event at a time
- Real-time event creation from UI
- Immediate user feedback needed per event

### Use `POST /api/events/batch` When:
- Importing multiple events at once
- Bulk event creation (e.g., weekly schedule)
- Reducing API calls for efficiency
- Creating 2-100 events in one operation

---

## Authorization

All requests to the batch endpoint require a Bearer token in the `Authorization` header:

```
Authorization: Bearer YOUR_API_AUTH_TOKEN
```

If the token is missing, the API returns **401 Unauthorized**. If the token is invalid, it returns **403 Forbidden**.

---

## Quick Example

### Request

```bash
curl -X POST https://your-api.com/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{
    "events": [
      {
        "date": "2026/02/10",
        "event": "AE Maths 3 upto page 63"
      },
      {
        "date": "2026/02/11",
        "event": "Doctor appointment 2pm"
      },
      {
        "date": "2026/02/12",
        "event": "School project due"
      }
    ]
  }'
```

### Response

```json
{
  "message": "Batch complete: 3/3 events created",
  "created": [
    {
      "date": "2026-02-10",
      "id": "a3f8b2c1-5e4d-4a9b-8c6d-1234567890ab",
      "event": "AE Maths 3 upto page 63",
      "created_at": "2026-02-05T10:30:00.123Z",
      "ttl": 1746316800
    },
    {
      "date": "2026-02-11",
      "id": "b4f9c3d2-6f5e-5b0c-9d7e-2345678901bc",
      "event": "Doctor appointment 2pm",
      "created_at": "2026-02-05T10:30:00.456Z",
      "ttl": 1746403200
    },
    {
      "date": "2026-02-12",
      "id": "c5g0d4e3-7g6f-6c1d-0e8f-3456789012cd",
      "event": "School project due",
      "created_at": "2026-02-05T10:30:00.789Z",
      "ttl": 1746489600
    }
  ],
  "errors": [],
  "succeeded": 3,
  "failed": 0,
  "total": 3,
  "quote0_updated": true
}
```

---

## Key Features

### ✅ Benefits

1. **Efficiency**: One API call instead of multiple
2. **Atomic Updates**: Quote/0 is updated once after all events are created
3. **Partial Success**: Some events can succeed even if others fail (207 status)
4. **Validation**: All events are validated before any are created
5. **Error Details**: Get specific error messages for each failed event

### 🛡️ Validation

Each event is validated for:
- ✓ Required fields (`date`, `event`)
- ✓ Date format (YYYY/MM/DD or YYYY-MM-DD)
- ✓ Event text length (max 84 characters)

### 📊 Response Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| **201** | Created | All events created successfully |
| **207** | Multi-Status | Some events succeeded, some failed |
| **400** | Bad Request | Invalid request format or empty array |
| **401** | Unauthorized | Missing Authorization header |
| **403** | Forbidden | Invalid API token |
| **422** | Unprocessable | Validation errors (all events failed validation) |
| **500** | Server Error | Internal error occurred |

---

## Usage Examples

### 1. JavaScript (Fetch API)

```javascript
async function createWeekEvents() {
  const events = [
    { date: '2026/02/10', event: 'Math homework p.63' },
    { date: '2026/02/11', event: 'Doctor 2pm' },
    { date: '2026/02/12', event: 'School project due' },
    { date: '2026/02/13', event: 'Soccer practice 4pm' },
    { date: '2026/02/14', event: 'Valentine\'s Day' }
  ];

  const response = await fetch('https://your-api.com/api/events/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_AUTH_TOKEN'
    },
    body: JSON.stringify({ events })
  });

  const result = await response.json();
  
  console.log(`✅ Created ${result.succeeded}/${result.total} events`);
  
  if (result.failed > 0) {
    console.warn(`⚠️ ${result.failed} events failed:`, result.errors);
  }
  
  return result;
}
```

### 2. Swift (iOS)

```swift
struct BatchEventRequest: Codable {
    let events: [EventItem]
}

struct EventItem: Codable {
    let date: String
    let event: String
}

func createWeekEvents() {
    let events = [
        EventItem(date: "2026/02/10", event: "Math homework p.63"),
        EventItem(date: "2026/02/11", event: "Doctor 2pm"),
        EventItem(date: "2026/02/12", event: "School project due"),
        EventItem(date: "2026/02/13", event: "Soccer practice 4pm"),
        EventItem(date: "2026/02/14", event: "Valentine's Day")
    ]
    
    let url = URL(string: "https://your-api.com/api/events/batch")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer YOUR_API_AUTH_TOKEN", forHTTPHeaderField: "Authorization")
    
    let batchRequest = BatchEventRequest(events: events)
    request.httpBody = try? JSONEncoder().encode(batchRequest)
    
    URLSession.shared.dataTask(with: request) { data, response, error in
        guard let data = data else { return }
        
        if let result = try? JSONDecoder().decode(BatchEventResponse.self, from: data) {
            print("✅ Created \(result.succeeded)/\(result.total) events")
            
            if result.failed > 0 {
                print("⚠️ \(result.failed) events failed")
                result.errors.forEach { error in
                    print("  - \(error.date): \(error.error)")
                }
            }
        }
    }.resume()
}
```

### 3. PowerShell

```powershell
# Create a week's worth of events
$events = @{
    events = @(
        @{ date = "2026/02/10"; event = "Math homework p.63" },
        @{ date = "2026/02/11"; event = "Doctor 2pm" },
        @{ date = "2026/02/12"; event = "School project due" },
        @{ date = "2026/02/13"; event = "Soccer practice 4pm" },
        @{ date = "2026/02/14"; event = "Valentine's Day" }
    )
}

$body = $events | ConvertTo-Json -Depth 3

$headers = @{
    "Authorization" = "Bearer YOUR_API_AUTH_TOKEN"
}

$response = Invoke-RestMethod `
    -Uri "https://your-api.com/api/events/batch" `
    -Method POST `
    -ContentType "application/json" `
    -Headers $headers `
    -Body $body

Write-Host "✅ Created $($response.succeeded)/$($response.total) events"
Write-Host "📟 Quote/0 updated: $($response.quote0_updated)"

if ($response.failed -gt 0) {
    Write-Host "⚠️ $($response.failed) events failed:"
    $response.errors | ForEach-Object {
        Write-Host "  - $($_.date): $($_.error)"
    }
}
```

### 4. Python (Requests)

```python
import requests

def create_week_events():
    events = {
        "events": [
            {"date": "2026/02/10", "event": "Math homework p.63"},
            {"date": "2026/02/11", "event": "Doctor 2pm"},
            {"date": "2026/02/12", "event": "School project due"},
            {"date": "2026/02/13", "event": "Soccer practice 4pm"},
            {"date": "2026/02/14", "event": "Valentine's Day"}
        ]
    }
    
    headers = {
        "Authorization": "Bearer YOUR_API_AUTH_TOKEN"
    }
    
    response = requests.post(
        "https://your-api.com/api/events/batch",
        json=events,
        headers=headers
    )
    
    result = response.json()
    
    print(f"✅ Created {result['succeeded']}/{result['total']} events")
    print(f"📟 Quote/0 updated: {result['quote0_updated']}")
    
    if result['failed'] > 0:
        print(f"⚠️ {result['failed']} events failed:")
        for error in result['errors']:
            print(f"  - {error['date']}: {error['error']}")
    
    return result

create_week_events()
```

---

## Partial Success Handling

The batch endpoint uses **207 Multi-Status** when some events succeed and others fail:

### Example Scenario

```json
{
  "events": [
    { "date": "2026/02/10", "event": "Valid event" },
    { "date": "invalid", "event": "Invalid date format" },
    { "date": "2026/02/12", "event": "Another valid event" }
  ]
}
```

### Response (207 Multi-Status)

```json
{
  "message": "Batch complete: 2/3 events created",
  "created": [
    {
      "date": "2026-02-10",
      "id": "...",
      "event": "Valid event",
      "created_at": "2026-02-05T10:30:00.123Z",
      "ttl": 1746316800
    },
    {
      "date": "2026-02-12",
      "id": "...",
      "event": "Another valid event",
      "created_at": "2026-02-05T10:30:00.456Z",
      "ttl": 1746489600
    }
  ],
  "errors": [
    {
      "date": "invalid",
      "event": "Invalid date format",
      "error": "ValidationException: Invalid date format"
    }
  ],
  "succeeded": 2,
  "failed": 1,
  "total": 3,
  "quote0_updated": true
}
```

### Handling in Code

```javascript
const result = await createEventsBatch(events);

// Check if any succeeded
if (result.succeeded > 0) {
  console.log(`✅ Successfully created ${result.succeeded} events`);
}

// Check if any failed
if (result.failed > 0) {
  console.warn(`⚠️ ${result.failed} events failed:`);
  result.errors.forEach(error => {
    console.error(`  - ${error.date}: ${error.error}`);
  });
}

// Check Quote/0 update
if (result.quote0_updated) {
  console.log('📟 Quote/0 device updated successfully');
}
```

---

## Limits and Constraints

| Limit | Value | Reason |
|-------|-------|--------|
| **Minimum events** | 1 | Must provide at least one event |
| **Maximum events** | 100 | Prevents overload and timeout |
| **Event text length** | 84 chars | Display constraint (3×27 chars) + 3 line break |
| **Timeout** | 90 seconds | Lambda function timeout |

---

## Error Scenarios

### 1. Empty Array

**Request:**
```json
{
  "events": []
}
```

**Response (400):**
```json
{
  "error": "Bad Request",
  "message": "events array cannot be empty"
}
```

### 2. Exceeding Batch Limit

**Request:**
```json
{
  "events": [ /* 101 events */ ]
}
```

**Response (400):**
```json
{
  "error": "Bad Request",
  "message": "Maximum 100 events per batch request"
}
```

### 3. Validation Errors

**Request:**
```json
{
  "events": [
    { "date": "2026/02/10" },  // Missing 'event'
    { "event": "No date" },     // Missing 'date'
    { "date": "invalid", "event": "Bad date" }
  ]
}
```

**Response (422):**
```json
{
  "error": "Unprocessable Entity",
  "message": "Validation errors in batch",
  "errors": [
    "Event 0: Missing required field 'event'",
    "Event 1: Missing required field 'date'",
    "Event 2: Invalid date format 'invalid'. Use YYYY/MM/DD or YYYY-MM-DD"
  ]
}
```

---

## Testing

### Local Testing

```bash
# Test batch endpoint locally
npm run offline

# In another terminal
curl -X POST http://localhost:3000/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{
    "events": [
      {"date": "2026/02/10", "event": "Test event 1"},
      {"date": "2026/02/11", "event": "Test event 2"}
    ]
  }'
```

### AWS Testing

```bash
# Deploy first
npm run deploy:dev

# Get your API endpoint from deployment output
# Then test
curl -X POST https://your-api-id.execute-api.us-east-1.amazonaws.com/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{
    "events": [
      {"date": "2026/02/10", "event": "Test event 1"},
      {"date": "2026/02/11", "event": "Test event 2"}
    ]
  }'
```

---

## Comparison: Single vs Batch

| Aspect | Single Event | Batch Events |
|--------|-------------|--------------|
| **Endpoint** | `POST /api/events` | `POST /api/events/batch` |
| **Events per call** | 1 | 1-100 |
| **API calls for 10 events** | 10 | 1 |
| **Quote/0 updates** | 10 | 1 |
| **Timeout** | 60 seconds | 90 seconds |
| **Partial success** | N/A | Supported (207) |
| **Use case** | Real-time creation | Bulk import |

---

## Best Practices

### ✅ Do

- **Batch similar dates**: Group events for the same week/month
- **Handle partial success**: Check `succeeded` and `failed` counts
- **Validate locally**: Validate events before sending to reduce failures
- **Use appropriate size**: Send 10-50 events per batch for optimal performance
- **Log errors**: Store failed events for retry or manual review

### ❌ Don't

- **Don't exceed 100 events**: Split large batches into multiple requests
- **Don't ignore errors**: Always check the `errors` array
- **Don't retry entire batch**: Only retry failed events (from `errors` array)
- **Don't send duplicates**: Check for duplicate events before batching

---

## Migration Guide

### From Single to Batch

**Before (10 API calls):**
```javascript
for (const evt of events) {
  await fetch('/api/events', {
    method: 'POST',
    body: JSON.stringify(evt)
  });
}
```

**After (1 API call):**
```javascript
const response = await fetch('/api/events/batch', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_AUTH_TOKEN'
  },
  body: JSON.stringify({ events })
});
```

**Result**: 
- ✅ 10x fewer API calls
- ✅ 10x fewer Quote/0 updates
- ✅ Faster overall operation
- ✅ Single transaction feel

---

## See Also

- [API Reference](./docs/02-api-reference.md) - Full API documentation
- [Implementation Guide](./docs/04-implementation.md) - Setup instructions
- [Deployment Guide](./docs/05-deployment.md) - AWS deployment
- [QUICKSTART.md](./QUICKSTART.md) - Quick setup guide
