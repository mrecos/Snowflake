-- =============================================================================
-- Cortex Secure Multi-Tenant Demo - Snowflake Setup Script
-- =============================================================================
-- This script creates:
--   1. SALES_DATA_RAW table - The multi-tenant raw data table
--   2. V_SEMANTIC_SALES view - Secure view filtered by session variable
--   3. EXECUTE_SECURE_SQL procedure - Safe SQL execution with tenant context
-- =============================================================================

-- Set your database and schema context
-- CHANGE THESE TO MATCH YOUR ENVIRONMENT
USE DATABASE YOUR_DATABASE;
USE SCHEMA YOUR_SCHEMA;
USE WAREHOUSE YOUR_WAREHOUSE;

-- =============================================================================
-- STEP 1: Create the Raw Data Table
-- =============================================================================

CREATE OR REPLACE TABLE SALES_DATA_RAW (
    TRANS_ID VARCHAR(20) PRIMARY KEY,
    CONTAINER_ID VARCHAR(20) NOT NULL,      -- The Tenant ID (CRITICAL for isolation)
    ORDER_DATE DATE NOT NULL,
    PRODUCT_LINE VARCHAR(50) NOT NULL,
    PRODUCT_NAME VARCHAR(100) NOT NULL,
    REGION VARCHAR(20) NOT NULL,
    QUANTITY INTEGER NOT NULL,
    SALES_AMOUNT DECIMAL(12,2) NOT NULL,
    PROFIT_MARGIN DECIMAL(5,2) NOT NULL
);

-- Add comment for documentation
COMMENT ON TABLE SALES_DATA_RAW IS 
'Multi-tenant sales data. CONTAINER_ID is the tenant identifier. 
Access should only be through V_SEMANTIC_SALES view.';

-- =============================================================================
-- STEP 2: Load Sample Data
-- =============================================================================
-- Run the Python script first to generate sales_data.csv, then:
-- Option A: Use Snowsight file upload
-- Option B: Stage and copy (example below)

-- CREATE OR REPLACE STAGE sales_data_stage;
-- PUT file:///path/to/sales_data.csv @sales_data_stage;
-- COPY INTO SALES_DATA_RAW FROM @sales_data_stage
--   FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY='"' SKIP_HEADER = 1);

-- =============================================================================
-- STEP 3: Create the Secure View (The "Clean Room")
-- =============================================================================
-- This view filters data by the CURRENT_TENANT_ID session variable.
-- The Semantic Model will point to THIS view, not the raw table.

CREATE OR REPLACE SECURE VIEW V_SEMANTIC_SALES AS
SELECT
    ORDER_DATE,
    PRODUCT_LINE,
    PRODUCT_NAME,
    REGION,
    QUANTITY,
    SALES_AMOUNT,
    PROFIT_MARGIN
FROM SALES_DATA_RAW
WHERE CONTAINER_ID = GETVARIABLE('CURRENT_TENANT_ID');

-- Add comment for documentation
COMMENT ON VIEW V_SEMANTIC_SALES IS 
'Secure view for multi-tenant sales data. Filters by CURRENT_TENANT_ID session variable. 
This is what the Semantic Model references - it hides CONTAINER_ID from the AI.';

-- =============================================================================
-- STEP 4: Create the Secure SQL Execution Procedure
-- =============================================================================
-- This procedure:
--   1. Sets the tenant context (session variable)
--   2. Executes the provided SQL
--   3. Returns results (session variable is auto-scoped to procedure call)
--
-- Note: Session variables set within a procedure are scoped to that execution
-- and do not persist after the procedure ends, so no explicit cleanup needed.

CREATE OR REPLACE PROCEDURE EXECUTE_SECURE_SQL(sql_query STRING, tenant_id STRING)
RETURNS TABLE()
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    res RESULTSET;
BEGIN
    -- 1. Set the tenant context via session variable
    EXECUTE IMMEDIATE 'SET CURRENT_TENANT_ID = ''' || :tenant_id || '''';
    
    -- 2. Execute the provided SQL query
    res := (EXECUTE IMMEDIATE :sql_query);
    
    -- 3. Return the results
    -- Session variable is automatically scoped to this procedure call
    RETURN TABLE(res);

EXCEPTION
    WHEN OTHER THEN
        -- Re-raise the exception (session var is auto-cleaned up)
        RAISE;
END;
$$;

-- Add comment for documentation
COMMENT ON PROCEDURE EXECUTE_SECURE_SQL(STRING, STRING) IS 
'Executes SQL in a tenant-isolated context. Sets CURRENT_TENANT_ID session variable 
before execution and cleans up after. Use with V_SEMANTIC_SALES view.';

-- =============================================================================
-- STEP 5: Grant Permissions (Adjust roles as needed)
-- =============================================================================

-- Grant usage on the view to roles that will query it
-- GRANT SELECT ON V_SEMANTIC_SALES TO ROLE your_app_role;
-- GRANT USAGE ON PROCEDURE EXECUTE_SECURE_SQL(STRING, STRING) TO ROLE your_app_role;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Test 1: Verify raw data loaded correctly
SELECT 
    CONTAINER_ID,
    COUNT(*) as ROW_COUNT,
    SUM(SALES_AMOUNT) as TOTAL_SALES
FROM SALES_DATA_RAW
GROUP BY CONTAINER_ID
ORDER BY CONTAINER_ID;

-- Test 2: Verify secure view with tenant context
-- Note: Each SET overwrites the previous value, so no UNSET needed between tests
SET CURRENT_TENANT_ID = 'TENANT_100';
SELECT 'TENANT_100' as TENANT, COUNT(*) as ROW_COUNT, SUM(SALES_AMOUNT) as TOTAL_SALES FROM V_SEMANTIC_SALES;

SET CURRENT_TENANT_ID = 'TENANT_200';
SELECT 'TENANT_200' as TENANT, COUNT(*) as ROW_COUNT, SUM(SALES_AMOUNT) as TOTAL_SALES FROM V_SEMANTIC_SALES;

SET CURRENT_TENANT_ID = 'TENANT_300';
SELECT 'TENANT_300' as TENANT, COUNT(*) as ROW_COUNT, SUM(SALES_AMOUNT) as TOTAL_SALES FROM V_SEMANTIC_SALES;

-- Clear the session variable by setting to NULL
SET CURRENT_TENANT_ID = NULL;

-- Test 3: Verify the stored procedure works
CALL EXECUTE_SECURE_SQL('SELECT SUM(SALES_AMOUNT) as TOTAL_SALES FROM V_SEMANTIC_SALES', 'TENANT_100');
CALL EXECUTE_SECURE_SQL('SELECT SUM(SALES_AMOUNT) as TOTAL_SALES FROM V_SEMANTIC_SALES', 'TENANT_200');
CALL EXECUTE_SECURE_SQL('SELECT SUM(SALES_AMOUNT) as TOTAL_SALES FROM V_SEMANTIC_SALES', 'TENANT_300');

-- Test 4: Verify no data leakage (should return empty without context)
-- This should return 0 rows since no tenant context is set
SELECT COUNT(*) FROM V_SEMANTIC_SALES;

-- =============================================================================
-- SEMANTIC MODEL SETUP (Create after table is populated)
-- =============================================================================
-- Create the semantic model using the YAML file in semantic_model/sales_semantic_model.yaml
-- 
-- Option A: Upload YAML to a stage and create semantic model
-- CREATE OR REPLACE SEMANTIC MODEL SALES_SEMANTIC_MODEL
-- FROM @your_stage/sales_semantic_model.yaml;
--
-- Option B: Use Snowsight UI to create semantic model
-- Navigate to Data > Semantic Models > Create

SHOW TABLES LIKE 'SALES_DATA_RAW';
SHOW VIEWS LIKE 'V_SEMANTIC_SALES';
SHOW PROCEDURES LIKE 'EXECUTE_SECURE_SQL';

