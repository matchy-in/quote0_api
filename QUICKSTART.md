# Quote0 API - Quick Start Guide

Get your serverless Quote0 API running in **under 10 minutes**! 🚀

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
QUOTE0_TEXT_API=http://your-quote0-device-ip/text-api

# Optional: Custom configuration
READING_API_URL=https://api.reading.gov.uk/api/collections
CACHE_TTL_HOURS=12
```

**Note:** If you don't have Quote/0 device yet, leave `QUOTE0_TEXT_API` empty - the API will still work for testing.

---

## Step 3: Deploy to AWS (5 minutes)

```bash
# Deploy to development environment
npm run deploy:dev
```

**Expected Output:**
```
✔ Service deployed to stack quote0-api-dev

endpoints:
  GET - https://abc123.execute-api.us-east-1.amazonaws.com/api/display
  PUT - https://abc123.execute-api.us-east-1.amazonaws.com/api/events

functions:
  getDisplay: quote0-api-dev-getDisplay
  createEvent: quote0-api-dev-createEvent
  scheduledUpdate: quote0-api-dev-scheduledUpdate

resources:
  EventsTable: quote0-api-dev-events (DynamoDB)
```

**🎉 That's it! Your API is live!**

---

## Step 4: Test Your API (2 minutes)

### Test GET Endpoint (Quote/0 Display Data)

```bash
curl https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/api/display
```

**Expected Response:**
```json
{
  "refreshNow": false,
  "title": "2026/02/03",
  "signature": "collect Red bin tmr",
  "message": "\n\n"
}
```

### Test PUT Endpoint (Create Event)

```bash
curl -X PUT https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026/02/10",
    "event": "Dentist appointment 3pm\nBring insurance card"
  }'
```

**Expected Response:**
```json
{
  "date": "2026-02-10",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "event": "Dentist appointment 3pm\nBring insurance card",
  "created_at": "2026-02-03T10:30:00.000Z",
  "ttl": 1744243200
}
```

### Verify Event in DynamoDB

```bash
aws dynamodb scan --table-name quote0-api-dev-events
```

---

## Step 5: Configure Quote/0 Device

Point your Quote/0 device to your API endpoint:

**API Endpoint:**
```
https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/api/display
```

**Update Interval:** Every 60 minutes

The device will automatically pull display data hourly, and receive scheduled pushes at:
- 01:10 UTC
- 07:10 UTC
- 12:10 UTC
- 17:10 UTC

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

### View DynamoDB Table

```bash
# List all events
aws dynamodb scan --table-name quote0-api-dev-events

# Query events for specific date
aws dynamodb query \
  --table-name quote0-api-dev-events \
  --key-condition-expression "#date = :date" \
  --expression-attribute-names '{"#date":"date"}' \
  --expression-attribute-values '{":date":{"S":"2026-02-10"}}'
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
- [ ] Configure `QUOTE0_TEXT_API` with production device URL
- [ ] Test all endpoints thoroughly
- [ ] Verify EventBridge schedules are enabled
- [ ] Set up CloudWatch alarms (optional)
- [ ] Configure API Gateway throttling (optional)

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
- DynamoDB table (and all events)
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

# Check if rules are enabled
aws events describe-rule --name quote0-api-dev-schedule-0710
```

### Issue: Quote/0 device not updating

**Solution:** 
1. Check `QUOTE0_TEXT_API` environment variable is set
2. Verify device is reachable from internet
3. Check Lambda logs for errors:
   ```bash
   aws logs tail /aws/lambda/quote0-api-dev-scheduledUpdate --since 1h
   ```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│  EventBridge (Cron)                              │
│  01:10, 07:10, 12:10, 17:10 UTC                 │
└───────────────────┬──────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│  Lambda: scheduledUpdate                         │
│  1. Fetch bin collections (Reading API)         │
│  2. Query today's events (DynamoDB)              │
│  3. Format display data                          │
│  4. Push to Quote/0 device                       │
└──────────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
    DynamoDB    Reading API  Quote/0
     Events                   Device
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
| EventBridge | 120 invocations | Free |
| CloudWatch Logs | 5GB | $0.50 |
| **Total** | | **~$1.18/month** |

**Free Tier:** Most of this is covered by AWS Free Tier for first 12 months!

---

## Next Steps

1. **Configure iPhone App** - Use the PUT endpoint to create events
2. **Customize Schedule** - Edit `serverless.yml` to change trigger times
3. **Add More Events** - Test with multiple events for different dates
4. **Monitor Usage** - Check CloudWatch metrics and logs
5. **Read Full Docs** - See `docs/` folder for detailed documentation

---

## Support & Resources

- **Documentation**: See `docs/` folder
- **Issues**: Check Lambda logs in CloudWatch
- **API Reference**: `docs/02-api-reference.md`
- **Architecture**: `docs/01-architecture.md`

---

**🎉 Congratulations! Your Quote0 API is running!**

Your Quote/0 device will now automatically display:
- Today's events from your database
- Tomorrow's bin collection reminders
- All updated 4 times daily plus hourly on-demand

Enjoy your automated household reminder system! 🏠✨
