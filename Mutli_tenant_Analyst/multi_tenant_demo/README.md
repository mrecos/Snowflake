# Cortex Secure Multi-Tenant Demo

A proof-of-concept application demonstrating secure, multi-tenant Q&A using Snowflake Cortex. This demo proves that an LLM can answer questions on a shared dataset **without leaking data between tenants** using a **Secure View + Stored Procedure** architecture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Browser)                          │
│  ┌───────────────────┐  ┌────────────────────────────────────────┐  │
│  │  Tenant Selector  │  │           Chat Interface               │  │
│  │  TENANT_100 ▼     │  │  "What are total sales?" ────────────► │  │
│  └───────────────────┘  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Node.js Backend (server.js)                     │
│  1. Receive question + tenant_id                                    │
│  2. Call Cortex Analyst → Generate SQL (tenant-agnostic)            │
│  3. Execute: CALL EXECUTE_SECURE_SQL(sql, tenant_id)                │
│  4. Return filtered results                                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Snowflake                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ EXECUTE_SECURE_SQL(sql, tenant_id)                             │ │
│  │   SET CURRENT_TENANT_ID = tenant_id                            │ │
│  │   EXECUTE sql                                                  │ │
│  │   UNSET CURRENT_TENANT_ID                                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ V_SEMANTIC_SALES (Secure View)                                 │ │
│  │   SELECT ... FROM SALES_DATA_RAW                               │ │
│  │   WHERE CONTAINER_ID = GETVARIABLE('CURRENT_TENANT_ID')        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ SALES_DATA_RAW (Multi-tenant Table)                            │ │
│  │   TENANT_100: ~68 rows, ~$500K sales                           │ │
│  │   TENANT_200: ~45 rows, ~$150K sales                           │ │
│  │   TENANT_300: ~37 rows, ~$100K sales                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.8+ (for data generation)
- Snowflake account with Cortex enabled
- Personal Access Token (PAT) for Snowflake

### Step 1: Generate Sample Data

```bash
cd multi_tenant_demo/scripts
pip install pandas faker
python generate_sales_data.py
```

This creates `data/sales_data.csv` with 150 rows distributed across 3 tenants.

### Step 2: Set Up Snowflake

1. **Update and run the SQL setup script:**
   ```sql
   -- Edit sql/setup.sql to set your database/schema/warehouse
   -- Then execute in Snowsight or via SnowSQL
   ```

2. **Load the CSV data:**
   - Upload `data/sales_data.csv` via Snowsight, or
   - Use a stage and COPY INTO command

3. **Create the Semantic Model:**
   - Upload `semantic_model/sales_semantic_model.yaml` to a stage
   - Create a semantic model pointing to it

### Step 3: Configure the Application

Create `backend/.env`:

```env
# Snowflake Account URL
SNOWFLAKE_ACCOUNT_URL=https://YOUR_ACCOUNT.snowflakecomputing.com

# Personal Access Token
AUTH_TOKEN=your_pat_token_here

# Cortex Analyst Configuration
ANALYST_DB=YOUR_DATABASE
ANALYST_SCHEMA=YOUR_SCHEMA
SEMANTIC_MODEL_FILE=@YOUR_DATABASE.YOUR_SCHEMA.YOUR_STAGE/sales_semantic_model.yaml

# Warehouse
WAREHOUSE=YOUR_WAREHOUSE
```

### Step 4: Run the Application

```bash
cd multi_tenant_demo/backend
npm install
npm start
```

Open http://localhost:5173 in your browser.

## Testing Multi-Tenancy

### Success Criteria

1. **Select TENANT_100** → Ask "What are total sales?"
   - Expected: ~$500,000 (highest sales)

2. **Select TENANT_200** → Ask "What are total sales?"
   - Expected: ~$150,000

3. **Select TENANT_300** → Ask "What are total sales?"
   - Expected: ~$100,000 (lowest sales)

4. **Audit Check:** In Snowflake Query History, verify:
   - SQL queries target `V_SEMANTIC_SALES` (the view)
   - No direct access to `SALES_DATA_RAW`
   - No hardcoded tenant filters in SQL

### SQL Debug Panel

The application includes a "Show Generated SQL" panel that displays the SQL generated by Cortex Analyst. **Verify that:**

- SQL queries `V_SEMANTIC_SALES` (not raw table)
- No `WHERE CONTAINER_ID = ...` clause (isolation is view-level)

## Project Structure

```
multi_tenant_demo/
├── backend/
│   ├── server.js          # Node.js server with secure orchestration
│   ├── package.json       # Dependencies
│   └── .env              # Configuration (create from .env.example)
├── public/
│   ├── index.html        # Frontend HTML with tenant selector
│   ├── styles.css        # Snowflake-inspired styling
│   ├── app.js           # Frontend JavaScript
│   └── config.json      # UI configuration & presets
├── scripts/
│   └── generate_sales_data.py  # Data generation script
├── data/
│   └── sales_data.csv   # Generated sample data
├── sql/
│   └── setup.sql        # Snowflake setup script
├── semantic_model/
│   └── sales_semantic_model.yaml  # Cortex Analyst model
└── README.md
```

## Security Model

### Why This Architecture?

1. **Secure View (`V_SEMANTIC_SALES`):**
   - Automatically filters by `CURRENT_TENANT_ID` session variable
   - Hides `CONTAINER_ID` column from all queries
   - The AI never sees tenant identifiers

2. **Stored Procedure (`EXECUTE_SECURE_SQL`):**
   - Sets tenant context before query execution
   - Always cleans up context (even on error)
   - Prevents context leakage between requests

3. **App-Side Orchestration:**
   - Frontend sends tenant ID with each request
   - Backend validates tenant ID before execution
   - SQL is generated by Cortex Analyst (tenant-agnostic)
   - Execution happens through secure stored procedure

### What This Proves

- LLM generates SQL without knowledge of tenancy
- Same SQL query returns different results per tenant
- No data leakage possible through SQL injection
- Query history shows clean, filterable audit trail

## Customization

### Adding Tenants

1. Add tenant to `VALID_TENANTS` in `server.js`
2. Add tenant option in `index.html` tenant selector
3. Add color mapping in `app.js` `TENANT_COLORS`
4. Load data with new `CONTAINER_ID` values

### Sample Questions

Edit `public/config.json` to customize preset questions:

```json
{
  "presets": [
    { "label": "Total Sales", "prompt": "What are the total sales?" },
    { "label": "By Region", "prompt": "Show sales by region" }
  ]
}
```

## Troubleshooting

### "No authentication method available"

Create `backend/.env` with your `AUTH_TOKEN` (PAT).

### "Semantic model not found"

Ensure `SEMANTIC_MODEL_FILE` points to the correct stage path.

### Empty results

Verify data is loaded and `CURRENT_TENANT_ID` matches a valid `CONTAINER_ID`.

## References

- [Cortex Agents REST API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run)
- [Semantic Views Overview](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
- [Best Practices for Cortex Agents](https://www.snowflake.com/en/developers/guides/best-practices-to-building-cortex-agents/)

