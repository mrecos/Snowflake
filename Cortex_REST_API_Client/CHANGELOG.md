# Changelog — Snowflake Cortex Agent REST API Client

## v3.6 - Storage Controls & SQL Rendering Polish (November 6, 2025)

### Enhancements

**Configurable Conversation Retention:**
- New `maxConversations` and `maxMessagesPerConversation` keys in `config.json`
- Automatically prunes old conversations/messages when limits are exceeded
- Keeps localStorage footprint predictable for long-running demos

**High-Fidelity Agent Responses:**
- Highlight.js syntax highlighting for SQL/code blocks
- Preserves multiline SQL formatting streamed from the agent
- Markdown headings (`#`, `##`, `###`) now render as styled titles (no stray `#`)
- Graceful fallback for non-SQL code blocks

**Data Table Refinements:**
- Reduced font size (12pt) and tighter padding for higher information density
- Soft blue table headers, zebra striping, rounded corners, and subtle borders
- Hover states retained for readability

### Technical Changes

**`app.js`:**
- Buffered streaming renderer combines text chunks before parsing markdown
- New `renderTextBlock`, `renderCodeBlock`, `escapeHtml`, and `dedent` helpers
- Applies highlight.js to SQL code blocks and honours heading markdown
- Respects configurable storage limits when saving conversations

**`index.html`:**
- Loads highlight.js core, SQL language module, and GitHub theme from CDN

**`styles.css`:**
- Added `.code-block` styling and updated `.sql-code-block`
- Refined table typography, zebra striping, and container borders

**`server.js`:**
- Added `/api/app-config` endpoint to merge `.env` agent settings with UI preferences
- Required `AGENT_NAME` env var and centralized loading of `public/config.json`

**`public/config.json`:**
- Now contains UI-only data (branding, presets, storage limits) to avoid duplicating Snowflake identifiers stored in `.env`


## v3.5 - Dynamic Thinking Messages & Enter Key (November 5, 2025)

### Enhancements

**Dynamic Thinking Indicator:**
- Rotating progress messages that change every 8 seconds
- 8 different messages: "Agent is thinking", "Analyzing your request", "Querying Snowflake", "Building SQL queries", "Executing queries, hold tight", "Processing results", "Gathering insights", "Almost there"
- Smooth fade transitions (500ms) between messages
- Reduces anxiety during long-running queries
- Auto-cycles through messages until response received
- Proper cleanup (no memory leaks)

**Keyboard Shortcut:**
- Press **Enter** to submit question (standard chat behavior)
- **Shift+Enter** for new line in textarea
- Faster workflow, no mouse needed

### Technical Changes

**`app.js`:**
- Added `thinkingMessages` array (8 messages)
- Added `thinkingMessageInterval` for rotation
- Updated `showThinkingIndicator()` with setInterval and fade logic
- Updated `hideThinkingIndicator()` to clear interval
- Added Enter key event listener on prompt textarea

**`styles.css`:**
- Added `#thinkingText` transition for smooth opacity changes

---

## v3.4 - Final Detail Polish (November 5, 2025)

### Improvements

**Larger App Title:**
- Branding text increased from 16pt → 18pt
- More prominent and easier to read
- Increased bottom margin (8px → 16px)

**Subdued Debug Info:**
- "Show Raw JSON" made much less prominent
- Font: 14pt bold → 12pt normal
- Opacity: 100% → 60% (reveals on hover)
- Background: Light gray box → transparent
- Doesn't compete with main content

**Better Thread Indicator:**
- Replaced confusing "Thread 0" with useful info
- Shows: "X messages • Y turns" (e.g., "4 messages • 2 turns")
- Turn = one Q&A exchange (more intuitive)

**Optimized Table Display:**
- Table data: 16pt → 14pt (better density)
- Padding reduced (12px → 10px)
- More information visible per screen

**Table Scroll Indicators:**
- Visible scrollbar (8px height, styled)
- Subtle shadow hint on right edge
- Clear indication of horizontal scroll

### Technical Changes

**`styles.css`:**
- `.sidebar-branding`: 16pt → 18pt
- `summary`: completely redesigned (subtle, transparent)
- `table td`: 14pt with reduced padding
- Added scrollbar styling (`::-webkit-scrollbar`)
- Added shadow hint on tables

**`app.js`:**
- Updated `updateThreadIndicator()` to show message/turn count

---

## v3.3 - Configurable Branding & Enhanced Feedback (November 5, 2025)

### Major Features

**Configurable App Title:**
- New `appTitle` field in `config.json`
- Customize branding: e.g., "Acme Corp<br>AI Assistant"
- HTML allowed (use `<br>` for line breaks)
- Perfect for white-labeling and customer deployments
- Default: "Cortex Agent<br>REST API"

**Animated Thinking Indicator:**
- Shows "Agent is thinking..." with animated pulsing dots
- Three blue dots pulse in sequence
- Appears while processing, disappears when done
- Styled to match agent message bubbles

**Wider Sidebar:**
- Width: 280px → 320px
- Prevents text truncation
- Conversation titles now wrap instead of cutting off

**Enhanced Conversation Items:**
- Text wraps on multiple lines
- Subtle gray background for each item
- Visible border on hover and when active
- 8px spacing between items
- Limited to **5 most recent conversations** displayed

**Agent Text Size:**
- Reduced from 18pt → 16pt
- More comfortable reading
- Better balance with UI

**Wider Main Content:**
- Horizontal padding: 120px → 100px
- Max-width: 1400px → 1600px
- More breathing room for content

### Technical Changes

**`config.json`:**
- Added `appTitle` property

**`index.html`:**
- Logo replaced with `<div id="appBranding">`

**`app.js`:**
- Added `showThinkingIndicator()` and `hideThinkingIndicator()`
- Updated `loadConfig()` to set app title from config
- Updated `renderConversationHistory()` to limit to 5 items
- Integrated thinking indicator in send flow

**`styles.css`:**
- Sidebar: 280px → 320px
- Added `.sidebar-branding` styles
- Added `.thinking-indicator` with animated dots
- Added `@keyframes thinking-pulse`
- Updated `.conversation-item` with wrapping, backgrounds, borders
- `.message-content`: 18pt → 16pt
- `.main-content`: wider padding and max-width

**New File:**
- `docs/CONFIG_CUSTOMIZATION.md` - Complete customization guide

---

## v3.2 - Professional Polish (November 5, 2025)

### Improvements

**Enhanced Status Indicator:**
- Added "Status:" prefix for clarity
- Success state in green (#22C55E, bold)
- Top-right fixed position badge

**Redesigned Sidebar:**
- Width: 240px → 280px
- Section headers: 14pt Mid-Blue, ALL CAPS
- Navigation items: 16pt (larger, easier to read)
- Active conversation: Bold black text on light gray

**New Chat Button:**
- Clean style: `+ New Chat`
- Blue + icon (24pt Snowflake Blue)
- Text: 16pt Medium Gray
- Transparent background, hover effect

**Verify Agent Button:**
- Ghost button style (blue outline, transparent)
- Stands out from other buttons
- Hover: light blue tint

**Inline Send Button:**
- Moved inside textarea (bottom-right corner)
- 48x48px square with arrow icon (➤)
- Saves vertical space
- Modern chat interface pattern

**Input Styling:**
- Border-radius: 8px → 12px (more inviting)
- Focus: Blue glow effect
- Better placeholder text

**Message Bubbles:**
- Agent messages: enhanced border and background
- Tables: Better overflow handling, bold warehouse names
- Lists: Bold text for key items

### Technical Changes

**`styles.css`:**
- Updated `.status-indicator` and `.status-text`
- Added `.new-chat` button style with `::before` for + icon
- Added `.ghost` button style
- Redesigned `.btn.primary` as absolute positioned
- Added `.input-wrapper` for relative positioning
- Updated `.message-agent .message-bubble` with border
- Enhanced table and list content styles

**`index.html`:**
- Added "Status:" prefix
- New Chat: `class="btn new-chat"`
- Verify Agent: `class="btn ghost"`
- Wrapped textarea and button in `.input-wrapper`

**`app.js`:**
- Status updates now add `.connected` class
- Button state uses opacity instead of innerHTML
- Updated status messages throughout

---

## v3.1 - All-White Minimalist UI (November 5, 2025)

### Complete Design Overhaul

**Philosophy:** Clean, airy interface inspired by Snowflake Intelligence with extreme white space and strategic blue accents.

**All-White Backgrounds:**
- Entire interface uses white (#FFFFFF) backgrounds
- Sidebar, header, main content - everything white
- No colored background panels

**Strategic Blue Accents:**
- Snowflake Blue (#29B5E8) used ONLY for text accents
- Primary accent: H2 welcome message
- Send button, scroll button, message borders
- NOT used for backgrounds

**Extreme White Space:**
- Main content: 80px vertical, 120px horizontal padding
- Generous spacing between all elements
- 32px between messages
- Creates "airy, breathable" feel

**Welcome Section:**
- Dynamic greeting: "Good morning/afternoon/evening"
- H1: 26pt Bold Black (greeting)
- H2: 44pt Bold Snowflake Blue ("What insights can I help with?")
- Shows when no messages, hides when conversation starts

**Flat Design:**
- No border-radius on most elements
- No box-shadows
- Sharp corners
- Clean, modern appearance

### Layout Changes

**Before:** Blue header + blue sidebar + white main content

**After:** No header, white sidebar, white main content

**Header Removed:**
- Logo and title moved to sidebar top
- Status indicator moved to fixed top-right position

**Sidebar Redesign:**
- White background with 1px subtle border
- 240px width
- Logo at top (32px)
- Text-based navigation

**Main Content:**
- White background
- 80px/120px padding
- Max-width 1400px, centered
- Welcome section visible initially

### Technical Changes

**`styles.css`:**
- Complete rewrite (~500 lines)
- All backgrounds to white
- Updated typography (44pt, 26pt, 18pt)
- Flat design (removed shadows, border-radius)
- Added welcome section styles
- Updated message bubble styles

**`index.html`:**
- Removed `<header class="app-header">`
- Added status indicator (fixed position)
- Restructured sidebar
- Added welcome section
- Semantic HTML5 structure

**`app.js`:**
- Added `updateWelcomeGreeting()` function
- Updated `createNewConversation()` to show welcome
- Updated `displayConversationMessages()` to toggle welcome/chat
- Dynamic greeting based on time of day

---

## v3.0 - Snowflake Brand Guidelines (November 5, 2025)

### Strict Brand Compliance

**Color Palette:**
- Primary: Snowflake Blue (#29B5E8)
- Mid-Blue: #11567F
- Black: #000000
- Medium Gray: #5B5B5B
- White: #FFFFFF
- Removed: All secondary colors (orange, purple, pink)

**Typography:**
- Font: Arial, sans-serif (throughout)
- App Title: 44pt Bold
- Section Titles: 26pt Bold
- Body Text: 18pt Regular
- Line height: 1.15
- Paragraph spacing: 10pt after

**Accessibility:**
- All text high contrast (WCAG AA/AAA)
- No white text on light backgrounds
- Snowflake Blue only for text ≥28pt
- Clear visual hierarchy

### Design Changes

**Blue Header:**
- Full-width Snowflake Blue background
- "CORTEX AI DEMO" title (44pt Bold White)
- Colorstack style (mix of white and black letters)

**Blue Sidebar:**
- Snowflake Blue background
- White text throughout
- Section titles in white
- Buttons with white borders

**Main Content:**
- White background
- Black section titles (26pt Bold)
- Medium Gray body text (18pt)
- Tables: Blue headers, gray data

### Technical Changes

**`styles.css`:**
- Complete CSS rewrite
- CSS custom properties for colors
- Arial font throughout
- Proper typography hierarchy
- High contrast color pairings

**`index.html`:**
- Added blue header with title
- Updated sidebar structure
- Updated button classes

---

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

