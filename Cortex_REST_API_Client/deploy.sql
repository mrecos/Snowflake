-- =============================================================================
-- Snowpark Container Services Deployment Script
-- Cortex Agent REST API Client
-- =============================================================================
-- 
-- This script sets up all necessary Snowflake objects to deploy the
-- Cortex Agent REST API Client as a containerized service in SPCS.
--
-- Prerequisites:
-- - ACCOUNTADMIN role or equivalent privileges
-- - Docker image built and ready to push
-- - Snowflake account URL and PAT token
-- - Existing Cortex Agent configured in your Snowflake account
--
-- Instructions:
-- 1. Replace all placeholder values (marked with <>) with your actual values
-- 2. Execute this script in your Snowflake account
-- 3. Note the image repository URL from step 1 for docker push
-- 4. Build and push your Docker image (see docs/SPCS_DEPLOYMENT.md)
-- 5. Create the service (step 7)
-- =============================================================================

-- Use appropriate database and schema
-- IMPORTANT: The database and schema you specify here will be used in the image path
USE ROLE ACCOUNTADMIN;
USE DATABASE <YOUR_DATABASE>;
USE SCHEMA <YOUR_SCHEMA>;

-- =============================================================================
-- STEP 1: Create Image Repository
-- =============================================================================
-- This repository will store your containerized application image.
-- After creation, note the repository URL for docker push commands.

CREATE IMAGE REPOSITORY IF NOT EXISTS cortex_agent_repo;

-- View the repository URL (you'll need this for docker push)
SHOW IMAGE REPOSITORIES LIKE 'cortex_agent_repo';
-- Example output: <org>-<account>.registry.snowflakecomputing.com/<db>/<schema>/cortex_agent_repo

-- =============================================================================
-- STEP 2: Create Network Rule for External Access
-- =============================================================================
-- This allows the service to make outbound HTTPS calls to Snowflake's REST API.
-- Replace <your-account> with your actual Snowflake account identifier.

CREATE OR REPLACE NETWORK RULE cortex_agent_outbound
  TYPE = 'HOST_PORT'
  MODE = 'EGRESS'
  VALUE_LIST = (
    '<your-account>.snowflakecomputing.com:443',
    'cdn.jsdelivr.net:443',           -- Vega/Vega-Lite chart libraries
    'cdnjs.cloudflare.com:443'        -- Highlight.js code highlighting
  );

-- Example:
-- VALUE_LIST = (
--   'xy12345.us-east-1.snowflakecomputing.com:443',
--   'cdn.jsdelivr.net:443',
--   'cdnjs.cloudflare.com:443'
-- );

-- =============================================================================
-- STEP 3: Create External Access Integration
-- =============================================================================
-- This integration enables the service to use the network rule.

CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION cortex_agent_external_access
  ALLOWED_NETWORK_RULES = (cortex_agent_outbound)
  ENABLED = TRUE;

-- =============================================================================
-- STEP 4: Create Compute Pool
-- =============================================================================
-- CPU_X64_S provides 2 CPU and 4GB RAM per node.
-- Auto-suspend after 1 hour of inactivity to minimize costs.

CREATE COMPUTE POOL IF NOT EXISTS cortex_agent_pool
  MIN_NODES = 1
  MAX_NODES = 3
  INSTANCE_FAMILY = CPU_X64_S
  AUTO_RESUME = TRUE
  AUTO_SUSPEND_SECS = 3600;

-- Check compute pool status
DESCRIBE COMPUTE POOL cortex_agent_pool;

-- =============================================================================
-- STEP 5: Create Secrets
-- =============================================================================
-- Secrets store sensitive configuration values securely.
-- Replace all placeholder values with your actual configuration.
--
-- NOTE: AUTH_TOKEN is NOT needed for SPCS deployment!
-- The service automatically uses OAuth token from /snowflake/session/token
-- This bypasses IP restrictions and network policies.

-- Snowflake account URL
CREATE OR REPLACE SECRET cortex_agent_snowflake_url
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://<your-account>.snowflakecomputing.com';

-- Example:
-- SECRET_STRING = 'https://xy12345.us-east-1.snowflakecomputing.com';

-- Agent name
CREATE OR REPLACE SECRET cortex_agent_name
  TYPE = GENERIC_STRING
  SECRET_STRING = '<YOUR_AGENT_NAME>';

-- Example:
-- SECRET_STRING = 'HACKTHON_SP_TEST_V1';

-- Agent database
CREATE OR REPLACE SECRET cortex_agent_db
  TYPE = GENERIC_STRING
  SECRET_STRING = '<YOUR_AGENT_DATABASE>';

-- Example:
-- SECRET_STRING = 'CORTEX_AGENTS';

-- Agent schema
CREATE OR REPLACE SECRET cortex_agent_schema
  TYPE = GENERIC_STRING
  SECRET_STRING = '<YOUR_AGENT_SCHEMA>';

-- Example:
-- SECRET_STRING = 'PUBLIC';

-- Warehouse
CREATE OR REPLACE SECRET cortex_agent_warehouse
  TYPE = GENERIC_STRING
  SECRET_STRING = '<YOUR_WAREHOUSE>';

-- Example:
-- SECRET_STRING = 'COMPUTE_WH';

-- =============================================================================
-- STEP 6: Optional - Create Stage for Config File
-- =============================================================================
-- If you want to update config.json without rebuilding the image,
-- create a stage and upload config.json there.

-- CREATE OR REPLACE STAGE cortex_agent_config_stage
--   DIRECTORY = (ENABLE = TRUE);

-- Then upload config.json:
-- PUT file:///path/to/config.json @cortex_agent_config_stage AUTO_COMPRESS=FALSE;

-- Uncomment the volumes section in service-spec.yaml to use this.

-- =============================================================================
-- STEP 7: Create Service
-- =============================================================================
-- This creates the actual service using the specification file.
-- Make sure your Docker image has been pushed to the repository first!
-- 
-- IMPORTANT: Replace <YOUR_DATABASE> and <YOUR_SCHEMA> in the image path below
-- with the actual database and schema where you created the image repository.

CREATE SERVICE IF NOT EXISTS cortex_agent_service
  IN COMPUTE POOL cortex_agent_pool
  FROM SPECIFICATION $$
spec:
  containers:
  - name: cortex-agent-app
    image: /<YOUR_DATABASE>/<YOUR_SCHEMA>/cortex_agent_repo/cortex_agent_client:latest
    env:
      PORT: "8080"
    secrets:
    - snowflakeSecret: <YOUR_DATABASE>.<YOUR_SCHEMA>.cortex_agent_snowflake_url
      secretKeyRef: secret_string
      envVarName: SNOWFLAKE_ACCOUNT_URL
    - snowflakeSecret: <YOUR_DATABASE>.<YOUR_SCHEMA>.cortex_agent_name
      secretKeyRef: secret_string
      envVarName: AGENT_NAME
    - snowflakeSecret: <YOUR_DATABASE>.<YOUR_SCHEMA>.cortex_agent_db
      secretKeyRef: secret_string
      envVarName: AGENT_DB
    - snowflakeSecret: <YOUR_DATABASE>.<YOUR_SCHEMA>.cortex_agent_schema
      secretKeyRef: secret_string
      envVarName: AGENT_SCHEMA
    - snowflakeSecret: <YOUR_DATABASE>.<YOUR_SCHEMA>.cortex_agent_warehouse
      secretKeyRef: secret_string
      envVarName: WAREHOUSE
    # AUTH_TOKEN not needed - SPCS provides OAuth token automatically
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

-- Alternative: Use external specification file
-- CREATE SERVICE IF NOT EXISTS cortex_agent_service
--   IN COMPUTE POOL cortex_agent_pool
--   FROM @<stage>/service-spec.yaml
--   EXTERNAL_ACCESS_INTEGRATIONS = (cortex_agent_external_access);

-- =============================================================================
-- STEP 8: Grant Access
-- =============================================================================
-- Grant necessary privileges to roles that need to use the service.

GRANT USAGE ON SERVICE cortex_agent_service TO ROLE <YOUR_ROLE>;
GRANT USAGE ON COMPUTE POOL cortex_agent_pool TO ROLE <YOUR_ROLE>;

-- =============================================================================
-- STEP 9: Monitor and Verify
-- =============================================================================

-- Check service status
CALL SYSTEM$GET_SERVICE_STATUS('cortex_agent_service');

-- View service logs
SELECT SYSTEM$GET_SERVICE_LOGS('cortex_agent_service', 0, 'cortex-agent-app', 100);

-- Show public endpoints
SHOW ENDPOINTS IN SERVICE cortex_agent_service;

-- Describe the service
DESCRIBE SERVICE cortex_agent_service;

-- =============================================================================
-- Maintenance Commands
-- =============================================================================

-- Suspend service (stop billing)
-- ALTER SERVICE cortex_agent_service SUSPEND;

-- Resume service
-- ALTER SERVICE cortex_agent_service RESUME;

-- Update service (after pushing new image)
-- ALTER SERVICE cortex_agent_service FROM SPECIFICATION $$
-- ... (paste updated spec here)
-- $$;

-- Drop service (cleanup)
-- Note: Dropping the service automatically revokes its secret grants
-- DROP SERVICE IF EXISTS cortex_agent_service;
-- DROP COMPUTE POOL IF EXISTS cortex_agent_pool;
-- DROP IMAGE REPOSITORY IF EXISTS cortex_agent_repo;
-- DROP SECRET IF EXISTS cortex_agent_snowflake_url;
-- DROP SECRET IF EXISTS cortex_agent_name;
-- DROP SECRET IF EXISTS cortex_agent_db;
-- DROP SECRET IF EXISTS cortex_agent_schema;
-- DROP SECRET IF EXISTS cortex_agent_warehouse;
-- DROP EXTERNAL ACCESS INTEGRATION IF EXISTS cortex_agent_external_access;
-- DROP NETWORK RULE IF EXISTS cortex_agent_outbound;

-- =============================================================================
-- Cost Monitoring
-- =============================================================================

-- View compute pool activity
SELECT * FROM TABLE(INFORMATION_SCHEMA.COMPUTE_POOL_HISTORY(
  POOL_NAME => 'cortex_agent_pool'
));

-- View service metrics (requires event table configured)
-- SELECT * FROM TABLE(SPCS_GET_METRICS('cortex_agent_service'));

