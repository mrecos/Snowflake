# Cortex Agent Demo — Platform Health & Governance

A lightweight web application demonstrating Snowflake Cortex Agents for platform operations, cost optimization, and query performance analysis. Built for hackathon presentation.

Reference: [Cortex Agents Run API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run)

---

## Overview

This demo showcases an intelligent platform operations copilot powered by Snowflake Cortex Agents. The agent orchestrates between:
- **Cortex Analyst** (text-to-SQL over a comprehensive semantic model)
- **Custom stored procedures** wrapping Snowflake system functions for clustering, query performance, and cost analysis
- **Cortex Search** (semantic search over past 30 days of queries)

The UI is intentionally minimal for fast local demos with clear authentication status indicators.

**✨ Fully configurable:**
- Agent name and location via `public/config.json`
- Preset questions customizable without code changes
- Easy to share with coworkers - just edit config files!

---

## Architecture

```
┌─────────────────┐
│   Browser UI    │  ← User asks questions
│  (Static HTML)  │
└────────┬────────┘
         │ HTTP
         ↓
┌─────────────────┐
│  Express Proxy  │  ← Handles auth, calls Snowflake REST API
│   (Node.js)     │
└────────┬────────┘
         │ HTTPS + PAT Token
         ↓
┌─────────────────────────────────────────┐
│         Snowflake Cloud                 │
│  ┌──────────────────────────────────┐   │
│  │  Cortex Agent: HACKTHON_SP_TEST_V1│  │
│  │  - Orchestrates tools              │  │
│  │  - Calls stored procedures         │  │
│  │  - Uses Cortex Analyst             │  │
│  └──────────────────────────────────┘   │
│                                         │
│  Tools:                                 │
│  ├─ Analyst → semantic_model.yaml      │
│  ├─ GET_CLUSTERING_HISTORY             │
│  ├─ GET_QUERY_OPERATOR_STATISTICS      │
│  ├─ GET_QUERY_ACCELERATION_ESTIMATE    │
│  └─ GET_SEARCH_OPTIMIZATION_COST_ESTIMATE│
└─────────────────────────────────────────┘
```

---

## Project Structure

```
TECHUP_HACKATHON/
├── backend/
│   ├── package.json          # Node dependencies
│   ├── server.js             # Express proxy with REST API routes
│   └── .env                  # Config (gitignored)
│
├── public/
│   ├── index.html            # UI with logo placeholder, status indicator
│   ├── styles.css            # Consistent color scheme
│   └── app.js                # Frontend logic (fetch calls, UI updates)
│
├── Stored Procedures/
│   ├── CLUSTER_INFO_SP.sql                # Wraps SYSTEM$CLUSTERING_INFORMATION
│   ├── QUERY_OPERATOR_STATS_SP.sql        # Wraps GET_QUERY_OPERATOR_STATS
│   ├── ESTIMATE_QUERY_ACCELERATION_SP.sql # Wraps SYSTEM$ESTIMATE_QUERY_ACCELERATION
│   ├── ESTIMATE_SEARCH_OPT_COSTS_SP.sql   # Wraps SYSTEM$ESTIMATE_SEARCH_OPTIMIZATION_COSTS
│   └── resize_SP                          # Utility: resize warehouse
│
├── semantic_model.yaml       # Cortex Analyst semantic model (staged)
├── DEPLOYMENT.md             # Deployment instructions
└── README.md                 # This file
```

---

## Tech Stack

**Backend:**
- Node.js 18+ with ES modules
- Express (minimal web server + proxy)
- dotenv (environment config)
- cors (enable cross-origin requests)

**Frontend:**
- Vanilla HTML/CSS/JavaScript (no framework)
- Server-sent events parsing for agent streaming responses

**Snowflake:**
- Cortex Agents (Preview feature)
- Cortex Analyst with semantic model
- SQL stored procedures wrapping system functions
- REST API with PAT authentication

---

## Key Files Explained

### `backend/server.js`

Minimal Express proxy that:
- Serves static files from `public/`
- Exposes REST routes that forward to Snowflake
- Handles authentication (PAT token stored in `.env`)
- Parses streaming server-sent events from agent:run

**Routes:**
- `GET /api/health` — Returns config status (missing env vars)
- `GET /api/agent/:name/describe` — Describes an agent (verifies it exists)
- `POST /api/agent/:name/test-thread` — Diagnostic endpoint (tests various paths)
- `POST /api/agent/:name/run` — **Main endpoint**: calls agent:run and parses streaming response

### `public/index.html`

Simple UI with:
- Logo placeholder (top left, dashed border for easy logo swap)
- Status indicator lights (green/yellow/red)
- 4 preset buttons (populate prompt with demo questions)
- Question input textarea
- Response display (pretty-printed JSON in monospace)

### `public/app.js`

Frontend logic:
- Auto-checks health on page load
- Updates status indicator based on responses
- Handles preset buttons, verify agent, and send
- Parses JSON responses and displays them

### `public/styles.css`

Minimal CSS with:
- Consistent color scheme (brand: `#0d5` green)
- Two-column layout (presets left, question/response right)
- Status indicator dots (`.dot.green`, `.dot.yellow`, `.dot.red`)
- Monospace code block for JSON output

---

## Stored Procedures

All procedures follow a minimal, safe pattern:
- Single parameter input (fully-qualified names or IDs)
- RETURNS TABLE with VARCHAR column(s)
- EXECUTE AS CALLER (proper security context)
- Direct calls to Snowflake system functions

### `GET_CLUSTERING_HISTORY(table_name)`
Wraps `SYSTEM$CLUSTERING_INFORMATION` to return clustering health metrics as JSON.

**Returns:** JSON with `average_depth`, `average_overlaps`, `total_partition_count`, histogram, etc.

**Use case:** Assess table clustering effectiveness, identify poorly clustered tables

Reference: [SYSTEM$CLUSTERING_INFORMATION](https://docs.snowflake.com/en/sql-reference/functions/system_clustering_information)

### `GET_QUERY_OPERATOR_STATISTICS(query_id)`
Wraps `GET_QUERY_OPERATOR_STATS` table function to return per-operator performance stats.

**Returns:** Table with columns: QUERY_ID, STEP_ID, OPERATOR_ID, OPERATOR_TYPE, OPERATOR_STATISTICS, EXECUTION_TIME_BREAKDOWN, OPERATOR_ATTRIBUTES

**Use case:** Diagnose slow queries, find exploding joins, identify bottleneck operators

Reference: [GET_QUERY_OPERATOR_STATS](https://docs.snowflake.com/en/sql-reference/functions/get_query_operator_stats)

### `GET_QUERY_ACCELERATION_ESTIMATE(query_id)`
Wraps `SYSTEM$ESTIMATE_QUERY_ACCELERATION` to check QAS eligibility.

**Returns:** JSON with `status` (eligible/ineligible), `estimatedQueryTimes` by scale factor, `ineligibleReason`

**Use case:** Determine if Query Acceleration Service would help a slow query

Reference: [SYSTEM$ESTIMATE_QUERY_ACCELERATION](https://docs.snowflake.com/en/sql-reference/functions/system_estimate_query_acceleration)

### `GET_SEARCH_OPTIMIZATION_COST_ESTIMATE(table_name)`
Wraps `SYSTEM$ESTIMATE_SEARCH_OPTIMIZATION_COSTS` to estimate costs before enabling.

**Returns:** JSON with `estimated_build_credit_cost`, `estimated_maintenance_credit_cost_per_day`, current config

**Use case:** Cost analysis before enabling search optimization on large tables

Reference: [SYSTEM$ESTIMATE_SEARCH_OPTIMIZATION_COSTS](https://docs.snowflake.com/en/sql-reference/functions/system_estimate_search_optimization_costs)

---

## Semantic Model

`semantic_model.yaml` provides a business layer over `SNOWFLAKE.ACCOUNT_USAGE` schema for Cortex Analyst.

**Tables covered:**
- QUERY_HISTORY, QUERY_ATTRIBUTION_HISTORY, QUERY_INSIGHTS
- WAREHOUSE_METERING_HISTORY, WAREHOUSE_LOAD_HISTORY
- DATABASES, SCHEMATA, TABLES, VIEWS, USERS, ROLES
- TAGS, ROW_ACCESS_POLICIES

**Optimized for questions like:**
- "What are the top 5 most expensive warehouses this month?"
- "Show me queries with high failure rates by role"
- "Which databases have PII tags?"
- "What's our MFA adoption rate?"

---

## How It Works

### 1. User asks a question

Via preset button or free-form text input.

### 2. Frontend sends to proxy

`POST /api/agent/HACKTHON_SP_TEST_V1/run` with `{ prompt: "question" }`

### 3. Proxy calls Snowflake agent:run API

```
POST /api/v2/databases/SNOWFLAKE_INTELLIGENCE/schemas/AGENTS/agents/HACKTHON_SP_TEST_V1:run
Authorization: Bearer <PAT_TOKEN>
Body: { messages: [{ role: "user", content: [{ type: "text", text: "question" }] }] }
```

### 4. Agent orchestrates response

The agent:
- Analyzes the question
- Selects appropriate tool(s):
  - Analyst for semantic model queries
  - Stored procedures for system diagnostics
- Calls tools via warehouses
- Streams back results as server-sent events

### 5. Proxy parses events

Server-sent events like:
```
data: {"type":"response","response":{"type":"text","text":"..."}}
data: {"type":"response","response":{"type":"tool_use","name":"..."}}
data: {"type":"response","response":{"type":"tool_result","content":[...]}}
data: {"type":"response.status","response":{"status":"completed"}}
```

### 6. UI displays parsed response

Pretty-printed JSON showing all events, tool calls, and results.

---

## Security

- **PAT token** stored only in `backend/.env` (never exposed to browser)
- Frontend makes requests to local proxy only
- Proxy forwards to Snowflake with auth header
- Read-only role recommended for demo
- Tight warehouse and timeout budgets

---

## Demo Flow

1. Open `http://localhost:5173`
2. See **green status indicator** (config valid)
3. Click **"Verify Agent Exists"** (confirms agent accessible)
4. Click preset buttons or type questions:
   - "Show clustering health for SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY"
   - "What are the top 5 warehouses by credit usage this month?"
   - "Estimate QAS for last query"
5. Click **"Send"**
6. Watch **yellow indicator** while running
7. See **green** when completed with full JSON response

---

## Limitations & Future Work

**Current state:**
- Single-message interactions (no multi-turn thread management in UI)
- Full event stream returned as JSON blob (not progressively rendered)
- No result export or history persistence

**Future enhancements:**
- Real-time streaming display as events arrive
- Multi-turn conversations with thread persistence
- Result export (CSV, JSON download)
- Customer logo upload
- Chat history with localStorage

---

## References

- Cortex Agents Run API: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run
- Cortex Agents REST API: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-rest-api
- Query Operator Stats: https://docs.snowflake.com/en/sql-reference/functions/get_query_operator_stats
- Estimate Query Acceleration: https://docs.snowflake.com/en/sql-reference/functions/system_estimate_query_acceleration
- Clustering Information: https://docs.snowflake.com/en/sql-reference/functions/system_clustering_information
- Search Optimization Costs: https://docs.snowflake.com/en/sql-reference/functions/system_estimate_search_optimization_costs

---

## License

Hackathon demo project. Not for production use.

