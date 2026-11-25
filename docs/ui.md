# ui.md — Performance Review App · Frontend Design System (Light Theme)

The visual law of this application. Read this file before building or modifying any UI. Component code must conform to this spec without exception; if an existing component deviates, treat the deviation as a defect unless the user explicitly approves it.

## 1. Source of truth and precedence

The UI is built on the Emids Brand System v1.0 (`Emids_Brand System_v1.0.pdf`) rendered in a **light theme**. Precedence when building this app:

1. **The token table in this document** — extracted from the approved reference CSS (`global.css`, `layout.css`, `pages.css`). This is what the code uses.
2. **The brand rules in `branding.md`** — logo handling, color philosophy, icon style, voice. Consulted for intent and for anything the tokens table does not cover.

**Known intentional divergence from the brand PDF:** the brand PDF specifies Inter (UI) + JetBrains Mono (labels); the implemented theme uses **Plus Jakarta Sans** for both text voice and the "mono" label voice (same family, tabular numerals for data — see the comment in the reference CSS). Follow the theme as specified here. Do not swap in Inter or JetBrains Mono unless the user asks.

Do not duplicate rules found here into other docs; you may cross-reference (`branding.md §…`).

## 2. Brand feel (the intent behind the tokens)

The design reads **engineered**: sharp corners everywhere except one soft bottom-left 8px corner on brand carrying surfaces; hairline borders instead of shadows; all-caps tracked "mono" labels above sentence-case content; teal as the single leading brand color with red/blue/green used only to confirm state. Constraints from the brand:

- **20% rule:** teal (or its gradient) should be present but never dominate every surface — as the top bar, buttons, accents.
- **Signal accents (red/blue/green) never lead.** They confirm state, always paired with a mono uppercase label — never decorate.
- **Elevation is color, not shadow.** Depth comes from surface vs canvas vs hairline borders. The only shadow in the whole UI is the glass chat FAB (see §7).
- **The gradient** runs strictly left→right, 3 stops `#9dc6cc → #72b3be → #57a6b3`. Never rotated, never under small text, never as a button fill.

## 3. Design tokens

All values below come from `:root` in the reference CSS. Components must consume these variables — **never hardcode raw hex values in component code** (except the header-dark-page-section one-offs documented as token-local values).

### 3.1 Brand primary — teal family

| Token | Value | Role |
|---|---|---|
| `--teal` | `#47a2b0` | Primary action fill, avatar bg, active states, links hover anchors |
| `--teal-deep` | `#2a7682` | Hover/press on primary, eyebrows, links, dark-page accent text |
| `--teal-mid` | `#72b3be` | Mid stop of gradient, picked-day borders in calendars |
| `--teal-light` | `#abc7ca` | Light accents, dashed frames, selection background |
| `--teal-wash` | `#eef5f6` | Hover wash, info banners, table row hover, side panels |
| `--grad` | `#9dc6cc 0% → #72b3be 50% → #57a6b3 100%` | Top bar, modal bar bars, meter fills. L→R only |

### 3.2 Neutrals (elevation)

| Token | Value | Role |
|---|---|---|
| `--black` | `#0e0e0e` | Headings, strongest text, toast/modal backdrop base |
| `--ink` | `#171a19` | Body text |
| `--ink-2` | `#4d5553` | Secondary text, field labels, muted leads |
| `--ink-3` | `#7c8684` | Placeholders, captions, table headers, empty states |
| `--canvas` | `#f2f2f0` | App background, disabled input bg, panel/table-head bg |
| `--surface` | `#ffffff` | Cards, header, panels, modals |
| `--hairline` | `#dbdbd7` | Primary borders (inputs, dividers, ghost button border) |
| `--hairline-2` | `#e7e7e3` | Lightest card borders, row borders, panel dividers |

Elevation ladder: `--canvas` (ground) → `--surface` + `--hairline-2` border (cards/panels) → overlays (`rgba(14,14,14,0.55)`).

### 3.3 Signals

| Token | Value | Role |
|---|---|---|
| `--red` | `#e04f4f` | Destructive fill, errors, notification badge |
| `--red-deep` | `#b83838` | Error/danger text (always this, never raw `--red`, for text) |
| `--red-wash` | `#fdecec` | Rejected pills, warn banners, danger hover wash |
| `--blue` | `#00b9f9` | Pending/neutral-info state accent (wash `#e9f7fe`) |
| `--green` | `#45bda0` | Success icon fill (wash `#e8f5f0`) |

Wash + solid pairs are fixed: e.g. approved pill text `#1f7a63`, pending text `#0c7fae`, borders `#b5e0d3` / `#b3e4f8` / `#f5c1c1`. These exact hex values are part of the theme; copy all of it, don't approximate.

### 3.4 Typography tokens

| Token | Value | Role |
|---|---|---|
| `--font` | `'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', system-ui, ...` | All body/headings |
| `--mono` | same family, `font-variant-numeric: tabular-nums` | "Label voice": eyebrows, buttons, pills, table headers, field labels |

Base: 16px root; body renders at **14px / 1.5 line-height, antialiased** on `--canvas`.

The type ladder uses the voice pairings from the brand PDF: headings are display-style with tight tracking, labels are all-caps. See §5.

### 3.5 Spacing (8pt baseline / 4pt snap)

Base rhythm observed in the CSS; snap multiples of 4. Useful anchors: header 60px; page padding `28px 32px 48px`; card padding 24px; form-row gap 18px; field gap 7px; pill actions gap 8; table cell padding `13px 14px`; modal body 24px; max page width 1280px, form cards 860px.

### 3.6 Motion

| Token | Value | Role |
|---|---|---|
| `--ease-resolve` | `cubic-bezier(0.2, 0, 0, 1)` | Panels, modal in, FAB transitions — "resolving" moves |
| `--ease-process` | `cubic-bezier(0.4, 0, 0.2, 1)` | Process/step transitions |
| Snap durations | 120–160ms | Hovers, buttons, nav (linear bg/color changes; hover = "background shifts one step, no motion") |
| Resolve durations | 200–240ms | Dropdowns, modals, drawer, toasts |
| Page/complex | 360–600ms | Route/wizard-level transitions only |

Motion rules (from brand): "things resolve, never loop" — no bouncy springs, no scale on press; press = `translateY(1px)` at 120ms; loading loops exist only for true async (spinner outline, 0.7s linear). One transform per element, no simultaneous fade+slide going in different directions.

## 4. Structural vocabulary (the atomic mapping)

Every component below is an **atom or molecule** unless noted. `organisms` are the page-level assemblies (AppShell, ReviewCycleBuilder, etc.) and must not re-invent these atoms.

### 4.1 Atoms

**Button** (`.btn` / `--primary` / `--ghost` / `--danger` / `--sm`): sharp corners, `--mono` 12px/700/0.08em uppercase, padding `12px 20px`, transparent 1px border, 120ms linear color transition, `:active` presses down 1px, `:disabled` at `opacity: 0.45`. Primary fills `--teal` → hover `--teal-deep`; ghost is transparent + `--hairline` border → hover `--canvas`; danger `--red` → `--red-deep`; the logout variant is ghost with `--red-deep` text. Danger buttons are reserved for destructive review actions; never two primary buttons side by side in a toolbar.

**Input / Select / Textarea** (`.input` `.select` `.textarea`): sharp corners, `--surface` bg, `--hairline` border, 14px text, padding `11px 14px`; hover border `--ink-3`; focus = 2px `--teal` outline offset −1px + teal border; disabled = `--canvas` bg + `--ink-3` text. Select has a built-in chevron SVG (right 12px, pad-right 36px); textareas `min-height: 96px`, resize vertical.

**Field wrapper** (`.field`): column flex, gap 7px, mono uppercase label (10.5px/700/0.08em, `--ink-2`) with `.req` marker in `--red`, error line below in `--red-deep` at 11.5px.

**Status pill** (`.pill` / `--approved` / `--pending` / `--rejected` / `--cancelled`): mono 10px/700 uppercase, dot (`::before`), 1px border, 4px 10px padding, white-space nowrap. States map: approved = `--green-wash` bg + `#1f7a63`; pending = `--blue-wash` + `#0c7fae`; rejected = `--red-wash` + `--red-deep`; cancelled = `--canvas` + `--ink-2`. Review-stage statuses must reuse this fixed set — do not invent new wash/text pairs.

**Avatar** (`.avatar`): teal square, white mono initials, **bottom-left 8px rounded** (`border-radius: 0 0 0 8px`), default 46px (62px on dashboards). Initials, never photos, for people.

**Chip / Segmented control** (`.chip`, `.seg`): mono 10.5px uppercase, hairline border; on-state fills `--teal` with white text; hover teals border/text. Use for competency/goal type pickers, review-type toggles.

**Card** (`.card`, `.brand-frame`): `--surface` + 1px `--hairline-2`, no shadow. Sharp corners in forms/tables/modals; bottom-left 8px only where the brand frame is wanted (hero cards, profile panels, dropdowns — see §7).

**Toast** (`.toast`): fixed bottom-right, `--black` bg, `--canvas` text, mono 11px, 8px status dot (`--green` success / `--red` error), 240ms resolve slide-in.

**Spinner** (`.spinner`): 16px, white on colored fills (teal/red/dark contexts) — on light surfaces recolor to `--teal-deep` borders.

**Icon** (`.icon`, inline SVG): Tabler-style outline icons on a 24px grid, 1.5px stroke, no fills, `currentColor` only. Sizes: 16px inline/nav, 24 default, 32 callout (see `branding.md` §5).

### 4.2 Molecules

**Table** (`.table`): uppercase mono headers (10px/600, bg `--canvas`, bottom `--hairline`); 13px cells, `--hairline-2` row borders; row hover = `--teal-wash`. Empty state = `.table__empty` (32px pad, `--ink-3`). Row-level action buttons may reveal on hover (opacity 0→1; always visible on touch — `@media (hover: none)`).

**Action pills** (`.pill-act--approve/reject`): mono 9px uppercase bordered mini-buttons in wash colors; hover flips to solid fill. The approve/reject pair is the canonical fast-review control.

**Stat strip** (`.strip`): 5-column white card of big numerals (21px/800) over mono micro-labels; first-line metric strip on dashboards.

**Nav item** (`.nav-item`): 3px left border, transparent; hover/active `--teal-wash` + `--teal-deep` text; active shows `--teal` left border. Badges are 22px mono-bordered squares in `--teal`.

**Form rows** (`.form-row--2`, `--type`): CSS grid, 2-up or 4-up typed pickers collapsing to 1 column ≤760px. Cross-field errors (e.g. date ranges) go in a single full-width `.form-date-error` line spanning the grid, not per-column.

**Meter/bar** (`.bar-row`): 10px `--canvas` track with `--hairline-2` border, `--grad` fill (plain `--teal` for rows 5+). Display scores, goal progress, and calibration distributions.

### 4.3 Organisms and page scaffolding

- **AppShell organisms:** top 4px `--grad` bar; 60px sticky white header (`--surface`, `--hairline-2` bottom); drawer 288px wide with its own gradient topbar. Page content: max 1280px, pad `28px 32px 48px`.
- **Header**: logo (img height 17px) left; centered mono uppercase page title with a 28px gradient underline; right = icon buttons (38px, hover `--teal-wash`), red count badge (16px round, white text, 1.5px `--surface` border), search + notif + profile popovers (white, `--hairline-2`, **rounded `0 0 0 10px`** bottom-left, top-right origin, pop-in 200ms resolve).
- **Page head**: eyebrow (mono 10.5px uppercase `--teal-deep`) above 27px/800 title (−0.015em) above optional muted lead (13.5px, max 720px).
- **Page templates** may not fetch data; they compose these organisms. Pages (routes) own fetch + orchestration only.

## 5. Text and microcopy rules

- Sentence-case body, period at the end of full sentences, no exclamation marks.
- The **label voice** (mono token) is ALL-CAPS, tracked (`0.08–0.14em`), terse: eyebrows, field labels, buttons, table headers, pills, counts, form-days readouts. Never use it for sentences.
- Review-specific copy is written in the brand voice (`branding.md` §6): name the outcome, specific numbers over adjectives, human. e.g. a banner reads "3 reviews pending your calibration sign-off" not "You have some reviews waiting!"
- Empty states always give the next move, not an apology: "No goals set. Start with last cycle's outcomes."
- Never center paragraphs of body text; only stat numerals and empty-state blocks may center.

## 6. Accessibility

- Focus is always visible: 2px `--teal` outline, 2px offset (global `:focus-visible`).
- Never convey state by color alone — pills and banners pair the color with text (mono label) and shapes (dot / border).
- Icon buttons need `aria-label`; popover triggers announce open/closed state; tables need `<th scope>`.
- WCAG AA contrast at 14px+ for signal text (use `--red-deep`/`#1f7a63`/`#0c7fae`, not the raw lighter signals, on washes).
- Minimum touch target 38–40px for interactive controls (buttons, icon-btn, nav items meet this).

## 7. Where the 8px bottom-left corner is allowed

The rounded bottom-left corner (`border-radius: 0 0 0 8px`; 10px on popovers/dropdowns) is the brand's signature, echoing the mark's single soft corner.

**Allowed on:** hero cards, brand frames, profile/drawer cards, dropdown panels (profile, notifications, search), avatars.
**Banned on:** buttons, inputs/selects/textareas, table cells, modals, pills, chips, toasts. Those stay sharp (except calendars' inner day cells, which use 6px interior rounding — an approved local exception).

## 8. Responsive anchors (from the reference CSS)

Header title hides ≤860px; drawer becomes an overlay drawer at all sizes on small screens; `--type` and `--form-row--2` grids collapse ≤760px; stat strips 2-up then 1-up; admin console stats 4→2→1 (900/600px); FAB and page padding tighten on phones. Never introduce a new breakpoint — reuse these.

## 9. What is explicitly out of the theme's vocabulary (banned in UI code)

Shadow-based elevation anywhere except the chat FAB glass; border radius >10px or rounded buttons; any non-teal gradient or rotated gradient; the raw signal hexes as text color; Photographic avatars for people; sentence-case buttons; arbitrary non-4pt values for spacing of neighbors (outer page gutters may land off-grid where the reference CSS does).
