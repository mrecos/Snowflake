# Cortex Agent Demo — Local Deployment Guide

This guide shows how to run the lightweight web UI and minimal proxy locally to demo your Snowflake Cortex Agent using your stored procedures and semantic model.

Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-rest-api

---

## 1) Prerequisites

- Node.js 18+
- Snowflake account + small warehouse (read-only role recommended)
- Bearer token for REST API (short‑lived preferred)
- Staged semantic model (if using Analyst): `@db.schema.stage/semantic_model.yaml`

---

## 2) Configure environment (backend/.env)

Create `backend/.env`:

```
SNOWFLAKE_ACCOUNT_URL=https://<your_account>.snowflakecomputing.com
AGENT_DB=PLATFORM_ANALYTICS
AGENT_SCHEMA=PUBLIC
WAREHOUSE=DEMO_WH
AUTH_TOKEN=<your_PAT_token>
```

**IMPORTANT:**
- Keep the token ONLY in `backend/.env` (never in the frontend).
- Use a small warehouse and a read‑only role.
- The AUTH_TOKEN is a **Personal Access Token (PAT)** from Snowflake (see section 13 for how to create it).
- Do NOT include "Bearer" prefix - just paste the token value.

---

## 3) Configure frontend (public/config.json)

Copy the example config and customize:

```bash
cd public
cp config.example.json config.json
```

Edit `config.json` to match your agent:

```json
{
  "agentName": "HACKTHON_SP_TEST_V1",
  "agentDatabase": "SNOWFLAKE_INTELLIGENCE",
  "agentSchema": "AGENTS",
  "presets": [
    {
      "label": "Clustering health",
      "prompt": "Show clustering health for SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY"
    },
    {
      "label": "Top warehouses",
      "prompt": "What are the top 5 most expensive warehouses this month?"
    }
  ]
}
```

**Customization:**
- `agentName`: Your agent's name (must match the agent in Snowflake)
- `agentDatabase`, `agentSchema`: For display/reference (backend uses `.env` values)
- `presets`: Array of preset questions - customize these for your use case!
  - `label`: Button text shown in UI
  - `prompt`: Question text sent to agent when clicked

**To share with coworkers:**
- They only need to edit `public/config.json` for their agent name and presets
- No code changes required!

---

## 4) Install and start

```bash
cd backend
npm install
npm start
```

Open `http://localhost:5173`

The server logs missing envs on startup. Check console output for config status.

---

## 5) Verify configuration

In the UI, click the "Verify agent" button.
- If envs are missing, a warning appears and the JSON result lists missing keys.
- Update `.env` and restart the server if needed.

---

## 6) Deploy stored procedures to Snowflake

Before creating the agent, deploy your stored procedures:

```sql
-- In Snowflake, run each stored procedure script
-- (Order doesn't matter)

-- 1) Clustering information
@CLUSTER_INFO_SP.sql

-- 2) Query operator statistics  
@QUERY_OPERATOR_STATS_SP.sql

-- 3) Query acceleration estimate
@ESTIMATE_QUERY_ACCELERATION_SP.sql

-- 4) Search optimization costs
@ESTIMATE_SEARCH_OPT_COSTS_SP.sql

-- 5) Warehouse resize (optional utility)
@resize_SP
```

Verify procedures exist:
```sql
SHOW PROCEDURES IN PLATFORM_ANALYTICS.PUBLIC;
```

---

## 7) Stage your semantic model (optional, for Analyst)

If using the Cortex Analyst tool with your `semantic_model.yaml`:

```sql
-- Create a stage if needed
CREATE STAGE IF NOT EXISTS PLATFORM_ANALYTICS.PUBLIC.MODELS;

-- Upload semantic_model.yaml
PUT file://./semantic_model.yaml @PLATFORM_ANALYTICS.PUBLIC.MODELS;

-- Verify
LIST @PLATFORM_ANALYTICS.PUBLIC.MODELS;
```

Update `server.js` line with the staged path:
```javascript
semantic_model_file: '@PLATFORM_ANALYTICS.PUBLIC.MODELS/semantic_model.yaml'
```

---

## 8) Status indicator

When you open the UI, it automatically checks configuration health:
- **Green dot** = Connected (all env vars present, PAT token valid)
- **Red dot** = Config missing or server offline (check `.env` and restart)
- **Yellow dot** = Running a query

The UI loads agent configuration from `public/config.json` (configured in section 3).

---

## 9) Use presets and send questions

Preset buttons populate the prompt with demo queries:
- **Clustering health** → "Show clustering health for SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY"
- **QAS eligibility** → "Estimate QAS for last query"
- **Operator stats** → "Show operator stats for the last query"
- **Search opt costs** → "Estimate search optimization costs for SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY"

Click "Send" to send the question to your agent.

---

## 10) Asking questions

Click a preset button or type your own question, then click "Send".

The backend calls the `agent:run` API which:
1. Sends your prompt to the agent
2. Receives streaming server-sent events as the agent works
3. Returns the complete response with tool results

The UI renders:
- Clean text responses with formatting
- Data tables from Analyst queries  
- Interactive Vega-Lite charts
- Raw JSON available in collapsible section

Status indicator shows:
- **Yellow** while running
- **Blue** when completed successfully
- **Red** if errors occur

---

## 11) Security & budgeting

- **Auth safety**: Token only in backend `.env`. Frontend never sees it.
- **Role safety**: Use a role with read‑only access to demo objects.
- **Warehouse safety**: Use a small warehouse and set `query_timeout: 60`.
- **Budgeting**: Agent spec uses small time/token budget (20s, 8k tokens).

---

## 12) Troubleshooting

**UI warning "Authentication/config missing"**
- Click "Check Config" and ensure all env keys are present and correct
- Restart server after changing `.env`

**Agent creation fails**
- Verify `AGENT_DB`, `AGENT_SCHEMA`, and warehouse exist and are accessible by the token's role
- Check procedure identifiers exist and are fully qualified
- Look for error details in the JSON response

**Analyst fails to use the semantic model**
- Ensure the staged path in the create request is correct (e.g., `@db.schema.stage/semantic_model.yaml`)
- Verify the role has read access to the stage

---

## 13) Clean up

- Stop the local server (`Ctrl+C`)
- Optionally delete the Agent:
  ```bash
  # Via REST API or SQL
  DROP AGENT PLATFORM_ANALYTICS.PUBLIC.DEMO_AGENT;
  ```

---

## 14) Getting a Personal Access Token (AUTH_TOKEN)

**Recommended for demos: Use a Personal Access Token (PAT)**

### Create a PAT in Snowsight (Easiest method)

1. Log into **Snowsight** (your Snowflake web UI)
2. Click your **username** (top right) → **Profile**
3. Scroll down to **Personal Access Tokens** section
4. Click **+ Generate New Token**
5. Give it a name (e.g., "Demo Agent Token")
6. Set expiration (e.g., 1 day for demo, 90 days max)
7. Click **Generate**
8. **Copy the token immediately** (you won't see it again!)
9. Paste into your `backend/.env`:
   ```
   AUTH_TOKEN=<paste_token_here>
   ```

**Important:**
- Copy ONLY the token value (no "Bearer" prefix)
- The token starts with a prefix like `sf-pat-...`
- Store it securely; never commit to version control
- Tokens expire based on your setting (max 90 days)

### Alternative: Using SnowSQL/CLI with key-pair
```bash
snowsql -a <account> -u <user> --private-key-path <key> -o output_format=json
```

### For production:
- Use OAuth for REST API access
- Rotate tokens regularly
- See: https://docs.snowflake.com/en/developer-guide/sql-api/guide

---

## 15) Project structure

```
TECHUP_HACKATHON/
├── backend/
│   ├── package.json          # Dependencies (express, cors, dotenv)
│   ├── server.js             # Minimal proxy with routes
│   └── .env                  # Server config (NOT in git)
├── public/
│   ├── index.html            # UI with logo
│   ├── styles.css            # Blue color scheme
│   ├── app.js                # Frontend logic
│   ├── config.json           # Agent and presets config
│   ├── config.example.json   # Example config template
│   └── snow_sage1.png        # Logo image
├── CLUSTER_INFO_SP.sql       # Clustering info sproc
├── QUERY_OPERATOR_STATS_SP.sql
├── ESTIMATE_QUERY_ACCELERATION_SP.sql
├── ESTIMATE_SEARCH_OPT_COSTS_SP.sql
├── resize_SP                 # Warehouse resize sproc
├── semantic_model.yaml       # Semantic model (stage this)
└── DEPLOYMENT.md             # This file
```

---

## 16) References

- Cortex Agents REST API: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-rest-api
- Query Operator Stats: https://docs.snowflake.com/en/sql-reference/functions/get_query_operator_stats
- QAS Estimate: https://docs.snowflake.com/en/sql-reference/functions/system_estimate_query_acceleration
- Search Opt Costs: https://docs.snowflake.com/en/sql-reference/functions/system_estimate_search_optimization_costs
- Clustering Information: https://docs.snowflake.com/en/sql-reference/functions/system_clustering_information

---

## 17) Next steps (optional)

- Implement Threads/Runs in `/api/agent/:name/run` to execute prompts end‑to‑end
- Add toast notifications for success/error states
- Persist last N results in `localStorage`
- Replace logo placeholder with actual customer logo
- Add more preset prompts based on your semantic model

