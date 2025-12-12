/**
 * Cortex Secure Multi-Tenant Demo - Backend Server
 * 
 * This server implements the App-Side Orchestration pattern:
 * 1. Receives user question + tenant ID from frontend
 * 2. Calls Cortex Analyst to generate SQL (unaware of tenancy)
 * 3. Executes SQL through EXECUTE_SECURE_SQL stored procedure
 * 4. Returns results to frontend
 * 
 * The stored procedure sets the CURRENT_TENANT_ID session variable,
 * which filters the V_SEMANTIC_SALES view to show only that tenant's data.
 */

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

// Detect environment
const isContainer = __dirname === '/app' || fs.existsSync(path.join(__dirname, 'public'));
const ROOT_DIR = isContainer ? __dirname : path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UI_CONFIG_PATH = path.join(PUBLIC_DIR, 'config.json');

console.log(`[server] Running in ${isContainer ? 'container' : 'local'} mode`);
console.log(`[server] PUBLIC_DIR: ${PUBLIC_DIR}`);

app.use(express.static(PUBLIC_DIR));

// Required environment variables
const REQUIRED_ENV = [
  'SNOWFLAKE_ACCOUNT_URL',
  'ANALYST_DB',
  'ANALYST_SCHEMA',
  'WAREHOUSE'
];

const SPCS_TOKEN_PATH = '/snowflake/session/token';

// Valid tenant IDs (hardcoded for demo)
const VALID_TENANTS = ['TENANT_100', 'TENANT_200', 'TENANT_300'];

/**
 * Load UI configuration from config.json
 */
function loadUiConfig() {
  try {
    const json = fs.readFileSync(UI_CONFIG_PATH, 'utf-8');
    return JSON.parse(json);
  } catch (e) {
    console.error('[config] Failed to load UI config:', e.message);
    return {};
  }
}

/**
 * Get authentication headers for Snowflake API calls
 */
function getAuthHeaders() {
  // Priority 1: SPCS OAuth token (if running in SPCS)
  if (fs.existsSync(SPCS_TOKEN_PATH)) {
    try {
      const oauthToken = fs.readFileSync(SPCS_TOKEN_PATH, 'utf-8').trim();
      console.log('[auth] Using SPCS OAuth token');
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
  
  // Priority 2: PAT token from environment
  if (process.env.AUTH_TOKEN) {
    console.log('[auth] Using PAT token from AUTH_TOKEN');
    return {
      'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }
  
  throw new Error('No authentication method available. Set AUTH_TOKEN in .env file.');
}

/**
 * Get the base URL for Snowflake API calls
 */
function getBaseUrl() {
  if (fs.existsSync(SPCS_TOKEN_PATH) && process.env.SNOWFLAKE_HOST) {
    return `https://${process.env.SNOWFLAKE_HOST}`;
  }
  return process.env.SNOWFLAKE_ACCOUNT_URL;
}

/**
 * Helper for delays
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute a SQL statement via Snowflake SQL API
 */
async function executeSql(statement, options = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error('Snowflake base URL is not configured');
  }

  const headers = getAuthHeaders();
  const payload = {
    statement,
    timeout: options.timeout || 60,
    database: process.env.ANALYST_DB,
    schema: process.env.ANALYST_SCHEMA,
    warehouse: process.env.WAREHOUSE,
    resultSetMetaData: { format: 'jsonv2' }
  };

  console.log(`[sql] Executing: ${statement.substring(0, 100)}...`);

  const response = await fetch(`${baseUrl}/api/v2/statements`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SQL API ${response.status}: ${text}`);
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse SQL API response: ${e.message}`);
  }

  // Poll for completion if async
  let attempts = 0;
  const maxAttempts = options.maxAttempts || 30;
  const pollInterval = options.pollInterval || 1000;

  while (
    result.statementStatusUrl &&
    result.code !== '090001' && // Success
    attempts < maxAttempts
  ) {
    await delay(pollInterval);
    const statusResp = await fetch(`${baseUrl}${result.statementStatusUrl}`, {
      method: 'GET',
      headers
    });
    const statusText = await statusResp.text();
    if (!statusResp.ok) {
      throw new Error(`SQL API status ${statusResp.status}: ${statusText}`);
    }
    result = JSON.parse(statusText);
    attempts++;
  }

  if (result.message && result.message.includes('error')) {
    throw new Error(result.message);
  }

  return result;
}

/**
 * Call Cortex Analyst to generate SQL from natural language
 * Note: Analyst is unaware of tenancy - it generates SQL for V_SEMANTIC_SALES
 */
async function callCortexAnalyst(question) {
  const baseUrl = getBaseUrl();
  const headers = getAuthHeaders();
  
  // Build the analyst request
  const payload = {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: question
          }
        ]
      }
    ]
  };
  
  // Add semantic model reference
  if (process.env.SEMANTIC_MODEL_FILE) {
    payload.semantic_model_file = process.env.SEMANTIC_MODEL_FILE;
  } else if (process.env.SEMANTIC_VIEW) {
    payload.semantic_view = process.env.SEMANTIC_VIEW;
  } else {
    throw new Error('No semantic model configured. Set SEMANTIC_MODEL_FILE or SEMANTIC_VIEW in .env');
  }

  console.log(`[analyst] Calling Cortex Analyst with question: ${question}`);

  const response = await fetch(`${baseUrl}/api/v2/cortex/analyst/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Analyst API ${response.status}: ${text}`);
  }

  // Parse streaming response (SSE format)
  const text = await response.text();
  const events = text.split('\n\n').filter(e => e.trim());
  
  let sql = null;
  let explanation = null;
  let suggestions = [];
  
  for (const event of events) {
    const lines = event.split('\n');
    const dataLine = lines.find(l => l.startsWith('data: '));
    if (dataLine) {
      try {
        const parsed = JSON.parse(dataLine.substring(6));
        
        // Extract SQL from content
        if (parsed.content) {
          for (const item of parsed.content) {
            if (item.type === 'sql' && item.statement) {
              sql = item.statement;
            }
            if (item.type === 'text' && item.text) {
              explanation = item.text;
            }
            if (item.type === 'suggestions' && item.suggestions) {
              suggestions = item.suggestions;
            }
          }
        }
      } catch (e) {
        // Not all events are JSON
      }
    }
  }
  
  return { sql, explanation, suggestions };
}

/**
 * Execute SQL securely through the stored procedure with tenant context
 */
async function executeSecureSql(sql, tenantId) {
  // Validate tenant ID
  if (!VALID_TENANTS.includes(tenantId)) {
    throw new Error(`Invalid tenant ID: ${tenantId}`);
  }
  
  // Escape single quotes in SQL to prevent injection
  const escapedSql = sql.replace(/'/g, "''");
  
  // Call the stored procedure
  const callStatement = `CALL EXECUTE_SECURE_SQL('${escapedSql}', '${tenantId}')`;
  
  console.log(`[secure] Executing with tenant context: ${tenantId}`);
  console.log(`[secure] Original SQL: ${sql}`);
  
  return await executeSql(callStatement);
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/api/health', (_req, res) => {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  const isSpcs = fs.existsSync(SPCS_TOKEN_PATH);
  const hasPat = !!process.env.AUTH_TOKEN;
  const hasAuth = isSpcs || hasPat;
  
  res.json({ 
    ok: missing.length === 0 && hasAuth, 
    missing,
    validTenants: VALID_TENANTS,
    config: {
      account: process.env.SNOWFLAKE_ACCOUNT_URL,
      database: process.env.ANALYST_DB,
      schema: process.env.ANALYST_SCHEMA,
      warehouse: process.env.WAREHOUSE,
      semanticModel: process.env.SEMANTIC_MODEL_FILE || process.env.SEMANTIC_VIEW || 'NOT SET',
      authMethod: isSpcs ? 'SPCS OAuth' : (hasPat ? 'PAT Token' : 'None')
    }
  });
});

/**
 * App configuration endpoint
 */
app.get('/api/app-config', (_req, res) => {
  const uiConfig = loadUiConfig();
  res.json({
    appTitle: uiConfig.appTitle || 'Cortex Secure<br>Multi-Tenant Demo',
    tenants: VALID_TENANTS,
    presets: Array.isArray(uiConfig.presets) ? uiConfig.presets : [],
    maxConversations: uiConfig.maxConversations || 10,
    maxMessagesPerConversation: uiConfig.maxMessagesPerConversation || 10
  });
});

/**
 * Main chat endpoint - the secure multi-tenant orchestration
 * 
 * Flow:
 * 1. Receive question + tenant ID
 * 2. Call Cortex Analyst to generate SQL (tenant-agnostic)
 * 3. Execute SQL through EXECUTE_SECURE_SQL with tenant context
 * 4. Return results
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, tenantId } = req.body;
    
    if (!message) {
      return res.status(400).json({ ok: false, error: 'Message required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ ok: false, error: 'Tenant ID required' });
    }
    
    if (!VALID_TENANTS.includes(tenantId)) {
      return res.status(400).json({ ok: false, error: `Invalid tenant ID. Valid tenants: ${VALID_TENANTS.join(', ')}` });
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[chat] New request from tenant: ${tenantId}`);
    console.log(`[chat] Question: ${message}`);
    console.log(`${'='.repeat(60)}`);
    
    // Step 1: Call Cortex Analyst to generate SQL
    const { sql, explanation, suggestions } = await callCortexAnalyst(message);
    
    if (!sql) {
      return res.json({
        ok: true,
        type: 'text',
        content: explanation || 'I could not generate a SQL query for that question. Please try rephrasing.',
        suggestions
      });
    }
    
    console.log(`[chat] Generated SQL: ${sql}`);
    
    // Step 2: Execute through secure stored procedure with tenant context
    const result = await executeSecureSql(sql, tenantId);
    
    console.log(`[chat] Query returned ${result.data?.length || 0} rows`);
    
    // Step 3: Format response
    res.json({
      ok: true,
      type: 'data',
      content: explanation,
      sql: sql,
      tenantId: tenantId,
      resultSet: {
        data: result.data || [],
        resultSetMetaData: result.resultSetMetaData || {}
      },
      suggestions
    });
    
  } catch (e) {
    console.error(`[chat] Error: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Debug endpoint for troubleshooting
 */
app.get('/api/debug', async (_req, res) => {
  const isSpcs = fs.existsSync(SPCS_TOKEN_PATH);
  const hasPat = !!process.env.AUTH_TOKEN;
  
  let sqlTest = { success: false, error: null };
  try {
    const result = await executeSql('SELECT CURRENT_ROLE() as ROLE, CURRENT_WAREHOUSE() as WAREHOUSE');
    sqlTest = {
      success: true,
      role: result.data?.[0]?.[0] || 'unknown',
      warehouse: result.data?.[0]?.[1] || 'unknown'
    };
  } catch (e) {
    sqlTest.error = e.message;
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    environment: {
      isSpcs,
      isContainer,
      nodeVersion: process.version
    },
    authentication: {
      method: isSpcs ? 'SPCS OAuth' : (hasPat ? 'PAT Token' : 'None'),
      configured: isSpcs || hasPat
    },
    configuration: {
      accountUrl: process.env.SNOWFLAKE_ACCOUNT_URL || 'NOT SET',
      database: process.env.ANALYST_DB || 'NOT SET',
      schema: process.env.ANALYST_SCHEMA || 'NOT SET',
      warehouse: process.env.WAREHOUSE || 'NOT SET',
      semanticModel: process.env.SEMANTIC_MODEL_FILE || process.env.SEMANTIC_VIEW || 'NOT SET'
    },
    validTenants: VALID_TENANTS,
    sqlTest,
    status: {
      ready: sqlTest.success && (isSpcs || hasPat)
    }
  });
});

/**
 * Direct SQL test endpoint (for debugging)
 */
app.post('/api/test-sql', async (req, res) => {
  try {
    const { sql, tenantId } = req.body;
    
    if (!sql) {
      return res.status(400).json({ ok: false, error: 'SQL required' });
    }
    
    let result;
    if (tenantId && VALID_TENANTS.includes(tenantId)) {
      result = await executeSecureSql(sql, tenantId);
    } else {
      result = await executeSql(sql);
    }
    
    res.json({
      ok: true,
      data: result.data,
      metadata: result.resultSetMetaData
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================================================================
// START SERVER
// =============================================================================

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  const isSpcs = fs.existsSync(SPCS_TOKEN_PATH);
  const hasPat = !!process.env.AUTH_TOKEN;
  const authMethod = isSpcs ? 'SPCS OAuth' : (hasPat ? 'PAT Token' : 'NONE - ERROR');
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('CORTEX SECURE MULTI-TENANT DEMO');
  console.log(`${'='.repeat(60)}`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Auth:   ${authMethod}`);
  console.log(`Missing env: ${missing.length ? missing.join(', ') : 'none'}`);
  console.log(`Valid tenants: ${VALID_TENANTS.join(', ')}`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (!isSpcs && !hasPat) {
    console.error('[ERROR] No authentication method available!');
    console.error('[ERROR] Set AUTH_TOKEN in backend/.env');
  }
});

