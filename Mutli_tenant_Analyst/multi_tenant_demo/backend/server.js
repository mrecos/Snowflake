/**
 * Cortex Secure Multi-Tenant Demo - Backend Server
 * 
 * This server implements secure multi-tenant Q&A using Cortex Analyst REST API:
 * 1. Receives user question + tenant ID from frontend
 * 2. Calls Cortex Analyst API to generate SQL (Analyst is unaware of tenancy)
 * 3. Executes SQL through EXECUTE_SECURE_SQL stored procedure (adds tenant context)
 * 4. Returns results to frontend
 * 
 * The stored procedure uses the "Session-Keyed Context Table" pattern to isolate
 * tenant data at query time.
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

// Required environment variables for Cortex Analyst approach
const REQUIRED_ENV = [
  'SNOWFLAKE_ACCOUNT_URL',
  'SEMANTIC_VIEW',  // Fully qualified: DB.SCHEMA.SEMANTIC_VIEW_NAME
  'WAREHOUSE'
  // AUTH_TOKEN is optional - only needed for local deployment
  // SPCS automatically provides OAuth token at /snowflake/session/token
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

/**
 * Get the base URL for Snowflake API calls
 */
function getBaseUrl() {
  // SPCS provides SNOWFLAKE_HOST for internal routing
  if (fs.existsSync(SPCS_TOKEN_PATH) && process.env.SNOWFLAKE_HOST) {
    console.log(`[auth] Using SNOWFLAKE_HOST for internal routing: ${process.env.SNOWFLAKE_HOST}`);
    return `https://${process.env.SNOWFLAKE_HOST}`;
  }
  
  // Local deployment uses the standard account URL
  return process.env.SNOWFLAKE_ACCOUNT_URL;
}

/**
 * Parse semantic view into components
 */
function parseSemanticView() {
  const sv = process.env.SEMANTIC_VIEW || '';
  const parts = sv.split('.');
  if (parts.length >= 3) {
    return {
      database: parts[0],
      schema: parts[1],
      view: parts.slice(2).join('.')
    };
  }
  return { database: '', schema: '', view: sv };
}

/**
 * Helper for delays
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute a SQL statement via Snowflake SQL API
 */
async function runSqlStatement(statement, options = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error('Snowflake base URL is not configured');
  }

  const svParts = parseSemanticView();
  const headers = getAuthHeaders();
  const payload = {
    statement,
    timeout: options.timeout || 60,
    database: svParts.database,
    schema: svParts.schema,
    warehouse: process.env.WAREHOUSE,
    resultSetMetaData: { format: 'jsonv2' },
    ...options.payloadOverrides
  };

  console.log(`[sql] Executing: ${statement.substring(0, 100)}...`);

  const postResp = await fetch(`${baseUrl}/api/v2/statements`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const postText = await postResp.text();
  if (!postResp.ok) {
    throw new Error(`Snowflake SQL API ${postResp.status}: ${postText}`);
  }

  let result;
  try {
    result = JSON.parse(postText);
  } catch (e) {
    throw new Error(`Failed to parse Snowflake SQL API response: ${e.message}`);
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
      throw new Error(`Snowflake SQL API status ${statusResp.status}: ${statusText}`);
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
 * Call Cortex Analyst REST API to generate SQL from natural language
 * 
 * API Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/rest-api
 * 
 * Uses the semantic_view parameter to reference the semantic view directly by name.
 */
async function callCortexAnalyst(question, conversationHistory = []) {
  const baseUrl = getBaseUrl();
  const semanticView = process.env.SEMANTIC_VIEW;
  
  if (!semanticView) {
    throw new Error('SEMANTIC_VIEW environment variable is not set');
  }
  
  const apiPath = `/api/v2/cortex/analyst/message`;
  const url = `${baseUrl}${apiPath}`;
  
  console.log(`[analyst] POST ${url}`);
  console.log(`[analyst] Semantic View: ${semanticView}`);

  // Build messages array with conversation history
  let messages = [];
  
  if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    messages = conversationHistory.map(msg => ({
      role: msg.role === 'agent' ? 'analyst' : msg.role,
      content: typeof msg.content === 'string' 
        ? [{ type: 'text', text: msg.content }]
        : msg.content
    }));
  }
  
  // Add current user message
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: question }]
  });

  const requestBody = {
    messages,
    semantic_view: semanticView
  };
  
  console.log(`[analyst] Request body:`, JSON.stringify(requestBody, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[analyst] Error ${response.status}: ${text}`);
    throw new Error(`Cortex Analyst API ${response.status}: ${text}`);
  }

  const result = await response.json();
  console.log(`[analyst] Response received`);
  
  // Extract SQL and text from response
  // Response format: { message: { role: "analyst", content: [{ type: "sql", statement: "..." }, { type: "text", text: "..." }] } }
  let extractedSql = null;
  let explanation = null;
  let suggestions = null;
  
  if (result.message?.content) {
    for (const item of result.message.content) {
      if (item.type === 'sql' && item.statement) {
        extractedSql = item.statement;
        console.log(`[analyst] Extracted SQL: ${extractedSql.substring(0, 100)}...`);
      }
      if (item.type === 'text' && item.text) {
        explanation = item.text;
      }
      if (item.type === 'suggestions' && item.suggestions) {
        suggestions = item.suggestions;
      }
    }
  }

  return {
    sql: extractedSql,
    explanation: explanation || 'Query generated.',
    suggestions,
    rawResponse: result,
    requestId: result.request_id,
    warnings: result.warnings
  };
}

/**
 * Call Cortex Inference REST API for LLM reasoning/analysis
 * 
 * This provides rich analysis of query results by sending the data
 * to an LLM for interpretation and insights.
 * 
 * API: POST /api/v2/cortex/inference:complete
 */
async function callCortexInference(systemPrompt, userMessage, model = 'claude-3-5-sonnet') {
  const baseUrl = getBaseUrl();
  const apiPath = `/api/v2/cortex/inference:complete`;
  const url = `${baseUrl}${apiPath}`;
  
  console.log(`[inference] POST ${url}`);
  console.log(`[inference] Model: ${model}`);

  const requestBody = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  };
  
  console.log(`[inference] System prompt: ${systemPrompt.substring(0, 100)}...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[inference] Error ${response.status}: ${text}`);
    throw new Error(`Cortex Inference API ${response.status}: ${text}`);
  }

  // Cortex Inference returns SSE streaming format (data: {json}\n\n)
  // We need to parse the SSE format and accumulate the content
  const rawText = await response.text();
  console.log(`[inference] Response received (${rawText.length} chars)`);
  
  let fullContent = '';
  let modelUsed = model;
  let usage = null;
  const chunks = [];
  
  // Parse SSE format: each chunk is "data: {json}\n\n"
  const lines = rawText.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const jsonStr = line.slice(6); // Remove "data: " prefix
      if (jsonStr.trim() === '[DONE]') {
        continue; // End of stream marker
      }
      try {
        const chunk = JSON.parse(jsonStr);
        chunks.push(chunk);
        
        // Accumulate content from delta
        if (chunk.choices && chunk.choices[0]?.delta?.content) {
          fullContent += chunk.choices[0].delta.content;
        }
        
        // Get model and usage info from first/last chunk
        if (chunk.model) {
          modelUsed = chunk.model;
        }
        if (chunk.usage) {
          usage = chunk.usage;
        }
      } catch (parseErr) {
        // Skip malformed JSON lines (shouldn't happen normally)
        console.warn(`[inference] Failed to parse chunk: ${jsonStr.substring(0, 50)}...`);
      }
    }
  }
  
  console.log(`[inference] Accumulated ${fullContent.length} chars from ${chunks.length} chunks`);

  return {
    content: fullContent,
    model: modelUsed,
    usage: usage,
    rawResponse: { chunks: chunks.length, totalChars: fullContent.length }
  };
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
  
  return await runSqlStatement(callStatement);
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/api/health', (_req, res) => {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  const isSpcs = fs.existsSync(SPCS_TOKEN_PATH);
  const hasPat = !!process.env.AUTH_TOKEN;
  const hasAuth = isSpcs || hasPat;
  const svParts = parseSemanticView();
  
  console.log('[health] Environment check:');
  console.log(`  SNOWFLAKE_ACCOUNT_URL: ${process.env.SNOWFLAKE_ACCOUNT_URL ? 'set' : 'MISSING'}`);
  console.log(`  SNOWFLAKE_HOST: ${process.env.SNOWFLAKE_HOST ? process.env.SNOWFLAKE_HOST : 'not set (ok for local)'}`);
  console.log(`  SEMANTIC_VIEW: ${process.env.SEMANTIC_VIEW || 'MISSING'}`);
  console.log(`  WAREHOUSE: ${process.env.WAREHOUSE || 'MISSING'}`);
  
  res.json({ 
    ok: missing.length === 0 && hasAuth, 
    missing,
    validTenants: VALID_TENANTS,
    config: {
      account: process.env.SNOWFLAKE_ACCOUNT_URL,
      semanticView: process.env.SEMANTIC_VIEW,
      database: svParts.database,
      schema: svParts.schema,
      warehouse: process.env.WAREHOUSE,
      snowflake_host: process.env.SNOWFLAKE_HOST || 'not available',
      auth_method: isSpcs ? 'SPCS OAuth' : (hasPat ? 'PAT Token' : 'None'),
      has_auth: hasAuth
    }
  });
});

/**
 * App configuration endpoint
 */
app.get('/api/app-config', (_req, res) => {
  const uiConfig = loadUiConfig();
  const svParts = parseSemanticView();
  res.json({
    semanticView: process.env.SEMANTIC_VIEW || '',
    database: svParts.database,
    schema: svParts.schema,
    warehouse: process.env.WAREHOUSE || '',
    appTitle: uiConfig.appTitle || 'Cortex Secure<br>Multi-Tenant Demo',
    tenants: VALID_TENANTS,
    maxConversations: uiConfig.maxConversations || 10,
    maxMessagesPerConversation: uiConfig.maxMessagesPerConversation || 10,
    presets: Array.isArray(uiConfig.presets) ? uiConfig.presets : []
  });
});

/**
 * Debug endpoint - returns diagnostic information for troubleshooting
 */
app.get('/api/debug', async (_req, res) => {
  const isSpcs = fs.existsSync(SPCS_TOKEN_PATH);
  const hasPat = !!process.env.AUTH_TOKEN;
  const hasSpcsHost = !!process.env.SNOWFLAKE_HOST;
  const svParts = parseSemanticView();
  const sqlDiagnostics = {
    currentRole: null,
    currentWarehouse: null,
    error: null
  };

  try {
    const roleResult = await runSqlStatement('SELECT CURRENT_ROLE() AS CURRENT_ROLE');
    const rows = Array.isArray(roleResult.data) ? roleResult.data : [];
    const firstRow = rows[0];
    if (firstRow && typeof firstRow === 'object') {
      const key = Object.keys(firstRow).find((k) => k.toLowerCase() === 'current_role');
      sqlDiagnostics.currentRole = key ? firstRow[key] : Object.values(firstRow)[0];
    } else if (Array.isArray(firstRow)) {
      sqlDiagnostics.currentRole = firstRow[0];
    }
  } catch (err) {
    sqlDiagnostics.error = `Unable to query CURRENT_ROLE: ${err.message}`;
  }

  if (!sqlDiagnostics.error) {
    try {
      const warehouseResult = await runSqlStatement('SELECT CURRENT_WAREHOUSE() AS CURRENT_WAREHOUSE');
      const rows = Array.isArray(warehouseResult.data) ? warehouseResult.data : [];
      const firstRow = rows[0];
      if (firstRow && typeof firstRow === 'object') {
        const key = Object.keys(firstRow).find((k) => k.toLowerCase() === 'current_warehouse');
        sqlDiagnostics.currentWarehouse = key ? firstRow[key] : Object.values(firstRow)[0];
      } else if (Array.isArray(firstRow)) {
        sqlDiagnostics.currentWarehouse = firstRow[0];
      }
    } catch (err) {
      sqlDiagnostics.currentWarehouse = null;
    }
  }
  
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
      semanticView: process.env.SEMANTIC_VIEW || 'NOT SET',
      database: svParts.database || 'NOT SET',
      schema: svParts.schema || 'NOT SET',
      warehouse: process.env.WAREHOUSE || 'NOT SET'
    },
    validTenants: VALID_TENANTS,
    sqlTest: {
      success: !sqlDiagnostics.error,
      role: sqlDiagnostics.currentRole,
      warehouse: sqlDiagnostics.currentWarehouse,
      error: sqlDiagnostics.error
    },
    status: {
      allEnvVarsSet: !!(process.env.SNOWFLAKE_ACCOUNT_URL && process.env.SEMANTIC_VIEW && process.env.WAREHOUSE),
      authConfigured: isSpcs || hasPat,
      readyToRun: !!(process.env.SEMANTIC_VIEW && (isSpcs || hasPat))
    }
  });
});

/**
 * Main chat endpoint - the secure multi-tenant orchestration
 * 
 * Flow:
 * 1. Receive question + tenant ID
 * 2. Call Cortex Analyst API to generate SQL (no execution)
 * 3. Execute the SQL through EXECUTE_SECURE_SQL with tenant context
 * 4. Return results
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, tenantId, conversationHistory, reasoningMode } = req.body;
    
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
    console.log(`[chat] Reasoning Mode: ${reasoningMode ? 'ON' : 'OFF'}`);
    console.log(`${'='.repeat(60)}`);
    
    // Step 1: Call Cortex Analyst to generate SQL
    const analystResponse = await callCortexAnalyst(message, conversationHistory);
    
    // Track verbose data for debugging
    const verboseData = {
      analystResponse: {
        timestamp: new Date().toISOString(),
        sql: analystResponse.sql || null,
        explanation: analystResponse.explanation || null,
        suggestions: analystResponse.suggestions || null,
        requestId: analystResponse.requestId,
        warnings: analystResponse.warnings || []
      },
      sprocExecution: null,
      inferenceResponse: null
    };
    
    // Step 2: If SQL was generated, execute through stored procedure with tenant context
    let finalResultSet = null;
    let executedSql = analystResponse.sql;
    
    if (analystResponse.sql) {
      console.log(`[chat] Executing SQL with tenant context: ${tenantId}`);
      
      try {
        const secureResult = await executeSecureSql(analystResponse.sql, tenantId);
        finalResultSet = {
          data: secureResult.data || [],
          resultSetMetaData: secureResult.resultSetMetaData || {}
        };
        console.log(`[chat] Secure execution returned ${secureResult.data?.length || 0} rows`);
        
        // Track sproc execution for verbose mode
        verboseData.sprocExecution = {
          timestamp: new Date().toISOString(),
          sql: `CALL EXECUTE_SECURE_SQL('${analystResponse.sql.replace(/'/g, "''")}', '${tenantId}')`,
          rowCount: secureResult.data?.length || 0,
          columnCount: secureResult.resultSetMetaData?.rowType?.length || 0,
          columns: secureResult.resultSetMetaData?.rowType?.map(c => c.name) || [],
          rawResponse: secureResult,
          success: true
        };
      } catch (sqlError) {
        console.error(`[chat] Secure SQL execution failed: ${sqlError.message}`);
        verboseData.sprocExecution = {
          timestamp: new Date().toISOString(),
          sql: `CALL EXECUTE_SECURE_SQL('${analystResponse.sql.replace(/'/g, "''")}', '${tenantId}')`,
          success: false,
          error: sqlError.message
        };
        return res.status(500).json({ 
          ok: false, 
          error: `SQL execution failed: ${sqlError.message}`,
          sql: analystResponse.sql,
          verbose: verboseData
        });
      }
    } else {
      // No SQL generated - might be a clarification or suggestion response
      console.log(`[chat] No SQL generated - returning analyst explanation`);
    }
    
    // Step 3: If reasoning mode is enabled and we have results, get LLM analysis
    let finalContent = analystResponse.explanation || 'Query completed.';
    
    if (reasoningMode && finalResultSet && finalResultSet.data && finalResultSet.data.length > 0) {
      console.log(`[chat] Reasoning mode enabled - calling Cortex Inference for analysis`);
      
      try {
        const systemPrompt = `You are an expert data analyst. A customer has asked a question about their data. 
Our AI system interpreted their question and retrieved the following results. 
Your job is to analyze these results and provide the customer with clear, actionable insights.

Be conversational but professional. Highlight key findings, trends, and any notable observations.
If the data suggests any recommendations or next steps, include those as well.
Keep your response concise but insightful.`;

        // Format the results for the LLM
        const columns = finalResultSet.resultSetMetaData?.rowType?.map(c => c.name) || [];
        const dataPreview = finalResultSet.data.slice(0, 50); // Limit to first 50 rows to avoid token limits
        
        const userMessage = `**Customer's Original Question:**
${message}

**How Our AI Interpreted This:**
${analystResponse.explanation || 'Generated SQL query to answer the question.'}

**Query Results (${finalResultSet.data.length} rows):**
Columns: ${columns.join(', ')}
Data:
${JSON.stringify(dataPreview, null, 2)}${finalResultSet.data.length > 50 ? `\n\n(Showing first 50 of ${finalResultSet.data.length} total rows)` : ''}

Please provide an insightful analysis of these results for the customer.`;

        const inferenceResult = await callCortexInference(systemPrompt, userMessage);
        
        if (inferenceResult.content) {
          finalContent = inferenceResult.content;
          console.log(`[chat] Inference analysis generated successfully`);
        }
        
        // Track inference for verbose mode
        verboseData.inferenceResponse = {
          timestamp: new Date().toISOString(),
          model: inferenceResult.model,
          usage: inferenceResult.usage,
          contentLength: inferenceResult.content?.length || 0,
          success: true
        };
        
      } catch (inferenceError) {
        console.error(`[chat] Inference failed: ${inferenceError.message}`);
        // Fall back to analyst explanation if inference fails
        verboseData.inferenceResponse = {
          timestamp: new Date().toISOString(),
          success: false,
          error: inferenceError.message
        };
      }
    }
    
    // Step 4: Format response
    res.json({
      ok: true,
      type: finalResultSet ? 'data' : 'text',
      content: finalContent,
      sql: executedSql,
      tenantId: tenantId,
      resultSet: finalResultSet,
      suggestions: analystResponse.suggestions,
      reasoningMode: reasoningMode || false,
      verbose: verboseData
    });
    
  } catch (e) {
    console.error(`[chat] Error: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  }
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
      result = await runSqlStatement(sql);
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

/**
 * Direct Analyst test endpoint (for debugging)
 * Calls Cortex Analyst without tenant isolation
 */
app.post('/api/test-analyst', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({ ok: false, error: 'Question required' });
    }
    
    const result = await callCortexAnalyst(question);
    
    res.json({
      ok: true,
      sql: result.sql,
      explanation: result.explanation,
      suggestions: result.suggestions,
      warnings: result.warnings,
      requestId: result.requestId
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
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  const isSpcs = fs.existsSync(SPCS_TOKEN_PATH);
  const hasPat = !!process.env.AUTH_TOKEN;
  const authMethod = isSpcs ? 'SPCS OAuth' : (hasPat ? 'PAT Token' : 'NONE - ERROR');
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('CORTEX SECURE MULTI-TENANT DEMO');
  console.log(`${'='.repeat(60)}`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Auth:   ${authMethod}`);
  console.log(`Semantic View: ${process.env.SEMANTIC_VIEW || 'NOT SET'}`);
  console.log(`Warehouse: ${process.env.WAREHOUSE || 'NOT SET'}`);
  console.log(`Missing env: ${missing.length ? missing.join(', ') : 'none'}`);
  console.log(`Valid tenants: ${VALID_TENANTS.join(', ')}`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (!isSpcs && !hasPat) {
    console.error('[ERROR] No authentication method available!');
    console.error('[ERROR] Local deployment requires AUTH_TOKEN in backend/.env');
  }
});
