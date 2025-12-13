# Cortex Secure Multi-Tenant Demo

A proof-of-concept application demonstrating secure, multi-tenant Q&A using Snowflake Cortex. This demo proves that an LLM can answer questions on a shared dataset **without leaking data between tenants** using a **Semantic View + Stored Procedure** architecture.

## Architecture Overview

This demo uses the **"Session-Keyed Context Table" Pattern** - the standard approach for implementing Row-Level Security (RLS) in Owner's Rights stored procedures. This is required because Snowflake's Owner's Rights procedures cannot access session variables (security constraint).

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
│  2. Call Cortex Analyst API → Generate SQL (no execution)          │
│  3. Execute: CALL EXECUTE_SECURE_SQL(sql, tenant_id)                │
│  4. Return filtered results                                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Snowflake                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Cortex Analyst API                                             │ │
│  │   POST /api/v2/cortex/analyst/message                          │ │
│  │   semantic_view: DB.SCHEMA.SEMANTIC_VIEW                       │ │
│  │   → Returns generated SQL (no execution)                       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ EXECUTE_SECURE_SQL(sql, tenant_id)  [EXECUTE AS OWNER]         │ │
│  │   1. DELETE stale context from APP_SESSION_STATE               │ │
│  │   2. INSERT (CURRENT_SESSION(), tenant_id) into context table  │ │
│  │   3. EXECUTE sql (view reads from context table)               │ │
│  │   4. DELETE context (cleanup)                                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ APP_SESSION_STATE (Context Table)                              │ │
│  │   SESSION_ID | TENANT_ID | CREATED_AT                          │ │
│  │   (unique per connection - enables concurrent isolation)       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Semantic View (e.g., SALES_SV)                                 │ │
│  │   Built on V_SEMANTIC_SALES secure view                        │ │
│  │   WHERE CUSTOMER_ID = (SELECT CUSTOMER_ID FROM APP_SESSION_STATE│
│  │                        WHERE SESSION_ID = CURRENT_SESSION())   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ PRODUCT_DATA_RAW (Multi-tenant Table)                          │ │
│  │   TENANT_100: ~70 rows, ~$2.8M sales                           │ │
│  │   TENANT_200: ~44 rows, ~$865K sales                           │ │
│  │   TENANT_300: ~36 rows, ~$634K sales                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.8+ (for data generation)
- Snowflake account with Cortex Analyst enabled
- Personal Access Token (PAT) for Snowflake

### Step 1: Generate Sample Data

```bash
cd multi_tenant_demo/scripts
pip install pandas faker
python generate_sales_data.py
```

This creates `data/product_data.csv` with 150 rows distributed across 3 tenants.

### Step 2: Set Up Snowflake

1. **Update and run the SQL setup script:**
   ```sql
   -- Edit sql/setup.sql to set your database/schema/warehouse
   -- Then execute in Snowsight or via SnowSQL
   ```

2. **Load the CSV data:**
   - Upload `data/product_data.csv` via Snowsight, or
   - Use a stage and COPY INTO command

### Step 3: Create a Semantic View

Create a Semantic View in Snowsight that points to `V_SEMANTIC_SALES`:

1. Navigate to **AI & ML** → **Cortex Analyst** → **Semantic Views**
2. Click **Create Semantic View**
3. Select `V_SEMANTIC_SALES` as the source
4. Configure columns, descriptions, and sample questions
5. Note the fully qualified name: `DATABASE.SCHEMA.SEMANTIC_VIEW_NAME`

### Step 4: Configure the Application

Create `backend/.env`:

```env
# Snowflake Account URL
SNOWFLAKE_ACCOUNT_URL=https://YOUR_ACCOUNT.snowflakecomputing.com

# Personal Access Token (for local development)
AUTH_TOKEN=your_pat_token_here

# Cortex Analyst Configuration - fully qualified semantic view name
SEMANTIC_VIEW=CORTEX_TESTING.MULT_TENANT.YOUR_SEMANTIC_VIEW_NAME

# Warehouse for SQL execution
WAREHOUSE=YOUR_WAREHOUSE
```

### Step 5: Run the Application

```bash
cd multi_tenant_demo/backend
npm install
npm start
```

Open http://localhost:5173 in your browser.

## Testing Multi-Tenancy

### Success Criteria

1. **Select TENANT_100** → Ask "What are total sales?"
   - Expected: ~$2.8M (highest sales)

2. **Select TENANT_200** → Ask "What are total sales?"
   - Expected: ~$865K

3. **Select TENANT_300** → Ask "What are total sales?"
   - Expected: ~$634K (lowest sales)

4. **Audit Check:** In Snowflake Query History, verify:
   - SQL queries target `V_SEMANTIC_SALES` (the view)
   - No direct access to `PRODUCT_DATA_RAW`
   - No hardcoded tenant filters in SQL

### SQL Debug Panel

The application includes a "Show Generated SQL" panel that displays the SQL generated by Cortex Analyst. **Verify that:**

- SQL queries `V_SEMANTIC_SALES` (not raw table)
- No `WHERE CUSTOMER_ID = ...` clause (isolation is view-level)
- The same SQL returns different results for different tenants

### Verbose Mode

Enable "Verbose Mode" in the debug panel to see:
- **Cortex Analyst Response**: Full API response including generated SQL
- **Stored Procedure Execution**: SPROC call details with row counts

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
│   └── product_data.csv  # Generated sample data
├── sql/
│   └── setup.sql        # Snowflake setup script
├── semantic_model/
│   └── sales_semantic_model.yaml  # Reference for Semantic View creation
└── README.md
```

## Security Model

### Why This Architecture? ("Session-Keyed Context Table" Pattern)

This pattern is required because **Owner's Rights stored procedures cannot access session variables** in Snowflake. This is a security feature to prevent "variable poisoning" between the privileged owner and the caller.

1. **Context Table (`APP_SESSION_STATE`):**
   - Stores tenant context keyed by `CURRENT_SESSION()`
   - Each connection gets a unique session ID (concurrent isolation)
   - Only the stored procedure can write to this table (users cannot)
   - Context is cleaned up immediately after query execution

2. **Secure View (`V_SEMANTIC_SALES`):**
   - Filters by looking up tenant from `APP_SESSION_STATE` using `CURRENT_SESSION()`
   - Hides `CUSTOMER_ID` column from all queries (optional)
   - Returns empty results if no context is set (fail-safe)
   - The AI never sees tenant identifiers

3. **Stored Procedure (`EXECUTE_SECURE_SQL`):**
   - Runs as `EXECUTE AS OWNER` (privilege escalation)
   - INSERT context → EXECUTE query → DELETE context
   - Always cleans up context even on error
   - Users cannot bypass the procedure to access raw data

4. **App-Side Orchestration:**
   - Frontend sends tenant ID with each request
   - Backend validates tenant ID before execution
   - SQL is generated by Cortex Analyst API (tenant-agnostic)
   - Execution happens through secure stored procedure

### What This Proves

- LLM generates SQL without knowledge of tenancy
- Same SQL query returns different results per tenant
- No data leakage possible through SQL injection
- Concurrent users are isolated by `CURRENT_SESSION()`
- Query history shows clean, filterable audit trail

## Customization

### Adding Tenants

1. Add tenant to `VALID_TENANTS` in `server.js`
2. Add tenant option in `index.html` tenant selector
3. Add color mapping in `app.js` `TENANT_COLORS`
4. Load data with new `CUSTOMER_ID` values

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

### "Semantic view not found" or 404 errors

1. Verify `SEMANTIC_VIEW` is the fully qualified name: `DATABASE.SCHEMA.VIEW_NAME`
2. Ensure the Semantic View exists in Snowflake
3. Check that you have access to the Semantic View

### Empty results

1. Verify data is loaded in `PRODUCT_DATA_RAW`
2. Verify `APP_SESSION_STATE` table exists
3. Verify `EXECUTE_SECURE_SQL` procedure exists and has correct permissions
4. Check that the tenant ID matches a valid `CUSTOMER_ID`

### Cortex Analyst returns suggestions instead of SQL

This happens when the question is ambiguous. Try:
1. Ask a more specific question
2. Check the Semantic View configuration for sample questions
3. Add more column descriptions to the Semantic View

## References

- [Cortex Analyst REST API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/rest-api)
- [Semantic Views Overview](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
- [Cortex Analyst Tutorial](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst)

