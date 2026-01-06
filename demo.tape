
Output assets/demo.gif
Set FontSize 14
Set Width 1200
Set Height 700
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms
Set Padding 20

# Start termide in the current directory
Type "bunx termide"
Enter
Sleep 2s

# Show the interface
Sleep 1s

# Navigate file tree
Type "j"
Sleep 300ms
Type "j"
Sleep 300ms
Type "j"
Sleep 300ms
Enter
Sleep 1s

# Open fuzzy finder
Ctrl+p
Sleep 500ms
Type "README"
Sleep 500ms
Enter
Sleep 1s

# Show command palette
Ctrl+k
Sleep 1s
Escape
Sleep 500ms

# Switch to terminal
Tab
Tab
Sleep 500ms

# Type in terminal
Type "echo 'Hello from termide! 🐜'"
Enter
Sleep 1s

# Focus mode
Ctrl+f
Sleep 1s
Ctrl+f
Sleep 500ms

# Quit
Ctrl+q
Sleep 500ms
