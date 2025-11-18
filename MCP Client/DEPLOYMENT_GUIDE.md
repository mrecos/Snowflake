# Snowflake MCP Client - Deployment Guide

This guide covers deployment options for the Snowflake MCP Client in various environments.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
  - [Docker Deployment](#docker-deployment)
  - [Cloud Platforms](#cloud-platforms)
  - [Traditional Server](#traditional-server)
- [Configuration Management](#configuration-management)
- [Security Best Practices](#security-best-practices)
- [Monitoring and Logging](#monitoring-and-logging)

## Prerequisites

Before deploying, ensure you have:

1. **Snowflake Access**
   - Active Snowflake account
   - MCP server configured and running
   - Valid authentication credentials (PAT/Bearer token)

2. **Infrastructure**
   - Python 3.8+ runtime environment
   - Network access to Snowflake endpoints
   - SSL/TLS support (required for Snowflake connections)

3. **Configuration**
   - MCP server URL
   - Authentication token
   - (Optional) Custom Flask secret key

## Local Development

### Quick Setup

1. **Clone and setup**
```bash
git clone https://github.com/yourusername/snowflake-mcp-client.git
cd snowflake-mcp-client
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your credentials
nano .env
```

3. **Run locally**
```bash
python mcp_client.py
```

Access at: http://localhost:5000

## Production Deployment

### Important Production Changes

Before deploying to production, update `mcp_client.py`:

1. **Enable SSL Verification** (Line 116)
```python
# Change from:
verify=False  # Temporarily disable SSL verification for testing

# To:
verify=True  # Enable SSL verification in production
```

2. **Disable Debug Mode** (Line 762)
```python
# Change from:
app.run(host='0.0.0.0', port=port, debug=True)

# To:
app.run(host='0.0.0.0', port=port, debug=False)
```

3. **Use Production WSGI Server**

Replace `app.run()` with a production server like Gunicorn:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 --timeout 120 mcp_client:app
```

### Docker Deployment

**Dockerfile**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy application
COPY mcp_client.py .
COPY templates/ templates/

# Environment variables will be provided at runtime
ENV FLASK_APP=mcp_client.py
ENV PYTHONUNBUFFERED=1

EXPOSE 5000

# Use gunicorn for production
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "--timeout", "120", "mcp_client:app"]
```

**Docker Compose** (docker-compose.yml)
```yaml
version: '3.8'

services:
  mcp-client:
    build: .
    ports:
      - "5000:5000"
    environment:
      - MCP_SERVER_URL=${MCP_SERVER_URL}
      - MCP_AUTH_TOKEN=${MCP_AUTH_TOKEN}
      - SECRET_KEY=${SECRET_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/status"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Build and Run**
```bash
# Build image
docker build -t snowflake-mcp-client .

# Run container
docker run -d \
  --name mcp-client \
  -p 5000:5000 \
  -e MCP_SERVER_URL="your-mcp-url" \
  -e MCP_AUTH_TOKEN="your-token" \
  snowflake-mcp-client

# Or use docker-compose
docker-compose up -d
```

### Cloud Platforms

#### AWS Elastic Beanstalk

1. **Create `.ebextensions/python.config`**
```yaml
option_settings:
  aws:elasticbeanstalk:container:python:
    WSGIPath: mcp_client:app
  aws:elasticbeanstalk:application:environment:
    MCP_SERVER_URL: "your-mcp-url"
    MCP_AUTH_TOKEN: "your-token"
```

2. **Deploy**
```bash
eb init -p python-3.11 snowflake-mcp-client
eb create mcp-client-env
eb deploy
```

#### Google Cloud Run

1. **Create `Dockerfile`** (see Docker section above)

2. **Deploy**
```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/YOUR_PROJECT/mcp-client

# Deploy to Cloud Run
gcloud run deploy mcp-client \
  --image gcr.io/YOUR_PROJECT/mcp-client \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars MCP_SERVER_URL="your-url",MCP_AUTH_TOKEN="your-token"
```

#### Azure App Service

1. **Create web app**
```bash
az webapp up \
  --name snowflake-mcp-client \
  --runtime "PYTHON:3.11" \
  --sku B1
```

2. **Configure environment**
```bash
az webapp config appsettings set \
  --name snowflake-mcp-client \
  --settings MCP_SERVER_URL="your-url" MCP_AUTH_TOKEN="your-token"
```

#### Heroku

1. **Create `Procfile`**
```
web: gunicorn -w 4 -b 0.0.0.0:$PORT --timeout 120 mcp_client:app
```

2. **Deploy**
```bash
heroku create snowflake-mcp-client
heroku config:set MCP_SERVER_URL="your-url"
heroku config:set MCP_AUTH_TOKEN="your-token"
git push heroku main
```

### Traditional Server Deployment

#### Using systemd (Linux)

1. **Create service file** `/etc/systemd/system/mcp-client.service`
```ini
[Unit]
Description=Snowflake MCP Client
After=network.target

[Service]
Type=simple
User=mcp-user
WorkingDirectory=/opt/mcp-client
Environment="PATH=/opt/mcp-client/venv/bin"
EnvironmentFile=/opt/mcp-client/.env
ExecStart=/opt/mcp-client/venv/bin/gunicorn -w 4 -b 0.0.0.0:5000 --timeout 120 mcp_client:app
Restart=always

[Install]
WantedBy=multi-user.target
```

2. **Enable and start**
```bash
sudo systemctl daemon-reload
sudo systemctl enable mcp-client
sudo systemctl start mcp-client
```

#### Using Nginx Reverse Proxy

**Nginx configuration** (`/etc/nginx/sites-available/mcp-client`)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Important for SSE streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/mcp-client /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Configuration Management

### Environment Variables

**Production `.env` file**
```bash
# Snowflake MCP Configuration
MCP_SERVER_URL=https://your-prod-account.snowflakecomputing.com/api/v2/databases/PROD_DB/schemas/MCP/mcp-servers/prod_server
MCP_AUTH_TOKEN=your-production-token

# Flask Configuration
SECRET_KEY=generate-a-secure-random-key-here
FLASK_ENV=production

# Optional: Logging
LOG_LEVEL=INFO
```

### Secrets Management

For enhanced security, use secrets management services:

**AWS Secrets Manager**
```python
import boto3
import json

def get_secret(secret_name):
    session = boto3.session.Session()
    client = session.client('secretsmanager', region_name='us-east-1')
    secret = client.get_secret_value(SecretId=secret_name)
    return json.loads(secret['SecretString'])

# Use in mcp_client.py
if os.getenv('USE_AWS_SECRETS'):
    secrets = get_secret('snowflake-mcp-credentials')
    MCP_SERVER_URL = secrets['mcp_server_url']
    MCP_AUTH_TOKEN = secrets['mcp_auth_token']
```

**Azure Key Vault**
```python
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

credential = DefaultAzureCredential()
client = SecretClient(vault_url="https://your-vault.vault.azure.net", credential=credential)

MCP_SERVER_URL = client.get_secret("mcp-server-url").value
MCP_AUTH_TOKEN = client.get_secret("mcp-auth-token").value
```

## Security Best Practices

### 1. Authentication and Authorization

- ✅ **Token Rotation**: Regularly rotate MCP authentication tokens
- ✅ **Least Privilege**: Use tokens with minimal required permissions
- ✅ **Network Security**: Restrict access to trusted IPs/networks
- ✅ **HTTPS Only**: Always use HTTPS in production

### 2. Application Security

- ✅ **SSL Verification**: Enable `verify=True` for Snowflake connections
- ✅ **Debug Mode**: Disable debug mode (`debug=False`) in production
- ✅ **Secret Keys**: Use strong, random Flask secret keys
- ✅ **Input Validation**: Validate all user inputs (already implemented)

### 3. Infrastructure Security

- ✅ **Firewall Rules**: Restrict inbound/outbound traffic
- ✅ **Container Security**: Use minimal base images, scan for vulnerabilities
- ✅ **Updates**: Keep dependencies updated
- ✅ **Monitoring**: Enable security monitoring and alerts

### 4. Data Protection

- ✅ **Encryption**: All data encrypted in transit (HTTPS/TLS)
- ✅ **Logging**: Don't log sensitive data (tokens, credentials)
- ✅ **Access Control**: Implement authentication if exposing publicly

## Monitoring and Logging

### Application Logs

The application logs to stdout/stderr. Capture logs with your deployment platform:

**Docker**
```bash
docker logs -f mcp-client
```

**Systemd**
```bash
journalctl -u mcp-client -f
```

**Cloud Platforms**
- AWS CloudWatch
- Google Cloud Logging
- Azure Monitor

### Health Checks

Use the `/api/status` endpoint for health monitoring:

```bash
curl http://localhost:5000/api/status
```

Expected response:
```json
{
  "connected": true,
  "server_url": "https://...",
  "tools_available": 4,
  "timestamp": "2025-11-18T10:30:00"
}
```

### Performance Monitoring

Monitor key metrics:
- Response times (especially for streaming operations)
- Error rates (HTTP 4xx, 5xx)
- Tool discovery success rate
- Connection failures

**Example with Prometheus + Grafana**

Add prometheus_flask_exporter:
```python
from prometheus_flask_exporter import PrometheusMetrics

app = Flask(__name__)
metrics = PrometheusMetrics(app)
```

### Alerts

Set up alerts for:
- ❌ MCP server connection failures
- ❌ High error rates (>5% of requests)
- ❌ Slow response times (>30s)
- ❌ Authentication failures

## Scaling Considerations

### Horizontal Scaling

The application is stateless and can be scaled horizontally:

```bash
# Docker Compose with multiple replicas
docker-compose up --scale mcp-client=3

# Kubernetes
kubectl scale deployment mcp-client --replicas=3
```

### Load Balancing

Use a load balancer for multiple instances:
- AWS Application Load Balancer
- Google Cloud Load Balancing
- Nginx load balancer
- HAProxy

**Important**: Configure load balancer timeouts >120s for streaming support

### Connection Pooling

The application uses connection pooling by default:
```python
adapter = requests.adapters.HTTPAdapter(
    pool_connections=10,
    pool_maxsize=10,
    # ...
)
```

Adjust based on expected concurrent users.

## Troubleshooting Deployment Issues

### Issue: 502 Bad Gateway

**Cause**: Application not starting or crashing
**Solution**: 
- Check application logs
- Verify environment variables are set
- Test locally first

### Issue: 504 Gateway Timeout

**Cause**: Load balancer timeout too short
**Solution**:
- Configure load balancer timeout >120s
- Verify streaming is working
- Check MCP server response times

### Issue: Connection Refused

**Cause**: Application not listening on correct port/host
**Solution**:
- Ensure `host='0.0.0.0'` in production
- Check firewall rules
- Verify port is not blocked

### Issue: Authentication Failures

**Cause**: Invalid or expired tokens
**Solution**:
- Generate new authentication token
- Verify token is correctly set in environment
- Check Snowflake account permissions

## Maintenance

### Regular Tasks

1. **Token Rotation** (Monthly or as per policy)
   - Generate new PAT in Snowflake
   - Update environment variables
   - Restart application

2. **Dependency Updates** (Quarterly)
```bash
pip list --outdated
pip install --upgrade -r requirements.txt
```

3. **Log Review** (Weekly)
   - Check for errors and warnings
   - Monitor performance metrics
   - Review security events

4. **Backup Configuration**
   - Keep secure backups of `.env` files
   - Document configuration changes
   - Maintain deployment runbooks

## Support

For deployment issues:
1. Check application logs first
2. Review this deployment guide
3. Test connectivity to Snowflake
4. Open GitHub issue with deployment details (redact sensitive info)

---

**Remember**: Never commit secrets to version control. Always use environment variables or secrets management services.

