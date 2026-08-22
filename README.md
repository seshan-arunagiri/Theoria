# Theoria  -  Prompt Refiner

![Version](https://img.shields.io/badge/version-0.2.0-blue)
![VS Code](https://img.shields.io/badge/vscode-%5E1.80.0-007ACC)
![License](https://img.shields.io/badge/license-MIT-green)

> AI-powered prompt refinement tool. Select text, click, get a better prompt instantly.

A VS Code extension that helps you write better AI prompts. Theoria analyses your prompt locally using a heuristic scoring engine, and optionally sends it to an AI model via [OpenRouter](https://openrouter.ai) to return a refined version with an explanation and quality score.

---

## Demo

<!-- TODO: Add a GIF or screenshot here showing the sidebar in action -->

---

## Features

- **Local scoring engine**  -  works entirely offline, no API key required
- **AI refinement**  -  connects to OpenRouter to rewrite and score your prompt
- **4 refinement modes**  -  Optimize, Explain, Generate Code, Documentation
- **Editor integration**  -  right-click context menu, keyboard shortcut, status bar item
- **History**  -  the last 20 refinements are stored in VS Code global state
- **Quick-start templates**  -  pre-written prompts for common tasks

---

## Commands

| Command | Title | Where it appears |
|---|---|---|
| `theoria.refinePrompt` | Refine Prompt | Command Palette · Keyboard shortcut (`Ctrl+Shift+T` / `Cmd+Shift+T`) |
| `theoria.refineSelection` | Refine Selected Text | Right-click context menu (only shown when text is selected) · Command Palette |
| `theoria.openPanel` | Open Theoria Panel | Editor title bar (wand icon) · Status bar item · Command Palette |

**Keyboard shortcut:** `Ctrl+Shift+T` (Windows/Linux) · `Cmd+Shift+T` (macOS)  -  triggers `theoria.refinePrompt`.

All three commands pre-fill the sidebar with the currently selected editor text (if any) and focus the Theoria sidebar view.

---

## Refinement Modes

| Mode | What it does |
|---|---|
| `optimize` | Rewrites the prompt for clarity, specificity, and better AI response quality |
| `explain` | Breaks down what the prompt is asking and explains how an AI will interpret it |
| `generate` | Reframes the prompt toward code generation, adding relevant technical context |
| `documentation` | Shapes the prompt for producing developer-facing documentation output |

---

## Local Scoring Engine (`scoring.ts`)

Theoria ships a deterministic, regex-free heuristic analyser that scores any prompt out of **100** across five dimensions. This runs locally  -  no network call, no API key needed.

| Dimension | Max | What earns full marks |
|---|---|---|
| **Clarity** | 20 | 15+ words describing the full goal |
| **Context** | 20 | Mentions a tech stack, language, or framework |
| **Structure** | 20 | Starts with an action verb, is a question, or has 2+ sentences |
| **Intent** | 20 | States an expected outcome (`so that`, `should`, `must`, etc.) |
| **Constraints** | 20 | Includes non-functional requirements or a role assignment |

When a dimension is not satisfied, the engine returns a human-readable `feedback` string explaining exactly what to add.

**Fallback behaviour:** When no API key is configured, `extension.ts` calls `analyzePrompt()` directly and returns the local score as the result. The refined prompt is returned unchanged, and the explanation note tells you to add an API key. This means Theoria is always functional for scoring and feedback even without any external service.

---

## Setup

### Option 1  -  VS Code Settings (recommended)

1. Open **Settings** (`Ctrl+,`) and search for `Theoria`.
2. Set **`theoria.openrouterApiKey`** to your [OpenRouter API key](https://openrouter.ai/keys).
3. Optionally change **`theoria.model`** (default: `anthropic/claude-3-haiku`) to any model slug available on OpenRouter.

### Option 2  -  `.env` file

Create a `.env` file at your **workspace root** or in the extension directory:

```env
OPENROUTER_API_KEY=sk-or-...
```

The extension loads this file automatically on startup via `dotenv`. Workspace root is checked first; the extension directory is used as a fallback.

> **No API key?** Theoria will still run the local scoring engine and show feedback without contacting any external service.

---

## Installation & Development

### Install dependencies

```bash
npm install
```

### Compile TypeScript

```bash
npm run compile
# or watch mode:
npm run watch
```

### Run the extension

Press **F5** in VS Code to launch a new Extension Development Host window with Theoria loaded.

### Package a `.vsix`

```bash
npm run package
```

---

## Project Structure

```
vs-thinker/
├── src/
│   ├── extension.ts     # Entry point: activates the extension, registers all three
│   │                   # commands, creates the sidebar WebviewView provider, wires
│   │                   # up the status bar item, handles API calls to OpenRouter,
│   │                   # and manages refinement history in VS Code global state.
│   ├── scoring.ts       # Self-contained heuristic scoring engine. Exported function:
│   │                   # analyzePrompt(prompt: string): ScoreResult
│   │                   # Returns a 0–100 score + per-dimension breakdown + feedback.
│   └── webview.html     # Full sidebar UI served as an inline WebviewView. Contains
│                       # all HTML, CSS, and vanilla JS. Communicates with the host
│                       # extension via postMessage / onDidReceiveMessage.
├── package.json         # Extension manifest: commands, keybindings, menus,
│                        # viewsContainers, configuration schema.
├── tsconfig.json        # TypeScript compiler options (outputs to ./out/)
├── icon.png             # Extension icon
└── .env                 # (not committed) Place OPENROUTER_API_KEY here
```

---

## Contributing

Bug reports and pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

1. Fork the repo and create a branch from `main`.
2. Run `npm install` and `npm run watch`.
3. Press **F5** to open an Extension Development Host.
4. Make your changes, then open a Pull Request with a clear description.

---

## Requirements

- VS Code `^1.80.0`
- Node.js (for development only)
- An [OpenRouter](https://openrouter.ai) API key (optional  -  local scoring always works)

---

## License

MIT
