# Quote0 API - Microservice Documentation

## Overview

A **serverless** microservice that displays upcoming events on Quote/0 reminder device, with automatic bin collection schedule integration using **AWS Lambda** and **DynamoDB**.

## Key Features

- 🕐 **Scheduled Updates**: Automatic updates at 01:10, 07:10, 12:10, 17:10 daily
- 🗑️ **Bin Collection Integration**: Fetches tomorrow's bin collection schedule from Reading Council API
- 📅 **Event Management**: Store and display custom events via iPhone PUT endpoint
- 📟 **Quote/0 Display**: Formatted output for Quote/0 device (25 char header, 3×29 char lines, footer)
- ⏱️ **On-Demand Updates**: Quote/0 can request updates hourly via GET endpoint

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Scheduled Service (Cron)                               │
│  Triggers: 01:10, 07:10, 12:10, 17:10                  │
│  ↓                                                       │
│  1. Fetch bin collection data                           │
│  2. Query today's events from DB                        │
│  3. Format and push to Quote/0                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  GET /api/display                                       │
│  Quote/0 pulls data hourly                             │
│  Returns: formatted display JSON                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  PUT /api/events                                        │
│  iPhone app adds new events                            │
│  Body: { date, event }                                  │
└─────────────────────────────────────────────────────────┘
```

## Table of Contents

1. [System Architecture](./01-architecture.md) - Microservice design and components
2. [API Reference](./02-api-reference.md) - Complete API documentation
3. [Scheduled Service](./03-scheduled-service.md) - Cron job implementation details
4. [Implementation Guide](./04-implementation.md) - Step-by-step setup instructions
5. [Deployment Guide](./05-deployment.md) - AWS Lambda and server deployment

## Quick Start

### Prerequisites
- Node.js 18+
- AWS account with CLI configured
- Serverless Framework installed
- Quote/0 device (optional for initial testing)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd quote0_api

# Install dependencies
npm install

# Configure environment
# Edit .env with UPRN and QUOTE0_TEXT_API

# Deploy to AWS
npm run deploy:dev

# View logs
npm run logs
```

**⚡ See [QUICKSTART.md](../QUICKSTART.md) for complete 10-minute setup guide!**

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/display` | Get current display data (called by Quote/0 hourly) |
| PUT | `/api/events` | Add new event (called by iPhone app) |

### Display Format

Quote/0 device receives:

```json
{
  "refreshNow": false,
  "title": "2026/02/10",
  "signature": "collect Food waste, Red bin tmr",
  "message": "AE Maths 3 upto page 63\nclass book week 20\nAE VR 3 chapter letter codes"
}
```

**Constraints:**
- `title`: 25 characters max (typically today's date)
- `message`: 3 lines × 29 characters (events for today)
- `signature`: 29 characters (tomorrow's bin collection)
- Line breaks: Use `\n`

## Scheduled Service Times

The microservice automatically updates Quote/0 at:
- **01:10** - Early morning update
- **07:10** - Morning update (before typical workday)
- **12:10** - Midday update
- **17:10** - Evening update

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
- **License**: MIT (or your choice)

---

For detailed documentation, see the individual guide files in this directory.
