import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect if running in container (server.js in /app) or local (server.js in backend/)
// In container: __dirname = /app, public/ is at /app/public
// In local: __dirname = .../backend, public/ is at ../public
const isContainer = __dirname === '/app' || fs.existsSync(path.join(__dirname, 'public'));
const ROOT_DIR = isContainer ? __dirname : path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UI_CONFIG_PATH = path.join(PUBLIC_DIR, 'config.json');

console.log(`[server] Running in ${isContainer ? 'container' : 'local'} mode`);
console.log(`[server] PUBLIC_DIR: ${PUBLIC_DIR}`);

app.use(express.static(PUBLIC_DIR));

const REQUIRED_ENV = [
  'SNOWFLAKE_ACCOUNT_URL',
  'AGENT_NAME',
  'AGENT_DB',
  'AGENT_SCHEMA',
  'WAREHOUSE'
  // AUTH_TOKEN is optional - only needed for local deployment
  // SPCS automatically provides OAuth token at /snowflake/session/token
];

const SPCS_TOKEN_PATH = '/snowflake/session/token';

function loadUiConfig() {
  try {
    const json = fs.readFileSync(UI_CONFIG_PATH, 'utf-8');
    return JSON.parse(json);
  } catch (e) {
    console.error('[config] Failed to load UI config:', e.message);
    return {};
  }
}

function getAuthHeaders() {
  // Priority 1: SPCS OAuth token (if running in SPCS)
  if (fs.existsSync(SPCS_TOKEN_PATH)) {
    try {
      const oauthToken = fs.readFileSync(SPCS_TOKEN_PATH, 'utf-8').trim();
      console.log('[auth] Using SPCS OAuth token from /snowflake/session/token');
      return {
        'Authorization': `Bearer ${oauthToken}`,
        'X-Snowflake-Authorization-Token-Type': 'OAUTH',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
    } catch (e) {
      console.error('[auth] Failed to read SPCS OAuth token:', e.message);
      throw new Error('Failed to read SPCS OAuth token');
    }
  }
  
  // Priority 2: PAT token from environment (local deployment)
  if (process.env.AUTH_TOKEN) {
    console.log('[auth] Using PAT token from AUTH_TOKEN environment variable');
    return {
      'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }
  
  throw new Error('No authentication method available. Local deployment requires AUTH_TOKEN in .env file.');
}

function getBaseUrl() {
  // SPCS provides SNOWFLAKE_HOST for internal routing
  // This is required for OAuth token to work (different from external URL)
  if (fs.existsSync(SPCS_TOKEN_PATH) && process.env.SNOWFLAKE_HOST) {
    console.log(`[auth] Using SNOWFLAKE_HOST for internal routing: ${process.env.SNOWFLAKE_HOST}`);
    return `https://${process.env.SNOWFLAKE_HOST}`;
  }
  
  // Local deployment uses the standard account URL
  return process.env.SNOWFLAKE_ACCOUNT_URL;
}

app.get('/api/health', (_req, res) => {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  const isSpcs = fs.existsSync(SPCS_TOKEN_PATH);
  const hasPat = !!process.env.AUTH_TOKEN;
  const hasAuth = isSpcs || hasPat;
  
  // Log environment variables for debugging
  console.log('[health] Environment check:');
  console.log(`  SNOWFLAKE_ACCOUNT_URL: ${process.env.SNOWFLAKE_ACCOUNT_URL ? 'set' : 'MISSING'}`);
  console.log(`  SNOWFLAKE_HOST: ${process.env.SNOWFLAKE_HOST ? process.env.SNOWFLAKE_HOST : 'not set (ok for local)'}`);
  console.log(`  AGENT_NAME: ${process.env.AGENT_NAME || 'MISSING'}`);
  console.log(`  AGENT_DB: ${process.env.AGENT_DB || 'MISSING'}`);
  console.log(`  AGENT_SCHEMA: ${process.env.AGENT_SCHEMA || 'MISSING'}`);
  console.log(`  WAREHOUSE: ${process.env.WAREHOUSE || 'MISSING - REQUIRED FOR QUERIES!'}`);
  
  res.json({ 
    ok: missing.length === 0 && hasAuth, 
    missing,
    config: {
      account: process.env.SNOWFLAKE_ACCOUNT_URL,
      agentName: process.env.AGENT_NAME,
      database: process.env.AGENT_DB,
      schema: process.env.AGENT_SCHEMA,
      warehouse: process.env.WAREHOUSE,
      snowflake_host: process.env.SNOWFLAKE_HOST || 'not available',
      auth_method: isSpcs ? 'SPCS OAuth' : (hasPat ? 'PAT Token' : 'None'),
      has_auth: hasAuth
    }
  });
});

app.get('/api/app-config', (_req, res) => {
  const uiConfig = loadUiConfig();
  res.json({
    agentName: process.env.AGENT_NAME || '',
    agentDatabase: process.env.AGENT_DB || '',
    agentSchema: process.env.AGENT_SCHEMA || '',
    warehouse: process.env.WAREHOUSE || '',
    appTitle: uiConfig.appTitle || 'Cortex Agent<br>REST API',
    maxConversations: uiConfig.maxConversations,
    maxMessagesPerConversation: uiConfig.maxMessagesPerConversation,
    presets: Array.isArray(uiConfig.presets) ? uiConfig.presets : []
  });
});

// Debug endpoint - returns diagnostic information for troubleshooting
app.get('/api/debug', (_req, res) => {
  const isSpcs = fs.existsSync(SPCS_TOKEN_PATH);
  const hasPat = !!process.env.AUTH_TOKEN;
  const hasSpcsHost = !!process.env.SNOWFLAKE_HOST;
  const hasWarehouse = !!process.env.WAREHOUSE;
  
  res.json({
    timestamp: new Date().toISOString(),
    environment: {
      isSpcs: isSpcs,
      isContainer: isContainer,
      nodeVersion: process.version,
      platform: process.platform
    },
    authentication: {
      method: isSpcs ? 'SPCS OAuth' : (hasPat ? 'PAT Token' : 'None'),
      hasOAuthToken: isSpcs,
      hasPATToken: hasPat,
      oauthTokenPath: SPCS_TOKEN_PATH,
      oauthTokenExists: isSpcs
    },
    routing: {
      snowflakeHost: process.env.SNOWFLAKE_HOST || 'not set (using account URL)',
      accountUrl: process.env.SNOWFLAKE_ACCOUNT_URL || 'not set',
      baseUrl: hasSpcsHost && isSpcs ? `https://${process.env.SNOWFLAKE_HOST}` : (process.env.SNOWFLAKE_ACCOUNT_URL || 'not set')
    },
    configuration: {
      agentName: process.env.AGENT_NAME || 'NOT SET',
      agentDatabase: process.env.AGENT_DB || 'NOT SET',
      agentSchema: process.env.AGENT_SCHEMA || 'NOT SET',
      warehouse: process.env.WAREHOUSE || 'NOT SET - REQUIRED!',
      hasWarehouse: hasWarehouse
    },
    status: {
      allEnvVarsSet: !!(process.env.SNOWFLAKE_ACCOUNT_URL && process.env.AGENT_NAME && 
                         process.env.AGENT_DB && process.env.AGENT_SCHEMA && hasWarehouse),
      authConfigured: isSpcs || hasPat,
      readyToRun: !!(process.env.AGENT_NAME && hasWarehouse && (isSpcs || hasPat))
    }
  });
});

// Verify agent exists
app.get('/api/agent/:name/describe', async (req, res) => {
  try {
    const { name } = req.params;
    const path = `/api/v2/databases/${process.env.AGENT_DB}/schemas/${process.env.AGENT_SCHEMA}/agents/${name}`;
    const result = await sfFetch(path, 'GET');
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Simple helper to call Snowflake REST API
async function sfFetch(path, method = 'GET', body) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;
  console.log(`[sfFetch] ${method} ${url}`);
  const resp = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await resp.text();
  console.log(`[sfFetch] Response ${resp.status}: ${text.substring(0, 200)}`);
  if (!resp.ok) {
    throw new Error(`Snowflake API ${resp.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

// Run endpoint — uses agent:run API (streaming, per docs)
app.post('/api/agent/:name/run', async (req, res) => {
  try {
    const { name } = req.params;
    const { prompt, thread_id, parent_message_id, conversation_history } = req.body;

    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'Prompt required' });
    }

    console.log(`[run] Calling agent:run for ${name}`);
    console.log(`[run] Thread: ${thread_id || 0}, Parent: ${parent_message_id || 0}`);
    console.log(`[run] History messages: ${conversation_history ? conversation_history.length : 0}`);

    // Use the agent:run endpoint (note the colon!)
    // Ref: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run
    const runPath = `/api/v2/databases/${process.env.AGENT_DB}/schemas/${process.env.AGENT_SCHEMA}/agents/${name}:run`;
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}${runPath}`;
    
    console.log(`[run] POST ${url}`);

    // Build messages array with full conversation history for context
    let messages = [];
    
    // Include previous messages if provided (for multi-turn conversations)
    if (conversation_history && Array.isArray(conversation_history) && conversation_history.length > 0) {
      messages = conversation_history.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' 
          ? [{ type: 'text', text: msg.content }]
          : msg.content
      }));
    }
    
    // Add current user message
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt
        }
      ]
    });

    // Build request body
    const requestBody = { messages };

    // Add warehouse for query execution
    if (process.env.WAREHOUSE) {
      requestBody.warehouse = process.env.WAREHOUSE;
      console.log(`[run] Using warehouse: ${process.env.WAREHOUSE}`);
    } else {
      console.warn('[run] WARNING: WAREHOUSE environment variable not set!');
    }

    // Add thread_id and parent_message_id ONLY if continuing an existing conversation
    // For new conversations: omit these fields entirely (Snowflake creates new thread)
    // For follow-ups: include both fields with actual thread IDs
    if (thread_id !== undefined && thread_id !== null && thread_id !== 0) {
      requestBody.thread_id = thread_id;
      requestBody.parent_message_id = parent_message_id;
    }

    // Log the full request body for debugging
    console.log(`[run] Request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[run] Error ${response.status}: ${text}`);
      throw new Error(`Agent API ${response.status}: ${text}`);
    }

    // Parse the streaming response
    const text = await response.text();
    console.log(`[run] Response received (${text.length} chars)`);

    // Parse server-sent events
    const events = text.split('\n\n').filter(e => e.trim());
    const parsedEvents = [];
    let returnedThreadId = null;
    let returnedParentMessageId = null;
    
    for (const event of events) {
      const lines = event.split('\n');
      const dataLine = lines.find(l => l.startsWith('data: '));
      if (dataLine) {
        try {
          const jsonStr = dataLine.substring(6); // Remove 'data: ' prefix
          const parsed = JSON.parse(jsonStr);
          parsedEvents.push(parsed);
          
          // Extract thread_id and parent_message_id from metadata events
          if (parsed.type === 'metadata') {
            if (parsed.thread_id !== undefined) returnedThreadId = parsed.thread_id;
            if (parsed.parent_message_id !== undefined) returnedParentMessageId = parsed.parent_message_id;
          }
          
          // Also check in response objects (some implementations return it here)
          if (parsed.response) {
            if (parsed.response.thread_id !== undefined) returnedThreadId = parsed.response.thread_id;
            if (parsed.response.parent_message_id !== undefined) returnedParentMessageId = parsed.response.parent_message_id;
          }
          
          // Check in trace/span attributes (AgentV2RequestResponseInfo)
          if (Array.isArray(parsed)) {
            parsed.forEach(item => {
              if (typeof item === 'string') {
                try {
                  const traceData = JSON.parse(item);
                  if (traceData.attributes) {
                    traceData.attributes.forEach(attr => {
                      if (attr.key === 'snow.ai.observability.agent.thread_id' && attr.value?.intValue) {
                        const tid = parseInt(attr.value.intValue);
                        if (tid > 0) returnedThreadId = tid;
                      }
                      if (attr.key === 'snow.ai.observability.agent.parent_message_id' && attr.value?.intValue) {
                        const pmid = parseInt(attr.value.intValue);
                        if (pmid > 0) returnedParentMessageId = pmid;
                      }
                    });
                  }
                } catch (e) {
                  // Not a JSON string, skip
                }
              }
            });
          }
          
          // Check if the parsed event itself has role="assistant" with thread info
          if (parsed.role === 'assistant') {
            if (parsed.thread_id !== undefined && parsed.thread_id !== null) returnedThreadId = parsed.thread_id;
            if (parsed.parent_message_id !== undefined && parsed.parent_message_id !== null) returnedParentMessageId = parsed.parent_message_id;
          }
        } catch (e) {
          console.log(`[run] Could not parse event: ${dataLine.substring(0, 100)}`);
        }
      }
    }

    console.log(`[run] Parsed ${parsedEvents.length} events`);
    console.log(`[run] Returned thread: ${returnedThreadId}, parent: ${returnedParentMessageId}`);

    res.json({
      ok: true,
      events: parsedEvents,
      thread_id: returnedThreadId,
      parent_message_id: returnedParentMessageId,
      raw_length: text.length
    });
  } catch (e) {
    console.error(`[run] Error: ${e.message}`);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  const isSpcs = fs.existsSync(SPCS_TOKEN_PATH);
  const hasPat = !!process.env.AUTH_TOKEN;
  const authMethod = isSpcs ? 'SPCS OAuth' : (hasPat ? 'PAT Token' : 'NONE - ERROR');
  
  // Make auth/config status obvious at startup
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] config status: missing env = ${missing.length ? missing.join(', ') : 'none'}`);
  console.log(`[server] authentication: ${authMethod}`);
  
  if (!isSpcs && !hasPat) {
    console.error('[server] ERROR: No authentication method available!');
    console.error('[server] Local deployment requires AUTH_TOKEN in backend/.env');
  }
});


