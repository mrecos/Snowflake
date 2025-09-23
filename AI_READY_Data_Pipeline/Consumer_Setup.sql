/*
===============================================================================
                  SNOWFLAKE CORTEX DEMO - CONSUMER SETUP
===============================================================================

PURPOSE: This script demonstrates comprehensive Snowflake Cortex AI/ML features
using SEC filing documents. It showcases the complete AI pipeline from raw
documents to intelligent analysis capabilities.

CORTEX FEATURES DEMONSTRATED:
✓ AI_COMPLETE (AISQL) - LLM-powered document analysis
✓ Text Chunking - Intelligent document segmentation
✓ Vector Embeddings - Semantic document representation
✓ Cortex Search - Semantic search over documents
✓ Cortex Analyst - Advanced analytics and insights
✓ Cortex Agents - Intelligent AI agents
✓ Snowflake Intelligence - AI orchestration platform

PREREQUISITES:
- ACCOUNTADMIN role permissions
- Access to SEC filings data share (customize line 6)
- Cortex features enabled in your Snowflake account
- Understanding of expected AI workload costs

CRITICAL CUSTOMIZATION REQUIRED:
- Line 6: Replace share name with your actual SEC filings data share
- Line 25: Adjust warehouse name and size based on your needs
- Lines 90, 117: Ensure warehouse names match throughout

COST CONSIDERATIONS:
- AI operations (LLM calls, embeddings) consume significant compute
- Dynamic tables refresh automatically - monitor costs
- Consider warehouse auto-suspend settings

===============================================================================
*/

-- Step 1: Use ACCOUNTADMIN role for comprehensive setup permissions
-- This role is required for creating databases, shares, and AI services
USE ROLE ACCOUNTADMIN;
/*
===============================================================================
                        SHARED DATA ACCESS SETUP
===============================================================================
Establish access to SEC filings data provided by an external data provider.
This demonstrates Snowflake's secure data sharing capabilities.
===============================================================================
*/

-- Step 2: Create a database from the external data share
-- CRITICAL: Replace the share name below with your actual share identifier
-- Format: <provider_org>.<provider_account>.<share_name>
CREATE DATABASE SEC_FILINGS_SHARED_DB
FROM
    SHARE SFSENORTHAMERICA.MHARRIS_DEMO_AWSE.SEC_FILINGS_RAW_SHARE;  -- CUSTOMIZE THIS!
-- Step 3: Grant access permissions to other roles in your account
-- This allows SYSADMIN and other roles to query the shared data
-- IMPORTED PRIVILEGES grants all permissions that came with the share
GRANT IMPORTED PRIVILEGES ON DATABASE SEC_FILINGS_SHARED_DB TO ROLE SYSADMIN;
-- Step 4: Validate shared data access
-- This query tests that we can read from the shared SEC filings data
-- Expected columns: SEC_DOCUMENT_ID, VALUE (document text), CIK, ADSH, etc.
SELECT
    *
FROM
    SEC_FILINGS_SHARED_DB.SEC_DOCS.SEC_FILINGS_RAW;

/*
===============================================================================
                     AI-READY INFRASTRUCTURE SETUP
===============================================================================
Create dedicated infrastructure for AI/ML workloads. This separates AI processing
from operational workloads and allows for optimized resource management.
===============================================================================
*/

-- Ensure we're using ACCOUNTADMIN for infrastructure creation
USE ROLE ACCOUNTADMIN;

-- Step 5: Create database for AI-processed data
-- This database will contain all AI-enhanced versions of our documents
CREATE DATABASE IF NOT EXISTS ASST_MGMT;

-- Step 6: Create schema specifically for AI-ready data structures  
-- This schema will contain dynamic tables, embeddings, and search services
CREATE SCHEMA IF NOT EXISTS ASST_MGMT.SEC_AI_READY;
-- Step 7: Create dedicated warehouse for AI workloads
-- AI operations (LLM calls, embeddings) are compute-intensive
-- CUSTOMIZE: Adjust warehouse size based on data volume and performance needs
-- COST TIP: MEDIUM is good for demos, consider LARGE for production workloads
CREATE OR REPLACE WAREHOUSE AI_READY_WH 
    WAREHOUSE_SIZE = 'MEDIUM'     -- Options: X-SMALL, SMALL, MEDIUM, LARGE, X-LARGE
    AUTO_SUSPEND = 60             -- Suspend after 60 seconds of inactivity 
    AUTO_RESUME = TRUE;           -- Auto-resume when queries are submitted
-- Step 8: Set context for all subsequent AI operations
-- All dynamic tables and AI services will be created in this schema
USE DATABASE ASST_MGMT;
USE SCHEMA SEC_AI_READY;

/*
===============================================================================
                      DOCUMENT METADATA EXTRACTION
===============================================================================
Use Cortex AI_COMPLETE to extract structured metadata from raw SEC documents.
This demonstrates LLM-powered document understanding and structured data extraction.

AI FEATURES USED:
- SNOWFLAKE.CORTEX.COMPLETE: LLM for document analysis
- Dynamic Tables: Automated data pipeline management
- Prompt Engineering: Structured extraction instructions
===============================================================================
*/

-- DYNAMIC TABLE 1: Extract structured metadata from documents using LLMs
-- Purpose: Transform unstructured documents into searchable, structured data
-- TARGET_LAG = 'DOWNSTREAM': Refreshes when downstream dependencies need updates
CREATE OR REPLACE DYNAMIC TABLE ASST_MGMT.SEC_AI_READY.SEC_DOC_METADATA 
    TARGET_LAG = 'DOWNSTREAM'     -- Efficient refresh strategy
    WAREHOUSE = AI_READY_WH       -- Use our AI-optimized warehouse
AS
SELECT
    SEC_DOCUMENT_ID,              -- Unique document identifier
    VALUE AS TEXT,               -- Raw document text content
    CIK,                        -- Company identifier (Central Index Key)
    ADSH,                       -- Accession number (filing identifier)
    VARIABLE_NAME,              -- Document section/variable name
    PERIOD_END_DATE,           -- Financial period end date
    -- AI_COMPLETE: Use LLM to extract structured metadata from documents
    -- MODEL: 'llama3.1-70b' provides high-quality extraction (consider cost vs. accuracy)
    -- ALTERNATIVE MODELS: 'mixtral-8x7b' (faster/cheaper), 'llama3.1-405b' (highest quality)
    SNOWFLAKE.CORTEX.COMPLETE(
        'llama3.1-70b',              -- LLM model selection
        
        -- PROMPT ENGINEERING: Carefully crafted instructions for consistent extraction
        'I am going to provide a document which will be indexed by a retrieval system containing many similar documents. I want you to provide key information associated with this document that can help differentiate this document in the index. Follow these instructions:
    1. Do not dwell on low level details. Only provide key high level information that a human might be expected to provide when searching for this doc.
    2. Do not use any formatting, just provide keys and values using a colon to separate key and value. Have each key and value be on a new line.
    3. Only extract at most the following information. If you are not confident with pulling any one of these keys, then do not include that key:\n' 
        
        -- TARGET EXTRACTION FIELDS: Customize these based on your use case
        || ARRAY_TO_STRING(
            ARRAY_CONSTRUCT(
                'DOCUMENT TITLE',                    -- Document name/title
                'DOCUMENT TYPE',                     -- Form type (10-K, 10-Q, etc.)
                'DOCUMENT DATE',                     -- Filing date
                'DOCUMENT COMPANY FILING',           -- Company name
                'DOCUMENT GEOGRAPHIC REGIONS COVERED', -- Geographic scope
                'DOCUMENT FISCAL SENTIMENT',         -- Overall sentiment
                'DOCUMENT SUMMARY OF RISKS'          -- Key risk factors
            ),
            '\t\t* '                                -- Format the extraction fields list
        ) 
        
        -- DOCUMENT CONTENT: Truncated to first 8000 chars for cost optimization
        -- COST CONSIDERATION: Larger documents = higher LLM processing costs
        || '\n\nDoc starts here:\n' 
        || SUBSTR(VALUE, 0, 8000)               -- Truncate long documents
        || '\nDoc ends here\n\n'
        
    ) AS METADATA,                              -- Extracted structured metadata
FROM
    SEC_FILINGS_SHARED_DB.SEC_DOCS.SEC_FILINGS_RAW;  -- Source: Raw shared SEC documents

-- VALIDATION QUERY 1: Check the extracted metadata
-- This query shows the LLM-extracted structured data from documents
-- Review the METADATA column to see the extracted fields
SELECT
    *
FROM
    ASST_MGMT.SEC_AI_READY.SEC_DOC_METADATA;

    

/*
===============================================================================
                    TEXT CHUNKING AND VECTOR EMBEDDINGS
===============================================================================
This section implements the core of semantic search by:
1. Chunking large documents into optimal sizes for embedding
2. Creating vector embeddings for semantic similarity search
3. Contextualizing chunks with metadata for better search results

AI CONCEPTS EXPLAINED:
- Text Chunking: Splits large documents into smaller, processable pieces
- Overlap: Prevents information loss at chunk boundaries  
- Embeddings: Convert text to numerical vectors for semantic comparison
- Contextualization: Combines metadata with chunks for richer search context
===============================================================================
*/

-- DYNAMIC TABLE 2: Create embeddings from document chunks
-- Purpose: Enable semantic search over document content
-- Refresh: Every minute to process new documents quickly
CREATE OR REPLACE DYNAMIC TABLE ASST_MGMT.SEC_AI_READY.SEC_DOC_CHUNKS_EMBEDDINGS 
    TARGET_LAG = '1 MINUTE'       -- Fast refresh for near real-time search
    WAREHOUSE = AI_READY_WH       -- Use AI-optimized warehouse
AS 

-- CTE: Split documents into optimally-sized chunks for embedding
WITH SPLIT_TEXT_CHUNKS AS (
    SELECT
        M.*,                      -- All metadata fields from previous step
        C.VALUE AS CHUNK         -- Individual text chunk
    FROM
        ASST_MGMT.SEC_AI_READY.SEC_DOC_METADATA M,
        
        -- LATERAL FLATTEN: Converts array of chunks into individual rows
        LATERAL FLATTEN(
            input => SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER (
                TEXT,                -- Source text to chunk
                'none',             -- Separator type (none = character-based)
                1800,               -- CHUNK SIZE: Optimize for embedding model limits
                                   -- Larger = more context, Smaller = more precise
                300                 -- CHUNK OVERLAP: Prevents information loss
                                   -- Higher overlap = better context continuity
            )
        ) C
)

-- Main query: Create contextualized chunks with embeddings
SELECT
    M.*,                        -- All original document metadata
    
    -- CONTEXTUALIZATION: Combine metadata with chunk for richer search results  
    -- This gives each chunk context about the overall document
    CONCAT(M.METADATA, '\n\n', C.CHUNK) AS CONTEXTUALIZED_CHUNK,
    
    -- VECTOR EMBEDDINGS: Convert text to numerical vectors for semantic search
    -- MODEL: snowflake-arctic-embed-l-v2.0 (optimized for retrieval tasks)
    -- ALTERNATIVES: e5-base-v2, all-MiniLM-L6-v2 (different performance/cost profiles)
    AI_EMBED(
        'snowflake-arctic-embed-l-v2.0',              -- Embedding model
        CONCAT(M.METADATA, '\n\n', C.CHUNK)           -- Text to embed (metadata + chunk)
    ) AS EMBEDDING_ARCTIC_v2                          -- Vector representation
    
FROM
    SPLIT_TEXT_CHUNKS C
    -- Join back to metadata to get all document context
    JOIN ASST_MGMT.SEC_AI_READY.SEC_DOC_METADATA M 
        ON C.SEC_DOCUMENT_ID = M.SEC_DOCUMENT_ID;
-- VALIDATION QUERY 2: Examine the chunked and embedded documents
-- This shows how documents were split into chunks with embeddings
-- Check CONTEXTUALIZED_CHUNK and EMBEDDING_ARCTIC_v2 columns
SELECT
    *
FROM
    ASST_MGMT.SEC_AI_READY.SEC_DOC_CHUNKS_EMBEDDINGS;

-- VALIDATION QUERY 3: Count unique documents processed
-- This helps verify all documents from the original dataset were processed
SELECT
    COUNT(DISTINCT SEC_DOCUMENT_ID) AS UNIQUE_DOCUMENTS_PROCESSED
FROM
    ASST_MGMT.SEC_AI_READY.SEC_DOC_CHUNKS_EMBEDDINGS;


-- VALIDATION QUERY 4: Sample the processed data
-- Review a sample to ensure chunking and embeddings look correct
SELECT * FROM ASST_MGMT.SEC_AI_READY.SEC_DOC_CHUNKS_EMBEDDINGS LIMIT 100;

-- VALIDATION QUERY 5: Verify document processing completeness
-- Compare this count with your source data to ensure no documents were lost
SELECT COUNT(DISTINCT SEC_DOCUMENT_ID) AS TOTAL_UNIQUE_DOCUMENTS 
FROM ASST_MGMT.SEC_AI_READY.SEC_DOC_CHUNKS_EMBEDDINGS;



/*
===============================================================================
                         CORTEX SEARCH SERVICE
===============================================================================
Create a semantic search service that enables natural language queries over
SEC documents. This service provides the foundation for AI agents and 
interactive document exploration.

KEY FEATURES:
- Semantic Search: Find documents by meaning, not just keywords
- Vector Similarity: Uses embeddings to find conceptually similar content
- Filtering: Can filter results by document attributes
- Real-time: Automatically updates as new documents are processed
===============================================================================
*/

-- CORTEX SEARCH SERVICE: Enable semantic search over SEC documents
-- This creates a searchable index of all document chunks with their embeddings
CREATE OR REPLACE CORTEX SEARCH SERVICE SEC_FILINGS_SEARCH_SERVICE
  
  -- PRIMARY SEARCH COLUMN: The text content users will search against
  ON CONTEXTUALIZED_CHUNK              -- Searches over metadata + chunk content
  
  -- ATTRIBUTES: Additional columns for filtering and result enrichment
  ATTRIBUTES (
      SEC_DOCUMENT_ID,                 -- Unique document identifier
      CIK,                            -- Company identifier for filtering
      METADATA                        -- Extracted metadata for context
  )
  
  WAREHOUSE = AI_READY_WH             -- Compute for search operations
  TARGET_LAG = '1 HOUR'               -- Index refresh frequency
  
  -- CRITICAL: Embedding model MUST match the one used in dynamic table
  EMBEDDING_MODEL = 'snowflake-arctic-embed-l-v2.0'
  
AS
    -- Define the data to be indexed by the search service
    SELECT
        CONTEXTUALIZED_CHUNK,           -- Searchable text content
        SEC_DOCUMENT_ID,               -- Document identifier
        CIK,                          -- Company identifier
        METADATA                      -- Document metadata
    FROM ASST_MGMT.SEC_AI_READY.SEC_DOC_CHUNKS_EMBEDDINGS;



/*
===============================================================================
                           SEARCH SERVICE TESTING
===============================================================================
Test the semantic search capabilities with business-relevant queries.
This demonstrates how users can find relevant SEC filing content using
natural language instead of exact keyword matching.
===============================================================================
*/

-- TEST QUERY: Semantic search for business risks
-- This query demonstrates natural language search over SEC filings
-- Try modifying the query to test different business concepts
SELECT PARSE_JSON(
  SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
      'ASST_MGMT.SEC_AI_READY.SEC_FILINGS_SEARCH_SERVICE',
      '{
        "query": "risks related to market competition and new entrants",  
        "columns": [                                 
            "SEC_DOCUMENT_ID",        -- Document identifier
            "METADATA",               -- LLM-extracted metadata  
            "CONTEXTUALIZED_CHUNK"    -- Relevant text chunk
        ],
        "limit": 3                   -- Number of results to return
      }'
  )
);

-- ADDITIONAL TEST QUERIES (uncomment to try):
-- Financial Performance: "revenue growth and profitability trends"
-- Regulatory Issues: "compliance challenges and regulatory changes"
-- Technology Risks: "cybersecurity threats and data protection"
-- Market Analysis: "industry outlook and competitive positioning"



/*
===============================================================================
                        CORTEX ANALYST SETUP
===============================================================================
Prepare infrastructure for Cortex Analyst, which provides advanced analytics
and business intelligence capabilities over the SEC document data.

NOTE: The semantic model creation is completed in the Snowflake UI after
running these SQL commands. This enables natural language analytics queries.
===============================================================================
*/

-- Create staging area for Cortex Analyst semantic models
-- This stage will hold the semantic model definitions and configurations
CREATE STAGE ASST_MGMT.SEC_AI_READY.SEMANTIC_MODEL_STAGE;

-- Enable directory listing for the stage (required for semantic model management)
ALTER STAGE ASST_MGMT.SEC_AI_READY.SEMANTIC_MODEL_STAGE 
    SET DIRECTORY = ( ENABLE = TRUE );

-- NEXT STEPS (complete in Snowflake UI):
-- 1. Navigate to Data > Databases > ASST_MGMT > SEC_AI_READY
-- 2. Create a new Semantic Model using the SEC document data
-- 3. Define metrics, dimensions, and relationships
-- 4. Enable natural language querying over your SEC data




/*
===============================================================================
                    CORTEX AGENTS & SNOWFLAKE INTELLIGENCE
===============================================================================
Set up the infrastructure for intelligent AI agents that can analyze SEC filings
and provide expert-level insights. These agents combine multiple AI capabilities
including search, analysis, and natural language interaction.

AGENT CAPABILITIES:
- Expert SEC filing analysis
- Multi-tool orchestration (Search + Analyst)
- Natural language interaction
- Contextual business insights
===============================================================================
*/

-- AGENT INFRASTRUCTURE SETUP
-- Create the required database and schema for Snowflake Intelligence
CREATE DATABASE IF NOT EXISTS snowflake_intelligence;
GRANT USAGE ON DATABASE snowflake_intelligence TO ROLE PUBLIC;

CREATE SCHEMA IF NOT EXISTS snowflake_intelligence.agents;
GRANT USAGE ON SCHEMA snowflake_intelligence.agents TO ROLE PUBLIC;

-- Grant permissions to create and manage AI agents
GRANT CREATE AGENT ON SCHEMA snowflake_intelligence.agents TO ROLE ACCOUNTADMIN;

/*
===============================================================================
                           AGENT CONFIGURATION
===============================================================================
These prompts define the AI agent's personality and behavior when analyzing
SEC filings. Copy these configurations when creating your agent in the UI.
===============================================================================
*/

-- AGENT RESPONSE INSTRUCTIONS (copy to agent setup in UI):
-- "You are an expert analyst who provides insightful, accurate and deep insights 
--  into SEC filing data. You respond in descriptive and well organized responses. 
--  You anticipate what the user is asking for and give full responses including 
--  insights aligned, but not directly asked for. You also are cautious and point 
--  out areas of uncertainty and gaps in your knowledge."

-- AGENT ORCHESTRATION INSTRUCTIONS (copy to agent setup in UI):
-- "Primarily use the SEC_FILINGS_SEARCH_SERVICE for answering questions. Use it 
--  for searching metadata and text chunks from SEC documents. Secondary, use 
--  SEC_FILINGS_ANALYST to answer questions on document types, IDs, and dates."

-- AGENT CREATION STEPS (complete in Snowflake UI):
-- 1. Navigate to AI Services > Agents in Snowflake UI
-- 2. Create new agent in snowflake_intelligence.agents schema
-- 3. Configure with the above response and orchestration instructions
-- 4. Connect to SEC_FILINGS_SEARCH_SERVICE and SEC_FILINGS_ANALYST
-- 5. Test with sample questions about SEC filings

/*
===============================================================================
                      OPTIONAL: KNOWLEDGE EXTENSIONS
===============================================================================
For advanced use cases, consider creating a Cortex Knowledge Extension to
share your SEC analysis capabilities with other Snowflake accounts.
===============================================================================
*/

-- CORTEX KNOWLEDGE EXTENSION SETUP (optional, advanced feature)
-- This allows you to package and share your SEC analysis capabilities
-- Complete setup in Snowflake UI following the documentation:
-- https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-knowledge-extensions/cke-overview

-- SETUP STEPS:
-- 1. Navigate to Data Products > Listings in Snowflake UI
-- 2. Create new internal listing for Cortex Knowledge Extension
-- 3. Package your search service and agent configurations
-- 4. Define access permissions and usage guidelines
-- 5. Publish to internal marketplace for organization-wide access

/*
===============================================================================
                              SETUP COMPLETE
===============================================================================
Congratulations! You have successfully set up a comprehensive Snowflake Cortex
AI demo showcasing:

✓ Document metadata extraction using LLMs
✓ Intelligent text chunking and embeddings
✓ Semantic search over SEC filings
✓ Infrastructure for advanced analytics (Cortex Analyst)
✓ AI agent capabilities (Cortex Agents)

NEXT STEPS:
1. Complete semantic model creation in Snowflake UI
2. Create and configure your AI agent in Snowflake UI
3. Test the complete pipeline with business questions
4. Monitor costs and optimize refresh frequencies
5. Consider creating Knowledge Extensions for broader sharing

For questions or troubleshooting, refer to the Snowflake Cortex documentation.
===============================================================================
*/