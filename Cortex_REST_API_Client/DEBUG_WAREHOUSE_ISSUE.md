# Debugging Warehouse Issue - Step by Step

## Current Situation
Agent responds with "requires a default warehouse to be set" even though:
- ✅ Code adds warehouse parameter to request body
- ✅ Service spec binds warehouse secret to WAREHOUSE env var
- ✅ Warehouse secret exists in deploy.sql

## Diagnostic Steps

### 1. Check if WAREHOUSE environment variable is being set

```sql
-- View service logs and look for warehouse info
SELECT SYSTEM$GET_SERVICE_LOGS('cortex_agent_service', 0, 'cortex-agent-app', 100);
```

**Look for these lines:**
```
[health] Environment check:
  WAREHOUSE: <your_warehouse_name>
```

OR:
```
[run] WARNING: WAREHOUSE environment variable not set!
```

**If you see "WAREHOUSE: MISSING"**, the secret is not being bound properly.

---

### 2. Verify the warehouse secret exists and has correct value

```sql
-- Show all secrets
SHOW SECRETS;

-- Check warehouse secret specifically
DESC SECRET cortex_agent_warehouse;

-- If missing or incorrect, recreate it:
CREATE OR REPLACE SECRET cortex_agent_warehouse
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_ACTUAL_WAREHOUSE_NAME';

-- Example:
CREATE OR REPLACE SECRET cortex_agent_warehouse
  TYPE = GENERIC_STRING
  SECRET_STRING = 'COMPUTE_WH';
```

---

### 3. Check if service was created with warehouse secret binding

```sql
-- Show service details
SHOW SERVICES;
DESC SERVICE cortex_agent_service;

-- Get service specification
CALL SYSTEM$GET_SERVICE_SPEC('cortex_agent_service');
```

**Look for this in the spec:**
```yaml
secrets:
  - snowflakeSecret: YOUR_DB.YOUR_SCHEMA.cortex_agent_warehouse
    secretKeyRef: secret_string
    envVarName: WAREHOUSE
```

**If missing**, you need to recreate the service.

---

### 4. Recreate service with proper secret binding

```sql
-- Drop the service
DROP SERVICE IF EXISTS cortex_agent_service;

-- Recreate with updated spec (from deploy.sql)
-- Make sure to replace <YOUR_DATABASE> and <YOUR_SCHEMA> with actual values
CREATE SERVICE cortex_agent_service
  IN COMPUTE POOL cortex_agent_pool
  FROM SPECIFICATION $$
spec:
  containers:
  - name: cortex-agent-app
    image: /YOUR_DB/YOUR_SCHEMA/cortex_agent_repo/cortex_agent_client:latest
    env:
      PORT: "8080"
    secrets:
    - snowflakeSecret: YOUR_DB.YOUR_SCHEMA.cortex_agent_snowflake_url
      secretKeyRef: secret_string
      envVarName: SNOWFLAKE_ACCOUNT_URL
    - snowflakeSecret: YOUR_DB.YOUR_SCHEMA.cortex_agent_name
      secretKeyRef: secret_string
      envVarName: AGENT_NAME
    - snowflakeSecret: YOUR_DB.YOUR_SCHEMA.cortex_agent_db
      secretKeyRef: secret_string
      envVarName: AGENT_DB
    - snowflakeSecret: YOUR_DB.YOUR_SCHEMA.cortex_agent_schema
      secretKeyRef: secret_string
      envVarName: AGENT_SCHEMA
    - snowflakeSecret: YOUR_DB.YOUR_SCHEMA.cortex_agent_warehouse
      secretKeyRef: secret_string
      envVarName: WAREHOUSE
    resources:
      requests:
        memory: 2Gi
        cpu: 1
      limits:
        memory: 3Gi
        cpu: 2
  endpoints:
  - name: web-ui
    port: 8080
    public: true
    protocol: HTTP
  $$
  EXTERNAL_ACCESS_INTEGRATIONS = (cortex_agent_external_access);
```

---

### 5. Verify warehouse is being passed in API request

After recreating the service, check logs again:

```sql
SELECT SYSTEM$GET_SERVICE_LOGS('cortex_agent_service', 0, 'cortex-agent-app', 100);
```

**Look for:**
```
[run] Using warehouse: YOUR_WAREHOUSE_NAME
[run] Request body: {
  "messages": [...],
  "warehouse": "YOUR_WAREHOUSE_NAME"
}
```

---

### 6. Test by submitting a question

1. Go to the SPCS app URL
2. Click "Verify Agent" (should succeed)
3. Submit a question that requires queries
4. Check logs immediately after:

```sql
SELECT SYSTEM$GET_SERVICE_LOGS('cortex_agent_service', 0, 'cortex-agent-app', 50);
```

---

## Most Likely Issues

### Issue 1: Service not recreated after secrets were added
**Solution:** Drop and recreate service (step 4 above)

### Issue 2: Warehouse secret has incorrect value
**Solution:** Recreate secret with correct warehouse name (step 2 above)

### Issue 3: Image doesn't have latest code with warehouse parameter
**Solution:** Rebuild and push image:
```bash
docker build --platform linux/amd64 -t cortex_agent_client:v1.1.4 .
docker tag cortex_agent_client:v1.1.4 <registry>/cortex_agent_repo/cortex_agent_client:latest
docker push <registry>/cortex_agent_repo/cortex_agent_client:latest

# Then recreate service
```

---

## Expected Working Output

When everything is working correctly, logs should show:

```
[server] listening on http://localhost:8080
[server] config status: missing env = none
[server] authentication: SPCS OAuth

[health] Environment check:
  SNOWFLAKE_ACCOUNT_URL: set
  SNOWFLAKE_HOST: app-abc123.snowflakecomputing.app
  AGENT_NAME: YOUR_AGENT_NAME
  AGENT_DB: YOUR_DATABASE
  AGENT_SCHEMA: YOUR_SCHEMA
  WAREHOUSE: YOUR_WAREHOUSE

[auth] Using SPCS OAuth token from /snowflake/session/token
[auth] Using SNOWFLAKE_HOST for internal routing: app-abc123.snowflakecomputing.app

[run] POST https://app-abc123.snowflakecomputing.app/api/v2/databases/YOUR_DB/schemas/YOUR_SCHEMA/agents/YOUR_AGENT:run
[run] Using warehouse: YOUR_WAREHOUSE
[run] Request body: {
  "messages": [
    {
      "role": "user",
      "content": [{"type": "text", "text": "your question"}]
    }
  ],
  "warehouse": "YOUR_WAREHOUSE"
}
```

---

## Next Steps

1. Run diagnostic step 1 first (check logs)
2. Based on what you find, follow the relevant solution
3. Report back what the logs show and I can help debug further

The enhanced logging in v1.1.4 will make it very clear whether the warehouse is being set or not.

