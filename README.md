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

Run it directly from GitHub using **Bun** (no installation required):

```bash
# Open current directory
bunx github:Nachx639/termide

# Open a specific project
bunx github:Nachx639/termide ./my-project
```

## 🛠 Installation

### Global Installation (from GitHub)
To use the `termide` command anywhere:

```bash
bun install -g github:Nachx639/termide
```

> **Note**: Once published to NPM, you'll be able to just use `bunx termide`.

### For Developers (Local Link)
If you are working on the code and want to use your local version globally:

```bash
# Inside the termide folder
bun link
# Now you can use 'termide' anywhere!
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
