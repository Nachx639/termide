<p align="center">
  <img src="assets/logo.png" width="200" />
</p>

<h1 align="center">termide</h1>

<p align="center">
  <strong>Minimalist & Elegant Terminal-First IDE</strong>
</p>

---

**termide** is a minimalist and elegant Terminal-first IDE designed for the modern developer. 

The name is a playful fusion of **Terminal** and **IDE**, with a nod to the industrious **termite**—building complex structures from the ground up, bit by bit.

## 🚀 Quick Start

You don't need to clone the repo to try it out. Run it directly with **Bun**:

```bash
# Open current directory
bunx termide

# Open a specific project
bunx termide ./my-project
```

## 🛠 Installation

### Global Installation
To have it always available as a system command:

```bash
bun install -g termide
# Then, just run:
termide
```

### Project Installation
If you prefer to have it as a development tool in your project:

```bash
bun add -d termide
```
Then add this to your `package.json`:
```json
"scripts": {
  "ide": "termide ."
}
```

## ⌨️ Keyboard Shortcuts (Cheat Sheet)

Navigate like a pro in the terminal:

| Key | Action |
| :--- | :--- |
| `Tab` | Switch between panels (Tree, Editor, Terminal) |
| `Shift + Tab` | Switch panel (backward) |
| `1` | Focus **File Tree** |
| `2` | Focus **Code Viewer** |
| `3` | Focus **Terminal** |
| `↑ / ↓` | Navigate tree or scroll through code |
| `Enter` | Open selected file |
| `Ctrl + Q` | Quit termide |

## 🛠 Local Development

If you want to contribute or modify the code:

1. Clone the repo.
2. Install dependencies: `bun install`
3. Run in dev mode: `bun run dev`

---

*Built with ❤️ for the terminal lovers.*
