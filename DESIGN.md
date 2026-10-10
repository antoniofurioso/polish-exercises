# PolishUp design system

White and red from the Polish flag: minimal, spacious and easy to read. The
whole look is defined in **one file, `app/globals.css`**. Change a token there
and every page follows. Pages never write raw hex colours.

## Tokens (`app/globals.css`, section 1)

| Token | Light | Use |
| --- | --- | --- |
| `--background` | `#ffffff` | Page ground. Also the manifest's theme colour (`app/manifest.ts` reads it). |
| `--subtle` | `#fafafb` | Alternate landing sections; the app's canvas behind cards. |
| `--surface` | `#ffffff` | Cards, inputs, the sidebar. |
| `--chip` | `#f3f3f5` | Chips, segmented controls, empty meters. |
| `--foreground` / `--foreground-soft` / `--muted` | `#16161a` / `#3a3b44` / `#5b5c66` | Text: primary, secondary, captions (all AA on white). |
| `--line` / `--line-strong` | `#ececef` / `#e2e2e7` | Card borders / control borders. |
| `--accent` / `--accent-strong` | `#dc143c` / `#b01030` | Red as text and icons (flag red). |
| `--accent-fill` / `--accent-fill-hover` / `--on-accent` | `#dc143c` / `#b01030` / `#fff` | Red as a fill under white text (buttons, the feature panel). |
| `--accent-soft` / `--accent-line` | `#fdeef1` / `#fbd5dc` | Tinted backgrounds and borders (selected options, wrong answers, icon tiles). |
| `--ok`, `--ok-soft`, `--ok-line` | greens | A right answer. Always shown with a check icon, never colour alone. |
| `--warn`, `--warn-soft` | ambers | Accents-only misses, storage warnings. |
| `--radius-control` / `--radius-card` / `--radius-panel` | 12 / 20 / 24 px | Controls, cards, the red panel. |

Dark mode redefines the same tokens: on the device setting, unless Settings
says otherwise (`<html data-theme="light|dark">`, set before paint by the
script in `app/layout.tsx`, stored under `polish.theme.v1`). In dark, red text
(`--accent`) is lighter than red fills (`--accent-fill`) so both stay readable.

Every token is also a Tailwind colour (`bg-subtle`, `text-muted`,
`border-accent-line`…) through the `@theme inline` block.

## Type

- **Inter** for the interface, **Source Serif 4** for Polish sentences
  (`.sentence`, `font-serif`). Both load in `app/layout.tsx` with `latin-ext`.
- `.display` (hero), `.heading` (section titles), `.page-title` (app pages),
  `.lead` (intro paragraphs), `.eyebrow` (red caps label), `.label-caps` (grey
  caps label), `.link`.

## Components (`app/globals.css`, section 3)

| Class | What |
| --- | --- |
| `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-inverse` | Buttons; size with `.btn-sm` / `.btn-lg`, full width with `.btn-block`. `.btn-inverse` is the white button on a red panel. |
| `.icon-btn` | A 44 px square icon button (always with an `aria-label`). |
| `.card`, `.card-raised`, `.card-link` | Surfaces; `.card-link` turns a card into a link with a red hover border. |
| `.panel-accent` | The one red feature panel a screen may have (today's practice, the closing call to action). |
| `.tile`, `.tile-sm` | The red-tinted square behind a drill icon. |
| `.chip`, `.chip-accent`, `.chip-ok` | Small labels. |
| `.input`, `.field-label` | Text fields. |
| `.seg` | Segmented choice; children are `<button aria-pressed>`. |
| `.switch` | On/off toggle: `<button role="switch" aria-checked>`. |
| `.meter` | A progress bar: `<div class="meter"><span style="width: 40%"></span></div>`. |
| `.container-page`, `.section`, `.section-alt` | Page width (75 rem, 16 px gutter on phones) and section rhythm. |

React pieces built on them: `components/ui.tsx` (configurator `Choice` and
`Field`), `components/progress.tsx` (`ActivityGrid`, `StatCard`,
`WeakSpotList`), `components/AppShell.tsx` (`AppShell`, `AppPage`),
`components/Logo.tsx`, `components/Infographics.tsx`.

## Icons

[Lucide](https://lucide.dev) (`lucide-react`), stroke 1.75, 16–24 px, always
`aria-hidden` next to a text label. One icon per drill lives in
`components/DrillIcon.tsx`; use it wherever a drill is listed.

## Layout

- Public pages (`app/(site)/`): sticky header, `.container-page` sections, footer.
- The app (`app/(app)/`): a sidebar from 768 px up; on a phone, a top bar and
  bottom tabs (Home, Practise, Progress, Account), with the account pages
  linked by `AccountTabs`.
- A session (`/today`, `/practice`) runs full screen: ✕, progress bar, sound.
- Everything works at 360 px wide with no horizontal scroll; touch targets are
  at least 44 px. Long content wraps instead of widening the page (the hint
  after an exercise's gap may drop to the next line, long Polish words break).
  `overflow-x: clip` on `html` and `body` is only the safety net: fix the
  element, don't rely on the clip.

## Rules

1. New colours become tokens first, with a dark value in both dark blocks.
2. One red fill per screen region: a primary button or the red panel, not both
   competing.
3. Polish text is `lang="pl"` and, when it is a sentence or a form, `.sentence`.
4. Infographics take their data from the grammar code and the scheduler
   (`caseForms`, `reviewIntervals` in `lib/guides.ts`), never typed by hand.
