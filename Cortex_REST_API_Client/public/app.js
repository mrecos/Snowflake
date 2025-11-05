// ===== UTILITIES =====
async function j(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  try { 
    const json = JSON.parse(t);
    json._status = r.status; // Attach HTTP status code
    return json;
  } catch { 
    return { ok: r.ok, text: t, _status: r.status }; 
  }
}

// ===== DOM ELEMENTS =====
const resultEl = document.getElementById('result');
const resultRawEl = document.getElementById('resultRaw');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const threadIndicator = document.getElementById('threadIndicator');
const conversationHistoryEl = document.getElementById('conversationHistory');

// ===== STATE =====
let config = null; // Loaded from config.json
let currentConversation = null; // { id, thread_id, parent_message_id, title, messages, created_at, updated_at }
const MAX_CONVERSATIONS = 20;
const STORAGE_PREFIX = 'snowsage_conversation_';
const STORAGE_LIST_KEY = 'snowsage_conversation_list';

// ===== CONVERSATION STORAGE =====

// Get list of conversation IDs
function getConversationList() {
  try {
    const list = localStorage.getItem(STORAGE_LIST_KEY);
    return list ? JSON.parse(list) : [];
  } catch (e) {
    console.error('[storage] Failed to load conversation list:', e);
    return [];
  }
}

// Save conversation list
function saveConversationList(list) {
  try {
    localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('[storage] Failed to save conversation list:', e);
  }
}

// Load a specific conversation by ID
function loadConversation(id) {
  try {
    const data = localStorage.getItem(STORAGE_PREFIX + id);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('[storage] Failed to load conversation:', e);
    return null;
  }
}

// Save current conversation
function saveCurrentConversation() {
  if (!currentConversation) return;
  
  try {
    // Update timestamp
    currentConversation.updated_at = new Date().toISOString();
    
    // Save conversation data
    localStorage.setItem(STORAGE_PREFIX + currentConversation.id, JSON.stringify(currentConversation));
    
    // Update conversation list
    let list = getConversationList();
    if (!list.includes(currentConversation.id)) {
      list.unshift(currentConversation.id);
      
      // Prune old conversations if we exceed max
      if (list.length > MAX_CONVERSATIONS) {
        const removed = list.slice(MAX_CONVERSATIONS);
        removed.forEach(id => {
          localStorage.removeItem(STORAGE_PREFIX + id);
        });
        list = list.slice(0, MAX_CONVERSATIONS);
      }
      
      saveConversationList(list);
    }
    
    console.log('[storage] Saved conversation:', currentConversation.id);
  } catch (e) {
    console.error('[storage] Failed to save conversation:', e);
    if (e.name === 'QuotaExceededError') {
      alert('Storage quota exceeded. Please clear old conversations.');
    }
  }
}

// Generate title from first message (first 50 chars)
function generateTitle(text) {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  return cleaned.length > 50 ? cleaned.substring(0, 50) + '...' : cleaned;
}

// Create new conversation
function createNewConversation() {
  const id = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  currentConversation = {
    id: id,
    thread_id: 0,
    parent_message_id: 0,
    title: 'New Conversation',
    messages: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  console.log('[conversation] Created new conversation:', id);
  updateThreadIndicator();
  renderConversationHistory();
  
  // Clear display
  resultEl.innerHTML = '<p>Ready. Ask a question to start a new conversation.</p>';
  resultRawEl.textContent = 'Ready.';
  document.getElementById('prompt').value = '';
}

// Load existing conversation
function switchToConversation(id) {
  const conv = loadConversation(id);
  if (!conv) {
    console.error('[conversation] Failed to load:', id);
    return;
  }
  
  currentConversation = conv;
  console.log('[conversation] Loaded conversation:', id);
  updateThreadIndicator();
  renderConversationHistory();
  
  // Display conversation messages
  displayConversationMessages();
}

// Display all messages in current conversation
function displayConversationMessages() {
  if (!currentConversation || currentConversation.messages.length === 0) {
    resultEl.innerHTML = '<p>No messages in this conversation yet.</p>';
    resultRawEl.textContent = '';
    return;
  }
  
  resultEl.innerHTML = '';
  
  currentConversation.messages.forEach((msg, idx) => {
    const msgDiv = document.createElement('div');
    msgDiv.style.marginBottom = '16px';
    msgDiv.style.paddingBottom = '16px';
    msgDiv.style.borderBottom = '1px solid #e5e8eb';
    
    // Message header
    const header = document.createElement('div');
    header.style.fontSize = '11px';
    header.style.color = 'var(--muted)';
    header.style.marginBottom = '6px';
    header.style.fontWeight = '600';
    header.textContent = msg.role === 'user' ? '👤 You' : '🤖 Agent';
    if (msg.timestamp) {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      header.textContent += ` • ${time}`;
    }
    msgDiv.appendChild(header);
    
    // Message content
    if (msg.role === 'user') {
      const p = document.createElement('p');
      p.textContent = msg.content;
      p.style.margin = '0';
      msgDiv.appendChild(p);
    } else if (msg.role === 'assistant' && msg.events) {
      const tempResult = document.createElement('div');
      resultEl.appendChild(tempResult);
      const oldResultEl = resultEl;
      // Temporarily swap resultEl to render into msgDiv
      window.tempResultEl = tempResult;
      renderResponse(msg.events);
      msgDiv.appendChild(tempResult);
    }
    
    resultEl.appendChild(msgDiv);
  });
  
  // Show raw JSON of last message
  const lastMsg = currentConversation.messages[currentConversation.messages.length - 1];
  if (lastMsg && lastMsg.rawResponse) {
    resultRawEl.textContent = JSON.stringify(lastMsg.rawResponse, null, 2);
  }
}

// Update thread indicator
function updateThreadIndicator() {
  if (!currentConversation) {
    threadIndicator.textContent = '';
    return;
  }
  
  const isNew = currentConversation.messages.length === 0;
  if (isNew) {
    threadIndicator.textContent = 'New conversation';
  } else {
    threadIndicator.textContent = `Thread ${currentConversation.thread_id || 0} • ${currentConversation.messages.length} message(s)`;
  }
}

// Render conversation history sidebar
function renderConversationHistory() {
  conversationHistoryEl.innerHTML = '';
  
  const list = getConversationList();
  
  list.forEach(id => {
    const conv = loadConversation(id);
    if (!conv) return;
    
    const item = document.createElement('div');
    item.className = 'conversation-item';
    if (currentConversation && currentConversation.id === id) {
      item.classList.add('active');
    }
    
    const title = document.createElement('div');
    title.className = 'conversation-item-title';
    title.textContent = conv.title;
    
    const meta = document.createElement('div');
    meta.className = 'conversation-item-meta';
    
    const date = document.createElement('div');
    date.className = 'conversation-item-date';
    const updatedDate = new Date(conv.updated_at);
    const now = new Date();
    const diffMs = now - updatedDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) {
      date.textContent = 'Just now';
    } else if (diffMins < 60) {
      date.textContent = `${diffMins}m ago`;
    } else if (diffHours < 24) {
      date.textContent = `${diffHours}h ago`;
    } else if (diffDays < 7) {
      date.textContent = `${diffDays}d ago`;
    } else {
      date.textContent = updatedDate.toLocaleDateString();
    }
    
    const count = document.createElement('div');
    count.className = 'conversation-item-count';
    count.textContent = conv.messages.length;
    
    meta.appendChild(date);
    meta.appendChild(count);
    
    item.appendChild(title);
    item.appendChild(meta);
    
    item.onclick = () => switchToConversation(id);
    
    conversationHistoryEl.appendChild(item);
  });
}

// Clear all conversation history
function clearAllHistory() {
  if (!confirm('Are you sure you want to clear all conversation history? This cannot be undone.')) {
    return;
  }
  
  const list = getConversationList();
  list.forEach(id => {
    localStorage.removeItem(STORAGE_PREFIX + id);
  });
  localStorage.removeItem(STORAGE_LIST_KEY);
  
  console.log('[storage] Cleared all history');
  createNewConversation();
  renderConversationHistory();
}

// ===== CONFIG =====

async function loadConfig() {
  try {
    const resp = await fetch('/config.json');
    config = await resp.json();
    console.log('[config] Loaded:', config);
    
    // Generate preset buttons
    const container = document.getElementById('presetsContainer');
    config.presets.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = preset.label;
      btn.onclick = () => {
        document.getElementById('prompt').value = preset.prompt;
      };
      container.appendChild(btn);
    });
    
    return config;
  } catch (e) {
    console.error('[config] Failed to load:', e);
    alert('Failed to load config.json - check console');
    return null;
  }
}

// ===== RESPONSE RENDERING =====

// Extract plain text from assistant message events for conversation history
function extractTextFromEvents(events) {
  if (!events || !Array.isArray(events)) return '';
  
  // Find the final assistant message
  const finalMsg = events.find(e => e.role === 'assistant' && e.content);
  if (!finalMsg || !finalMsg.content) return '';
  
  // Extract all text content items
  const textParts = finalMsg.content
    .filter(item => item.type === 'text' && item.text)
    .map(item => item.text);
  
  return textParts.join('\n').trim();
}

// Render response content based on type
function renderResponse(events) {
  resultEl.innerHTML = '';
  
  // Find the final assistant message
  const finalMsg = events.find(e => e.role === 'assistant' && e.content);
  if (!finalMsg || !finalMsg.content) {
    resultEl.innerHTML = '<p>No response content found.</p>';
    return;
  }

  // Render each content item
  finalMsg.content.forEach((item, idx) => {
    if (item.type === 'text' && item.text) {
      const p = document.createElement('div');
      // Parse markdown tables first, then handle other markdown
      let html = parseMarkdownTables(item.text);
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/##\s+(.+)/g, '<h3 style="margin-top: 16px; margin-bottom: 8px;">$1</h3>');
      html = html.replace(/```sql\n([^`]+)```/g, '<pre style="background: #f5f7f9; padding: 8px; border-radius: 4px; overflow-x: auto;"><code>$1</code></pre>');
      html = html.replace(/```([^`]+)```/g, '<pre style="background: #f5f7f9; padding: 8px; border-radius: 4px; overflow-x: auto;"><code>$1</code></pre>');
      html = html.replace(/\n/g, '<br>');
      p.innerHTML = html;
      resultEl.appendChild(p);
    }
    
    else if (item.type === 'tool_result' && item.tool_result) {
      const result = item.tool_result;
      if (result.content && result.content[0] && result.content[0].json && result.content[0].json.result_set) {
        const rs = result.content[0].json.result_set;
        const table = renderTable(rs);
        if (table) resultEl.appendChild(table);
      }
    }
    
    else if (item.type === 'chart' && item.chart && item.chart.chart_spec) {
      const chartDiv = document.createElement('div');
      chartDiv.className = 'chart-container';
      chartDiv.id = `chart-${idx}`;
      resultEl.appendChild(chartDiv);
      
      try {
        const spec = JSON.parse(item.chart.chart_spec);
        
        // Make chart larger but constrained
        spec.width = 650;
        spec.height = 400;
        
        // Add tooltip encoding if not present (enables hover interactivity)
        if (!spec.encoding.tooltip) {
          const tooltipFields = [];
          if (spec.encoding.x && spec.encoding.x.field) {
            tooltipFields.push({ field: spec.encoding.x.field, type: spec.encoding.x.type || 'quantitative' });
          }
          if (spec.encoding.y && spec.encoding.y.field) {
            tooltipFields.push({ field: spec.encoding.y.field, type: spec.encoding.y.type || 'nominal' });
          }
          spec.encoding.tooltip = tooltipFields;
        }
        
        // Customize bar appearance
        spec.mark = {
          type: spec.mark === 'bar' ? 'bar' : spec.mark,
          color: '#FF9F36',  // Orange bars
          cornerRadiusEnd: 4  // Rounded bar ends
        };
        
        vegaEmbed(`#chart-${idx}`, spec, { 
          actions: {
            export: { svg: true, png: true },
            source: false,
            compiled: false,
            editor: false
          },
          renderer: 'svg'
        });
      } catch (e) {
        chartDiv.innerHTML = '<p style="color: #a00;">Chart render error</p>';
      }
    }
  });
}

// Convert markdown tables to HTML tables
function parseMarkdownTables(text) {
  const lines = text.split('\n');
  let html = '';
  let inTable = false;
  let tableLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this is a table line (contains | characters)
    if (line.startsWith('|') && line.endsWith('|')) {
      inTable = true;
      tableLines.push(line);
    } else {
      // End of table
      if (inTable && tableLines.length > 0) {
        html += convertMarkdownTableToHTML(tableLines);
        tableLines = [];
        inTable = false;
      }
      // Regular line
      html += line + '\n';
    }
  }
  
  // Handle table at end of text
  if (inTable && tableLines.length > 0) {
    html += convertMarkdownTableToHTML(tableLines);
  }
  
  return html;
}

function convertMarkdownTableToHTML(tableLines) {
  if (tableLines.length < 2) return tableLines.join('\n');
  
  const parseCells = (line) => line.split('|').slice(1, -1).map(c => c.trim());
  
  const headers = parseCells(tableLines[0]);
  const dataRows = tableLines.slice(2); // Skip separator line
  
  let html = '<table>';
  
  // Header
  html += '<thead><tr>';
  headers.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead>';
  
  // Body
  html += '<tbody>';
  dataRows.forEach(row => {
    const cells = parseCells(row);
    html += '<tr>';
    cells.forEach(c => {
      // Convert backticks to code tags, bold to strong
      let cell = c.replace(/`([^`]+)`/g, '<code style="background: #f5f7f9; padding: 2px 4px; border-radius: 3px;">$1</code>');
      cell = cell.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html += `<td>${cell}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  
  return html;
}

// Render result_set as HTML table
function renderTable(resultSet) {
  if (!resultSet.data || !resultSet.resultSetMetaData) return null;
  
  const meta = resultSet.resultSetMetaData;
  const data = resultSet.data;
  
  const table = document.createElement('table');
  
  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  meta.rowType.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.name;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Body (limit to first 20 rows for readability)
  const tbody = document.createElement('tbody');
  const rowsToShow = Math.min(data.length, 20);
  for (let i = 0; i < rowsToShow; i++) {
    const tr = document.createElement('tr');
    data[i].forEach(cellValue => {
      const td = document.createElement('td');
      td.textContent = cellValue !== null ? cellValue : '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  
  if (data.length > 20) {
    const note = document.createElement('p');
    note.style.fontSize = '12px';
    note.style.color = 'var(--muted)';
    note.textContent = `Showing first 20 of ${data.length} rows`;
    const wrapper = document.createElement('div');
    wrapper.appendChild(table);
    wrapper.appendChild(note);
    return wrapper;
  }
  
  return table;
}

// ===== HEALTH CHECK =====

async function checkHealth() {
  try {
    const resp = await j('/api/health');
    if (resp.ok) {
      statusDot.className = 'dot green';
      statusText.textContent = 'Connected';
    } else {
      statusDot.className = 'dot red';
      statusText.textContent = 'Config missing: ' + resp.missing.join(', ');
    }
  } catch (e) {
    statusDot.className = 'dot red';
    statusText.textContent = 'Server offline';
  }
}

// ===== INITIALIZATION =====

async function init() {
  await loadConfig();
  checkHealth();
  
  // Load or create conversation
  const list = getConversationList();
  if (list.length > 0) {
    // Load most recent conversation
    switchToConversation(list[0]);
  } else {
    // Create new conversation
    createNewConversation();
  }
}

init();

// ===== EVENT HANDLERS =====

// New conversation button
document.getElementById('btnNewConversation').onclick = () => {
  createNewConversation();
};

// Clear history button
document.getElementById('btnClearHistory').onclick = () => {
  clearAllHistory();
};

// Verify agent exists
document.getElementById('btnVerifyAgent').onclick = async () => {
  if (!config) return;
  
  statusDot.className = 'dot yellow';
  statusText.textContent = 'Checking agent...';
  resultEl.innerHTML = `<p>Verifying ${config.agentName} exists...</p>`;
  
  try {
    const resp = await j(`/api/agent/${config.agentName}/describe`);
    resultRawEl.textContent = JSON.stringify(resp, null, 2);
    if (resp.ok) {
      statusDot.className = 'dot green';
      statusText.textContent = 'Agent found';
      resultEl.innerHTML = '<p style="color: var(--brand);"><strong>✓ Agent verified</strong></p><p style="font-size: 12px;">Agent: ' + config.agentName + '<br>Database: ' + resp.result.database_name + '<br>Schema: ' + resp.result.schema_name + '</p>';
    } else {
      statusDot.className = 'dot red';
      statusText.textContent = 'Agent not found';
      const errorCode = resp._status || 'Unknown';
      const errorMsg = resp.error || 'Agent not found';
      resultEl.innerHTML = `<p style="color: #a00;"><strong>Error ${errorCode}:</strong> Agent not found</p><p style="font-size: 12px;">${errorMsg}</p>`;
    }
  } catch (e) {
    statusDot.className = 'dot red';
    statusText.textContent = 'Error';
    resultEl.innerHTML = `<p style="color: #a00;">Error: ${String(e)}</p>`;
  }
};

// Send button - calls the agent with thread tracking
document.getElementById('btnSend').onclick = async () => {
  if (!config) {
    alert('Config not loaded yet');
    return;
  }
  
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) return;
  
  // Ensure we have a current conversation
  if (!currentConversation) {
    createNewConversation();
  }
  
  const btnSend = document.getElementById('btnSend');
  const originalBtnText = btnSend.innerHTML;
  
  // Show thinking state
  statusDot.className = 'dot yellow';
  statusText.textContent = 'Running...';
  btnSend.disabled = true;
  btnSend.innerHTML = '<span class="spinner"></span>Sending...';
  resultEl.innerHTML = `<p>Sending to agent ${config.agentName}...</p><p style="color: var(--muted); font-size: 12px;">This may take up to 20 seconds...</p>`;
  
  // Add user message to conversation
  const userMessage = {
    role: 'user',
    content: prompt,
    timestamp: new Date().toISOString()
  };
  currentConversation.messages.push(userMessage);
  
  // Set title from first message
  if (currentConversation.messages.length === 1) {
    currentConversation.title = generateTitle(prompt);
  }
  
  try {
    // Build conversation history for context (simplified format for API)
    const conversation_history = currentConversation.messages.map(msg => ({
      role: msg.role,
      content: msg.role === 'user' ? msg.content : extractTextFromEvents(msg.events)
    }));
    
    const resp = await j(`/api/agent/${config.agentName}/run`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        prompt,
        thread_id: currentConversation.thread_id,
        parent_message_id: currentConversation.parent_message_id,
        conversation_history: conversation_history
      }) 
    });
    
    // Store raw JSON for debugging
    resultRawEl.textContent = JSON.stringify(resp, null, 2);
    
    if (resp.ok && resp.events) {
      // Update thread IDs for next message
      if (resp.thread_id !== undefined && resp.thread_id !== null) {
        currentConversation.thread_id = resp.thread_id;
      }
      if (resp.parent_message_id !== undefined && resp.parent_message_id !== null) {
        currentConversation.parent_message_id = resp.parent_message_id;
      }
      
      // Add assistant message to conversation
      const assistantMessage = {
        role: 'assistant',
        events: resp.events,
        rawResponse: resp,
        timestamp: new Date().toISOString()
      };
      currentConversation.messages.push(assistantMessage);
      
      // Save conversation to localStorage
      saveCurrentConversation();
      
      // Render the formatted response
      renderResponse(resp.events);
      
      // Update UI
      statusDot.className = 'dot green';
      statusText.textContent = 'Completed';
      updateThreadIndicator();
      renderConversationHistory();
      
      // Clear prompt
      document.getElementById('prompt').value = '';
    } else if (resp.ok) {
      resultEl.innerHTML = '<p>Response received but no events found.</p>';
      statusDot.className = 'dot green';
      statusText.textContent = 'Completed';
    } else {
      const errorCode = resp._status || 'Unknown';
      const errorMsg = resp.error || 'Unknown error';
      resultEl.innerHTML = `<p style="color: #a00;"><strong>Error ${errorCode}:</strong> ${errorMsg}</p>`;
      statusDot.className = 'dot red';
      statusText.textContent = 'Error - check auth';
      
      // Remove the user message since it failed
      currentConversation.messages.pop();
    }
  } catch (e) {
    statusDot.className = 'dot red';
    statusText.textContent = 'Error';
    resultEl.innerHTML = `<p style="color: #a00;">Error: ${String(e)}</p>`;
    resultRawEl.textContent = String(e);
    
    // Remove the user message since it failed
    currentConversation.messages.pop();
  } finally {
    // Re-enable button
    btnSend.disabled = false;
    btnSend.innerHTML = originalBtnText;
  }
};


