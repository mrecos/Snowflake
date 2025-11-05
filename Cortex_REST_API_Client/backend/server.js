import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('../public'));

const REQUIRED_ENV = [
  'SNOWFLAKE_ACCOUNT_URL',
  'AGENT_DB',
  'AGENT_SCHEMA',
  'WAREHOUSE',
  'AUTH_TOKEN'  // PAT (Personal Access Token) from Snowflake
];

app.get('/api/health', (_req, res) => {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  res.json({ 
    ok: missing.length === 0, 
    missing,
    config: {
      account: process.env.SNOWFLAKE_ACCOUNT_URL,
      database: process.env.AGENT_DB,
      schema: process.env.AGENT_SCHEMA,
      warehouse: process.env.WAREHOUSE,
      has_token: !!process.env.AUTH_TOKEN
    }
  });
});

// Verify agent exists
app.get('/api/agent/:name/describe', async (req, res) => {
  try {
    const { name } = req.params;
    const path = `/api/v2/databases/${process.env.AGENT_DB}/schemas/${process.env.AGENT_SCHEMA}/agents/${name}`;
    const result = await sfFetch(path, 'GET');
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Simple helper to call Snowflake REST API
async function sfFetch(path, method = 'GET', body) {
  const url = `${process.env.SNOWFLAKE_ACCOUNT_URL}${path}`;
  console.log(`[sfFetch] ${method} ${url}`);
  const resp = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await resp.text();
  console.log(`[sfFetch] Response ${resp.status}: ${text.substring(0, 200)}`);
  if (!resp.ok) {
    throw new Error(`Snowflake API ${resp.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

// Run endpoint — uses agent:run API (streaming, per docs)
app.post('/api/agent/:name/run', async (req, res) => {
  try {
    const { name } = req.params;
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'Prompt required' });
    }

    console.log(`[run] Calling agent:run for ${name}`);

    // Use the agent:run endpoint (note the colon!)
    // Ref: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run
    const runPath = `/api/v2/databases/${process.env.AGENT_DB}/schemas/${process.env.AGENT_SCHEMA}/agents/${name}:run`;
    const url = `${process.env.SNOWFLAKE_ACCOUNT_URL}${runPath}`;
    
    console.log(`[run] POST ${url}`);

    const requestBody = {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[run] Error ${response.status}: ${text}`);
      throw new Error(`Agent API ${response.status}: ${text}`);
    }

    // Parse the streaming response
    const text = await response.text();
    console.log(`[run] Response received (${text.length} chars)`);

    // Parse server-sent events
    const events = text.split('\n\n').filter(e => e.trim());
    const parsedEvents = [];
    
    for (const event of events) {
      const lines = event.split('\n');
      const dataLine = lines.find(l => l.startsWith('data: '));
      if (dataLine) {
        try {
          const jsonStr = dataLine.substring(6); // Remove 'data: ' prefix
          parsedEvents.push(JSON.parse(jsonStr));
        } catch (e) {
          console.log(`[run] Could not parse event: ${dataLine.substring(0, 100)}`);
        }
      }
    }

    console.log(`[run] Parsed ${parsedEvents.length} events`);

    res.json({
      ok: true,
      events: parsedEvents,
      raw_length: text.length
    });
  } catch (e) {
    console.error(`[run] Error: ${e.message}`);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  // Make auth/config status obvious at startup
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] config status: missing env = ${missing.length ? missing.join(', ') : 'none'}`);
});


