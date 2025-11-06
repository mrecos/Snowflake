# Snowflake Cortex Agent REST API Client — Deployment Guide

This guide shows how to run the web UI locally and connect it to your Snowflake Cortex Agent.

Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-rest-api

---

## 1) Prerequisites

- **Node.js 18+** (check: `node --version`)
- **Snowflake account** with a warehouse
- **Cortex Agent** already created in Snowflake
- **Personal Access Token (PAT)** for REST API authentication

---

## 2) Configure Backend Environment

Create `backend/.env` with your Snowflake connection details:

```bash
cd backend
touch .env
```

Edit `backend/.env`:

```
SNOWFLAKE_ACCOUNT_URL=https://<your_account>.snowflakecomputing.com
AGENT_NAME=YOUR_AGENT
AGENT_DB=YOUR_DATABASE
AGENT_SCHEMA=YOUR_SCHEMA
WAREHOUSE=YOUR_WAREHOUSE
AUTH_TOKEN=<your_PAT_token>
```

**IMPORTANT:**
- Replace `<your_account>` with your Snowflake account identifier
- `AGENT_NAME` must match your Cortex agent exactly (case-sensitive)
- Replace `YOUR_DATABASE`, `YOUR_SCHEMA`, `YOUR_WAREHOUSE` with actual values
- The `AUTH_TOKEN` is a **Personal Access Token (PAT)** from Snowflake (see section 6 for creation steps)
- Do NOT include "Bearer" prefix - just paste the token value
- Keep this file secure and NEVER commit to version control

**Example:**
```
SNOWFLAKE_ACCOUNT_URL=https://abc12345.us-east-1.snowflakecomputing.com
AGENT_NAME=HACKTHON_SP_TEST_V1
AGENT_DB=SNOWFLAKE_INTELLIGENCE
AGENT_SCHEMA=AGENTS
WAREHOUSE=DEMO_WH
AUTH_TOKEN=sf-pat-AbCdEf123456...
```

---

## 3) Configure Frontend UI Settings (Optional)

Copy the example config if you want to tweak branding, presets, or storage limits:

```bash
cd public
cp config.example.json config.json
```

Edit `public/config.json` (no secrets here):

```json
{
  "appTitle": "Cortex Agent<br>REST API",
  "maxConversations": 10,
  "maxMessagesPerConversation": 10,
  "presets": [
    {
      "label": "Example question",
      "prompt": "What can you help me with?"
    }
  ]
}
```

**Customization tips:**
- `appTitle`: Branding text in the sidebar (HTML allowed, e.g. `<br>` for line breaks)
- `maxConversations`: Maximum conversations stored in `localStorage`
- `maxMessagesPerConversation`: Messages retained per conversation before pruning
- `presets`: Customize for your use case!
  - `label`: Text shown on button in UI
  - `prompt`: Question sent to agent when clicked
  - Add as many presets as you want

**To share with coworkers:**
- They only need to edit `backend/.env` for connection details and (optionally) `public/config.json` for UI tweaks
- No code changes required!
- Presets can be customized per user/team

---

## 4) Install Dependencies and Start Server

```bash
cd backend
npm install
npm start
```

You should see:
```
[server] listening on http://localhost:5173
[server] config status: missing env = none
```

If you see missing env vars, check your `.env` file and restart.

---

## 5) Open the Application

Open your browser to: **http://localhost:5173**

The UI will automatically:
- Check configuration health
- Display status indicator (green = connected, red = config issue)
- Load your agent name from the backend and presets from `public/config.json`

---

## 6) Getting a Personal Access Token (AUTH_TOKEN)

**Recommended for this application: Use a Personal Access Token (PAT)**

### Create a PAT in Snowsight (Easiest method)

1. Log into **Snowsight** (your Snowflake web UI)
2. Click your **username** (top right) → **Profile**
3. Scroll down to **Personal Access Tokens** section
4. Click **+ Generate New Token**
5. Give it a name (e.g., "Cortex Agent Client")
6. Set expiration:
   - Short demos: 1-7 days
   - Development: 30 days
   - Maximum: 90 days
7. Click **Generate**
8. **Copy the token immediately** (you won't see it again!)
9. Paste into your `backend/.env`:
   ```
   AUTH_TOKEN=sf-pat-AbCdEf123456...
   ```

**Important:**
- Copy ONLY the token value (no "Bearer" prefix)
- Token starts with a prefix like `sf-pat-...`
- Store it securely; never commit to version control
- Tokens expire based on your setting (max 90 days)
- For production, use OAuth or rotate tokens regularly

### Alternative: SnowSQL/CLI with key-pair

For programmatic access in production environments:
```bash
snowsql -a <account> -u <user> --private-key-path <key> -o output_format=json
```

See: https://docs.snowflake.com/en/developer-guide/sql-api/guide

---

## 7) Verify Configuration

In the UI, you should see:
- **Status indicator** in top right (green dot = connected, red = issue)
- **Your agent name** pulled from backend `.env`
- **Preset buttons** for quick questions

Click **"Verify agent"** button to confirm:
- Environment variables are set correctly
- PAT token is valid
- Agent exists and is accessible

If verification fails:
- Check `.env` file has all required values
- Verify agent name matches exactly (case-sensitive)
- Ensure PAT token hasn't expired
- Check Snowflake role has access to the agent
- Restart server after changing `.env`

---

## 8) Status Indicator

The status indicator shows connection and processing state:
- **Green dot** = Connected (all env vars present, can reach Snowflake)
- **Yellow dot** = Processing a request
- **Red dot** = Configuration issue or error

When you first load the page, it automatically checks `/api/health` to verify setup.

---

## 9) Using the Application

### Preset Questions

Click any preset button to populate the question field with that prompt. Then click "Send" to submit to your agent.

### Custom Questions

Type your own question in the text area and click "Send".

### What Happens

1. Question sent to your Snowflake Cortex Agent
2. Agent processes using its configured tools (Analyst, Search, stored procedures, etc.)
3. Streaming response parsed from server-sent events
4. Response displayed with rich formatting:
   - Text with markdown formatting
   - Data tables from query results
   - Interactive Vega-Lite charts (if agent returns chart specs)
   - Raw JSON available in collapsible debug section

### Status Changes

- **Yellow** while agent is processing
- **Green** when completed successfully
- **Red** if errors occur

---

## 10) Conversation Features

### Multi-Turn Conversations

The application maintains conversation context automatically:
- First question creates a new thread (thread_id: 0)
- Responses include thread_id and parent_message_id
- Follow-up questions include these IDs for context
- Agent can reference previous messages

### Conversation History

- All conversations saved in browser localStorage
- View recent conversations in sidebar
- Click to load and continue previous conversations
- "New Conversation" button to start fresh
- Stores up to 20 recent conversations (auto-prunes oldest)

### Conversation Management

- **New Conversation**: Click button to reset and start fresh
- **Continue Conversation**: Click any conversation in history to resume
- **Clear History**: Remove all saved conversations from localStorage

---

## 11) Creating Your Cortex Agent

If you haven't created an agent yet, here's a minimal example:

### Using SQL

```sql
-- Create a basic agent with Cortex Analyst
CREATE AGENT IDENTIFIER('"YOUR_DATABASE"."YOUR_SCHEMA"."YOUR_AGENT_NAME"') AS (
  SELECT SNOWFLAKE.CORTEX.CREATE_AGENT(
    OBJECT_CONSTRUCT(
      'name', 'YOUR_AGENT_NAME',
      'description', 'Your agent description',
      'tools', ARRAY_CONSTRUCT(
        OBJECT_CONSTRUCT(
          'type', 'ANALYST',
          'semantic_model_file', '@YOUR_STAGE/semantic_model.yaml'
        )
      ),
      'instructions', 'Your agent instructions here',
      'warehouse', 'YOUR_WAREHOUSE',
      'query_timeout', 60,
      'max_tool_iterations', 5
    )
  )
);
```

### Using REST API

```bash
POST /api/v2/databases/{DB}/schemas/{SCHEMA}/agents
Authorization: Bearer <PAT_TOKEN>

{
  "name": "YOUR_AGENT_NAME",
  "description": "Your agent description",
  "tools": [
    {
      "type": "ANALYST",
      "semantic_model_file": "@YOUR_STAGE/semantic_model.yaml"
    }
  ],
  "instructions": "Your agent instructions",
  "warehouse": "YOUR_WAREHOUSE",
  "query_timeout": 60,
  "max_tool_iterations": 5
}
```

**Agent Tool Options:**
- **ANALYST**: Text-to-SQL over semantic models
- **SEARCH**: Semantic search over staged data
- **PROCEDURE**: Call stored procedures
- **FUNCTION**: Call UDFs

See: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents

---

## 12) Security Best Practices

**For demos and development:**
- Use a small warehouse (XS or S)
- Set query_timeout in agent config (e.g., 60 seconds)
- Use read-only role when possible
- Short-lived PAT tokens (1-7 days)

**For production:**
- Use OAuth instead of PAT
- Implement token rotation
- Use dedicated service account
- Set resource monitors on warehouses
- Audit agent usage via ACCOUNT_USAGE

**Never:**
- Commit `.env` to version control
- Share PAT tokens via email/Slack
- Use admin roles for agent operations
- Expose token in frontend code

---

## 13) Troubleshooting

### "Server offline" or red status indicator

**Check:**
- Backend server is running (`npm start` in backend/)
- No errors in terminal console
- Port 5173 is not in use by another app

**Fix:**
```bash
cd backend
npm start
# Check console for error messages
```

### "Config missing" or authentication errors

**Check:**
- All required env vars in `backend/.env`
- PAT token is valid and not expired
- Snowflake account URL is correct

**Fix:**
```bash
# Verify .env file
cat backend/.env

# Test health endpoint
curl http://localhost:5173/api/health
```

### "Agent not found"

**Check:**
- `AGENT_NAME`, `AGENT_DB`, and `AGENT_SCHEMA` in `backend/.env` match Snowflake exactly (case-sensitive)
- Your role has access to the agent

**Fix:**
```sql
-- In Snowflake, verify agent exists
SHOW AGENTS IN YOUR_DATABASE.YOUR_SCHEMA;

-- Grant access if needed
GRANT USAGE ON AGENT YOUR_DATABASE.YOUR_SCHEMA.YOUR_AGENT_NAME TO ROLE YOUR_ROLE;
```

### Response parsing errors

**Check:**
- Agent is returning valid responses
- No network interruptions during processing
- Check raw JSON in debug section for error details

**Debug:**
- Open browser Developer Tools (F12)
- Check Console tab for JavaScript errors
- Check Network tab for API responses
- Look at raw JSON debug section in UI

### localStorage full

**Symptom:**
- Can't save new conversations
- Console errors about quota exceeded

**Fix:**
- Click "Clear History" in UI
- Or manually: Open browser console and run `localStorage.clear()`

---

## 14) Port Configuration

By default, the server runs on port **5173**.

To change the port:

```bash
# In backend/.env, add:
PORT=3000

# Restart server
npm start
```

Then open `http://localhost:3000`

---

## 15) Project Structure Reference

```
Cortex_REST_API_Client/
├── backend/
│   ├── package.json          # Dependencies (express, cors, dotenv)
│   ├── server.js             # Express proxy with routes
│   └── .env                  # Server config (NOT in git)
├── public/
│   ├── index.html            # Main UI
│   ├── styles.css            # Styles
│   ├── app.js                # Frontend logic
│   ├── config.json           # UI preferences (branding, presets, storage limits)
│   ├── config.example.json   # Template
│   └── snow_sage1.png        # Logo
├── DEPLOYMENT.md             # This file
└── README.md                 # Project overview
```

---

## 16) Advanced: Running with Docker (Optional)

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install
COPY . .
WORKDIR /app/backend
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t cortex-agent-client .
docker run -p 5173:5173 --env-file backend/.env cortex-agent-client
```

---

## 17) Next Steps

Once you're up and running:

1. **Customize presets** - Add questions specific to your agent's capabilities
2. **Test multi-turn** - Try follow-up questions to see context maintained
3. **Browse history** - Use conversation history to revisit past interactions
4. **Share with team** - Provide coworkers with `.env` values for their agent and (optionally) a tailored `config.json`
5. **Explore responses** - Check raw JSON to understand agent behavior

**Optional enhancements:**
- Add more presets for common workflows
- Create multiple config files for different agents
- Style customizations in `styles.css`
- Replace logo with your brand

---

## 18) Resources

- Cortex Agents Documentation: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents
- Cortex Agents REST API: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-rest-api
- Cortex Analyst: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst
- Cortex Search: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-search
- Personal Access Tokens: https://docs.snowflake.com/en/user-guide/ui-snowsight-profile#generate-a-personal-access-token

---

## 19) Getting Help

**Server logs:**
Check the terminal where you ran `npm start` for detailed logs:
- `[server]` - Server startup and config
- `[sfFetch]` - Snowflake API calls
- `[run]` - Agent execution logs

**Browser console:**
Press F12 and check Console tab for frontend errors:
- `[config]` - Configuration loading
- Network tab shows API requests/responses

**Common issues:**
- Authentication: Check PAT token validity
- Agent not found: Verify names match exactly
- Timeout: Increase query_timeout in agent config
- Empty response: Check agent tools are configured correctly

---

## 20) Clean Up

To stop the server:
- Press `Ctrl+C` in the terminal

To completely remove:
```bash
# Remove node modules
rm -rf backend/node_modules

# Remove config (optional)
rm backend/.env
rm public/config.json
```

To delete agent from Snowflake:
```sql
DROP AGENT YOUR_DATABASE.YOUR_SCHEMA.YOUR_AGENT_NAME;
```

---

Enjoy using your Snowflake Cortex Agent REST API Client!
