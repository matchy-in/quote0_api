# Quote0 API - Complete Serverless Package

## What's Been Created

### Production-Ready Code

#### Core Configuration
- **serverless.yml** - Complete AWS infrastructure (Lambda, DynamoDB, EventBridge, API Gateway)
- **package.json** - All dependencies and npm scripts
- **.gitignore** - Git configuration
- **.env.example** - Environment variable template

#### Lambda Handlers & Services
- **src/lambda/handlers.js** - All Lambda function handlers with Bearer token authorization
- **src/services/dynamoDbService.js** - DynamoDB operations for events (AWS SDK v3)
- **src/services/binCollectionDbService.js** - DynamoDB operations for bin collections
- **src/services/binCollectionService.js** - Reading Council API integration
- **src/services/displayFormatterService.js** - Quote/0 display formatting
- **src/services/quote0ClientService.js** - Quote/0 device communication (with Bearer auth)
- **src/services/scheduledUpdateService.js** - Scheduled update orchestration

### Complete Documentation

#### Quick References
- **README.md** - Project overview and quick links
- **QUICKSTART.md** - 10-minute deployment guide
- **BATCH-EVENTS-GUIDE.md** - Batch event creation guide
- **PROJECT-SUMMARY.md** - This file!

#### Detailed Guides
- **docs/README.md** - Documentation index
- **docs/01-architecture.md** - System architecture
- **docs/02-api-reference.md** - Complete API documentation
- **docs/03-scheduled-service.md** - EventBridge scheduling details
- **docs/04-implementation.md** - Development guide
- **docs/05-deployment.md** - Deployment instructions

---

## Architecture Highlights

### Serverless Stack
```
AWS Lambda (Node.js 18)
    |
AWS API Gateway HTTP API (with Bearer token auth)
    |
Amazon DynamoDB (Pay-per-request)
    |
AWS EventBridge (Cron schedule)
```

### Key Features
- **Push-only architecture** - Lambda pushes to Quote/0 via official Text API
- **No servers to manage** - Fully serverless
- **API Authorization** - Bearer token on all HTTP endpoints
- **Auto-scaling** - Handles any traffic
- **Pay-per-use** - ~$1.18/month typical cost
- **High availability** - AWS managed
- **Auto-deletion** - Events and bin collections TTL after 90 days

---

## Next Steps

### 1. Configure Environment (2 minutes)

Create `.env` file:
```bash
UPRN=310022781
QUOTE0_TEXT_API=https://dot.mindreset.tech/api/authV2/open/device/YOUR_DEVICE_ID/text
QUOTE0_AUTH_TOKEN=your_quote0_device_token
API_AUTH_TOKEN=your-secret-api-key
```

### 2. Install Dependencies (1 minute)

```bash
npm install
```

### 3. Deploy to AWS (5 minutes)

```bash
# Configure AWS CLI if not done
aws configure

# Deploy
npm run deploy:dev
```

You'll get:
- API Gateway URL
- DynamoDB table names (events + bin_collection)
- Lambda function ARNs
- EventBridge rule configured (01:10 UTC daily)

### 4. Test Endpoints (2 minutes)

```bash
# Test POST /api/events (create single event)
curl -X POST https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{"date":"2026/02/10","event":"Test event"}'

# Test POST /api/events/batch (create multiple events)
curl -X POST https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{
    "events": [
      {"date":"2026/02/10","event":"Test event 1"},
      {"date":"2026/02/11","event":"Test event 2"}
    ]
  }'
```

### 5. Monitor Scheduled Updates

```bash
# View logs in real-time
npm run logs

# Check EventBridge rule
aws events list-rules --name-prefix quote0-api
```

---

## What This Deployment Includes

### AWS Resources Created

| Resource | Name | Purpose |
|----------|------|---------|
| **Lambda Functions** | | |
| - createEvent | `quote0-api-dev-createEvent` | POST /api/events handler |
| - createEventsBatch | `quote0-api-dev-createEventsBatch` | POST /api/events/batch handler |
| - scheduledUpdate | `quote0-api-dev-scheduledUpdate` | Scheduled push to Quote/0 |
| - testScheduledUpdate | `quote0-api-dev-testScheduledUpdate` | Dev test trigger |
| **DynamoDB Tables** | | |
| - Events | `quote0-api-dev-events` | Event storage |
| - Bin Collection | `quote0-api-dev-bin-collection` | Bin schedule storage |
| **EventBridge Rules** | | |
| - Schedule 01:10 | `quote0-api-dev-schedule-0110` | Daily trigger |
| **API Gateway** | | |
| - HTTP API | Auto-generated URL | REST API endpoints |
| **IAM Roles** | | |
| - Lambda execution role | Auto-generated | DynamoDB + CloudWatch permissions |

### Scheduled Updates

The system automatically pushes to Quote/0 at:
- **01:10 UTC** - Daily bin collection sync and display update

Additionally, Quote/0 is updated immediately when events are created via the API.

---

## Cost Breakdown

### Monthly Cost Estimate (Typical Usage)

| Service | Usage | Cost |
|---------|-------|------|
| **Lambda** | | |
| - Requests | ~1,000 | $0.20 |
| - Compute (512MB) | ~2,000 GB-seconds | $0.17 |
| **DynamoDB** | | |
| - Write requests | ~150 | $0.19 |
| - Read requests | ~900 | $0.11 |
| - Storage | < 1GB | $0.25 |
| **API Gateway** | | |
| - HTTP API requests | ~1,000 | $0.01 |
| **EventBridge** | 30 invocations/month | **Free** |
| **CloudWatch Logs** | ~5GB | $0.25 |
| **Total** | | **~$1.18/month** |

### Free Tier Benefits
For first 12 months of AWS account:
- Lambda: 1M requests/month free
- DynamoDB: 25GB storage + 25 RCU/WCU free
- API Gateway: 1M requests/month free
- CloudWatch: 5GB logs free

**Your usage likely fits entirely in Free Tier!**

---

## Testing Checklist

After deployment, verify:

- [ ] POST /api/events returns 201 with `quote0_updated: true`
- [ ] POST /api/events/batch returns 201 with batch results
- [ ] Requests without Authorization header return 401
- [ ] Requests with wrong token return 403
- [ ] Check DynamoDB events table has data: `aws dynamodb scan --table-name quote0-api-dev-events`
- [ ] Check EventBridge rule exists: `aws events list-rules --name-prefix quote0-api`
- [ ] View Lambda logs: `npm run logs`
- [ ] Test scheduled update: `serverless invoke --function scheduledUpdate --stage dev`

---

## Documentation Quick Reference

| What You Need | Where to Look |
|---------------|---------------|
| **Quick deployment** | [QUICKSTART.md](./QUICKSTART.md) |
| **System architecture** | [docs/01-architecture.md](./docs/01-architecture.md) |
| **API endpoints** | [docs/02-api-reference.md](./docs/02-api-reference.md) |
| **Batch events** | [BATCH-EVENTS-GUIDE.md](./BATCH-EVENTS-GUIDE.md) |
| **Scheduled service** | [docs/03-scheduled-service.md](./docs/03-scheduled-service.md) |
| **Development guide** | [docs/04-implementation.md](./docs/04-implementation.md) |
| **Deployment details** | [docs/05-deployment.md](./docs/05-deployment.md) |
| **Troubleshooting** | [QUICKSTART.md#troubleshooting](./QUICKSTART.md#troubleshooting) |

---

## Key Technologies Used

### AWS Services
- **Lambda** - Serverless compute
- **DynamoDB** - NoSQL database (events + bin_collection tables)
- **EventBridge** - Cron scheduling
- **API Gateway** - HTTP API
- **CloudWatch** - Logging and monitoring
- **IAM** - Security and permissions

### Node.js Packages
- **@aws-sdk/client-dynamodb** - DynamoDB client (v3)
- **@aws-sdk/lib-dynamodb** - Document client wrapper
- **axios** - HTTP client for external APIs
- **uuid** - Unique ID generation
- **serverless-offline** - Local development

### External Integrations
- **Reading Council Bin API** - Waste collection schedules
- **Quote/0 Text API** - Device display updates (with Bearer auth)

---

## Success Criteria

You're ready when:

- Deployment completes without errors
- POST /api/events creates events in DynamoDB and updates Quote/0
- POST /api/events/batch creates batch events
- Unauthorized requests are rejected (401/403)
- EventBridge rule is enabled (01:10 UTC)
- Lambda logs show scheduled updates running
- Quote/0 device shows correct data

---

## Troubleshooting Quick Fixes

### "Access Denied" during deployment
```bash
aws configure  # Re-enter credentials
```

### "401 Unauthorized" on API calls
Ensure you're sending `Authorization: Bearer YOUR_API_AUTH_TOKEN` header.

### Scheduled updates not running
```bash
aws events list-rules --name-prefix quote0-api-dev
aws events describe-rule --name quote0-api-dev-schedule-0110
```

### DynamoDB access errors
```bash
aws iam get-role --role-name quote0-api-dev-us-east-1-lambdaRole
```

### Quote/0 not updating
1. Check `QUOTE0_TEXT_API` environment variable is set
2. Check `QUOTE0_AUTH_TOKEN` is correct
3. Verify device is reachable
4. Check Lambda logs for errors

---

## Support

- **Documentation**: See `docs/` folder
- **Logs**: `npm run logs` or AWS CloudWatch
- **AWS Status**: https://status.aws.amazon.com/
- **Issues**: Check CloudWatch Logs for error details

---

**Your serverless Quote0 API is ready to deploy!**

See [QUICKSTART.md](./QUICKSTART.md) to get started in 10 minutes!
