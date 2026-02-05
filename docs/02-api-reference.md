# API Reference

## Overview

Quote0 API provides **one endpoint** for creating events:
- `PUT /api/events` - iPhone app creates new events and **immediately updates Quote/0 device**

> **Architecture Note**: This is a **push-only** system. The Lambda function actively pushes updates to the Quote/0 device via the official Quote/0 Text API. The Quote/0 device does NOT call this API.

---

## Base URL

```
Development: http://localhost:3000/api
Production:  https://{your-api-gateway-domain}/api
```

---

## PUT /api/events

### Description
Creates a new event in DynamoDB and **immediately triggers a Quote/0 display update**.

### Workflow
1. Insert event to DynamoDB `events` table
2. Query tomorrow's bin collections from DynamoDB `bin_collection` table
3. Query today's events from DynamoDB `events` table
4. Format display data
5. **Push to Quote/0 device** via Quote/0 Text API

### Request

```http
PUT /api/events HTTP/1.1
Host: your-api-gateway.amazonaws.com
Content-Type: application/json

{
  "date": "2026/02/10",
  "event": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}
```

### Request Body

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `date` | string | Yes | Event date | Format: `YYYY/MM/DD` or `YYYY-MM-DD` |
| `event` | string | Yes | Event description | Max 87 characters (3×29), supports `\n` for line breaks |

### Response

**Success (201 Created)**

```json
{
  "date": "2026-02-10",
  "id": "a3f8b2c1-5e4d-4a9b-8c6d-1234567890ab",
  "event": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes",
  "created_at": "2026-02-05T10:30:00.123Z",
  "ttl": 1746316800,
  "quote0_updated": true
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Event date (ISO format: YYYY-MM-DD) |
| `id` | string | Unique event ID (UUID) |
| `event` | string | Event text as stored |
| `created_at` | string | Timestamp when event was created (ISO 8601) |
| `ttl` | number | Unix timestamp when event will be auto-deleted (90 days after event date) |
| `quote0_updated` | boolean | Whether Quote/0 device was successfully updated |

**Error Responses**:

**400 Bad Request** - Missing Required Fields:
```json
{
  "error": "Bad Request",
  "message": "Missing required field: date"
}
```

**400 Bad Request** - Invalid Date Format:
```json
{
  "error": "Bad Request",
  "message": "Invalid date format. Use YYYY/MM/DD or YYYY-MM-DD"
}
```

**422 Unprocessable Entity** - Event Text Too Long:
```json
{
  "error": "Unprocessable Entity",
  "message": "Event text exceeds maximum length of 87 characters"
}
```

**500 Internal Server Error** - Database or Quote/0 Error:
```json
{
  "error": "Internal server error",
  "message": "Error description"
}
```

### Example Usage

#### cURL

```bash
curl -X PUT https://your-api.com/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026/02/10",
    "event": "Dentist appointment 3pm"
  }'
```

#### JavaScript (Fetch API)

```javascript
const createEvent = async (date, event) => {
  const response = await fetch('https://your-api.com/api/events', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ date, event }),
  });

  if (response.ok) {
    const data = await response.json();
    console.log('Event created and Quote/0 updated:', data);
    return data;
  } else {
    const error = await response.json();
    throw new Error(error.message);
  }
};

// Usage
createEvent('2026/02/10', 'Dentist appointment 3pm\nBring insurance card')
  .then(data => console.log('Success:', data))
  .catch(error => console.error('Error:', error));
```

#### Swift (iOS)

```swift
import Foundation

struct EventRequest: Codable {
    let date: String
    let event: String
}

struct EventResponse: Codable {
    let date: String
    let id: String
    let event: String
    let created_at: String
    let ttl: Int
    let quote0_updated: Bool
}

func createEvent(date: String, event: String, completion: @escaping (Result<EventResponse, Error>) -> Void) {
    let url = URL(string: "https://your-api.com/api/events")!
    var request = URLRequest(url: url)
    request.httpMethod = "PUT"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let eventRequest = EventRequest(date: date, event: event)
    
    do {
        request.httpBody = try JSONEncoder().encode(eventRequest)
        
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(NSError(domain: "No data", code: 0)))
                return
            }
            
            do {
                let eventResponse = try JSONDecoder().decode(EventResponse.self, from: data)
                completion(.success(eventResponse))
            } catch {
                completion(.failure(error))
            }
        }
        
        task.resume()
    } catch {
        completion(.failure(error))
    }
}

// Usage
createEvent(date: "2026/02/10", event: "Dentist appointment 3pm") { result in
    switch result {
    case .success(let response):
        print("✅ Event created: \(response.id)")
        print("📟 Quote/0 updated: \(response.quote0_updated)")
    case .failure(let error):
        print("❌ Error: \(error.localizedDescription)")
    }
}
```

---

## Quote/0 Display Format

After creating an event, the Quote/0 device receives the following JSON via its Text API:

```json
{
  "refreshNow": false,
  "title": "2026/02/10",
  "signature": "collect Food waste, Red bin tmr",
  "message": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}
```

**Field Details**:

| Field | Max Length | Description | Example |
|-------|------------|-------------|---------|
| `refreshNow` | - | Always `false` (Quote/0 requirement) | `false` |
| `title` | 25 chars | Today's date in `YYYY/MM/DD` format | `"2026/02/10"` |
| `signature` | 29 chars | Tomorrow's bin collection reminder | `"collect Red bin tmr"` |
| `message` | 87 chars | Today's events (3 lines × 29 chars, separated by `\n`) | `"Line 1\nLine 2\nLine 3"` |

---

## External API Integration

### Reading Council Bin Collection API

The scheduled service internally calls this API to fetch bin collection schedules:

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
      "date": "03/02/2026 00:00:00",
      "day": "Tuesday"
    },
    {
      "service": "Recycling Collection Service",
      "date": "05/02/2026 00:00:00",
      "day": "Thursday"
    }
  ]
}
```

**Processing**:
1. Store all collections in DynamoDB `bin_collection` table
2. Query tomorrow's collections from database
3. Map service names:
   - `"Domestic Waste Collection Service"` → `"Grey bin"`
   - `"Recycling Collection Service"` → `"Red bin"`
   - `"Food Waste Collection Service"` → `"Food waste"`
4. Format as signature: `"collect Red bin, Food waste tmr"`

---

## Rate Limiting

**Current Implementation**: No rate limiting (single household use)

**Future Considerations** (if expanding to multiple users):
- PUT /api/events: 60 requests/hour per IP

---

## Authentication

**Current Implementation**: None (private API, trusted iPhone app)

**Future Considerations**:
- API Key authentication: `X-API-Key: {device_key}`
- OAuth 2.0 for iPhone app
- JWT tokens for session management

---

## Testing

### Manual Testing

**Test PUT endpoint**:
```bash
curl -X PUT http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026/02/10",
    "event": "Test event"
  }'
```

### Automated Testing

**Example Test (Jest/Node.js)**:

```javascript
const request = require('supertest');
const app = require('../src/app');

describe('PUT /api/events', () => {
  it('should create a new event and update Quote/0', async () => {
    const event = {
      date: '2026/02/10',
      event: 'Test event',
    };

    const response = await request(app)
      .put('/api/events')
      .send(event)
      .expect(201)
      .expect('Content-Type', /json/);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('quote0_updated');
    expect(response.body.event).toBe('Test event');
    expect(response.body.quote0_updated).toBe(true);
  });

  it('should reject invalid date format', async () => {
    const event = {
      date: 'invalid-date',
      event: 'Test event',
    };

    await request(app)
      .put('/api/events')
      .send(event)
      .expect(400);
  });

  it('should reject event text exceeding 87 characters', async () => {
    const event = {
      date: '2026/02/10',
      event: 'A'.repeat(88), // 88 characters
    };

    await request(app)
      .put('/api/events')
      .send(event)
      .expect(422);
  });
});
```

---

For implementation details, see [04-implementation.md](./04-implementation.md).
