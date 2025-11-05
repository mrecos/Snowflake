# Snowflake Cortex Agent REST API Client

A lightweight, configurable web application for interacting with Snowflake Cortex Agents via REST API. Built for easy customization and sharing with coworkers.

Reference: [Cortex Agents Run API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run)

---

## Overview

This application provides a clean, minimal web interface for interacting with any Snowflake Cortex Agent. It acts as a bridge between browser and Snowflake's REST API, handling authentication securely on the backend while providing an intuitive chat-like interface.

**✨ Key Features:**
- **Fully configurable** - Agent name and preset questions via `public/config.json`
- **Secure** - PAT token stored in backend `.env`, never exposed to browser
- **Multi-turn conversations** - Maintains thread context for follow-up questions
- **Conversation history** - Persists chats in browser localStorage
- **Rich rendering** - Formatted text, data tables, and interactive Vega-Lite charts
- **Shareable** - Coworkers just edit 2 config files, no code changes needed
- **Professional UI** - SnowSage branding with blue color scheme (#29B5E8)

---

## Architecture

```
┌─────────────────┐
│   Browser UI    │  ← User asks questions
│  (Static HTML)  │     Conversations stored in localStorage
└────────┬────────┘
         │ HTTP
         ↓
┌─────────────────┐
│  Express Proxy  │  ← Handles auth, calls Snowflake REST API
│   (Node.js)     │     Tracks thread_id & parent_message_id
└────────┬────────┘
         │ HTTPS + PAT Token
         ↓
┌─────────────────────────────────────────┐
│         Snowflake Cloud                 │
│  ┌──────────────────────────────────┐   │
│  │     Your Cortex Agent            │   │
│  │  - Orchestrates tools            │   │
│  │  - Cortex Analyst (optional)     │   │
│  │  - Stored procedures (optional)  │   │
│  │  - Cortex Search (optional)      │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## Project Structure

```
Cortex_REST_API_Client/
├── backend/
│   ├── package.json          # Node dependencies (express, cors, dotenv)
│   ├── server.js             # Express proxy with REST API routes
│   └── .env                  # Server config (NOT in git)
│
├── public/
│   ├── index.html            # UI with conversation history sidebar
│   ├── styles.css            # Blue color scheme (#29B5E8)
│   ├── app.js                # Frontend logic (localStorage, threading)
│   ├── config.json           # Agent name and presets (customize this!)
│   ├── config.example.json   # Example config template
│   └── snow_sage1.png        # Logo image
│
├── DEPLOYMENT.md             # Setup and deployment guide
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
- Vanilla HTML/CSS/JavaScript (no framework, no build step)
- Server-sent events parsing for agent streaming responses
- localStorage for conversation persistence
- Vega-Lite for interactive charts

**Snowflake:**
- Cortex Agents (Preview feature)
- REST API with PAT authentication
- Any agent tools you've configured (Analyst, Search, stored procedures, etc.)

---

## Key Files Explained

### `backend/server.js`

Minimal Express proxy that:
- Serves static files from `public/`
- Exposes REST routes that forward to Snowflake
- Handles authentication (PAT token stored in `.env`)
- Parses streaming server-sent events from agent:run
- Tracks thread_id and parent_message_id for multi-turn conversations

**Routes:**
- `GET /api/health` — Returns config status (checks for missing env vars)
- `GET /api/agent/:name/describe` — Describes an agent (verifies it exists)
- `POST /api/agent/:name/run` — **Main endpoint**: calls agent:run and parses streaming response

### `public/index.html`

Clean UI with:
- SnowSage logo and branding
- Status indicator lights (green/yellow/red)
- Conversation history sidebar with search
- Preset buttons for common questions
- Question input textarea
- Rich response display (formatted text, tables, charts)
- Raw JSON debug view (collapsible)

### `public/app.js`

Frontend logic:
- Auto-checks health on page load
- Loads configuration from `config.json`
- Manages conversation history in localStorage
- Handles thread_id/parent_message_id for multi-turn conversations
- Renders responses with markdown, tables, and Vega-Lite charts
- Updates status indicator during processing

### `public/config.json`

User-facing configuration:
```json
{
  "agentName": "YOUR_AGENT_NAME",
  "agentDatabase": "YOUR_DB",
  "agentSchema": "YOUR_SCHEMA",
  "presets": [
    {
      "label": "Example question",
      "prompt": "What can you help me with?"
    }
  ]
}
```

**Customization:**
- `agentName`: Your agent's name (must match the agent in Snowflake)
- `agentDatabase`, `agentSchema`: Location of your agent
- `presets`: Array of preset questions
  - `label`: Button text shown in UI
  - `prompt`: Question text sent to agent when clicked

---

## How It Works

### 1. User asks a question

Via preset button or free-form text input.

### 2. Frontend sends to proxy

`POST /api/agent/YOUR_AGENT_NAME/run` with `{ prompt: "question", thread_id, parent_message_id }`

### 3. Proxy calls Snowflake agent:run API

```
POST /api/v2/databases/{DB}/schemas/{SCHEMA}/agents/{NAME}:run
Authorization: Bearer <PAT_TOKEN>
Body: {
  thread_id: 12345,
  parent_message_id: 67890,
  messages: [
    { role: "user", content: [{ type: "text", text: "question" }] }
  ]
}
```

### 4. Agent orchestrates response

The agent:
- Analyzes the question
- Selects appropriate tool(s) based on its configuration
- Calls tools and gathers results
- Streams back results as server-sent events

### 5. Proxy parses events and tracks thread

Server-sent events like:
```
data: {"type":"response","response":{"type":"text","text":"..."}}
data: {"type":"response","response":{"type":"tool_use","name":"..."}}
data: {"type":"response","response":{"type":"tool_result","content":[...]}}
data: {"type":"metadata","thread_id":12345,"parent_message_id":67890}
data: {"type":"response.status","response":{"status":"completed"}}
```

### 6. UI displays parsed response

- Formatted text (markdown → HTML)
- Data tables from result_sets
- Interactive Vega-Lite charts (orange bars #FF9F36, tooltips, rounded corners)
- Conversation saved to localStorage with thread IDs

### 7. Follow-up questions maintain context

Next question includes thread_id and parent_message_id for context continuity.

---

## Response Rendering

The app intelligently renders different content types:

**Text responses:**
- Markdown formatting (bold, headers, code blocks)
- Markdown tables converted to styled HTML tables
- Line breaks preserved

**Data tables:**
- Result sets from Analyst queries
- Styled headers and rows
- Shows first 20 rows by default

**Charts:**
- Vega-Lite specifications rendered with vegaEmbed
- Orange bars (#FF9F36) with rounded corners
- Interactive tooltips on hover
- Export options (SVG, PNG)

**Debug view:**
- Collapsible raw JSON for troubleshooting
- Shows full event stream and metadata

---

## Conversation History

**Storage:**
- Conversations saved in browser localStorage
- Maximum 20 recent conversations (auto-prune oldest)
- Each conversation stores: thread_id, parent_message_id, title, messages[], timestamps

**Features:**
- Auto-generated titles from first question (first 50 chars)
- "New Conversation" button to reset thread
- "Recent Conversations" sidebar for browsing history
- Click to load and continue previous conversations
- Clear all history option

**Storage pattern:**
```javascript
{
  thread_id: 12345,
  parent_message_id: 67890,
  title: "What are the top 5 warehouses...",
  messages: [
    { role: "user", content: "...", timestamp: "..." },
    { role: "assistant", content: "...", timestamp: "..." }
  ],
  created_at: "2025-11-05T10:30:00Z",
  updated_at: "2025-11-05T10:35:00Z"
}
```

---

## Security

- **PAT token** stored only in `backend/.env` (never exposed to browser)
- Frontend makes requests to local proxy only
- Proxy forwards to Snowflake with auth header
- Use read-only role for demos when possible
- Set appropriate warehouse and timeout budgets in your agent configuration

---

## Use Cases

This client works with any Snowflake Cortex Agent. Example use cases:

**Platform Operations:**
- Query performance analysis
- Cost optimization recommendations
- Clustering and optimization advice

**Data Analysis:**
- Natural language queries over semantic models (Cortex Analyst)
- Business intelligence questions
- Trend analysis and reporting

**Custom Workflows:**
- Any agent with custom stored procedures
- Domain-specific Q&A with Cortex Search
- Multi-tool orchestration

---

## Limitations & Roadmap

**Current limitations:**
- Browser localStorage limit (~5MB) - stores ~20 conversations
- No conversation export/import
- Single user (no auth/multi-user support)
- Charts use fixed styling (not theme-configurable)

**Future enhancements:**
- Conversation export (JSON, markdown)
- Real-time streaming display as events arrive
- Custom chart theming
- Multi-user support with authentication
- Mobile-responsive design improvements

---

## References

- Cortex Agents Run API: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run
- Cortex Agents REST API: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-rest-api
- Vega-Lite: https://vega.github.io/vega-lite/
- Server-sent events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

---

## Quick Start

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed setup instructions.

**TL;DR:**
1. Configure `backend/.env` with Snowflake credentials
2. Configure `public/config.json` with your agent name and presets
3. `cd backend && npm install && npm start`
4. Open `http://localhost:5173`

---

## License

Demo project for Snowflake Cortex Agents. Customize and use as needed.
