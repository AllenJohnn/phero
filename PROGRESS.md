# PHERO — DOM-Scroll Fix & Claude Network Capture

**Branch:** `testing` (branched from `scrollfix-claude-network`)  
**Base:** `main` at `b86c8d6`  
**Last updated:** 2026-09-21

---

## 📍 CURRENT STATUS & RESUME POINT: Waiting for Manual QA

**Phase 1** and **Phase 2** are completely implemented, unit-tested (77/77 passing), and committed. (The `scrollfix-claude-network` branch was successfully completed and pushed, and we are now working off the `testing` branch for manual QA).

**Next Steps for the Human Developer:**
1. Run `npm run build`
2. Load the `dist/` folder as an unpacked extension in Chrome.
3. **Test Network Capture**: Open a long Claude chat while logged in. Trigger a handoff and verify it bypasses the slow DOM scroll and instantly captures the correct message count.
4. **Test DOM Fallback**: Open Claude in a context where you are logged out (or clear the `sessionKey` cookie). Trigger a handoff and verify it gracefully falls back to DOM scrolling without crashing.

*Once manual testing is complete, provide the results to the agent to either fix any discovered bugs on the `testing` branch, or merge it into `main`.*

---

## Phase 1: Fix false-completion in DOM-scroll capture ✅ COMPLETE

**Committed:** `53f9fa0` — "Phase 1: Fix false-completion in DOM-scroll capture, add loading checks, escalate stall waits, surface warnings in Popup, restore README"

### What was done

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1 | Remove `metrics.isAtTop \|\|` short-circuit from stall-handling — `isAtBeginning()` already checks `isAtTop` internally on all 3 providers, so the `\|\|` was redundant and caused false COMPLETE when scroll stalled near top | [orchestrator.js](file:///D:/Personal%20Project/phero/src/core/capture/orchestrator.js) L67 | ✅ |
| 2 | Stall at top now produces `PARTIAL` (not `UNKNOWN`) when `isAtBeginning()` is false but `metrics.isAtTop` is true — gives the user a more accurate signal | [orchestrator.js](file:///D:/Personal%20Project/phero/src/core/capture/orchestrator.js) L71 | ✅ |
| 3 | Add loading spinner checks to Claude `isAtBeginning()` — checks `svg.animate-spin`, `[data-testid*="loading"]`, `[data-testid*="spinner"]`, `[aria-busy="true"]`, `[role="progressbar"]` before declaring complete | [claude/capture.js](file:///D:/Personal%20Project/phero/src/adapters/claude/capture.js) L77-80 | ✅ |
| 4 | Add loading spinner checks to Gemini `isAtBeginning()` — same selectors plus `mat-spinner`, `.loading-indicator` for Angular Material | [gemini/capture.js](file:///D:/Personal%20Project/phero/src/adapters/gemini/capture.js) L63-67 | ✅ |
| 5 | Escalate per-attempt wait with consecutive stalls: `baseWaitTime * (sameStateCount + 1)`, capped at `5×` base — instead of flat 1500ms | [orchestrator.js](file:///D:/Personal%20Project/phero/src/core/capture/orchestrator.js) L45-46 | ✅ |
| 6 | Surface `isComplete`/`warning` from extraction result in Popup.jsx — previously only FloatingPill.jsx read these fields | [Popup.jsx](file:///D:/Personal%20Project/phero/src/ui/popup/Popup.jsx), [content/index.js](file:///D:/Personal%20Project/phero/src/content/index.js) | ✅ |
| 7 | Restore README.md (was wiped to blank by commit `b86c8d6`, restored from `0b8dc74`) | [README.md](file:///D:/Personal%20Project/phero/README.md) | ✅ |

### Verification

- `npm run build` — ✅ clean (4 bundles)
- `npm test` — ✅ 73/73 tests pass (15 test files)

---

## Phase 2: Claude network capture via chrome.cookies ✅ COMPLETE

**Committed:** `0963a47` — "Phase 2: Implement Claude network capture via chrome.cookies"

### Research findings (confirmed from real source)

**Endpoint** (confirmed via [Jamie Tanna's blog post](https://www.jvt.me/posts/2026/09/04/claude-chat-export/) + multiple GitHub repos):

```
GET https://claude.ai/api/organizations/{orgId}/chat_conversations/{conversationId}?tree=True&rendering_mode=messages&render_all_tools=true
```

**Cookies needed** (both at `claude.ai` domain):
- `sessionKey` — the auth session cookie
- `lastActiveOrg` — the org UUID to use in the URL path

**Response shape:**

```json
{
  "uuid": "conversation-uuid",
  "name": "Conversation title",
  "created_at": "2026-07-25T09:38:55.311455Z",
  "updated_at": "2026-07-25T09:40:03.114705Z",
  "current_leaf_message_uuid": "leaf-msg-uuid",
  "chat_messages": [
    {
      "uuid": "msg-uuid",
      "text": "",
      "content": [
        {
          "type": "text",
          "text": "The actual message text",
          "start_timestamp": "2026-07-25T09:38:56.130954Z",
          "stop_timestamp": "2026-07-25T09:38:56.130954Z",
          "citations": []
        }
      ],
      "sender": "human",
      "index": 0,
      "created_at": "2026-07-25T09:38:56.131040Z",
      "updated_at": "2026-07-25T09:38:56.131040Z",
      "parent_message_uuid": "00000000-0000-4000-8000-000000000000",
      "truncated": false,
      "attachments": [],
      "files": [],
      "sync_sources": []
    }
  ]
}
```

> [!IMPORTANT]
> Messages form a **tree** via `parent_message_uuid`. To reconstruct the active conversation path, walk backwards from `current_leaf_message_uuid` through the tree. The sentinel root parent is `00000000-0000-4000-8000-000000000000`.

**Key mapping for `sender` → `role`:**
- `"human"` → `"user"`
- `"assistant"` → `"assistant"`

**Content block types to handle:**
- `"text"` — plain text (check for markdown code fences to split into `type: 'code'`)
- `"thinking"` — extended thinking blocks (skip or omit, matching existing behavior)
- `"tool_use"` / `"tool_result"` — tool calls (include as text summary)

### Steps completed

| # | Task | File | Details |
|---|------|------|---------|
| 1 | Add `"cookies"` to manifest permissions | [manifest.json](file:///D:/Personal%20Project/phero/manifest.json) | ✅ **DONE** (in Phase 1 commit) |
| 2 | Add `claude-fetch-conversation` message handler to background | [background/index.js](file:///D:/Personal%20Project/phero/src/background/index.js) | ✅ **DONE** |
| 3 | Verify endpoint | — | ✅ **DONE** |
| 4 | Create `network-capture.js` for Claude | [claude/network-capture.js](file:///D:/Personal%20Project/phero/src/adapters/claude/network-capture.js) | ✅ **DONE** |
| 5 | Wire into Claude extractor | [claude/extractor.js](file:///D:/Personal%20Project/phero/src/adapters/claude/extractor.js) | ✅ **DONE** |
| 6 | Add tests for parsing function | `tests/adapters/claude-network-capture.test.js` | ✅ **DONE** |

### After Phase 2

- ✅ `npm run build && npm test` — 77/77 tests passing!
- ✅ Commit on `scrollfix-claude-network` branch
- [ ] Manual test: open a real long Claude conversation, verify message count matches
- [ ] Manual test: log out of Claude, verify fallback to DOM scroll works

### Reference files to read before starting

| Purpose | File |
|---------|------|
| ChatGPT network capture (model to follow) | [src/adapters/chatgpt/network-capture.js](file:///D:/Personal%20Project/phero/src/adapters/chatgpt/network-capture.js) |
| ChatGPT extractor (try-network-then-DOM pattern) | [src/adapters/chatgpt/extractor.js](file:///D:/Personal%20Project/phero/src/adapters/chatgpt/extractor.js) |
| Input validation pattern | [src/adapters/chatgpt/page-world.js L125](file:///D:/Personal%20Project/phero/src/adapters/chatgpt/page-world.js#L125) — `/^[a-zA-Z0-9-]+$/` |
| Background message handler | [src/background/index.js](file:///D:/Personal%20Project/phero/src/background/index.js) |
| Claude detector (gets conversationId from URL) | [src/adapters/claude/detector.js](file:///D:/Personal%20Project/phero/src/adapters/claude/detector.js) |
| Test setup (chrome mock) | [tests/setup.js](file:///D:/Personal%20Project/phero/tests/setup.js) — need to add `chrome.cookies` mock |
| Existing Claude tests (style reference) | [tests/adapters/claude.test.js](file:///D:/Personal%20Project/phero/tests/adapters/claude.test.js) |
