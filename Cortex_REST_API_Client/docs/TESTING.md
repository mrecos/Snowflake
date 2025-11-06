# Testing Guide — Multi-Turn Conversations & History

This guide helps you verify all new features are working correctly.

---

## Prerequisites

1. Backend server running: `cd backend && npm start`
2. Browser open to: `http://localhost:5173`
3. Valid agent configured in `public/config.json`
4. Snowflake credentials in `backend/.env`

---

## Test 1: New Conversation Creation

**Steps:**
1. Open the application
2. Check sidebar shows "No saved conversations" (if first run)
3. Note the thread indicator shows "New conversation"
4. Click any preset button or type a question
5. Click "Send"

**Expected results:**
- ✅ Status changes to yellow (Running)
- ✅ Response displays when complete
- ✅ Thread indicator updates to show thread ID (e.g., "Thread 12345 • 2 message(s)")
- ✅ Conversation appears in sidebar with auto-generated title
- ✅ Conversation shows "Just now" timestamp
- ✅ Message count badge shows "2" (user + assistant)

**Console logs to check:**
```
[run] Thread: 0, Parent: 0
[run] Returned thread: 12345, parent: 67890
[storage] Saved conversation: conv_...
```

---

## Test 2: Multi-Turn Conversation

**Steps:**
1. After completing Test 1, type a follow-up question
2. Click "Send"
3. Observe the response

**Expected results:**
- ✅ Thread indicator shows same thread ID with incremented message count
- ✅ Agent response shows context awareness from previous message
- ✅ Conversation in sidebar updates timestamp to "Just now"
- ✅ Message count badge increments (now shows "4")
- ✅ Sidebar conversation stays highlighted (active)

**Console logs to check:**
```
[run] Thread: 12345, Parent: 67890
[run] Returned thread: 12345, parent: 67891
[storage] Saved conversation: conv_...
```

---

## Test 3: Conversation History Loading

**Steps:**
1. Click "+ New Conversation" button
2. Ask a different question
3. Wait for response
4. Click the first conversation in sidebar (from Test 1)

**Expected results:**
- ✅ Full message history loads in response area
- ✅ Shows all user and agent messages with timestamps
- ✅ Each message has role indicator (👤 You / 🤖 Agent)
- ✅ Thread indicator updates to show loaded conversation's thread
- ✅ Clicked conversation highlighted in sidebar
- ✅ Can continue this conversation with follow-ups

---

## Test 4: New Conversation Button

**Steps:**
1. While in an existing conversation, click "+ New Conversation"

**Expected results:**
- ✅ Response area clears and shows "Ready. Ask a question..."
- ✅ Thread indicator shows "New conversation"
- ✅ No conversation highlighted in sidebar
- ✅ Can start fresh conversation without context

---

## Test 5: Conversation Persistence

**Steps:**
1. Create 2-3 conversations with different questions
2. Refresh the browser (F5)

**Expected results:**
- ✅ All conversations still appear in sidebar
- ✅ Most recent conversation loads automatically
- ✅ Can click and load any conversation
- ✅ All message history preserved
- ✅ Thread IDs maintained

**Browser DevTools check:**
1. Press F12 → Application tab → Local Storage → `http://localhost:5173`
2. Should see keys:
   - `snowsage_conversation_list`
   - `snowsage_conversation_conv_...` (one per conversation)

---

## Test 6: Clear History

**Steps:**
1. Click "Clear History" button
2. Confirm in dialog

**Expected results:**
- ✅ All conversations removed from sidebar
- ✅ Shows "No saved conversations"
- ✅ New conversation created automatically
- ✅ localStorage cleared (check in DevTools)

---

## Test 7: Storage Limits

**Steps:**
1. Create 21+ conversations (can use preset buttons for speed)

**Expected results:**
- ✅ Sidebar shows maximum 20 conversations
- ✅ Oldest conversation(s) automatically removed
- ✅ No errors in console
- ✅ New conversations save successfully

---

## Test 8: Auto-Generated Titles

**Steps:**
1. Create new conversation
2. Ask a long question (>50 characters): "What are the top 10 warehouses by credit consumption in the last 30 days sorted by total cost?"

**Expected results:**
- ✅ Sidebar shows truncated title with "..." (50 chars max)
- ✅ Title is readable and descriptive
- ✅ Full question visible in message history

---

## Test 9: Relative Timestamps

**Steps:**
1. Create several conversations
2. Wait 1-2 minutes
3. Observe sidebar timestamps

**Expected results:**
- ✅ Recent: "Just now"
- ✅ <60 min: "5m ago", "30m ago"
- ✅ <24 hrs: "2h ago", "8h ago"
- ✅ >24 hrs: "3d ago" or date

---

## Test 10: Response Rendering in History

**Steps:**
1. Ask a question that returns a data table (e.g., "Top 5 warehouses by cost")
2. Ask a follow-up question
3. Click the conversation to reload it

**Expected results:**
- ✅ Both messages display correctly
- ✅ Tables render with proper styling
- ✅ Charts render (if applicable)
- ✅ Markdown formatting preserved
- ✅ Raw JSON available in debug section

---

## Test 11: Error Handling

**Steps:**
1. Start new conversation
2. Type a question
3. Stop backend server (Ctrl+C)
4. Click "Send"

**Expected results:**
- ✅ Error message displays
- ✅ Status indicator turns red
- ✅ User message NOT saved to conversation (removed on error)
- ✅ Button re-enabled after error

**Then:**
1. Restart server
2. Retry same question

**Expected results:**
- ✅ Works normally
- ✅ Message now saved to conversation

---

## Test 12: Thread Indicator Accuracy

**Steps:**
1. Create new conversation → Should show "New conversation"
2. Send first message → Should show "Thread {id} • 2 message(s)"
3. Send follow-up → Should show "Thread {id} • 4 message(s)"
4. Switch to different conversation → Thread ID and count update
5. Click "+ New Conversation" → Shows "New conversation" again

**Expected results:**
- ✅ Thread ID consistent within conversation
- ✅ Message count accurate
- ✅ Updates immediately after each action

---

## Browser Compatibility

Test in multiple browsers:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari

**Expected:**
- All features work identically
- localStorage persists across sessions
- No console errors

---

## Performance Tests

### Large Conversation
1. Create conversation with 10+ back-and-forth messages
2. Load it from sidebar

**Expected:**
- ✅ Loads within 1 second
- ✅ All messages render correctly
- ✅ No performance issues scrolling

### Multiple Conversations
1. Create 20 conversations
2. Switch between them rapidly

**Expected:**
- ✅ Smooth switching (<500ms per load)
- ✅ No memory leaks
- ✅ Sidebar remains responsive

---

## Troubleshooting

### Conversations not saving
- Check browser console for quota errors
- Try clearing localStorage and starting fresh
- Verify browser allows localStorage (not in private/incognito)

### Thread IDs not updating
- Check backend console logs for thread extraction
- Verify Snowflake API returns thread metadata
- Some agents may not support threading (gracefully handles null)

### Sidebar empty after refresh
- Check localStorage in DevTools
- Verify no JavaScript errors blocking load
- Check `snowsage_conversation_list` key exists

### Messages not displaying
- Check raw JSON in debug section
- Verify event structure matches expected format
- Check browser console for render errors

---

## Success Criteria

All tests passing means:
- ✅ Multi-turn conversations work end-to-end
- ✅ Thread context maintained across messages
- ✅ Conversations persist in localStorage
- ✅ UI renders history correctly
- ✅ New/clear conversation functions work
- ✅ Auto-pruning prevents storage overflow
- ✅ Timestamps and metadata accurate
- ✅ Error handling prevents data corruption
- ✅ Performance acceptable with 20 conversations

---

## Reporting Issues

If any test fails:

1. **Check console logs** (both browser and backend)
2. **Verify configuration** (`.env` and `config.json`)
3. **Check localStorage** (DevTools → Application → Local Storage)
4. **Test in fresh browser profile** (rules out extension conflicts)
5. **Document reproduction steps** (what you did, what happened, what you expected)

---

## Next Steps

After all tests pass:
- Customize presets for your use case
- Share with coworkers (they just need to edit `config.json`)
- Monitor conversation storage usage
- Consider implementing export/import if needed

