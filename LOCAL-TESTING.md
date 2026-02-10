# Local Testing Guide

This guide explains how to test the Quote0 API on your local PC **before** deploying to AWS.

---

## 🚀 **Quick Start**

### **1. Install Dependencies**

```powershell
npm install
```

### **2. Create `.env` File**

Create a `.env` file in the project root with these variables:

```env
# Required: Your UPRN for Reading Council bin collection API
UPRN=310022781

# Required: Quote/0 device Text API endpoint
QUOTE0_TEXT_API=https://dot.mindreset.tech/api/authV2/open/device/YOUR_DEVICE_ID/text

# Required: Quote/0 API authentication token
QUOTE0_AUTH_TOKEN=dot_app_your_token_here

# Required: DynamoDB table names (for local testing)
EVENTS_TABLE=quote0-api-dev-events
BIN_COLLECTION_TABLE=quote0-api-dev-bin-collection

# Required: AWS region
AWS_REGION=us-east-1

# Optional: Reading Council API configuration
READING_API_URL=https://api.reading.gov.uk/api/collections
READING_API_TIMEOUT=5000

# Optional: Cache TTL in hours
CACHE_TTL_HOURS=12
```

**⚠️ Important**: Replace `YOUR_DEVICE_ID` and `your_token_here` with your actual Quote/0 device credentials.

### **3. Start Local Server**

```powershell
npm run offline
```

**Expected Output:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   POST | http://localhost:3000/test/scheduled-update                   │
│   POST | http://localhost:3000/api/events                              │
│   POST | http://localhost:3000/api/events/batch                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Server ready: http://localhost:3000 🚀
```

---

## 🧪 **Testing Methods**

### **Method 1: Test Single Event Creation**

Open a **new PowerShell terminal** and run:

```powershell
# Test creating a single event
$event = @{
    date = "2026/02/10"
    event = "Test event from local"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/events" `
    -Method POST `
    -ContentType "application/json" `
    -Body $event
```

**Expected Response:**
```json
{
  "date": "2026-02-10",
  "id": "a3f8b2c1-5e4d-4a9b-8c6d-1234567890ab",
  "event": "Test event from local",
  "created_at": "2026-02-10T10:30:00.123Z",
  "ttl": 1746316800,
  "quote0_updated": true
}
```

### **Method 2: Test Batch Event Creation**

```powershell
# Test creating multiple events
$batch = @{
    events = @(
        @{ date = "2026/02/10"; event = "Test event 1" },
        @{ date = "2026/02/11"; event = "Test event 2" },
        @{ date = "2026/02/12"; event = "Test event 3" }
    )
} | ConvertTo-Json -Depth 3

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/events/batch" `
    -Method POST `
    -ContentType "application/json" `
    -Body $batch
```

**Expected Response:**
```json
{
  "message": "Batch complete: 3/3 events created",
  "succeeded": 3,
  "failed": 0,
  "total": 3,
  "quote0_updated": true,
  "created": [ /* array of created events */ ],
  "errors": []
}
```

### **Method 3: Test Scheduled Update**

Use the test endpoint to manually trigger the scheduled service:

```powershell
# Manually trigger scheduled update
Invoke-RestMethod `
    -Uri "http://localhost:3000/test/scheduled-update" `
    -Method POST
```

**Or use the dedicated test script:**

```powershell
# Run scheduled update test script
node test-scheduled-update.js
```

---

## 🔧 **Local Testing Options**

### **Option 1: Mock Quote/0 API** (Recommended for Development)

If you want to test without actually updating your Quote/0 device:

1. **Temporarily comment out the Quote/0 API call**:

Open `src/services/quote0ClientService.js` and modify:

```javascript
async updateDisplay(displayData) {
  // ... existing code ...
  
  // TESTING: Comment out actual API call
  console.log('[Quote0Client] TESTING MODE - Skipping actual API call');
  console.log('[Quote0Client] Would send:', payload);
  return; // Early return for testing
  
  // const response = await fetch(QUOTE0_TEXT_API, {
  //   method: 'POST',
  //   headers: headers,
  //   body: JSON.stringify(payload)
  // });
  
  // ... rest of code ...
}
```

2. **Test your endpoints** - they'll log what they would send without actually calling Quote/0

3. **Uncomment before deploying** - Don't forget to restore the actual API call!

### **Option 2: Use Real AWS DynamoDB**

Your local server can connect to real AWS DynamoDB tables:

1. **Ensure AWS credentials are configured**:
```powershell
aws configure list
```

2. **Create DynamoDB tables** (if not already deployed):
```powershell
npm run deploy:dev
```

3. **Run local server** - it will use your AWS DynamoDB tables:
```powershell
npm run offline
```

### **Option 3: Use DynamoDB Local** (Advanced)

For completely offline testing:

1. **Install DynamoDB Local**:
```powershell
npm install --save-dev dynamodb-local
```

2. **Update `serverless.yml`** to add DynamoDB local plugin:
```yaml
plugins:
  - serverless-offline
  - serverless-dynamodb-local  # Add this
```

3. **Start DynamoDB Local**:
```powershell
npx sls dynamodb start
```

4. **In another terminal, start serverless offline**:
```powershell
npm run offline
```

---

## 📊 **Monitoring Local Tests**

### **Watch Logs in Real-Time**

The serverless-offline terminal will show all logs:

```
POST /api/events 200 1234ms
[POST /api/events] Request received
Request data: { date: '2026-02-10', event: 'Test event' }
Normalized date: 2026-02-10
[DynamoDB] Creating event: { date: '2026-02-10', ... }
[Quote0Client] Sending update to Quote/0 device
Quote/0 updated successfully
```

### **Common Log Messages**

| Log | Meaning |
|-----|---------|
| `[DynamoDB] Table: undefined` | `.env` file not loaded or `EVENTS_TABLE` not set |
| `QUOTE0_TEXT_API not configured` | `QUOTE0_TEXT_API` environment variable missing |
| `[Quote0Client] Sending update to Quote/0 device` | About to call Quote/0 API |
| `Quote/0 updated successfully` | Quote/0 API call succeeded |
| `ValidationException` | DynamoDB table doesn't exist or wrong region |

---

## 🐛 **Troubleshooting**

### **Problem 1: `Table: undefined`**

**Error:**
```
[DynamoDB] Table: undefined
ValidationException: Member must not be null
```

**Solution:** Make sure `.env` file exists in project root with `EVENTS_TABLE` and `BIN_COLLECTION_TABLE`:

```powershell
# Check if .env exists
Test-Path .env

# If not, create it
"EVENTS_TABLE=quote0-api-dev-events" | Out-File -Encoding utf8 .env
"BIN_COLLECTION_TABLE=quote0-api-dev-bin-collection" | Out-File -Append -Encoding utf8 .env
"AWS_REGION=us-east-1" | Out-File -Append -Encoding utf8 .env
# ... add other variables
```

### **Problem 2: `ResourceNotFoundException: Cannot do operations on a non-existent table`**

**Error:**
```
ResourceNotFoundException: Cannot do operations on a non-existent table
```

**Solution:** DynamoDB tables don't exist yet. Deploy to AWS first:

```powershell
npm run deploy:dev
```

This creates the tables. Then restart local server:

```powershell
npm run offline
```

### **Problem 3: Port 3000 Already in Use**

**Error:**
```
EADDRINUSE: address already in use :::3000
```

**Solution 1 - Kill existing process:**
```powershell
# Find process on port 3000
Get-NetTCPConnection -LocalPort 3000 | Select-Object -Property OwningProcess

# Kill it (replace PID with actual process ID)
Stop-Process -Id PID -Force
```

**Solution 2 - Use different port:**
```powershell
# Edit serverless.yml
# Change httpPort: 3001

npm run offline
```

### **Problem 4: AWS Credentials Not Found**

**Error:**
```
Missing credentials in config
```

**Solution:** Configure AWS credentials:

```powershell
aws configure
# Enter:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region (us-east-1)
# - Default output format (json)
```

### **Problem 5: Quote/0 API Returns 401 Unauthorized**

**Error:**
```
[Quote0Client] Error: Unauthorized (401)
```

**Solution:** Check your `QUOTE0_AUTH_TOKEN` in `.env`:

```env
QUOTE0_AUTH_TOKEN=dot_app_your_actual_token_here
```

Make sure it matches the token from your Quote/0 account.

---

## ✅ **Testing Checklist**

Before deploying to AWS, verify locally:

- [ ] **Environment variables** - All required vars set in `.env`
- [ ] **AWS credentials** - `aws configure list` shows credentials
- [ ] **Single event creation** - `POST /api/events` works
- [ ] **Batch event creation** - `POST /api/events/batch` works
- [ ] **Scheduled update** - Manual trigger works
- [ ] **DynamoDB connection** - Events stored successfully
- [ ] **Quote/0 integration** - Device receives updates (or mocked)
- [ ] **Bin collection API** - Reading Council API accessible
- [ ] **Error handling** - Invalid requests return proper errors
- [ ] **Logs** - All operations logged clearly

---

## 🔄 **Development Workflow**

### **Recommended Local Testing Flow**

```powershell
# Terminal 1: Start local server
npm run offline

# Terminal 2: Test endpoints
# Test single event
Invoke-RestMethod -Uri "http://localhost:3000/api/events" -Method POST -Body ... 

# Test batch events
Invoke-RestMethod -Uri "http://localhost:3000/api/events/batch" -Method POST -Body ...

# Test scheduled service
node test-scheduled-update.js

# Check logs in Terminal 1
```

### **Iterative Development**

1. **Make code changes** in your editor
2. **Save files** - serverless-offline auto-reloads
3. **Test immediately** - no need to restart server
4. **Check logs** - verify behavior
5. **Repeat** until working as expected
6. **Deploy to AWS** - `npm run deploy:dev`

---

## 📝 **Example Testing Session**

Here's a complete testing session:

```powershell
# 1. Start local server
PS> npm run offline
# Server starts on http://localhost:3000

# 2. In new terminal, test single event
PS> $event = @{ date = "2026/02/10"; event = "Dentist 3pm" } | ConvertTo-Json
PS> Invoke-RestMethod -Uri "http://localhost:3000/api/events" -Method POST -ContentType "application/json" -Body $event

# Result: Event created, Quote/0 updated

# 3. Test batch events
PS> $batch = @{
    events = @(
        @{ date = "2026/02/11"; event = "Meeting 10am" },
        @{ date = "2026/02/12"; event = "Gym 6pm" }
    )
} | ConvertTo-Json -Depth 3

PS> Invoke-RestMethod -Uri "http://localhost:3000/api/events/batch" -Method POST -ContentType "application/json" -Body $batch

# Result: 2 events created in batch, Quote/0 updated once

# 4. Test scheduled update
PS> node test-scheduled-update.js

# Result: Fetches bin collections, updates Quote/0

# 5. Check DynamoDB to verify events stored
PS> aws dynamodb scan --table-name quote0-api-dev-events --region us-east-1

# 6. If everything works, deploy to AWS
PS> npm run deploy:dev
```

---

## 🎯 **Next Steps**

Once local testing is complete:

1. ✅ **Verify all tests pass** locally
2. ✅ **Commit your changes** (excluding `.env`)
3. ✅ **Deploy to AWS** - `npm run deploy:dev`
4. ✅ **Test production endpoints** with real URLs
5. ✅ **Monitor CloudWatch logs** for production behavior

---

## 📚 **Related Documentation**

- [QUICKSTART.md](./QUICKSTART.md) - Quick setup guide
- [BATCH-EVENTS-GUIDE.md](./BATCH-EVENTS-GUIDE.md) - Batch endpoint usage
- [docs/04-implementation.md](./docs/04-implementation.md) - Implementation details
- [docs/05-deployment.md](./docs/05-deployment.md) - AWS deployment guide

---

## 🆘 **Need Help?**

If you encounter issues during local testing:

1. **Check logs** in the serverless-offline terminal
2. **Verify `.env` file** has all required variables
3. **Ensure AWS credentials** are configured (`aws configure list`)
4. **Confirm DynamoDB tables exist** (deploy first if needed)
5. **Test with mock Quote/0 API** to isolate issues

Happy testing! 🚀
