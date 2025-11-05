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

const resultEl = document.getElementById('result');
const resultRawEl = document.getElementById('resultRaw');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

let config = null; // Will be loaded from config.json

// Load configuration
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

// Initialize app
async function init() {
  await loadConfig();
  checkHealth();
}

init();

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

// Send button calls the existing agent
document.getElementById('btnSend').onclick = async () => {
  if (!config) {
    alert('Config not loaded yet');
    return;
  }
  
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) return;
  
  const btnSend = document.getElementById('btnSend');
  const originalBtnText = btnSend.innerHTML;
  
  // Show thinking state
  statusDot.className = 'dot yellow';
  statusText.textContent = 'Running...';
  btnSend.disabled = true;
  btnSend.innerHTML = '<span class="spinner"></span>Sending...';
  resultEl.innerHTML = `<p>Sending to agent ${config.agentName}...</p><p style="color: var(--muted); font-size: 12px;">This may take up to 20 seconds...</p>`;
  
  try {
    const resp = await j(`/api/agent/${config.agentName}/run`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ prompt }) 
    });
    
    // Store raw JSON for debugging
    resultRawEl.textContent = JSON.stringify(resp, null, 2);
    
    if (resp.ok && resp.events) {
      // Render the formatted response
      renderResponse(resp.events);
      
      // Update status
      statusDot.className = 'dot green';
      statusText.textContent = 'Completed';
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
    }
  } catch (e) {
    statusDot.className = 'dot red';
    statusText.textContent = 'Error';
    resultEl.innerHTML = `<p style="color: #a00;">Error: ${String(e)}</p>`;
    resultRawEl.textContent = String(e);
  } finally {
    // Re-enable button
    btnSend.disabled = false;
    btnSend.innerHTML = originalBtnText;
  }
};


