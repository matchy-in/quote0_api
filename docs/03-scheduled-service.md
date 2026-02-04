# Scheduled Service

## Overview

The scheduled service is the core automation component of Quote0 API. It proactively pushes display updates to the Quote/0 device at specific times throughout the day: **01:10, 07:10, 12:10, and 17:10**.

This ensures the Quote/0 device always shows current information without requiring the device to poll continuously.

---

## Schedule Times

| Time | Purpose | Typical Use Case |
|------|---------|------------------|
| **01:10** | Early morning update | Prepare display for morning viewing |
| **07:10** | Morning update | Before typical workday starts |
| **12:10** | Midday update | Lunchtime refresh |
| **17:10** | Evening update | After work/school day |

**Time Zone**: Times are in server's local timezone (configure to match your timezone).

---

## Scheduled Service Logic

### Process Flow

```
┌─────────────────────────────────────────────┐
│  Cron Trigger (e.g., 07:10)                │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 1: Fetch Bin Collection Data         │
│  - Call Reading Council API                 │
│  - Get upcoming collections                 │
│  - Filter for tomorrow's date               │
│  - Map service names to friendly format     │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 2: Query Today's Events              │
│  - Query database: WHERE date = TODAY       │
│  - Retrieve all events for today            │
│  - Sort by creation order                   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 3: Format Display Data               │
│  - Title: Today's date (YYYY/MM/DD)        │
│  - Message: Up to 3 events (29 chars each) │
│  - Signature: Tomorrow's bin reminder       │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 4: Push to Quote/0                   │
│  - POST to Quote/0 text API                 │
│  - Send formatted display JSON              │
│  - Handle success/failure                   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Step 5: Logging                           │
│  - Log success with timestamp               │
│  - Or log error details for debugging       │
└─────────────────────────────────────────────┘
```

### Pseudo-code

```javascript
async function scheduledUpdate() {
  console.log(`[${new Date().toISOString()}] Starting scheduled update`);
  
  try {
    // Step 1: Fetch bin collections
    const binCollections = await fetchBinCollections();
    const tomorrowBins = filterTomorrow(binCollections);
    const binSignature = formatBinSignature(tomorrowBins);
    
    // Step 2: Query today's events
    const today = formatDate(new Date(), 'YYYY-MM-DD');
    const events = await queryEventsForDate(today);
    
    // Step 3: Format display data
    const displayData = {
      refreshNow: false,
      title: formatDate(new Date(), 'YYYY/MM/DD'),
      signature: binSignature,
      message: formatEventsMessage(events)
    };
    
    // Step 4: Push to Quote/0
    await sendToQuote0(displayData);
    
    console.log(`[${new Date().toISOString()}] Update successful`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Update failed:`, error);
    // Optionally: Send alert notification
  }
}
```

---

## Implementation Options

### Option 1: AWS EventBridge + Lambda (Recommended for Serverless)

**Configuration**:

Create EventBridge rules for each schedule time:

```yaml
# serverless.yml
functions:
  scheduledUpdate:
    handler: src/handlers/scheduled.handler
    events:
      - schedule:
          rate: cron(10 1 * * ? *)  # 01:10 daily
          enabled: true
      - schedule:
          rate: cron(10 7 * * ? *)  # 07:10 daily
          enabled: true
      - schedule:
          rate: cron(10 12 * * ? *)  # 12:10 daily
          enabled: true
      - schedule:
          rate: cron(10 17 * * ? *)  # 17:10 daily
          enabled: true
```

**Handler Code** (`src/handlers/scheduled.js`):

```javascript
const binCollectionService = require('../services/binCollectionService');
const eventService = require('../services/eventService');
const displayFormatter = require('../services/displayFormatter');
const quote0Client = require('../services/quote0Client');

exports.handler = async (event) => {
  console.log('Scheduled update triggered:', JSON.stringify(event));
  
  try {
    // Fetch bin collections for tomorrow
    const binCollections = await binCollectionService.getTomorrowCollections();
    
    // Query today's events
    const today = new Date().toISOString().split('T')[0];
    const events = await eventService.getEventsByDate(today);
    
    // Format display data
    const displayData = displayFormatter.formatDisplay(events, binCollections);
    
    // Send to Quote/0 device
    await quote0Client.updateDisplay(displayData);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Update successful' })
    };
  } catch (error) {
    console.error('Scheduled update failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

**Deploy**:
```bash
serverless deploy
```

**Verify EventBridge Rules**:
```bash
aws events list-rules --name-prefix quote0
```

---

### Option 2: Node-cron (Node.js Server)

**Installation**:
```bash
npm install node-cron
```

**Implementation** (`src/scheduler.js`):

```javascript
const cron = require('node-cron');
const scheduledUpdateService = require('./services/scheduledUpdateService');

function startScheduler() {
  // Schedule at 01:10 daily
  cron.schedule('10 1 * * *', async () => {
    console.log('Running scheduled update at 01:10');
    await scheduledUpdateService.executeUpdate();
  });

  // Schedule at 07:10 daily
  cron.schedule('10 7 * * *', async () => {
    console.log('Running scheduled update at 07:10');
    await scheduledUpdateService.executeUpdate();
  });

  // Schedule at 12:10 daily
  cron.schedule('10 12 * * *', async () => {
    console.log('Running scheduled update at 12:10');
    await scheduledUpdateService.executeUpdate();
  });

  // Schedule at 17:10 daily
  cron.schedule('10 17 * * *', async () => {
    console.log('Running scheduled update at 17:10');
    await scheduledUpdateService.executeUpdate();
  });

  console.log('Scheduler started. Updates scheduled for 01:10, 07:10, 12:10, 17:10');
}

module.exports = { startScheduler };
```

**Service Implementation** (`src/services/scheduledUpdateService.js`):

```javascript
const binCollectionService = require('./binCollectionService');
const eventService = require('./eventService');
const displayFormatter = require('./displayFormatter');
const quote0Client = require('./quote0Client');

async function executeUpdate() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Scheduled update starting...`);
  
  try {
    // Fetch tomorrow's bin collections
    const binCollections = await binCollectionService.getTomorrowCollections();
    console.log(`Found ${binCollections.length} bin collections for tomorrow`);
    
    // Get today's events
    const today = new Date().toISOString().split('T')[0];
    const events = await eventService.getEventsByDate(today);
    console.log(`Found ${events.length} events for today`);
    
    // Format display data
    const displayData = displayFormatter.formatDisplay(events, binCollections);
    console.log('Display data formatted:', displayData);
    
    // Send to Quote/0
    await quote0Client.updateDisplay(displayData);
    
    const endTime = new Date();
    const duration = endTime - startTime;
    console.log(`[${endTime.toISOString()}] Update completed successfully in ${duration}ms`);
    
    return { success: true, duration };
  } catch (error) {
    const endTime = new Date();
    console.error(`[${endTime.toISOString()}] Update failed:`, error.message);
    console.error('Error stack:', error.stack);
    
    // Optionally send alert
    // await sendAlert('Scheduled update failed', error);
    
    return { success: false, error: error.message };
  }
}

module.exports = { executeUpdate };
```

**Start in Main App** (`src/app.js`):

```javascript
const express = require('express');
const { startScheduler } = require('./scheduler');

const app = express();

// ... middleware and routes ...

// Start scheduler
startScheduler();

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Scheduled updates active');
});
```

**Cron Expression Format**:
```
 ┌────────────── minute (0 - 59)
 │ ┌──────────── hour (0 - 23)
 │ │ ┌────────── day of month (1 - 31)
 │ │ │ ┌──────── month (1 - 12)
 │ │ │ │ ┌────── day of week (0 - 6) (Sunday to Saturday)
 │ │ │ │ │
 * * * * *

Examples:
'10 1 * * *'   - 01:10 every day
'10 7 * * *'   - 07:10 every day
'10 12 * * *'  - 12:10 every day
'10 17 * * *'  - 17:10 every day
```

---

### Option 3: System Cron (Linux Server)

**Create Script** (`/opt/quote0/scheduled-update.sh`):

```bash
#!/bin/bash

# Set working directory
cd /opt/quote0/quote0_api

# Load environment variables
source .env

# Run Node.js script
/usr/bin/node src/scripts/scheduled-update.js >> /var/log/quote0/scheduled-update.log 2>&1
```

**Make Executable**:
```bash
chmod +x /opt/quote0/scheduled-update.sh
```

**Node.js Script** (`src/scripts/scheduled-update.js`):

```javascript
#!/usr/bin/env node

require('dotenv').config();
const scheduledUpdateService = require('../services/scheduledUpdateService');

async function main() {
  console.log('='.repeat(80));
  console.log(`Scheduled update triggered at ${new Date().toISOString()}`);
  console.log('='.repeat(80));
  
  try {
    const result = await scheduledUpdateService.executeUpdate();
    
    if (result.success) {
      console.log(`✅ Update completed successfully`);
      process.exit(0);
    } else {
      console.error(`❌ Update failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
```

**Add to Crontab**:

```bash
# Edit crontab
crontab -e

# Add these lines:
10 1 * * * /opt/quote0/scheduled-update.sh
10 7 * * * /opt/quote0/scheduled-update.sh
10 12 * * * /opt/quote0/scheduled-update.sh
10 17 * * * /opt/quote0/scheduled-update.sh
```

**View Logs**:
```bash
tail -f /var/log/quote0/scheduled-update.log
```

**Verify Cron Jobs**:
```bash
crontab -l
```

---

## Error Handling

### Bin Collection API Failure

**Scenario**: Reading Council API is down or times out

**Strategy**:
1. Check cache for previous bin collection data
2. If cache exists (even if expired), use it
3. If no cache, skip bin signature (set to empty string)
4. Log error but continue with event display

```javascript
async function getTomorrowCollections() {
  try {
    const collections = await fetchFromReadingAPI();
    cacheCollections(collections); // Cache for next time
    return filterTomorrow(collections);
  } catch (error) {
    console.error('Failed to fetch bin collections:', error);
    
    // Try to use cached data
    const cachedCollections = getCachedCollections();
    if (cachedCollections) {
      console.warn('Using cached bin collection data');
      return filterTomorrow(cachedCollections);
    }
    
    // No cache available, return empty
    console.warn('No cached data available, skipping bin signature');
    return [];
  }
}
```

### Database Connection Failure

**Scenario**: Cannot connect to database to fetch events

**Strategy**:
1. Retry connection once after 2-second delay
2. If still fails, log critical error
3. Skip this update cycle
4. Alert administrator (optional)

```javascript
async function getEventsByDate(date, retries = 1) {
  try {
    return await db.query('SELECT * FROM events WHERE date = $1', [date]);
  } catch (error) {
    console.error('Database query failed:', error);
    
    if (retries > 0) {
      console.log(`Retrying in 2 seconds... (${retries} attempts left)`);
      await sleep(2000);
      return await getEventsByDate(date, retries - 1);
    }
    
    throw new Error('Database connection failed after retries');
  }
}
```

### Quote/0 Device Unreachable

**Scenario**: Cannot reach Quote/0 device to send update

**Strategy**:
1. Retry 3 times with exponential backoff (1s, 2s, 4s)
2. Log warning if all retries fail
3. Device will fetch via hourly GET as fallback

```javascript
async function updateDisplay(displayData, attempt = 1) {
  try {
    await axios.post(quote0TextApiEndpoint, displayData, { timeout: 5000 });
    console.log('Successfully sent update to Quote/0');
  } catch (error) {
    if (attempt < 3) {
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`Failed to reach Quote/0, retrying in ${delay}ms...`);
      await sleep(delay);
      return await updateDisplay(displayData, attempt + 1);
    }
    
    console.error('Failed to update Quote/0 after 3 attempts');
    // Don't throw - log and continue. Device will pull via GET endpoint.
  }
}
```

---

## Monitoring & Logging

### Log Format

**Successful Update**:
```
[2026-02-03T07:10:00.123Z] Scheduled update starting...
[2026-02-03T07:10:00.456Z] Found 2 bin collections for tomorrow
[2026-02-03T07:10:00.789Z] Found 3 events for today
[2026-02-03T07:10:01.012Z] Display data formatted
[2026-02-03T07:10:01.345Z] Successfully sent update to Quote/0
[2026-02-03T07:10:01.678Z] Update completed successfully in 1555ms
```

**Failed Update**:
```
[2026-02-03T12:10:00.123Z] Scheduled update starting...
[2026-02-03T12:10:00.456Z] Failed to fetch bin collections: ETIMEDOUT
[2026-02-03T12:10:00.789Z] Using cached bin collection data
[2026-02-03T12:10:01.012Z] Found 2 events for today
[2026-02-03T12:10:01.345Z] Display data formatted
[2026-02-03T12:10:01.678Z] Failed to reach Quote/0, retrying in 1000ms...
[2026-02-03T12:10:02.890Z] Failed to reach Quote/0, retrying in 2000ms...
[2026-02-03T12:10:05.123Z] Successfully sent update to Quote/0
[2026-02-03T12:10:05.456Z] Update completed successfully in 5333ms
```

### Metrics to Track

- **Update Success Rate**: % of successful updates
- **Average Duration**: Time to complete update
- **Bin API Success Rate**: % of successful bin API calls
- **Quote/0 Reachability**: % of successful device updates
- **Database Query Time**: Time to fetch events

### Alerting

**Critical Alerts** (send notification):
- 3 consecutive failed updates
- Database connection failures
- Critical errors in service logic

**Warning Alerts** (log only):
- Bin API timeout (acceptable if cached data available)
- Quote/0 device unreachable (device can pull via GET)
- Slow response times (> 10 seconds)

---

## Testing

### Manual Trigger

For testing without waiting for scheduled time:

**Option 1: Call Scheduled Service Directly**:

```javascript
// Test script: test-scheduled-update.js
const scheduledUpdateService = require('./src/services/scheduledUpdateService');

async function test() {
  console.log('Manually triggering scheduled update...');
  const result = await scheduledUpdateService.executeUpdate();
  console.log('Result:', result);
}

test();
```

Run: `node test-scheduled-update.js`

**Option 2: Invoke Lambda Manually** (AWS):

```bash
aws lambda invoke \
  --function-name quote0-api-dev-scheduledUpdate \
  --payload '{}' \
  response.json

cat response.json
```

**Option 3: Test Endpoint** (add to API for development):

```javascript
// Add to routes (DEVELOPMENT ONLY)
if (process.env.NODE_ENV === 'development') {
  app.post('/api/test/trigger-scheduled-update', async (req, res) => {
    const result = await scheduledUpdateService.executeUpdate();
    res.json(result);
  });
}
```

Test: `curl -X POST http://localhost:8080/api/test/trigger-scheduled-update`

---

## Troubleshooting

### Scheduled Job Not Running

**Check**:
1. Cron service is running: `systemctl status cron`
2. Crontab has correct entries: `crontab -l`
3. Script is executable: `ls -l /opt/quote0/scheduled-update.sh`
4. Check logs: `tail -f /var/log/quote0/scheduled-update.log`

### EventBridge Not Triggering Lambda

**Check**:
1. EventBridge rules exist: `aws events list-rules`
2. Rules are enabled: Check `State: ENABLED`
3. Lambda has correct permissions
4. Check CloudWatch Logs: `/aws/lambda/quote0-api-dev-scheduledUpdate`

### Updates Taking Too Long

**Investigate**:
- Bin API latency (add timeout logging)
- Database query performance (add indexing)
- Network latency to Quote/0 device
- Optimize: Add caching, increase timeouts

---

For implementation code examples, see [04-implementation.md](./04-implementation.md).  
For deployment configuration, see [05-deployment.md](./05-deployment.md).
