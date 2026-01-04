# Termide Automation Instructions

## Screen Layout
- **Left side**: Claude Code terminal (this session)
- **Right side**: Termide application window

## Coordinates Reference (based on screen resolution ~2880x1800)
- **Right terminal (Termide) safe click area**: (2537, 623)
- **Agent Panel input area**: (2537, 623) - same as above when Agent Panel is open
- **File viewer area**: approximately (1650, 320) - DO NOT click here for Agent Panel
- **Left terminal (Claude Code)**: x < 1400 - AVOID clicking here

## Important: Double Click Safety Protocol
When interacting with Termide from another terminal, you need TWO SEPARATE double-clicks:

### Step 1: Focus the Terminal window (2 clicks)
```bash
peekaboo click --coords 2537,623 && sleep 0.3 && peekaboo click --coords 2537,623
```

### Step 2: Focus the Agent Panel input (2 more clicks)
```bash
peekaboo click --coords 2537,623 && sleep 0.3 && peekaboo click --coords 2537,623
```

### Full sequence for sending a message:
```bash
# First double-click: focus terminal
peekaboo click --coords 2537,623 && sleep 0.3 && peekaboo click --coords 2537,623 && sleep 0.3 && \
# Second double-click: focus agent input
peekaboo click --coords 2537,623 && sleep 0.3 && peekaboo click --coords 2537,623 && sleep 0.3 && \
# Type and send
peekaboo type "message" && sleep 0.3 && peekaboo press return
```

**Why 4 clicks total?**
1. First 2 clicks: Ensures Terminal.app window is focused
2. Second 2 clicks: Ensures the Agent Panel input box receives focus

## Starting Termide
```bash
cd ~/Projects/termide && bun run dev
```

## Stopping Termide
**IMPORTANT**: Press Ctrl+C TWICE to properly close Termide:
```bash
peekaboo hotkey "ctrl,c" && sleep 0.5 && peekaboo hotkey "ctrl,c"
```

## Opening Agent Panel
After Termide is running:
```bash
peekaboo hotkey "ctrl,space"
```

## Selecting Claude (Antigravity)
1. Press Down arrow to navigate to "Claude (Antigravity)"
2. Press Enter to select
3. Select model from list
4. Press Enter to connect

```bash
peekaboo press down && sleep 0.2 && peekaboo press return
# Wait for model selector
sleep 1
peekaboo press return  # Select first model
```

## Sending a test message
After connecting to agent:
```bash
# Two clicks to focus Agent Panel
peekaboo click --coords 1950,550 && sleep 0.3 && peekaboo click --coords 1950,550
# Type message
peekaboo type "Your message here"
# Send
peekaboo press return
```

## Taking Screenshots
```bash
peekaboo image --mode screen --path /tmp/screenshot.png
```

## Peekaboo Commands Reference

### Click
```bash
peekaboo click --coords x,y
peekaboo click --coords x,y --double  # Double click
```

### Type
```bash
peekaboo type "text to type"
```

### Key Press
```bash
peekaboo press return
peekaboo press down
peekaboo press up
peekaboo press escape
```

### Hotkey Combinations
```bash
peekaboo hotkey "ctrl,c"
peekaboo hotkey "ctrl,space"
peekaboo hotkey "cmd,c"
```

### Screenshot
```bash
peekaboo image --mode screen --path /tmp/filename.png
```
