# Design System

How EduPrep looks and feels. The goal: a product that feels **modern, fast and trustworthy**, clearly better than the dated, ad-heavy look of IndiaBix and PrepInsta. Benchmarks: the clarity of Linear and Vercel, LeetCode's coding workspace, and the motivating progress feedback of Duolingo.

Tokens defined here are implemented as CSS variables in `src/app/globals.css` and used through Tailwind classes. **Never hard-code colours, fonts or brand names in components.**

---

## 1. Principles

1. **Focus first.** Practice and test screens remove everything except the task: no ads, no clutter, no pop-ups.
2. **Feedback is instant and clear.** Right or wrong, time taken and progress are always visible.
3. **Trust through precision.** Clean typography, aligned numbers, sources and verified dates shown openly.
4. **Mobile-first, desktop-great.** Design at 360 px first, then use the extra space on desktop for side panels (question palette, explanation, analytics).
5. **Fast feels premium.** Server rendering, skeleton loaders instead of spinners, optimistic updates where safe.
6. **Accessible by default.** WCAG 2.2 AA contrast, full keyboard support, visible focus rings, respect `prefers-reduced-motion`.

## 2. Brand

Brand values come from one config file (`src/config/site.ts`) and environment variables, so renaming the product is a config change (D-021):

```ts
export const siteConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "EduPrep",
  shortName: "EduPrep",
  tagline: "Get placement-ready, company by company",
  description: "...",
  url: process.env.NEXT_PUBLIC_APP_URL,
  supportEmail: "...",
  social: { linkedin: "", instagram: "", youtube: "", telegram: "" },
};
```

The logo is a placeholder wordmark (product name in the display font plus a simple geometric mark) until the final name is chosen. Logo files live in `public/brand/`.

## 3. Colour

Semantic tokens (shadcn/ui convention plus product-specific tokens). Values are a starting point; tune them in one place.

### 3.1 Core palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FFFFFF` | `#0B0F19` | Page background |
| `--surface` | `#F8FAFC` | `#111827` | Cards, panels |
| `--foreground` | `#0F172A` | `#E5E7EB` | Main text |
| `--muted-foreground` | `#64748B` | `#94A3B8` | Secondary text |
| `--border` | `#E2E8F0` | `#1F2937` | Borders, dividers |
| `--primary` | `#4F46E5` (indigo) | `#818CF8` | Main actions, links, active states |
| `--primary-foreground` | `#FFFFFF` | `#0B0F19` | Text on primary |
| `--accent` | `#F59E0B` (amber) | `#FBBF24` | Highlights: streaks, achievements, "new", Pro badge |
| `--ring` | `#6366F1` | `#A5B4FC` | Focus ring |

### 3.2 Status colours

| Token | Light | Dark | Use |
|---|---|---|---|
| `--success` | `#047857` | `#34D399` | Correct answer, accepted, passed |
| `--danger` | `#DC2626` | `#F87171` | Wrong answer, errors, destructive actions |
| `--warning` | `#B45309` | `#FBBF24` | Time running out, needs attention |
| `--info` | `#0369A1` | `#38BDF8` | Tips, neutral notices |

Never use colour alone to show meaning. Pair it with an icon or text (e.g. ✓ Correct, ✗ Wrong).

### 3.3 Product tokens

| Token | Use |
|---|---|
| `--difficulty-easy` / `-medium` / `-hard` | Difficulty badges (green / amber / red tones) |
| `--palette-answered` | Test palette: answered (success) |
| `--palette-not-answered` | Visited, not answered (danger) |
| `--palette-review` | Marked for review (violet `#7C3AED`) |
| `--palette-answered-review` | Answered and marked for review (violet + success dot) |
| `--palette-not-visited` | Not visited (neutral border) |
| `--chart-1` … `--chart-5` | Chart series colours (colour-blind safe, defined with the charts work) |

### 3.4 Themes

Light and dark modes from day one (`next-themes`), following the system setting with a manual toggle. **Test mode** uses a calm, low-distraction variant: neutral background, no accent colours except the timer and palette.

## 4. Typography

| Role | Font | Notes |
|---|---|---|
| UI and body | **Geist Sans** (via `next/font`) | Clean and highly legible. Tabular numbers for scores and timers. |
| Code | **Geist Mono** | Editor, code snippets, test I/O |
| Math | KaTeX | Rendered in questions and explanations |

Type scale (rem): 0.75 · 0.875 · **1 (body)** · 1.125 · 1.25 · 1.5 · 1.875 · 2.25 · 3. Body line height 1.6; headings 1.2. Question text uses 1.0625–1.125 rem for readability during long tests.

## 5. Layout and spacing

- 4 px spacing grid (Tailwind default scale).
- Border radius: `--radius: 0.75rem` for cards, smaller for inputs and badges.
- Content width: 1280 px max for app pages, 720 px for reading (explanations, articles).
- Breakpoints: Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280).
- Shadows: subtle, used only for elevated elements (menus, dialogs, sticky headers).

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
