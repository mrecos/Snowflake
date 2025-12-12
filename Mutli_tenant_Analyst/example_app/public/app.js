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
const statusText = document.getElementById('statusText');
const threadIndicator = document.getElementById('threadIndicator');
const conversationHistoryEl = document.getElementById('conversationHistory');
const scrollToBottomBtn = document.getElementById('scrollToBottom');
const welcomeSection = document.getElementById('welcomeSection');
const welcomeH1 = document.getElementById('welcomeH1');

// ===== STATE =====
let config = null; // Loaded from config.json
let currentConversation = null; // { id, thread_id, parent_message_id, title, messages, created_at, updated_at }
// MAX_CONVERSATIONS now loaded from config.json (config.maxConversations || 10)
const STORAGE_PREFIX = 'snowsage_conversation_';
const STORAGE_LIST_KEY = 'snowsage_conversation_list';

// ===== WELCOME GREETING =====

function updateWelcomeGreeting() {
  const hour = new Date().getHours();
  let greeting;
  
  if (hour < 12) {
    greeting = 'Good morning';
  } else if (hour < 17) {
    greeting = 'Good afternoon';
  } else {
    greeting = 'Good evening';
  }
  
  welcomeH1.textContent = greeting;
}

// ===== THINKING INDICATOR =====

let thinkingMessageInterval = null;
const thinkingMessages = [
  'Agent is thinking',
  'Analyzing your request',
  'Querying Snowflake',
  'Building SQL queries',
  'Executing queries, hold tight',
  'Processing results',
  'Gathering insights',
  'Almost there'
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
  
  // Rotate through messages every 8 seconds with fade effect
  let messageIndex = 0;
  thinkingMessageInterval = setInterval(() => {
    messageIndex = (messageIndex + 1) % thinkingMessages.length;
    const textEl = document.getElementById('thinkingText');
    if (textEl) {
      // Fade out
      textEl.style.opacity = '0';
      
      // Change text and fade in after transition
      setTimeout(() => {
        textEl.textContent = thinkingMessages[messageIndex];
        textEl.style.opacity = '1';
      }, 500);
    }
  }, 8000);
}

function hideThinkingIndicator() {
  // Clear the message rotation interval
  if (thinkingMessageInterval) {
    clearInterval(thinkingMessageInterval);
    thinkingMessageInterval = null;
  }
  
  const indicator = document.getElementById('thinkingIndicator');
  if (indicator) {
    indicator.remove();
  }
}

// ===== SCROLL HELPERS =====

// Scroll to bottom of conversation
function scrollToBottom(smooth = true) {
  resultEl.scrollTo({
    top: resultEl.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
}

// Check if user is at bottom of conversation
function isAtBottom() {
  const threshold = 50; // pixels from bottom
  return resultEl.scrollHeight - resultEl.scrollTop - resultEl.clientHeight < threshold;
}

// Update scroll button visibility
function updateScrollButton() {
  if (isAtBottom()) {
    scrollToBottomBtn.classList.remove('visible');
  } else {
    scrollToBottomBtn.classList.add('visible');
  }
}

// Setup scroll button listener
if (scrollToBottomBtn) {
  scrollToBottomBtn.onclick = () => scrollToBottom(true);
}

// Setup scroll listener to show/hide button
if (resultEl) {
  resultEl.addEventListener('scroll', updateScrollButton);
}

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
  if (!currentConversation || !config) return;
  
  try {
    // Update timestamp
    currentConversation.updated_at = new Date().toISOString();
    
    // Limit messages per conversation to prevent storage bloat
    const maxMessages = config.maxMessagesPerConversation || 10;
    if (currentConversation.messages.length > maxMessages) {
      currentConversation.messages = currentConversation.messages.slice(-maxMessages);
    }
    
    // Save conversation data
    localStorage.setItem(STORAGE_PREFIX + currentConversation.id, JSON.stringify(currentConversation));
    
    // Update conversation list
    let list = getConversationList();
    if (!list.includes(currentConversation.id)) {
      list.unshift(currentConversation.id);
      
      // Prune old conversations if we exceed max
      const maxConversations = config.maxConversations || 10;
      if (list.length > maxConversations) {
        const removed = list.slice(maxConversations);
        removed.forEach(id => {
          localStorage.removeItem(STORAGE_PREFIX + id);
        });
        list = list.slice(0, maxConversations);
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
  
  // Show welcome section, hide chat
  welcomeSection.style.display = 'block';
  resultEl.style.display = 'none';
  resultEl.innerHTML = '';
  resultRawEl.textContent = 'Ready.';
  document.getElementById('prompt').value = '';
  scrollToBottomBtn.classList.remove('visible');
  updateWelcomeGreeting();
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
    // Show welcome section, hide chat
    welcomeSection.style.display = 'block';
    resultEl.style.display = 'none';
    resultEl.innerHTML = '';
    resultRawEl.textContent = '';
    scrollToBottomBtn.classList.remove('visible');
    updateWelcomeGreeting();
    return;
  }
  
  // Hide welcome section, show chat
  welcomeSection.style.display = 'none';
  resultEl.style.display = 'block';
  
  // Clear the display
  resultEl.innerHTML = '';
  
  // Append all messages using the chat-style functions
  currentConversation.messages.forEach((msg) => {
    if (msg.role === 'user') {
      appendUserMessage(msg.content, msg.timestamp);
    } else if (msg.role === 'assistant' && msg.events) {
      appendAssistantMessage(msg.events, msg.timestamp);
    }
  });
  
  // Show latest raw response if available (only kept for current session)
  if (window.lastRawResponse) {
    resultRawEl.textContent = JSON.stringify(window.lastRawResponse, null, 2);
  } else {
    resultRawEl.textContent = 'No response data available (only latest response is kept for debugging)';
  }
  
  // Scroll to bottom after loading conversation
  setTimeout(() => scrollToBottom(false), 100);
}

// Update thread indicator
function updateThreadIndicator() {
  if (!currentConversation) {
    threadIndicator.textContent = '';
    return;
  }
  
  const isNew = currentConversation.messages.length === 0;
  if (isNew) {
    threadIndicator.textContent = '';
  } else {
    const msgCount = currentConversation.messages.length;
    const turnCount = Math.floor(msgCount / 2);
    threadIndicator.textContent = `${msgCount} message${msgCount !== 1 ? 's' : ''} • ${turnCount} turn${turnCount !== 1 ? 's' : ''}`;
  }
}

// Render conversation history sidebar
function renderConversationHistory() {
  conversationHistoryEl.innerHTML = '';
  
  const list = getConversationList();
  
  // Limit to most recent 5 conversations
  const recentList = list.slice(0, 5);
  
  recentList.forEach(id => {
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
    const resp = await fetch('/api/app-config');
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    config = await resp.json();
    console.log('[config] Loaded:', config);
    
    // Set app branding from config (default to "Cortex Agent<br>REST API")
    const brandingEl = document.getElementById('appBranding');
    if (brandingEl && config.appTitle) {
      brandingEl.innerHTML = config.appTitle;
    }
    
    // Generate preset buttons
    const container = document.getElementById('presetsContainer');
    (config.presets || []).forEach(preset => {
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
    alert('Failed to load application config - check console');
    return null;
  }
}

// ===== RESPONSE RENDERING =====

// Append a user message to the conversation display
function appendUserMessage(text, timestamp = null) {
  const container = document.createElement('div');
  container.className = 'message-container message-user';
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  
  const header = document.createElement('div');
  header.className = 'message-header';
  header.textContent = 'You';
  if (timestamp) {
    const time = new Date(timestamp).toLocaleTimeString();
    header.textContent += ` • ${time}`;
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

// Append an assistant message to the conversation display
function appendAssistantMessage(events, timestamp = null) {
  const container = document.createElement('div');
  container.className = 'message-container message-agent';
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  
  const header = document.createElement('div');
  header.className = 'message-header';
  header.textContent = 'Agent';
  if (timestamp) {
    const time = new Date(timestamp).toLocaleTimeString();
    header.textContent += ` • ${time}`;
  }
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  bubble.appendChild(header);
  bubble.appendChild(content);
  container.appendChild(bubble);
  resultEl.appendChild(container);
  
  // Render the response content into the content div
  renderMessageContent(events, content);
  
  scrollToBottom(true);
}

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

// Render message content into a target element (used by appendAssistantMessage)
function renderMessageContent(events, targetEl) {
  // Find the final assistant message
  const finalMsg = events.find(e => e.role === 'assistant' && e.content);
  if (!finalMsg || !finalMsg.content) {
    targetEl.innerHTML = '<p>No response content found.</p>';
    return;
  }

  let textBuffer = '';
  const flushTextBuffer = () => {
    if (!textBuffer) return;
    renderTextBlock(textBuffer, targetEl);
    textBuffer = '';
  };

  // Render each content item
  finalMsg.content.forEach((item, idx) => {
    if (item.type === 'text' && item.text) {
      textBuffer += item.text;
    }
    
    else if (item.type === 'tool_result' && item.tool_result) {
      flushTextBuffer();
      const result = item.tool_result;
      if (result.content && result.content[0] && result.content[0].json && result.content[0].json.result_set) {
        const rs = result.content[0].json.result_set;
        const table = renderTable(rs);
        if (table) targetEl.appendChild(table);
      }
    }
    
    else if (item.type === 'chart' && item.chart && item.chart.chart_spec) {
      flushTextBuffer();
      const chartDiv = document.createElement('div');
      chartDiv.className = 'chart-container';
      const chartId = `chart-${Date.now()}-${idx}`;
      chartDiv.id = chartId;
      targetEl.appendChild(chartDiv);
      
      try {
        // Check if vegaEmbed is available
        if (typeof vegaEmbed === 'undefined') {
          throw new Error('Vega-Embed library not loaded');
        }
        
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
        
        vegaEmbed(`#${chartId}`, spec, { 
          actions: {
            export: { svg: true, png: true },
            source: false,
            compiled: false,
            editor: false
          },
          renderer: 'svg'
        }).catch(err => {
          console.error('Vega-Embed render error:', err);
          chartDiv.innerHTML = `<p style="color: #a00;">Chart render error: ${err.message}</p>`;
        });
      } catch (e) {
        console.error('Chart parsing error:', e);
        chartDiv.innerHTML = `<p style="color: #a00;">Chart render error: ${e.message}</p>`;
      }
    }
  });

  flushTextBuffer();
}

// Render buffered markdown/text content into the target element
function renderTextBlock(text, targetEl) {
  if (!text || !text.trim()) return;

  // Convert markdown tables to HTML first (preserves non-table content)
  let html = parseMarkdownTables(text);

  // Extract fenced code blocks so we can handle them separately
  const codeBlocks = [];
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({
      language: (lang || '').toLowerCase(),
      code
    });
    return `@@CODE_BLOCK_${idx}@@`;
  });

  // Basic markdown replacements
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^###\s+(.+)$/gm, '<h4 style="margin-top: 16px; margin-bottom: 8px; font-weight: bold;">$1</h4>');
  html = html.replace(/^##\s+(.+)$/gm, '<h3 style="margin-top: 20px; margin-bottom: 10px;">$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h2 style="margin-top: 24px; margin-bottom: 12px;">$1</h2>');
  html = html.replace(/^#\s*$/gm, '');

  // Inline code formatting
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    return `<code class="inline-code">${escapeHtml(code)}</code>`;
  });

  // Convert remaining newlines to <br> for readability
  html = html.replace(/\n/g, '<br>');

  // Reinsert formatted code blocks
  codeBlocks.forEach((block, idx) => {
    const placeholder = `@@CODE_BLOCK_${idx}@@`;
    html = html.replace(placeholder, renderCodeBlock(block));
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'message-text-block';
  wrapper.innerHTML = html;
  targetEl.appendChild(wrapper);

  // Apply syntax highlighting to all code blocks
  wrapper.querySelectorAll('code[class^="language-"]').forEach(block => {
    if (window.hljs) hljs.highlightElement(block);
  });
}

function renderCodeBlock(block) {
  const language = (block.language || '').toLowerCase();
  let code = block.code || '';
  code = code.replace(/\r\n/g, '\n');
  code = dedent(code).trim();

  const escaped = escapeHtml(code);

  // Map common languages to their code block styles
  if (language === 'sql') {
    return `<pre class="sql-code-block"><code class="language-sql">${escaped}</code></pre>`;
  }
  
  if (language === 'python' || language === 'py') {
    return `<pre class="code-block python-code-block"><code class="language-python">${escaped}</code></pre>`;
  }
  
  // Generic code block for other languages (javascript, bash, etc.)
  if (language) {
    return `<pre class="code-block"><code class="language-${language}">${escaped}</code></pre>`;
  }

  // No language specified
  return `<pre class="code-block"><code>${escaped}</code></pre>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dedent(str) {
  const lines = str.split('\n');
  let minIndent = null;

  lines.forEach(line => {
    const match = line.match(/^\s*(?=\S)/);
    if (match) {
      const indent = match[0].length;
      if (minIndent === null || indent < minIndent) {
        minIndent = indent;
      }
    }
  });

  if (!minIndent || minIndent === 0) {
    return lines.join('\n');
  }

  return lines
    .map(line => (line.startsWith(' '.repeat(minIndent)) ? line.slice(minIndent) : line))
    .join('\n');
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
      statusText.textContent = 'Connected';
      statusText.className = 'status-text connected';
    } else {
      statusText.textContent = 'Config Error';
      statusText.className = 'status-text';
    }
  } catch (e) {
    statusText.textContent = 'Offline';
    statusText.className = 'status-text';
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
  
  // Show result area, hide welcome
  welcomeSection.style.display = 'none';
  resultEl.style.display = 'block';
  
  statusText.textContent = 'Checking...';
  statusText.className = 'status-text';
  resultEl.innerHTML = `<p>Verifying ${config.agentName} exists...</p>`;
  
  try {
    const resp = await j(`/api/agent/${config.agentName}/describe`);
    resultRawEl.textContent = JSON.stringify(resp, null, 2);
    if (resp.ok) {
      statusText.textContent = 'Connected';
      statusText.className = 'status-text connected';
      resultEl.innerHTML = '<p style="color: var(--mid-blue);"><strong>✓ Agent Verified</strong></p><p>Agent: ' + config.agentName + '<br>Database: ' + resp.result.database_name + '<br>Schema: ' + resp.result.schema_name + '</p>';
    } else {
      statusText.textContent = 'Error';
      statusText.className = 'status-text';
      const errorCode = resp._status || 'Unknown';
      const errorMsg = resp.error || 'Agent not found';
      resultEl.innerHTML = `<p style="color: var(--medium-gray);"><strong>Error ${errorCode}:</strong> Agent not found</p><p>${errorMsg}</p>`;
    }
  } catch (e) {
    statusText.textContent = 'Error';
    statusText.className = 'status-text';
    resultEl.innerHTML = `<p style="color: var(--medium-gray);">Error: ${String(e)}</p>`;
  }
};

// Handle Enter key in textarea (Shift+Enter for new line, Enter to send)
document.getElementById('prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // Prevent new line
    document.getElementById('btnSend').click();
  }
});

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
  
  // Add user message to conversation immediately
  const userMessage = {
    role: 'user',
    content: prompt,
    timestamp: new Date().toISOString()
  };
  currentConversation.messages.push(userMessage);
  
  // Set title from first message
  if (currentConversation.messages.length === 1) {
    currentConversation.title = generateTitle(prompt);
    // Hide welcome section, show chat area for first message
    welcomeSection.style.display = 'none';
    resultEl.style.display = 'block';
  }
  
  // Show user message in UI immediately
  appendUserMessage(prompt, userMessage.timestamp);
  
  // Show thinking indicator
  showThinkingIndicator();
  
  // Clear prompt and show thinking state
  document.getElementById('prompt').value = '';
  statusText.textContent = 'Processing...';
  statusText.className = 'status-text';
  btnSend.disabled = true;
  btnSend.style.opacity = '0.5';
  
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
    
    // Store latest raw JSON in memory for debugging (not in localStorage)
    window.lastRawResponse = resp;
    resultRawEl.textContent = JSON.stringify(resp, null, 2);
    
    if (resp.ok && resp.events) {
      // Update thread IDs for next message
      if (resp.thread_id !== undefined && resp.thread_id !== null) {
        currentConversation.thread_id = resp.thread_id;
      }
      if (resp.parent_message_id !== undefined && resp.parent_message_id !== null) {
        currentConversation.parent_message_id = resp.parent_message_id;
      }
      
      // Add assistant message to conversation (without rawResponse to save storage)
      const assistantMessage = {
        role: 'assistant',
        events: resp.events,
        timestamp: new Date().toISOString()
      };
      currentConversation.messages.push(assistantMessage);
      
      // Save conversation to localStorage
      saveCurrentConversation();
      
      // Hide thinking indicator and append the assistant response
      hideThinkingIndicator();
      appendAssistantMessage(resp.events, assistantMessage.timestamp);
      
      // Update UI
      statusText.textContent = 'Connected';
      statusText.className = 'status-text connected';
      updateThreadIndicator();
      renderConversationHistory();
    } else if (resp.ok) {
      hideThinkingIndicator();
      resultEl.innerHTML = '<p>Response received but no events found.</p>';
      statusText.textContent = 'Connected';
      statusText.className = 'status-text connected';
    } else {
      hideThinkingIndicator();
      const errorCode = resp._status || 'Unknown';
      const errorMsg = resp.error || 'Unknown error';
      resultEl.innerHTML = `<p style="color: var(--medium-gray);"><strong>Error ${errorCode}:</strong> ${errorMsg}</p>`;
      statusText.textContent = 'Error';
      statusText.className = 'status-text';
      
      // Remove the user message since it failed
      currentConversation.messages.pop();
    }
  } catch (e) {
    hideThinkingIndicator();
    statusText.textContent = 'Error';
    statusText.className = 'status-text';
    resultEl.innerHTML = `<p style="color: var(--medium-gray);">Error: ${String(e)}</p>`;
    resultRawEl.textContent = String(e);
    
    // Remove the user message since it failed
    currentConversation.messages.pop();
  } finally {
    // Re-enable button
    btnSend.disabled = false;
    btnSend.style.opacity = '1';
  }
};

// ===== DEBUG PANEL =====

async function fetchDebugInfo() {
  try {
    const data = await j('/api/debug');
    return data;
  } catch (e) {
    console.error('Failed to fetch debug info:', e);
    return { error: String(e) };
  }
}

function renderDebugInfo(data) {
  if (data.error) {
    return `<div class="debug-section">
      <div class="debug-section-title">Error</div>
      <div class="debug-value status-error">${data.error}</div>
    </div>`;
  }
  
  let html = '';
  
  // Status Overview
  html += `<div class="debug-section">
    <div class="debug-section-title">Status Overview</div>
    <div class="debug-row">
      <span class="debug-key">Ready to Run:</span>
      <span class="debug-value ${data.status?.readyToRun ? 'status-ok' : 'status-error'}">
        ${data.status?.readyToRun ? '✓ YES' : '✗ NO'}
      </span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Auth Configured:</span>
      <span class="debug-value ${data.status?.authConfigured ? 'status-ok' : 'status-error'}">
        ${data.status?.authConfigured ? '✓ YES' : '✗ NO'}
      </span>
    </div>
    <div class="debug-row">
      <span class="debug-key">All Env Vars Set:</span>
      <span class="debug-value ${data.status?.allEnvVarsSet ? 'status-ok' : 'status-error'}">
        ${data.status?.allEnvVarsSet ? '✓ YES' : '✗ NO'}
      </span>
    </div>
  </div>`;
  
  // Environment
  html += `<div class="debug-section">
    <div class="debug-section-title">Environment</div>
    <div class="debug-row">
      <span class="debug-key">Deployment:</span>
      <span class="debug-value">${data.environment?.isSpcs ? 'SPCS' : 'Local'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Container:</span>
      <span class="debug-value">${data.environment?.isContainer ? 'Yes' : 'No'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Node Version:</span>
      <span class="debug-value">${data.environment?.nodeVersion || 'unknown'}</span>
    </div>
  </div>`;
  
  // Authentication
  html += `<div class="debug-section">
    <div class="debug-section-title">Authentication</div>
    <div class="debug-row">
      <span class="debug-key">Method:</span>
      <span class="debug-value ${data.authentication?.method === 'None' ? 'status-error' : 'status-ok'}">
        ${data.authentication?.method || 'Unknown'}
      </span>
    </div>
    <div class="debug-row">
      <span class="debug-key">OAuth Token:</span>
      <span class="debug-value">${data.authentication?.hasOAuthToken ? '✓ Present' : '✗ Not Found'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">PAT Token:</span>
      <span class="debug-value">${data.authentication?.hasPATToken ? '✓ Present' : '✗ Not Found'}</span>
    </div>
  </div>`;
  
  // Routing
  html += `<div class="debug-section">
    <div class="debug-section-title">Routing</div>
    <div class="debug-row">
      <span class="debug-key">Snowflake Host:</span>
      <span class="debug-value" style="font-size: 11px;">${data.routing?.snowflakeHost || 'not set'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Account URL:</span>
      <span class="debug-value" style="font-size: 11px;">${data.routing?.accountUrl || 'not set'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Base URL:</span>
      <span class="debug-value" style="font-size: 11px;">${data.routing?.baseUrl || 'not set'}</span>
    </div>
  </div>`;
  
  // Configuration
  html += `<div class="debug-section">
    <div class="debug-section-title">Configuration</div>
    <div class="debug-row">
      <span class="debug-key">Agent Name:</span>
      <span class="debug-value">${data.configuration?.agentName || 'NOT SET'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Database:</span>
      <span class="debug-value">${data.configuration?.agentDatabase || 'NOT SET'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Schema:</span>
      <span class="debug-value">${data.configuration?.agentSchema || 'NOT SET'}</span>
    </div>
    <div class="debug-row">
      <span class="debug-key">Warehouse (Env):</span>
      <span class="debug-value">
        ${data.configuration?.warehouse || 'Not set (configure in Agent UI)'}
      </span>
    </div>
  </div>`;
  
  // Role Context via SQL API
  if (data.sql) {
    const currentRole = data.sql.currentRole || 'Unknown';
    const warehouseLabel = data.sql.currentWarehouse || 'None (not set)';
    const hasCurrentWarehouse = !!data.sql.currentWarehouse;
    html += `<div class="debug-section">
      <div class="debug-section-title">Role Context</div>
      <div class="debug-row">
        <span class="debug-key">Current Role:</span>
        <span class="debug-value">${currentRole}</span>
      </div>
      <div class="debug-row">
        <span class="debug-key">Current Warehouse:</span>
        <span class="debug-value ${hasCurrentWarehouse ? 'status-ok' : 'status-warning'}">
          ${warehouseLabel}
        </span>
      </div>
      ${data.sql.error ? `<div class="debug-row">
        <span class="debug-key">SQL Check:</span>
        <span class="debug-value status-warning">${data.sql.error}</span>
      </div>` : ''}
    </div>`;
  }
  
  // Timestamp
  html += `<div class="debug-timestamp">
    Updated: ${new Date(data.timestamp).toLocaleTimeString()}
  </div>`;
  
  return html;
}

// Debug panel toggle
document.getElementById('btnDebugToggle').onclick = async () => {
  const panel = document.getElementById('debugPanel');
  const content = document.getElementById('debugContent');
  
  if (panel.style.display === 'none') {
    panel.style.display = 'flex';
    content.innerHTML = '<p>Loading debug information...</p>';
    const debugData = await fetchDebugInfo();
    content.innerHTML = renderDebugInfo(debugData);
  } else {
    panel.style.display = 'none';
  }
};

// Debug panel close
document.getElementById('btnDebugClose').onclick = () => {
  document.getElementById('debugPanel').style.display = 'none';
};


