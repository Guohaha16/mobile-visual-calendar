# Editorial Home Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved cool-white editorial palette to the home bookshelf without changing the warm paper treatment of the month calendar.

**Architecture:** Keep semantic colors in global CSS variables, keep the twelve book colors and contrast-safe book ink in a focused TypeScript palette module, and give `BackgroundScene` an explicit surface mode selected by the active route. Component CSS consumes those tokens; no storage or routing contracts change.

**Tech Stack:** React, TypeScript, CSS Modules, Vitest, Testing Library, Playwright.

---

### Task 1: Lock The Editorial Color Contract

**Files:**
- Create: `src/features/shelf/editorialPalette.test.ts`
- Create: `src/features/shelf/editorialPalette.ts`
- Create: `src/styles/themeContract.test.ts`
- Modify: `src/styles/tokens.css`

- [ ] **Step 1: Write failing palette tests**

Assert that the twelve month treatments include the approved exhibition colors and pair dark covers with light ink:

```ts
expect(getEditorialBookTreatment(7)).toEqual({
  paper: "#1F3048",
  ink: "#F7F6F2",
});
expect(new Set(EDITORIAL_BOOK_TREATMENTS.map(({ paper }) => paper))).toEqual(
  expect.objectContaining({ size: 12 }),
);
```

Import `tokens.css?raw` and assert the approved canvas, ink, primary, active, glass, and neutral-shadow values are present.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/features/shelf/editorialPalette.test.ts src/styles/themeContract.test.ts
```

Expected: FAIL because the palette module and approved CSS variables do not exist.

- [ ] **Step 3: Implement the minimal palette contract**

Create twelve stable `{ paper, ink }` treatments using:

```ts
[
  "#E88AB1", "#37623F", "#EA632F", "#2A2928",
  "#ED8CB5", "#B96886", "#1F3048", "#E34B4A",
  "#2F579E", "#DDE1DF", "#3A1814", "#DFA93A",
]
```

Add global tokens for exhibition white `#F2F2EF`, near-black `#181716`, orange-red `#EA632F`, signal red `#E34B4A`, neutral glass, and neutral shadows. Keep `--color-paper: #F7F1E7` for calendar reading surfaces.

- [ ] **Step 4: Run tests and verify GREEN**

Run the focused tests and expect both files to pass.

### Task 2: Separate Home And Calendar Background Surfaces

**Files:**
- Modify: `src/features/background/BackgroundScene.test.tsx`
- Modify: `src/features/background/BackgroundScene.tsx`
- Modify: `src/features/background/BackgroundScene.module.css`
- Modify: `src/app/AppShell.test.tsx`
- Modify: `src/app/AppShell.tsx`

- [ ] **Step 1: Write failing surface tests**

Render `BackgroundScene` with `surface="editorial"` and assert
`data-surface="editorial"`. In `AppShell.test.tsx`, assert the shelf route uses
the editorial surface and the calendar route uses the paper surface.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/features/background/BackgroundScene.test.tsx src/app/AppShell.test.tsx
```

Expected: FAIL because `BackgroundScene` has no surface contract.

- [ ] **Step 3: Implement route-selected surfaces**

Add `surface?: "editorial" | "paper"` to `BackgroundScene`, default it to
`"paper"`, expose it as `data-surface`, and pass the active route choice from
`AppShell`. Use a solid exhibition-white fallback for the shelf and the existing
warm paper fallback for calendar and diary routes. Use neutral white scrims for
the editorial surface and warm paper scrims for the paper surface.

- [ ] **Step 4: Run tests and verify GREEN**

Run the focused tests and expect all background and shell tests to pass.

### Task 3: Apply The Palette To The Home Bookshelf

**Files:**
- Modify: `src/features/shelf/MonthBook.test.tsx`
- Modify: `src/features/shelf/MonthBook.tsx`
- Modify: `src/features/shelf/MonthBook.module.css`
- Modify: `src/features/shelf/BookShelf.module.css`
- Modify: `src/features/shelf/YearShelfPage.module.css`
- Modify: `src/components/FrostedIconButton.module.css`
- Modify: `src/components/BottomNav.module.css`
- Modify: `src/features/background/BackgroundPicker.module.css`
- Modify: `src/styles/themeContract.test.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write a failing month treatment test**

Render July and assert its slot receives `--book-paper: #1F3048` and
`--book-ink: #F7F6F2`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/features/shelf/MonthBook.test.tsx
```

Expected: FAIL because `MonthBook` still uses the pastel palette and fixed ink.

- [ ] **Step 3: Apply semantic tokens**

Use `getEditorialBookTreatment(month)` in `MonthBook`. Replace warm brown shelf,
glass, shadow, and command colors with the approved neutral structure,
signal-red active state, and orange-red add action. Neutralize the background
picker sheet and date labels because the picker opens from the home route. Set
the global canvas to exhibition white while preserving the paper token for
calendar surfaces.

- [ ] **Step 4: Verify components**

Run:

```bash
npm test -- src/features/shelf src/features/background src/app
npm run lint
npm run build
```

Expected: all tests, lint, and build pass.

### Task 4: Validate The Visual Result

**Files:**
- No production files unless visual validation identifies a defect.

- [ ] **Step 1: Capture mobile screenshots**

Capture `390 x 844` and `320 x 568` views from the running Vite server.

- [ ] **Step 2: Inspect visual constraints**

Verify:

- The fallback canvas is cool white rather than cream.
- Near-black headings remain legible.
- Pink, green, orange-red, navy, cobalt, gray, burgundy, and mustard books are visible without one hue dominating.
- Glass controls are neutral.
- The add action is orange-red and the active shelf action is signal red.
- No control overlap or text clipping appears.
- Navigating to a calendar route restores warm paper.

- [ ] **Step 3: Run final verification and commit**

Run full tests, lint, build, and `git diff --check`, then commit the implementation as:

```bash
git commit -m "style: apply editorial home palette"
```
