# PHERO Implementation Plan — Continuity File

## Status: In Progress
**Last updated:** 2026-09-07
**Session scope:** Items 1-6 completed. Items 7–13 remain.

---

## ✅ COMPLETED

### Fix 1: ChatGPT `isAtBeginning` always returning `false`
- **File:** `src/adapters/chatgpt/capture.ts` line ~109-117
- **Bug:** Hard-coded `return false` at end of `isAtBeginning()` even when at scroll top with no spinner
- **Fix:** Now checks for first conversation turn elements (turn-0/1/2) and returns `true` when at physical top
- **Impact:** Capture orchestrator now detects completeness immediately instead of timing out via stall detector (~9s saved per capture, captures marked COMPLETE instead of UNKNOWN)

### Fix 2: Network capture cross-world data stripping + proactive API fetch
- **Files:** 
  - `src/adapters/chatgpt/page-world.ts` — `emitData()` now JSON.stringify's the detail; added `fetchConversationFromApi()` that fetches from `/backend-api/conversation/{uuid}` with auth cookies (MAIN world has them); fires proactively on page load and SPA navigation; listens for on-demand requests from content script
  - `src/adapters/chatgpt/network-capture.ts` — listener JSON.parse's the detail back; `attemptNetworkCapture()` polls cache 2s, then dispatches on-demand fetch request to page-world and waits 3s more; removed direct fetch from ISOLATED world (never had auth cookies)
- **Root cause:** Chrome strips non-primitive `CustomEvent.detail` crossing world boundaries (data arrived as null). The content script's direct `fetch()` fallback ran in ISOLATED world without ChatGPT's cookies, so it always 401'd.
- **Fix:** JSON serialization for events + proactive authenticated fetch from MAIN world + on-demand fetch trigger
- **Impact:** Network capture should now reliably get 100% of conversation data instantly for any conversation length, no scrolling needed

### 3. Popup UI wiring (High Priority)
- **File:** `src/ui/popup/Popup.tsx`
- **What:** Wire `PHERO_CHECK_STATE` response to show conversation title, message count, streaming status
- **Status:** Done. Added `isStreaming` to `ConversationState`, wired up title/count, and added a yellow "Generating..." indicator.

### 4. Image/file attachment handling (Medium)
- **Files:** `src/core/models/conversation.ts`, all 3 extractors, `prompt-builder.ts`
- **What:** Add `ImageBlock`/`FileBlock` types, detect `<img>` and file attachments in extractors
- **Also:** Handle non-string content parts in `parseConversationMapping` for network capture
- **Status:** Done. `ImageBlock` and `FileBlock` types added and supported in serialization. All DOM extractors and network extractors updated to pull images/files.

### 5. Streaming message detection (Medium)
- **Files:** All 3 capture strategies, `FloatingPill.tsx`, `src/adapters/types.ts`
- **What:** Detect streaming state, add `isStreaming` to `ConversationState`, warn before handoff
- **Status:** Done. Detectors check for stop generation buttons. `FloatingPill` shows an "Assistant is Typing" warning modal before handoff.

### 6. Retry logic on injection failure (Medium)
- **File:** `src/content/injection-coordinator.ts`
- **What:** Add 500ms delay + re-wait for editor, max 2 retries with backoff
- **Status:** Done. Injection retry loop with 500ms backoff added to `checkAndPerformInjection`.

### 7. Context budget per destination (Medium)
- **Files:** `budget.ts`, `prompt-builder.ts`, `content/index.ts`
- **What:** Per-provider budgets: chatgpt=500k, claude=320k, gemini=800k chars
- **Status:** Done. Used provider-specific configuration.

### 8. Conversation title extraction (Medium)
- **Files:** `chatgpt/detector.ts`, `gemini/detector.ts`
- **What:** Check sidebar active items, improve title stripping for SPA navigations
- **Status:** Done. Now checks active sidebar item for proper title during SPA navs.

---

## 🔲 REMAINING ITEMS (Priority Order)

### 9. Bi-directional history (Nice-to-Have)
### 10. Keyboard shortcut Ctrl+Shift+H (Nice-to-Have)
### 11. Selective transfer (Nice-to-Have)
### 12. Multi-model awareness (Nice-to-Have)
### 13. Export to markdown/JSON (Nice-to-Have)

---

## Architecture Notes
- Content script: ISOLATED world | page-world.ts: MAIN world
- Cross-world comms: CustomEvent on document (MUST serialize to JSON string)
- Background: chrome.storage.session for handoff state
- Popup: chrome.tabs.sendMessage to content script
- FloatingPill: Shadow DOM with inline styles
