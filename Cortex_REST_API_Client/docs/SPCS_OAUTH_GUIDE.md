# SPCS OAuth Authentication Guide

**A practical guide for querying Snowflake data and calling REST APIs from Snowpark Container Services**

---

## Overview

Snowpark Container Services (SPCS) provides **automatic OAuth authentication** for applications running within Snowflake. This enables your containerized applications to securely query Snowflake data and call REST APIs without managing credentials or dealing with IP restrictions.

This guide shows you how to connect to Snowflake from your SPCS containers using Python, Node.js, or any language.

**Benefits of SPCS OAuth:**
- ✅ Automatic token provisioning and refresh
- ✅ No IP restrictions or network policies to configure
- ✅ Uses service identity (more secure than personal credentials)
- ✅ Simplified deployment (no secrets management for auth tokens)
- ✅ Query Snowflake tables, run stored procedures, call Cortex services
- ✅ **PrivateLink transparent**: Works seamlessly with AWS PrivateLink  - no code changes or special configuration needed

---

## How SPCS OAuth Works

When you deploy a service to SPCS, Snowflake automatically provides everything needed for OAuth authentication:

### 1. OAuth Token File

**Location:** `/snowflake/session/token`

SPCS creates this file in every container with a short-lived OAuth token. The token:
- Is scoped to the service's role/identity
- Is automatically refreshed by SPCS
- Works with Snowflake's internal routing (no IP restrictions)

### 2. SNOWFLAKE_HOST Environment Variable

**Environment Variable:** `SNOWFLAKE_HOST`

SPCS injects this variable with the internal routing hostname:
- Example: `sfb89346.va3.us-east-1.aws.snowflakecomputing.com`
- Different from your public account URL
- Routes through Snowflake's internal network
- Required for OAuth tokens to work (provides optimized internal routing)

### 3. PrivateLink Integration (Automatic)

If your Snowflake account uses AWS PrivateLink, `SNOWFLAKE_HOST` automatically handles it. No code changes, no special configuration - just use `SNOWFLAKE_HOST` and OAuth tokens as shown in this guide.

---

## Implementation Pattern

### Step 1: Detect SPCS Environment

Check if you're running in SPCS by looking for the OAuth token file:

**Python:**
```python
import os

SPCS_TOKEN_PATH = '/snowflake/session/token'

def is_running_in_spcs():
    return os.path.exists(SPCS_TOKEN_PATH)
```

**Node.js:**
```javascript
import fs from 'fs';

const SPCS_TOKEN_PATH = '/snowflake/session/token';

function isRunningInSpcs() {
  return fs.existsSync(SPCS_TOKEN_PATH);
}
```

### Step 2: Read the OAuth Token

**Python:**
```python
def get_oauth_token():
    """Read SPCS OAuth token from file"""
    try:
        with open(SPCS_TOKEN_PATH, 'r') as f:
            return f.read().strip()
    except Exception as e:
        raise Exception(f'Failed to read SPCS OAuth token: {e}')
```

**Node.js:**
```javascript
function getOAuthToken() {
  try {
    return fs.readFileSync(SPCS_TOKEN_PATH, 'utf-8').trim();
  } catch (e) {
    throw new Error(`Failed to read SPCS OAuth token: ${e.message}`);
  }
}
```

### Step 3: Get the Correct Base URL

**Python:**
```python
def get_snowflake_base_url():
    """
    Get the correct Snowflake URL for API calls.
    
    SPCS: Uses SNOWFLAKE_HOST for internal routing (required for OAuth)
    Local: Uses standard account URL
    """
    if is_running_in_spcs():
        snowflake_host = os.getenv('SNOWFLAKE_HOST')
        if not snowflake_host:
            raise Exception('SNOWFLAKE_HOST not available in SPCS environment')
        print(f'Using SNOWFLAKE_HOST for internal routing: {snowflake_host}')
        return f'https://{snowflake_host}'
    
    # Local deployment
    account_url = os.getenv('SNOWFLAKE_ACCOUNT_URL')
    if not account_url:
        raise Exception('SNOWFLAKE_ACCOUNT_URL not configured')
    return account_url
```

**Node.js:**
```javascript
function getBaseUrl() {
  // SPCS provides SNOWFLAKE_HOST for internal routing
  if (fs.existsSync(SPCS_TOKEN_PATH) && process.env.SNOWFLAKE_HOST) {
    console.log(`Using SNOWFLAKE_HOST for internal routing: ${process.env.SNOWFLAKE_HOST}`);
    return `https://${process.env.SNOWFLAKE_HOST}`;
  }
  
  // Local deployment uses standard account URL
  return process.env.SNOWFLAKE_ACCOUNT_URL;
}
```

### Step 4: Create Snowflake Connection

For **querying data** (most common use case), use Snowflake Python Connector or Snowpark:

**Python - Snowflake Connector:**
```python
import snowflake.connector

def get_snowflake_connection():
    """Create connection with OAuth in SPCS"""
    if is_running_in_spcs():
        # SPCS mode: OAuth
        return snowflake.connector.connect(
            host=os.getenv('SNOWFLAKE_HOST'),
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            token=get_oauth_token(),
            authenticator='oauth',
            database=os.getenv('SNOWFLAKE_DATABASE'),
            schema=os.getenv('SNOWFLAKE_SCHEMA')
        )
    else:
        # Local mode: username/password
        return snowflake.connector.connect(
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            user=os.getenv('SNOWFLAKE_USER'),
            password=os.getenv('SNOWFLAKE_PASSWORD'),
            database=os.getenv('SNOWFLAKE_DATABASE'),
            schema=os.getenv('SNOWFLAKE_SCHEMA')
        )


# Usage
conn = get_snowflake_connection()
cursor = conn.cursor()
cursor.execute('SELECT * FROM my_table LIMIT 10')
results = cursor.fetchall()
```

**Python - Snowpark Session:**
```python
from snowflake.snowpark import Session

def get_snowpark_session():
    """Create Snowpark session with OAuth"""
    if is_running_in_spcs():
        params = {
            'account': os.getenv('SNOWFLAKE_ACCOUNT'),
            'host': os.getenv('SNOWFLAKE_HOST'),
            'authenticator': 'oauth',
            'token': get_oauth_token(),
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA')
        }
    else:
        params = {
            'account': os.getenv('SNOWFLAKE_ACCOUNT'),
            'user': os.getenv('SNOWFLAKE_USER'),
            'password': os.getenv('SNOWFLAKE_PASSWORD'),
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA')
        }
    
    return Session.builder.configs(params).create()


# Usage
session = get_snowpark_session()
df = session.table('my_table').filter('amount > 1000').collect()
```

For **REST API calls** (Cortex services, SQL API), build auth headers:

**Python:**
```python
def get_rest_auth_headers():
    """Get headers for REST API calls"""
    if is_running_in_spcs():
        return {
            'Authorization': f'Bearer {get_oauth_token()}',
            'X-Snowflake-Authorization-Token-Type': 'OAUTH',
            'Content-Type': 'application/json'
        }
    else:
        return {
            'Authorization': f'Bearer {os.getenv("AUTH_TOKEN")}',
            'Content-Type': 'application/json'
        }
```

### Step 5: Connect to Snowflake and Query Data

The most common use case is querying Snowflake data. Here are three approaches:

#### Option A: Using Snowflake Python Connector (Recommended)

**Python:**
```python
import snowflake.connector
import os

SPCS_TOKEN_PATH = '/snowflake/session/token'

def get_login_token():
    """Read SPCS OAuth token"""
    with open(SPCS_TOKEN_PATH, 'r') as f:
        return f.read().strip()


def get_snowflake_connection():
    """Create Snowflake connection with OAuth in SPCS"""
    if os.path.exists(SPCS_TOKEN_PATH):
        # SPCS mode: Use OAuth
        return snowflake.connector.connect(
            host=os.getenv('SNOWFLAKE_HOST'),
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            token=get_login_token(),
            authenticator='oauth',
            database=os.getenv('SNOWFLAKE_DATABASE'),
            schema=os.getenv('SNOWFLAKE_SCHEMA')
        )
    else:
        # Local mode: Use username/password or PAT
        return snowflake.connector.connect(
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            user=os.getenv('SNOWFLAKE_USER'),
            password=os.getenv('SNOWFLAKE_PASSWORD'),
            database=os.getenv('SNOWFLAKE_DATABASE'),
            schema=os.getenv('SNOWFLAKE_SCHEMA')
        )


# Query Snowflake data
conn = get_snowflake_connection()
cursor = conn.cursor()

try:
    # Execute a query
    cursor.execute("""
        SELECT warehouse_name, SUM(credits_used) as total_credits
        FROM snowflake.account_usage.warehouse_metering_history
        WHERE start_time >= DATEADD('day', -7, CURRENT_DATE)
        GROUP BY warehouse_name
        ORDER BY total_credits DESC
        LIMIT 10
    """)
    
    # Fetch results
    results = cursor.fetchall()
    for row in results:
        print(f'{row[0]}: {row[1]} credits')
        
finally:
    cursor.close()
    conn.close()
```

#### Option B: Using Snowpark Session (Object-Oriented)

**Python:**
```python
from snowflake.snowpark import Session
import os

SPCS_TOKEN_PATH = '/snowflake/session/token'

def get_login_token():
    with open(SPCS_TOKEN_PATH, 'r') as f:
        return f.read().strip()


def get_snowpark_session():
    """Create Snowpark session with OAuth in SPCS"""
    if os.path.exists(SPCS_TOKEN_PATH):
        # SPCS mode
        connection_params = {
            'account': os.getenv('SNOWFLAKE_ACCOUNT'),
            'host': os.getenv('SNOWFLAKE_HOST'),
            'authenticator': 'oauth',
            'token': get_login_token(),
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA')
        }
    else:
        # Local mode
        connection_params = {
            'account': os.getenv('SNOWFLAKE_ACCOUNT'),
            'user': os.getenv('SNOWFLAKE_USER'),
            'password': os.getenv('SNOWFLAKE_PASSWORD'),
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA')
        }
    
    return Session.builder.configs(connection_params).create()


# Query data using Snowpark
session = get_snowpark_session()

# Example 1: SQL query
df = session.sql("""
    SELECT warehouse_name, SUM(credits_used) as total_credits
    FROM snowflake.account_usage.warehouse_metering_history
    WHERE start_time >= DATEADD('day', -7, CURRENT_DATE)
    GROUP BY warehouse_name
    ORDER BY total_credits DESC
    LIMIT 10
""").collect()

for row in df:
    print(f'{row["WAREHOUSE_NAME"]}: {row["TOTAL_CREDITS"]} credits')

# Example 2: DataFrame operations
table_df = session.table('my_database.my_schema.my_table')
filtered_df = table_df.filter(table_df['amount'] > 1000)
results = filtered_df.select('customer_name', 'amount').collect()

for row in results:
    print(f'{row["CUSTOMER_NAME"]}: ${row["AMOUNT"]}')

session.close()
```

#### Option C: Using Snowflake SQL API (Direct REST)

For calling Snowflake SQL API directly via REST (useful for languages without native connectors):

**Python:**
```python
import requests
import time

def execute_sql(sql_statement):
    """Execute SQL using Snowflake SQL API with OAuth"""
    base_url = get_snowflake_base_url()
    headers = get_auth_headers()
    
    # Submit SQL statement
    response = requests.post(
        f'{base_url}/api/v2/statements',
        headers=headers,
        json={
            'statement': sql_statement,
            'timeout': 60,
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA')
        }
    )
    
    if not response.ok:
        raise Exception(f'SQL API error: {response.text}')
    
    result = response.json()
    statement_handle = result['statementHandle']
    
    # Poll for completion
    while result.get('status') not in ['SUCCESS', 'FAILED']:
        time.sleep(0.5)
        response = requests.get(
            f'{base_url}/api/v2/statements/{statement_handle}',
            headers=headers
        )
        result = response.json()
    
    if result['status'] == 'FAILED':
        raise Exception(f"Query failed: {result.get('message')}")
    
    return result['data']


# Query data
rows = execute_sql("""
    SELECT warehouse_name, SUM(credits_used) as total_credits
    FROM snowflake.account_usage.warehouse_metering_history
    WHERE start_time >= DATEADD('day', -7, CURRENT_DATE)
    GROUP BY warehouse_name
    ORDER BY total_credits DESC
    LIMIT 10
""")

for row in rows:
    print(f'{row[0]}: {row[1]} credits')
```

### Step 6: (Optional) Calling Cortex REST APIs

If you also need to call Cortex services via REST API, use the same OAuth pattern:

**Python Example - Cortex Agent:**
```python
def call_cortex_agent(agent_name, prompt, database, schema):
    """Call Cortex Agent REST API"""
    base_url = get_snowflake_base_url()
    headers = get_auth_headers()
    
    url = f'{base_url}/api/v2/databases/{database}/schemas/{schema}/agents/{agent_name}:run'
    
    response = requests.post(url, headers=headers, json={
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt}]}]
    })
    
    if not response.ok:
        raise Exception(f'Agent API {response.status_code}: {response.text}')
    
    return response.text
```

---

## Complete Python Example - Data Querying

Here's a complete working example for a typical Native App use case:

```python
import os
import snowflake.connector

# Constants
SPCS_TOKEN_PATH = '/snowflake/session/token'

def is_running_in_spcs():
    """Check if running in SPCS environment"""
    return os.path.exists(SPCS_TOKEN_PATH)


def get_login_token():
    """Read SPCS OAuth token from file"""
    with open(SPCS_TOKEN_PATH, 'r') as f:
        return f.read().strip()


def get_snowflake_connection():
    """
    Create Snowflake connection with auto-detection of environment.
    
    SPCS: Uses OAuth token with SNOWFLAKE_HOST
    Local: Uses username/password or PAT
    """
    if is_running_in_spcs():
        # SPCS mode: OAuth authentication
        print('[auth] Connecting with SPCS OAuth')
        return snowflake.connector.connect(
            host=os.getenv('SNOWFLAKE_HOST'),
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            token=get_login_token(),
            authenticator='oauth',
            database=os.getenv('SNOWFLAKE_DATABASE', 'MYDB'),
            schema=os.getenv('SNOWFLAKE_SCHEMA', 'PUBLIC')
        )
    else:
        # Local mode: Username/password authentication
        print('[auth] Connecting with username/password')
        return snowflake.connector.connect(
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            user=os.getenv('SNOWFLAKE_USER'),
            password=os.getenv('SNOWFLAKE_PASSWORD'),
            database=os.getenv('SNOWFLAKE_DATABASE', 'MYDB'),
            schema=os.getenv('SNOWFLAKE_SCHEMA', 'PUBLIC')
        )


def query_warehouse_costs():
    """Example: Query warehouse costs from ACCOUNT_USAGE"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                warehouse_name,
                SUM(credits_used) as total_credits,
                COUNT(*) as hours_active
            FROM snowflake.account_usage.warehouse_metering_history
            WHERE start_time >= DATEADD('day', -7, CURRENT_DATE)
            GROUP BY warehouse_name
            ORDER BY total_credits DESC
            LIMIT 10
        """)
        
        results = cursor.fetchall()
        return [
            {
                'warehouse': row[0],
                'credits': float(row[1]),
                'hours': row[2]
            }
            for row in results
        ]
    finally:
        cursor.close()
        conn.close()


def insert_application_log(event_type, message):
    """Example: Insert data into your application's logging table"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO application_logs (event_type, message, timestamp)
            VALUES (%s, %s, CURRENT_TIMESTAMP())
        """, (event_type, message))
        
        print(f'Logged: {event_type} - {message}')
    finally:
        cursor.close()
        conn.close()


def call_stored_procedure():
    """Example: Call a stored procedure"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("CALL my_schema.my_procedure('param1', 'param2')")
        results = cursor.fetchall()
        return results
    finally:
        cursor.close()
        conn.close()


# Example usage
if __name__ == '__main__':
    print('Querying Snowflake from SPCS...')
    
    # Query data
    warehouse_data = query_warehouse_costs()
    for wh in warehouse_data:
        print(f"{wh['warehouse']}: {wh['credits']} credits, {wh['hours']} hours")
    
    # Log activity
    insert_application_log('query_executed', 'Retrieved warehouse costs')
    
    # Call stored procedure
    proc_results = call_stored_procedure()
    print(f'Procedure returned: {proc_results}')
```

---

## Important Implementation Details

### 1. The `X-Snowflake-Authorization-Token-Type` Header

**This header tells Snowflake to validate the token as OAuth:**

```python
headers = {
    'Authorization': f'Bearer {oauth_token}',
    'X-Snowflake-Authorization-Token-Type': 'OAUTH',  # Required for OAuth tokens
    ...
}
```

This header distinguishes OAuth tokens from PAT tokens, ensuring proper validation.

### 2. SNOWFLAKE_HOST vs SNOWFLAKE_ACCOUNT_URL

**Key Concept:** OAuth tokens work with internal routing via `SNOWFLAKE_HOST`.

| Variable | Example | Use Case |
|----------|---------|----------|
| `SNOWFLAKE_ACCOUNT_URL` | `https://xy12345.us-east-1.snowflakecomputing.com` | PAT tokens, external/local access |
| `SNOWFLAKE_HOST` | `https://sfb89346.va3.us-east-1.aws.snowflakecomputing.com` | OAuth tokens, SPCS internal routing |

**Why SNOWFLAKE_HOST?**
- Optimized for service-to-service communication within Snowflake
- Routes through internal infrastructure (faster, more reliable)
- No network egress charges
- Not subject to network policies or IP restrictions
- **Automatically handles PrivateLink routing** if your account uses AWS/Azure/GCP PrivateLink
- This is the standard pattern for all SPCS applications calling Snowflake APIs

### 3. Token Lifecycle

SPCS manages the OAuth token lifecycle automatically:
- Token is created when the service starts
- Token is refreshed periodically by SPCS
- File at `/snowflake/session/token` always contains the current valid token
- Your code simply reads the file when needed (caching for 5 minutes is safe)

### 4. PrivateLink Compatibility

**Good News:** If your Snowflake account uses **AWS PrivateLink** (or Azure Private Link / GCP Private Service Connect), the OAuth pattern described in this guide works **without any changes**.

**How it works:**
- SPCS automatically configures `SNOWFLAKE_HOST` based on your account's connectivity method
- If PrivateLink is enabled, `SNOWFLAKE_HOST` points to your PrivateLink endpoint
- If PrivateLink is not enabled, `SNOWFLAKE_HOST` points to standard internal routing
- **Your code doesn't need to know or care** - just use `SNOWFLAKE_HOST`

**What you DON'T need to do:**
- ❌ Detect PrivateLink configuration
- ❌ Use special PrivateLink hostnames
- ❌ Configure different URLs for PrivateLink vs non-PrivateLink
- ❌ Add PrivateLink-specific authentication

**What you DO:**
- ✅ Use `SNOWFLAKE_HOST` as shown in this guide
- ✅ Use OAuth token from `/snowflake/session/token`
- ✅ Same code works for PrivateLink and non-PrivateLink accounts

**Note:** The Snowflake documentation states "Privatelink hostnames are not supported" in the context of **external access integrations with non-OAuth credentials**. When using the OAuth token method (recommended), PrivateLink is fully supported and transparent.

---

## Common Patterns

### Pattern 1: Connection Manager Class

```python
import snowflake.connector
import os

class SnowflakeConnectionManager:
    """Manages Snowflake connections for both SPCS and local environments"""
    
    SPCS_TOKEN_PATH = '/snowflake/session/token'
    
    def __init__(self):
        self.is_spcs = os.path.exists(self.SPCS_TOKEN_PATH)
        print(f'[connection] Running in {"SPCS" if self.is_spcs else "local"} mode')
    
    def get_connection(self):
        """Get a Snowflake connection based on environment"""
        if self.is_spcs:
            return self._get_spcs_connection()
        else:
            return self._get_local_connection()
    
    def _get_spcs_connection(self):
        """Create SPCS connection with OAuth"""
        with open(self.SPCS_TOKEN_PATH, 'r') as f:
            token = f.read().strip()
        
        return snowflake.connector.connect(
            host=os.getenv('SNOWFLAKE_HOST'),
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            token=token,
            authenticator='oauth',
            database=os.getenv('SNOWFLAKE_DATABASE'),
            schema=os.getenv('SNOWFLAKE_SCHEMA')
        )
    
    def _get_local_connection(self):
        """Create local connection with username/password"""
        return snowflake.connector.connect(
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            user=os.getenv('SNOWFLAKE_USER'),
            password=os.getenv('SNOWFLAKE_PASSWORD'),
            database=os.getenv('SNOWFLAKE_DATABASE'),
            schema=os.getenv('SNOWFLAKE_SCHEMA')
        )
    
    def execute_query(self, sql, params=None):
        """Execute a SQL query and return results"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)
            
            return cursor.fetchall()
        finally:
            cursor.close()
            conn.close()


# Usage
conn_manager = SnowflakeConnectionManager()

# Query data
results = conn_manager.execute_query("""
    SELECT customer_name, SUM(order_amount) as total
    FROM orders
    WHERE order_date >= CURRENT_DATE - 30
    GROUP BY customer_name
    ORDER BY total DESC
    LIMIT 10
""")

for row in results:
    print(f'{row[0]}: ${row[1]}')
```

### Pattern 2: Token Caching (Optional)

```python
import time

class CachedOAuthToken:
    """Cache OAuth token to avoid reading file on every request"""
    
    def __init__(self, token_path='/snowflake/session/token', ttl=300):
        self.token_path = token_path
        self.ttl = ttl  # Time to live in seconds (5 minutes default)
        self._token = None
        self._token_time = 0
    
    def get_token(self):
        """Get cached token or read fresh if expired"""
        now = time.time()
        if self._token is None or (now - self._token_time) > self.ttl:
            with open(self.token_path, 'r') as f:
                self._token = f.read().strip()
            self._token_time = now
            print('[auth] Refreshed OAuth token from file')
        return self._token


# Usage
token_cache = CachedOAuthToken()

def get_auth_headers():
    if is_running_in_spcs():
        return {
            'Authorization': f'Bearer {token_cache.get_token()}',
            'X-Snowflake-Authorization-Token-Type': 'OAUTH',
            'Content-Type': 'application/json'
        }
    # ... fallback to PAT
```

---

## Flask/FastAPI Integration - Web App with Data Queries

For Python web frameworks serving data from Snowflake:

```python
from flask import Flask, request, jsonify
import snowflake.connector
import os

app = Flask(__name__)

# Initialize at startup
SPCS_TOKEN_PATH = '/snowflake/session/token'
IS_SPCS = os.path.exists(SPCS_TOKEN_PATH)

print(f'[server] Running in {"SPCS" if IS_SPCS else "local"} mode')


def get_login_token():
    """Read SPCS OAuth token"""
    with open(SPCS_TOKEN_PATH, 'r') as f:
        return f.read().strip()


def get_snowflake_connection():
    """Factory function to create Snowflake connection"""
    if IS_SPCS:
        # SPCS OAuth mode
        return snowflake.connector.connect(
            host=os.getenv('SNOWFLAKE_HOST'),
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            token=get_login_token(),
            authenticator='oauth',
            database=os.getenv('SNOWFLAKE_DATABASE'),
            schema=os.getenv('SNOWFLAKE_SCHEMA')
        )
    else:
        # Local mode
        return snowflake.connector.connect(
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            user=os.getenv('SNOWFLAKE_USER'),
            password=os.getenv('SNOWFLAKE_PASSWORD'),
            database=os.getenv('SNOWFLAKE_DATABASE'),
            schema=os.getenv('SNOWFLAKE_SCHEMA')
        )


@app.route('/api/customers', methods=['GET'])
def get_customers():
    """Endpoint to retrieve customer data"""
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT customer_id, customer_name, total_orders, total_spent
            FROM customer_summary
            ORDER BY total_spent DESC
            LIMIT 100
        """)
        
        results = cursor.fetchall()
        customers = [
            {
                'id': row[0],
                'name': row[1],
                'orders': row[2],
                'spent': float(row[3])
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({'customers': customers})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/sales', methods=['GET'])
def get_sales_analytics():
    """Endpoint to get sales analytics"""
    period = request.args.get('period', '30')  # days
    
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                DATE_TRUNC('day', order_date) as date,
                COUNT(*) as order_count,
                SUM(order_amount) as total_amount
            FROM orders
            WHERE order_date >= DATEADD('day', -%s, CURRENT_DATE)
            GROUP BY DATE_TRUNC('day', order_date)
            ORDER BY date
        """, (int(period),))
        
        results = cursor.fetchall()
        analytics = [
            {
                'date': str(row[0]),
                'orders': row[1],
                'amount': float(row[2])
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({'analytics': analytics})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint with auth diagnostic"""
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT CURRENT_ROLE(), CURRENT_WAREHOUSE()')
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        
        return jsonify({
            'status': 'healthy',
            'mode': 'SPCS' if IS_SPCS else 'local',
            'role': result[0],
            'warehouse': result[1]
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

---

## Common Questions

### Q: Do I need to refresh the OAuth token?

**A:** No. SPCS automatically refreshes the token and updates `/snowflake/session/token`. Just read it fresh for each API call, or cache it briefly (5 minutes is safe).

### Q: Can I use both OAuth and PAT in the same app?

**A:** Yes! Use the environment detection pattern shown above. Your app will automatically use OAuth when in SPCS and username/password or PAT when running locally.

### Q: What permissions does the OAuth token have?

**A:** The OAuth token authenticates as the **service user** with the **service's owner role**. The service can only access resources that its owner role has been granted access to. This is determined by:
- The role used to create the service or compute pool
- Grants made to that role
- For Native Apps: permissions granted by the app consumer

### Q: Can I use OAuth tokens for regular SQL queries?

**A:** Yes! In fact, this is the most common use case. Use `snowflake.connector` or Snowpark Session with OAuth tokens to:
- Query tables and views
- Insert/update/delete data
- Call stored procedures and functions
- Execute any SQL statement
- Call REST APIs (Cortex services, SQL API, etc.)

### Q: What if SNOWFLAKE_HOST is not set?

**A:** If you're in SPCS and `SNOWFLAKE_HOST` is not available, ensure your service was created with a recent Snowflake version (after April 2025). Older deployments may need to be recreated.

### Q: Does this work with AWS PrivateLink (or Azure/GCP Private Link)?

**A:** Yes! When using OAuth tokens with `SNOWFLAKE_HOST`, PrivateLink is handled automatically by Snowflake. Your code doesn't need to detect or configure anything special for PrivateLink - just follow the standard OAuth pattern in this guide. The `SNOWFLAKE_HOST` value will automatically reflect your account's connectivity method (PrivateLink or standard).

### Q: Can I use this with Snowpark Python?

**A:** Yes! See the "Snowflake SQL API (Alternative Pattern)" section for Snowpark Session examples.

---

## Verification

Add this diagnostic code to your application startup to verify OAuth is working:

```python
import os

def diagnose_spcs_environment():
    """Print diagnostic information about SPCS OAuth setup"""
    print('=' * 60)
    print('SPCS OAuth Diagnostic Check')
    print('=' * 60)
    
    token_exists = os.path.exists('/snowflake/session/token')
    snowflake_host = os.getenv('SNOWFLAKE_HOST')
    
    print(f'✓ OAuth token file exists: {token_exists}')
    print(f'✓ SNOWFLAKE_HOST set: {snowflake_host is not None}')
    
    if snowflake_host:
        print(f'  → SNOWFLAKE_HOST: {snowflake_host}')
    
    if token_exists and snowflake_host:
        print('\n✅ SPCS OAuth authentication ready')
        print('   Will use OAuth token with internal routing')
    elif not token_exists and not snowflake_host:
        print('\n🔵 Local development mode')
        print('   Will use PAT token from AUTH_TOKEN env var')
    else:
        print('\n⚠️  Partial SPCS environment detected')
        print('   Check your SPCS service configuration')
    
    print('=' * 60)


# Call at startup
if __name__ == '__main__':
    diagnose_spcs_environment()
    # ... start your app
```

---

## Environment Variables

Your SPCS service needs these environment variables configured:

**Automatically provided by SPCS:**
- `SNOWFLAKE_HOST` - Internal routing hostname
- OAuth token file at `/snowflake/session/token`

**You must provide via secrets:**
- `SNOWFLAKE_ACCOUNT_URL` - Your account URL (for reference, not used in OAuth mode)
- `AGENT_NAME`, `AGENT_DB`, `AGENT_SCHEMA` - Your Cortex resources
- `WAREHOUSE` - Optional (configure in Agent UI instead)

**NOT needed for SPCS:**
- `AUTH_TOKEN` - Not used in SPCS (OAuth token used instead)

---

## Additional Use Cases

### Calling Snowflake REST APIs

If you need to call Snowflake REST APIs (for Cortex services, etc.), use the same OAuth pattern:

**Python - Generic REST API Helper:**
```python
import requests

def get_rest_auth_headers():
    """Get auth headers for REST API calls"""
    if os.path.exists(SPCS_TOKEN_PATH):
        with open(SPCS_TOKEN_PATH, 'r') as f:
            token = f.read().strip()
        return {
            'Authorization': f'Bearer {token}',
            'X-Snowflake-Authorization-Token-Type': 'OAUTH',
            'Content-Type': 'application/json'
        }
    else:
        return {
            'Authorization': f'Bearer {os.getenv("AUTH_TOKEN")}',
            'Content-Type': 'application/json'
        }


def call_snowflake_rest_api(method, path, body=None):
    """Call Snowflake REST API"""
    if os.path.exists(SPCS_TOKEN_PATH):
        base_url = f"https://{os.getenv('SNOWFLAKE_HOST')}"
    else:
        base_url = os.getenv('SNOWFLAKE_ACCOUNT_URL')
    
    url = f'{base_url}{path}'
    response = requests.request(method, url, headers=get_rest_auth_headers(), json=body)
    return response


# Example: Call Cortex Agent
response = call_snowflake_rest_api(
    'POST',
    '/api/v2/databases/MYDB/schemas/PUBLIC/agents/MY_AGENT:run',
    {'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'Hello'}]}]}
)
```

---

## Testing Locally vs SPCS

### Local Testing

```python
# Set environment variables
os.environ['SNOWFLAKE_ACCOUNT_URL'] = 'https://xy12345.us-east-1.snowflakecomputing.com'
os.environ['AUTH_TOKEN'] = 'your-pat-token-here'
os.environ['AGENT_NAME'] = 'MY_AGENT'
# ... etc

# Run your app
# Should use PAT token mode
```

### SPCS Testing

In SPCS, the environment is set automatically. To verify:

```python
# Add this to your app startup
import os

print('[startup] Environment check:')
print(f'  SNOWFLAKE_HOST: {os.getenv("SNOWFLAKE_HOST", "NOT SET")}')
print(f'  OAuth token file exists: {os.path.exists("/snowflake/session/token")}')
print(f'  Is SPCS: {os.path.exists("/snowflake/session/token")}')

if os.path.exists('/snowflake/session/token'):
    print('[startup] Will use SPCS OAuth authentication')
else:
    print('[startup] Will use PAT token authentication')
```

Check service logs:
```sql
SELECT SYSTEM$GET_SERVICE_LOGS('your_service_name', 0, 'your-container-name', 100);
```

---

## Network Configuration

Configure external access in your SPCS deployment to allow API calls to Snowflake:

```sql
-- Allow outbound HTTPS to Snowflake
-- Use your standard account hostname (PrivateLink is handled automatically via SNOWFLAKE_HOST)
CREATE NETWORK RULE my_app_outbound
  TYPE = 'HOST_PORT'
  MODE = 'EGRESS'
  VALUE_LIST = ('<your-account>.snowflakecomputing.com:443');

-- Example for organization-based account:
-- VALUE_LIST = ('myorg-myaccount.snowflakecomputing.com:443');

CREATE EXTERNAL ACCESS INTEGRATION my_app_external_access
  ALLOWED_NETWORK_RULES = (my_app_outbound)
  ENABLED = TRUE;

-- Reference in your service specification:
-- EXTERNAL_ACCESS_INTEGRATIONS = (my_app_external_access)
```

**PrivateLink Note:** When using OAuth tokens with `SNOWFLAKE_HOST`, you only need to specify your standard account hostname in the network rule. Snowflake automatically routes through PrivateLink if configured. You do **not** need to specify PrivateLink-specific hostnames.

---

## References

- **Snowflake Internal Doc**: "Access Snowflake APIs from SPCS" (if you have access)
- **Official SPCS Docs**: [Snowpark Container Services](https://docs.snowflake.com/en/developer-guide/snowpark-container-services/overview)
- **Cortex Agents REST API**: [API Reference](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run)
- **Our Implementation**: See `backend/server.js` in this repository for working Node.js example

---

## Implementation Checklist

To implement OAuth authentication in your SPCS application:

- ✅ **Detect environment**: Check if `/snowflake/session/token` exists
- ✅ **Read token**: Read OAuth token from the file
- ✅ **Set header**: Add `X-Snowflake-Authorization-Token-Type: OAUTH` to requests
- ✅ **Use internal routing**: Use `SNOWFLAKE_HOST` environment variable for base URL
- ✅ **Configure network access**: Add external access integration to your service spec
- ✅ **Support dual modes**: Fallback to PAT token for local development/testing

**That's it!** With these six steps, your SPCS application can:
- Query Snowflake tables and views
- Execute stored procedures
- Insert/update data
- Call Snowflake REST APIs (optional)

**Works with:**
- ✅ Standard Snowflake accounts
- ✅ AWS PrivateLink-enabled accounts
- ✅ Azure Private Link-enabled accounts
- ✅ GCP Private Service Connect-enabled accounts
- ✅ Snowflake Connector for Python / Snowpark
- ✅ Any Snowflake REST API

No code changes needed for different connectivity methods - `SNOWFLAKE_HOST` and OAuth tokens handle it all automatically!

---

**Questions?** Check the troubleshooting section above or review the working implementation in this repository's `backend/server.js`.

**Last Updated:** November 10, 2025  
**Primary Use Case:** Querying Snowflake data from SPCS Native Apps  
**Also Works With:** Cortex Agents, Cortex Analyst, Cortex Search, SQL API, any Snowflake REST endpoint

