# Release Notes — v2.1

**Snowflake Cortex Agent REST API Client**
*Chat-Style UI Improvement*

---

## What's New

### 🎨 Chat-Style Message Display

The conversation interface now displays messages like a real chat application (ChatGPT, Claude, etc.) instead of showing only the latest response.

**Key improvements:**
- **User messages** appear on the right with light blue background
- **Agent messages** appear on the left with white background
- **All messages stay visible** with scrolling - no more lost context!
- **Instant feedback** - Your message appears immediately while agent processes
- **Auto-scroll** to latest message with smooth animation
- **Scroll button** appears when you scroll up to help navigate back to bottom

### Visual Experience

**Before (v2.0):**
Only the latest response was visible. Had to reload conversation from sidebar to see previous messages.

**After (v2.1):**
```
┌─────────────────────────────┐
│                             │
│      You asked this         │
│   ┌──────────────────┐      │
│   │ Question 1       │      │
│   └──────────────────┘      │
│                             │
│ Agent responded             │
│ ┌──────────────────┐        │
│ │ Answer with      │        │
│ │ [Data Table]     │        │
│ └──────────────────┘        │
│                             │
│      You asked follow-up    │
│   ┌──────────────────┐      │
│   │ Question 2       │      │
│   └──────────────────┘      │
│                        ↓    │
└─────────────────────────────┘
```

---

## Features

### Message Bubbles
- Clean card-style design
- Role indicators (👤 You / 🤖 Agent)
- Timestamps on each message
- Full rendering: tables, charts, markdown all preserved

### Smart Scrolling
- Auto-scrolls to new messages
- Scroll-to-bottom button when you scroll up
- Smooth animations
- Detects if you're already at bottom

### Instant Feedback
- Your message shows immediately when you click Send
- No waiting for agent to see your question
- Better perceived performance

---

## Technical Details

**New Functions:**
- `appendUserMessage()` - Adds user message bubble
- `appendAssistantMessage()` - Adds agent message bubble
- `renderMessageContent()` - Renders into target element
- `scrollToBottom()` - Auto-scroll with animation
- `isAtBottom()` - Scroll position detection
- `updateScrollButton()` - Show/hide scroll button

**Modified Functions:**
- `displayConversationMessages()` - Uses append pattern
- Send handler - Shows user message immediately

**New Styles:**
- `.message-container`, `.message-user`, `.message-agent`
- `.message-bubble`, `.message-header`, `.message-content`
- `.scroll-to-bottom` button

**Files Changed:**
- `public/app.js` - Chat UI functions and rendering logic
- `public/styles.css` - Message bubble styles
- `public/index.html` - Scroll button element
- `README.md` - Updated UI description
- `CHANGELOG.md` - v2.1 documentation

---

## Upgrade from v2.0

**No configuration changes needed!**

Just pull and refresh your browser:
```bash
git pull
# Refresh browser at http://localhost:5173
```

All existing conversations will display in the new chat format automatically.

---

## Benefits

1. **Context always visible** - See the full conversation flow
2. **Industry standard UX** - Familiar chat interface pattern
3. **Better engagement** - Instant feedback makes it feel faster
4. **Easy navigation** - Scroll through history, jump to bottom
5. **Professional look** - Clean, modern message bubbles

---

## Compatibility

- ✅ All v2.0 features preserved
- ✅ Conversation history works the same
- ✅ Multi-turn conversations unchanged
- ✅ No breaking changes
- ✅ Works with existing localStorage data

---

## Known Limitations

- Same as v2.0 (max 20 conversations, ~5MB localStorage)
- Very long conversations (50+ messages) may be slow to load

---

## Next Steps

Future improvements we're considering:
- Collapsible message sections for very long responses
- Message editing/deletion
- Conversation export with formatted messages
- Mobile-responsive message bubbles

---

*Released: November 5, 2025*

**Version History:**
- v2.1 - Chat-style UI (current)
- v2.0 - Multi-turn conversations & history
- v1.0 - Initial release

