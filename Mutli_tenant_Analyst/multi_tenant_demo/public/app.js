/**
 * Cortex Secure Multi-Tenant Demo - Frontend Application
 * 
 * Key Features:
 * - Tenant selector that affects all queries
 * - Visual indicators of current tenant context
 * - SQL debug panel to verify no hardcoded tenant filters
 * - Chat interface with response tables
 */

// =============================================================================
// UTILITIES
// =============================================================================

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  try { 
    const json = JSON.parse(t);
    json._status = r.status;
    return json;
  } catch { 
    return { ok: r.ok, text: t, _status: r.status }; 
  }
}

// =============================================================================
// DOM ELEMENTS
// =============================================================================

const resultEl = document.getElementById('result');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const tenantSelector = document.getElementById('tenantSelector');
const tenantBadge = document.getElementById('tenantBadge');
const tenantIndicator = document.getElementById('tenantIndicator');
const conversationHistoryEl = document.getElementById('conversationHistory');
const scrollToBottomBtn = document.getElementById('scrollToBottom');
const welcomeSection = document.getElementById('welcomeSection');
const generatedSqlEl = document.getElementById('generatedSql');
const sqlDebugDetails = document.getElementById('sqlDebugDetails');

// =============================================================================
// STATE
// =============================================================================

let config = null;
let currentTenant = 'TENANT_100';
let conversations = []; // Array of { id, tenantId, title, messages, createdAt }
let currentConversationId = null;

const STORAGE_KEY = 'multitenant_demo_conversations';
const MAX_CONVERSATIONS = 10;

// Tenant color mapping
const TENANT_COLORS = {
  'TENANT_100': '#22C55E',
  'TENANT_200': '#F59E0B',
  'TENANT_300': '#8B5CF6'
};

// =============================================================================
// TENANT MANAGEMENT
// =============================================================================

function getCurrentTenant() {
  return tenantSelector.value;
}

function updateTenantUI() {
  const tenant = getCurrentTenant();
  currentTenant = tenant;
  
  // Update badge
  tenantBadge.textContent = tenant;
  tenantBadge.setAttribute('data-tenant', tenant);
  tenantBadge.style.background = TENANT_COLORS[tenant];
  
  // Update indicator in input section
  tenantIndicator.innerHTML = `Querying as: <strong style="color: ${TENANT_COLORS[tenant]}">${tenant}</strong>`;
  
  console.log('[tenant] Switched to:', tenant);
}

// Listen for tenant changes
tenantSelector.addEventListener('change', () => {
  updateTenantUI();
  // Optionally start a new conversation when switching tenants
  // createNewConversation();
});

// =============================================================================
// THINKING INDICATOR
// =============================================================================

let thinkingInterval = null;
const thinkingMessages = [
  'Generating SQL query...',
  'Applying tenant context...',
  'Executing secure query...',
  'Processing results...',
  'Almost there...'
];

function showThinkingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'thinking-indicator';
  indicator.id = 'thinkingIndicator';
  
  const text = document.createElement('span');
  text.id = 'thinkingText';
  text.textContent = thinkingMessages[0];
  
  const dots = document.createElement('div');
  dots.className = 'thinking-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';
  
  indicator.appendChild(text);
  indicator.appendChild(dots);
  resultEl.appendChild(indicator);
  scrollToBottom(true);
  
  let idx = 0;
  thinkingInterval = setInterval(() => {
    idx = (idx + 1) % thinkingMessages.length;
    const el = document.getElementById('thinkingText');
    if (el) el.textContent = thinkingMessages[idx];
  }, 2000);
}

function hideThinkingIndicator() {
  if (thinkingInterval) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
  }
  const indicator = document.getElementById('thinkingIndicator');
  if (indicator) indicator.remove();
}

// =============================================================================
// SCROLL HELPERS
// =============================================================================

function scrollToBottom(smooth = true) {
  resultEl.scrollTo({
    top: resultEl.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
}

function isAtBottom() {
  return resultEl.scrollHeight - resultEl.scrollTop - resultEl.clientHeight < 50;
}

function updateScrollButton() {
  scrollToBottomBtn.classList.toggle('visible', !isAtBottom());
}

scrollToBottomBtn?.addEventListener('click', () => scrollToBottom(true));
resultEl?.addEventListener('scroll', updateScrollButton);

// =============================================================================
// CONVERSATION STORAGE
// =============================================================================

function loadConversations() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    conversations = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('[storage] Failed to load:', e);
    conversations = [];
  }
}

function saveConversations() {
  try {
    // Limit stored conversations
    if (conversations.length > MAX_CONVERSATIONS) {
      conversations = conversations.slice(0, MAX_CONVERSATIONS);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.error('[storage] Failed to save:', e);
  }
}

function generateTitle(text) {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  return cleaned.length > 40 ? cleaned.substring(0, 40) + '...' : cleaned;
}

function createNewConversation() {
  const id = 'conv_' + Date.now();
  const conv = {
    id,
    tenantId: getCurrentTenant(),
    title: 'New Conversation',
    messages: [],
    createdAt: new Date().toISOString()
  };
  conversations.unshift(conv);
  currentConversationId = id;
  saveConversations();
  renderConversationHistory();
  
  // Reset UI
  welcomeSection.style.display = 'block';
  resultEl.style.display = 'none';
  resultEl.innerHTML = '';
  document.getElementById('prompt').value = '';
  generatedSqlEl.innerHTML = '<code class="language-sql">-- No SQL generated yet</code>';
  
  console.log('[conversation] Created:', id);
}

function getCurrentConversation() {
  return conversations.find(c => c.id === currentConversationId);
}

function switchToConversation(id) {
  currentConversationId = id;
  renderConversationHistory();
  displayCurrentConversation();
}

function displayCurrentConversation() {
  const conv = getCurrentConversation();
  if (!conv || conv.messages.length === 0) {
    welcomeSection.style.display = 'block';
    resultEl.style.display = 'none';
    return;
  }
  
  welcomeSection.style.display = 'none';
  resultEl.style.display = 'block';
  resultEl.innerHTML = '';
  
  conv.messages.forEach(msg => {
    if (msg.role === 'user') {
      appendUserMessage(msg.content, msg.tenantId, msg.timestamp);
    } else {
      appendAgentMessage(msg.content, msg.sql, msg.resultSet, msg.tenantId, msg.timestamp);
    }
  });
  
  // Show the last SQL
  if (conv.messages.length > 0) {
    const lastAgent = [...conv.messages].reverse().find(m => m.role === 'agent' && m.sql);
    if (lastAgent?.sql) {
      updateSqlDebug(lastAgent.sql);
    }
  }
  
  setTimeout(() => scrollToBottom(false), 100);
}

function renderConversationHistory() {
  conversationHistoryEl.innerHTML = '';
  
  const recent = conversations.slice(0, 5);
  recent.forEach(conv => {
    const item = document.createElement('div');
    item.className = 'conversation-item' + (conv.id === currentConversationId ? ' active' : '');
    
    const title = document.createElement('div');
    title.className = 'conversation-item-title';
    title.textContent = conv.title;
    
    const meta = document.createElement('div');
    meta.className = 'conversation-item-meta';
    meta.innerHTML = `<span style="color: ${TENANT_COLORS[conv.tenantId]}">${conv.tenantId}</span>`;
    
    item.appendChild(title);
    item.appendChild(meta);
    item.onclick = () => switchToConversation(conv.id);
    
    conversationHistoryEl.appendChild(item);
  });
}

function clearAllHistory() {
  if (!confirm('Clear all conversation history?')) return;
  conversations = [];
  localStorage.removeItem(STORAGE_KEY);
  createNewConversation();
}

// =============================================================================
// MESSAGE RENDERING
// =============================================================================

function appendUserMessage(text, tenantId, timestamp = null) {
  const container = document.createElement('div');
  container.className = 'message-container message-user';
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  
  const header = document.createElement('div');
  header.className = 'message-header';
  header.innerHTML = `You <span class="message-tenant-badge" style="background: ${TENANT_COLORS[tenantId]}">${tenantId}</span>`;
  if (timestamp) {
    header.innerHTML += ` <span style="font-weight: normal; color: #999;">${new Date(timestamp).toLocaleTimeString()}</span>`;
  }
  
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;
  
  bubble.appendChild(header);
  bubble.appendChild(content);
  container.appendChild(bubble);
  resultEl.appendChild(container);
  
  scrollToBottom(true);
}

function appendAgentMessage(text, sql, resultSet, tenantId, timestamp = null) {
  const container = document.createElement('div');
  container.className = 'message-container message-agent';
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  
  const header = document.createElement('div');
  header.className = 'message-header';
  header.innerHTML = `Agent Response`;
  if (timestamp) {
    header.innerHTML += ` <span style="font-weight: normal; color: #999;">${new Date(timestamp).toLocaleTimeString()}</span>`;
  }
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  // Add text content
  if (text) {
    const p = document.createElement('p');
    p.textContent = text;
    content.appendChild(p);
  }
  
  // Add result table if present
  if (resultSet && resultSet.data && resultSet.data.length > 0) {
    const table = renderTable(resultSet);
    if (table) content.appendChild(table);
  }
  
  bubble.appendChild(header);
  bubble.appendChild(content);
  container.appendChild(bubble);
  resultEl.appendChild(container);
  
  // Update SQL debug panel
  if (sql) {
    updateSqlDebug(sql);
  }
  
  scrollToBottom(true);
}

function renderTable(resultSet) {
  if (!resultSet.data || !resultSet.resultSetMetaData) return null;
  
  const meta = resultSet.resultSetMetaData;
  const data = resultSet.data;
  
  const table = document.createElement('table');
  
  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  // Get column names from rowType
  const columns = meta.rowType || [];
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.name || col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Body
  const tbody = document.createElement('tbody');
  const rowsToShow = Math.min(data.length, 20);
  
  for (let i = 0; i < rowsToShow; i++) {
    const tr = document.createElement('tr');
    const rowData = data[i];
    
    // Handle both array and object formats
    if (Array.isArray(rowData)) {
      rowData.forEach(cellValue => {
        const td = document.createElement('td');
        td.textContent = formatCellValue(cellValue);
        tr.appendChild(td);
      });
    } else {
      columns.forEach(col => {
        const td = document.createElement('td');
        const colName = col.name || col;
        td.textContent = formatCellValue(rowData[colName]);
        tr.appendChild(td);
      });
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  
  // Add row count note if truncated
  if (data.length > 20) {
    const note = document.createElement('p');
    note.style.cssText = 'font-size: 12px; color: #999; margin-top: 8px;';
    note.textContent = `Showing first 20 of ${data.length} rows`;
    
    const wrapper = document.createElement('div');
    wrapper.appendChild(table);
    wrapper.appendChild(note);
    return wrapper;
  }
  
  return table;
}

function formatCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    // Format currency-like numbers
    if (value >= 100) {
      return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    // Format percentages (0.xx format)
    if (value > 0 && value < 1) {
      return (value * 100).toFixed(1) + '%';
    }
  }
  return String(value);
}

function updateSqlDebug(sql) {
  const formatted = sql.trim();
  generatedSqlEl.innerHTML = `<code class="language-sql">${escapeHtml(formatted)}</code>`;
  
  // Apply syntax highlighting
  if (window.hljs) {
    hljs.highlightElement(generatedSqlEl.querySelector('code'));
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =============================================================================
// CONFIG & HEALTH
// =============================================================================

async function loadConfig() {
  try {
    const resp = await fetchJson('/api/app-config');
    config = resp;
    console.log('[config] Loaded:', config);
    
    // Update branding
    const brandingEl = document.getElementById('appBranding');
    if (brandingEl && config.appTitle) {
      brandingEl.innerHTML = config.appTitle;
    }
    
    // Generate preset buttons
    const container = document.getElementById('presetsContainer');
    container.innerHTML = '';
    (config.presets || []).forEach(preset => {
      const btn = document.createElement('button');
      btn.textContent = preset.label;
      btn.onclick = () => {
        document.getElementById('prompt').value = preset.prompt;
      };
      container.appendChild(btn);
    });
    
    return config;
  } catch (e) {
    console.error('[config] Failed:', e);
    return null;
  }
}

async function checkHealth() {
  try {
    const resp = await fetchJson('/api/health');
    if (resp.ok) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected';
    } else {
      statusDot.className = 'status-dot error';
      statusText.textContent = 'Config Error';
    }
  } catch (e) {
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Offline';
  }
}

// =============================================================================
// DEBUG PANEL
// =============================================================================

async function showDebugPanel() {
  const panel = document.getElementById('debugPanel');
  const content = document.getElementById('debugContent');
  
  panel.style.display = 'flex';
  content.innerHTML = '<p>Loading debug information...</p>';
  
  try {
    const data = await fetchJson('/api/debug');
    content.innerHTML = renderDebugInfo(data);
  } catch (e) {
    content.innerHTML = `<p style="color: red;">Error: ${e.message}</p>`;
  }
}

function renderDebugInfo(data) {
  let html = '';
  
  // Status
  html += `<div class="debug-section">
    <div class="debug-section-title">Status</div>
    <div class="debug-row">
      <span class="debug-key">Ready:</span>
      <span class="debug-value ${data.status?.ready ? 'ok' : 'error'}">${data.status?.ready ? '✓ YES' : '✗ NO'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Auth Method:</span>
      <span class="debug-value">${data.authentication?.method || 'Unknown'}</span>
    </div>
  </div>`;
  
  // Configuration
  html += `<div class="debug-section">
    <div class="debug-section-title">Configuration</div>
    <div class="debug-row">
      <span class="debug-key">Account:</span>
      <span class="debug-value" style="font-size: 11px;">${data.configuration?.accountUrl || 'NOT SET'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Database:</span>
      <span class="debug-value">${data.configuration?.database || 'NOT SET'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Schema:</span>
      <span class="debug-value">${data.configuration?.schema || 'NOT SET'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Warehouse:</span>
      <span class="debug-value">${data.configuration?.warehouse || 'NOT SET'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Semantic Model:</span>
      <span class="debug-value" style="font-size: 11px;">${data.configuration?.semanticModel || 'NOT SET'}</span>
    </div>
  </div>`;
  
  // Valid Tenants
  html += `<div class="debug-section">
    <div class="debug-section-title">Valid Tenants</div>
    ${(data.validTenants || []).map(t => `
      <div class="debug-row">
        <span class="debug-key" style="color: ${TENANT_COLORS[t]}">${t}</span>
        <span class="debug-value">✓</span>
      </div>
    `).join('')}
  </div>`;
  
  // SQL Test
  if (data.sqlTest) {
    html += `<div class="debug-section">
      <div class="debug-section-title">SQL Connection Test</div>
      <div class="debug-row">
        <span class="debug-key">Status:</span>
        <span class="debug-value ${data.sqlTest.success ? 'ok' : 'error'}">${data.sqlTest.success ? '✓ Connected' : '✗ Failed'}</span>
      </div>
      ${data.sqlTest.role ? `<div class="debug-row">
        <span class="debug-key">Role:</span>
        <span class="debug-value">${data.sqlTest.role}</span>
      </div>` : ''}
      ${data.sqlTest.error ? `<div class="debug-row">
        <span class="debug-key">Error:</span>
        <span class="debug-value error">${data.sqlTest.error}</span>
      </div>` : ''}
    </div>`;
  }
  
  // Timestamp
  html += `<div style="text-align: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
    Updated: ${new Date(data.timestamp).toLocaleTimeString()}
  </div>`;
  
  return html;
}

document.getElementById('btnDebugToggle').onclick = showDebugPanel;
document.getElementById('btnDebugClose').onclick = () => {
  document.getElementById('debugPanel').style.display = 'none';
};

// =============================================================================
// CHAT FUNCTIONALITY
// =============================================================================

async function sendMessage() {
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) return;
  
  const tenantId = getCurrentTenant();
  
  // Ensure conversation exists
  if (!currentConversationId || !getCurrentConversation()) {
    createNewConversation();
  }
  
  const conv = getCurrentConversation();
  
  // Update tenant for this conversation if it's new
  if (conv.messages.length === 0) {
    conv.tenantId = tenantId;
    conv.title = generateTitle(prompt);
    renderConversationHistory();
  }
  
  // Add user message
  const userMsg = {
    role: 'user',
    content: prompt,
    tenantId: tenantId,
    timestamp: new Date().toISOString()
  };
  conv.messages.push(userMsg);
  saveConversations();
  
  // Show in UI
  welcomeSection.style.display = 'none';
  resultEl.style.display = 'block';
  appendUserMessage(prompt, tenantId, userMsg.timestamp);
  
  // Clear input and show loading
  document.getElementById('prompt').value = '';
  const btnSend = document.getElementById('btnSend');
  btnSend.disabled = true;
  btnSend.style.opacity = '0.5';
  statusDot.className = 'status-dot loading';
  statusText.textContent = 'Processing...';
  
  showThinkingIndicator();
  
  try {
    console.log(`[chat] Sending to tenant ${tenantId}: ${prompt}`);
    
    const resp = await fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, tenantId })
    });
    
    hideThinkingIndicator();
    
    if (resp.ok) {
      // Add agent response
      const agentMsg = {
        role: 'agent',
        content: resp.content || '',
        sql: resp.sql || null,
        resultSet: resp.resultSet || null,
        tenantId: tenantId,
        timestamp: new Date().toISOString()
      };
      conv.messages.push(agentMsg);
      saveConversations();
      
      appendAgentMessage(agentMsg.content, agentMsg.sql, agentMsg.resultSet, tenantId, agentMsg.timestamp);
      
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected';
    } else {
      const errorMsg = {
        role: 'agent',
        content: `Error: ${resp.error || 'Unknown error'}`,
        tenantId: tenantId,
        timestamp: new Date().toISOString()
      };
      conv.messages.push(errorMsg);
      saveConversations();
      
      appendAgentMessage(errorMsg.content, null, null, tenantId, errorMsg.timestamp);
      
      statusDot.className = 'status-dot error';
      statusText.textContent = 'Error';
    }
    
  } catch (e) {
    hideThinkingIndicator();
    console.error('[chat] Error:', e);
    
    const errorMsg = {
      role: 'agent',
      content: `Connection error: ${e.message}`,
      tenantId: tenantId,
      timestamp: new Date().toISOString()
    };
    conv.messages.push(errorMsg);
    saveConversations();
    
    appendAgentMessage(errorMsg.content, null, null, tenantId, errorMsg.timestamp);
    
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Error';
    
  } finally {
    btnSend.disabled = false;
    btnSend.style.opacity = '1';
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

document.getElementById('btnNewChat').onclick = createNewConversation;
document.getElementById('btnClearHistory').onclick = clearAllHistory;

document.getElementById('btnSend').onclick = sendMessage;

document.getElementById('prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// =============================================================================
// INITIALIZATION
// =============================================================================

async function init() {
  console.log('[init] Starting Cortex Secure Multi-Tenant Demo');
  
  // Load config and check health
  await loadConfig();
  await checkHealth();
  
  // Initialize tenant UI
  updateTenantUI();
  
  // Load conversations
  loadConversations();
  
  // Create or load conversation
  if (conversations.length > 0) {
    switchToConversation(conversations[0].id);
  } else {
    createNewConversation();
  }
  
  console.log('[init] Ready');
}

init();

