-- =============================================================================
-- Cortex Secure Multi-Tenant Demo - Snowflake Setup Script
-- =============================================================================
-- This script creates:
--   1. SALES_DATA_RAW table - The multi-tenant raw data table
--   2. V_SEMANTIC_SALES view - Secure view filtered by session variable
--   3. EXECUTE_SECURE_SQL procedure - Safe SQL execution with tenant context
-- =============================================================================

CREATE SCHEMA CORTEX_TESTING.MULT_TENANT;

CREATE OR REPLACE STAGE CORTEX_TESTING.MULT_TENANT.SALES_DATA_STAGE
  FILE_FORMAT = (
    TYPE = CSV
    FIELD_OPTIONALLY_ENCLOSED_BY = '"'
    SKIP_HEADER = 1
    NULL_IF = ('', 'NULL')
  );
  
-- Set your database and schema context
-- CHANGE THESE TO MATCH YOUR ENVIRONMENT
USE DATABASE CORTEX_TESTING;
USE SCHEMA MULT_TENANT;
USE WAREHOUSE BI_MEDIUM_WH;

-- =============================================================================
-- STEP 1: Create the Raw Data Table
-- =============================================================================
CREATE OR REPLACE TABLE PRODUCT_DATA_RAW (
    TRANS_ID VARCHAR(20) PRIMARY KEY,
    CUSTOMER_ID VARCHAR(20) NOT NULL,      -- The customer ID (CRITICAL for isolation)
    ORDER_DATE DATE NOT NULL,
    PRODUCT_LINE VARCHAR(50) NOT NULL,
    PRODUCT_NAME VARCHAR(100) NOT NULL,
    REGION VARCHAR(20) NOT NULL,
    QUANTITY INTEGER NOT NULL,
    SALES_AMOUNT DECIMAL(12,2) NOT NULL,
    PROFIT_MARGIN DECIMAL(5,2) NOT NULL
);

-- Add comment for documentation
COMMENT ON TABLE PRODUCT_DATA_RAW IS 
'Multi-tenant product data. CUSTOMER_ID is the tenant identifier. 
Access should only be through V_SEMANTIC_SALES view.';


COPY INTO PRODUCT_DATA_RAW (
    TRANS_ID,
    CUSTOMER_ID,
    ORDER_DATE,
    PRODUCT_LINE,
    PRODUCT_NAME,
    REGION,
    QUANTITY,
    SALES_AMOUNT,
    PROFIT_MARGIN
)
FROM @CORTEX_TESTING.MULT_TENANT.SALES_DATA_STAGE
FILE_FORMAT = (
    TYPE = CSV
    FIELD_OPTIONALLY_ENCLOSED_BY = '"'
    SKIP_HEADER = 1
    NULL_IF = ('', 'NULL')
)
ON_ERROR = 'CONTINUE';

SELECT 
    CUSTOMER_ID,
    COUNT(*) as ROW_COUNT,
    SUM(SALES_AMOUNT) as TOTAL_SALES
FROM PRODUCT_DATA_RAW
GROUP BY CUSTOMER_ID
ORDER BY CUSTOMER_ID;

-- =============================================================================
-- STEP 2: Create the Session State Table (The "Context Table")
-- =============================================================================
-- This table stores the active tenant context for each session.
-- It is written to by the stored procedure and read by the secure view.
-- Each row is keyed by CURRENT_SESSION() to ensure isolation between users.

CREATE OR REPLACE TABLE APP_SESSION_STATE (
    SESSION_ID VARCHAR NOT NULL,
    CUSTOMER_ID VARCHAR(20) NOT NULL,
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (SESSION_ID)
);

COMMENT ON TABLE APP_SESSION_STATE IS 
'Session-keyed context table for multi-tenant isolation.
Stores the active CUSTOMER_ID for each Snowflake session.
Only the EXECUTE_SECURE_SQL procedure should write to this table.';


-- =============================================================================
-- STEP 4: Create the Secure View (The "Clean Room")
-- =============================================================================
-- This view filters data by looking up the tenant from APP_SESSION_STATE
-- using the current session ID. This is the "magic link" that enables
-- tenant isolation in Owner's Rights stored procedures.
--
-- The Semantic Model points to THIS view, not the raw table.
-- The AI never sees CUSTOMER_ID or knows multi-tenancy exists.

CREATE OR REPLACE SECURE VIEW V_SEMANTIC_SALES AS
SELECT
    CUSTOMER_ID,
    ORDER_DATE,
    PRODUCT_LINE,
    PRODUCT_NAME,
    REGION,
    QUANTITY,
    SALES_AMOUNT,
    PROFIT_MARGIN
FROM PRODUCT_DATA_RAW
WHERE CUSTOMER_ID = (
    SELECT CUSTOMER_ID 
    FROM APP_SESSION_STATE 
    WHERE SESSION_ID = CURRENT_SESSION()
);

COMMENT ON VIEW V_SEMANTIC_SALES IS 
'Secure view for multi-tenant sales data. 
Filters by looking up CUSTOMER_ID from APP_SESSION_STATE using CURRENT_SESSION().
This is what the Semantic Model references - it hides CUSTOMER_ID from the AI.';



-- =============================================================================
-- STEP 5: Create the Secure SQL Execution Procedure
-- =============================================================================
-- This procedure implements the "Session-Keyed Context Table" pattern:
--   1. CLEANUP: Remove any stale state for this session
--   2. SET CONTEXT: Insert the tenant ID for this session
--   3. EXECUTE: Run the Cortex-generated SQL (view reads from context table)
--   4. CLEANUP: Remove the state after execution
--
-- EXECUTE AS OWNER is critical - it allows the procedure to:
--   - Write to APP_SESSION_STATE (users cannot)
--   - Read from SALES_DATA_RAW through the view (users cannot directly)

CREATE OR REPLACE PROCEDURE EXECUTE_SECURE_SQL(sql_query STRING, customer_id STRING)
RETURNS TABLE()
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    rs RESULTSET;
BEGIN
    -- 1. CLEANUP (Defensive): Remove any stale state for this session
    DELETE FROM APP_SESSION_STATE WHERE SESSION_ID = CURRENT_SESSION();

    -- 2. SET CONTEXT: Write the customer ID for this specific session
    INSERT INTO APP_SESSION_STATE (SESSION_ID, CUSTOMER_ID) 
    VALUES (CURRENT_SESSION(), :customer_id);

    -- 3. EXECUTE: Run the Cortex-generated SQL
    -- The View will look up CURRENT_SESSION() in the table and find the ID we just inserted
    rs := (EXECUTE IMMEDIATE :sql_query);

    -- 4. CLEANUP: Remove the state immediately after execution
    DELETE FROM APP_SESSION_STATE WHERE SESSION_ID = CURRENT_SESSION();
    
    RETURN TABLE(rs);

EXCEPTION
    WHEN OTHER THEN
        -- Ensure we clean up even on error to prevent state leaks
        DELETE FROM APP_SESSION_STATE WHERE SESSION_ID = CURRENT_SESSION();
        RAISE;
END;
$$;

COMMENT ON PROCEDURE EXECUTE_SECURE_SQL(STRING, STRING) IS 
'Executes SQL in a tenant-isolated context using the Session-Keyed Context Table pattern.
Inserts tenant context into APP_SESSION_STATE before execution and cleans up after.
The V_SEMANTIC_SALES view reads from this table to filter by tenant.';

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
    CUSTOMER_ID,
    COUNT(*) as ROW_COUNT,
    SUM(SALES_AMOUNT) as TOTAL_SALES
FROM PRODUCT_DATA_RAW
GROUP BY CUSTOMER_ID
ORDER BY CUSTOMER_ID;

-- Test 3: Verify the stored procedure works
CALL EXECUTE_SECURE_SQL('SELECT SUM(SALES_AMOUNT) as TOTAL_SALES FROM V_SEMANTIC_SALES', 'TENANT_100');
CALL EXECUTE_SECURE_SQL('SELECT SUM(SALES_AMOUNT) as TOTAL_SALES FROM V_SEMANTIC_SALES', 'TENANT_100');
CALL EXECUTE_SECURE_SQL('SELECT SUM(SALES_AMOUNT) as TOTAL_SALES FROM V_SEMANTIC_SALES', 'TENANT_200');
CALL EXECUTE_SECURE_SQL('SELECT * FROM V_SEMANTIC_SALES', 'TENANT_300');

-- Test 3: Verify no data leakage (should return empty without context)
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

