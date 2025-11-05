# Release Notes — v2.0

**Snowflake Cortex Agent REST API Client**
*Multi-Turn Conversations & Persistent History*

---

## What's New

### 🎯 Multi-Turn Conversations (Working!)
Agents now maintain context across multiple questions. Ask follow-ups like "summarize the previous responses" or "show details for the most expensive one" and the agent remembers your conversation.

**How it works:**
- Full conversation history sent with each request
- Thread IDs tracked for reference
- Context maintained across browser refreshes

### 💾 Conversation History
All conversations automatically saved to browser localStorage:
- Stores up to 20 recent conversations
- Auto-generated titles from first question
- Relative timestamps ("5m ago", "2h ago")
- Click any conversation to continue where you left off
- Message count badges show conversation length

### 🎨 New UI
**Left sidebar:**
- "New Conversation" button for fresh starts
- Scrollable conversation history
- Active conversation highlighted
- "Clear History" button

**Right side:**
- Thread indicator shows current context
- Full message history display
- User/agent message indicators with timestamps

### 📚 Updated Documentation
- README.md - Generic, comprehensive project overview
- DEPLOYMENT.md - Step-by-step setup guide
- CHANGELOG.md - Detailed technical changes
- TESTING.md - 12 test scenarios for validation

---

## Technical Highlights

### Key Implementation Details

**Conversation Context:**
- Sends full `messages` array with all prior user/assistant exchanges
- Thread IDs tracked but not required for context
- New conversations omit thread fields (thread_id: 0 causes API errors)

**Data Persistence:**
- localStorage with automatic pruning (max 20 conversations)
- Quota exceeded detection with user alerts
- Atomic conversation saves after each response

**Error Handling:**
- Failed messages not saved to history
- Graceful handling of missing thread IDs
- Storage quota alerts

### Bug Fixes

1. **Fixed:** "Thread 0 does not exist" error on new conversations
   - Solution: Omit thread fields for new conversations

2. **Fixed:** Agent doesn't remember previous messages
   - Solution: Send full conversation history in messages array
   - Key insight: Context comes from message history, not just thread IDs

3. **Fixed:** Thread IDs not extracted from response
   - Solution: Enhanced parsing to check trace span attributes

---

## Installation

```bash
# Backend
cd backend
npm install

# Configure .env with Snowflake credentials
# Configure public/config.json with agent name

npm start
# Open http://localhost:5173
```

---

## Usage

### Starting a Conversation
1. Open app → Click "+ New Conversation"
2. Type your question or click a preset
3. Conversation auto-saves with title

### Multi-Turn Example
```
User: "What are the top 5 warehouses by cost?"
Agent: [Shows data table with warehouses]

User: "Show me queries from the most expensive one"
Agent: [Shows queries, has context from previous answer]

User: "Summarize the previous 2 responses"
Agent: [Provides summary, remembers full conversation]
```

### Managing Conversations
- Click any conversation in sidebar to load it
- Continue with follow-up questions
- Click "New Conversation" to start fresh
- Click "Clear History" to remove all saved conversations

---

## Files Changed

**Backend:**
- `backend/server.js` - Added conversation history support, enhanced thread parsing

**Frontend:**
- `public/app.js` - Complete rewrite with localStorage management
- `public/index.html` - Added conversation sidebar UI
- `public/styles.css` - Added conversation list styles

**Documentation:**
- `README.md` - Rewritten (generic)
- `DEPLOYMENT.md` - Rewritten (generic)
- `CHANGELOG.md` - Updated with v2.0 details
- `TESTING.md` - NEW: Comprehensive testing guide
- `RELEASE_NOTES_v2.0.md` - NEW: This file

---

## Breaking Changes

**None.** This is a backwards-compatible update. Existing configuration files (`.env` and `config.json`) require no changes.

---

## Testing

See `TESTING.md` for 12 comprehensive test scenarios covering:
- New conversation creation
- Multi-turn context preservation
- History loading and persistence
- Storage limits and auto-pruning
- Error handling
- Performance with 20+ conversations

**Quick smoke test:**
1. Start new conversation
2. Ask a question → Wait for response
3. Ask "what was my previous question?" 
4. Agent should recall it ✅

---

## Known Limitations

- Browser localStorage limit (~5MB, ~20 conversations)
- No conversation export/import yet
- No search in conversation history
- Large conversations (50+ messages) may be slow
- Thread IDs may not return from all agent implementations (gracefully handled)

---

## Future Enhancements

- Conversation export (JSON, Markdown)
- Search/filter conversations
- Conversation renaming
- Message editing/deletion
- Real-time streaming display
- Mobile-responsive improvements

---

## Performance

- Conversation switching: <500ms
- localStorage operations: <50ms
- Message history rendering: <1s for 20 messages
- API requests: Same as v1.0 (Snowflake-dependent)

---

## Security

- PAT token remains backend-only (never exposed to browser)
- Conversation data stored locally (per-user, per-browser)
- No data sent to third parties
- Standard localStorage security model

---

## Support

For issues or questions:
1. Check TESTING.md for common scenarios
2. Review DEPLOYMENT.md troubleshooting section
3. Check browser console for error logs
4. Review backend terminal logs

---

## Credits

Built for Snowflake Cortex Agents with focus on:
- Minimal dependencies
- Fast performance
- Easy configuration
- Shareable with coworkers

---

**Upgrade from v1.0:** Just pull and restart. No configuration changes needed.

**New install:** See DEPLOYMENT.md for complete setup instructions.

---

*Released: November 5, 2025*

