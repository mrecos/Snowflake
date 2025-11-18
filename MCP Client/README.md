# Snowflake MCP Client

A Flask-based web application that serves as a **middleware demonstration** for the Model Context Protocol (MCP), showcasing how applications can discover and interact with MCP tools hosted by Snowflake.

> **Note:** This is a demonstration tool focused on middleware functionality, not a chat application. It's designed to illustrate the bridge between MCP servers and AI/LLM applications.

## 📖 What is MCP (Model Context Protocol)?

The [Model Context Protocol](https://modelcontextprotocol.io) is an open protocol that standardizes how applications provide context to LLMs. Think of it as a universal adapter that allows AI applications to safely access data and tools from various sources.

MCP enables:
- **Standardized Discovery**: Applications can dynamically discover available tools
- **Secure Access**: Controlled access to data and functionality
- **Interoperability**: Common protocol for diverse data sources and tools

## 🎯 Purpose

This MCP Client demonstrates how middleware can:
1. **Discover** available MCP tools from a Snowflake server
2. **Interact** with different tool types (Search, Analyst, SQL, Agents)
3. **Handle** streaming responses for long-running operations
4. **Format** results for consumption by LLM applications

It's ideal for:
- Understanding MCP protocol implementation
- Testing Snowflake MCP server capabilities
- Prototyping AI application integrations
- Educational demonstrations of MCP concepts

## ✨ Features

### Dynamic Tool Discovery
- Automatically discovers available MCP tools on startup
- Supports multiple Snowflake Cortex tool types:
  - **Cortex Search** (`CORTEX_SEARCH_SERVICE_QUERY`) - Document/data search
  - **Cortex Analyst** (`CORTEX_ANALYST_MESSAGE`) - Natural language to SQL
  - **SQL Execution** (`SYSTEM_EXECUTE_SQL`) - Direct SQL query execution
  - **Cortex Agent** (`CORTEX_AGENT_RUN`) - Intelligent agent interactions

### Modern UI Design
- Snowflake Intelligence-inspired interface
- Tool selection panel with dynamic discovery
- Single input interface (non-chat design philosophy)
- Formatted output display:
  - Tables for SQL results
  - Markdown rendering for agent responses
  - JSON view for raw responses
- Search limit slider (1-50 results)
- "Discover Tools" button for dynamic tool refresh

### Robust Technical Implementation
- **HTTP Streaming with SSE Support**: Prevents 50-second load balancer timeouts
- **Server-Sent Events (SSE)**: Keeps connections alive during long-running requests
- **Response Streaming**: Uses `.iter_lines()` to process responses incrementally
- **Connection Management**: Configured HTTPAdapter for long-running operations
- **Error Handling**: Comprehensive logging and error reporting

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Access to a Snowflake account with MCP server configured
- Personal Access Token (PAT) or Bearer token for authentication

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/snowflake-mcp-client.git
cd snowflake-mcp-client
```

2. **Create virtual environment (recommended)**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Configure environment variables**

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and set your Snowflake MCP server details:
```bash
# MCP Server URL
MCP_SERVER_URL=https://your-account.snowflakecomputing.com/api/v2/databases/YOUR_DB/schemas/YOUR_SCHEMA/mcp-servers/YOUR_SERVER

# MCP Authentication Token
MCP_AUTH_TOKEN=your_bearer_token_here

# Flask Secret Key (optional - will auto-generate if not provided)
SECRET_KEY=your-secret-key-here
```

### Running the Application

```bash
python mcp_client.py
```

The application will start on **http://localhost:5000**

You should see:
```
🚀 Starting Lightweight MCP Client
📡 Connected to: https://your-account.snowflakecomputing.com/...
🌐 Starting server on http://localhost:5000
```

## 📋 Configuration Guide

### Getting Your MCP Server URL

Your MCP server URL follows this format:
```
https://{account}.snowflakecomputing.com/api/v2/databases/{database}/schemas/{schema}/mcp-servers/{server-name}
```

Example:
```
https://mycompany.snowflakecomputing.com/api/v2/databases/MCP_DB/schemas/SERVERS/mcp-servers/my_mcp_server
```

### Generating Authentication Token

You can generate a Personal Access Token (PAT) in Snowflake:

```sql
-- Generate a bearer token (valid for configured duration)
SELECT SYSTEM$GENERATE_BEARER_TOKEN_PKCE();
```

Or use existing authentication tokens from your Snowflake security settings.

### Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MCP_SERVER_URL` | Yes | Snowflake MCP server endpoint | `https://account.snowflakecomputing.com/api/v2/...` |
| `MCP_AUTH_TOKEN` | Yes | Bearer token for authentication | `eyJraWQiOi...` |
| `SECRET_KEY` | No | Flask session secret (auto-generated if not set) | Any random string |

## 🖥️ UI Overview

### Non-Chat Design Philosophy

Unlike chat applications, this MCP client uses a **single-input design**:
- **One input field** for queries across all tool types
- **Tool selection panel** to choose the operation type
- **Results display** showing formatted output
- **No conversation history** - each request is independent

This design emphasizes the **middleware nature** of the application, focusing on tool discovery and interaction patterns rather than conversational flow.

### Tool Discovery

The **"Discover Tools"** button is a primary action that:
1. Queries the MCP server for available tools
2. Maps discovered tools to known capabilities
3. Updates the UI with available options
4. Enables dynamic tool availability checking

### Output Formatting

Results are formatted based on tool type:
- **Search Results**: Card-based display with context chunks
- **Analyst Results**: SQL query display with syntax highlighting
- **SQL Results**: Tabular data display with column headers
- **Agent Results**: Markdown-rendered responses with rich formatting

## ⚙️ Technical Implementation

### Streaming Architecture

The application uses HTTP streaming to handle long-running requests:

```python
# Accept SSE streams
headers = {
    'Accept': 'application/json, text/event-stream',
    # ...
}

# Stream responses
response = session.post(url, json=payload, stream=True, timeout=120)

# Process incrementally
for line in response.iter_lines(decode_unicode=True):
    if line.startswith("data: "):
        # Process SSE event
```

This prevents 50-second load balancer timeouts by keeping the connection active during processing.

### Why Streaming Matters

Without streaming:
- ❌ Load balancer timeout after 50 seconds
- ❌ No feedback during long operations
- ❌ Request appears to hang

With streaming:
- ✅ Connection stays alive indefinitely
- ✅ Events processed as they arrive
- ✅ Prevents timeout errors

### Critical Code Sections

These implementations solve the timeout issue and should not be modified:
- Line 68: `Accept` header with `text/event-stream`
- Line 114: `stream=True` in `requests.post()`
- Lines 177-236: SSE streaming response processing with `.iter_lines()`
- Lines 64-82: HTTPAdapter configuration for long-running requests

## 🛠️ API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main UI interface |
| `/api/tools` | GET | List available MCP tools |
| `/api/tools/discover` | GET | Discover and map tool capabilities |
| `/api/search` | POST | Execute search query |
| `/api/analyze` | POST | Generate SQL from natural language |
| `/api/execute-sql` | POST | Execute SQL query |
| `/api/agent` | POST | Query Cortex Agent |
| `/api/status` | GET | Check MCP server connection status |

## 🐛 Troubleshooting

### Connection Issues

**Error: "MCP_SERVER_URL not configured"**
- Ensure `.env` file exists and contains valid `MCP_SERVER_URL`
- Check that the URL format matches Snowflake's MCP endpoint structure

**Error: "HTTP 401: Unauthorized"**
- Verify your `MCP_AUTH_TOKEN` is valid and not expired
- Generate a new token in Snowflake if needed

**Error: "HTTP 504: Gateway Timeout"**
- Check that streaming is enabled (should be by default)
- Verify your MCP server is responding
- Check Snowflake account connectivity

### Tool Discovery Issues

**No tools found**
- Verify MCP server is properly configured in Snowflake
- Check that tools are published in your MCP server schema
- Review server logs for connection errors

**Tools not mapping correctly**
- Tools are mapped based on their input schema properties
- Check tool definitions in Snowflake match expected patterns
- Review console logs for mapping details

## 📝 Development

### Project Structure
```
snowflake-mcp-client/
├── mcp_client.py           # Flask backend (763 lines)
├── templates/
│   └── mcp_client.html     # Frontend UI (1359 lines)
├── requirements.txt        # Python dependencies
├── .env.example           # Environment template
├── .gitignore             # Git exclusions
├── LICENSE                # MIT License
└── README.md              # This file
```

### Running in Development Mode

The application runs in debug mode by default:
```bash
python mcp_client.py
```

Debug mode enables:
- Auto-reload on code changes
- Detailed error pages
- Enhanced logging

### Adding New Tools

To support additional MCP tool types:

1. Add tool mapping in `TOOL_TYPE_MAPPINGS`:
```python
TOOL_TYPE_MAPPINGS = {
    'YOUR_TOOL_TYPE': 'your_category',
    # ...
}
```

2. Create endpoint handler in `mcp_client.py`
3. Add UI controls in `templates/mcp_client.html`

## 🤝 Contributing

Contributions are welcome! This is a demonstration project designed to help others understand MCP implementation.

Please:
- Follow existing code style and patterns
- Preserve the streaming implementation
- Add comments explaining complex logic
- Test with real Snowflake MCP servers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [Snowflake Cortex Documentation](https://docs.snowflake.com/en/user-guide/snowflake-cortex)
- [Flask Documentation](https://flask.palletsprojects.com/)

## ⚠️ Important Notes

- **Security**: Never commit `.env` files or tokens to version control
- **SSL Verification**: Currently disabled for testing (`verify=False`) - enable in production
- **Port**: Application is locked to port 5000
- **Timeouts**: Configured for 120-second timeouts with streaming support
- **Logging**: Verbose logging enabled for debugging and monitoring

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review application logs for detailed error messages
3. Verify Snowflake MCP server configuration
4. Open an issue on GitHub with log excerpts

---

Built with ❤️ to demonstrate the power of Model Context Protocol

