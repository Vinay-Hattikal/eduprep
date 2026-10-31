# Design System

How the product looks and feels: **"Ink & Saffron"** (D-068). Warm paper, ink text, peacock teal for actions and saffron for achievement: a calm, editorial look that reads as Indian and trustworthy, and doesn't look like a generic AI-made SaaS template. The reasoning and the alternatives considered are in [redesign-plan.md](redesign-plan.md).

Tokens live as CSS variables in `src/app/globals.css` and are used through Tailwind classes. **Never hard-code colours, fonts or brand names in components.** (The one exception is a colour on the ink band, which is dark in both themes; say so in a comment.)

---

## 1. Principles

1. **Show the product, not icon cards.** Marketing pages show real pieces of the product (the exam window, the question palette, readiness bars) instead of grids of icons.
2. **Focus first.** Practice and test screens remove everything except the task: no ads, no clutter, no pop-ups.
3. **Trust through precision.** Display numerals, tabular figures, sources and verified dates shown openly.
4. **Mobile-first, desktop-great.** Design at 360 px first (no sideways scroll, enforced by e2e), then use the space on desktop.
5. **Asymmetry over symmetry.** Hero splits, mixed tile widths, numbered steps; avoid three identical centred cards.
6. **Accessible by default.** WCAG 2.2 AA contrast (enforced by `tests/unit/contrast.test.ts`), keyboard support, visible focus rings, `prefers-reduced-motion`.

## 2. Brand

The product is **AnyPrep** at **anyprep.in**. The name comes from one config file (`src/config/site.ts`, `NEXT_PUBLIC_APP_NAME`); `npm run check` fails if it appears anywhere else (D-021).

- **Mark:** an "A" on a teal tile with a saffron crossbar (`src/components/brand/logo.tsx`, `src/app/icon.svg`).
- **Wordmark:** the product name in Bricolage Grotesque, bold, tight tracking.
- **Social cards:** `src/lib/og-card.tsx`: paper background, ink text, a teal bar; no gradients.

## 3. Colour

### 3.1 Core palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FAF8F4` paper | `#0F1214` | Page background |
| `--surface` | `#F3EFE7` | `#14181B` | Bands, sidebars, table headers |
| `--card` | `#FFFFFF` | `#181D20` | Cards, inputs |
| `--foreground` | `#15171C` ink | `#ECE8E1` | Main text |
| `--muted-foreground` | `#5D6470` | `#9AA1AA` | Secondary text |
| `--border` | `#E4DED3` | `#283035` | Hairlines |
| `--primary` | `#0F6E6A` peacock teal | `#4FB3A9` | Actions, links, active states, focus ring |
| `--secondary` | `#E2EFEC` | `#12302D` | Quiet teal fills (active tab pill, chips) |
| `--highlight` | `#E8821E` saffron | `#F7A24B` | **Achievement only**: streaks, ranks, Pro, the hero marker |
| `--inverse` | `#15171C` | `#090B0D` | The ink band: footer, sign-in panel, audience panel, timer |

### 3.2 Status colours

`--success`, `--warning`, `--destructive`, `--info`, each with a `-foreground` that passes AA on it. Never use colour alone to show meaning; pair it with an icon or text.

### 3.3 Product tokens

| Token | Use |
|---|---|
| `--difficulty-easy` / `-medium` / `-hard` | Difficulty labels |
| `--palette-answered` / `-not-answered` / `-review` / `-not-visited` | Exam question palette (D-034 meanings; unchanged by the redesign) |
| `--chart-1` … `--chart-5` | Chart series: teal, saffron, blue, rose, olive |

### 3.4 Rules

- Teal does the work; saffron is a spark, used only for achievement. No colour gradients, and never on text. (The ruled-paper lines and the hero marker use CSS gradient syntax to draw flat, single-colour shapes.)
- Light and dark themes from day one (`next-themes`), following the system with a manual toggle.

## 4. Typography

| Role | Font | Variable | Notes |
|---|---|---|---|
| Display | **Bricolage Grotesque** | `--font-display` → `font-heading` | h1/h2, card titles, the wordmark, big numerals (`.numeral`). Tight tracking (−0.02 to −0.035 em). |
| UI and body | **Onest** | `--font-sans` | Body 1 rem / 1.6; legible on low-DPI phone screens. |
| Code | **JetBrains Mono** | `--font-code` → `font-mono` | Editor, test I/O, the exam timer. |
| Math | KaTeX | | Questions and explanations. |

All via `next/font/google` with `display: swap`. Page titles: 2.1 rem → 3 rem (public) and 1.75 rem → 2 rem (app). Numbers that matter (stats, readiness, prices) use `.numeral` (display face, tabular figures).

## 5. Layout and spacing

- 4 px spacing grid (Tailwind default scale). Cards use `--card-spacing: 1.25rem`.
- Radius: `--radius: 0.625rem`; feature tiles and big panels use `rounded-2xl`.
- Elevation: cards have a hairline border plus a soft paper shadow in light mode, none in dark. Hover lifts by 2 px (off with reduced motion).
- Content width: 1152 px (`max-w-6xl`) for public pages, 1280 px for app pages, 720 px for reading.
- Grid columns that hold cards get `min-w-0`, so wide content (tables) scrolls inside its card instead of widening the page.
- Breakpoints: Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280).

### Key screen layouts
| Screen | Phone | Desktop |
|---|---|---|
| Practice | Question → options → sticky "Check" button → explanation drawer | Question left, explanation and stats right |
| Test mode | Header with timer; palette in a bottom sheet | Question centre, palette sidebar right, section tabs top |
| Coding | Tabs: Problem / Code / Result | Resizable split: problem left, editor right, console below |
| Dashboard | Stacked cards | Grid: readiness, today's plan, streak, recent tests |
| Company page | Single column with sticky "Practice / Mock / Book interview" bar | Two columns with table of contents |

## 6. Components

- Base: **shadcn/ui** (Radix primitives), owned in `src/components/ui`.
- Icons: **lucide-react**, 16/20/24 px, stroke 1.75.
- Charts: one charting library, chosen in Phase 4 and recorded in decisions.md.
- Toasts: `sonner`.
- Every component has: default, hover, focus-visible, active, disabled and loading states, in both themes.
- Every data view has: loading (skeleton), empty (illustration + next action) and error (message + retry) states.

## 7. Motion

- Durations: 150 ms (hover/press), 200–250 ms (panels, dialogs), up to 400 ms for celebratory moments (streak, test complete).
- Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Correct answer: brief success pulse. Wrong: a short shake, then the explanation slides in.
- Turned off or reduced when `prefers-reduced-motion` is set.

## 8. Voice and copy

- Plain, encouraging, direct. "You're 62% ready for Accenture" beats "Readiness index: 0.62".
- Short sentences. Indian English spelling. Rupee prices as `₹1,499`.
- Error messages say what happened and what to do next.
- Avoid jargon in student-facing copy; explain terms like "negative marking" on first use.

## 9. Differentiators to design for

These are where we visibly beat existing prep sites:

1. **Real exam interface** for each assessment platform (TCS iON, HackerRank, AMCAT, Mettl styles).
2. **Readiness ring** per company on the dashboard and company pages.
3. **"Asked in Aug 2026" recency badges** and "last verified" dates on company data.
4. **Rich result analysis**: section breakdown, time per question, topic heatmap, percentile.
5. **Zero ads, zero clutter**, fast on low-end phones.
6. **Polished coding workspace** comparable to LeetCode, with company OA mode.
