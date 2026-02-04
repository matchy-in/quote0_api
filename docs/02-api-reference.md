# API Reference

## Base URL

```
http://your-server:8080/api
```

Replace with your actual server address or Lambda API Gateway URL.

---

## Endpoints

### 1. Get Display Data

Retrieve formatted display data for Quote/0 device. Called hourly by Quote/0 for on-demand updates.

#### Request

```http
GET /api/display
```

**No parameters required**

**Example**:
```bash
curl http://your-server:8080/api/display
```

#### Response

**Success (200 OK)**:

Returns display data formatted for Quote/0 device.

```json
{
  "refreshNow": false,
  "title": "2026/02/10",
  "signature": "collect Food waste, Red bin tmr",
  "message": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}
```

**Response Fields**:

| Field | Type | Description | Max Length |
|-------|------|-------------|------------|
| `refreshNow` | boolean | Whether Quote/0 should refresh immediately (typically `false`) | - |
| `title` | string | Header text - today's date in `YYYY/MM/DD` format | 25 chars |
| `message` | string | Today's events, 3 lines separated by `\n` | 3×29 chars |
| `signature` | string | Tomorrow's bin collection reminder | 29 chars |

**Field Details**:

- **title**: Always today's date in format `YYYY/MM/DD`
  - Example: `"2026/02/10"` (10 characters)

- **message**: Today's events from database, up to 3 lines
  - Each line max 29 characters
  - Lines separated by `\n`
  - If more than 3 events, only first 3 are shown
  - If event text > 29 chars, it's truncated
  - Empty lines padded if < 3 events

- **signature**: Tomorrow's bin collection reminder
  - Format: `"collect {bins} tmr"`
  - Examples:
    - `"collect Red bin tmr"` (single collection)
    - `"collect Food waste, Red bin tmr"` (multiple)
    - `""` (empty string if no collection tomorrow)

**Bin Name Mapping**:

| Service from API | Display Name |
|------------------|--------------|
| Domestic Waste Collection Service | Grey bin |
| Recycling Collection Service | Red bin |
| Food Waste Collection Service | Food waste |

**Error Responses**:

**500 Internal Server Error**:
```json
{
  "error": "Internal server error",
  "message": "Failed to fetch display data"
}
```

**Possible Causes**:
- Database connection failure
- Reading Council API timeout
- Invalid data in database

**Example Response Scenarios**:

**Scenario 1: Normal Day with Events**
```json
{
  "refreshNow": false,
  "title": "2026/02/10",
  "signature": "collect Red bin tmr",
  "message": "Dentist appointment 3pm\nSchool play 6pm\nLibrary books due"
}
```

**Scenario 2: No Events Today**
```json
{
  "refreshNow": false,
  "title": "2026/02/10",
  "signature": "collect Food waste tmr",
  "message": "\n\n"
}
```

**Scenario 3: No Bin Collection Tomorrow**
```json
{
  "refreshNow": false,
  "title": "2026/02/10",
  "signature": "",
  "message": "Meeting 10am\nLunch with Sarah\nGym session 5pm"
}
```

---

### 2. Create Event

Add a new event to the database. Called by iPhone app when user creates an event.

#### Request

```http
PUT /api/events
Content-Type: application/json
```

**Request Body**:

```json
{
  "date": "2026/02/10",
  "event": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}
```

**Body Fields**:

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `date` | string | Yes | Event date | Format: `YYYY/MM/DD` or `YYYY-MM-DD` |
| `event` | string | Yes | Event description | Max 87 characters (3×29), can include `\n` for line breaks |

**Date Format Options**:
- `YYYY/MM/DD` (e.g., `2026/02/10`) - **Recommended**
- `YYYY-MM-DD` (e.g., `2026-02-10`) - ISO 8601 format

**Event Text**:
- Supports multi-line text using `\n`
- Maximum 87 characters total (to fit 3 lines of 29 chars)
- Example: `"Line 1 text\nLine 2 text\nLine 3 text"`

**Example Requests**:

**Single Line Event**:
```bash
curl -X PUT http://your-server:8080/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026/02/10",
    "event": "Dentist appointment 3pm"
  }'
```

**Multi-Line Event**:
```bash
curl -X PUT http://your-server:8080/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026/02/10",
    "event": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
  }'
```

#### Response

**Success (201 Created)**:

```json
{
  "id": 42,
  "date": "2026-02-10",
  "event": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes",
  "created_at": "2026-02-03T10:30:00Z"
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique event ID |
| `date` | string | Event date (ISO format) |
| `event` | string | Event text as stored |
| `created_at` | string | Timestamp when event was created (ISO 8601) |

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

**422 Unprocessable Entity** - Date in Past:
```json
{
  "error": "Unprocessable Entity",
  "message": "Cannot create event for past date"
}
```

**500 Internal Server Error** - Database Error:
```json
{
  "error": "Internal Server Error",
  "message": "Failed to create event"
}
```

---

## Integration Examples

### Quote/0 Device Integration

**Hourly Pull from Quote/0**:

The Quote/0 device should request display data every hour:

```javascript
// Pseudo-code for Quote/0 device
setInterval(async () => {
  try {
    const response = await fetch('http://your-server:8080/api/display');
    const displayData = await response.json();
    
    // Update Quote/0 display
    updateDisplay(displayData);
  } catch (error) {
    console.error('Failed to fetch display data:', error);
    // Keep showing previous data
  }
}, 60 * 60 * 1000); // Every hour
```

**Quote/0 Configuration**:
- **API Endpoint**: `http://your-server:8080/api/display`
- **Request Interval**: Every 60 minutes
- **Timeout**: 10 seconds
- **Retry**: 3 attempts with 5-second delay

### iPhone App Integration

**Swift Example**:

```swift
import Foundation

struct Event: Codable {
    let date: String
    let event: String
}

func createEvent(date: String, event: String) {
    let url = URL(string: "http://your-server:8080/api/events")!
    var request = URLRequest(url: url)
    request.httpMethod = "PUT"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let eventData = Event(date: date, event: event)
    
    do {
        request.httpBody = try JSONEncoder().encode(eventData)
        
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("Error: \(error.localizedDescription)")
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else { return }
            
            if httpResponse.statusCode == 201 {
                print("Event created successfully")
            } else {
                print("Failed to create event: \(httpResponse.statusCode)")
            }
        }
        
        task.resume()
    } catch {
        print("Failed to encode event: \(error)")
    }
}

// Usage
createEvent(
    date: "2026/02/10",
    event: "Dentist appointment 3pm\nBring insurance card"
)
```

**React Native / JavaScript Example**:

```javascript
async function createEvent(date, event) {
  try {
    const response = await fetch('http://your-server:8080/api/events', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date, event }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Event created:', data);
      return data;
    } else {
      const error = await response.json();
      console.error('Failed to create event:', error);
      throw new Error(error.message);
    }
  } catch (error) {
    console.error('Network error:', error);
    throw error;
  }
}

// Usage
createEvent('2026/02/10', 'Dentist appointment 3pm')
  .then(event => console.log('Success:', event))
  .catch(error => console.error('Error:', error));
```

---

## External API Integration

### Reading Council Bin Collection API

The microservice internally calls this API to fetch bin collection schedules.

**API Details** (for reference):

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
1. Filter for tomorrow's date
2. Map service names:
   - `"Domestic Waste Collection Service"` → `"Grey bin"`
   - `"Recycling Collection Service"` → `"Red bin"`
   - `"Food Waste Collection Service"` → `"Food waste"`
3. Combine into signature: `"collect Red bin, Food waste tmr"`

---

## Rate Limiting

**Current Implementation**: No rate limiting (single household use)

**Future Considerations** (if expanding to multiple users):
- GET /api/display: 120 requests/hour per IP
- PUT /api/events: 60 requests/hour per IP

---

## Authentication

**Current Implementation**: None (private server, trusted devices)

**Future Considerations**:
- API Key authentication: `X-API-Key: {device_key}`
- OAuth 2.0 for iPhone app
- JWT tokens for session management

---

## Versioning

**Current Version**: v1 (implicit in URL)

**URL Structure**: `/api/{endpoint}`

**Future Versioning**: `/api/v2/{endpoint}` if breaking changes needed

---

## Testing

### Manual Testing

**Test GET endpoint**:
```bash
curl http://localhost:8080/api/display
```

**Test PUT endpoint**:
```bash
curl -X PUT http://localhost:8080/api/events \
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

describe('GET /api/display', () => {
  it('should return display data', async () => {
    const response = await request(app)
      .get('/api/display')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toHaveProperty('title');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('signature');
    expect(response.body.title).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });
});

describe('PUT /api/events', () => {
  it('should create a new event', async () => {
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
    expect(response.body.event).toBe('Test event');
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
});
```

---

For implementation details, see [04-implementation.md](./04-implementation.md).
