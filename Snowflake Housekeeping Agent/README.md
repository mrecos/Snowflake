# Snowflake Platform Health & Governance Semantic Model

A comprehensive AI-powered analytics solution for Snowflake platform monitoring, cost optimization, and governance using Cortex Analyst and Cortex Search Service.

## Overview

This project provides a production-ready semantic model that transforms Snowflake's `ACCOUNT_USAGE` schema into an intelligent analytics platform. It combines structured data analysis through Cortex Analyst with semantic query search capabilities, enabling natural language questions about platform performance, costs, security, and governance.

### Key Features

- **🤖 AI-Powered Analytics**: Natural language queries using Cortex Analyst
- **🔍 Semantic Search**: Find specific queries by business context using Cortex Search Service  
- **💰 Cost Attribution**: Accurate per-query cost analysis using `QUERY_ATTRIBUTION_HISTORY`
- **⚡ Performance Insights**: Query optimization recommendations and performance trending
- **🛡️ Governance & Security**: User access patterns, role analysis, and compliance monitoring
- **📊 Operational Intelligence**: Warehouse utilization, resource optimization, and capacity planning

## Architecture

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│  ACCOUNT_USAGE      │    │  PLATFORM_ANALYTICS │    │   AI SERVICES       │
│                     │    │                      │    │                     │
│  • QUERY_HISTORY    │───▶│  • Materialized      │───▶│  • Cortex Analyst   │
│  • WAREHOUSE_*      │    │    Tables            │    │  • Cortex Search    │
│  • USERS, ROLES     │    │  • Search Service    │    │  • Semantic Model   │
│  • DATABASES, etc.  │    │  • Automated Refresh │    │                     │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
```

## Prerequisites

- Snowflake account with `ACCOUNTADMIN` privileges for setup
- Access to `SNOWFLAKE.ACCOUNT_USAGE` schema
- Warehouse for compute operations
- Cortex Analyst and Cortex Search Service enabled in your region

## Setup Guide

### Step 1: Configure Your Environment

Before proceeding, customize the following account-specific values throughout the SQL files:

**Critical configurations to update:**

| Configuration | Default Value | Where to Change |
|---------------|---------------|-----------------|
| Database name | `PLATFORM_ANALYTICS` | All SQL files, line with `USE DATABASE` |
| Schema name | `PUBLIC` | All SQL files, line with `USE SCHEMA` |
| Warehouse name | `COMPUTE_WH` | `create_refresh_task.sql` and `create_search_service.sql` |
| Schedule | `0 2 * * * UTC` | `create_refresh_task.sql` line 10 |
| Refresh frequency | `1 HOUR` | `create_search_service.sql` line 52 |

### Step 2: Create Database Infrastructure

Execute the SQL in `Database Context Setup.sql` in your Snowflake environment:
- Creates the `PLATFORM_ANALYTICS` database for analytics workloads
- Creates the `SEMANTIC_MODELS` schema for model storage  
- Creates a stage for YAML specification files with directory enabled

### Step 3: Materialize Query History Data

Run the SQL in `materialize_query_history.sql`:
- Creates the `QUERY_HISTORY_MATERIALIZED` table with all necessary columns
- Populates it with 60 days of historical query data from `ACCOUNT_USAGE.QUERY_HISTORY`
- Adds search-optimized fields (`SEARCH_METADATA`, `QUERY_SUMMARY`, performance/cost categories)
- Creates indexes for query performance
- Sets up proper permissions

**Note:** This step may take several minutes depending on your query volume.

### Step 4: Set Up Automated Data Refresh

Execute the SQL in `create_refresh_task.sql`:
- Creates a stored procedure `REFRESH_QUERY_HISTORY_PROC()` that handles incremental data loading
- Creates a Snowflake task `REFRESH_QUERY_HISTORY_TASK` scheduled to run daily at 2 AM UTC
- Includes manual execution commands for testing and troubleshooting
- Sets up proper task permissions and monitoring queries

### Step 5: Create the Search Service

Run the SQL in `create_search_service.sql`:
- Creates the Cortex Search Service `QUERY_HISTORY_SEARCH_SERVICE` on the materialized table
- Configures searchable attributes for filtering and context
- Includes comprehensive test queries to verify functionality
- Sets up 1-hour refresh interval for the search index

**Important:** Wait 10-15 minutes after creation for initial indexing to complete before testing.

### Step 6: Deploy the Semantic Model

Upload `semantic_model.yaml` through the Snowflake UI:
1. Navigate to **Projects** → **Cortex Analyst** in Snowsight
2. Create a new semantic model or update an existing one
3. Upload the YAML file or copy/paste its contents
4. Validate the model configuration
5. Publish for use with natural language queries

### Step 7: Create the Cortex Analyst

Set up the Cortex Analyst using your deployed semantic model:
1. In Snowsight, navigate to **Projects** → **Cortex Analyst**
2. Create a new analyst or configure an existing one
3. Associate it with the semantic model you deployed in Step 6
4. Test with sample natural language queries to verify functionality
5. Note the analyst's name/identifier for use in the next step

### Step 8: Create the Cortex Agent

Build an integrated agent that combines both search and analyst capabilities:
1. Navigate to **Projects** → **Cortex Agents** in Snowsight
2. Create a new agent with the following tools:
   - **Cortex Search Service**: `QUERY_HISTORY_SEARCH_SERVICE` (from Step 5)
   - **Cortex Analyst**: The analyst created in Step 7
3. Configure agent instructions for tool orchestration:
   - **Description**: "This AI agent provides comprehensive Snowflake platform analytics by combining structured data analysis with intelligent query search capabilities"
   - **Orchestration Instructions**: "For cost and performance questions, first determine if the user needs warehouse-level analysis, individual query costs, or query patterns. Start with broad analysis using the semantic model, then drill down with specific queries or search service for details"
   - **Response Instructions**: "Provide data-driven insights with specific numbers, timeframes, and actionable recommendations. Always clarify data freshness and focus on business impact"
4. Test the agent with multi-step questions that require both search and analysis
5. Note the agent identifier for the final deployment step

### Step 9: Deploy to Snowflake Intelligence

Make the agent accessible to end users through Snowflake Intelligence:
1. Navigate to **Snowflake Intelligence** in Snowsight
2. Add your Cortex Agent from Step 8 to the available agents
3. Configure user access permissions and sharing settings
4. Provide end users with guidance on the types of questions they can ask
5. Monitor usage and refine agent instructions based on common user patterns

**Final Result**: End users can now ask natural language questions about platform health, costs, and governance through a conversational interface that intelligently combines search and analytics capabilities.


## Usage Examples

### Natural Language Queries (Cortex Analyst)

```sql
-- Cost analysis
"Show me the top 10 most expensive queries by user role for the last 30 days"

-- Performance optimization  
"Find queries that scan large amounts of data without using clustering"

-- Operational insights
"What are the peak usage hours for our data warehouse"

-- Governance monitoring
"Show me users who haven't logged in for 90 days"
```

### Semantic Search Queries (Search Service)

```sql
-- Find queries by business context
SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'PLATFORM_ANALYTICS.PUBLIC.QUERY_HISTORY_SEARCH_SERVICE',
    '{"query": "ETL transformation pipeline data engineering", "limit": 5}'
);

-- Find performance problems
SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'PLATFORM_ANALYTICS.PUBLIC.QUERY_HISTORY_SEARCH_SERVICE',
    '{"query": "memory spill disk storage optimization", "limit": 3}'
);
```

## Semantic Model Design

### Design Philosophy

The semantic model is built around **Platform Health & Governance** with three core principles:

1. **Natural Language Accessibility**: Extensive synonym system allows business users to ask questions in their own terminology
2. **Cost Attribution Accuracy**: Proper handling of different cost types (compute, serverless, storage) with clear guidance to prevent incorrect aggregations
3. **Operational Intelligence**: Pre-built filters and metrics for common platform management scenarios

### Coverage & Structure

**12 Core Tables Covered:**
- `QUERY_HISTORY` - Primary operational data with 10+ filters and 6+ metrics
- `QUERY_ATTRIBUTION_HISTORY` - **Primary cost analysis table** (new addition)
- `WAREHOUSE_METERING_HISTORY` - Compute cost tracking
- `WAREHOUSE_LOAD_HISTORY` - Resource utilization
- `USERS`, `ROLES` - Identity and access management
- `DATABASES`, `SCHEMATA`, `TABLES`, `VIEWS` - Object governance
- `LOGIN_HISTORY` - Security monitoring
- `QUERY_INSIGHTS` - Performance optimization

### Strengths

✅ **Comprehensive Synonym Coverage**: 200+ dimensions with 3-5 synonyms each for natural language flexibility

✅ **Cost Attribution Accuracy**: Dedicated `QUERY_ATTRIBUTION_HISTORY` integration prevents common cost calculation errors

✅ **Governance Focus**: Built-in privacy protections, data freshness guidance, and compliance-ready metrics

✅ **Operational Intelligence**: Pre-configured filters for common scenarios (expensive queries, optimization opportunities, security alerts)

✅ **Relationship Modeling**: Carefully designed many-to-one relationships avoid cartesian products while enabling cross-table analysis

✅ **Custom Instructions**: Detailed SQL generation guidance prevents common pitfalls (bytes conversion, defensive SQL, performance patterns)

### Limitations & Considerations

⚠️ **Data Latency**: ACCOUNT_USAGE has 45 minutes to 3 hours latency - not suitable for real-time monitoring

⚠️ **Query Attribution Data**: `QUERY_ATTRIBUTION_HISTORY` only available from mid-August 2024 with 8-hour latency

⚠️ **Individual User Privacy**: Model includes guidance to redirect questions about individual users to aggregated analysis

⚠️ **Cost Complexity**: Multiple credit types (compute, serverless, acceleration) require careful interpretation

⚠️ **Scale Considerations**: Materialized query history limited to 60 days to balance utility and storage costs

### Advanced Features

**Named Filters** (40+ across all tables):
- `ExpensiveQueries`: Query costs > 0.1 credits
- `OptimizationOpportunities`: Queries with actionable insights
- `SecurityAnomalies`: Unusual access patterns
- `PerformanceIssues`: Long-running or resource-intensive queries

**Custom Metrics** (50+ across all tables):
- Cost efficiency calculations (cost per GB, cost per minute)
- Performance trending (cache hit rates, queue wait analysis)  
- Governance scoring (optimization opportunity percentages)
- Operational KPIs (user activity rates, resource utilization)

## Maintenance

### Automated Refresh

The system includes automated daily refresh at 2 AM UTC:

```sql
-- Check task status
SHOW TASKS LIKE 'REFRESH_QUERY_HISTORY_TASK';

-- Manual execution
CALL REFRESH_QUERY_HISTORY_PROC();

-- Refresh search service
ALTER CORTEX SEARCH SERVICE QUERY_HISTORY_SEARCH_SERVICE REFRESH;
```

### Data Retention

- **Query History**: Rolling 60-day window
- **Other Tables**: Full historical data from ACCOUNT_USAGE
- **Search Index**: Auto-refreshes every 1 hour

### Monitoring

Key metrics to monitor:

```sql
-- Data freshness
SELECT MAX(START_TIME) FROM QUERY_HISTORY_MATERIALIZED;

-- Search service health  
SHOW CORTEX SEARCH SERVICES LIKE 'QUERY_HISTORY_SEARCH_SERVICE';

-- Task execution history
SELECT * FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY(
    TASK_NAME => 'REFRESH_QUERY_HISTORY_TASK'
)) ORDER BY SCHEDULED_TIME DESC LIMIT 5;
```

## Troubleshooting

### Common Issues

**Task Fails to Execute:**
- Check warehouse permissions and availability
- Verify `MATERIALIZED_AT` column exists and has correct data type
- Review task execution history for specific error messages

**Search Service Empty Results:**
- Wait 10-15 minutes after creation for initial indexing
- Verify materialized table has data: `SELECT COUNT(*) FROM QUERY_HISTORY_MATERIALIZED`
- Check search service status: `SHOW CORTEX SEARCH SERVICES`

**Cost Attribution Questions Incorrect:**
- Verify queries use `QUERY_ATTRIBUTION_HISTORY.CREDITS_ATTRIBUTED_COMPUTE`
- Avoid joining `WAREHOUSE_METERING_HISTORY` to `QUERY_HISTORY` on warehouse_name (causes cartesian products)
- Use custom instructions in semantic model to guide proper cost analysis

### Performance Tuning

**Query Performance:**
- Indexes created on key columns (START_TIME, USER_NAME, DATABASE_NAME, etc.)
- Consider partitioning on START_TIME for very large data volumes
- Monitor search service warehouse usage and adjust size if needed

**Storage Optimization:**
- Adjust retention period in refresh scripts if 60 days is too much/little
- Consider compressing older data using clustering keys

## Contributing

When extending the semantic model:

1. **Add Synonyms**: Include 3-5 relevant business terms for each new dimension
2. **Create Filters**: Add named filters for common analysis patterns
3. **Build Metrics**: Include both raw counts and calculated rates/percentages  
4. **Test Relationships**: Ensure joins are many-to-one to avoid cartesian products
5. **Update Instructions**: Add custom SQL guidance for complex calculations

## License

This project is provided as-is for educational and operational use. Adapt and modify according to your organization's needs and security policies.

---

**Need Help?** This semantic model provides a comprehensive foundation for Snowflake platform analytics. For specific customizations or advanced use cases, consider your organization's data governance and security requirements when modifying the model structure or access patterns.
