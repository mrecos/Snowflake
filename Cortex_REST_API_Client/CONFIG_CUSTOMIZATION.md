# Configuration Customization Guide

## Overview

The application can be customized through the `public/config.json` file. This allows you to personalize the interface for different customers or deployments without modifying code.

---

## Configuration Options

### App Title (Branding)

**Property:** `appTitle`  
**Type:** String (HTML allowed)  
**Default:** `"Cortex Agent<br>REST API"`

Customizes the branding text in the upper left sidebar.

#### Examples

**Default Configuration:**
```json
{
  "appTitle": "Cortex Agent<br>REST API",
  ...
}
```

**Display:**
```
Cortex Agent
REST API
```

---

**Customer Branding:**
```json
{
  "appTitle": "Acme Corp<br>Data Assistant",
  ...
}
```

**Display:**
```
Acme Corp
Data Assistant
```

---

**Single Line:**
```json
{
  "appTitle": "MyCompany Analytics",
  ...
}
```

**Display:**
```
MyCompany Analytics
```

---

**Multi-line with HTML:**
```json
{
  "appTitle": "Customer Portal<br><span style='font-size: 14pt; font-weight: normal;'>Powered by Cortex</span>",
  ...
}
```

**Display:**
```
Customer Portal
Powered by Cortex  (smaller, lighter text)
```

---

### Conversation Retention Limits

**Property:** `maxConversations`  
**Type:** Number  
**Default:** `10`

Controls how many conversations are stored in `localStorage`. When the limit is exceeded, the oldest conversations are pruned automatically. Lower this number for kiosks/shared machines; increase it when you need longer history.

---

**Property:** `maxMessagesPerConversation`  
**Type:** Number  
**Default:** `10`

Caps the number of messages saved per conversation. Older messages are trimmed from the start, keeping the most recent exchanges (and preserving agent context) while avoiding runaway storage growth.

---

### Agent Configuration

**Property:** `agentName`  
**Type:** String  
**Required:** Yes

The name of the Snowflake Cortex Agent to interact with.

**Example:**
```json
{
  "agentName": "MY_CUSTOMER_AGENT",
  ...
}
```

---

**Property:** `agentDatabase`  
**Type:** String  
**Required:** Yes

The database where the agent is defined.

**Example:**
```json
{
  "agentDatabase": "PRODUCTION_DB",
  ...
}
```

---

**Property:** `agentSchema`  
**Type:** String  
**Required:** Yes

The schema where the agent is defined.

**Example:**
```json
{
  "agentSchema": "AGENTS",
  ...
}
```

---

### Presets

**Property:** `presets`  
**Type:** Array of objects  
**Required:** No (can be empty array)

Defines quick-access preset prompts that appear in the sidebar.

#### Preset Object Structure

```json
{
  "label": "Display text for button",
  "prompt": "The prompt text to populate in the input box"
}
```

#### Example Presets

```json
{
  "presets": [
    {
      "label": "Show top warehouses",
      "prompt": "What are the top 5 most expensive warehouses this month?"
    },
    {
      "label": "Query performance",
      "prompt": "Show me queries running longer than 2 minutes in the last hour."
    },
    {
      "label": "Table statistics",
      "prompt": "What are the largest tables and their clustering health?"
    }
  ]
}
```

**Empty presets (no buttons shown):**
```json
{
  "presets": []
}
```

---

## Complete Configuration Example

### Default Configuration

```json
{
  "appTitle": "Cortex Agent<br>REST API",
  "maxConversations": 10,
  "maxMessagesPerConversation": 10,
  "agentName": "HACKTHON_SP_TEST_V1",
  "agentDatabase": "SNOWFLAKE_INTELLIGENCE",
  "agentSchema": "AGENTS",
  "presets": [
    {
      "label": "Explore Table clustering health",
      "prompt": "Show clustering health for top 5 largest tables."
    },
    {
      "label": "How to benefit from QAS eligibility",
      "prompt": "Estimate QAS for top 5 queries running over 2 minutes"
    },
    {
      "label": "Retrieve Query operator stats",
      "prompt": "Show operator stats for the last 5 queries running over 2 minutes."
    },
    {
      "label": "Estimate search optimization costs",
      "prompt": "Estimate search optimization costs for top 5 most queried tables."
    },
    {
      "label": "Detail top warehouses",
      "prompt": "What are the top 5 most expensive warehouses this month and how can I optimize them?"
    }
  ]
}
```

---

### Customer-Specific Configuration

```json
{
  "appTitle": "Acme Analytics<br>AI Assistant",
  "agentName": "ACME_DATA_AGENT",
  "agentDatabase": "ACME_PRODUCTION",
  "agentSchema": "AI_AGENTS",
  "presets": [
    {
      "label": "Sales Overview",
      "prompt": "Show me sales performance for the last quarter by region."
    },
    {
      "label": "Inventory Status",
      "prompt": "What is the current inventory status for high-priority items?"
    },
    {
      "label": "Customer Trends",
      "prompt": "Analyze customer purchase trends over the past 6 months."
    }
  ]
}
```

---

## Styling Guidelines for appTitle

### Font Styling

The branding text uses:
- Font: Arial, sans-serif
- Size: 18pt
- Weight: Bold
- Color: Black

You can override with inline styles:
```json
{
  "appTitle": "<span style='color: #0066CC;'>Custom</span><br>Branding"
}
```

### Line Breaks

Use `<br>` for line breaks:
```json
{
  "appTitle": "Line 1<br>Line 2<br>Line 3"
}
```

### Length Recommendations

**Ideal:** 1-2 lines, 15-20 characters per line  
**Maximum:** 3 lines, 25 characters per line

**Why?** The sidebar is 320px wide. Longer text may wrap awkwardly or overflow.

---

## Deployment Workflow

### Step 1: Copy Configuration

Create a customer-specific config:
```bash
cp public/config.json public/config.acme.json
```

### Step 2: Edit Configuration

Edit the new file with customer branding:
```bash
nano public/config.acme.json
```

### Step 3: Deploy

Replace the default config at deployment:
```bash
cp public/config.acme.json public/config.json
```

Or use environment-specific configs:
```bash
# Development
cp public/config.dev.json public/config.json

# Production
cp public/config.prod.json public/config.json
```

---

## Validation

### Check Configuration

The app logs configuration on load:
```javascript
console.log('[config] Loaded:', config);
```

Open browser DevTools (F12) → Console to verify.

### Test Branding

1. Edit `public/config.json`
2. Change `appTitle` value
3. Refresh browser
4. Verify new branding appears in sidebar

### Common Issues

**Branding doesn't update:**
- Clear browser cache (Cmd+Shift+R / Ctrl+Shift+F5)
- Check console for errors
- Verify JSON is valid (no syntax errors)

**Presets don't appear:**
- Check `presets` is an array
- Verify each preset has `label` and `prompt`
- Check console for errors

**Agent not found:**
- Verify `agentName`, `agentDatabase`, `agentSchema` are correct
- Click "Verify Agent" button to test
- Check backend/.env configuration

---

## HTML Safety

The `appTitle` property uses `innerHTML`, which allows HTML tags.

### Safe HTML

```json
{
  "appTitle": "My App<br><span style='font-size: 14pt;'>v2.0</span>"
}
```

### Avoid

Don't include:
- JavaScript: `<script>` tags
- Event handlers: `onclick`, `onload`, etc.
- External resources: `<img src="http://...">`

**Why?** These won't work due to Content Security Policy and could introduce security issues.

---

## Best Practices

### 1. Keep It Simple
```json
✅ Good: "Acme Corp<br>Data Hub"
❌ Too long: "Acme Corporation International<br>Enterprise Data Analytics Platform"
```

### 2. Test Thoroughly
- Test with short names (5 chars)
- Test with long names (20 chars)
- Test with special characters
- Test with multiple lines

### 3. Version Control
Keep customer configs in separate files:
```
public/config.json          (default)
public/config.acme.json     (Acme Corp)
public/config.beta.json     (Beta Corp)
```

### 4. Documentation
Document customer-specific settings:
```json
{
  "_comment": "Acme Corp production configuration - last updated 2025-11-05",
  "appTitle": "Acme Analytics<br>AI Assistant",
  ...
}
```

---

## Advanced Customization

### Conditional Branding

Use a build script to inject branding:
```javascript
// build.js
const config = require('./config.template.json');
config.appTitle = process.env.CUSTOMER_NAME || 'Cortex Agent<br>REST API';
fs.writeFileSync('public/config.json', JSON.stringify(config, null, 2));
```

### Multi-Tenant

Serve different configs based on hostname:
```javascript
// server.js
app.get('/config.json', (req, res) => {
  const hostname = req.hostname;
  const configFile = `config.${hostname}.json`;
  res.sendFile(configFile);
});
```

---

## Troubleshooting

### Branding Not Showing

**Check 1:** Is config loaded?
```javascript
// In browser console
console.log(config);
```

**Check 2:** Is element present?
```javascript
// In browser console
console.log(document.getElementById('appBranding'));
```

**Check 3:** Is property set?
```javascript
// In browser console
console.log(config.appTitle);
```

### JSON Validation

Use an online JSON validator or:
```bash
# Check JSON syntax
python -m json.tool public/config.json
```

---

## Summary

- **`appTitle`** controls sidebar branding (HTML allowed)
- **`agentName`**, **`agentDatabase`**, **`agentSchema`** configure the agent
- **`presets`** define quick-access prompts
- All settings are in `public/config.json`
- Changes take effect on page refresh
- Default fallback: "Cortex Agent<br>REST API"

---

**Need help?** Check the console for error messages or verify your JSON syntax.

