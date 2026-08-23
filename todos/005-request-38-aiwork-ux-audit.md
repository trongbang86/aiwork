# Request 38 — AIWork UX agent and audit

## Agent and session

- [x] Add the dedicated `aiwork.ux` actor with Playwright and UX-audit instructions.
- [x] Add a dedicated AIWork UX workflow without changing IQ Prep or generic development actors.
- [x] Seed the AIWork project hierarchy and `AIW-100` audit epic.
- [x] Start the `AIW-100` development session through the transition engine (version 1 → 2; active actor `actor_aiwork_ux`).

## Method and evidence

Audited 2026-08-23 with Playwright Chromium MCP: installed `https://localhost:8446` and prototype `http://localhost:5173`. Viewports: 1440×1000, 900×1000, 390×844/900, plus 1100/1099 px breakpoint probes. The installed service lacked seeded AIW data, so representative `DEMO / DEMO-1` exercised projects, board, hierarchy, work item, workflow, transitions, attachments/comments, effective context, and provenance.

Screenshots were captured for both `/projects` surfaces at all viewports; installed board desktop; installed hierarchy/item/workflow at all viewports; prototype hierarchy/board/workflow desktop. Names use `aiwork-{installed|prototype}-{view}-{viewport}.png`. Accessibility snapshots, bounding boxes, scroll widths, DOM visibility, focus order, route hrefs, text, and console events were inspected.

### Inspection sequence

1. Enter Projects; identify search, selection, and creation.
2. Open DEMO; compare hierarchy, board, and workflow.
3. Select DEMO-1; inspect identity, transitions, edit/comment/attachment/child actions.
4. Trace effective context through project, item, state, and actor provenance.
5. Repeat at desktop/tablet/mobile and probe 1100/1099 px.
6. Exercise keyboard traversal, Ctrl+K/Escape, hidden controls, overflow, encoding, and failure cues.
7. Review visible empty/success states and define absent state requirements.

## Live audit

- [x] Capture installed GUI views at desktop, tablet, and mobile widths.
- [x] Capture React prototype views at desktop, tablet, and mobile widths.
- [x] Verify the sub-1100px inspector behavior.
- [x] Check keyboard navigation, focus behavior, and encoding artifacts.
- [x] Map principal user journeys and navigation/comprehension failures.

### Epic acceptance-criteria traceability

The Epic's six audit acceptance criteria are evaluated as deliverables, independently of whether the observed product is ready to ship.

| # | Audit acceptance criterion | Evidence in this document | Audit result |
|---|---|---|---|
| 1 | Installed and prototype GUI audited at desktop, tablet, and mobile | Method, viewport coverage table, findings, and named Playwright captures | Pass |
| 2 | Installed/prototype divergence is explicit and actionable | Journey table and ten-row divergence matrix with consolidation decisions | Pass |
| 3 | Consolidated persistent-context IA and responsive behavior are defined | Route model, persistent context fields, and three responsive modes | Pass |
| 4 | Inherited AI Context and provenance interaction is designed | Effective/Sources/Resolution/Resources/Raw model, source tokens, change preview | Pass |
| 5 | Required UI states and recovery behavior are defined | Eight-state definition matrix covering empty through offline | Pass |
| 6 | Findings are prioritized and self-reviewed with an acceptance decision | P0–P3 remediation backlog plus separate decisions below | Pass |

### Viewport and route coverage

| Surface | Projects | Board | Hierarchy | Work item | Workflow | Viewports/probes |
|---|---:|---:|---:|---:|---:|---|
| Installed | Captured | Captured | Captured | Captured | Captured | 1440, 900, 390 px; scroll width and focusable counts inspected |
| Prototype | Captured | Captured | Captured | Inspector inspected | Captured | 1440, 900, 390 px; inspector additionally probed at 1100 and 1099 px |

“Captured” means Playwright screenshot plus DOM/accessibility or extracted semantic evidence, not screenshot-only review. The installed board desktop capture was supplemented by linked routes at all three viewports; the prototype common shell and view switching were captured at desktop, while Projects responsive captures verified the same mounted architecture at tablet/mobile.

### Evidence and findings

- Installed Projects is a card portfolio with inline creation. At 390 px the document is 414 px wide; installed hierarchy/item/workflow similarly overflow by 24–44 px.
- Installed board exposes Ready, In progress, Test, Production, Cancelled plus Add item, Context map, View flow. Installed work item is operational: breadcrumb/up, valid transitions, edit, comments, pictures, child creation, effective context, provenance, Resource AI, JSON.
- Prototype has the stronger desktop three-pane shell: persistent project selector and Hierarchy/Board/Workflow navigation, center view, right selected-item inspector.
- **Below 1100 px the prototype inspector is visually removed. Its controls remain at 0×0 in the DOM, with no drawer, detail route, or alternate action.** Users cannot inspect, transition, comment, attach, copy `/ai`, or read provenance. This is a P0 product-remediation finding; it does not invalidate the completeness of this audit.
- Prototype fits 390 px without horizontal overflow. Installed preserves capabilities but its long form/context page is difficult to scan on mobile.
- Ctrl+K focuses “Search all projects”; Escape closes it. Desktop tab order is Search → Hierarchy → Board → Workflow → project selector → New project → Add child → items. A hydration/load probe briefly returned focus to BODY after New project; verify slow-load continuity.
- Hidden inspector controls did not enter the sampled mobile tab sequence, but must be conditionally removed or made `inert`/`aria-hidden`. Workflow display is not keyboard-operable.
- Runtime arrows/punctuation were correct. This todo originally contained `â€”` and `â†’`; repaired here. Repository text encoding was therefore defective even though live UI was clean.
- No user-facing recovery state appeared for console/dev events. Installed Sign in targets a LAN SSO URL and does not promise return to the current work.

### Principal journeys

| Journey | Installed | Prototype | Failure/risk |
|---|---|---|---|
| Find project | cards + search | selector + Ctrl+K | `AIWORK / DEMO` ambiguously mixes product/project; installed create competes with browse. |
| Understand hierarchy | Context map | Hierarchy view | No persistent ancestor path/inheritance summary. |
| Triage | five-state board | four groups; includes root project | Root can distort delivery counts; Cancelled diverges. |
| Inspect/edit | canonical full page | desktop inspector | Entire prototype journey ends below 1100 px. |
| Transition | valid destinations | inspector buttons | Needs pending, success, guard, conflict feedback. |
| Understand AI | effective + provenance | heading only in inspected state | Inherited/overridden/stale context unclear. |
| Workflow | authoritative transition list | partial visual | Prototype omits Cancelled; guards/actors unexplained. |
| Recover | no evidenced recovery UI | no evidenced recovery UI | Auth/conflict/invalid/offline unspecified. |

## Deliverables

- [x] Installed GUI vs. React divergence matrix.
- [x] Consolidated information architecture and responsive behavior.
- [x] Inherited AI Context and provenance interaction design.
- [x] Empty, loading, success, failure, authorization, conflict, invalid-transition, and offline state definitions.
- [x] Prioritized backlog: quick wins, structural work, and later enhancements.
- [x] UX agent final self-review and separate audit/product acceptance decisions.

## Installed GUI vs React divergence

| Area | Installed | Prototype | Consolidation |
|---|---|---|---|
| Shell | server pages; mobile overflow | responsive shell | Adopt prototype shell; remove fixed/min widths. |
| Projects | portfolio + inline create | selector/search/New project | Portfolio landing; global switcher after entry; focused create dialog. |
| Navigation | route links | persistent view buttons | Persistent tabs backed by real URLs/history. |
| Detail | complete canonical route | desktop-only inspector | Shared detail: route + desktop inspector + tablet drawer. |
| Board | five states, work items | four groups, root included | Drive both from workflow; exclude roots by default. |
| Hierarchy | basic context map | compact rows | Add lineage, indentation, collapse, inheritance badges. |
| Workflow | authoritative text incl. Cancelled | partial visual | Render engine states/transitions/guards/actors plus accessible list. |
| AI context | effective/provenance/raw | section heading | Put installed model into prototype interaction. |
| Responsive | available but overflowing | fits, loses detail | Reflow without removing capability. |

## Consolidated IA and responsive contract

Persistent context is **Workspace → Project → View → Selected work item**. Global shell owns project search/switching and auth; project shell owns Overview, Hierarchy, Board, Workflow, Activity. Item detail is canonical at `/work-items/:id`; project URLs may use `?item=:id` to open the same detail in an inspector. Preserve project key/title, active view, ancestor trail, selected item key/title/type/status, actor, and sync state.

- **≥1100 px:** 220–240 px rail, fluid center, 340–400 px inspector.
- **768–1099 px:** compact shell; focus-trapped inspector side sheet, visible close/back, stable underlying view.
- **<768 px:** stacked header, compact/scrollable tabs, single column; selecting an item opens full-screen canonical detail. Back restores view, filters, scroll, and focus.
- One-column forms, ≥44×44 px targets, no document overflow at 320 px+, and no capability loss.

## Inherited AI Context and provenance

Show an **AI Context** summary beside item identity: “4 sources · Product Owner · refreshed now”. Its detail has:

1. **Effective:** final ordered instructions as the agent receives them; copy/download; freshness/version.
2. **Sources:** Project → ancestors → item → state → actor, each with scope badge, source link, owner, timestamp/version, and contribution.
3. **Resolution:** inherited/added/overridden/suppressed diff, precedence order, explicit conflict explanation.
4. **Resources/tools:** allowance, source/permission, unavailable reason.
5. **Raw:** subordinate JSON debugging view.

Use text plus consistent `Project`, `Parent`, `Item`, `State`, `Actor`, `Policy` tokens. Preview affected descendants before context changes. After transitions, explain context/actor delta. Copy `/ai` confirms copied URL and authentication requirement.

## UI state definitions

| State | Definition and recovery |
|---|---|
| Empty | Explain why; preserve navigation; one permission-aware primary action. |
| Loading | Stable layout skeleton; retain labels; disable mutation with progress; never replace shell. |
| Success | Object-bound confirmation, updated status/version, sensible focus return; toast is supplemental. |
| Failure | Human message, correlation/details, Retry, preserved input; distinguish validation/service/upload. |
| Authorization | Explain sign-in vs permission; retain return URL; consistently hide/disable forbidden mutation. |
| Conflict | Show editor/time and local/server diff; Reload and safe Reapply; never overwrite silently. |
| Invalid transition | Keep status; explain guard/actor; refresh valid destinations; link workflow. |
| Offline | Persistent banner + last sync; label cache stale; queue only explicitly safe work; never imply transition success before acknowledgement. |

## Prioritized backlog

### P0 — product release blockers

- Restore detail below 1100 px via tablet drawer/mobile route; remove hidden interactive subtree or make inert.
- Eliminate installed overflow at 320/390/768/1099/1100 px.
- URL-address hierarchy/board/workflow/item selection with history/focus restoration.
- Implement auth, mutation failure, optimistic conflict, invalid-transition, offline recovery.
- Align board/workflow to one engine model, including Cancelled and counts.

### P1 — quick wins

- Clarify breadcrumb/product/project labels; persist selected item and active actor.
- Add visible focus, skip link, dialog focus trap/return, 44 px targets, keyboard regression.
- Move creation out of browsing flow.
- Populate prototype effective context/provenance with summary count/freshness.
- Enforce UTF-8 and add mojibake scan.
- Add skeletons and specific empty actions for columns/comments/pictures/context.

### P2 — structural

- Shared detail component for route, inspector, drawer.
- Context resolution diff, source links, versions, descendant preview, transition delta.
- Hierarchy lineage/connectors/collapse/filter/inheritance indicators.
- Accessible workflow generated from engine metadata, guards, actors, legend.

### P3 — later

- Saved board views, density, WIP cues.
- Activity timeline joining transitions, actor/context changes, comments, attachments.
- Shareable context snapshots/export.
- Offline reads/drafts after conflict semantics are proven.

## Verification

- [x] `pnpm check` — passed after actor, workflow, seed, and development-script changes.
- [x] `pnpm test` — 18 tests passed, including dedicated UX-actor activation through the transition engine.
- [x] `pnpm build` — API TypeScript and React/Vite production builds passed.
- [x] Live Playwright verification.

## Self-review, Audit Acceptance, and Product Remediation Status

- [x] Both surfaces and requested view families inspected.
- [x] Desktop/tablet/mobile captures and DOM/overflow evidence recorded.
- [x] Breakpoint, keyboard/focus, encoding, journeys, IA, provenance, states, backlog covered.
- [x] Observations separated from proposals; no product code/live data modified.
- [x] Each of the Epic's six audit acceptance criteria has an evidence pointer and pass/fail result.
- [x] Audit acceptance is separated from product readiness/remediation.

### Audit Acceptance

**Accepted.** The Request 38 UX audit satisfies all six Epic acceptance criteria: both live surfaces and requested viewports are evidenced; divergence, persistent-context IA, responsive behavior, inherited context/provenance, state definitions, and a prioritized backlog are complete. Findings are reproducible and distinguish observed behavior from proposed remediation.

### Product Remediation Status

**Open; product release readiness was not granted or requested by this audit.** P0 defects remain: prototype item inspection/actions disappear below 1100 px, installed mobile routes overflow, workflow representations diverge, and authorization/conflict/invalid-transition/offline handling is absent or not evidenced. These remain prioritized backlog items for implementation and subsequent responsive/keyboard regression review; they do not withhold acceptance of the audit deliverable.

## Development iteration — responsive work-item detail

### UX agent recommendation

- [x] Re-ran the active `AIW-100` context as `aiwork.ux` and recorded its recommendation in the Epic comments.
- [x] Selected the highest-priority contained remediation: restore every work-item capability below 1100 px before broader information-architecture work.

### Implementation

- [x] Replace the hidden sub-1100 px inspector with a 420 px tablet side sheet and dimmed dismissible backdrop.
- [x] Use a full-viewport work-item detail surface below 700 px without horizontal overflow.
- [x] Preserve transitions, attachments, comments, `/ai` copy, and AI-context provenance at every viewport.
- [x] Add explicit tablet back/mobile close controls, Escape dismissal, initial detail focus, and focus restoration to the selected row/card.
- [x] Keep the closed inspector visibility-hidden so its interactive subtree is absent from keyboard and accessibility navigation.

### Live Playwright follow-up

- [x] At 1099×900, selecting `DEMO-1` opens the 420 px side sheet with every operation present in the accessibility tree.
- [x] At 390×844, the detail occupies exactly 390×844; document scroll width remains 390 px.
- [x] Detail opening moves focus to the labelled work-item region; Escape closes it and restores focus to `DEMO-1`.
- [x] At 1440×900, the persistent 360 px desktop inspector remains visible and document scroll width remains 1440 px.

### UX agent follow-up decision

**Accepted for this development slice after deployment of commit `4855a43`.** The agent's decision is recorded on `AIW-100` as comment `e5b29a1d-14de-42de-b819-f9d617822b4b`. The responsive capability-loss blocker is resolved in the development prototype. Next priorities are URL/history-backed selection and installed-GUI mobile overflow, followed by workflow/board convergence and resilient mutation/recovery states.
