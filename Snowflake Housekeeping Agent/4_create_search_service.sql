-- Create Cortex Search Service on materialized QUERY_HISTORY data
-- Run this AFTER materializing the query history data

USE DATABASE PLATFORM_ANALYTICS;
USE SCHEMA PUBLIC;

-- Create the Cortex Search Service
CREATE OR REPLACE CORTEX SEARCH SERVICE QUERY_HISTORY_SEARCH_SERVICE
ON QUERY_TEXT  -- Primary searchable column (SQL text content)
ATTRIBUTES (
    -- Core identifiers for filtering and context
    QUERY_ID,
    QUERY_TYPE,
    
    -- User and security context
    USER_NAME,
    ROLE_NAME,
    USER_TYPE,
    
    -- Infrastructure context
    DATABASE_NAME,
    SCHEMA_NAME,
    WAREHOUSE_NAME,
    WAREHOUSE_SIZE,
    
    -- Execution context
    START_TIME,
    END_TIME,
    EXECUTION_STATUS,
    ERROR_CODE,
    ERROR_MESSAGE,
    
    -- Performance metrics
    TOTAL_ELAPSED_TIME,
    BYTES_SCANNED,
    PERCENTAGE_SCANNED_FROM_CACHE,
    
    -- Cost information
    CREDITS_USED_CLOUD_SERVICES,
    
    -- Search-optimized fields
    SEARCH_METADATA,
    QUERY_SUMMARY,
    PERFORMANCE_CATEGORY,
    COST_CATEGORY,
    
    -- Spill indicators (for performance analysis)
    BYTES_SPILLED_TO_LOCAL_STORAGE,
    BYTES_SPILLED_TO_REMOTE_STORAGE
)
WAREHOUSE = COMPUTE_WH  -- Change this to your preferred warehouse
TARGET_LAG = '1 HOUR'   -- How often to refresh the search index
AS
SELECT 
    QUERY_TEXT,
    QUERY_ID,
    QUERY_TYPE,
    USER_NAME,
    ROLE_NAME,
    USER_TYPE,
    DATABASE_NAME,
    SCHEMA_NAME,
    WAREHOUSE_NAME,
    WAREHOUSE_SIZE,
    START_TIME,
    END_TIME,
    EXECUTION_STATUS,
    ERROR_CODE,
    ERROR_MESSAGE,
    TOTAL_ELAPSED_TIME,
    BYTES_SCANNED,
    PERCENTAGE_SCANNED_FROM_CACHE,
    CREDITS_USED_CLOUD_SERVICES,
    SEARCH_METADATA,
    QUERY_SUMMARY,
    PERFORMANCE_CATEGORY,
    COST_CATEGORY,
    BYTES_SPILLED_TO_LOCAL_STORAGE,
    BYTES_SPILLED_TO_REMOTE_STORAGE
FROM QUERY_HISTORY_MATERIALIZED;

-- Test the search service with sample queries
-- Wait a few minutes after creation for indexing to complete

-- Test 1: Find queries by SQL pattern
SELECT 'TEST 1: Find SELECT queries on SALES database' AS test_description;
SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'PLATFORM_ANALYTICS.PUBLIC.QUERY_HISTORY_SEARCH_SERVICE',
    '{
        "query": "SELECT FROM sales database table",
        "columns": ["QUERY_ID", "USER_NAME", "QUERY_SUMMARY", "QUERY_TEXT"],
        "limit": 3
    }'
);

-- Test 2: Find expensive queries
SELECT 'TEST 2: Find expensive or long-running queries' AS test_description;
SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'PLATFORM_ANALYTICS.PUBLIC.QUERY_HISTORY_SEARCH_SERVICE',
    '{
        "query": "expensive long running high cost query optimization",
        "columns": ["QUERY_ID", "USER_NAME", "COST_CATEGORY", "PERFORMANCE_CATEGORY", "QUERY_SUMMARY"],
        "limit": 3,
        "filter": {"COST_CATEGORY": ["EXPENSIVE", "VERY_EXPENSIVE"]}
    }'
);

-- Test 3: Find queries with errors
SELECT 'TEST 3: Find failed queries with error messages' AS test_description;
SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'PLATFORM_ANALYTICS.PUBLIC.QUERY_HISTORY_SEARCH_SERVICE',
    '{
        "query": "error failed compilation timeout",
        "columns": ["QUERY_ID", "USER_NAME", "ERROR_CODE", "ERROR_MESSAGE", "QUERY_SUMMARY"],
        "limit": 3,
        "filter": {"EXECUTION_STATUS": ["FAIL", "INCIDENT"]}
    }'
);

-- Test 4: Find queries by specific user or role patterns
SELECT 'TEST 4: Find queries by data engineering roles' AS test_description;
SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'PLATFORM_ANALYTICS.PUBLIC.QUERY_HISTORY_SEARCH_SERVICE',
    '{
        "query": "data engineer ETL transformation pipeline",
        "columns": ["USER_NAME", "ROLE_NAME", "DATABASE_NAME", "QUERY_TYPE", "QUERY_SUMMARY"],
        "limit": 3
    }'
);

-- Test 5: Find queries with performance issues
SELECT 'TEST 5: Find queries that spilled to disk' AS test_description;
SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'PLATFORM_ANALYTICS.PUBLIC.QUERY_HISTORY_SEARCH_SERVICE',
    '{
        "query": "memory spill disk storage performance optimization",
        "columns": ["QUERY_ID", "USER_NAME", "BYTES_SPILLED_TO_LOCAL_STORAGE", "BYTES_SPILLED_TO_REMOTE_STORAGE", "QUERY_SUMMARY"],
        "limit": 3
    }'
);

-- Advanced search examples with filters
SELECT 'ADVANCED: Find recent expensive queries by specific users' AS test_description;
SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'PLATFORM_ANALYTICS.PUBLIC.QUERY_HISTORY_SEARCH_SERVICE',
    '{
        "query": "expensive query optimization performance tuning",
        "columns": ["QUERY_ID", "USER_NAME", "COST_CATEGORY", "QUERY_SUMMARY", "START_TIME"],
        "limit": 5,
        "filter": {
            "COST_CATEGORY": ["EXPENSIVE", "VERY_EXPENSIVE", "MODERATE"]
        }
    }'
);

-- Utility: Check search service status and statistics
SELECT 'SEARCH SERVICE STATUS' AS info;
SHOW CORTEX SEARCH SERVICES LIKE 'QUERY_HISTORY_SEARCH_SERVICE';

-- Utility: Get search service information
SELECT 
    'SEARCH SERVICE INFO' AS category,
    COUNT(*) AS indexed_records
FROM QUERY_HISTORY_MATERIALIZED;

SELECT 
    'RECENT DATA AVAILABILITY' AS category,
    MIN(START_TIME) AS earliest_query,
    MAX(START_TIME) AS latest_query,
    COUNT(DISTINCT USER_NAME) AS unique_users,
    COUNT(DISTINCT DATABASE_NAME) AS unique_databases,
    COUNT(DISTINCT QUERY_TYPE) AS unique_query_types
FROM QUERY_HISTORY_MATERIALIZED;
