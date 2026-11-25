# branding.md — Emids Brand System (App Digest)

Condensed operating rules extracted from *Emids Brand System v1.0* (May 2026, 38 slides). For visuals and layout, the implemented light theme in `ui.md` is the source of truth for code; this file carries the brand intent, the logo contract, and the rules not encoded in CSS. When a question is about *why* the UI looks the way it does, the answer is usually here.

## 1. Brand belief — three pillars

**Trust. Certainty. Outcomes.** Every screen, line of copy and image must be defensible against all three: trust (nothing borrowed, stocky, or decorative), certainty (specific and engineered — no "vibes"), outcomes (measurable against the baseline the user brought). A deliverable that can't pass all three doesn't ship. In practice: concrete numbers, verifiable states, no marketing gloss.

## 2. The logo contract

The Emids mark is a closed frame with two spines, three bars, and one rounded corner — the 8px bottom-left is the identity's only soft note. Treat the logo as system, not sticker.

- **Four lockups:** primary (default), inverted (on dark), white/mono (on dark), black/mono (on light). Reach for the one that matches the field.
- **Clear space:** one full X (the height of the symbol) on every side; nothing enters the X-ring.
- **Minimum sizes:** digital lockup 120px wide; digital icon 24px; favicon = icon only, primary or white.
- **Never:** rotate, stretch, recolor outside the system, add shadows, lay on busy photography, or invent new lockups.
- For this app: the header logo renders from `branding/` assets at 17px height (as in the reference layout). Below minimum size, switch to icon-only.

## 3. Color philosophy

**Color is architecture — 20% of every surface reads teal.** Teal anchors black, warm white and neutrals; blue/green/red signal function and never lead.

- **Canvas section (brand PDF):** Emids Black `#0e0e0e` is the brand default background (print/dark materials), Surface `#141414`, Surface-2 `#262626`, Warm White `#f2f2f0` (inversion surface). **Our app uses the light theme:** Warm White `--canvas #f2f2f0` ground + pure `--surface #ffffff` cards + Emids Black `#0e0e0e` as the text/anchor polarity — the same palette, inverted role assignment, and all values match the brand PDF exactly.
- **Signals:** Sterile Blue `#00b9f9` (data/links/do), Surgeon Green `#45bda0` (success), Signal Red `#e04f4f` (error). Volume low: max two signal colors per surface, never decoration, always paired with mono labels. WCAG AA contrast at 14px+.
- **Human accents:** Mauve `#b89dcb` (fabric/warmth) and Yellow `#f2c94c` (equipment/energy) — one accent in photography, up to two in data. Never decoration. Not currently used in app UI.
- **Forbidden pairings:** teal on sterile blue, vertical gradients, mauve+yellow together.

## 4. The teal gradient

One direction, three stops: `#9dc6cc (0%) → #72b3be (50%) → #57a6b3 (100%)`, left to right, never rotated. Use for hero washes, mark fill, transitions — **never** on buttons, small text/UI, under text, or in charts (the app uses it on the 4px top bar and modal/store bars only — compliant).

## 5. Typography + the mono pairing

One typeface family, eight steps; the mono pairing *is* what makes the design read engineered.

Brand scale (PDF): Display 96/0.8 Bold · H1 46/0.85 · H2 36/0.85 · H3 20/1.0 · Body-Lg 16/1.2 · Body 12/1.2 · Caption 11/1.4 Medium (caps) · Micro 9/1.3 Medium (caps). System fallback: Aptos.

App implementation (see `ui.md` §3.4): **Plus Jakarta Sans** carries both the text voice and the label ("mono") voice with tabular numerals. The all-caps, tracked label treatment at eyebrow/pill/table-header sizes is an approved adaptation of the brand's mono rules for app scale. Do not reintroduce Inter/JetBrains Mono without user approval.

## 6. Voice + tone

Direct. Informed. Human. — Name the outcome (no qualifiers, no hedges: the number, the timeframe, the customer). Speak the lane as a peer. Hold for the human (even with the CIO, the patient is in the room — in our domain: the employee receiving the review).

Self-edit checklist: claim not aspiration · specific not generic · outcome first not feature first · earned confidence not bravado. Example pattern for app copy: "3 reviews pending your sign-off — due Friday" beats "Stay on top of upcoming reviews!" For new screens, write microcopy in this voice and per `ui.md` §5.

## 7. Iconography

Geometric outline icons: 24px grid, **1.5px stroke, rounded caps, mitered joins**, never filled, never duplicated, never multicolor. Source: Tabler Icons v3.x (MIT). Sizes: 16 (nav/inline), 24 (default), 32 (callout), 120 (hero). Color: teal on light canvas / warm white on teal — never mixed within one surface.

## 8. Motion

Motion is architectural: things **resolve, never loop**. Timing bands (used verbatim in `ui.md` §3.6): instant/hover 0ms, snap 120ms linear (toggles, press), resolve 240ms `cubic-bezier(0.2,0,0,1)` (cards, modals), process 360–600ms (page transitions). One transform per element; no springs, no slide-and-fade without purpose; the end state is the brand state. Focus = 2px teal outline, 2px offset, sharp.

## 9. Grid + spacing

8pt baseline, 4pt snap (steps SP-1 4 / SP-2 8 / SP-3 16 / SP-4 24 / SP-5 32 / SP-6 48 / SP-7 64 / SP-8 96). 12-column grid, 14px gutter, 30px minimum margin; subdivide into 2/3/4/6 — **never 5 or 7**. Desktop container 1440px (web); the app uses 1280px content per reference CSS.

## 10. Imagery (if photography is ever added)

Three-step grade: desaturate 25–45% pulling warm tones neutral → 18–25% teal cast in shadows/midtones (highlights neutral) → one accent color only (mauve/yellow/sterile blue). Specific real moments, never stock smiles. Today the app surface is fully data/UI; photography is out of scope until the user requests it.

## 11. Quick reference — chapter map of the source PDF

01 Beliefs (p3–4) · 02 Tagline (p5) · 03 Logo lockups (p6–8) · 04 Mark anatomy + 8px BL corner (p9–11) · 05 Misuse (p12) · 06 Color (p13–18) · 07 Type (p19–22) · 08 Grid (p23) · 09 Icons (p24) · 10 Imagery (p25–29) · 11 Motion (p30) · 12 Voice (p31–32) · 13 Web (p33) · 14–15 Applications (p34–37) · 16 Contact (p38). Refer to slides by this numbering when raising brand questions.
