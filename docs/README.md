# Quote0 API - Microservice Documentation

## Overview

A **serverless** microservice that **pushes** display updates to the Quote/0 reminder device, with automatic bin collection schedule integration using **AWS Lambda**, **DynamoDB**, and **EventBridge**.

> **Architecture**: This is a **push-only** system. Lambda functions actively push updates to Quote/0 via the official Quote/0 Text API. The Quote/0 device does NOT call this API.

## Key Features

- 🕐 **Daily Scheduled Sync**: Automatic bin collection fetch and Quote/0 update at 01:10 UTC
- 🗑️ **Bin Collection Storage**: Stores Reading Council bin data in DynamoDB for on-demand access
- 📅 **Event Management**: iPhone app creates events (single or batch) and triggers immediate Quote/0 update
- 📟 **Quote/0 Display**: Formatted output (25 char header, 3×27 char lines, 29 char footer)
- ☁️ **Fully Serverless**: AWS Lambda + DynamoDB + EventBridge (no servers to manage)

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│  Daily Scheduled Service (01:10 UTC)                      │
│  ↓                                                         │
│  1. Fetch bin collections from Reading API                │
│  2. Store in DynamoDB bin_collection table                │
│  3. Query tomorrow's bins from DB                         │
│  4. Query today's events from DB                          │
│  5. Format display data                                   │
│  6. Push to Quote/0 device                                │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│  POST /api/events (iPhone app - Single Event)            │
│  ↓                                                         │
│  1. Insert event to DynamoDB events table                 │
│  2. Query tomorrow's bins from DB                         │
│  3. Query today's events from DB                          │
│  4. Format display data                                   │
│  5. Push to Quote/0 device                                │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│  POST /api/events/batch (iPhone app - Multiple Events)   │
│  ↓                                                         │
│  1. Insert all events to DynamoDB events table            │
│  2. Query tomorrow's bins from DB                         │
│  3. Query today's events from DB                          │
│  4. Format display data                                   │
│  5. Push to Quote/0 device                                │
└───────────────────────────────────────────────────────────┘
```

## Table of Contents

1. [System Architecture](./01-architecture.md) - Serverless design and components
2. [API Reference](./02-api-reference.md) - POST /api/events and /api/events/batch endpoint documentation
3. [Scheduled Service](./03-scheduled-service.md) - Daily scheduled sync implementation
4. [Implementation Guide](./04-implementation.md) - Step-by-step setup instructions
5. [Deployment Guide](./05-deployment.md) - AWS Lambda deployment

## Quick Start

### Prerequisites
- Node.js 18+
- AWS account with CLI configured
- Serverless Framework installed
- Quote/0 device with Text API endpoint

### Installation

```bash
# Clone repository
git clone <repository-url>
cd quote0_api

# Install dependencies
npm install

# Configure environment variables
# Create .env file with:
# UPRN=310022781
# QUOTE0_TEXT_API=your-quote0-endpoint

# Deploy to AWS
npm run deploy:dev

# View logs
npm run logs
```

**⚡ See [QUICKSTART.md](../QUICKSTART.md) for complete 10-minute setup guide!**

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/events` | Create single event and update Quote/0 (called by iPhone app) |
| POST | `/api/events/batch` | Create multiple events and update Quote/0 (batch operation) |

**Note**: No GET endpoint - this is a push-only architecture!

### Display Format

Quote/0 device receives (via Text API):

```json
{
  "refreshNow": false,
  "title": "2026/02/10",
  "signature": "collect Food waste, Red bin tmr",
  "message": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}
```

**Constraints:**
- `title`: 25 characters max (today's date)
- `message`: 3 lines × 27 characters (events for today)
- `signature`: 29 characters (tomorrow's bin collection)
- Line breaks: Use `\n`

## Scheduled Service

The microservice automatically syncs and updates Quote/0 at:
- **01:10 UTC** - Daily bin collection sync and display update

## DynamoDB Tables

### 1. events Table
- **Primary Key**: `date` (YYYY-MM-DD) + `id` (UUID)
- **Purpose**: Store user-created events
- **TTL**: Auto-delete 90 days after event date

### 2. bin_collection Table
- **Primary Key**: `date` (YYYY-MM-DD) + `service` (service name)
- **Purpose**: Store bin collection schedules from Reading API
- **TTL**: Auto-delete 90 days after collection date

## Service Mapping

Bin collection services are mapped to friendly names:

| API Service | Display Name |
|-------------|--------------|
| Domestic Waste Collection Service | Grey bin |
| Recycling Collection Service | Red bin |
| Food Waste Collection Service | Food waste |

## External Dependencies

- **Reading Council API**: `https://api.reading.gov.uk/api/collections/310022781`
- **Quote/0 Text API**: Device-specific endpoint for display updates

## Project Status

- **Version**: 1.0.0
- **Status**: Active Development
- **Architecture**: Push-only (Serverless)

---

For detailed documentation, see the individual guide files in this directory.
