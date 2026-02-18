# Implementation Guide

## Overview

This guide provides step-by-step instructions to implement the Quote0 API microservice from scratch.

---

## Prerequisites

- **Node.js** 18+ (or Python 3.9+)
- **Database**: PostgreSQL, MySQL, or SQLite
- **Git** for version control
- **Text editor**: VS Code, Vim, or your preference
- **Terminal** access

---

## Step 1: Project Setup

### Create Project Structure

```bash
# Create project directory
mkdir quote0_api
cd quote0_api

# Initialize Node.js project
npm init -y

# Create directory structure
mkdir -p src/{services,handlers,config,scripts}
mkdir -p database
mkdir -p tests
mkdir -p logs

# Initialize git
git init
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore
echo "logs/" >> .gitignore
echo "*.log" >> .gitignore
```

**Final Structure**:
```
quote0_api/
├── src/
│   ├── services/           # Business logic services
│   ├── handlers/           # API route handlers
│   ├── config/             # Configuration files
│   ├── scripts/            # Utility scripts
│   ├── app.js              # Main Express app
│   └── scheduler.js        # Cron scheduler
├── database/
│   └── schema.sql          # Database schema
├── tests/                  # Unit tests
├── logs/                   # Application logs
├── .env                    # Environment variables
├── .env.example            # Environment template
├── package.json
└── README.md
```

### Install Dependencies

```bash
# Core dependencies
npm install express body-parser dotenv axios pg node-cron

# Development dependencies
npm install --save-dev nodemon jest supertest
```

**package.json** scripts:
```json
{
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js",
    "test": "jest",
    "db:setup": "node src/scripts/db-setup.js"
  }
}
```

---

## Step 2: Configuration

### Environment Variables

Create **`.env.example`**:
```env
# Server
NODE_ENV=development
PORT=8080
HOST=0.0.0.0

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quote0_db
DB_USER=quote0_user
DB_PASSWORD=your_password_here

# External APIs
UPRN=310022781
READING_API_URL=https://api.reading.gov.uk/api/collections
READING_API_TIMEOUT=5000

# Quote/0 Device
QUOTE0_TEXT_API=http://your-quote0-device-ip/text-api

# Cache
CACHE_TTL_HOURS=12
```

Create **`.env`** (copy from example and fill in actual values):
```bash
cp .env.example .env
# Edit .env with actual values
```

### Configuration Module

Create **`src/config/config.js`**:
```javascript
require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 8080,
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development'
  },
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'quote0_db',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  
  readingApi: {
    uprn: process.env.UPRN || '310022781',
    baseUrl: process.env.READING_API_URL || 'https://api.reading.gov.uk/api/collections',
    timeout: parseInt(process.env.READING_API_TIMEOUT) || 5000
  },
  
  quote0: {
    textApiUrl: process.env.QUOTE0_TEXT_API,
    maxTitleLength: 25,
    maxLineLength: 29,
    maxLines: 3
  },
  
  cache: {
    ttlHours: parseInt(process.env.CACHE_TTL_HOURS) || 12
  }
};
```

---

## Step 3: Database Setup

### Create Schema

Create **`database/schema.sql`**:
```sql
-- Events table
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    event TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast date-based queries
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- Optional: Cache table (alternative to in-memory cache)
CREATE TABLE IF NOT EXISTS cache (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
```

### Database Setup Script

Create **`src/scripts/db-setup.js`**:
```javascript
const fs = require('fs');
const { Pool } = require('pg');
const config = require('../config/config');

async function setupDatabase() {
  const pool = new Pool(config.database);
  
  try {
    console.log('Connecting to database...');
    const client = await pool.connect();
    
    console.log('Reading schema file...');
    const schema = fs.readFileSync('./database/schema.sql', 'utf8');
    
    console.log('Executing schema...');
    await client.query(schema);
    
    console.log('✅ Database setup complete!');
    
    client.release();
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
```

**Run setup**:
```bash
npm run db:setup
```

---

## Step 4: Implement Core Services

### Database Service

Create **`src/services/databaseService.js`**:
```javascript
const { Pool } = require('pg');
const config = require('../config/config');

const pool = new Pool(config.database);

class DatabaseService {
  async query(text, params) {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Database query executed:', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async getEventsByDate(date) {
    const result = await this.query(
      'SELECT * FROM events WHERE date = $1 ORDER BY id ASC',
      [date]
    );
    return result.rows;
  }

  async createEvent(date, event) {
    const result = await this.query(
      'INSERT INTO events (date, event) VALUES ($1, $2) RETURNING *',
      [date, event]
    );
    return result.rows[0];
  }

  async close() {
    await pool.end();
  }
}

module.exports = new DatabaseService();
```

### Bin Collection Service

Create **`src/services/binCollectionService.js`**:
```javascript
const axios = require('axios');
const config = require('../config/config');

// Simple in-memory cache
let cache = {
  data: null,
  timestamp: null
};

const SERVICE_MAPPING = {
  'Domestic Waste Collection Service': 'Grey bin',
  'Recycling Collection Service': 'Red bin',
  'Food Waste Collection Service': 'Food waste'
};

class BinCollectionService {
  async fetchCollections() {
    // Check cache
    if (this.isCacheValid()) {
      console.log('Using cached bin collection data');
      return cache.data;
    }

    try {
      const url = `${config.readingApi.baseUrl}/${config.readingApi.uprn}`;
      console.log('Fetching bin collections from:', url);

      const response = await axios.get(url, {
        timeout: config.readingApi.timeout,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Quote0-API/1.0'
        }
      });

      if (!response.data.success) {
        throw new Error('API returned unsuccessful response');
      }

      const collections = response.data.collections;
      
      // Update cache
      cache = {
        data: collections,
        timestamp: Date.now()
      };

      console.log(`Fetched ${collections.length} bin collections`);
      return collections;
    } catch (error) {
      console.error('Failed to fetch bin collections:', error.message);
      
      // Return cached data even if expired
      if (cache.data) {
        console.warn('Using expired cache due to API failure');
        return cache.data;
      }
      
      throw error;
    }
  }

  async getTomorrowCollections() {
    try {
      const collections = await this.fetchCollections();
      const tomorrow = this.getTomorrowDate();
      
      const tomorrowCollections = collections
        .filter(c => this.parseDate(c.date).toDateString() === tomorrow.toDateString())
        .map(c => ({
          service: SERVICE_MAPPING[c.service] || c.service,
          originalService: c.service,
          date: c.date,
          day: c.day
        }));

      console.log(`Found ${tomorrowCollections.length} collections for tomorrow`);
      return tomorrowCollections;
    } catch (error) {
      console.error('Error getting tomorrow collections:', error);
      return []; // Return empty array on failure
    }
  }

  parseDate(dateString) {
    // Parse "03/02/2026 00:00:00" format
    const [datePart] = dateString.split(' ');
    const [day, month, year] = datePart.split('/');
    return new Date(year, month - 1, day);
  }

  getTomorrowDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  isCacheValid() {
    if (!cache.data || !cache.timestamp) {
      return false;
    }
    
    const age = Date.now() - cache.timestamp;
    const maxAge = config.cache.ttlHours * 60 * 60 * 1000;
    return age < maxAge;
  }
}

module.exports = new BinCollectionService();
```

### Display Formatter Service

Create **`src/services/displayFormatterService.js`**:
```javascript
const config = require('../config/config');

class DisplayFormatterService {
  formatDisplay(events, binCollections) {
    const title = this.formatTitle();
    const message = this.formatMessage(events);
    const signature = this.formatSignature(binCollections);

    return {
      refreshNow: false,
      title,
      message,
      signature
    };
  }

  formatTitle() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    return `${year}/${month}/${day}`;
  }

  formatMessage(events) {
    const lines = [];
    
    // Process up to 3 events
    for (let i = 0; i < Math.min(events.length, config.quote0.maxLines); i++) {
      const eventText = events[i].event || '';
      
      // Split event text by newlines
      const eventLines = eventText.split('\n');
      
      for (const line of eventLines) {
        if (lines.length >= config.quote0.maxLines) break;
        
        // Truncate line to max length
        const truncated = line.substring(0, config.quote0.maxLineLength);
        lines.push(truncated);
      }
      
      if (lines.length >= config.quote0.maxLines) break;
    }
    
    // Pad with empty lines if needed
    while (lines.length < config.quote0.maxLines) {
      lines.push('');
    }
    
    return lines.join('\n');
  }

  formatSignature(binCollections) {
    if (binCollections.length === 0) {
      return '';
    }

    const binNames = binCollections.map(bc => bc.service);
    const binsText = binNames.join(', ');
    const signature = `collect ${binsText} tmr`;

    // Truncate to max length
    return signature.substring(0, config.quote0.maxLineLength);
  }
}

module.exports = new DisplayFormatterService();
```

### Quote/0 Client Service

Create **`src/services/quote0ClientService.js`**:
```javascript
const axios = require('axios');
const config = require('../config/config');

class Quote0ClientService {
  async updateDisplay(displayData, attempt = 1) {
    if (!config.quote0.textApiUrl) {
      console.warn('Quote/0 text API URL not configured, skipping device update');
      return;
    }

    try {
      console.log('Sending update to Quote/0:', displayData);
      
      await axios.post(config.quote0.textApiUrl, displayData, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Successfully updated Quote/0 display');
    } catch (error) {
      console.error(`Failed to update Quote/0 (attempt ${attempt}):`, error.message);
      
      if (attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await this.sleep(delay);
        return await this.updateDisplay(displayData, attempt + 1);
      }
      
      console.error('❌ Failed to update Quote/0 after 3 attempts');
      // Don't throw - device can pull via GET endpoint
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new Quote0ClientService();
```

### Scheduled Update Service

Create **`src/services/scheduledUpdateService.js`**:
```javascript
const binCollectionService = require('./binCollectionService');
const databaseService = require('./databaseService');
const displayFormatterService = require('./displayFormatterService');
const quote0ClientService = require('./quote0ClientService');

class ScheduledUpdateService {
  async executeUpdate() {
    const startTime = Date.now();
    console.log('='.repeat(80));
    console.log(`[${new Date().toISOString()}] Scheduled update starting...`);
    console.log('='.repeat(80));

    try {
      // Step 1: Fetch tomorrow's bin collections
      const binCollections = await binCollectionService.getTomorrowCollections();

      // Step 2: Query today's events
      const today = new Date().toISOString().split('T')[0];
      const events = await databaseService.getEventsByDate(today);
      console.log(`Found ${events.length} events for today`);

      // Step 3: Format display data
      const displayData = displayFormatterService.formatDisplay(events, binCollections);
      console.log('Display data formatted:', JSON.stringify(displayData, null, 2));

      // Step 4: Push to Quote/0
      await quote0ClientService.updateDisplay(displayData);

      const duration = Date.now() - startTime;
      console.log('='.repeat(80));
      console.log(`[${new Date().toISOString()}] ✅ Update completed in ${duration}ms`);
      console.log('='.repeat(80));

      return { success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('='.repeat(80));
      console.error(`[${new Date().toISOString()}] ❌ Update failed after ${duration}ms`);
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('='.repeat(80));

      return { success: false, error: error.message };
    }
  }
}

module.exports = new ScheduledUpdateService();
```

---

## Step 5: Implement API Handlers

### GET /api/display Handler

Create **`src/handlers/displayHandler.js`**:
```javascript
const binCollectionService = require('../services/binCollectionService');
const databaseService = require('../services/databaseService');
const displayFormatterService = require('../services/displayFormatterService');

async function getDisplay(req, res) {
  try {
    console.log('[GET /api/display] Request received');

    // Fetch tomorrow's bin collections
    const binCollections = await binCollectionService.getTomorrowCollections();

    // Query today's events
    const today = new Date().toISOString().split('T')[0];
    const events = await databaseService.getEventsByDate(today);

    // Format display data
    const displayData = displayFormatterService.formatDisplay(events, binCollections);

    console.log('[GET /api/display] Response:', displayData);
    res.json(displayData);
  } catch (error) {
    console.error('[GET /api/display] Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch display data'
    });
  }
}

module.exports = { getDisplay };
```

### PUT /api/events Handler

Create **`src/handlers/eventsHandler.js`**:
```javascript
const databaseService = require('../services/databaseService');

function validateDate(dateString) {
  // Accept YYYY/MM/DD or YYYY-MM-DD
  const regex1 = /^\d{4}\/\d{2}\/\d{2}$/;
  const regex2 = /^\d{4}-\d{2}-\d{2}$/;
  
  if (!regex1.test(dateString) && !regex2.test(dateString)) {
    return false;
  }
  
  // Parse and validate date
  const normalizedDate = dateString.replace(/\//g, '-');
  const date = new Date(normalizedDate);
  return date instanceof Date && !isNaN(date);
}

function normalizeDate(dateString) {
  // Convert YYYY/MM/DD to YYYY-MM-DD
  return dateString.replace(/\//g, '-');
}

async function createEvent(req, res) {
  try {
    console.log('[PUT /api/events] Request:', req.body);

    const { date, event } = req.body;

    // Validation
    if (!date) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required field: date'
      });
    }

    if (!event) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required field: event'
      });
    }

    if (!validateDate(date)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid date format. Use YYYY/MM/DD or YYYY-MM-DD'
      });
    }


    if (event.length > 81) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Event text exceeds maximum length of 81 characters'
      });
    }

    // Normalize date format
    const normalizedDate = normalizeDate(date);

    // Create event
    const createdEvent = await databaseService.createEvent(normalizedDate, event);

    console.log('[PUT /api/events] Event created:', createdEvent);
    res.status(201).json(createdEvent);
  } catch (error) {
    console.error('[PUT /api/events] Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create event'
    });
  }
}

module.exports = { createEvent };
```

---

## Step 6: Create Express App

Create **`src/app.js`**:
```javascript
const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config/config');
const displayHandler = require('./handlers/displayHandler');
const eventsHandler = require('./handlers/eventsHandler');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.get('/api/display', displayHandler.getDisplay);
app.put('/api/events', eventsHandler.createEvent);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

module.exports = app;
```

---

## Step 7: Add Scheduler

Create **`src/scheduler.js`**:
```javascript
const cron = require('node-cron');
const scheduledUpdateService = require('./services/scheduledUpdateService');

function startScheduler() {
  console.log('Starting scheduler...');

  // Schedule at 01:10, 07:10, 12:10, 17:10 daily
  const times = ['1', '7', '12', '17'];

  times.forEach(hour => {
    cron.schedule(`10 ${hour} * * *`, async () => {
      console.log(`\n🕐 Scheduled update triggered at ${hour}:10`);
      await scheduledUpdateService.executeUpdate();
    });
  });

  console.log('✅ Scheduler started: Updates at 01:10, 07:10, 12:10, 17:10');
}

module.exports = { startScheduler };
```

---

## Step 8: Create Main Entry Point

Create **`src/index.js`**:
```javascript
const app = require('./app');
const { startScheduler } = require('./scheduler');
const config = require('./config/config');

// Start scheduler
startScheduler();

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
  console.log('='.repeat(80));
  console.log(`🚀 Quote0 API server running`);
  console.log(`   URL: http://${config.server.host}:${config.server.port}`);
  console.log(`   Environment: ${config.server.env}`);
  console.log(`   Scheduled updates: 01:10, 07:10, 12:10, 17:10`);
  console.log('='.repeat(80));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
```

Update **`package.json`** to use `src/index.js`:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  }
}
```

---

## Step 9: Run and Test

### Start Development Server

```bash
npm run dev
```

**Expected Output**:
```
================================================================================
🚀 Quote0 API server running
   URL: http://0.0.0.0:8080
   Environment: development
   Scheduled updates: 01:10, 07:10, 12:10, 17:10
================================================================================
Starting scheduler...
✅ Scheduler started: Updates at 01:10, 07:10, 12:10, 17:10
```

### Test GET Endpoint

```bash
curl http://localhost:8080/api/display
```

**Expected Response**:
```json
{
  "refreshNow": false,
  "title": "2026/02/03",
  "signature": "collect Red bin tmr",
  "message": "\n\n"
}
```

### Test PUT Endpoint

```bash
curl -X PUT http://localhost:8080/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026/02/10",
    "event": "Dentist appointment 3pm"
  }'
```

**Expected Response**:
```json
{
  "id": 1,
  "date": "2026-02-10",
  "event": "Dentist appointment 3pm",
  "created_at": "2026-02-03T10:30:00.000Z"
}
```

### Test Health Check

```bash
curl http://localhost:8080/health
```

---

## Next Steps

1. **Deploy to Production** - See [05-deployment.md](./05-deployment.md)
2. **Configure Quote/0 Device** - Point to your API endpoint
3. **Setup iPhone App** - Integrate with PUT /api/events
4. **Monitor Logs** - Check scheduled update execution

---

Your Quote0 API is now ready! 🎉
