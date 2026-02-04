# Deployment Guide

## Overview

This guide covers deploying Quote0 API to production environments, including AWS Lambda (serverless) and traditional server deployments.

---

## Deployment Options Comparison

| Feature | AWS Lambda | Traditional Server | Docker |
|---------|-----------|-------------------|--------|
| **Cost** | Pay per use (~$1-5/month) | Always-on (~$5-50/month) | Depends on hosting |
| **Scaling** | Automatic | Manual | Depends on orchestration |
| **Maintenance** | Minimal | Regular updates | Medium |
| **Cold Starts** | Yes (1-3s) | No | No |
| **Complexity** | Medium | Low | Medium |
| **Best For** | Production (low traffic) | Development/Testing | Cloud VMs |

---

## Option 1: AWS Lambda (Serverless) - Recommended

### Prerequisites

- AWS account
- AWS CLI configured
- Serverless Framework installed

### Step 1: Install Serverless Framework

```bash
# Install globally
npm install -g serverless

# Verify
serverless --version
```

### Step 2: Configure AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_DEFAULT_REGION=us-east-1
```

### Step 3: Create Serverless Configuration

Create **`serverless.yml`** in project root:

```yaml
service: quote0-api

frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  stage: ${opt:stage, 'dev'}
  memorySize: 512
  timeout: 30
  
  environment:
    NODE_ENV: ${self:provider.stage}
    DB_HOST: ${env:DB_HOST}
    DB_PORT: ${env:DB_PORT}
    DB_NAME: ${env:DB_NAME}
    DB_USER: ${env:DB_USER}
    DB_PASSWORD: ${env:DB_PASSWORD}
    UPRN: ${env:UPRN}
    QUOTE0_TEXT_API: ${env:QUOTE0_TEXT_API}
    READING_API_URL: ${env:READING_API_URL, 'https://api.reading.gov.uk/api/collections'}
  
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - logs:CreateLogGroup
            - logs:CreateLogStream
            - logs:PutLogEvents
          Resource: '*'

functions:
  # API Gateway handlers
  getDisplay:
    handler: src/lambda/handlers.getDisplay
    events:
      - httpApi:
          path: /api/display
          method: GET

  createEvent:
    handler: src/lambda/handlers.createEvent
    events:
      - httpApi:
          path: /api/events
          method: PUT

  # Scheduled update
  scheduledUpdate:
    handler: src/lambda/handlers.scheduledUpdate
    events:
      - schedule:
          rate: cron(10 1 * * ? *)   # 01:10 UTC
          enabled: true
      - schedule:
          rate: cron(10 7 * * ? *)   # 07:10 UTC
          enabled: true
      - schedule:
          rate: cron(10 12 * * ? *)  # 12:10 UTC
          enabled: true
      - schedule:
          rate: cron(10 17 * * ? *)  # 17:10 UTC
          enabled: true

plugins:
  - serverless-offline

custom:
  serverless-offline:
    httpPort: 3000
```

### Step 4: Create Lambda Handlers

Create **`src/lambda/handlers.js`**:

```javascript
const binCollectionService = require('../services/binCollectionService');
const databaseService = require('../services/databaseService');
const displayFormatterService = require('../services/displayFormatterService');
const quote0ClientService = require('../services/quote0ClientService');
const scheduledUpdateService = require('../services/scheduledUpdateService');

// GET /api/display
exports.getDisplay = async (event) => {
  try {
    console.log('GET /api/display - Lambda handler');

    const binCollections = await binCollectionService.getTomorrowCollections();
    const today = new Date().toISOString().split('T')[0];
    const events = await databaseService.getEventsByDate(today);
    const displayData = displayFormatterService.formatDisplay(events, binCollections);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(displayData)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

// PUT /api/events
exports.createEvent = async (event) => {
  try {
    console.log('PUT /api/events - Lambda handler');

    const body = JSON.parse(event.body);
    const { date, event: eventText } = body;

    // Validation
    if (!date || !eventText) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Missing required fields: date, event'
        })
      };
    }

    // Normalize date
    const normalizedDate = date.replace(/\//g, '-');
    
    // Create event
    const createdEvent = await databaseService.createEvent(normalizedDate, eventText);

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createdEvent)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

// Scheduled update
exports.scheduledUpdate = async (event) => {
  console.log('Scheduled update - Lambda handler');
  console.log('Event:', JSON.stringify(event));

  try {
    const result = await scheduledUpdateService.executeUpdate();

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Scheduled update failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
```

### Step 5: Install Lambda Dependencies

```bash
npm install serverless-offline
```

### Step 6: Deploy to AWS

**Development Deployment**:
```bash
serverless deploy --stage dev
```

**Production Deployment**:
```bash
serverless deploy --stage prod
```

**Expected Output**:
```
Deploying quote0-api to stage prod (us-east-1)

✔ Service deployed to stack quote0-api-prod (152s)

endpoints:
  GET - https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/display
  PUT - https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/events
functions:
  getDisplay: quote0-api-prod-getDisplay (1.5 MB)
  createEvent: quote0-api-prod-createEvent (1.5 MB)
  scheduledUpdate: quote0-api-prod-scheduledUpdate (1.5 MB)
```

### Step 7: Test Lambda Deployment

```bash
# Test GET endpoint
curl https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/display

# Test PUT endpoint
curl -X PUT https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/events \
  -H "Content-Type: application/json" \
  -d '{"date":"2026/02/10","event":"Test from Lambda"}'
```

### Step 8: View Logs

```bash
# View all logs
serverless logs --function getDisplay --stage prod

# Tail logs in real-time
serverless logs --function scheduledUpdate --stage prod --tail
```

### Step 9: Update Environment Variables

```bash
# Update environment variable
serverless deploy function --function scheduledUpdate --stage prod

# Or use AWS Systems Manager Parameter Store
aws ssm put-parameter \
  --name "/quote0-api/prod/QUOTE0_TEXT_API" \
  --value "http://your-device-ip/text-api" \
  --type SecureString
```

---

## Option 2: Traditional Server (Oracle Cloud / Linux)

### Prerequisites

- Server with SSH access
- Node.js 18+ installed
- PostgreSQL or MySQL installed
- Domain or static IP

### Step 1: Prepare Server

```bash
# SSH to server
ssh ubuntu@your-server-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install PM2
sudo npm install -g pm2
```

### Step 2: Setup Database

```bash
# Create database
sudo -u postgres psql
CREATE DATABASE quote0_db;
CREATE USER quote0_user WITH ENCRYPTED PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE quote0_db TO quote0_user;
\q
```

### Step 3: Deploy Application

```bash
# Clone or upload code
cd /opt
sudo git clone https://github.com/your-repo/quote0_api.git
cd quote0_api

# Install dependencies
npm install --production

# Create .env file
sudo nano .env
# Paste your configuration
```

**`.env` for production**:
```env
NODE_ENV=production
PORT=8080
HOST=0.0.0.0

DB_HOST=localhost
DB_PORT=5432
DB_NAME=quote0_db
DB_USER=quote0_user
DB_PASSWORD=secure_password

UPRN=310022781
READING_API_URL=https://api.reading.gov.uk/api/collections
QUOTE0_TEXT_API=http://your-quote0-device-ip/text-api
```

```bash
# Secure .env
sudo chmod 600 .env

# Setup database
npm run db:setup
```

### Step 4: Start with PM2

```bash
# Start application
pm2 start src/index.js --name quote0-api

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command that PM2 outputs

# Check status
pm2 status
pm2 logs quote0-api
```

### Step 5: Configure Nginx (Optional)

```bash
# Install Nginx
sudo apt install -y nginx

# Create config
sudo nano /etc/nginx/sites-available/quote0-api
```

**Nginx configuration**:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Or IP address

    location /api {
        proxy_pass http://localhost:8080/api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        proxy_pass http://localhost:8080/health;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/quote0-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 6: Configure SSL (Recommended)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

### Step 7: Configure Firewall

```bash
# Allow ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS

# Enable firewall
sudo ufw enable
sudo ufw status
```

---

## Option 3: Docker Deployment

### Step 1: Create Dockerfile

Create **`Dockerfile`**:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY src ./src
COPY database ./database

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/index.js"]
```

Create **`.dockerignore`**:
```
node_modules
npm-debug.log
.env
.git
tests
docs
*.md
logs
```

### Step 2: Build Image

```bash
docker build -t quote0-api:latest .
```

### Step 3: Run Container

```bash
docker run -d \
  --name quote0-api \
  --restart unless-stopped \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_NAME=quote0_db \
  -e DB_USER=quote0_user \
  -e DB_PASSWORD=secure_password \
  -e UPRN=310022781 \
  -e QUOTE0_TEXT_API=http://your-device-ip/text-api \
  quote0-api:latest

# Check logs
docker logs -f quote0-api
```

### Step 4: Docker Compose

Create **`docker-compose.yml`**:

```yaml
version: '3.8'

services:
  api:
    build: .
    container_name: quote0-api
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=quote0_db
      - DB_USER=quote0_user
      - DB_PASSWORD=secure_password
      - UPRN=310022781
      - QUOTE0_TEXT_API=${QUOTE0_TEXT_API}
    depends_on:
      - db
    networks:
      - quote0-network

  db:
    image: postgres:15-alpine
    container_name: quote0-db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=quote0_db
      - POSTGRES_USER=quote0_user
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    networks:
      - quote0-network

volumes:
  postgres-data:

networks:
  quote0-network:
    driver: bridge
```

**Start with Docker Compose**:
```bash
docker-compose up -d
docker-compose logs -f
```

---

## Post-Deployment Tasks

### Configure Quote/0 Device

Point your Quote/0 device to the deployed API endpoint:

**API Endpoint**: 
- Lambda: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/display`
- Server: `http://your-server-ip:8080/api/display` or `https://your-domain.com/api/display`

**Update Interval**: Every 60 minutes

### Configure iPhone App

Update your iPhone app with the PUT endpoint:

**API Endpoint**: 
- Lambda: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/events`
- Server: `http://your-server-ip:8080/api/events` or `https://your-domain.com/api/events`

### Verify Scheduled Updates

**Lambda (EventBridge)**:
```bash
# Check EventBridge rules
aws events list-rules --name-prefix quote0

# View recent executions
aws events describe-rule --name quote0-api-prod-scheduledUpdate-schedule-1
```

**Traditional Server (PM2)**:
```bash
# Check PM2 logs
pm2 logs quote0-api

# Monitor in real-time
pm2 monit
```

**Docker**:
```bash
# View logs
docker logs -f quote0-api

# Check scheduler output
docker logs quote0-api | grep "Scheduled update"
```

---

## Monitoring & Maintenance

### Application Logs

**Lambda (CloudWatch)**:
```bash
# View logs
aws logs tail /aws/lambda/quote0-api-prod-scheduledUpdate --follow

# Query logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/quote0-api-prod-scheduledUpdate \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

**PM2**:
```bash
# View logs
pm2 logs quote0-api

# Error logs only
pm2 logs quote0-api --err

# Last 100 lines
pm2 logs quote0-api --lines 100
```

### Database Backups

**Automated Backup Script** (`/opt/quote0/backup.sh`):

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/quote0/backups
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U quote0_user quote0_db | gzip > $BACKUP_DIR/quote0_db_$DATE.sql.gz

# Keep last 7 days
find $BACKUP_DIR -name "quote0_db_*.sql.gz" -mtime +7 -delete

echo "Backup completed: quote0_db_$DATE.sql.gz"
```

**Schedule Daily Backup** (crontab):
```bash
# Run at 02:00 daily
0 2 * * * /opt/quote0/backup.sh >> /var/log/quote0/backup.log 2>&1
```

### Update Application

**Lambda**:
```bash
# Update code
git pull origin main

# Deploy
serverless deploy --stage prod
```

**PM2**:
```bash
# Update code
cd /opt/quote0/quote0_api
git pull origin main

# Install dependencies (if package.json changed)
npm install --production

# Restart
pm2 restart quote0-api

# Verify
pm2 logs quote0-api --lines 20
```

**Docker**:
```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d

# Verify
docker-compose logs -f
```

---

## Troubleshooting

### Lambda Issues

**Cold Start Problems**:
- Enable provisioned concurrency (costs more)
- Increase memory allocation (faster cold starts)
- Use Lambda Insights for diagnostics

**EventBridge Not Triggering**:
```bash
# Check rules
aws events list-rules

# Check targets
aws events list-targets-by-rule --rule quote0-api-prod-scheduledUpdate-schedule-1

# Enable rule if disabled
aws events enable-rule --name quote0-api-prod-scheduledUpdate-schedule-1
```

### Server Issues

**Application Won't Start**:
```bash
# Check PM2 status
pm2 status

# View error logs
pm2 logs quote0-api --err

# Restart
pm2 restart quote0-api

# Check environment
pm2 env quote0-api
```

**Database Connection Errors**:
```bash
# Test connection
psql -U quote0_user -h localhost -d quote0_db

# Check PostgreSQL status
sudo systemctl status postgresql

# Restart PostgreSQL
sudo systemctl restart postgresql
```

**Port Already in Use**:
```bash
# Find process using port 8080
sudo netstat -tlnp | grep 8080

# Kill process
sudo kill -9 <PID>
```

### Docker Issues

**Container Won't Start**:
```bash
# Check logs
docker logs quote0-api

# Inspect container
docker inspect quote0-api

# Restart
docker restart quote0-api
```

---

## Security Checklist

- [ ] Environment variables stored securely (not in code)
- [ ] Database uses strong password
- [ ] Firewall configured (only necessary ports open)
- [ ] SSH password authentication disabled
- [ ] HTTPS/SSL configured (for domain-based deployments)
- [ ] Regular security updates applied
- [ ] Database backups configured
- [ ] Logs monitored for suspicious activity

---

## Cost Estimation

### AWS Lambda (Low Traffic)

| Component | Monthly Cost |
|-----------|-------------|
| Lambda executions (~1000/month) | ~$0.20 |
| API Gateway requests (~1000/month) | ~$0.01 |
| CloudWatch Logs | ~$0.50 |
| EventBridge rules (4 daily) | Free |
| **Total** | **~$0.71/month** |

### Traditional Server (Oracle Cloud)

| Component | Monthly Cost |
|-----------|-------------|
| VM.Standard.E2.1.Micro (Always Free) | $0 |
| PostgreSQL (on same VM) | $0 |
| Data transfer | $0 (within free tier) |
| **Total** | **$0/month** |

*Note: Oracle Cloud offers generous Always Free tier*

---

## Conclusion

Your Quote0 API is now deployed and running! 🎉

**Next Steps**:
1. Configure Quote/0 device with API endpoint
2. Test scheduled updates (check logs at 01:10, 07:10, 12:10, 17:10)
3. Setup iPhone app to create events
4. Monitor logs for first few days
5. Configure backups and monitoring

For questions or issues, refer to the troubleshooting section or check application logs.
