# Quote0 API - Serverless Microservice

A serverless microservice that displays upcoming events on Quote/0 reminder device, with automatic bin collection schedule integration using AWS Lambda and DynamoDB.

<img src="https://img.shields.io/badge/AWS-Lambda-orange" alt="AWS Lambda"/>
<img src="https://img.shields.io/badge/Database-DynamoDB-blue" alt="DynamoDB"/>
<img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node.js"/>
<img src="https://img.shields.io/badge/Serverless-Framework-red" alt="Serverless"/>

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Deploy to AWS
npm run deploy:dev

# View logs
npm run logs
```

**⚡ Ready in 10 minutes!** See [QUICKSTART.md](./QUICKSTART.md) for detailed setup.

---

## ✨ Features

- **🕐 Scheduled Updates** - Automatic pushes at 01:10, 07:10, 12:10, 17:10 daily
- **🗑️ Bin Collection Integration** - Reading Council API with smart caching
- **📅 Event Management** - DynamoDB-backed custom events
- **📟 Quote/0 Display** - Format-compliant (25/29 char constraints)
- **⚡ Serverless** - AWS Lambda + DynamoDB (pay-per-use)
- **🔄 Auto-Scaling** - Handles traffic spikes automatically
- **💰 Cost-Effective** - ~$1.18/month for typical usage

---

## 🏗️ Architecture

```
EventBridge (Cron)          Quote/0 Device       iPhone App
01:10, 07:10               (Hourly Pull)        (Create Events)
12:10, 17:10                     │                    │
     │                           │                    │
     └─────────────┬─────────────┴────────────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │   API Gateway (HTTP API)  │
       └───────────────────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │   AWS Lambda Functions    │
       │   • GET /api/display      │
       │   • PUT /api/events       │
       │   • scheduledUpdate       │
       └───────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
   DynamoDB              Reading Council
    Events               Bin Collection API
```

---

## 📡 API Endpoints

### GET /api/display
Returns formatted display data for Quote/0 device.

```bash
curl https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/api/display
```

**Response:**
```json
{
  "refreshNow": false,
  "title": "2026/02/10",
  "signature": "collect Red bin tmr",
  "message": "Dentist 3pm\nSchool play 6pm\nLibrary books due"
}
```

### PUT /api/events
Creates a new event in DynamoDB.

```bash
curl -X PUT https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/api/events \
  -H "Content-Type: application/json" \
  -d '{"date":"2026/02/10","event":"Meeting at 10am"}'
```

---

## 🛠️ Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **Runtime** | AWS Lambda (Node.js 18) | Serverless, auto-scaling |
| **Database** | Amazon DynamoDB | No connection management, pay-per-request |
| **Scheduling** | AWS EventBridge | Native cron support, reliable |
| **API** | API Gateway HTTP API | Low latency, cost-effective |
| **External API** | Reading Council Bin API | Public bin collection data |
| **Caching** | In-memory (Lambda) | 12-hour TTL for bin data |

---

## 📁 Project Structure

```
quote0_api/
├── serverless.yml              # AWS infrastructure definition
├── package.json                # Node.js dependencies
├── QUICKSTART.md              # 10-minute setup guide
├── src/
│   ├── lambda/
│   │   └── handlers.js         # Lambda function handlers
│   └── services/
│       ├── dynamoDbService.js  # DynamoDB operations
│       ├── binCollectionService.js
│       ├── displayFormatterService.js
│       ├── quote0ClientService.js
│       └── scheduledUpdateService.js
└── docs/
    ├── README.md               # Documentation index
    ├── 01-architecture.md      # System architecture
    ├── 02-api-reference.md     # API documentation
    ├── 03-scheduled-service.md # Scheduling details
    ├── 04-implementation.md    # Implementation guide
    └── 05-deployment.md        # Deployment guide
```

---

## 📚 Documentation

- **[Quick Start Guide](./QUICKSTART.md)** - Get running in 10 minutes
- **[Architecture](./docs/01-architecture.md)** - System design and components
- **[API Reference](./docs/02-api-reference.md)** - Complete API documentation
- **[Scheduled Service](./docs/03-scheduled-service.md)** - EventBridge configuration
- **[Implementation](./docs/04-implementation.md)** - Development guide
- **[Deployment](./docs/05-deployment.md)** - Production deployment

---

## 🔧 Development

### Local Testing

```bash
# Install dependencies
npm install

# Run offline (requires serverless-offline)
npm start

# Test endpoints locally
curl http://localhost:3000/api/display
```

### Deploy

```bash
# Deploy to development
npm run deploy:dev

# Deploy to production
npm run deploy:prod
```

### Monitoring

```bash
# View logs
npm run logs

# Invoke function manually
npm run invoke

# View DynamoDB data
aws dynamodb scan --table-name quote0-api-dev-events
```

---

## 💰 Cost

**Typical monthly cost:**

| Service | Usage | Cost |
|---------|-------|------|
| Lambda | ~1,000 executions, 512MB | $0.37 |
| DynamoDB | ~1,050 requests, < 1GB storage | $0.30 |
| API Gateway | ~1,000 requests | $0.01 |
| CloudWatch | ~5GB logs | $0.50 |
| **Total** | | **~$1.18/month** |

💡 **AWS Free Tier** covers most of this for first 12 months!

---

## 🗓️ Scheduled Updates

The service automatically pushes updates to Quote/0 at:

| Time (UTC) | Purpose |
|------------|---------|
| 01:10 | Early morning refresh |
| 07:10 | Morning update before workday |
| 12:10 | Midday refresh |
| 17:10 | Evening update after work |

**Note:** Times are in UTC. Adjust in `serverless.yml` for your timezone.

---

## 🔒 Security

- ✅ IAM roles with minimal permissions
- ✅ DynamoDB encryption at rest
- ✅ API Gateway with HTTPS only
- ✅ Environment variables for secrets
- ✅ No hardcoded credentials
- ✅ CloudWatch logs for audit trail

---

## 🧪 Testing

```bash
# Test GET endpoint
curl https://YOUR-API-URL/api/display

# Test PUT endpoint
curl -X PUT https://YOUR-API-URL/api/events \
  -H "Content-Type: application/json" \
  -d '{"date":"2026/02/10","event":"Test event"}'

# Manually trigger scheduled update
serverless invoke --function scheduledUpdate --stage dev
```

---

## 🐛 Troubleshooting

**Deployment fails?**
```bash
# Check AWS credentials
aws sts get-caller-identity

# View CloudFormation events
aws cloudformation describe-stack-events --stack-name quote0-api-dev
```

**Scheduled updates not running?**
```bash
# Check EventBridge rules
aws events list-rules --name-prefix quote0-api

# View Lambda logs
aws logs tail /aws/lambda/quote0-api-dev-scheduledUpdate --follow
```

See [QUICKSTART.md#troubleshooting](./QUICKSTART.md#troubleshooting) for more.

---

## 📝 Environment Variables

Required environment variables (set in `.env` or AWS):

| Variable | Description | Example |
|----------|-------------|---------|
| `UPRN` | Your property reference number | `310022781` |
| `QUOTE0_TEXT_API` | Quote/0 device API endpoint | `http://192.168.1.100/api` |
| `READING_API_URL` | Reading Council API URL | `https://api.reading.gov.uk/api/collections` |
| `CACHE_TTL_HOURS` | Bin data cache duration | `12` |

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙋 Support

- **Documentation**: See `docs/` folder
- **Issues**: Check CloudWatch Logs
- **Questions**: Open an issue on GitHub

---

## 🎯 Roadmap

- [ ] Support multiple Quote/0 devices
- [ ] Web dashboard for event management
- [ ] More external API integrations (weather, calendar)
- [ ] Email/SMS notifications
- [ ] Multi-user support with authentication

---

**Built with ❤️ for Quote/0 users**

Enjoy your automated household reminder system! 🏠✨
