/*
===============================================================================
                    SNOWFLAKE CORTEX DEMO - PROVIDER SETUP
===============================================================================

PURPOSE: This script sets up the data provider side of a Snowflake Cortex demo.
It creates sample data infrastructure, business views, and simulates continuous
data ingestion to demonstrate real-time data scenarios.

FEATURES DEMONSTRATED:
- Sample data setup using TPC-H dataset
- Business logic views for analytics
- Continuous data ingestion simulation
- Automated task scheduling

PREREQUISITES:
- SYSADMIN role permissions
- Access to SNOWFLAKE_SAMPLE_DATA.TPCH_SF1 (built-in sample data)
- A warehouse for compute (customize DASH_WH_S below)

CUSTOMIZATION REQUIRED:
- Line 8: Replace 'DASH_WH_S' with your warehouse name
- Line 92: Replace 'DASH_WH_S' with your warehouse name (same as above)
- Optional: Modify database/schema names if desired

===============================================================================
*/

-- Step 1: Set the execution context for the demo
-- IMPORTANT: Ensure SYSADMIN role has permissions to create databases and schemas
USE ROLE SYSADMIN;
-- Step 2: Create the main database for our demo data
-- This database will hold all sample tables and views
CREATE OR REPLACE DATABASE TPCH_CUSTOMER_DATA;

-- Step 3: Create a schema for customer aggregation and analytics
CREATE OR REPLACE SCHEMA TPCH_CUSTOMER_DATA.CUSTOMER_AGG;

-- Step 4: Set the compute warehouse for this session
-- CUSTOMIZE THIS: Replace 'DASH_WH_S' with your warehouse name
-- Consider warehouse size based on data volume and performance needs
USE WAREHOUSE DASH_WH_S; -- Replace with your desired warehouse

-- Step 5: Switch to our newly created database and schema context
-- All subsequent objects will be created in this context
USE DATABASE TPCH_CUSTOMER_DATA;
USE SCHEMA CUSTOMER_AGG;

-- Step 6: Materialize sample data tables from Snowflake's built-in TPC-H dataset
-- We copy these tables (instead of using views) so we can:
--   1. Modify the data for demo purposes
--   2. Set up Dynamic Materialized Views (DMFs)
--   3. Simulate continuous data ingestion
-- TPC-H is a standard benchmark dataset representing business operations
CREATE OR REPLACE TABLE CUSTOMER AS SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.CUSTOMER;
CREATE OR REPLACE TABLE LINEITEM AS SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.LINEITEM;
CREATE OR REPLACE TABLE NATION AS SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.NATION;
CREATE OR REPLACE TABLE ORDERS AS SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.ORDERS;
CREATE OR REPLACE TABLE PART AS SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.PART;
CREATE OR REPLACE TABLE PARTSUPP AS SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.PARTSUPP;
CREATE OR REPLACE TABLE REGION AS SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.REGION;
CREATE OR REPLACE TABLE SUPPLIER AS SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.SUPPLIER;


/*
===============================================================================
                        BUSINESS LOGIC VIEWS SECTION
===============================================================================
Create analytical views that demonstrate real business use cases.
These views will be used by downstream consumers for analytics and reporting.
===============================================================================
*/

-- BUSINESS VIEW 1: Customer Orders Denormalized View
-- Purpose: Combines customer details with their order history
-- Use case: Customer analytics, order history analysis
CREATE OR REPLACE VIEW V_CUSTOMER_ORDERS AS
SELECT
    C.C_CUSTKEY,
    C.C_NAME,
    C.C_ACCTBAL,
    O.O_ORDERKEY,
    O.O_ORDERDATE,
    O.O_TOTALPRICE
FROM
    CUSTOMER AS C
INNER JOIN
    ORDERS AS O ON C.C_CUSTKEY = O.O_CUSTKEY;

-- BUSINESS VIEW 2: Nation-level Sales Aggregation
-- Purpose: Provides country-level sales summaries
-- Use case: Geographic sales analysis, regional performance reporting
CREATE OR REPLACE VIEW V_NATION_SALES AS
SELECT
    N.N_NAME,
    SUM(O.O_TOTALPRICE) AS TOTAL_SALES
FROM
    ORDERS AS O
INNER JOIN
    CUSTOMER AS C ON O.O_CUSTKEY = C.C_CUSTKEY
INNER JOIN
    NATION AS N ON C.C_NATIONKEY = N.N_NATIONKEY
GROUP BY
    N.N_NAME;



/*
===============================================================================
                    CONTINUOUS DATA INGESTION SIMULATION
===============================================================================
This section simulates real-time data ingestion that many production systems
require. It demonstrates:
- Stored procedures for data loading
- Transactional data operations
- Automated task scheduling
- Data growth monitoring

WARNING: The automated task will run every minute and consume compute credits.
Monitor costs and suspend the task when not actively demoing.
===============================================================================
*/

-- DATA INGESTION STORED PROCEDURE
-- Purpose: Simulates continuous data loading from an external source
-- Execution: Adds random sample data to simulate new customers and orders
CREATE OR REPLACE PROCEDURE TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_simple()
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
BEGIN
    -- Start a transaction to ensure all inserts are committed together
    -- This ensures data consistency - either all data loads or none does
    BEGIN TRANSACTION;

    -- Load 10 random customer records to simulate new customer registrations
    -- ORDER BY RANDOM() ensures we get different customers each time
    -- In production, this would pull from staging tables or external sources
    INSERT INTO TPCH_CUSTOMER_DATA.CUSTOMER_AGG.CUSTOMER
    SELECT *
    FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.CUSTOMER
    ORDER BY RANDOM()
    LIMIT 10;

    -- Load 20 random order records to simulate new order activity
    -- Higher order volume than customers simulates repeat business
    -- In production, this would be real transaction data
    INSERT INTO TPCH_CUSTOMER_DATA.CUSTOMER_AGG.ORDERS
    SELECT *
    FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.ORDERS
    ORDER BY RANDOM()
    LIMIT 20;

    -- Commit the transaction to save all changes
    -- If any insert failed, the entire transaction would roll back
    COMMIT;

    -- Return success message for monitoring and logging
    RETURN 'Successfully loaded 10 customer rows and 20 order rows.';
END;
$$;

-- MANUAL TESTING: Uncomment the line below to test the procedure manually
-- CALL TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_simple();
 
-- AUTOMATED TASK SETUP
-- Purpose: Automatically runs our data loading procedure every minute
-- COST WARNING: This will consume compute credits every minute until suspended
CREATE OR REPLACE TASK TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_task
  WAREHOUSE = DASH_WH_S  -- CUSTOMIZE: Use your warehouse name (same as line 8)
  SCHEDULE = '1 minutes'  -- Runs every minute - adjust frequency as needed
AS
  CALL TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_simple();


-- ACTIVATE THE AUTOMATED TASK
-- WARNING: This starts automatic data loading every minute
-- Remember to SUSPEND this task when demo is complete: 
-- ALTER TASK TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_task SUSPEND;
ALTER TASK TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_task RESUME;


/*
===============================================================================
                        DATA VALIDATION QUERIES
===============================================================================
Run these queries periodically to monitor data growth from the automated task.
Row counts should increase every minute while the task is active.
===============================================================================
*/

-- Monitor row counts to validate continuous data ingestion
-- Run these queries before and after task execution to see growth
SELECT COUNT(1) FROM V_CUSTOMER_ORDERS;         -- Combined customer-order view
SELECT COUNT(1) FROM TPCH_CUSTOMER_DATA.CUSTOMER_AGG.CUSTOMER;  -- Customer table
SELECT COUNT(1) FROM TPCH_CUSTOMER_DATA.CUSTOMER_AGG.ORDERS;    -- Orders table

-- OPTIONAL: More detailed monitoring query
-- SELECT 'Customers' as TABLE_TYPE, COUNT(1) as ROW_COUNT FROM CUSTOMER
-- UNION ALL
-- SELECT 'Orders' as TABLE_TYPE, COUNT(1) as ROW_COUNT FROM ORDERS
-- UNION ALL  
-- SELECT 'Customer_Orders_View' as TABLE_TYPE, COUNT(1) as ROW_COUNT FROM V_CUSTOMER_ORDERS;