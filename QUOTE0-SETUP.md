# Quote/0 Device Setup Guide

## ✅ Changes Made

### 1. Added Bearer Token Authentication
- Updated `src/services/quote0ClientService.js` to include `Authorization: Bearer {token}` header
- Added new environment variable: `QUOTE0_AUTH_TOKEN`

### 2. Fixed Payload Format
- Updated `src/services/displayFormatterService.js` to match Quote/0 API format
- **Old format**:
  ```json
  {
    "refreshNow": false,
    "title": "2026/02/05",
    "signature": "collect Red bin tmr",
    "message": "Event 1\nEvent 2\nEvent 3"
  }
  ```
- **New format**:
  ```json
  {
    "date": "2026/02/05",
    "message": "collect Red bin tmr\nEvent 1\nEvent 2\nEvent 3"
  }
  ```

### 3. Message Structure
Now combines signature and events into single `message` field:
```
Line 1: Bin collection reminder (e.g., "collect Red bin tmr")
Line 2: Event 1
Line 3: Event 2
Line 4: Event 3
```

---

## 🔧 Configuration Steps

### Step 1: Update Your `.env` File

Edit your `.env` file in the project root:

```bash
# Reading Council UPRN (Unique Property Reference Number)
UPRN=310022781

# Quote/0 Device API Endpoint
# Your device ID: 48F6EE55503C
QUOTE0_TEXT_API=https://dot.mindreset.tech/api/authV2/open/device/48F6EE55503C/text

# Quote/0 Bearer Token
QUOTE0_AUTH_TOKEN=dot_app_vIZLxXhUslczaOeikfAnIACvYZmHTUCprHVIioquiVIFYUKeEihDXRKkjCpdYrvi

# Reading Council API Configuration
READING_API_URL=https://api.reading.gov.uk/api/collections
READING_API_TIMEOUT=5000
CACHE_TTL_HOURS=12
```

### Step 2: Deploy Updated Code

```bash
# Install dependencies (if needed)
npm install

# Deploy to AWS
npm run deploy:dev
```

### Step 3: Test the Update

**Test Scheduled Function**:
```bash
aws lambda invoke \
  --function-name quote0-api-dev-scheduledUpdate \
  --payload '{}' \
  response.json

cat response.json
```

**Check Logs**:
```bash
npm run logs
```

**Look for**:
```
✅ Successfully updated Quote/0 display
Response: 200 OK
```

---

## 📋 Expected Payload to Quote/0

When the system pushes to your Quote/0 device, it will send:

```json
{
  "date": "2026/02/05",
  "message": "collect Red bin tmr\nAE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}
```

With headers:
```
Content-Type: application/json
Authorization: Bearer dot_app_vIZLxXhUslczaOeikfAnIACvYZmHTUCprHVIioquiVIFYUKeEihDXRKkjCpdYrvi
User-Agent: Quote0-API/1.0
```

---

## 🧪 Manual Test (Using curl)

Test the Quote/0 API directly to verify it works:

```bash
curl --location 'https://dot.mindreset.tech/api/authV2/open/device/48F6EE55503C/text' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer dot_app_vIZLxXhUslczaOeikfAnIACvYZmHTUCprHVIioquiVIFYUKeEihDXRKkjCpdYrvi' \
--data '{
  "date": "2026/02/05",
  "message": "collect Red bin tmr\nAE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}'
```

**Expected Response**: 200 OK (or similar success response)

---

## 🔍 Troubleshooting

### Issue 1: "QUOTE0_AUTH_TOKEN not configured"

**Check**:
```bash
aws lambda get-function-configuration \
  --function-name quote0-api-dev-scheduledUpdate \
  --query 'Environment.Variables.QUOTE0_AUTH_TOKEN'
```

**Fix**: Redeploy with updated `.env` file

---

### Issue 2: "401 Unauthorized"

**Possible Causes**:
- Invalid or expired Bearer token
- Token doesn't match device

**Fix**:
1. Verify token in Quote/0 dashboard
2. Update `QUOTE0_AUTH_TOKEN` in `.env`
3. Redeploy

---

### Issue 3: "Device not reachable"

**Possible Causes**:
- Wrong device ID in URL
- Device is offline
- Network/firewall issues

**Fix**:
1. Verify device ID: `48F6EE55503C`
2. Test manually with curl
3. Check device status in Quote/0 dashboard

---

## 📊 Monitoring

### View Lambda Logs
```bash
# Tail logs in real-time
npm run logs

# Or view in AWS CloudWatch
# Log group: /aws/lambda/quote0-api-dev-scheduledUpdate
```

### Successful Update Log
```
[Quote0Client] Sending update to device (attempt 1/3)
[Quote0Client] Endpoint: https://dot.mindreset.tech/api/authV2/open/device/48F6EE55503C/text
[Quote0Client] Using Bearer token authentication
[Quote0Client] ✅ Successfully updated Quote/0 display
[Quote0Client] Response: 200 OK
```

---

## 🎯 Next Steps

1. **Update `.env` file** with your Quote/0 credentials
2. **Deploy**: `npm run deploy:dev`
3. **Test**: Manually invoke scheduled function
4. **Verify**: Check Quote/0 device shows correct data
5. **Monitor**: Watch logs for first scheduled run at 01:10 UTC

---

## 📱 iPhone App Integration

When your iPhone app creates an event via `POST /api/events`:
1. Event is saved to DynamoDB
2. System immediately queries bins and events
3. **Pushes update to Quote/0 device automatically**
4. Returns response with `quote0_updated: true`

**Example**:
```bash
curl -X POST https://your-api.com/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026/02/10",
    "event": "Dentist appointment 3pm"
  }'
```

**Response**:
```json
{
  "date": "2026-02-10",
  "id": "uuid",
  "event": "Dentist appointment 3pm",
  "created_at": "2026-02-05T14:30:00.123Z",
  "ttl": 1746316800,
  "quote0_updated": true   ← Device updated!
}
```

---

**Your Quote/0 device is now ready for automated updates!** 🎉
