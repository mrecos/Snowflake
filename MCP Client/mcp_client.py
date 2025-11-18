#!/usr/bin/env python3
"""
Snowflake MCP Client - Model Context Protocol Middleware Demo

A Flask-based web application that serves as a middleware interface between
Snowflake's MCP server and LLM applications. This is a demonstration tool
showcasing how applications can discover and interact with MCP tools hosted
by Snowflake.

Key Features:
- Dynamic tool discovery (Cortex Search, Analyst, SQL Execution, Agents)
- HTTP streaming with SSE support for long-running requests
- Modern Snowflake Intelligence-inspired UI

Configuration:
Set environment variables in .env file (see .env.example for template)
"""

import os
import json
import logging
import requests
from flask import Flask, render_template, request, jsonify, session
from datetime import datetime
from typing import Dict, List, Any, Optional
import uuid
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'mcp-client-dev-key-change-in-production')

# ============================================================================
# MCP Server Configuration - Load from Environment Variables
# ============================================================================
# Set these in your .env file (see .env.example for template)
#
# Required environment variables:
# - MCP_SERVER_URL: Your Snowflake MCP server endpoint
# - MCP_AUTH_TOKEN: Your Personal Access Token (PAT) or Bearer token
#
# Example MCP_SERVER_URL format:
# https://{account}.snowflakecomputing.com/api/v2/databases/{db}/schemas/{schema}/mcp-servers/{server-name}
# ============================================================================

MCP_SERVER_URL = os.getenv(
    'MCP_SERVER_URL',
    # Fallback for local testing (will not work without valid credentials)
    'https://your-account.snowflakecomputing.com/api/v2/databases/YOUR_DB/schemas/YOUR_SCHEMA/mcp-servers/YOUR_SERVER'
)

MCP_AUTH_TOKEN = os.getenv(
    'MCP_AUTH_TOKEN',
    # Fallback for local testing (will not work without valid token)
    'your_bearer_token_here'
)

# Validate that required environment variables are set
if MCP_SERVER_URL == 'https://your-account.snowflakecomputing.com/api/v2/databases/YOUR_DB/schemas/YOUR_SCHEMA/mcp-servers/YOUR_SERVER':
    logger.warning("⚠️ MCP_SERVER_URL not configured! Please set in .env file")

if MCP_AUTH_TOKEN == 'your_bearer_token_here':
    logger.warning("⚠️ MCP_AUTH_TOKEN not configured! Please set in .env file")


# MCP Tool Names Configuration - these will be discovered dynamically
# Default values (can be overridden by tool discovery)
MCP_SEARCH_TOOL = None          # Tool for document/filing search
MCP_ANALYST_TOOL = None # Tool for data analysis/SQL generation
MCP_SQL_TOOL = None                      # Tool for SQL execution
MCP_AGENT_TOOL = None                 # Tool for agent interactions

# Tool type mappings for discovery
TOOL_TYPE_MAPPINGS = {
    'CORTEX_SEARCH_SERVICE_QUERY': 'search',
    'CORTEX_ANALYST_MESSAGE': 'analyst',
    'SYSTEM_EXECUTE_SQL': 'sql',
    'CORTEX_AGENT_RUN': 'agent'
}

class MCPClient:
    """Lightweight MCP Protocol Client for direct server communication"""
    
    def __init__(self):
        self.base_url = MCP_SERVER_URL
        self.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',  # ← CRITICAL: Enable SSE streaming
            'Authorization': f'Bearer {MCP_AUTH_TOKEN}',
            'Connection': 'keep-alive'
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        # Configure session for long-running requests
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=10,
            pool_maxsize=10,
            max_retries=0,
            pool_block=False
        )
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
    
    def _make_rpc_call(self, method: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Make MCP JSON-RPC call to server"""
        payload = {
            "jsonrpc": "2.0",
            "id": 12345,  # Use a simple integer ID like the working curl example
            "method": method,
            "params": params or {}
        }
        
        try:
            logger.info("=" * 80)
            logger.info(f"📡 MCP RPC CALL: {method}")
            logger.info("=" * 80)
            logger.info(f"🔹 URL: {self.base_url}")
            logger.info(f"🔹 Method: {method}")
            logger.info(f"🔹 Params: {json.dumps(params, indent=2)}")
            logger.info(f"🔹 Full Payload:\n{json.dumps(payload, indent=2)}")
            logger.info(f"🔹 Payload Size: {len(json.dumps(payload))} bytes")
            logger.info(f"🔹 Request Headers: {dict(self.session.headers)}")
            logger.info(f"🔹 Timeout: 120 seconds")
            logger.warning("⚠️ SSL verification is disabled - for testing only!")
            
            import time
            start_time = time.time()
            
            logger.info("🔹 Using stream=True + SSE to keep connection alive during long requests")
            
            response = self.session.post(
                self.base_url, 
                json=payload, 
                stream=True,  # ← CRITICAL: Keep connection alive
                timeout=120,  # High timeout, streaming keeps connection active
                verify=False  # Temporarily disable SSL verification for testing
            )
            
            elapsed_to_headers = time.time() - start_time
            logger.info("-" * 80)
            logger.info(f"📥 RESPONSE HEADERS RECEIVED (after {elapsed_to_headers:.2f}s)")
            logger.info("-" * 80)
            logger.info(f"🔸 Status Code: {response.status_code}")
            logger.info(f"🔸 Status Reason: {response.reason}")
            logger.info(f"🔸 Elapsed Time: {response.elapsed.total_seconds():.2f} seconds")
            
            # Log ALL headers with their exact keys (case-sensitive)
            logger.info(f"🔸 ALL Response Headers (raw):")
            for header_name, header_value in response.headers.items():
                logger.info(f"   {header_name}: {header_value}")
            
            # Check for various request/trace IDs in headers (try different variations)
            possible_id_headers = [
                'x-snowflake-request-id', 'X-Snowflake-Request-Id', 'X-SNOWFLAKE-REQUEST-ID',
                'x-request-id', 'X-Request-Id', 'X-REQUEST-ID',
                'x-trace-id', 'X-Trace-Id', 'X-TRACE-ID',
                'x-correlation-id', 'X-Correlation-Id', 'X-CORRELATION-ID',
                'request-id', 'Request-Id', 'REQUEST-ID',
                'traceparent', 'tracestate'
            ]
            
            found_ids = {}
            for header in possible_id_headers:
                value = response.headers.get(header)
                if value:
                    found_ids[header] = value
            
            if found_ids:
                logger.info(f"🆔 FOUND TRACE/REQUEST IDs:")
                for id_name, id_value in found_ids.items():
                    logger.info(f"   {id_name}: {id_value}")
            else:
                logger.warning("⚠️ NO REQUEST/TRACE IDs FOUND IN HEADERS")
            
            # ⚠️ DO NOT LOG RESPONSE BODY HERE - it will consume the stream!
            # Body will be logged after processing in the streaming section below
            
            # Analyze the timeout
            if response.status_code == 504:
                logger.error("=" * 80)
                logger.error("🚨 GATEWAY TIMEOUT ANALYSIS:")
                logger.error(f"   • Request cut off after {response.elapsed.total_seconds():.2f} seconds")
                logger.error(f"   • Response from: {response.headers.get('Server', 'unknown')}")
                logger.error(f"   • This is a LOAD BALANCER timeout, not an application error")
                logger.error(f"   • The agent is taking too long to respond (>50 seconds)")
                logger.error(f"   • No request ID because request never reached MCP service")
                logger.error("   • RECOMMENDATION: Check agent configuration in Snowflake")
                logger.error("   • The agent may be:")
                logger.error("     - Not properly configured")
                logger.error("     - Timing out internally")
                logger.error("     - Waiting on external dependencies")
                logger.error("     - Running complex queries that take too long")
                logger.error("=" * 80)
            
            logger.info("=" * 80)
            
            if response.status_code == 200:
                # ✅ IMMEDIATELY start processing stream - DON'T read body for logging first!
                logger.info("🔹 Processing response with stream support...")
                body_read_start = time.time()
                
                # Check Content-Type to determine if it's SSE or regular JSON
                content_type = response.headers.get('Content-Type', '')
                logger.info(f"🔹 Content-Type: {content_type}")
                
                if 'text/event-stream' in content_type:
                    # SSE format - process line by line to keep connection alive
                    logger.info("🔹 Detected SSE stream, processing events...")
                    result = None
                    event_count = 0
                    
                    for line in response.iter_lines(decode_unicode=True):
                        if line:
                            line = line.strip()
                            event_count += 1
                            
                            # Look for data lines which contain JSON
                            if line.startswith("data: "):
                                json_data = line[len("data: "):]
                                try:
                                    # Parse the JSON data from SSE
                                    result = json.loads(json_data)
                                    logger.info(f"✅ Parsed SSE data event #{event_count}")
                                    # Log parsed data AFTER reading, not before
                                    logger.debug(f"Parsed data: {json.dumps(result, indent=2)[:500]}...")
                                except json.JSONDecodeError as e:
                                    logger.warning(f"⚠️ Failed to parse SSE data: {e}")
                    
                    body_read_time = time.time() - body_read_start
                    total_time = time.time() - start_time
                    logger.info(f"✅ SSE stream processed ({event_count} events) in {body_read_time:.2f}s (total: {total_time:.2f}s)")
                    
                    if result is None:
                        raise Exception("No valid JSON data found in SSE stream")
                else:
                    # Regular JSON response - only call json() for non-streaming responses
                    logger.info("🔹 Regular JSON response, reading all...")
                    result = response.json()  # ✅ Only call json() here for non-streaming
                    body_read_time = time.time() - body_read_start
                    total_time = time.time() - start_time
                    logger.info(f"✅ JSON response read in {body_read_time:.2f}s (total: {total_time:.2f}s)")
                    # Log the result AFTER reading
                    logger.debug(f"Response data: {json.dumps(result, indent=2)[:500]}...")
                
                # Process the final result
                if 'result' in result:
                    logger.info(f"✅ MCP Call successful: {method}")
                    # Log final result summary
                    logger.info(f"🔸 Result type: {type(result['result'])}")
                    return result['result']
                elif 'error' in result:
                    logger.error(f"❌ MCP Error: {result['error']}")
                    raise Exception(f"MCP Error: {result['error']}")
                else:
                    logger.error(f"❌ Unexpected response format")
                    raise Exception(f"Unexpected response format")
            else:
                logger.error(f"❌ HTTP Error {response.status_code}: {response.text}")
                raise Exception(f"HTTP {response.status_code}: {response.text}")
                
        except requests.RequestException as e:
            logger.error(f"❌ Request failed: {e}")
            raise Exception(f"Request failed: {e}")
    
    def list_tools(self) -> List[Dict[str, Any]]:
        """Get available MCP tools"""
        result = self._make_rpc_call("tools/list")
        return result.get('tools', [])
    
    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call specific MCP tool with arguments"""
        params = {
            "name": tool_name,
            "arguments": arguments
        }
        return self._make_rpc_call("tools/call", params)

def parse_analyst_result(result: Dict[str, Any], query: str) -> Dict[str, Any]:
    """Parse the analyst result to extract SQL and provide formatted output"""
    try:
        # Extract SQL from the analyst result
        sql_statement = None
        if 'content' in result and isinstance(result['content'], list):
            for item in result['content']:
                if item.get('type') == 'text' and 'text' in item:
                    # The text contains JSON with the SQL statement
                    text_content = item['text']
                    try:
                        parsed_json = json.loads(text_content)
                        if 'statement' in parsed_json:
                            sql_statement = parsed_json['statement']
                            break
                    except json.JSONDecodeError:
                        # If not JSON, treat as plain text
                        sql_statement = text_content
        
        if not sql_statement:
            return {
                'type': 'analysis',
                'sql_query': None,
                'explanation': f"Generated analysis for: {query}",
                'executed': False,
                'error': 'No SQL statement found in response'
            }
        
        # Clean up the SQL statement
        sql_statement = sql_statement.strip()
        
        return {
            'type': 'analysis',
            'sql_query': sql_statement,
            'explanation': f"SQL analysis generated by Snowflake Cortex Analyst for: {query}",
            'executed': False,
            'execution_note': 'SQL generated by Cortex Analyst. Execute in Snowflake to get results.',
            'query_type': determine_query_type(sql_statement)
        }
        
    except Exception as e:
        logger.error(f"Error parsing analyst result: {e}")
        return {
            'type': 'analysis',
            'sql_query': str(result),
            'explanation': f"Analysis for: {query}",
            'executed': False,
            'error': str(e)
        }

def determine_query_type(sql: str) -> str:
    """Determine the type of SQL query"""
    sql_lower = sql.lower()
    if 'count(' in sql_lower and 'group by' in sql_lower:
        return 'aggregation'
    elif 'select distinct' in sql_lower:
        return 'distinct'
    elif 'count(' in sql_lower:
        return 'count'
    else:
        return 'select'

def parse_sql_result(result: Dict[str, Any], sql_query: str) -> Dict[str, Any]:
    """Parse SQL execution result to extract data and provide formatted output"""
    try:
        # Extract SQL execution results from Snowflake format
        execution_results = []
        result_metadata = None
        
        if 'content' in result and isinstance(result['content'], list):
            for item in result['content']:
                if item.get('type') == 'text' and 'text' in item:
                    # Parse the nested JSON response from Snowflake
                    text_content = item['text']
                    try:
                        snowflake_response = json.loads(text_content)
                        
                        # Extract result_set from Snowflake response
                        if 'result_set' in snowflake_response:
                            result_set = snowflake_response['result_set']
                            
                            # Get column metadata
                            if 'resultSetMetaData' in result_set and 'rowType' in result_set['resultSetMetaData']:
                                result_metadata = {
                                    'columns': [col['name'] for col in result_set['resultSetMetaData']['rowType']],
                                    'num_rows': result_set['resultSetMetaData'].get('numRows', 0)
                                }
                            
                            # Get data rows
                            if 'data' in result_set and isinstance(result_set['data'], list):
                                # Convert array rows to dictionary format for display
                                if result_metadata and result_metadata['columns']:
                                    for row in result_set['data']:
                                        if isinstance(row, list) and len(row) == len(result_metadata['columns']):
                                            row_dict = {}
                                            for i, col_name in enumerate(result_metadata['columns']):
                                                row_dict[col_name] = row[i] if i < len(row) else None
                                            execution_results.append(row_dict)
                                else:
                                    # Fallback: treat as generic rows
                                    for i, row in enumerate(result_set['data']):
                                        if isinstance(row, list):
                                            row_dict = {f'column_{j}': val for j, val in enumerate(row)}
                                            execution_results.append(row_dict)
                        else:
                            # Fallback: treat entire response as result
                            execution_results.append(snowflake_response)
                            
                    except json.JSONDecodeError:
                        # If not JSON, treat as plain text result
                        execution_results.append({'result': text_content})
        
        return {
            'type': 'sql_execution',
            'sql_query': sql_query,
            'executed': True,
            'execution_results': execution_results,
            'result_metadata': result_metadata,
            'row_count': len(execution_results) if execution_results else 0,
            'execution_note': 'SQL executed successfully via Snowflake MCP server.'
        }
        
    except Exception as e:
        logger.error(f"Error parsing SQL result: {e}")
        return {
            'type': 'sql_execution',
            'sql_query': sql_query,
            'executed': False,
            'error': str(e),
            'execution_results': []
        }

def parse_agent_result(result: Dict[str, Any], message: str) -> Dict[str, Any]:
    """Parse agent result to extract response and provide formatted output"""
    try:
        # Extract agent response
        agent_response = ""
        if 'content' in result and isinstance(result['content'], list):
            for item in result['content']:
                if item.get('type') == 'text' and 'text' in item:
                    agent_response += item['text'] + "\n"
        
        if not agent_response:
            agent_response = str(result)
        
        return {
            'type': 'agent_response',
            'message': message,
            'response': agent_response.strip(),
            'execution_note': 'Response generated by SEC Filing Agent.'
        }
        
    except Exception as e:
        logger.error(f"Error parsing agent result: {e}")
        return {
            'type': 'agent_response',
            'message': message,
            'response': f"Error processing agent response: {str(e)}",
            'error': str(e)
        }


# Global MCP client instance
mcp_client = MCPClient()

@app.route('/')
def index():
    """Main MCP client interface"""
    return render_template('mcp_client.html')

@app.route('/api/tools')
def list_tools():
    """List available MCP tools"""
    try:
        logger.info("📋 Fetching MCP tools list...")
        tools = mcp_client.list_tools()
        
        return jsonify({
            'success': True,
            'tools': tools,
            'count': len(tools),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Error fetching tools: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/tools/discover')
def discover_tools():
    """Discover available tools and map them to client capabilities"""
    try:
        logger.info("🔍 Discovering available MCP tools...")
        tools = mcp_client.list_tools()
        
        # Map tools to capabilities
        tool_capabilities = {
            'search': None,
            'analyst': None,
            'sql': None,
            'agent': None
        }
        
        # Extract tool types from inputSchema if available
        for tool in tools:
            tool_name = tool.get('name', '')
            tool_description = tool.get('description', '')
            
            # Try to determine tool type from inputSchema or description
            input_schema = tool.get('inputSchema', {})
            properties = input_schema.get('properties', {})
            
            # Determine tool type based on properties and description
            if 'query' in properties and 'columns' in properties:
                # Search tool
                tool_capabilities['search'] = {
                    'name': tool_name,
                    'description': tool_description,
                    'type': 'CORTEX_SEARCH_SERVICE_QUERY',
                    'available': True
                }
            elif 'message' in properties and 'semantic' in tool_description.lower():
                # Analyst tool
                tool_capabilities['analyst'] = {
                    'name': tool_name,
                    'description': tool_description,
                    'type': 'CORTEX_ANALYST_MESSAGE',
                    'available': True
                }
            elif 'sql' in properties:
                # SQL execution tool
                tool_capabilities['sql'] = {
                    'name': tool_name,
                    'description': tool_description,
                    'type': 'SYSTEM_EXECUTE_SQL',
                    'available': True
                }
            elif 'text' in properties and ('agent' in tool_description.lower() or 'agent' in tool_name.lower()):
                # Agent tool
                tool_capabilities['agent'] = {
                    'name': tool_name,
                    'description': tool_description,
                    'type': 'CORTEX_AGENT_RUN',
                    'available': True
                }
        
        # Update global tool names
        global MCP_SEARCH_TOOL, MCP_ANALYST_TOOL, MCP_SQL_TOOL, MCP_AGENT_TOOL
        if tool_capabilities['search']:
            MCP_SEARCH_TOOL = tool_capabilities['search']['name']
        if tool_capabilities['analyst']:
            MCP_ANALYST_TOOL = tool_capabilities['analyst']['name']
        if tool_capabilities['sql']:
            MCP_SQL_TOOL = tool_capabilities['sql']['name']
        if tool_capabilities['agent']:
            MCP_AGENT_TOOL = tool_capabilities['agent']['name']
        
        logger.info(f"✅ Tool discovery complete: Search={MCP_SEARCH_TOOL}, Analyst={MCP_ANALYST_TOOL}, SQL={MCP_SQL_TOOL}, Agent={MCP_AGENT_TOOL}")
        
        return jsonify({
            'success': True,
            'capabilities': tool_capabilities,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Error discovering tools: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'capabilities': {
                'search': None,
                'analyst': None,
                'sql': None,
                'agent': None
            },
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/search', methods=['POST'])
def search_documents():
    """Search SEC documents using policy-search tool"""
    try:
        data = request.get_json()
        query = data.get('query', '')
        limit = data.get('limit', 10)
        
        if not query:
            return jsonify({'success': False, 'error': 'Query is required'}), 400
        
        logger.info(f"🔍 Document search: '{query}' (limit: {limit})")
        
        # Call the search tool (configurable)
        result = mcp_client.call_tool(MCP_SEARCH_TOOL, {
            "query": query,
            "limit": limit
        })
        
        # Extract the actual content from MCP result
        documents = []
        if 'content' in result and isinstance(result['content'], list):
            for item in result['content']:
                if item.get('type') == 'text' and 'text' in item:
                    # Try to parse as JSON first (Cortex Search returns JSON structure)
                    try:
                        search_results = json.loads(item['text'])
                        
                        # Handle Cortex Search format with 'results' array
                        if isinstance(search_results, dict) and 'results' in search_results:
                            for result_item in search_results['results']:
                                documents.append({
                                    'CONTEXTUALIZED_CHUNK': result_item.get('CONTEXTUALIZED_CHUNK', result_item.get('text', str(result_item))),
                                    'source': 'cortex_search',
                                    'metadata': result_item
                                })
                        # Handle array of results
                        elif isinstance(search_results, list):
                            for result_item in search_results:
                                if isinstance(result_item, dict):
                                    documents.append({
                                        'CONTEXTUALIZED_CHUNK': result_item.get('CONTEXTUALIZED_CHUNK', result_item.get('text', str(result_item))),
                                        'source': 'cortex_search',
                                        'metadata': result_item
                                    })
                                else:
                                    documents.append({
                                        'CONTEXTUALIZED_CHUNK': str(result_item),
                                        'source': 'cortex_search'
                                    })
                        else:
                            # Single result object
                            documents.append({
                                'CONTEXTUALIZED_CHUNK': str(search_results),
                                'source': 'cortex_search'
                            })
                    except json.JSONDecodeError:
                        # If not JSON, treat as plain text result
                        documents.append({
                            'CONTEXTUALIZED_CHUNK': item['text'],
                            'source': 'text_response'
                        })
        
        logger.info(f"✅ Found {len(documents)} search results")
        
        return jsonify({
            'success': True,
            'results': documents,
            'query': query,
            'tool_used': MCP_SEARCH_TOOL,
            'raw_mcp_response': result,  # Full raw MCP response for debug mode
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Search error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/analyze', methods=['POST'])
def analyze_data():
    """Analyze data using revenue-semantic-view tool"""
    try:
        data = request.get_json()
        message = data.get('message', '')
        
        if not message:
            return jsonify({'success': False, 'error': 'Message is required'}), 400
        
        logger.info(f"📊 Data analysis: '{message}'")
        
        # Call the analyst tool (configurable)
        result = mcp_client.call_tool(MCP_ANALYST_TOOL, {
            "message": message
        })
        
        # Parse the analyst result to extract SQL and execute it
        analysis_result = parse_analyst_result(result, message)
        
        return jsonify({
            'success': True,
            'results': analysis_result,
            'message': message,
            'tool_used': MCP_ANALYST_TOOL,
            'raw_mcp_response': result,  # Full raw MCP response for debug mode
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Analysis error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/execute-sql', methods=['POST'])
def execute_sql():
    """Execute SQL using sql_exec_tool"""
    try:
        data = request.get_json()
        sql_query = data.get('sql', '')
        
        if not sql_query:
            return jsonify({'success': False, 'error': 'SQL query is required'}), 400
        
        logger.info(f"🔧 SQL execution: '{sql_query[:100]}...' ({len(sql_query)} chars)")
        
        # Call the SQL execution tool
        result = mcp_client.call_tool(MCP_SQL_TOOL, {
            "sql": sql_query
        })
        
        # Process SQL execution results
        sql_result = parse_sql_result(result, sql_query)
        
        return jsonify({
            'success': True,
            'results': sql_result,
            'sql_query': sql_query,
            'tool_used': MCP_SQL_TOOL,
            'raw_mcp_response': result,  # Full raw MCP response for debug mode
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ SQL execution error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/agent', methods=['POST'])
def agent_query():
    """Query agent using sec_filing_agent tool"""
    try:
        data = request.get_json()
        message = data.get('message', '')
        
        if not message:
            return jsonify({'success': False, 'error': 'Message is required'}), 400
        
        logger.info(f"🤖 Agent query: '{message}'")
        
        # Call the agent tool (uses 'text' argument, not 'message')
        result = mcp_client.call_tool(MCP_AGENT_TOOL, {
            "text": message
        })
        
        # Process agent results
        agent_result = parse_agent_result(result, message)
        
        return jsonify({
            'success': True,
            'results': agent_result,
            'message': message,
            'tool_used': MCP_AGENT_TOOL,
            'raw_mcp_response': result,  # Full raw MCP response for debug mode
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Agent query error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/status')
def get_status():
    """Get MCP server connection status"""
    try:
        # Test connection by listing tools
        tools = mcp_client.list_tools()
        
        return jsonify({
            'connected': True,
            'server_url': MCP_SERVER_URL,
            'tools_available': len(tools),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'connected': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

if __name__ == '__main__':
    logger.info("🚀 Starting Lightweight MCP Client")
    logger.info(f"📡 Connected to: {MCP_SERVER_URL}")
    
    # Force port 5000 only
    port = 5000
    logger.info(f"🌐 Starting server on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
