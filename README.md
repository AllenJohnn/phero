# PHERO — Carry the conversation forward

Seamlessly continue AI conversations between ChatGPT, Claude, and Gemini with 1-click handoff.

PHERO is a Chrome extension that captures your full conversation from one AI provider, builds a continuation prompt preserving context, decisions, code, and constraints, then injects it into your destination provider's composer — so you can pick up exactly where you left off.

## Features

- **1-click handoff** between ChatGPT ↔ Claude ↔ Gemini (all six directions)
- **Full conversation capture** via DOM scroll recovery and network-level data interception (ChatGPT)
- **Smart context budgeting** — extracts key decisions, constraints, code blocks, and unresolved issues from earlier turns so the destination gets the most important context first
- **Export** conversations to JSON
- **Floating pill UI** on supported sites for quick access
- **Keyboard shortcut** (Ctrl+Shift+H / Cmd+Shift+H) to open the popup

## Supported Providers

| Provider | Capture | Inject | Notes |
|----------|---------|--------|-------|
| ChatGPT  | ✅ DOM + Network | ✅ | Network capture via `__remixContext` hydration + fetch interception |
| Claude   | ✅ DOM scroll    | ✅ | ProseMirror contenteditable injection |
| Gemini   | ✅ DOM scroll    | ✅ | Quill editor contenteditable injection |

## Install

```bash
git clone https://github.com/your-username/phero.git
cd phero
npm install
npm run build
```

Then load `dist/` as an unpacked extension in `chrome://extensions` (enable Developer mode).

## Development

```bash
npm run dev      # Watch mode — rebuilds on file change
npm test         # Run test suite
npm run test:watch  # Watch mode tests
npm run build    # Production build
```

## Architecture

```
src/
├── adapters/          # Per-provider capture, detection, extraction, injection
│   ├── chatgpt/
│   ├── claude/
│   └── gemini/
├── background/        # Service worker (tab management, handoff coordination)
├── content/           # Content script entry point + lifecycle manager
├── core/
│   ├── capture/       # Scroll orchestrator, deduplication, scroll helpers
│   └── context/       # Prompt builder, budget partitioning
├── shared/            # Logger, message types
└── ui/
    ├── floating-action/  # In-page floating pill + quick switcher
    ├── icons/            # Hand-rolled inline SVG icons
    ├── popup/            # Extension popup UI (React)
    └── styles/           # Tailwind CSS entry
```

## How It Works

1. **Capture**: When you trigger a handoff, PHERO scrolls through the conversation DOM (or reads network-intercepted data on ChatGPT) to collect all messages with their roles, code blocks, images, and file references.
2. **Deduplicate & Order**: Overlapping scroll windows are merged using stable message IDs and content fingerprinting.
3. **Budget & Build**: The prompt builder partitions messages into recent (verbatim) and earlier (summarized), extracts key decisions/constraints/code, and assembles a continuation prompt within the destination's context budget.
4. **Inject**: The prompt is injected into the destination's composer element, dispatching the appropriate input events for each provider's editor framework.

## License

MIT — see [LICENSE](./LICENSE).
