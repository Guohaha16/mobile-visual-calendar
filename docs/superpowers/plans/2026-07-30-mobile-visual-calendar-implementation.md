# Mobile Visual Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable, image-first visual diary PWA with a draggable twelve-month bookshelf, a clipped-paper month calendar, a near-full-screen diary composer, private Supabase storage, and an IndexedDB offline outbox.

**Architecture:** React components read local diary state from Dexie and never query Supabase directly. Writes commit optimistically to Dexie, enter an ordered outbox, and synchronize through a narrow cloud gateway; Supabase PostgreSQL and private Storage remain authoritative when connected. Auth is silent and anonymous for the demo, while all visual geometry is authored with CSS variables, CSS Modules, the supplied bitmap references, and Motion.

**Tech Stack:** React, TypeScript, Vite, Motion, Dexie, Zustand, Supabase JS, Lucide React, vite-plugin-pwa, Vitest, Testing Library, Playwright.

---

## Scope And Checkpoints

This plan implements the approved design in three independently reviewable vertical slices:

1. **Checkpoint 1:** Application shell, light background system, bottom navigation, and interactive year bookshelf.
2. **Checkpoint 2:** Supplied paper template, complete seven-column calendar, day-cell visuals, and background picker.
3. **Checkpoint 3:** Diary sheet, image-first composer, delete flow, anonymous cloud synchronization, offline behavior, and PWA verification.

Do not continue past a checkpoint until the user has opened the local URL and given feedback.

## File Structure

### Project And Tooling

- `package.json`: scripts and dependencies.
- `index.html`: application entry document.
- `vite.config.ts`: React, PWA, aliases, asset limits, and dev configuration.
- `vitest.config.ts`: unit/component test environment.
- `playwright.config.ts`: mobile and desktop browser projects.
- `eslint.config.js`: browser and TypeScript lint rules.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`: strict TypeScript configuration.
- `.env.example`: Supabase browser environment variable names.

### Application Core

- `src/main.tsx`: React root and service worker registration.
- `src/app/App.tsx`: route-level application composition.
- `src/app/AppShell.tsx`: background scene, bottom navigation, and sheet portal.
- `src/app/appStore.ts`: transient year, month, route, sheet, and picker state.
- `src/app/routes.ts`: URL parsing and serialization.
- `src/styles/tokens.css`: visual tokens.
- `src/styles/global.css`: reset, viewport, typography, and accessibility rules.

### Domain

- `src/domain/types.ts`: diary, media, preference, and synchronization types.
- `src/domain/date.ts`: local-date and calendar-grid functions.
- `src/domain/shelf.ts`: stable book geometry and cover selection.
- `src/domain/background.ts`: random/pinned background resolution.

### Data

- `src/data/local/db.ts`: Dexie schema and migrations.
- `src/data/local/diaryRepository.ts`: local CRUD and live-query helpers.
- `src/data/sync/outbox.ts`: ordered operation processing and retry rules.
- `src/data/sync/syncService.ts`: pull/push orchestration and connectivity triggers.
- `src/data/cloud/cloudGateway.ts`: cloud interface.
- `src/data/cloud/supabaseClient.ts`: optional browser client construction.
- `src/data/cloud/supabaseGateway.ts`: anonymous session, rows, and Storage operations.
- `supabase/migrations/202607300001_visual_diary.sql`: tables, indexes, and RLS.

### Shared UI

- `src/components/FrostedIconButton.tsx`: accessible glass icon button.
- `src/components/BottomNav.tsx`: bookshelf, add, and calendar navigation.
- `src/components/SyncStatus.tsx`: waiting, syncing, failed, and online states.

### Features

- `src/features/background/BackgroundScene.tsx`: background image, fallback, and lightness scrim.
- `src/features/background/BackgroundPicker.tsx`: diary-image selection and random mode.
- `src/features/shelf/YearShelfPage.tsx`: year controls and page structure.
- `src/features/shelf/BookShelf.tsx`: horizontal drag constraints and parallax.
- `src/features/shelf/MonthBook.tsx`: spine, cover, focus, and turn animation.
- `src/features/calendar/MonthCalendarPage.tsx`: month navigation and paper composition.
- `src/features/calendar/CalendarPaper.tsx`: supplied template and grid geometry.
- `src/features/calendar/DayCell.tsx`: latest image or handwritten excerpt.
- `src/features/diary/DiarySheet.tsx`: date-bound near-full-screen layer.
- `src/features/diary/DiaryTimeline.tsx`: full-width chronological records.
- `src/features/diary/DiaryComposer.tsx`: images, text, paste, and send.
- `src/features/diary/media.ts`: image validation and thumbnail generation.

### Tests And Assets

- `src/test/setup.ts`: Testing Library, IndexedDB, and browser API setup.
- `src/test/render.tsx`: provider-aware render helper.
- `src/**/*.test.ts`, `src/**/*.test.tsx`: focused unit and component tests.
- `e2e/bookshelf.spec.ts`, `e2e/calendar.spec.ts`, `e2e/diary.spec.ts`, `e2e/pwa.spec.ts`: browser workflows.
- `public/assets/calendar-paper-template.png`: approved transparent paper asset.
- `public/fonts/MaShanZheng-Regular.ttf`: self-hosted calendar handwriting font.
- `public/fonts/OFL.txt`: font license.
- `public/icons/`: generated install icons.

---

### Task 1: Bootstrap The Tested React PWA Shell

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `eslint.config.js`
- Create: `src/test/setup.ts`
- Test: `src/app/App.test.tsx`
- Create: `src/app/App.tsx`
- Create: `src/main.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`

- [ ] **Step 1: Create the package manifest and install the toolchain**

Create `package.json`:

```json
{
  "name": "mobile-visual-calendar",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "preview": "vite preview --host 0.0.0.0",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "e2e": "playwright test"
  }
}
```

Run:

```bash
npm install react react-dom motion dexie dexie-react-hooks zustand @supabase/supabase-js lucide-react react-router-dom
npm install -D typescript vite @vitejs/plugin-react vite-plugin-pwa workbox-window vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb eslint @eslint/js globals typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh @playwright/test
```

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 2: Add strict TypeScript, Vite, Vitest, and HTML configuration**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true
  }
});
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
```

Create `eslint.config.js`:

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "playwright-report", "test-results"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  }
);
```

Configure `tsconfig.app.json` with `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `jsx: "react-jsx"`, and DOM libraries. Configure `vite.config.ts` with the React plugin only; PWA configuration is added in Task 14.

- [ ] **Step 3: Write the failing application smoke test**

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the visual diary application shell", () => {
    render(<App />);
    expect(screen.getByRole("main", { name: "Visual diary" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the smoke test and verify the expected failure**

Run:

```bash
npm test -- src/app/App.test.tsx
```

Expected: FAIL because `src/app/App.tsx` does not exist.

- [ ] **Step 5: Implement the minimal application shell**

Create `src/app/App.tsx`:

```tsx
export function App() {
  return <main aria-label="Visual diary" />;
}
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Create `src/styles/tokens.css` with the approved warm paper, coral, sage, fog-blue, mustard, rose, ink, glass, blur, radius, and motion-duration variables. Create `src/styles/global.css` with a light `color-scheme`, zero margin, full-height root, visible focus rings, and reduced-motion overrides.

- [ ] **Step 6: Verify tests and build**

Run:

```bash
npm test -- src/app/App.test.tsx
npm run build
```

Expected: one passing test and a successful production build.

- [ ] **Step 7: Commit the shell**

```bash
git add package.json package-lock.json index.html tsconfig*.json vite.config.ts vitest.config.ts eslint.config.js src
git commit -m "chore: bootstrap tested visual diary app"
```

---

### Task 2: Define Local Dates, Domain Types, Shelf Geometry, And Background Rules

**Files:**
- Create: `src/domain/types.ts`
- Test: `src/domain/date.test.ts`
- Create: `src/domain/date.ts`
- Test: `src/domain/shelf.test.ts`
- Create: `src/domain/shelf.ts`
- Test: `src/domain/background.test.ts`
- Create: `src/domain/background.ts`

- [ ] **Step 1: Write failing domain tests**

Create tests that assert:

```ts
expect(toLocalDateKey(new Date(2026, 6, 29, 23, 30))).toBe("2026-07-29");
expect(buildMonthGrid(2026, 7)).toHaveLength(42);
expect(buildMonthGrid(2026, 7).filter((day) => day.inMonth)).toHaveLength(31);

expect(createBookGeometry(2026, 7)).toEqual(createBookGeometry(2026, 7));
expect(createBookGeometry(2026, 7)).not.toEqual(createBookGeometry(2026, 8));

expect(resolveBackground({ mode: "pinned", pinnedAssetId: "missing" }, assets, () => 0))
  .toEqual({ mode: "random", asset: assets[0] });
expect(selectMonthCover(entries)).toBe("latest-image-id");
```

- [ ] **Step 2: Run the domain tests and verify failure**

Run:

```bash
npm test -- src/domain/date.test.ts src/domain/shelf.test.ts src/domain/background.test.ts
```

Expected: FAIL because the domain modules do not exist.

- [ ] **Step 3: Implement domain types and pure functions**

Define:

```ts
export type DiaryEntry = {
  id: string;
  userId: string;
  entryDate: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  media: MediaAsset[];
  syncState: "local" | "waiting" | "syncing" | "synced" | "failed";
};

export type MediaAsset = {
  id: string;
  entryId: string;
  userId: string;
  storagePath?: string;
  mimeType: string;
  width?: number;
  height?: number;
  sortOrder: number;
  createdAt: string;
  localBlob?: Blob;
  thumbnailBlob?: Blob;
};

export type BackgroundPreference =
  | { mode: "random"; pinnedAssetId?: never }
  | { mode: "pinned"; pinnedAssetId: string };

export type OutboxOperation = {
  id: string;
  kind: "create-entry" | "delete-entry" | "upsert-preference";
  entityId: string;
  createdAt: string;
  attempts: number;
  state: "waiting" | "syncing" | "failed";
  nextAttemptAt?: string;
  deletedAt?: string;
};

export type StoredPreference = {
  key: "background";
  value: BackgroundPreference;
  updatedAt: string;
};

export type SyncMeta = {
  key: "cursor";
  value?: string;
};
```

Implement a 42-cell Sunday-first calendar grid, local date formatting without UTC truncation, deterministic seeded shelf geometry, latest-image cover selection, and pinned/random background resolution with injectable randomness.

- [ ] **Step 4: Verify the domain tests**

Run:

```bash
npm test -- src/domain/date.test.ts src/domain/shelf.test.ts src/domain/background.test.ts
```

Expected: all domain tests pass.

- [ ] **Step 5: Commit the domain**

```bash
git add src/domain
git commit -m "feat: define visual diary domain rules"
```

---

### Task 3: Build The Dexie Local Repository

**Files:**
- Create: `src/data/local/db.ts`
- Test: `src/data/local/diaryRepository.test.ts`
- Create: `src/data/local/diaryRepository.ts`

- [ ] **Step 1: Write failing repository tests**

Cover:

```ts
const saved = await repository.createEntry({
  entryDate: "2026-07-29",
  text: "A long afternoon",
  media: []
});
expect(saved.syncState).toBe("waiting");
expect(await repository.listEntriesForDate("2026-07-29")).toEqual([saved]);
expect(await repository.listYearImages(2026)).toEqual([]);
expect(await repository.listDiaryImages()).toEqual([]);

await repository.deleteEntry(saved.id, "2026-07-29T12:00:00.000Z");
expect(await repository.listEntriesForDate("2026-07-29")).toEqual([]);
expect(await repository.listOutbox()).toMatchObject([
  { kind: "create-entry" },
  { kind: "delete-entry" }
]);
```

Reset the named test database after each test.

- [ ] **Step 2: Run the repository test and verify failure**

Run:

```bash
npm test -- src/data/local/diaryRepository.test.ts
```

Expected: FAIL because the Dexie database and repository do not exist.

- [ ] **Step 3: Implement the versioned Dexie schema**

Create tables:

```ts
type VisualDiaryDb = Dexie & {
  entries: EntityTable<DiaryEntry, "id">;
  media: EntityTable<MediaAsset, "id">;
  outbox: EntityTable<OutboxOperation, "id">;
  preferences: EntityTable<StoredPreference, "key">;
  syncMeta: EntityTable<SyncMeta, "key">;
};
```

Use indexes:

```ts
db.version(1).stores({
  entries: "id, entryDate, createdAt, updatedAt, deletedAt, syncState",
  media: "id, entryId, userId, createdAt, storagePath",
  outbox: "id, kind, createdAt, nextAttemptAt, state",
  preferences: "key, updatedAt",
  syncMeta: "key"
});
```

Create repository methods for local entry creation, immediate tombstone deletion, date and year queries, all-diary-image lookup, media lookup, background preference, outbox listing, and sync-state updates. Group entry, media, and outbox writes in Dexie transactions.

- [ ] **Step 4: Verify repository behavior**

Run:

```bash
npm test -- src/data/local/diaryRepository.test.ts
```

Expected: repository tests pass with no unhandled transaction warnings.

- [ ] **Step 5: Commit local persistence**

```bash
git add src/data/local
git commit -m "feat: add offline diary repository"
```

---

### Task 4: Implement The Ordered Offline Outbox

**Files:**
- Test: `src/data/sync/outbox.test.ts`
- Create: `src/data/sync/outbox.ts`
- Test: `src/data/sync/syncService.test.ts`
- Create: `src/data/sync/syncService.ts`
- Create: `src/data/cloud/cloudGateway.ts`

- [ ] **Step 1: Write failing outbox tests**

Use a fake gateway and a fake clock to verify:

```ts
expect(await processor.flush()).toEqual({ processed: 2, failed: 0 });
expect(gateway.calls).toEqual(["create:entry-1", "delete:entry-2"]);

gateway.failNext(new Error("offline"));
await processor.flush();
expect((await repository.listOutbox())[0]).toMatchObject({
  state: "failed",
  attempts: 1
});
```

Also prove that processing the same operation ID twice is idempotent and that deletes remain hidden while retrying.

- [ ] **Step 2: Run synchronization tests and verify failure**

Run:

```bash
npm test -- src/data/sync/outbox.test.ts src/data/sync/syncService.test.ts
```

Expected: FAIL because the processor and service do not exist.

- [ ] **Step 3: Implement outbox processing**

Define:

```ts
export type CloudPullResult = {
  entries: DiaryEntry[];
  preferences?: StoredPreference;
  cursor: string;
};

export interface CloudGateway {
  ensureSession(): Promise<{ userId: string }>;
  pushCreate(entryId: string): Promise<void>;
  pushDelete(entryId: string, deletedAt: string): Promise<void>;
  pullSince(cursor?: string): Promise<CloudPullResult>;
}
```

Process operations in `createdAt` order. Mark each operation `syncing`, then delete it on success or set `failed`, increment `attempts`, and calculate `nextAttemptAt` using:

```ts
Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
```

The sync service listens to `online` and repository mutation signals, prevents concurrent flushes, pulls after a successful push pass, and exposes a small observable status.

- [ ] **Step 4: Verify synchronization behavior**

Run:

```bash
npm test -- src/data/sync/outbox.test.ts src/data/sync/syncService.test.ts
```

Expected: all synchronization tests pass.

- [ ] **Step 5: Commit synchronization core**

```bash
git add src/data/sync src/data/cloud/cloudGateway.ts
git commit -m "feat: add resilient offline sync queue"
```

---

### Task 5: Add Supabase Schema, Anonymous Session, And Private Media Gateway

**Files:**
- Create: `.env.example`
- Create: `supabase/migrations/202607300001_visual_diary.sql`
- Modify: `src/data/cloud/cloudGateway.ts`
- Test: `src/data/cloud/supabaseGateway.test.ts`
- Create: `src/data/cloud/supabaseClient.ts`
- Create: `src/data/cloud/supabaseGateway.ts`

- [ ] **Step 1: Write the migration**

Create `diary_entries`, `media_assets`, and `user_preferences` with the columns in the approved design. Add indexes on `(user_id, entry_date, created_at)` and `(user_id, updated_at)`.

Enable RLS and add policies equivalent to:

```sql
insert into storage.buckets (id, name, public)
values ('diary-images', 'diary-images', false)
on conflict (id) do update set public = false;

create policy "users read own entries"
on public.diary_entries for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users insert own entries"
on public.diary_entries for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users update own entries"
on public.diary_entries for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
```

Create matching own-row policies for media and preferences. Add private bucket policies that require bucket `diary-images`, an authenticated role, and `owner_id = auth.uid()::text`.

- [ ] **Step 2: Write failing gateway tests**

Inject a typed Supabase client factory so tests can use a deterministic fake client. Assert:

```ts
expect(await gateway.ensureSession()).toEqual({ userId: "anonymous-user" });
expect(fakeAuth.signInAnonymously).toHaveBeenCalledTimes(1);

await gateway.pushCreate("entry-1");
expect(fakeStorage.uploadPath).toBe("anonymous-user/2026/07/media-1.png");

await gateway.pushDelete("entry-1", "2026-07-29T12:00:00.000Z");
expect(fakeRows.deletedAt).toBe("2026-07-29T12:00:00.000Z");
```

- [ ] **Step 3: Run gateway tests and verify failure**

Run:

```bash
npm test -- src/data/cloud/supabaseGateway.test.ts
```

Expected: FAIL because the gateway does not exist.

- [ ] **Step 4: Implement optional client construction and the gateway**

Create `.env.example`:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`createSupabaseClient()` returns `undefined` when either variable is absent. In that state the sync service reports `paused` while the local application remains fully usable.

`ensureSession()` first reads the current session, otherwise calls anonymous sign-in. `pushCreate()` uploads pending image blobs, upserts the entry, inserts ordered media rows, and updates local cloud metadata. `pushDelete()` writes tombstones and removes owned Storage objects after metadata succeeds. `pullSince()` requests own rows updated after the stored cursor and uses authorized Storage downloads to rebuild missing local thumbnails.

- [ ] **Step 5: Verify the gateway unit tests**

Run:

```bash
npm test -- src/data/cloud/supabaseGateway.test.ts
```

Expected: gateway tests pass without network access.

- [ ] **Step 6: Apply and verify the migration when Supabase credentials are available**

Run against the configured Supabase project:

```bash
npx supabase db push
```

Expected: migration applies once and the `diary-images` private bucket policies are active. If the CLI or project credentials are not yet available, record this as the only external integration prerequisite and continue with local checkpoints; do not claim live cloud synchronization is verified.

- [ ] **Step 7: Commit the cloud contract**

```bash
git add .env.example supabase src/data/cloud
git commit -m "feat: add private Supabase diary gateway"
```

---

### Task 6: Build Routing, App State, Glass Controls, And Bottom Navigation

**Files:**
- Test: `src/app/routes.test.ts`
- Create: `src/app/routes.ts`
- Create: `src/app/appStore.ts`
- Test: `src/components/BottomNav.test.tsx`
- Create: `src/components/FrostedIconButton.tsx`
- Create: `src/components/BottomNav.tsx`
- Create: `src/components/SyncStatus.tsx`
- Modify: `src/app/App.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/AppShell.module.css`

- [ ] **Step 1: Write failing route and navigation tests**

Assert:

```ts
expect(parseRoute("/")).toEqual({ view: "shelf" });
expect(parseRoute("/calendar/2026/07")).toEqual({ view: "calendar", year: 2026, month: 7 });
expect(serializeRoute({ view: "calendar", year: 2026, month: 7 })).toBe("/calendar/2026/07");
```

Render `BottomNav` and verify its three controls have accessible names `Bookshelf`, `Add diary entry`, and `Calendar`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/app/routes.test.ts src/components/BottomNav.test.tsx
```

Expected: FAIL because routing and navigation components do not exist.

- [ ] **Step 3: Implement routes, transient store, and shared controls**

The Zustand store owns:

```ts
type AppState = {
  route: AppRoute;
  selectedYear: number;
  diaryDate?: string;
  isDiaryOpen: boolean;
  isBackgroundPickerOpen: boolean;
  navigate: (route: AppRoute) => void;
  openDiary: (date: string) => void;
  closeDiary: () => void;
};
```

`AppShell` renders the current feature route, one persistent `BottomNav`, `SyncStatus`, and sheet portals. Familiar icon buttons use Lucide icons with `aria-label`; no visible instructional copy is added to the application.

- [ ] **Step 4: Verify tests and build**

Run:

```bash
npm test -- src/app/routes.test.ts src/components/BottomNav.test.tsx
npm run build
```

Expected: tests pass and the shell builds.

- [ ] **Step 5: Commit navigation**

```bash
git add src/app src/components
git commit -m "feat: add mobile app shell and navigation"
```

---

### Task 7: Implement The Diary-Image Background System

**Files:**
- Test: `src/features/background/BackgroundScene.test.tsx`
- Create: `src/features/background/BackgroundScene.tsx`
- Create: `src/features/background/BackgroundScene.module.css`
- Test: `src/features/background/BackgroundPicker.test.tsx`
- Create: `src/features/background/BackgroundPicker.tsx`
- Create: `src/features/background/BackgroundPicker.module.css`

- [ ] **Step 1: Write failing background component tests**

Verify:

```tsx
render(<BackgroundScene assets={[]} preference={{ mode: "random" }} />);
expect(screen.getByTestId("background-scene")).toHaveClass("fallback");

render(<BackgroundPicker assets={assets} onSelect={onSelect} onRandom={onRandom} />);
await user.click(screen.getByRole("button", { name: "Use diary image from 2026-07-29" }));
expect(onSelect).toHaveBeenCalledWith("asset-1");
```

Also assert that the picker has no upload input and that a missing pinned asset resolves to random mode.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/features/background
```

Expected: FAIL because background components do not exist.

- [ ] **Step 3: Implement the background scene and picker**

Use one full-bleed image layer, one luminance-aware light scrim, and one CSS paper fallback. The picker lists diary thumbnails with dates, exposes one `Random background` control, and pins a selected asset through the local repository before queuing preference synchronization.

- [ ] **Step 4: Verify background tests**

Run:

```bash
npm test -- src/features/background
```

Expected: tests pass, including no standalone upload control.

- [ ] **Step 5: Commit the background system**

```bash
git add src/features/background
git commit -m "feat: add diary-image background system"
```

---

### Task 8: Build The Twelve-Month Interactive Bookshelf

**Files:**
- Test: `src/features/shelf/MonthBook.test.tsx`
- Create: `src/features/shelf/MonthBook.tsx`
- Create: `src/features/shelf/MonthBook.module.css`
- Test: `src/features/shelf/BookShelf.test.tsx`
- Create: `src/features/shelf/BookShelf.tsx`
- Create: `src/features/shelf/BookShelf.module.css`
- Test: `src/features/shelf/YearShelfPage.test.tsx`
- Create: `src/features/shelf/YearShelfPage.tsx`
- Create: `src/features/shelf/YearShelfPage.module.css`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing bookshelf tests**

Verify:

```tsx
render(<BookShelf year={2026} entries={[]} onOpenMonth={onOpenMonth} />);
expect(screen.getAllByRole("button", { name: /Open .* 2026/ })).toHaveLength(12);
expect(screen.getByRole("button", { name: "Open July 2026" })).toHaveAttribute("data-mode", "spine");

render(<MonthBook month={7} year={2026} cover={coverAsset} onOpen={onOpen} />);
expect(screen.getByRole("img", { name: "July diary cover" })).toHaveAttribute("src", coverAsset.url);
```

Test previous/next year controls and verify shelf drag does not invoke year switching.

- [ ] **Step 2: Run shelf tests and verify failure**

Run:

```bash
npm test -- src/features/shelf
```

Expected: FAIL because shelf components do not exist.

- [ ] **Step 3: Implement the shelf and book interactions**

Render twelve semantic buttons inside a Motion `drag="x"` track with measured constraints. Derive each book's stable dimensions and tilt from `createBookGeometry`. Apply drag offset through `useTransform` so neighboring books shift at different rates. A focused book rotates toward zero degrees, widens to reveal its cover, then calls `onOpenMonth`.

Use reduced-motion detection to disable inertia and 3D rotation. Empty books use paper colors and month labels; books with images use the latest image cover.

- [ ] **Step 4: Verify component behavior**

Run:

```bash
npm test -- src/features/shelf
npm run build
```

Expected: all shelf tests pass and the build succeeds.

- [ ] **Step 5: Commit the bookshelf**

```bash
git add src/features/shelf src/app/App.tsx
git commit -m "feat: add interactive yearly bookshelf"
```

- [ ] **Step 6: Start Checkpoint 1 for user review**

Run:

```bash
npm run dev
```

Open the printed local URL at 390 x 844 and desktop width. Ask the user to evaluate background brightness, shelf density, drag weight, focus turn, and bottom navigation. Record approved visual-token and spring changes before continuing.

After approval, stop the dev server. If tuning changed production code, rerun the shelf tests and build, then commit the approved refinement as `style: tune bookshelf checkpoint`.

---

### Task 9: Compose The Supplied Paper Calendar And Grid

**Files:**
- Copy: `design-references/calendar-paper-template.png` to `public/assets/calendar-paper-template.png`
- Test: `src/features/calendar/CalendarPaper.test.tsx`
- Create: `src/features/calendar/CalendarPaper.tsx`
- Create: `src/features/calendar/CalendarPaper.module.css`
- Test: `src/features/calendar/DayCell.test.tsx`
- Create: `src/features/calendar/DayCell.tsx`
- Create: `src/features/calendar/DayCell.module.css`

- [ ] **Step 1: Preserve the approved paper asset in the runtime tree**

Copy the exact binary and verify it is unchanged:

```powershell
New-Item -ItemType Directory -Force -Path 'public/assets' | Out-Null
Copy-Item -LiteralPath 'design-references/calendar-paper-template.png' -Destination 'public/assets/calendar-paper-template.png'
git hash-object design-references/calendar-paper-template.png
git hash-object public/assets/calendar-paper-template.png
```

Expected: both hashes are identical.

- [ ] **Step 2: Write failing calendar composition tests**

Verify:

```tsx
render(<CalendarPaper year={2026} month={7} entries={entries} onOpenDay={onOpenDay} />);
expect(screen.getAllByRole("button", { name: /Open day 2026-07-/ })).toHaveLength(31);
expect(screen.getByTestId("calendar-paper-template")).toHaveAttribute(
  "src",
  "/assets/calendar-paper-template.png"
);
```

For `DayCell`, assert latest image selection, text-only handwriting, no image-count badge, and no action for out-of-month cells.

- [ ] **Step 3: Run calendar tests and verify failure**

Run:

```bash
npm test -- src/features/calendar/CalendarPaper.test.tsx src/features/calendar/DayCell.test.tsx
```

Expected: FAIL because calendar components do not exist.

- [ ] **Step 4: Implement stable paper and grid geometry**

Place the transparent PNG as the real visual layer. Position the month header, weekday row, and six-week grid inside percentage bounds derived from the paper area. Use seven `minmax(0, 1fr)` columns, six equal rows, fine borders, and no independent cell rounding.

`DayCell` renders:

```tsx
<button aria-label={`Open day ${date}`} className={styles.cell}>
  <span className={styles.date}>{dayOfMonth}</span>
  {primaryImage ? <img src={primaryImage.url} alt="" aria-hidden="true" /> : null}
  {!primaryImage && excerpt ? <span className={styles.handwriting}>{excerpt}</span> : null}
</button>
```

Do not render an image-count badge.

- [ ] **Step 5: Verify calendar tests**

Run:

```bash
npm test -- src/features/calendar/CalendarPaper.test.tsx src/features/calendar/DayCell.test.tsx
```

Expected: calendar tests pass.

- [ ] **Step 6: Commit paper composition**

```bash
git add public/assets src/features/calendar
git commit -m "feat: add clipped-paper calendar grid"
```

---

### Task 10: Build Month Navigation And Calendar Background Selection

**Files:**
- Test: `src/features/calendar/MonthCalendarPage.test.tsx`
- Create: `src/features/calendar/MonthCalendarPage.tsx`
- Create: `src/features/calendar/MonthCalendarPage.module.css`
- Modify: `src/app/App.tsx`
- Modify: `src/features/background/BackgroundPicker.tsx`

- [ ] **Step 1: Write the failing month-page test**

Assert that previous and next buttons change the month route, clicking July 29 opens the diary for `2026-07-29`, and the background icon opens a picker populated only by diary images.

```tsx
await user.click(screen.getByRole("button", { name: "Open day 2026-07-29" }));
expect(onOpenDiary).toHaveBeenCalledWith("2026-07-29");
```

- [ ] **Step 2: Run the month-page test and verify failure**

Run:

```bash
npm test -- src/features/calendar/MonthCalendarPage.test.tsx
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement month navigation and composition**

Compose `BackgroundScene`, `CalendarPaper`, clear icon-only month navigation, and `BackgroundPicker`. Keep month controls outside the date grid but visually aligned with the paper clip. Route changes preserve the selected year and never horizontally scroll the grid.

- [ ] **Step 4: Verify month behavior**

Run:

```bash
npm test -- src/features/calendar
npm run build
```

Expected: all calendar tests pass and the build succeeds.

- [ ] **Step 5: Commit the month page**

```bash
git add src/features/calendar src/features/background src/app/App.tsx
git commit -m "feat: add navigable month calendar"
```

- [ ] **Step 6: Start Checkpoint 2 for user review**

Run the dev server and inspect at 390 x 844 and 430 x 932. Ask the user to evaluate paper scale, clip placement, all-seven-column visibility, date legibility, image crop, handwritten excerpt density, and background picker. Apply approved visual refinements before continuing.

After approval, stop the dev server. Rerun all calendar tests and the build, then commit any approved refinement as `style: tune calendar checkpoint`.

---

### Task 11: Implement The Shared Date-Bound Diary Sheet

**Files:**
- Test: `src/features/diary/DiarySheet.test.tsx`
- Create: `src/features/diary/DiarySheet.tsx`
- Create: `src/features/diary/DiarySheet.module.css`
- Test: `src/features/diary/DiaryTimeline.test.tsx`
- Create: `src/features/diary/DiaryTimeline.tsx`
- Create: `src/features/diary/DiaryTimeline.module.css`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/features/calendar/MonthCalendarPage.tsx`

- [ ] **Step 1: Write failing dual-trigger and timeline tests**

Verify:

```tsx
await user.click(screen.getByRole("button", { name: "Add diary entry" }));
expect(screen.getByRole("dialog", { name: `Diary for ${todayKey}` })).toBeInTheDocument();

await user.click(screen.getByRole("button", { name: "Open day 2026-07-12" }));
expect(screen.getByRole("dialog", { name: "Diary for 2026-07-12" })).toBeInTheDocument();
```

Render three entries with different `createdAt` values and assert chronological order. Assert each record container uses the full-width class.

- [ ] **Step 2: Run diary-sheet tests and verify failure**

Run:

```bash
npm test -- src/features/diary/DiarySheet.test.tsx src/features/diary/DiaryTimeline.test.tsx
```

Expected: FAIL because the diary components do not exist.

- [ ] **Step 3: Implement the sheet and timeline**

Use an accessible modal dialog with a focus trap, Escape close, a small exposed background strip, and Motion entry/exit. The date header contains an actual date input with a styled visible trigger. Switching its value updates the bound date without closing.

The timeline orders entries ascending by `createdAt`, places images before text, uses near-full-width record blocks, and keeps timestamps secondary.

- [ ] **Step 4: Verify shared trigger behavior**

Run:

```bash
npm test -- src/features/diary/DiarySheet.test.tsx src/features/diary/DiaryTimeline.test.tsx
```

Expected: both triggers and date switching pass.

- [ ] **Step 5: Commit the diary viewer**

```bash
git add src/features/diary src/app/AppShell.tsx src/components/BottomNav.tsx src/features/calendar/MonthCalendarPage.tsx
git commit -m "feat: add shared date-bound diary sheet"
```

---

### Task 12: Add Image-First Composition, Paste, And Thumbnail Processing

**Files:**
- Test: `src/features/diary/media.test.ts`
- Create: `src/features/diary/media.ts`
- Test: `src/features/diary/DiaryComposer.test.tsx`
- Create: `src/features/diary/DiaryComposer.tsx`
- Create: `src/features/diary/DiaryComposer.module.css`
- Modify: `src/features/diary/DiarySheet.tsx`

- [ ] **Step 1: Write failing media and composer tests**

Verify accepted image MIME types, rejected non-images, stable multi-image ordering, and size metadata. In the component test:

```tsx
const image = new File([pngBytes], "memory.png", { type: "image/png" });
await user.upload(screen.getByLabelText("Add diary images"), [image]);
expect(screen.getByRole("img", { name: "Selected image memory.png" })).toBeInTheDocument();

await user.type(screen.getByRole("textbox", { name: "Diary text" }), longText);
await user.click(screen.getByRole("button", { name: "Send diary entry" }));
expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
  text: longText,
  files: [image]
}));
```

Dispatch a paste event with an image item and assert it joins the selection.

- [ ] **Step 2: Run composer tests and verify failure**

Run:

```bash
npm test -- src/features/diary/media.test.ts src/features/diary/DiaryComposer.test.tsx
```

Expected: FAIL because media processing and composer do not exist.

- [ ] **Step 3: Implement image-first composition**

The first composer control is a labeled image button backed by:

```html
<input type="file" accept="image/*" capture="environment" multiple>
```

Handle `paste` by reading image `DataTransferItem` objects. Keep selected files in order, allow removal before send, and create object URLs for previews with cleanup on unmount.

`createThumbnail()` uses `createImageBitmap`, scales to a maximum 640-pixel edge, and writes WebP at `0.82` quality. Preserve the original `File` in pending media until cloud upload succeeds.

- [ ] **Step 4: Verify composer tests**

Run:

```bash
npm test -- src/features/diary/media.test.ts src/features/diary/DiaryComposer.test.tsx
```

Expected: image-only, text-only, combined, multi-image, and paste tests pass.

- [ ] **Step 5: Commit composition**

```bash
git add src/features/diary
git commit -m "feat: add image-first diary composer"
```

---

### Task 13: Wire Sends, Immediate Deletes, And Synchronization Status

**Files:**
- Test: `src/app/diaryFlow.test.tsx`
- Modify: `src/features/diary/DiarySheet.tsx`
- Modify: `src/features/diary/DiaryTimeline.tsx`
- Modify: `src/components/SyncStatus.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/data/sync/syncService.ts`

- [ ] **Step 1: Write failing end-to-end component flow tests**

Using the local repository and fake gateway:

```tsx
await user.upload(screen.getByLabelText("Add diary images"), image);
await user.type(screen.getByRole("textbox", { name: "Diary text" }), "Today");
await user.click(screen.getByRole("button", { name: "Send diary entry" }));
expect(await screen.findByText("Today")).toBeInTheDocument();
expect(screen.getByText("Waiting to sync")).toBeInTheDocument();

await user.click(screen.getByRole("button", { name: "Delete entry at 09:42" }));
expect(screen.queryByText("Today")).not.toBeInTheDocument();
expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the flow test and verify failure**

Run:

```bash
npm test -- src/app/diaryFlow.test.tsx
```

Expected: FAIL because UI actions are not wired to the repository.

- [ ] **Step 3: Connect UI writes to local persistence and synchronization**

On send, create IDs with `crypto.randomUUID`, persist entry and media in one local transaction, clear the composer after commit, and request a sync flush. On delete, tombstone immediately without a confirmation layer and request a flush.

`SyncStatus` exposes accessible states but stays visually quiet: waiting, syncing, failed with retry, or hidden when fully synchronized.

- [ ] **Step 4: Verify the complete local diary flow**

Run:

```bash
npm test -- src/app/diaryFlow.test.tsx
npm test
npm run build
```

Expected: the focused flow and full suite pass; build succeeds.

- [ ] **Step 5: Commit the integrated diary flow**

```bash
git add src
git commit -m "feat: connect diary records and sync state"
```

---

### Task 14: Add Offline PWA Assets, Handwriting Font, And Install Metadata

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/main.tsx`
- Modify: `src/styles/global.css`
- Create: `src/components/PwaUpdateToast.tsx`
- Copy: `public/fonts/MaShanZheng-Regular.ttf`
- Copy: `public/fonts/OFL.txt`
- Create: `scripts/generate-icons.mjs`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/maskable-512.png`

- [ ] **Step 1: Download and preserve the OFL-licensed handwriting font**

Fetch `MaShanZheng-Regular.ttf` and `OFL.txt` from the official Google Fonts repository under `ofl/mashanzheng/`. Record the upstream URL and SHA-256 in the commit body.

```powershell
New-Item -ItemType Directory -Force -Path 'public/fonts' | Out-Null
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf' -OutFile 'public/fonts/MaShanZheng-Regular.ttf'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/OFL.txt' -OutFile 'public/fonts/OFL.txt'
Get-FileHash -Algorithm SHA256 'public/fonts/MaShanZheng-Regular.ttf','public/fonts/OFL.txt'
```

- [ ] **Step 2: Configure the PWA**

Add `VitePWA` with:

```ts
VitePWA({
  registerType: "prompt",
  includeAssets: [
    "assets/calendar-paper-template.png",
    "fonts/MaShanZheng-Regular.ttf",
    "fonts/OFL.txt",
    "icons/*.png"
  ],
  manifest: {
    name: "Visual Calendar",
    short_name: "Calendar",
    display: "standalone",
    start_url: "/",
    background_color: "#f3f0ea",
    theme_color: "#f3f0ea",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,png,svg,ttf}"],
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
    navigateFallback: "/index.html"
  }
});
```

Install the bitmap generator:

```bash
npm install -D sharp
```

Create `scripts/generate-icons.mjs`:

```js
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

await mkdir("public/icons", { recursive: true });

function iconSvg(size, maskable = false) {
  const pad = maskable ? size * 0.18 : size * 0.1;
  const paperX = pad;
  const paperY = pad * 1.22;
  const paperWidth = size - pad * 2;
  const paperHeight = size - paperY - pad;
  const cell = paperWidth / 4;
  const colors = ["#d87968", "#80a48b", "#dfb45f", "#6e91a6"];
  const cells = colors
    .map((color, index) => `<rect x="${paperX + index * cell}" y="${paperY + paperHeight * 0.48}" width="${cell}" height="${paperHeight * 0.52}" fill="${color}"/>`)
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#f3f0ea"/>
      <rect x="${paperX}" y="${paperY}" width="${paperWidth}" height="${paperHeight}" rx="${size * 0.025}" fill="#fffdf9"/>
      ${cells}
      <rect x="${size * 0.35}" y="${pad * 0.72}" width="${size * 0.3}" height="${size * 0.12}" rx="${size * 0.04}" fill="#b9b8b2"/>
      <circle cx="${size * 0.5}" cy="${pad * 0.72}" r="${size * 0.045}" fill="#e8e7e1"/>
    </svg>
  `;
}

await Promise.all([
  sharp(Buffer.from(iconSvg(192))).png().toFile("public/icons/icon-192.png"),
  sharp(Buffer.from(iconSvg(512))).png().toFile("public/icons/icon-512.png"),
  sharp(Buffer.from(iconSvg(512, true))).png().toFile("public/icons/maskable-512.png")
]);
```

Run:

```bash
node scripts/generate-icons.mjs
```

Expected: three light multicolor PNG icons are generated with no black background.

- [ ] **Step 3: Add update handling and offline font CSS**

Register the service worker through `virtual:pwa-register/react`. Show a compact update action only when a new version is ready. Define:

```css
@font-face {
  font-family: "Calendar Hand";
  src: url("/fonts/MaShanZheng-Regular.ttf") format("truetype");
  font-display: swap;
}
```

Use it only for calendar excerpts and decorative marks.

- [ ] **Step 4: Verify production PWA output**

Run:

```bash
npm run build
```

Expected: build succeeds, `dist/manifest.webmanifest` exists, service worker files are emitted, and font/icon assets are in `dist`.

- [ ] **Step 5: Commit PWA support**

```bash
git add package.json package-lock.json vite.config.ts src public scripts
git commit -m "feat: make visual diary installable offline"
```

---

### Task 15: Add Browser Workflows And Visual Regression Checks

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/fixtures.ts`
- Create: `e2e/bookshelf.spec.ts`
- Create: `e2e/calendar.spec.ts`
- Create: `e2e/diary.spec.ts`
- Create: `e2e/pwa.spec.ts`

- [ ] **Step 1: Configure Playwright projects**

Define:

```ts
projects: [
  { name: "phone-390", use: { viewport: { width: 390, height: 844 } } },
  { name: "phone-430", use: { viewport: { width: 430, height: 932 } } },
  { name: "desktop", use: { viewport: { width: 1280, height: 900 } } }
]
```

Start the Vite preview server through Playwright `webServer`.

- [ ] **Step 2: Write browser workflows before their final verification**

Bookshelf spec:

```ts
await expect(page.getByRole("button", { name: "Open July 2026" })).toBeVisible();
await page.getByTestId("book-track").dragTo(page.getByTestId("shelf-drag-target"));
await page.getByRole("button", { name: "Open July 2026" }).click();
await expect(page).toHaveURL(/calendar\/2026\/07/);
```

Calendar spec asserts 31 actionable July days, a visible template, seven measured equal columns, and no horizontal page overflow.

Diary spec covers both triggers, long text, multi-image file selection, clipboard paste, immediate delete, offline send, reload, reconnect, and queued synchronization.

PWA spec verifies manifest fields, service-worker control after reload, and application-shell availability while network is disabled.

- [ ] **Step 3: Run browser tests and capture initial failures**

Run:

```bash
npx playwright install chromium
npm run e2e
```

Expected: any failures identify integration or geometry gaps; no test may be weakened to match broken behavior.

- [ ] **Step 4: Fix integration gaps one at a time**

For each failure, reproduce it in the narrowest spec, correct production behavior, re-run that spec, then run the full browser suite. Keep screenshot baselines only after the layout is approved at the checkpoint.

- [ ] **Step 5: Run final verification**

Run:

```bash
npm test
npm run lint
npm run build
npm run e2e
git diff --check
git status --short
```

Expected:

- All unit and component tests pass.
- ESLint reports zero errors.
- Production build exits successfully.
- All Playwright projects pass.
- No whitespace errors.
- Only intentional checkpoint refinements remain staged or unstaged.

- [ ] **Step 6: Perform live Supabase verification**

With configured project values:

1. Open the app and allow silent anonymous session creation.
2. Send one image-and-text entry.
3. Confirm the row exists under the anonymous user ID.
4. Confirm the image exists in the private bucket and cannot be fetched without authorization.
5. Reload and confirm the entry returns.
6. Delete it and confirm the row tombstone and Storage cleanup.

Do not report cloud synchronization complete until this live check passes.

- [ ] **Step 7: Start Checkpoint 3 for user review**

Start the local server and provide the URL. Ask the user to evaluate camera/gallery selection, paste, long text, date switching, delete behavior, offline/reconnect status, install prompt, and overall motion.

After approval, stop the dev server. Apply only confirmed refinements and rerun the full unit, lint, build, and browser verification commands.

- [ ] **Step 8: Commit final verification changes**

```bash
git add playwright.config.ts e2e src public vite.config.ts
git commit -m "test: verify visual diary workflows"
```

- [ ] **Step 9: Verify the committed repository is clean**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors and no uncommitted files.

---

## Completion Gate

Before declaring the application complete:

- Re-read every acceptance criterion in `docs/superpowers/specs/2026-07-30-mobile-visual-calendar-design.md`.
- Verify each criterion through a test, screenshot, live cloud check, or explicit user checkpoint approval.
- Confirm the existing project at `C:\Users\G\Documents\可视化日历` has not been modified by this implementation.
- Confirm the new repository is clean or clearly list remaining intentional changes.
- Report any unverified external dependency, especially Supabase credentials, as incomplete rather than inferred.
