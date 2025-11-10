# Troubleshooting: Agent Warehouse Configuration

## Symptom

Agent responds with errors like:
```
"Unable to run the command. You must specify the warehouse to use..."
```
or
```
"requires a default warehouse to be set"
```

---

## Root Cause

The Cortex Agent requires a **warehouse to be configured in the agent's settings** within Snowflake. This is not set via the REST API request body, but rather in the Snowflake UI when creating or editing the agent.

---

## Solution

### Configure Warehouse in Snowflake UI

1. **Navigate to Snowflake UI**:
   - Log into your Snowflake account
   - Go to **Data** → **Databases**
   - Navigate to your agent's database and schema (e.g., `SNOWFLAKE_INTELLIGENCE.AGENTS`)

2. **Edit Agent Configuration**:
   - Find your Cortex Agent (e.g., `HACKTHON_SP_TEST_V1`)
   - Click on the agent to view its details
   - Look for **Settings** or **Configuration** section
   - Find the **Warehouse** or **Default Warehouse** field

3. **Set the Warehouse**:
   - Select or enter your warehouse name (e.g., `DEMO_WH`, `COMPUTE_WH`)
   - Ensure the warehouse exists and is accessible by your role
   - Save the configuration

4. **Verify**:
   - Submit a test question in your application
   - The agent should now be able to execute SQL queries

---

## Using the Debug Panel

The application includes a built-in debug panel (🔍 button in top-right) that shows:

- **Current Role**: The role your SPCS service is using
- **Current Warehouse**: The warehouse context from SQL API
- **Environment Configuration**: All environment variables

This helps verify that:
1. Your SPCS service has the correct role
2. The role has access to the warehouse you configured in the agent
3. All other configuration is correct

---

## Common Issues

### Issue 1: Warehouse doesn't exist

**Cause:** The warehouse name in the agent configuration doesn't exist.

**Fix:**
```sql
-- Create the warehouse
CREATE WAREHOUSE IF NOT EXISTS DEMO_WH
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;
```

### Issue 2: Role doesn't have access to warehouse

**Cause:** The role executing queries doesn't have `USAGE` on the warehouse.

**Fix:**
```sql
-- Grant warehouse access to the role
USE ROLE ACCOUNTADMIN;
GRANT USAGE ON WAREHOUSE DEMO_WH TO ROLE <YOUR_ROLE>;

-- Example for SYSADMIN:
GRANT USAGE ON WAREHOUSE DEMO_WH TO ROLE SYSADMIN;
```

### Issue 3: Warehouse is suspended

**Cause:** The warehouse is suspended and `AUTO_RESUME` is not enabled.

**Fix:**
```sql
-- Resume the warehouse
ALTER WAREHOUSE DEMO_WH RESUME;

-- Enable auto-resume
ALTER WAREHOUSE DEMO_WH SET AUTO_RESUME = TRUE;
```

---

## Environment Variable (Optional)

While the warehouse **must be configured in the Agent UI**, you can optionally set the `WAREHOUSE` environment variable in your deployment for reference or other application purposes. However, this variable is **not passed to the agent API** and is **not required** for the agent to function.

**Local Deployment (`backend/.env`):**
```bash
WAREHOUSE=DEMO_WH  # Optional - for reference only
```

**SPCS Deployment (`deploy.sql`):**
```sql
-- Optional - create warehouse secret for reference
CREATE OR REPLACE SECRET cortex_agent_warehouse
  TYPE = GENERIC_STRING
  SECRET_STRING = 'DEMO_WH';
```

The debug panel will show this value, but it's purely informational.

---

## Quick Reference

### ✅ Required Configuration

| Setting | Location | Required |
|---------|----------|----------|
| Agent Name | `backend/.env` or SPCS secrets | ✅ Yes |
| Database | `backend/.env` or SPCS secrets | ✅ Yes |
| Schema | `backend/.env` or SPCS secrets | ✅ Yes |
| Warehouse | **Snowflake Agent UI** | ✅ Yes |
| Auth Token | `backend/.env` (local) or SPCS OAuth (automatic) | ✅ Yes |

### ❌ Not Required

| Setting | Location | Required |
|---------|----------|----------|
| Warehouse | `backend/.env` or SPCS secrets | ❌ No (optional reference only) |
| Warehouse | REST API request body | ❌ No (not supported) |

---

## Additional Resources

- [Snowflake Documentation: Cortex Agents](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents)
- [Snowflake Documentation: Warehouses](https://docs.snowflake.com/en/user-guide/warehouses)
- [Snowflake Documentation: GRANT USAGE](https://docs.snowflake.com/en/sql-reference/sql/grant-privilege)

---

**Last Updated:** November 10, 2025  
**App Version:** v1.1.4+
