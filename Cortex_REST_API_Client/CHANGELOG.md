# Changelog — Snowflake Cortex Agent REST API Client

## v2.1 - Chat-Style UI (November 2025)

### Major UI Improvement

**Problem:** In v2.0, only the latest response was visible. Users couldn't see the conversation flow or previous context without switching to conversation history view.

**Solution:** Implemented chat-style message display similar to ChatGPT/Claude with left/right aligned message bubbles.

#### Features Added

**Chat-Style Message Display:**
- ✅ User messages right-aligned with light blue background (#e8f5fb)
- ✅ Agent messages left-aligned with white background
- ✅ All messages remain visible with scrolling (no replacement)
- ✅ Message bubbles with timestamps and role indicators (👤 You / 🤖 Agent)
- ✅ Full rendering preserved (tables, charts, markdown in all messages)
- ✅ Auto-scroll to bottom on new messages
- ✅ Scroll-to-bottom button (appears when scrolled up)

**Instant Feedback:**
- User messages appear immediately when sent (no waiting for agent)
- Smooth scroll animations
- Better visual conversation flow

### Technical Changes

**Frontend (`app.js`):**
- New: `appendUserMessage()` - Adds right-aligned user message bubble
- New: `appendAssistantMessage()` - Adds left-aligned agent message bubble
- New: `renderMessageContent()` - Renders content into target element
- New: `scrollToBottom()` - Auto-scroll with smooth animation
- New: `isAtBottom()` - Detect scroll position
- New: `updateScrollButton()` - Show/hide scroll button
- Modified: `displayConversationMessages()` - Uses append functions instead of replacing
- Modified: Send handler - Shows user message immediately, appends agent response

**Styles (`styles.css`):**
- Added `.message-container`, `.message-user`, `.message-agent` for alignment
- Added `.message-bubble` for card-style messages
- Added `.message-header` and `.message-content` styling
- Added `.scroll-to-bottom` floating button
- Updated `.response-container` with smooth scrolling

**UI (`index.html`):**
- Added scroll-to-bottom button element

### User Experience

**Before (v2.0):**
```
┌─────────────────────────┐
│ Response                │
├─────────────────────────┤
│ [Latest response only]  │
│                         │
│ Previous messages       │
│ not visible             │
└─────────────────────────┘
```

**After (v2.1):**
```
┌─────────────────────────┐
│ Response                │
├─────────────────────────┤
│   👤 You • 2m ago       │
│   ┌──────────────────┐  │
│   │ Question 1       │  │
│   └──────────────────┘  │
│                         │
│ 🤖 Agent • 2m ago       │
│ ┌──────────────────┐    │
│ │ Answer 1 [table] │    │
│ └──────────────────┘    │
│                         │
│   👤 You • Just now     │
│   ┌──────────────────┐  │
│   │ Follow-up Q      │  │
│   └──────────────────┘  │
│                    ↓    │
└─────────────────────────┘
```

### Benefits

1. **Context always visible** - See full conversation at a glance
2. **Natural flow** - Industry-standard chat interface pattern
3. **Instant feedback** - User messages appear immediately
4. **Easy navigation** - Scroll through history, jump to bottom
5. **Clear distinction** - Visual separation between user/agent messages

---

## v2.0 - Multi-Turn Conversations & History (November 2025)

### Major Features Added

#### 1. **Multi-Turn Conversation Support**
- ✅ Thread tracking with `thread_id` and `parent_message_id`
- ✅ Backend accepts and forwards thread IDs to Snowflake API
- ✅ Backend extracts returned thread IDs from response events
- ✅ Frontend maintains conversation context across messages
- ✅ Visual thread indicator showing thread ID and message count

**Implementation details:**
- Backend: Modified `/api/agent/:name/run` endpoint to accept `thread_id`, `parent_message_id`, and `conversation_history`
- Backend: Sends **full conversation history** in messages array for proper context (key insight!)
- Backend: Parses trace data to extract thread IDs from Snowflake response
- Backend: Omits thread fields for new conversations (thread_id: 0 causes API error)
- Frontend: Builds complete message history array for each request
- Frontend: Extracts text from assistant events for conversation context
- Frontend: Updates conversation state with returned IDs for reference

**Key insight:** Snowflake agents maintain context through the full `messages` array, not just thread IDs. Each request must include all previous user/assistant messages for the agent to "remember" prior interactions.

#### 2. **localStorage Conversation History**
- ✅ Conversations persist across browser sessions
- ✅ Automatic saving after each agent response
- ✅ Maximum 20 conversations (auto-prunes oldest)
- ✅ Storage quota handling with user alerts
- ✅ Conversation metadata tracking (created_at, updated_at, message count)

**Storage structure:**
```javascript
{
  id: 'conv_1699...',
  thread_id: 12345,
  parent_message_id: 67890,
  title: 'What are the top 5 warehouses...',
  messages: [
    { role: 'user', content: '...', timestamp: '...' },
    { role: 'assistant', events: [...], timestamp: '...' }
  ],
  created_at: '2025-11-05T10:30:00Z',
  updated_at: '2025-11-05T10:35:00Z'
}
```

**localStorage keys:**
- `snowsage_conversation_list` - Array of conversation IDs (ordered by recency)
- `snowsage_conversation_{id}` - Individual conversation data

#### 3. **Conversation History UI**
- ✅ Sidebar showing recent conversations (most recent first)
- ✅ Click to load and continue any previous conversation
- ✅ Active conversation highlighted
- ✅ Auto-generated titles from first message (50 chars)
- ✅ Relative timestamps ("5m ago", "2h ago", "3d ago")
- ✅ Message count badges
- ✅ Empty state message when no conversations exist

**New UI elements:**
- "New Conversation" button (starts fresh thread)
- "Clear History" button (removes all saved conversations)
- Conversation list with hover states
- Thread indicator (shows current thread ID and message count)
- Message history display with user/agent icons and timestamps

#### 4. **Updated Documentation**
- ✅ README.md rewritten to be generic (removed housekeeping agent references)
- ✅ DEPLOYMENT.md updated with generic setup instructions
- ✅ Detailed conversation history and multi-turn sections added
- ✅ localStorage management explained
- ✅ Architecture diagrams updated

### Technical Changes

**Backend (`server.js`):**
- Added `thread_id`, `parent_message_id`, and `conversation_history` to request body parsing
- Constructs full messages array including conversation history for context
- Enhanced event parsing to extract thread metadata from trace spans
- Omits thread_id/parent_message_id for new conversations (avoids 401 error)
- Added console logging for thread tracking and history length
- Returns thread IDs in response JSON

**Frontend (`app.js`):**
- Complete rewrite with conversation state management
- localStorage utilities (load, save, list, delete)
- Conversation switching and history rendering
- Title generation from first message
- Timestamp formatting (relative times)
- Message display with role indicators
- Thread indicator updates
- Quota exceeded handling
- **New:** `extractTextFromEvents()` helper to build conversation history
- **New:** Sends full conversation history with each request

**UI (`index.html`):**
- Added conversation history sidebar
- Added "New Conversation" button
- Added "Clear History" button
- Added thread indicator near prompt input
- Restructured left sidebar with Conversations section

**Styles (`styles.css`):**
- Added `.conversation-list` styles
- Added `.conversation-item` styles (default, hover, active)
- Added `.conversation-item-title` (truncated text)
- Added `.conversation-item-meta` (date and count)
- Added `.conversation-item-count` badge styles
- Added empty state CSS (when no conversations)

### Features Summary

| Feature | Status | Details |
|---------|--------|---------|
| Thread tracking | ✅ | thread_id, parent_message_id sent/received |
| Conversation persistence | ✅ | localStorage with 20 conversation limit |
| Conversation history UI | ✅ | Sidebar with clickable items |
| New conversation | ✅ | Button to start fresh thread |
| Continue conversation | ✅ | Click any saved conversation |
| Clear history | ✅ | Button with confirmation dialog |
| Auto-generated titles | ✅ | From first 50 chars of first message |
| Relative timestamps | ✅ | "5m ago", "2h ago", etc. |
| Message count badges | ✅ | Shows number of messages per conversation |
| Thread indicator | ✅ | Shows current thread ID and count |
| Storage quota handling | ✅ | Alert when localStorage full |
| Message history display | ✅ | Shows all messages in conversation |

### Usage

**Starting a new conversation:**
1. Click "+ New Conversation" button
2. Ask your question
3. Conversation auto-saved with title from first message

**Continuing a conversation:**
1. Click any conversation in sidebar
2. View full message history
3. Ask follow-up questions with context

**Managing history:**
- Recent conversations shown in sidebar (max 20)
- Oldest conversations auto-deleted when limit reached
- "Clear History" removes all saved conversations

**Multi-turn example:**
```javascript
// First message
User: "What are the top 5 warehouses by cost?"
→ thread_id: 0, parent_message_id: 0
← thread_id: 12345, parent_message_id: 67890

// Follow-up message
User: "Show me the queries from the most expensive one"
→ thread_id: 12345, parent_message_id: 67890
← thread_id: 12345, parent_message_id: 67891
// Agent has context from previous message
```

### Breaking Changes

None. This is a backwards-compatible update. Existing functionality remains unchanged.

### Migration Notes

- No migration required
- Existing users will see empty conversation history on first load
- New conversations automatically save to localStorage
- No changes needed to backend `.env` or `public/config.json`

### Testing Checklist

- [x] New conversation creates fresh thread (thread_id: 0)
- [x] Follow-up questions include thread context
- [x] Conversations save to localStorage after responses
- [x] Conversation history renders in sidebar
- [x] Clicking conversation loads full history
- [x] Active conversation highlighted in sidebar
- [x] "New Conversation" button starts fresh thread
- [x] "Clear History" removes all conversations
- [x] Storage quota exceeded shows alert
- [x] Max 20 conversations enforced (oldest pruned)
- [x] Titles generated from first message
- [x] Timestamps show relative times
- [x] Message count badges display correctly
- [x] Thread indicator updates on state changes
- [x] No linter errors

### Implementation Notes & Lessons Learned

**Issue 1: thread_id: 0 causes 401 error**
- **Problem:** Sending `thread_id: 0` for new conversations returned error 399509: "Thread 0 does not exist"
- **Solution:** Omit thread_id and parent_message_id fields entirely for new conversations
- **Implementation:** Only include thread fields when `thread_id > 0`

**Issue 2: Agent doesn't maintain context across turns**
- **Problem:** Agent responded "no previous conversation" even after multiple messages
- **Root cause:** Thread IDs alone don't provide context; Snowflake agents need full message history
- **Solution:** Send complete `messages` array with all prior user/assistant messages
- **Key learning:** Context comes from message history, not thread IDs (thread IDs are for tracking only)

**Issue 3: Thread IDs not in expected response location**
- **Problem:** `thread_id` and `parent_message_id` returned as `null` in top-level response
- **Discovery:** Thread IDs embedded in trace span attributes deep in event array
- **Solution:** Enhanced parsing to check multiple locations:
  1. Top-level response fields (standard)
  2. Metadata events (some implementations)
  3. Trace span attributes (AgentV2RequestResponseInfo)
  4. Assistant message objects

**How Context Works:**
```javascript
// First message
Request: { messages: [{ role: "user", content: "Question 1" }] }

// Second message (with context)
Request: { 
  messages: [
    { role: "user", content: "Question 1" },
    { role: "assistant", content: "Answer 1..." },
    { role: "user", content: "Question 2" }
  ],
  thread_id: 12345,  // Optional, for tracking
  parent_message_id: 67890
}
```

### Known Issues / Future Work

- Thread IDs may not be returned by all agent implementations (gracefully handles null)
- Conversation export/import not yet implemented
- No search functionality in conversation history
- Message editing/deletion not supported
- No conversation renaming (auto-generated titles only)
- Charts in message history may need re-rendering optimization
- Large conversation histories (50+ messages) may slow down API calls

### References

- Cortex Agents Run API: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run
- localStorage API: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- Server-sent events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

---

## v1.0 - MVP Complete (October 2025)

Initial release with:
- Express proxy for Snowflake REST API
- Static web UI with SnowSage branding
- Agent verification endpoint
- Single-message agent:run implementation
- Server-sent event parsing
- Formatted text rendering (markdown)
- Data table rendering (Analyst result_sets)
- Interactive Vega-Lite charts (orange bars, tooltips)
- Raw JSON debug view
- Status indicators (green/yellow/red)
- Configurable presets in config.json
- PAT token authentication

