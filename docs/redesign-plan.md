# AnyPrep redesign plan (proposed, D-068)

**Status:** proposed 2026-10-31, waiting for the owner to pick a visual direction (section 2). Nothing is built yet.

**Goal:** replace the default look (stock shadcn, indigo, Geist, centred hero with three cards) with a distinctive brand for **AnyPrep** at **anyprep.in**, across all 115 pages, without breaking SEO, accessibility, the 360 px phone layout, the exam-hall fidelity of mock tests, or the performance budget (D-062).

---

## 1. Why the current UI feels "AI-made"

The pages use the exact defaults that design writers now list as tells of generated UI:

| Tell | Where it is today |
|---|---|
| Indigo/violet primary (`#4f46e5`) and indigo-to-amber gradients | `globals.css`, share cards, hero |
| Geist / Inter as the only typeface, one weight family for everything | `src/app/layout.tsx` |
| Stock shadcn components (same radius, borders, shadows everywhere) | `src/components/ui/*` |
| Centred hero, then rows of identical rounded cards | `src/app/(public)/page.tsx`, most list pages |
| Icons in pastel circles on every card, no real product shown | landing and dashboard |

The fix is not a new component library; it's taking design decisions the defaults skip: a real type pairing, a palette with a point of view, a layout grid with asymmetry, real product screenshots instead of icon cards, and a few signature elements used consistently.

---

## 2. Visual direction (owner picks one)

All three use free, open-licence Google Fonts (via `next/font`, self-hosted, no layout shift) and pass WCAG AA contrast in light and dark.

### A. "Ink & Saffron" (recommended)

Warm, confident and Indian without clichés: paper-white surfaces, deep ink text, a peacock-teal primary and a saffron accent for streaks, ranks and Pro.

| Token | Light | Dark |
|---|---|---|
| Background | `#FAF8F4` (paper) | `#0F1214` |
| Surface / card | `#F3EFE7` / `#FFFFFF` | `#161A1D` / `#1B2024` |
| Text / muted | `#15171C` / `#5D6470` | `#ECE8E1` / `#9AA1AA` |
| Primary (peacock teal) | `#0F6E6A` | `#4FB3A9` |
| Accent (saffron) | `#E8821E` | `#F7A24B` |
| Success / warning / danger | `#2F7D4F` / `#B7791F` / `#C2412D` | `#5CC48A` / `#E9B44C` / `#F07A62` |

- **Type:** Bricolage Grotesque (display: headlines, numbers, scores) + Onest (UI and body) + JetBrains Mono (code, IDs).
- **Signature elements:** oversized score and rank numerals; a thin ruled "exam paper" grid behind hero and results; saffron underline marks for highlights; product screenshots in a soft paper frame.
- **Why:** reads as serious exam prep (trust for parents and colleges) but warm; no other Indian prep brand owns teal + saffron.

### B. "Exam Hall"

Precise and editorial, like a well-set question paper: cool white, cobalt primary, serif headlines.

- **Palette:** background `#F7F8FA`, text `#111827`, primary cobalt `#2341C7`, accent vermilion `#E5484D`, dark mode navy `#0B1020`.
- **Type:** Instrument Serif (headlines) + Hanken Grotesk (UI) + JetBrains Mono.
- **Signature:** serif headlines with tabular numerals, hairline rules, section numbers like a paper ("01 Aptitude"), monochrome illustrations.
- **Why:** feels premium and academic; strongest for company and question pages; a little colder for a student audience.

### C. "Night Desk"

Dark-first and energetic, for the late-night coding crowd: near-black base, electric lime accent.

- **Palette:** background `#0C0D10`, card `#15171C`, text `#F2F2F0`, primary lime `#C6F432` (on dark) / `#4D7C0F` (light mode), accent coral `#FF7A59`.
- **Type:** Space Grotesk (display) + Figtree (UI) + JetBrains Mono.
- **Signature:** terminal-style code blocks, glowing progress rings, bento grid on the landing page.
- **Why:** stands out and suits coding; less reassuring for aptitude-first freshers and their parents.

**Recommendation: A.** It fits the whole audience (freshers, experienced engineers, colleges), works in both modes, and gives the scores, streaks and ranks a natural highlight colour.

---

## 3. Rules for every page (so it never drifts back)

1. **One gradient at most per screen**, never on text. Solid colour first.
2. **Show the product**, not icons: hero and feature sections use real screenshots of the test runner, coding workspace, company page and results.
3. **Asymmetric layouts:** 12-column grid with 7/5 and 8/4 splits; no rows of three identical cards on marketing pages.
4. **Type does the work:** display font for headings and numbers only; body at 16 px / 1.6; tabular numerals for scores, timers and prices.
5. **Colour has a job:** primary for actions, accent only for achievement (streaks, ranks, Pro); status colours only for status.
6. **Density by area:** marketing is roomy; student app is calm; admin is compact; the exam runner copies real exam platforms (unchanged behaviour, restyled chrome only).
7. **Motion:** 150–250 ms ease, only for state changes (save, submit, rank up); respects `prefers-reduced-motion`.
8. **Accessibility:** AA contrast checked by a test; visible focus rings; 44 px touch targets on phones.

---

## 4. Implementation phases

Each phase ships on its own branch, with `/code-review` and `/simplify`, full test suites and screenshots before merge (as before).

| # | Phase | What changes | Size |
|---|---|---|---|
| R.0 | **Brand and domain** | Name **AnyPrep** in `src/config/site.ts` and env (D-021 keeps it in one place); `NEXT_PUBLIC_APP_URL=https://anyprep.in`; new wordmark and favicon set (SVG, 16–512 px, maskable); OG card and email templates rebranded; brand check updated. | S |
| R.1 | **Design tokens and fonts** | New colour, type, spacing, radius, shadow and motion tokens in `globals.css` (light and dark); fonts via `next/font/google`; chart palette; `docs/design-system.md` rewritten. A living **style guide page** (`/admin/style-guide`) showing every token and component. | M |
| R.2 | **Core components** | Restyle `src/components/ui` and `shared`: button (sizes, weights, pressed state), input and select, card (flat with ruled header instead of shadow), badge and status chips, tabs (underline style), table (zebra-free, sticky header), dialog and sheet, toast, empty and error states, skeletons, stat cards, page header. Same props, so pages keep working. | M |
| R.3 | **Shells and navigation** | Public header (wordmark, mega menu for Companies / Practice / Coding / Mock tests, sign-in), footer; student app: left rail on desktop, bottom nav on phones, streak and rank in the top bar; admin: compact sidebar with groups and search; exam shell untouched except colours. | M |
| R.4 | **Landing page and marketing** | New home: asymmetric hero with a live-looking test runner screenshot, "pick your company" strip, how it works in 3 numbered steps, real stats, testimonials slot, pricing teaser, FAQ (with FAQ structured data). Pricing, become-interviewer and legal pages restyled. | L |
| R.5 | **Public content pages (SEO)** | Companies directory and company page (hiring timeline as a vertical step rail, eligibility card, section chips), question and topic pages, coding problem pages, mock test pages, jobs. Same URLs, metadata and structured data. | L |
| R.6 | **Student app** | Dashboard (today's plan, readiness ring per target company, streak), practice session, daily question, progress charts, test list and results (score hero, section breakdown, percentile), coding workspace (editor theme matched to palette), interviews, contests and leaderboard, achievements and share cards, account. | L |
| R.7 | **Exam runner and coding judge chrome** | Keep TCS iON / AMCAT-style behaviour; restyle palette, timer, section tabs and question palette with the new tokens; check every state (answered, review, not visited) still matches D-034 colours. | M |
| R.8 | **Auth, onboarding, emails** | Sign-in, sign-up, verify, reset (split screen with product shot), onboarding steps; transactional emails in the new brand. | S |
| R.9 | **Admin and interviewer** | Denser tables, form sections with sticky save bar, the company workspace tabs and checklist restyled. | M |
| R.10 | **Quality gate** | Playwright screenshot baselines (desktop and 360 px, light and dark) for ~30 key pages; automated contrast check of the token pairs; performance budget re-measured (fonts must not push LCP over 2.5 s); all e2e selectors kept. | M |

**Suggested order:** R.0 → R.1 → R.2 → R.3 (the whole app changes look at once, with no page work), then R.4 and R.5 (what visitors and Google see), R.6–R.8 (students), R.9, with R.10 run after each phase and in full at the end.

---

## 5. What stays the same

- URLs, page titles, metadata, sitemaps and structured data (SEO keeps its ranking).
- Every behaviour, form, permission and data flow; this is a visual redesign.
- The exam runner's interaction model (it copies real company test platforms on purpose).
- Test IDs and accessible names used by the e2e suite.

---

## 6. Owner decisions needed

1. **Visual direction:** A (recommended), B or C, or a mix (e.g. A's colours with B's serif headlines).
2. **Logo:** a typographic wordmark now (built in R.0), or a designer's logo later (the wordmark is easy to swap).
3. **Screenshots on the landing page:** use the sample content (Acme Technologies, clearly marked as an example) until real company content is in.
4. **Brand name casing:** "AnyPrep" (recommended) or "anyprep".
