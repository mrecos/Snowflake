# Snowpark Container Services Deployment Guide

This guide walks you through deploying the Cortex Agent REST API Client as a containerized service in Snowflake's Snowpark Container Services (SPCS).

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Deployment Steps](#deployment-steps)
5. [Accessing Your Service](#accessing-your-service)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)
7. [Cost Management](#cost-management)
8. [Troubleshooting](#troubleshooting)
9. [Security Considerations](#security-considerations)

---

## Overview

Snowpark Container Services (SPCS) allows you to run containerized applications directly within your Snowflake account. This deployment method offers several advantages:

- **No external infrastructure**: Application runs entirely within Snowflake
- **Seamless integration**: Direct access to Snowflake data and services
- **Managed compute**: Snowflake handles infrastructure, scaling, and availability
- **Cost efficiency**: Pay only for compute time used (with auto-suspend)
- **Security**: Secrets management, role-based access control, network isolation

### What Gets Deployed

- **Container**: Node.js application serving the web UI and API proxy
- **Compute Pool**: CPU_X64_S (2 CPU, 4GB RAM) with auto-scaling (1-3 nodes)
- **Public Endpoint**: HTTPS URL accessible from anywhere
- **External Access**: Outbound HTTPS to Snowflake Cortex Agent REST API
- **Secrets**: Secure storage for PAT token and configuration

---

## Prerequisites

### Required Software

1. **Docker Desktop** (or Docker Engine)
   - Download: https://www.docker.com/products/docker-desktop
   - Verify: `docker --version` (v20.10+)

2. **Snowflake CLI** (recommended) or **SnowSQL**
   - Install: https://docs.snowflake.com/en/developer-guide/snowflake-cli/installation
   - Verify: `snow --version`

3. **Git** (to clone this repository)

### Snowflake Requirements

1. **Role with Privileges**:
   - `ACCOUNTADMIN` role (or custom role with equivalent privileges)
   - Required privileges:
     - `CREATE COMPUTE POOL`
     - `CREATE SERVICE`
     - `CREATE IMAGE REPOSITORY`
     - `CREATE SECRET`
     - `CREATE EXTERNAL ACCESS INTEGRATION`

2. **Existing Cortex Agent**:
   - You must have a Cortex Agent already configured
   - Note the agent name, database, and schema

3. **Database and Schema**:
   - Create or use existing database/schema for SPCS objects
   - Example: `CREATE DATABASE CORTEX_APPS; USE SCHEMA PUBLIC;`

### Authentication in SPCS

**Good News:** SPCS deployment uses **automatic OAuth authentication** - no PAT tokens or network policy configuration required!

When running in SPCS, the application automatically:
- Uses OAuth token from `/snowflake/session/token` (provided by SPCS)
- Routes through Snowflake's internal network (bypasses IP restrictions)
- Adds `X-Snowflake-Authorization-Token-Type: OAUTH` header

This means:
- ✅ **No PAT token needed** (unlike local deployment)
- ✅ **Works with strict network policies** (bypasses IP restrictions)
- ✅ **More secure** (uses service identity, not personal credentials)

### Configuration Values to Gather

Before starting, collect these values:

```bash
SNOWFLAKE_ACCOUNT_URL="https://<org>-<account>.snowflakecomputing.com"
AGENT_NAME="<your-agent-name>"
AGENT_DB="<database-containing-agent>"
AGENT_SCHEMA="<schema-containing-agent>"
WAREHOUSE="<warehouse-name>"
# NOTE: No AUTH_TOKEN needed for SPCS!
```

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Snowflake Account                     │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │         Compute Pool (cortex_agent_pool)       │    │
│  │          CPU_X64_S (2CPU, 4GB per node)        │    │
│  │              Auto-scale: 1-3 nodes              │    │
│  │                                                  │    │
│  │  ┌────────────────────────────────────────┐   │    │
│  │  │   Service (cortex_agent_service)        │   │    │
│  │  │                                          │   │    │
│  │  │  ┌──────────────────────────────────┐  │   │    │
│  │  │  │  Container: Node.js App          │  │   │    │
│  │  │  │  - Express server (port 8080)    │  │   │    │
│  │  │  │  - Static files (HTML/CSS/JS)    │  │   │    │
│  │  │  │  - API proxy to Cortex Agent     │  │   │    │
│  │  │  └──────────────────────────────────┘  │   │    │
│  │  │                                          │   │    │
│  │  │  Environment (from secrets):             │   │    │
│  │  │  - SNOWFLAKE_ACCOUNT_URL                 │   │    │
│  │  │  - AGENT_NAME, AGENT_DB, AGENT_SCHEMA    │   │    │
│  │  │  - WAREHOUSE, AUTH_TOKEN                 │   │    │
│  │  └────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │         External Access Integration             │    │
│  │  Allows outbound HTTPS to:                      │    │
│  │  - <account>.snowflakecomputing.com:443         │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │               Secrets Storage                   │    │
│  │  - cortex_agent_snowflake_url                   │    │
│  │  - cortex_agent_auth_token                      │    │
│  │  - cortex_agent_config                          │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │          Image Repository                       │    │
│  │  cortex_agent_repo/cortex_agent_client:latest   │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTPS (public endpoint)
                          ▼
                   ┌─────────────┐
                   │   Internet  │
                   │    Users    │
                   └─────────────┘
```

### Data Flow

1. User accesses public HTTPS endpoint
2. Container serves web UI (HTML/CSS/JS)
3. Browser JavaScript calls `/api/agent/:name/run`
4. Container proxy authenticates to Snowflake using PAT (from secret)
5. Container makes REST API call to Cortex Agent (via external access integration)
6. Agent processes request and returns streaming response
7. Container forwards response to browser
8. Browser renders agent response with syntax highlighting, tables, charts

---

## Deployment Steps

### Step 1: Clone and Prepare Repository

```bash
# Clone repository
git clone <your-repo-url>
cd Cortex_REST_API_Client

# Verify required files exist
ls Dockerfile service-spec.yaml deploy.sql
```

### Step 2: Configure Snowflake Connection (Optional)

If you plan to use Snowflake CLI for executing SQL or pushing images, set up your connection:

```bash
# Add connection
snow connection add \
  --connection-name spcs_deploy \
  --account <org>-<account> \
  --user <username> \
  --role ACCOUNTADMIN

# Test connection
snow connection test --connection spcs_deploy
```

**Otherwise**, you can use Snowflake Web UI for all SQL operations and `docker login` for registry access.

### Step 3: Execute SQL Setup

Open `deploy.sql` in a text editor and replace all placeholder values:

- `<YOUR_DATABASE>` → Your database name (e.g., `CORTEX_APPS`)
- `<YOUR_SCHEMA>` → Your schema name (e.g., `PUBLIC`)
- `<your-account>` → Your Snowflake account identifier
- `<your-pat-token>` → Your Personal Access Token
- `<YOUR_AGENT_NAME>` → Your agent name
- `<YOUR_AGENT_DATABASE>` → Database containing your agent
- `<YOUR_AGENT_SCHEMA>` → Schema containing your agent
- `<YOUR_WAREHOUSE>` → Warehouse name
- `<YOUR_ROLE>` → Role to grant service access to

Execute the SQL script in Snowflake:

**Option A: Using Snowflake CLI**
```bash
snow sql -c spcs_deploy -f deploy.sql
```

**Option B: Using SnowSQL**
```bash
snowsql -c <connection> -f deploy.sql
```

**Option C: Using Snowflake Web UI**
- Copy and paste sections from `deploy.sql` into a worksheet
- Execute each section sequentially

**Important**: After Step 1 in the SQL script, note the image repository URL. You'll need it for pushing the Docker image.

### Step 4: Build and Push Docker Image

Navigate to your project directory in a terminal:

```bash
cd /path/to/Cortex_REST_API_Client

# Build the Docker image (note: --platform linux/amd64 is required for Snowflake)
docker build --platform linux/amd64 -t cortex_agent_client:v1.0.0 .
```

**Get your repository URL from Snowflake:**

Execute in Snowflake Web UI or SnowSQL:
```sql
SHOW IMAGE REPOSITORIES LIKE 'cortex_agent_repo';
```

Copy the `repository_url` value (looks like: `xyz123-acme.registry.snowflakecomputing.com/MYDB/PUBLIC/cortex_agent_repo`)

**Tag and push the image:**

```bash
# Set repository URL (replace with your actual value from above)
export REPO_URL="<your-org>-<your-account>.registry.snowflakecomputing.com/<db>/<schema>/cortex_agent_repo"

# Tag the image for Snowflake
docker tag cortex_agent_client:v1.0.0 ${REPO_URL}/cortex_agent_client:v1.0.0

# Login to Snowflake image registry
snow spcs image-registry login

# Push the image (this may take 5-10 minutes depending on your connection)
docker push ${REPO_URL}/cortex_agent_client:v1.0.0
```

**Note:** If you don't have Snowflake CLI installed, you can use `docker login` directly:
```bash
docker login ${REPO_URL} -u <your-snowflake-username>
# When prompted, enter your Snowflake password
```

### Step 5: Create Service

If you completed Step 7 in `deploy.sql`, the service is already created. Otherwise:

```sql
-- Execute in Snowflake
CREATE SERVICE cortex_agent_service
  IN COMPUTE POOL cortex_agent_pool
  FROM SPECIFICATION $$
-- (paste contents from service-spec.yaml or use inline spec from deploy.sql)
  $$
  EXTERNAL_ACCESS_INTEGRATIONS = (cortex_agent_external_access);
```

### Step 6: Verify Deployment

```sql
-- Check service status (should show "READY" after a few minutes)
CALL SYSTEM$GET_SERVICE_STATUS('cortex_agent_service');

-- View service logs
SELECT SYSTEM$GET_SERVICE_LOGS('cortex_agent_service', 0, 'cortex-agent-app', 100);

-- Get public endpoint URL
SHOW ENDPOINTS IN SERVICE cortex_agent_service;
-- Look for the "ingress_url" column
```

---

## Accessing Your Service

### Get Public URL

```sql
SHOW ENDPOINTS IN SERVICE cortex_agent_service;
```

The `ingress_url` will look like:
```
https://xyz123-cortex-agent-service-web-ui.snowflakecomputing.app
```

### Test the Application

1. **Open the URL** in your browser
2. **Verify agent connection**: Click "Verify Agent" button
3. **Ask a question**: Type a question in the input box and click Send
4. **Check response**: Should see agent's response with formatted text, tables, or charts

### Update UI Configuration

To customize the UI (app title, presets, storage limits):

**Option 1: Rebuild image** (simple, but requires rebuild for changes)
1. Edit `public/config.json` locally
2. Rebuild and push image: `./build-and-deploy.sh v1.0.1`
3. Update service to use new image version

**Option 2: Use Snowflake stage** (allows runtime updates)
1. Create stage: `CREATE STAGE cortex_agent_config_stage;`
2. Upload config: `PUT file:///path/to/config.json @cortex_agent_config_stage AUTO_COMPRESS=FALSE;`
3. Uncomment volumes section in `service-spec.yaml`
4. Update service with new spec

---

## Monitoring and Maintenance

### Check Service Health

```sql
-- Service status
CALL SYSTEM$GET_SERVICE_STATUS('cortex_agent_service');

-- Service details
DESCRIBE SERVICE cortex_agent_service;

-- Compute pool status
DESCRIBE COMPUTE POOL cortex_agent_pool;
```

### View Logs

```sql
-- Recent logs (last 100 lines)
SELECT SYSTEM$GET_SERVICE_LOGS('cortex_agent_service', 0, 'cortex-agent-app', 100);

-- Logs from specific time range (requires event table setup)
-- SELECT * FROM TABLE(SPCS_GET_LOGS('cortex_agent_service'))
-- WHERE TIMESTAMP >= DATEADD('hour', -1, CURRENT_TIMESTAMP());
```

### Monitor Metrics

```sql
-- View service metrics (requires event table)
-- SELECT * FROM TABLE(SPCS_GET_METRICS('cortex_agent_service'));

-- Compute pool history
SELECT * FROM TABLE(INFORMATION_SCHEMA.COMPUTE_POOL_HISTORY(
  POOL_NAME => 'cortex_agent_pool'
));
```

### Update Service

When you make code changes and want to deploy a new version:

```bash
# Build new version
./build-and-deploy.sh v1.1.0

# Update service to use new image
# Execute in Snowflake:
ALTER SERVICE cortex_agent_service FROM SPECIFICATION $$
spec:
  containers:
  - name: cortex-agent-app
    image: /cortex_agent_repo/cortex_agent_client:v1.1.0  # <-- Updated version
    # ... rest of spec ...
$$;
```

### Suspend/Resume Service

```sql
-- Suspend (stops billing, but keeps configuration)
ALTER SERVICE cortex_agent_service SUSPEND;

-- Resume
ALTER SERVICE cortex_agent_service RESUME;
```

---

## Cost Management

### Understanding Costs

SPCS costs are based on:
1. **Compute Pool**: Charged per second when nodes are running
2. **Storage**: Image storage in repository (minimal)
3. **Data Transfer**: Egress for public endpoint (typically minimal)

**CPU_X64_S pricing** (approximate, varies by region):
- Per node per hour: ~4-6 credits
- Auto-suspend after 1 hour of inactivity (default)
- Scales down to 1 node when idle

### Cost Optimization Tips

1. **Set appropriate auto-suspend**:
```sql
-- Suspend after 30 minutes (1800 seconds)
ALTER COMPUTE POOL cortex_agent_pool 
  SET AUTO_SUSPEND_SECS = 1800;
```

2. **Reduce max nodes** if traffic is low:
```sql
ALTER COMPUTE POOL cortex_agent_pool 
  SET MAX_NODES = 1;
```

3. **Suspend during off-hours**:
```sql
-- Create task to suspend at night
CREATE OR REPLACE TASK suspend_app_nightly
  SCHEDULE = 'USING CRON 0 22 * * * America/New_York'
AS
  ALTER SERVICE cortex_agent_service SUSPEND;

-- Create task to resume in morning
CREATE OR REPLACE TASK resume_app_morning
  SCHEDULE = 'USING CRON 0 8 * * 1-5 America/New_York'
AS
  ALTER SERVICE cortex_agent_service RESUME;
```

4. **Monitor usage**:
```sql
-- View credit consumption
SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.METERING_HISTORY
WHERE SERVICE_TYPE = 'SNOWPARK_CONTAINER_SERVICES'
  AND START_TIME >= DATEADD('day', -7, CURRENT_TIMESTAMP())
ORDER BY START_TIME DESC;
```

---

## Troubleshooting

### Service Won't Start

**Symptom**: `CALL SYSTEM$GET_SERVICE_STATUS(...)` shows error or pending state

**Solutions**:

1. **Check logs**:
```sql
SELECT SYSTEM$GET_SERVICE_LOGS('cortex_agent_service', 0, 'cortex-agent-app', 500);
```

2. **Verify image exists**:
```sql
SHOW IMAGES IN IMAGE REPOSITORY cortex_agent_repo;
```

3. **Check secrets**:
```sql
SHOW SECRETS;
-- Verify cortex_agent_snowflake_url, cortex_agent_name, cortex_agent_db, 
-- cortex_agent_schema, cortex_agent_warehouse exist
-- NOTE: cortex_agent_auth_token is NOT needed - service uses automatic OAuth
```

4. **Verify compute pool**:
```sql
DESCRIBE COMPUTE POOL cortex_agent_pool;
-- Status should be ACTIVE or IDLE
```

### "Failed to parse URL" or "Cannot GET /"

**Symptom**: Error 500 with message like "Failed to parse URL from cortex_agent_snowflake_url/api/..." or blank page showing "Cannot GET /"

**Cause**: 
- **"Failed to parse URL"**: Secrets not properly bound in service specification - the `secrets:` section is missing or misconfigured
- **"Cannot GET /"**: Container can't find static files (path resolution issue)

**Solution for "Failed to parse URL"**:
Check that your service specification includes the `secrets:` section properly formatted:

```yaml
containers:
  - name: cortex-agent-app
    secrets:
    - snowflakeSecret: YOUR_DB.YOUR_SCHEMA.cortex_agent_snowflake_url
      secretKeyRef: secret_string
      envVarName: SNOWFLAKE_ACCOUNT_URL
    # ... repeat for all 5 secrets (AUTH_TOKEN not needed!)
```

The secret must be referenced with fully qualified name: `<database>.<schema>.<secret_name>`

**Note:** Only 5 secrets are needed - AUTH_TOKEN is not required because SPCS automatically provides an OAuth token

**Solution for "Cannot GET /"**:
- Rebuild image with latest `server.js` (includes container path detection)
- Push new image and recreate service

### "Failed to load application config"

**Symptom**: Web UI shows config error

**Cause**: Missing or incorrect environment variables from secrets

**Solution**:
1. Verify secrets exist and have correct values:
```sql
-- List all secrets
SHOW SECRETS;

-- Recreate any missing secrets (example)
CREATE OR REPLACE SECRET cortex_agent_snowflake_url
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://your-account.snowflakecomputing.com';
```

2. Verify service specification includes proper `secrets:` section with fully qualified secret names

3. Recreate service with corrected specification:
```sql
DROP SERVICE cortex_agent_service;
-- (Re-run CREATE SERVICE from deploy.sql)
```

### Agent Verification Fails or "401 Unauthorized"

**Symptom**: "Verify Agent" button shows error or 401 Unauthorized

**Possible causes**:
1. **Incorrect agent name/path**: Verify agent exists and path is correct
2. **External access not working**: Check network rule and integration
3. **Service not using OAuth correctly**: Check service logs

**Solutions**:

1. **Verify agent exists** (from Snowflake worksheet):
```sql
SHOW CORTEX AGENTS IN SCHEMA <your_db>.<your_schema>;
-- Verify the agent name matches exactly
```

2. **Check service logs for authentication method**:
```sql
SELECT SYSTEM$GET_SERVICE_LOGS('cortex_agent_service', 0, 'cortex-agent-app', 100);
-- Look for: "[auth] Using SPCS OAuth token from /snowflake/session/token"
```

3. **Verify external access integration**:
```sql
SHOW EXTERNAL ACCESS INTEGRATIONS;
DESC EXTERNAL ACCESS INTEGRATION cortex_agent_external_access;

-- Recreate if needed
DROP EXTERNAL ACCESS INTEGRATION cortex_agent_external_access;
-- (Re-run steps 2-3 from deploy.sql)
```

4. **If still getting 401 errors**: This usually means the OAuth token is not being read correctly. Check that:
   - Image was built with the latest `server.js` (includes OAuth support)
   - Service has access to `/snowflake/session/token` (automatically provided by SPCS)

### Cannot Access Public Endpoint

**Symptom**: URL times out or shows "connection refused"

**Solutions**:

1. **Check endpoint exists**:
```sql
SHOW ENDPOINTS IN SERVICE cortex_agent_service;
```

2. **Verify service is running**:
```sql
CALL SYSTEM$GET_SERVICE_STATUS('cortex_agent_service');
-- Should show READY
```

3. **Check firewall/network**: Ensure your network allows HTTPS to `*.snowflakecomputing.app`

### High Costs / Unexpected Billing

**Solutions**:

1. **Check auto-suspend is working**:
```sql
SHOW COMPUTE POOLS;
-- Look at current_state - should be SUSPENDED when idle
```

2. **Review recent usage**:
```sql
SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.METERING_HISTORY
WHERE SERVICE_TYPE = 'SNOWPARK_CONTAINER_SERVICES'
  AND START_TIME >= DATEADD('day', -1, CURRENT_TIMESTAMP());
```

3. **Manually suspend**:
```sql
ALTER SERVICE cortex_agent_service SUSPEND;
ALTER COMPUTE POOL cortex_agent_pool SUSPEND;
```

---

## Security Considerations

### Secrets Management

- **Never commit secrets to git**: Use `.gitignore` for `.env` files
- **Rotate PAT tokens regularly**: Generate new token, update secret, test, revoke old token
- **Limit token scope**: Use role with minimum required permissions
- **Audit secret access**: Monitor `QUERY_HISTORY` for secret usage

### Network Security

- **External access is limited**: Only HTTPS to Snowflake account URL (no internet access)
- **Public endpoint requires HTTPS**: All traffic encrypted in transit
- **Consider IP whitelisting**: Use Snowflake network policies to restrict access

```sql
-- Example: Restrict public endpoint to specific IPs
CREATE NETWORK POLICY cortex_agent_access_policy
  ALLOWED_IP_LIST = ('203.0.113.0/24', '198.51.100.0/24');

-- Apply to user account or role
ALTER ACCOUNT SET NETWORK_POLICY = cortex_agent_access_policy;
```

### Access Control

- **Grant service access carefully**:
```sql
-- Only grant to necessary roles
GRANT USAGE ON SERVICE cortex_agent_service TO ROLE data_analyst_role;
```

- **Monitor service logs**: Regularly review logs for suspicious activity

### Production Recommendations

1. **Add authentication**: Implement Snowflake SSO or OAuth for the web UI
2. **Use separate roles**: Service role different from admin role
3. **Enable audit logging**: Configure event table for SPCS logs
4. **Set up alerts**: Monitor for failures, high usage, or security events
5. **Document access**: Keep record of who has access and why

---

## Advanced Topics

### Multi-Region Deployment

Deploy to multiple Snowflake regions for global users:
1. Deploy service in each region
2. Use DNS load balancing (e.g., AWS Route53, Cloudflare)
3. Configure region-specific agent endpoints

### Custom Domain

Map a custom domain to your SPCS public endpoint:
1. Get public endpoint URL from Snowflake
2. Create CNAME record: `app.yourdomain.com` → `xyz-service.snowflakecomputing.app`
3. Configure TLS certificate (Snowflake handles SSL for `.snowflakecomputing.app`)

### Scaling

Adjust compute pool for higher traffic:
```sql
-- Increase max nodes
ALTER COMPUTE POOL cortex_agent_pool SET MAX_NODES = 10;

-- Use larger instance size
-- (Requires recreating compute pool)
DROP COMPUTE POOL cortex_agent_pool;
CREATE COMPUTE POOL cortex_agent_pool
  MIN_NODES = 2
  MAX_NODES = 10
  INSTANCE_FAMILY = CPU_X64_M;  -- 4 CPU, 8GB RAM
```

---

## Additional Resources

- **Snowflake Docs**: [Snowpark Container Services](https://docs.snowflake.com/en/developer-guide/snowpark-container-services/overview)
- **Tutorial**: [SPCS Tutorial 1](https://docs.snowflake.com/en/developer-guide/snowpark-container-services/tutorials/tutorial-1)
- **Cortex Agents REST API**: [API Reference](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run)
- **Snowflake CLI**: [Installation Guide](https://docs.snowflake.com/en/developer-guide/snowflake-cli/installation)

---

## Support

For issues specific to this application, please create an issue in the GitHub repository.

For Snowflake platform issues, contact Snowflake Support or consult Snowflake documentation.

---

**Last Updated**: November 2025

