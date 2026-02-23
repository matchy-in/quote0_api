# Quote0 API - Quick Start Guide

Get your serverless Quote0 API running in **under 10 minutes**!

---

## Prerequisites

- **AWS Account** with CLI configured
- **Node.js 18+** installed
- **Quote/0 Device** (optional for testing)

---

## Step 1: Clone and Install (2 minutes)

```bash
# Navigate to project
cd quote0_api

# Install dependencies
npm install
```

---

## Step 2: Configure Environment (1 minute)

Create `.env` file (copy from `.env.example`):

```bash
# Required: Your UPRN for bin collection API
UPRN=310022781

# Required: Quote/0 device text API endpoint
QUOTE0_TEXT_API=https://dot.mindreset.tech/api/authV2/open/device/YOUR_DEVICE_ID/text

# Required: Quote/0 device bearer token
QUOTE0_AUTH_TOKEN=your_quote0_bearer_token

# Required: API authorization token (protects your endpoints)
API_AUTH_TOKEN=your-secret-api-key

# Optional: Custom configuration
READING_API_URL=https://api.reading.gov.uk/api/collections
CACHE_TTL_HOURS=12
```

**Note:** If you don't have a Quote/0 device yet, leave `QUOTE0_TEXT_API` empty - the API will still work for testing.

---

## Step 3: Deploy to AWS (5 minutes)

```bash
# Deploy to development environment
npm run deploy:dev
```

**Expected Output:**
```
Service deployed to stack quote0-api-dev

endpoints:
  POST - https://abc123.execute-api.us-east-1.amazonaws.com/api/events
  POST - https://abc123.execute-api.us-east-1.amazonaws.com/api/events/batch
  POST - https://abc123.execute-api.us-east-1.amazonaws.com/test/scheduled-update

functions:
  createEvent: quote0-api-dev-createEvent
  createEventsBatch: quote0-api-dev-createEventsBatch
  scheduledUpdate: quote0-api-dev-scheduledUpdate
  testScheduledUpdate: quote0-api-dev-testScheduledUpdate

resources:
  EventsTable: quote0-api-dev-events (DynamoDB)
  BinCollectionTable: quote0-api-dev-bin-collection (DynamoDB)
```

**That's it! Your API is live!**

---

## Step 4: Test Your API (2 minutes)

All HTTP endpoints require an `Authorization` header with your `API_AUTH_TOKEN`.

### Test POST /api/events (Create Event)

```bash
curl -X POST https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{
    "date": "2026/02/10",
    "event": "Dentist appointment 3pm\nBring insurance card"
  }'
```

**Expected Response (201):**
```json
{
  "date": "2026-02-10",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "event": "Dentist appointment 3pm\nBring insurance card",
  "created_at": "2026-02-03T10:30:00.000Z",
  "ttl": 1744243200,
  "quote0_updated": true
}
```

### Test POST /api/events/batch (Create Multiple Events)

```bash
curl -X POST https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{
    "events": [
      {"date": "2026/02/10", "event": "Maths homework p.63"},
      {"date": "2026/02/11", "event": "Doctor 2pm"}
    ]
  }'
```

### Verify Event in DynamoDB

```bash
aws dynamodb scan --table-name quote0-api-dev-events
```

---

## Step 5: Configure Quote/0 Device

The Quote/0 device receives updates via the scheduled Lambda function (01:10 UTC daily) and immediately after events are created. No device configuration is needed to point at this API -- the system pushes to the device.

The system pushes updates to Quote/0 at:
- **01:10 UTC** - Daily scheduled sync
- **On event creation** - Immediate push after POST /api/events or POST /api/events/batch

---

## Monitoring & Logs

### View Scheduled Update Logs

```bash
# Tail logs in real-time
npm run logs

# Or manually
aws logs tail /aws/lambda/quote0-api-dev-scheduledUpdate --follow
```

### View All Functions

```bash
# List deployed functions
serverless info --stage dev

# Invoke scheduled update manually (for testing)
serverless invoke --function scheduledUpdate --stage dev
```

### View DynamoDB Tables

```bash
# List all events
aws dynamodb scan --table-name quote0-api-dev-events

# List bin collections
aws dynamodb scan --table-name quote0-api-dev-bin-collection
```

---

## Deploy to Production

When ready for production:

```bash
# Deploy to production
npm run deploy:prod

# View production info
serverless info --stage prod

# View production logs
aws logs tail /aws/lambda/quote0-api-prod-scheduledUpdate --follow
```

**Production checklist:**
- [ ] Set `API_AUTH_TOKEN` to a strong random secret
- [ ] Configure `QUOTE0_TEXT_API` with production device URL
- [ ] Set `QUOTE0_AUTH_TOKEN` with production device token
- [ ] Test all endpoints thoroughly
- [ ] Verify EventBridge schedule is enabled
- [ ] Set up CloudWatch alarms (optional)

---

## Update Deployed Application

```bash
# Pull latest changes
git pull

# Install any new dependencies
npm install

# Redeploy
npm run deploy:dev  # or deploy:prod
```

---

## Remove/Cleanup

To remove the entire deployment:

```bash
# Remove development deployment
npm run remove:dev

# Remove production deployment
npm run remove:prod
```

**Warning:** This will delete:
- All Lambda functions
- DynamoDB tables (events and bin_collection) and all data
- API Gateway endpoints
- EventBridge rules
- CloudWatch logs

---

## Troubleshooting

### Issue: Deployment fails with "Access Denied"

**Solution:** Configure AWS credentials
```bash
aws configure
# Enter your AWS Access Key ID and Secret Access Key
```

### Issue: DynamoDB table not created

**Solution:** Check IAM permissions - your AWS user needs DynamoDB permissions
```bash
# View CloudFormation stack events
aws cloudformation describe-stack-events \
  --stack-name quote0-api-dev \
  --max-items 10
```

### Issue: Scheduled updates not running

**Solution:** Check EventBridge rules
```bash
# List rules
aws events list-rules --name-prefix quote0-api-dev

# Check if rule is enabled
aws events describe-rule --name quote0-api-dev-schedule-0110
```

### Issue: 401 Unauthorized on API calls

**Solution:**
1. Check that `API_AUTH_TOKEN` is set in your environment / `.env` file
2. Ensure you're sending the `Authorization: Bearer <token>` header
3. Redeploy if you changed the `.env` file: `npm run deploy:dev`

### Issue: Quote/0 device not updating

**Solution:**
1. Check `QUOTE0_TEXT_API` environment variable is set
2. Check `QUOTE0_AUTH_TOKEN` is correct
3. Check Lambda logs for errors:
   ```bash
   aws logs tail /aws/lambda/quote0-api-dev-scheduledUpdate --since 1h
   ```

---

## Architecture Overview

```
                    EventBridge (01:10 UTC)
                           |
                           v
┌──────────────────────────────────────────────┐
│  Lambda: scheduledUpdate                     │
│  1. Fetch bin collections (Reading API)      │
│  2. Store in DynamoDB bin_collection table    │
│  3. Query tomorrow's bins from DB            │
│  4. Query today's events from DB             │
│  5. Format display data                      │
│  6. Push to Quote/0 device                   │
└──────────────────────────────────────────────┘
              |              |             |
              v              v             v
          DynamoDB      Reading API     Quote/0
       (events +                        Device
        bin_collection)
```

---

## Cost Estimate

**Monthly cost for typical usage:**

| Component | Usage | Cost |
|-----------|-------|------|
| Lambda executions | ~1,000/month | $0.20 |
| Lambda compute (512MB) | ~2000 GB-seconds | $0.17 |
| API Gateway | ~1,000 requests | $0.01 |
| DynamoDB | ~150 writes, ~900 reads | $0.30 |
| EventBridge | 30 invocations | Free |
| CloudWatch Logs | 5GB | $0.50 |
| **Total** | | **~$1.18/month** |

**Free Tier:** Most of this is covered by AWS Free Tier for first 12 months!

---

## Next Steps

1. **Configure iPhone App** - Use the POST /api/events endpoint to create events
2. **Customize Schedule** - Edit `serverless.yml` to change trigger times
3. **Add More Events** - Test with single and batch event creation
4. **Monitor Usage** - Check CloudWatch metrics and logs
5. **Read Full Docs** - See `docs/` folder for detailed documentation

---

## Support & Resources

- **Documentation**: See `docs/` folder
- **Issues**: Check Lambda logs in CloudWatch
- **API Reference**: `docs/02-api-reference.md`
- **Architecture**: `docs/01-architecture.md`
- **Batch Events**: `BATCH-EVENTS-GUIDE.md`

---

See [QUICKSTART.md](./QUICKSTART.md) to get started in 10 minutes!
