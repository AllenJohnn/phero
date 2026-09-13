# PHERO — Development Plan

> **Last updated:** 2026-09-13
> **Branch:** `main` (JavaScript, primary) · `typescript` (legacy TS archive, frozen)
> **Build:** `npm run build` ✅ · **Tests:** 73/73 pass across 15 files ✅

---

## What PHERO Is

Chrome extension that lets you 1-click handoff an AI conversation from one provider (ChatGPT, Claude, Gemini) to another. It captures the full conversation via DOM scraping + network interception, builds a structured continuation prompt, opens the destination, and injects the prompt into the composer.

---

## Repository Layout

```
src/
├── adapters/                  # Per-provider logic
│   ├── chatgpt/               # detector, extractor, injector, capture, network-capture, page-world, diagnostics
│   ├── claude/                 # detector, extractor, injector, capture
│   ├── gemini/                 # detector, extractor, injector, capture
│   └── registry.js             # AdapterRegistry singleton
├── background/                 # Service worker (handoff-manager, message routing)
├── content/                    # Content script entry + InjectionCoordinator
├── core/
│   ├── capture/                # CaptureOrchestrator, scroll-helper, deduplication
│   ├── context/                # prompt-builder (builds continuation prompt), budget (token budgeting)
│   └── storage/                # SessionStorageManager (chrome.storage.session)
├── shared/                     # Logger, composer-utils, dom-utils
└── ui/
    ├── floating-action/        # FloatingPill + QuickSwitcher (in-page UI)
    ├── icons/                  # Hand-rolled inline SVG icons
    └── popup/                  # Extension popup (React)
tests/                          # Vitest tests (jsdom environment)
```

---

## What's Done

### Phase 1 — Bug Fixes & Housekeeping ✅

All committed to `main`.

| # | Task | Status |
|---|------|--------|
| 1 | **waitForNewMessages fix** — Claude & Gemini capture now use `getVisibleTurnRange()` (earliestTurnId comparison) instead of raw DOM element count, matching the ChatGPT pattern | ✅ Done |
| 2 | **PHERO_EXPORT handler** — Uses `Blob` + `URL.createObjectURL()` with `revokeObjectURL()` cleanup. Calls `sendResponse({ success })` on both paths. `return true` kept. | ✅ Done |
| 3 | **Popup export UX** — `handleExport` reads response, surfaces errors via existing error UI. Loading state on export button. Removed `lucide-react` (was pulling ~1800 modules for 1 icon). Added hand-rolled inline SVG `DownloadIcon` to `src/ui/icons/index.jsx`. | ✅ Done |
| 4 | **CONTINUATION_HEADER_MARKER** — Exported named constant from `prompt-builder.js`. All three injectors import and use it instead of hardcoded literal strings. | ✅ Done |
| 5 | **Dedup param rename** — `deduplicateMessagesWithAudit(firstBatch, secondBatch)` matches call-site order. Orchestrator-level ordering test added (`tests/core/orchestrator-ordering.test.js`). | ✅ Done |
| 6 | **Dev-only diagnostics** — `window.__PHERO_START_DIAGNOSTICS__` gated behind `process.env.NODE_ENV !== 'production'`. Vite config sets `'production'` in all build targets, so it's tree-shaken out. | ✅ Done |
| 7 | **README.md + LICENSE** — README with what/install/dev instructions. MIT license. | ✅ Done |
| 8 | **CI** — `.github/workflows/ci.yml` runs `npm install`, `npm run build`, `npm test` on push/PR. | ✅ Done |

### Code Simplification ✅

| Task | Status |
|------|--------|
| Extracted duplicate `waitForComposer()` + `fallbackDOMInjection()` from Claude & Gemini injectors → `src/shared/composer-utils.js` | ✅ Done |
| Extracted duplicate `convertTableToMarkdown()` from Claude & Gemini extractors → `src/shared/dom-utils.js` | ✅ Done |
| Removed 4 dead empty stub files: `core/capture/types.js`, `core/models/conversation.js`, `core/models/handoff.js`, `shared/messages.js` | ✅ Done |
| Removed unused `findAdapterByDocument()` from registry | ✅ Done |
| Removed dead `lastUserMessage` / `currentRequestText` logic from prompt-builder (the "=== CURRENT REQUEST ===" section was always empty because the last user message was always in the recent set) | ✅ Done |
| Net result: **-69 lines** (154 added, 223 removed) | ✅ Done |

### Security Fixes ✅

| Issue | Fix | Status |
|-------|-----|--------|
| **XSS in injection-coordinator.js** — User-supplied `text` and `destName` were interpolated directly into `innerHTML` via template literals inside Shadow DOM | Changed to `.textContent` assignment after rendering the template with empty placeholder elements | ✅ Done |
| **Fetch hoisting in page-world.js** — `originalFetch` was referenced by `fetchConversationFromApi()` but declared 50 lines later (worked only because setTimeout deferred actual calls) | Moved `const originalFetch = window.fetch` before the function that uses it | ✅ Done |
| **UUID injection in page-world.js** — Custom event `__phero_request_conversation_data__` accepted any string as UUID and interpolated it into a fetch URL, allowing a malicious page script to inject arbitrary paths | Added `/^[a-zA-Z0-9-]+$/` validation on the UUID before using it | ✅ Done |

---

## What's NOT Done Yet

### Phase 2 — Network/State Capture for Claude & Gemini 🔴

**Goal:** Bypass DOM scroll entirely for Claude and Gemini (like ChatGPT's `network-capture.js` + `page-world.js` already does) by reading the full conversation from a pre-hydrated state variable or network endpoint.

**Status:** Blocked — requires manual browser investigation with an authenticated session.

**What to investigate:**

#### On claude.ai:
1. Open a long conversation (20+ turns)
2. In DevTools Console, check for hydrated state:
   - `window.__NEXT_DATA__`
   - `window.__remixContext`
   - `window.__APP_STATE__`
   - Any `<script>` tags with `type="application/json"` containing conversation data
3. In DevTools Network (Fetch/XHR), look for requests returning conversation messages as JSON when the page loads or when scrolling
4. Also check: does "Share" → "Create share link" render a page with the complete conversation in a simpler DOM than the live chat UI?
5. Note: endpoint URL pattern, response shape (especially message array structure), auth headers

#### On gemini.google.com:
1. Same steps — look for hydrated state in globals or `<script>` tags
2. In Network tab, look for conversation data requests (often `batchexecute` or proto-based endpoints)
3. Note the response format

**After investigation:** Report back the actual target (endpoint URL + response shape, or hydration variable name) before implementing. Then:
- Create `src/adapters/claude/network-capture.js` + `src/adapters/claude/page-world.js` (or equivalent)
- Create `src/adapters/gemini/network-capture.js` + `src/adapters/gemini/page-world.js`
- Add manifest entries for MAIN world scripts if needed
- Test with real conversations

---

### Phase 3 — Markdown File-Attachment Delivery 🔴

**Goal:** Add a new delivery path (alongside text-injection, not replacing it) that converts the captured conversation to a clean markdown file and attaches it to the destination's composer as a real file.

**Steps:**

1. **Markdown renderer** — Add a function that renders a `NormalizedConversation` to markdown:
   - Role headers, code fences preserved
   - Similar structure to what `prompt-builder.js` produces but WITHOUT budget-truncation or heuristic-extraction (a file attachment doesn't need to fit a character budget)
   - Put in something like `src/core/context/markdown-renderer.js`

2. **Find file-input elements** — For each provider, use DevTools to find the actual file-input element or drop zone:
   - Manually attach a file once first to discover the selector
   - Same discovery approach as the composer selectors already in each `injector.js`

3. **Implement upload via DataTransfer:**
   ```js
   const dt = new DataTransfer();
   const file = new File([blob], 'conversation.md', { type: 'text/markdown' });
   dt.items.add(file);
   input.files = dt.files;
   input.dispatchEvent(new Event('change', { bubbles: true }));
   ```
   - Do NOT try to set `input.value` directly — browsers block that for file inputs

4. **Test end-to-end** on all three providers before wiring into the popup flow:
   - If a provider's upload mechanism proves unreliable, it's fine to ship for only the providers where it works
   - Text-injection stays as the path for providers without working file-attachment

5. **Wire into popup** — Add a toggle or option in the popup to choose delivery method (text-injection vs file-attachment)

6. **Optional simplification** — Once file-attach is confirmed working reliably, the regex-based decision/constraint extraction in `src/core/context/budget.js` can be simplified, since full-file attachment removes the character-budget pressure. But don't remove budget.js logic until file-attach is confirmed — text-injection still needs it as fallback.

---

### Other Remaining Work 🟡

| Task | Priority | Notes |
|------|----------|-------|
| **page-world.js `originalFetch` timing** — The fetch monkey-patch captures `window.fetch` on line 95 but overrides it on line 142. If another script patches `window.fetch` between those lines, the original is lost. Consider capturing + overriding in the same statement block. | Low | Works correctly in practice since the IIFE runs synchronously |
| **Error boundary in popup** — React error boundary around the popup to catch rendering crashes gracefully | Low | Currently any render error shows a blank popup |
| **Extension update handling** — When the extension updates, existing content scripts become orphaned (can't communicate with the new background service worker). Consider adding a heartbeat or reload mechanism. | Medium | Common Chrome extension issue |
| **Rate limiting on scroll capture** — The orchestrator's scroll loop has no explicit rate limit. On very long conversations, rapid scrolling could cause performance issues. | Low | The stall detection + max-pass limits provide implicit bounds |
| **Popup.jsx loading state on handoff** — The handoff button shows loading but there's no timeout or cancel mechanism if the extraction hangs. | Low | The extraction itself has internal timeouts |

---

## How to Work on This

```bash
# Setup
npm install

# Development
npm run build          # Build all bundles (popup, content, page-world, background) to dist/
npm test               # Run all 73 tests across 15 files

# Load in Chrome
# 1. Go to chrome://extensions
# 2. Enable Developer Mode
# 3. Click "Load unpacked" → select the dist/ folder
```

### Branch strategy
- **`main`** — All active development. JavaScript codebase.
- **`typescript`** — Frozen archive of the old TypeScript codebase. Do not develop on this branch.

### Build system
- **Vite** for bundling (4 separate builds: popup, content script IIFE, page-world IIFE, background ES module)
- **Vitest** for testing (jsdom environment)
- **React** for popup UI
- No TypeScript — plain JavaScript throughout

### Key architectural patterns
- **AdapterRegistry** — Singleton that maps URLs to provider adapters. Each adapter has: `detector`, `extractor`, `injector`, `capture` modules.
- **CaptureOrchestrator** — Scroll-based conversation capture. Scrolls up, captures visible messages, deduplicates, repeats until stall.
- **Network capture** — ChatGPT only (for now). MAIN-world script intercepts `window.fetch` and reads `__remixContext` to get full conversation without scrolling.
- **InjectionCoordinator** — On destination page, retrieves handoff payload from session storage and injects the continuation prompt into the composer.
- **Shadow DOM** — Status banners and fallback modals use Shadow DOM to avoid CSS conflicts with host pages.

### When continuing work
1. Read this file first
2. Run `npm run build` and `npm test` to confirm clean state
3. Pick the next task from "What's NOT Done Yet" above
4. Commit after each logical chunk so progress isn't lost
