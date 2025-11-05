# Release Notes - v3.5

## Snowflake Cortex Agent REST API Client
**Version:** 3.5  
**Release Date:** November 5, 2025  
**Type:** Major UI Overhaul & Feature Release

---

## 🎨 What's New

### Dynamic Thinking Messages
The thinking indicator now shows **rotating progress messages** to keep you engaged during longer queries:

```
0s  → "Agent is thinking..."
8s  → "Analyzing your request..."
16s → "Querying Snowflake..."
24s → "Building SQL queries..."
32s → "Executing queries, hold tight..."
40s → "Processing results..."
48s → "Gathering insights..."
56s → "Almost there..."
```

- Messages change every 8 seconds
- Smooth fade transitions
- Reduces perceived wait time
- Automatically stops when response arrives

### Keyboard Shortcuts
Standard chat interface behavior:
- **Press Enter** to submit your question
- **Press Shift+Enter** to add a new line

No more clicking the send button!

### Configurable Branding
Customize the app for any customer or deployment:

```json
{
  "appTitle": "Your Company<br>AI Assistant"
}
```

Perfect for white-labeling and customer-specific deployments.

---

## 🎯 Complete UI Redesign

### All-White Minimalist Design
Inspired by Snowflake Intelligence, the new design is:
- **Clean** - All-white backgrounds throughout
- **Airy** - Generous white space (80px/120px padding)
- **Modern** - Flat design with strategic blue accents
- **Focused** - Snowflake Blue used only for key accents

### Welcome Experience
When you first open the app, you'll see:
- Dynamic greeting: "Good morning", "Good afternoon", or "Good evening"
- Prominent question: "What insights can I help with?" (in Snowflake Blue)
- Clean, inviting interface

### Enhanced Sidebar
- **320px width** - Conversation titles don't get cut off
- **Text wrapping** - See full conversation titles
- **5 most recent** - Focused on what matters
- **Subtle backgrounds** - Each conversation in its own box
- **Custom branding** - Your company name instead of logo

### Better Status Indicator
- Shows "Status: **Connected**" in success green
- Top-right fixed position
- Always visible

### Improved Tables
- **Smaller text** (14pt) - More data visible
- **Visible scrollbar** - You know it scrolls
- **Shadow hint** - Indicates more columns to the right
- **Better overflow** - No more cut-off content

### Thread Indicator
Instead of confusing "Thread 0", you now see:
- "2 messages • 1 turn"
- "4 messages • 2 turns"
- "6 messages • 3 turns"

(A turn = one question + one answer)

---

## 🎁 What You'll Love

### For End Users
1. **More engaging** - Dynamic messages during waits
2. **Faster** - Enter key to send (no mouse needed)
3. **Cleaner** - All-white design reduces visual noise
4. **Spacious** - Wide content area, generous padding
5. **Clear** - Better status, better indicators

### For Administrators
1. **White labeling** - Customize app title for customers
2. **Professional** - Modern, minimalist design
3. **Configurable** - Easy customization via config.json
4. **Documented** - Complete customization guide included

### For Developers
1. **Clean code** - Well-organized, documented
2. **No framework** - Pure vanilla JavaScript
3. **Maintainable** - CSS variables, clear structure
4. **Extensible** - Easy to customize further

---

## 📋 Version Progression

This release represents the culmination of 5 iterative improvements:

**v3.0** → Brand guidelines (colors, typography)  
**v3.1** → All-white minimalist design  
**v3.2** → Professional polish (ghost buttons, inline send)  
**v3.3** → Configurable branding & thinking indicator  
**v3.4** → Final details (table scrolls, status colors)  
**v3.5** → Dynamic messages & keyboard shortcuts  

---

## 🚀 Getting Started

### First Time Setup

1. **Configure backend** (one time):
```bash
cd backend
cp .env.example .env
# Edit .env with your Snowflake credentials
npm install
```

2. **Configure frontend**:
```bash
# Edit public/config.json
{
  "appTitle": "Your Company<br>AI Assistant",
  "agentName": "YOUR_AGENT_NAME",
  ...
}
```

3. **Start the server**:
```bash
cd backend
npm start
```

4. **Open in browser**:
```
http://localhost:5173
```

5. **Start chatting**:
- Type your question
- Press **Enter** to send
- Watch the dynamic thinking messages
- See results in clean, airy interface

---

## 🔧 Customization

### Change App Title
Edit `public/config.json`:
```json
{
  "appTitle": "Acme Corp<br>Data Portal"
}
```

### Modify Thinking Messages
Edit `public/app.js`:
```javascript
const thinkingMessages = [
  'Agent is thinking',
  'Your custom message',
  ...
];
```

### Adjust Message Timing
Edit `public/app.js`:
```javascript
}, 8000);  // Change from 8000ms (8s) to desired interval
```

See `CONFIG_CUSTOMIZATION.md` for complete guide.

---

## 📊 Technical Details

### What Changed
- **3 files modified:** config.json, index.html, app.js
- **1 file rewritten:** styles.css (~833 lines)
- **2 docs added:** CONFIG_CUSTOMIZATION.md, RELEASE_NOTES_v3.5.md
- **1 doc updated:** README.md, CHANGELOG.md

### Performance
- Minimal JavaScript (one 8-second interval)
- GPU-accelerated CSS transitions
- No framework overhead
- Clean, efficient code

### Browser Support
- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Mobile browsers (iOS 14+, Android 88+)

---

## 🐛 Bug Fixes

- Fixed: Thread indicator always showed "Thread 0"
- Fixed: Table text too large (18pt → 14pt)
- Fixed: Conversation titles truncated (sidebar now 320px)
- Fixed: "Show Raw JSON" too prominent (now subtle)
- Fixed: No indication tables scroll horizontally
- Fixed: Status text not color-coded

---

## ⚡ Known Issues

None! This is a stable release.

---

## 📖 Documentation

**New Documentation:**
- `CONFIG_CUSTOMIZATION.md` - Complete customization guide
- `UI_REFINEMENTS_v3.1-v3.5_SUMMARY.md` - Technical details for each version

**Updated Documentation:**
- `README.md` - Reflects all v3.5 features
- `CHANGELOG.md` - Complete version history
- `DEPLOYMENT.md` - Setup instructions (unchanged)

---

## 🎓 Tips & Tricks

### Keyboard Shortcuts
- **Enter** - Send message
- **Shift+Enter** - New line in textarea
- **Click conversation** - Switch to that chat

### Quick Actions
- **"+ New Chat"** - Start fresh conversation
- **Preset buttons** - Click for pre-configured questions
- **"Verify Agent"** - Test agent connection
- **"Show Raw JSON"** - Debug response (hover to reveal)

### Best Practices
1. Use short, clear questions
2. Review previous conversation context
3. Let thinking messages reassure you during long queries
4. Check status indicator if something seems stuck

---

## 🤝 Feedback

This is a demo project for Snowflake Cortex Agents. Customize as needed for your use case.

**Suggestions?**
- Modify the code directly
- See customization docs
- Adapt to your workflow

---

## 🎉 Thank You

Enjoy the new clean, modern interface with dynamic feedback!

**Questions? Check these docs:**
- `README.md` - Overview and architecture
- `DEPLOYMENT.md` - Setup guide
- `CONFIG_CUSTOMIZATION.md` - Customization options
- `CHANGELOG.md` - Version history

---

**Version:** 3.5  
**Released:** November 5, 2025  
**Next Steps:** Open http://localhost:5173 and try it out!

