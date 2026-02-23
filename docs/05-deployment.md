# Deployment Guide

## Overview

This guide covers deploying the Quote0 API to AWS using the Serverless Framework. The project uses a fully serverless architecture with Lambda, DynamoDB, API Gateway, and EventBridge.

---

## Prerequisites

- AWS account with CLI configured
- Node.js 18+ installed
- Serverless Framework installed (`npm install -g serverless`)
- Project dependencies installed (`npm install`)

---

## Step 1: Configure AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_DEFAULT_REGION=us-east-1
```

---

## Step 2: Configure Environment Variables

Create `.env` file with your configuration:

```bash
# Quote/0 Device
QUOTE0_TEXT_API=https://dot.mindreset.tech/api/authV2/open/device/YOUR_DEVICE_ID/text
QUOTE0_AUTH_TOKEN=your_quote0_bearer_token

# API Authorization
API_AUTH_TOKEN=your-secret-api-key

# Reading Council
UPRN=310022781
READING_API_URL=https://api.reading.gov.uk/api/collections
READING_API_TIMEOUT=5000
CACHE_TTL_HOURS=12
```

---

## Step 3: Deploy

### Development Deployment

```bash
npm run deploy:dev
```

### Production Deployment

```bash
npm run deploy:prod
```

### Expected Output

```
Deploying quote0-api to stage dev (us-east-1)

Service deployed to stack quote0-api-dev

endpoints:
  POST - https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/events
  POST - https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/events/batch
  POST - https://abc123xyz.execute-api.us-east-1.amazonaws.com/test/scheduled-update

functions:
  testScheduledUpdate: quote0-api-dev-testScheduledUpdate (1.5 MB)
  createEvent: quote0-api-dev-createEvent (1.5 MB)
  createEventsBatch: quote0-api-dev-createEventsBatch (1.5 MB)
  scheduledUpdate: quote0-api-dev-scheduledUpdate (1.5 MB)
```

---

## Step 4: Verify Deployment

### Test API Endpoints

```bash
# Test POST /api/events
curl -X POST https://YOUR-API-URL/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{"date":"2026/02/10","event":"Test from deployment"}'

# Test POST /api/events/batch
curl -X POST https://YOUR-API-URL/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" \
  -d '{
    "events": [
      {"date":"2026/02/10","event":"Test 1"},
      {"date":"2026/02/11","event":"Test 2"}
    ]
  }'

# Test authorization (should return 401)
curl -X POST https://YOUR-API-URL/api/events \
  -H "Content-Type: application/json" \
  -d '{"date":"2026/02/10","event":"No auth header"}'
```

### Verify DynamoDB Tables

```bash
# Check events table
aws dynamodb scan --table-name quote0-api-dev-events

# Check bin collection table
aws dynamodb scan --table-name quote0-api-dev-bin-collection
```

### Verify EventBridge Schedule

```bash
# Check rule exists and is enabled
aws events list-rules --name-prefix quote0-api-dev
```

---

## Step 5: View Logs

```bash
# Tail scheduled update logs
npm run logs

# Tail create event logs
npm run logs:create

# Tail batch event logs
npm run logs:batch

# Or use AWS CLI directly
aws logs tail /aws/lambda/quote0-api-dev-scheduledUpdate --follow
aws logs tail /aws/lambda/quote0-api-dev-createEvent --follow
aws logs tail /aws/lambda/quote0-api-dev-createEventsBatch --follow
```

---

## AWS Resources Created

| Resource | Name | Purpose |
|----------|------|---------|
| **Lambda Functions** | | |
| - createEvent | `quote0-api-{stage}-createEvent` | POST /api/events |
| - createEventsBatch | `quote0-api-{stage}-createEventsBatch` | POST /api/events/batch |
| - scheduledUpdate | `quote0-api-{stage}-scheduledUpdate` | Daily cron job |
| - testScheduledUpdate | `quote0-api-{stage}-testScheduledUpdate` | Dev test trigger |
| **DynamoDB Tables** | | |
| - Events | `quote0-api-{stage}-events` | Event storage |
| - Bin Collection | `quote0-api-{stage}-bin-collection` | Bin schedule storage |
| **EventBridge** | | |
| - Schedule | `quote0-api-{stage}-schedule-0110` | 01:10 UTC daily |
| **API Gateway** | | |
| - HTTP API | Auto-generated | REST API endpoints |
| **IAM** | | |
| - Lambda role | Auto-generated | DynamoDB + CloudWatch permissions |

---

## Updating a Deployment

```bash
# Pull latest code
git pull

# Install any new dependencies
npm install

# Redeploy
npm run deploy:dev  # or deploy:prod
```

To update a single function without full redeploy:

```bash
serverless deploy function --function createEvent --stage dev
```

---

## Environment Variable Updates

After changing `.env`:

```bash
# Redeploy to pick up new environment variables
npm run deploy:dev
```

Or update a specific Lambda's environment directly:

```bash
aws lambda update-function-configuration \
  --function-name quote0-api-dev-createEvent \
  --environment "Variables={API_AUTH_TOKEN=new-token,QUOTE0_TEXT_API=...}"
```

---

## Removing a Deployment

```bash
# Remove development
npm run remove:dev

# Remove production
npm run remove:prod
```

**Warning:** This permanently deletes:
- All Lambda functions
- DynamoDB tables (events + bin_collection) and all data
- API Gateway endpoints
- EventBridge rules
- CloudWatch log groups

---

## Monitoring

### CloudWatch Logs

```bash
# View recent logs
aws logs tail /aws/lambda/quote0-api-dev-scheduledUpdate --since 1h

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/quote0-api-dev-scheduledUpdate \
  --filter-pattern "ERROR"
```

### Lambda Metrics

```bash
# View function info
serverless info --stage dev

# View invocation metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=quote0-api-dev-scheduledUpdate \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

---

## Troubleshooting

### Deployment Fails with "Access Denied"

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Reconfigure if needed
aws configure
```

### EventBridge Not Triggering

```bash
# Check rule status
aws events describe-rule --name quote0-api-dev-schedule-0110

# Enable if disabled
aws events enable-rule --name quote0-api-dev-schedule-0110
```

### Lambda Timeout

If functions time out, increase timeout in `serverless.yml`:

```yaml
functions:
  createEvent:
    timeout: 60  # seconds
  createEventsBatch:
    timeout: 90
  scheduledUpdate:
    timeout: 60
```

### DynamoDB Errors

```bash
# Check table exists
aws dynamodb describe-table --table-name quote0-api-dev-events
aws dynamodb describe-table --table-name quote0-api-dev-bin-collection

# Check IAM permissions
aws iam get-role-policy --role-name quote0-api-dev-us-east-1-lambdaRole --policy-name quote0-api-dev-lambda
```

### 401/403 on API Calls

- **401**: Missing `Authorization` header. Add `Authorization: Bearer YOUR_TOKEN`.
- **403**: Wrong token. Verify `API_AUTH_TOKEN` in your `.env` matches the token in your request.
- After changing `.env`, redeploy: `npm run deploy:dev`

---

## Security Checklist

- [ ] `API_AUTH_TOKEN` is set to a strong random secret
- [ ] `QUOTE0_AUTH_TOKEN` is set correctly
- [ ] `.env` file is not committed to git (check `.gitignore`)
- [ ] IAM roles have minimal required permissions
- [ ] API Gateway uses HTTPS only
- [ ] CloudWatch logs are being generated

---

## Cost Estimate

| Component | Monthly Cost |
|-----------|-------------|
| Lambda executions (~1,000/month) | ~$0.37 |
| DynamoDB (~1,050 requests) | ~$0.30 |
| API Gateway (~1,000 requests) | ~$0.01 |
| EventBridge (30 invocations) | Free |
| CloudWatch Logs | ~$0.50 |
| **Total** | **~$1.18/month** |

Most of this is covered by AWS Free Tier for the first 12 months.

---

## Production Checklist

Before deploying to production:

- [ ] Set strong `API_AUTH_TOKEN`
- [ ] Configure production `QUOTE0_TEXT_API` and `QUOTE0_AUTH_TOKEN`
- [ ] Test all endpoints with production credentials
- [ ] Verify EventBridge schedule is enabled
- [ ] Set up CloudWatch alarms for Lambda errors (optional)
- [ ] Configure API Gateway throttling (optional)
- [ ] Remove `testScheduledUpdate` function from `serverless.yml` (optional)

---

For implementation details, see [04-implementation.md](./04-implementation.md).
For API documentation, see [02-api-reference.md](./02-api-reference.md).
