# AI-Ready Data Pipeline

## Snowflake Cortex Features Demo Documentation

## Overview

This demo showcases a comprehensive suite of Snowflake Cortex AI features through a practical SEC filings use case. The demo is split into two main components:

1. **Provider Setup** (`Provider_setup`): Creates sample data infrastructure with continuous data ingestion simulation
2. **Consumer Setup** (`Consumer_Setup`): Demonstrates AI/ML features including document processing, embeddings, search, and intelligent agents

### Key Cortex Features Demonstrated

- **AI_COMPLETE (AISQL)**: LLM-powered document metadata extraction
- **Text Chunking**: Recursive text splitting for optimal embedding
- **Vector Creation**: Document embeddings using Arctic embedding models  
- **Cortex Search**: Semantic search service over document embeddings
- **Cortex Analyst**: Semantic modeling and analysis capabilities
- **Cortex Agents**: Intelligent agents for SEC filing analysis
- **Snowflake Intelligence**: Advanced AI orchestration

---

## Provider Setup (`Provider_setup`)

### Purpose
Sets up a data provider environment with sample TPC-H data, creates views for demonstration purposes, and implements continuous data ingestion simulation.

### Section 1: Database and Schema Setup (Lines 1-10)

```sql
USE ROLE SYSADMIN;
CREATE OR REPLACE DATABASE TPCH_CUSTOMER_DATA;
CREATE OR REPLACE SCHEMA TPCH_CUSTOMER_DATA.CUSTOMER_AGG;
USE WAREHOUSE DASH_WH_S;
USE DATABASE TPCH_CUSTOMER_DATA;
USE SCHEMA CUSTOMER_AGG;
```

**Purpose**: Establishes the foundational database structure for the demo.

**Customization Required**:
- `DASH_WH_S`: Replace with your desired warehouse name
- Ensure the `SYSADMIN` role has appropriate permissions in your account

### Section 2: Sample Data Materialization (Lines 11-20)

```sql
CREATE OR REPLACE TABLE CUSTOMER AS SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.CUSTOMER;
-- Additional tables: LINEITEM, NATION, ORDERS, PART, PARTSUPP, REGION, SUPPLIER
```

**Purpose**: Copies TPC-H sample data into the new database schema to create a controllable dataset for the demo. This allows for data modifications and Dynamic Materialized Views (DMFs) setup.

**Note**: Uses Snowflake's built-in sample data, so no external data sources required.

### Section 3: Business Logic Views (Lines 22-49)

#### Customer Orders View (Lines 24-35)
```sql
CREATE OR REPLACE VIEW V_CUSTOMER_ORDERS AS
SELECT C.C_CUSTKEY, C.C_NAME, C.C_ACCTBAL, O.O_ORDERKEY, O.O_ORDERDATE, O.O_TOTALPRICE
FROM CUSTOMER AS C
INNER JOIN ORDERS AS O ON C.C_CUSTKEY = O.O_CUSTKEY;
```

**Purpose**: Creates a denormalized view combining customer and order information for easier analytics.

#### Nation Sales Aggregation (Lines 37-49)
```sql
CREATE OR REPLACE VIEW V_NATION_SALES AS
SELECT N.N_NAME, SUM(O.O_TOTALPRICE) AS TOTAL_SALES
FROM ORDERS AS O
INNER JOIN CUSTOMER AS C ON O.O_CUSTKEY = C.C_CUSTKEY
INNER JOIN NATION AS N ON C.C_NATIONKEY = N.N_NATIONKEY
GROUP BY N.N_NAME;
```

**Purpose**: Demonstrates aggregated analytics by grouping sales data by nation.

### Section 4: Continuous Data Ingestion Simulation (Lines 52-96)

#### Data Loading Stored Procedure (Lines 54-83)
```sql
CREATE OR REPLACE PROCEDURE TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_simple()
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS CALLER
```

**Purpose**: Simulates continuous data ingestion by randomly inserting new records into CUSTOMER (10 rows) and ORDERS (20 rows) tables every execution.

**Key Features**:
- Transactional integrity with BEGIN/COMMIT
- Random sampling using `ORDER BY RANDOM()`
- Controlled volume (10 customers, 20 orders per execution)

#### Automated Task Scheduling (Lines 87-96)
```sql
CREATE OR REPLACE TASK TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_task
  WAREHOUSE = DASH_WH_S
  SCHEDULE = '1 minutes'
AS CALL TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_simple();

ALTER TASK TPCH_CUSTOMER_DATA.CUSTOMER_AGG.load_data_task RESUME;
```

**Purpose**: Automates the data ingestion process to run every minute, simulating real-time data feeds.

**Customization Required**:
- `DASH_WH_S`: Replace with your warehouse name
- Consider adjusting the schedule based on demo needs and cost considerations

### Section 5: Data Validation (Lines 99-102)

```sql
SELECT COUNT(1) FROM V_CUSTOMER_ORDERS;
SELECT COUNT(1) FROM TPCH_CUSTOMER_DATA.CUSTOMER_AGG.CUSTOMER;
SELECT COUNT(1) FROM TPCH_CUSTOMER_DATA.CUSTOMER_AGG.ORDERS;
```

**Purpose**: Provides quick row counts to validate data growth from the automated ingestion process.

---

## Consumer Setup (`Consumer_Setup`)

### Purpose
Demonstrates the consumer side of data sharing and implements comprehensive Cortex AI features for SEC filing analysis.

### Section 1: Shared Data Access Setup (Lines 1-13)

```sql
USE ROLE ACCOUNTADMIN;
CREATE DATABASE SEC_FILINGS_SHARED_DB
FROM SHARE SFSENORTHAMERICA.MHARRIS_DEMO_AWSE.SEC_FILINGS_RAW_SHARE;
GRANT IMPORTED PRIVILEGES ON DATABASE SEC_FILINGS_SHARED_DB TO ROLE SYSADMIN;
```

**Purpose**: Establishes access to shared SEC filings data from a data provider.

**Critical Customization Required**:
- `SFSENORTHAMERICA.MHARRIS_DEMO_AWSE.SEC_FILINGS_RAW_SHARE`: Replace with your actual share identifier
- This share must exist and be accessible from your account

### Section 2: AI-Ready Infrastructure Setup (Lines 14-27)

```sql
USE ROLE ACCOUNTADMIN;
CREATE DATABASE IF NOT EXISTS ASST_MGMT;
CREATE SCHEMA IF NOT EXISTS ASST_MGMT.SEC_AI_READY;
CREATE OR REPLACE WAREHOUSE AI_READY_WH WAREHOUSE_SIZE = 'MEDIUM' 
  AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
```

**Purpose**: Creates dedicated infrastructure for AI processing workloads.

**Customization Options**:
- `AI_READY_WH`: Rename if desired
- `WAREHOUSE_SIZE = 'MEDIUM'`: Adjust based on workload requirements and cost considerations
- `AUTO_SUSPEND = 60`: Modify suspension time based on usage patterns

### Section 3: Document Metadata Extraction (Lines 28-57)

```sql
CREATE OR REPLACE DYNAMIC TABLE ASST_MGMT.SEC_AI_READY.SEC_DOC_METADATA 
TARGET_LAG = 'DOWNSTREAM'
WAREHOUSE = AI_READY_WH AS
SELECT
    SEC_DOCUMENT_ID, VALUE AS TEXT, CIK, ADSH, VARIABLE_NAME, PERIOD_END_DATE,
    SNOWFLAKE.CORTEX.COMPLETE(
        'llama3.1-70b',
        'I am going to provide a document which will be indexed by a retrieval system...'
    ) AS METADATA
FROM SEC_FILINGS_SHARED_DB.SEC_DOCS.SEC_FILINGS_RAW;
```

**Purpose**: Uses **AI_COMPLETE** (Cortex LLM) to extract structured metadata from SEC documents.

**Key AI Features**:
- **Model**: `llama3.1-70b` for high-quality extraction
- **Prompt Engineering**: Structured to extract specific fields:
  - Document Title
  - Document Type  
  - Document Date
  - Company Filing
  - Geographic Regions
  - Fiscal Sentiment
  - Summary of Risks
- **Dynamic Table**: Automatically refreshes when downstream dependencies update
- **Text Truncation**: Uses first 8,000 characters (`SUBSTR(VALUE, 0, 8000)`) for cost optimization

**Customization Options**:
- **LLM Model**: Consider `mixtral-8x7b` or other models based on cost/quality tradeoffs
- **Text Length**: Adjust the 8,000 character limit based on document size and processing costs
- **Extraction Fields**: Modify the prompt to extract different metadata fields

### Section 4: Text Chunking and Vector Embeddings (Lines 64-91)

```sql
CREATE OR REPLACE DYNAMIC TABLE ASST_MGMT.SEC_AI_READY.SEC_DOC_CHUNKS_EMBEDDINGS 
TARGET_LAG = '1 MINUTE' 
WAREHOUSE = AI_READY_WH AS
WITH SPLIT_TEXT_CHUNKS AS (
    SELECT M.*, C.VALUE AS CHUNK
    FROM ASST_MGMT.SEC_AI_READY.SEC_DOC_METADATA M,
    LATERAL FLATTEN(
        input => SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER(
            TEXT, 'none', 1800, 300
        )
    ) C
)
SELECT M.*,
    CONCAT(M.METADATA, '\n\n', C.CHUNK) AS CONTEXTUALIZED_CHUNK,
    AI_EMBED('snowflake-arctic-embed-l-v2.0', 
             CONCAT(M.METADATA, '\n\n', C.CHUNK)) AS EMBEDDING_ARCTIC_v2
FROM SPLIT_TEXT_CHUNKS C
JOIN ASST_MGMT.SEC_AI_READY.SEC_DOC_METADATA M ON C.SEC_DOCUMENT_ID = M.SEC_DOCUMENT_ID;
```

**Purpose**: Implements **text chunking** and **vector embeddings** for semantic search capabilities.

**Key AI Features**:
- **Text Chunking**: `SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER`
  - Chunk size: 1,800 characters
  - Overlap: 300 characters (prevents information loss at boundaries)
- **Contextualization**: Combines extracted metadata with each chunk for better search relevance
- **Vector Embeddings**: Uses `snowflake-arctic-embed-l-v2.0` model for high-quality embeddings
- **Dynamic Refresh**: Updates every minute to process new documents

**Customization Options**:
- **Chunk Size (1800)**: Larger chunks = more context, smaller chunks = more precise matching
- **Overlap (300)**: Higher overlap = better boundary handling but more storage
- **Embedding Model**: Arctic v2.0 provides excellent balance of quality and performance
- **Refresh Frequency**: Adjust based on data update frequency and cost considerations

### Section 5: Cortex Search Service (Lines 107-126)

```sql
CREATE OR REPLACE CORTEX SEARCH SERVICE SEC_FILINGS_SEARCH_SERVICE
  ON CONTEXTUALIZED_CHUNK
  ATTRIBUTES (SEC_DOCUMENT_ID, CIK, METADATA)
  WAREHOUSE = AI_READY_WH
  TARGET_LAG = '1 HOUR'
  EMBEDDING_MODEL = 'snowflake-arctic-embed-l-v2.0'
AS
    SELECT CONTEXTUALIZED_CHUNK, SEC_DOCUMENT_ID, CIK, METADATA
    FROM ASST_MGMT.SEC_AI_READY.SEC_DOC_CHUNKS_EMBEDDINGS;
```

**Purpose**: Creates a **Cortex Search Service** for semantic search over SEC documents.

**Key Features**:
- **Search Column**: `CONTEXTUALIZED_CHUNK` (metadata + text chunk)
- **Filter Attributes**: `SEC_DOCUMENT_ID`, `CIK`, `METADATA` for refined searches
- **Embedding Consistency**: Must match the model used in the dynamic table
- **Refresh Rate**: Updates hourly to balance freshness with cost

**Critical Requirement**: The `EMBEDDING_MODEL` must exactly match the model used in the embeddings dynamic table.

### Section 6: Search Testing (Lines 129-143)

```sql
SELECT PARSE_JSON(
  SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
      'ASST_MGMT.SEC_AI_READY.SEC_FILINGS_SEARCH_SERVICE',
      '{
        "query": "risks related to market competition and new entrants",
        "columns": ["SEC_DOCUMENT_ID", "METADATA", "CONTEXTUALIZED_CHUNK"],
        "limit": 3
      }'
  )
);
```

**Purpose**: Demonstrates semantic search functionality with a practical business query.

**Features**:
- **Natural Language Query**: Searches for business concepts rather than exact text matches
- **Flexible Results**: Returns document ID, metadata, and relevant text chunks
- **Limit Control**: Configurable result count for performance

### Section 7: Cortex Analyst Setup (Lines 146-150)

```sql
CREATE STAGE ASST_MGMT.SEC_AI_READY.SEMANTIC_MODEL_STAGE;
ALTER STAGE ASST_MGMT.SEC_AI_READY.SEMANTIC_MODEL_STAGE SET DIRECTORY = ( ENABLE = TRUE );
```

**Purpose**: Creates staging area for **Cortex Analyst** semantic models.

**Note**: The actual semantic model creation is done through the Snowflake UI, not SQL.

### Section 8: Cortex Agents and Intelligence (Lines 153-172)

```sql
CREATE DATABASE IF NOT EXISTS snowflake_intelligence;
CREATE SCHEMA IF NOT EXISTS snowflake_intelligence.agents;
GRANT CREATE AGENT ON SCHEMA snowflake_intelligence.agents TO ROLE ACCOUNTADMIN;
```

**Purpose**: Sets up infrastructure for **Cortex Agents** and **Snowflake Intelligence**.

**Agent Configuration** (Lines 162-168):
- **Response Instructions**: Defines agent personality as expert SEC analyst
- **Orchestration**: Specifies tool usage priorities (Search Service primary, Analyst secondary)

**Key Features**:
- Expert-level SEC analysis capabilities
- Cautious approach with uncertainty acknowledgment
- Multi-tool orchestration (Search + Analyst)

---

## Customization Requirements Summary

### Account-Specific Items to Change:

1. **Share Reference** (Line 6 in Consumer_Setup):
   ```sql
   SHARE SFSENORTHAMERICA.MHARRIS_DEMO_AWSE.SEC_FILINGS_RAW_SHARE
   ```
   Replace with your actual share identifier.

2. **Warehouse Names**:
   - `DASH_WH_S` in Provider_setup (Lines 5, 89)
   - `AI_READY_WH` throughout Consumer_Setup (adjust size if needed)

3. **Database Names** (optional):
   - `TPCH_CUSTOMER_DATA` in Provider_setup
   - `ASST_MGMT` in Consumer_Setup
   - `SEC_FILINGS_SHARED_DB` in Consumer_Setup

### Performance and Cost Optimization:

1. **Warehouse Sizing**: Adjust based on data volume and performance requirements
2. **Dynamic Table Refresh Rates**: Balance freshness needs with compute costs
3. **Text Processing Limits**: Modify chunk sizes and text truncation based on document characteristics
4. **LLM Model Selection**: Choose models based on quality/cost tradeoffs

### Prerequisites:

1. Access to shared SEC filings data or similar document dataset
2. Appropriate Snowflake account permissions (ACCOUNTADMIN recommended for setup)
3. Cortex features enabled in your Snowflake account
4. Understanding of expected compute costs for AI workloads

---

## Demo Flow and Dependencies

### Execution Order:
1. **Provider_setup**: Run first to establish data infrastructure
2. **Consumer_Setup**: Run second to build AI capabilities

### Key Dependencies:
- Consumer setup depends on accessible shared data
- Dynamic tables have upstream/downstream dependencies
- Search service depends on embeddings table
- Agent functionality requires search service and analyst setup

### Monitoring and Validation:
- Use the count queries to validate data ingestion
- Monitor dynamic table refresh status
- Test search functionality before proceeding to agent setup
- Verify agent responses align with expected SEC analysis quality

This demo provides a comprehensive showcase of Snowflake's AI/ML capabilities in a realistic business context, demonstrating the full pipeline from raw data to intelligent analysis.
