# Mobile Visual Calendar Design

Date: 2026-07-30

## Goal

Build a new mobile-first visual diary PWA as an independent project. The application presents a year as a tactile shelf of twelve month books, each month as a clipped paper calendar, and each date as an image-first diary window.

The experience must closely follow the supplied video and image references while using a light, multicolor visual system rather than a black theme.

The existing project at `C:\Users\G\Documents\可视化日历` is read-only for this work. The new project lives at `C:\Users\G\Documents\可视化日历-mobile`.

## Preserved References

The original references are stored in `design-references/`:

- `home-bookshelf-motion.mp4`
  - 538 x 332 pixels, 30 fps, approximately 5.21 seconds.
  - Shows a single horizontal row of books with mixed cover and spine views.
  - Books shift, rotate, resize, and flip between spine and cover states while the title remains stable.
- `month-calendar-reference.png`
  - 736 x 1059 pixels.
  - Defines the scrapbook calendar mood: full-bleed memory background, clipped paper, fine grid, image-led day cells, and handwritten notes.
- `calendar-paper-template.png`
  - 1046 x 1503 RGBA PNG.
  - Transparent outside the metal clip and warm paper sheet.
  - Must be used as a real compositing layer, not redrawn as a generic white card.
- `editorial-bookshelf-palette-reference.png`
  - Defines the approved home-page color direction.
  - Uses a cool exhibition-white field, near-black editorial type, and saturated book colors.
  - The dark navy central cover is a visual anchor, not a full-page dark theme.

## Product Scope

### Included

- Installable mobile-first PWA.
- Silent Supabase anonymous authentication for the demo.
- Cloud-backed diary records and private image storage.
- IndexedDB offline cache and queued synchronization.
- A twelve-book yearly home shelf with year switching.
- A full seven-column month calendar using the supplied paper template.
- Image-first day cells with optional handwritten excerpts.
- One near-full-screen messaging-style diary layer.
- Text, multi-image upload, camera/gallery selection, and desktop image paste.
- Date switching through a DatePicker.
- Immediate record deletion without confirmation.
- Random or manually pinned backgrounds sourced only from diary images.

### Not Included In The Demo

- Visible sign-in or account settings.
- Email account linking.
- Sharing, public profiles, comments, or collaborative diaries.
- Standalone background uploads.
- Record editing after sending.
- AI-generated images or summaries.
- A native iOS or Android application.

## Confirmed Experience Decisions

- The home page always shows all twelve months for the selected year.
- The home shelf uses one horizontally draggable row.
- The month calendar keeps all seven columns visible on the phone.
- A date cell uses one primary image and no image-count badge.
- The diary layer is near full screen.
- Diary history contains only the user's entries; it does not imitate a two-party chat.
- Long diary entries use nearly the full available width.
- Handwriting is limited to short calendar excerpts and decorative annotations.
- Long diary text uses a highly readable regular Chinese font.
- Each sent item is an independent record containing text, images, or both.
- Deleting a record is immediate and has no confirmation dialog.

## Technical Architecture

### Frontend

- React and TypeScript.
- Vite for development and production builds.
- CSS variables for global visual tokens.
- CSS Modules for component-scoped styling.
- Motion for cross-device drag, spring, layout, hover, tap, and entry/exit animation.
- Zustand for transient interface state only.
- Lucide icons for standard controls.
- `vite-plugin-pwa` for the manifest, application shell caching, installation, and update handling.

Tailwind and prebuilt dashboard component systems are intentionally excluded. The reference requires exact compositing, controlled proportions, and unusual paper/book geometry that are clearer in authored CSS.

### Local Data

Dexie wraps IndexedDB and stores:

- `entries`: locally available diary records.
- `media`: thumbnails, pending image blobs, and cloud image metadata.
- `outbox`: ordered create and delete operations awaiting cloud synchronization.
- `syncMeta`: cursors, retry timing, and last successful synchronization.

React reads diary data from Dexie through live queries. Components do not read Supabase directly.

### Cloud Data

Supabase provides:

- Anonymous Auth for an invisible demo identity.
- PostgreSQL as the authoritative record store.
- A private Storage bucket for original diary images.
- Row Level Security on database rows and storage objects.

Proposed cloud tables:

#### `diary_entries`

- `id uuid primary key`
- `user_id uuid not null`
- `entry_date date not null`
- `text text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `deleted_at timestamptz`

#### `media_assets`

- `id uuid primary key`
- `user_id uuid not null`
- `entry_id uuid not null`
- `storage_path text not null`
- `mime_type text not null`
- `width integer`
- `height integer`
- `sort_order integer not null`
- `created_at timestamptz not null`
- `deleted_at timestamptz`

#### `user_preferences`

- `user_id uuid primary key`
- `background_mode text not null`, restricted to `random` or `pinned`
- `pinned_background_asset_id uuid`
- `updated_at timestamptz not null`

Storage object paths use `userId/year/month/uuid.ext`. Policies restrict reads, inserts, and deletes to the authenticated object's owner.

## Synchronization Rules

1. A send or delete action commits to Dexie first.
2. The interface updates optimistically from Dexie.
3. An ordered operation is appended to `outbox`.
4. A background sync worker uploads original images before creating their cloud media rows.
5. Completed uploads replace pending blobs with cloud metadata while retaining lightweight local thumbnails.
6. Failed operations remain queued with bounded exponential retry.
7. Restoring connectivity triggers an immediate retry.
8. Deletes hide records locally at once and synchronize tombstones and storage cleanup afterward.
9. `entry_date` is stored as a local calendar date in `YYYY-MM-DD` form. It is never derived by truncating a UTC timestamp.

The demo is primarily single-user and append/delete only. Conflict behavior uses the latest `updated_at` value, while tombstones prevent deleted records from reappearing.

Clearing browser data removes the anonymous session and therefore access to the same cloud identity. A production phase must add account linking before this is considered durable multi-device storage.

## Navigation And Application Shell

The default route is the bookshelf. The application has a persistent frosted bottom navigation:

- Bookshelf icon.
- Central circular add icon.
- Calendar icon.

The central add action always opens the shared diary layer for today. The calendar route opens the selected month. Direct dates and months should be represented in the URL so refresh and PWA relaunch preserve navigation state.

## Home Bookshelf

- The selected year appears above the shelf with previous and next controls.
- Swiping on the year control changes years.
- Dragging the shelf moves through the twelve books and does not change years.
- All twelve months exist even when empty.
- The fallback home surface is cool exhibition white rather than cream or beige.
- Empty months use stable editorial book colors with month labels: vivid pink, forest green, orange-red, signal red, cobalt blue, mustard yellow, burgundy, cool gray, and dark navy.
- Only the real current month is presented in front-cover mode on the current-year shelf.
- The current month uses its latest diary image as the visible cover when one exists; otherwise it uses its editorial solid-color cover.
- Every other month remains in side-spine mode even when it contains diary images.
- When browsing a year other than the real current year, all twelve months remain in side-spine mode.
- Dark navy is reserved for one or two visual-anchor books at a time; it must not dominate the viewport.
- Book dimensions, color assignments, and tilt use a stable seed derived from year and month. They do not reshuffle on every render.
- Nearby books translate and rotate slightly as the shelf is dragged.
- The focused month turns toward the viewer before opening its calendar.
- Desktop hover provides the same focus cue without being required for use.

The choreography adapts the reference video rather than continuously replaying it. Books enter with a stagger once, then react only to user input or a year change.

## Month Calendar

- The selected diary image background fills the viewport.
- The supplied transparent clip-and-paper template is centered with a stable aspect ratio.
- The full seven-column grid fits inside the paper on mobile.
- Fine grid lines create one continuous calendar surface.
- Month and weekday labels are integrated into the paper.
- In-month days remain actionable even when empty.
- Out-of-month cells stay visually quiet and are not actionable.

Day cell priority:

1. Show the newest diary image for that date as a full-cell visual.
2. If there is no image, show a short handwritten excerpt on paper.
3. If there is an image and enough contrast-safe space, show only a very short handwritten excerpt.
4. Never show a count badge for additional images.

Clicking a day opens the same diary layer used by the central add action, bound to the clicked date.

## Diary Layer

- Opens as a near-full-screen frosted sheet with a small amount of the source view visible above it.
- Uses one chronological, user-only record stream.
- Each record is close to full width rather than a narrow chat bubble.
- Images appear before text and preserve their natural aspect ratio within safe bounds.
- Timestamps separate records without dominating them.
- The header displays the bound date and opens a DatePicker.
- Changing the date reloads the corresponding history without closing the layer.

Composer behavior:

- The media action is the first and most prominent control.
- Supports camera/gallery, file selection, multiple images, and desktop clipboard paste.
- Supports image-only, text-only, and image-plus-text sends.
- The text area grows with content within a viewport-safe maximum.
- A send operation creates one independent diary entry.

Each record has a delete action. Delete takes effect immediately without a confirmation prompt. Editing is not included.

## Background System

The eligible background library consists only of images attached to diary records.

- `random` mode selects one eligible image on each application start.
- A user may open the background picker and select any eligible diary image.
- Manual selection switches the preference to `pinned`.
- The selected image remains fixed until another image is selected or random mode is restored.
- Deleting the pinned source image returns the app to random mode.
- If there are no diary images or a selected image fails to load, use the built-in light paper/desktop background.

The picker shows image thumbnails with their diary dates. It does not contain a standalone upload action.

## Visual System

### Palette

The home route uses a cool editorial exhibition palette derived from
`editorial-bookshelf-palette-reference.png`:

- Exhibition white `#F2F2EF`: home canvas and empty-state background.
- Near-black ink `#181716`: primary headings, icons, and fine rules.
- Anchor navy `#1F3048`: featured book covers and controlled visual weight.
- Editorial pink `#E88AB1`: vivid book spines.
- Forest green `#37623F`: grounding book spines.
- Orange-red `#EA632F`: energetic book spines and the primary add action.
- Signal red `#E34B4A`: narrow accent spines and focus indication.
- Cobalt blue `#2F579E`: cool saturated book spines.
- Mustard `#DFA93A`: warm contrasting book spines.
- Burgundy `#3A1814`: deep secondary book spines.
- Cool gray `#DDE1DF`: quiet book spines and neutral structure.

The palette is distributed as roughly 70-80% exhibition white, 15-25% book
colors, and less than 5% command accents. Saturated colors belong to books and
small controls, not large page surfaces.

The month calendar and diary layer retain warm paper white where reading and
the supplied paper template require it. The home route must not tint the
calendar paper cool gray. Near-black is reserved for type, icons, thin dividers,
and small book details; no large surface is black or navy. Decorative gradients
are not part of this palette.

### Glass

Frosted controls use:

- Neutral translucent white fills.
- `backdrop-filter` blur in the 18-24 pixel range.
- A bright highlight border.
- Low-opacity neutral shadows without brown or beige tint.
- Circular containers for familiar icon controls.
- Pill containers only for navigation and text input.

On the home route, the central add button uses orange-red and the active shelf
control uses signal red or editorial pink. Other glass controls remain neutral
so the book row carries the color.

### Typography

- Editorial serif for English month and year display.
- Readable Chinese sans serif for diary history, navigation, and controls.
- A self-hosted Chinese handwriting font for calendar excerpts only.
- No viewport-width font scaling.
- Letter spacing remains zero.

### Motion

Initial targets, subject to hands-on tuning:

- Shelf entrance: approximately 800 ms with short book staggering.
- Book focus and cover turn: approximately 380 ms.
- Diary sheet transition: approximately 260 ms.
- Small controls: 120-180 ms.

Motion uses transform and opacity where possible. The system `prefers-reduced-motion` setting disables parallax, inertia, and 3D turning while preserving immediate navigation and simple fades.

## Responsive And Accessibility Rules

- Primary phone widths: 360-430 pixels.
- Primary validation viewports: 390 x 844 and 430 x 932.
- Calendar geometry uses fixed aspect ratios and constrained grid tracks.
- In-month day targets should remain approximately 44 pixels where the viewport permits.
- Text and controls may wrap but may not overlap.
- Desktop keeps a full-bleed background while constraining the app experience to a comfortable mobile-oriented width.
- Every icon button has an accessible name.
- Focus indicators remain visible.
- Controls are usable without hover.
- Image-only diary records expose useful accessible descriptions where available without repeating decorative calendar imagery.

## Error Handling

- Offline writes remain visible locally with a waiting-sync state.
- Image upload failure retains the local preview and offers retry.
- Clipboard or camera permission failure falls back to file selection.
- Background load failure uses the built-in light fallback.
- An expired anonymous session pauses cloud writes and preserves local data.
- PWA update failure does not block the current application version.
- Storage quota errors produce an actionable message and do not discard unsynchronized content.

## Testing

### Unit Tests

- Calendar grid and local-date conversion.
- Stable year/month shelf seeds.
- Latest-image cover and day-primary-image selection.
- Random and pinned background behavior.
- Outbox ordering, retries, tombstones, and idempotency.
- Anonymous session loss behavior.

### Component Tests

- The central add button and a day cell open the same diary layer with different bound dates.
- DatePicker switching loads the selected history.
- Image-first composer supports all allowed send shapes.
- Long text uses full-width record layout.
- Immediate deletion removes the correct record.
- Empty and visual month cells follow the display priority.

### End-To-End Tests

- Shelf drag, focus, and month opening.
- Year switching without shelf gesture conflict.
- Full seven-column calendar framing.
- Upload, paste, send, refresh, and delete.
- Offline send followed by online synchronization.
- Random and pinned background switching.
- PWA installation metadata and offline shell behavior.

### Visual Verification

Use Playwright screenshots at 390 x 844, 430 x 932, and desktop width. Verify:

- No crop or overlap.
- The paper template remains correctly framed.
- All seven columns are visible.
- Glass controls remain legible against light and dark user photos.
- No unintended black-theme fallback.
- Shelf books and diary content do not resize the surrounding layout unexpectedly.

## Experience Checkpoints

Implementation pauses for hands-on review after:

1. Background system, bottom navigation, and interactive shelf.
2. Paper calendar, seven-column grid, and day-cell rendering.
3. Diary layer, image input, offline queue, and Supabase synchronization.

Visual token values and spring parameters are tuning baselines, not immutable values. The reference assets and confirmed structural decisions remain fixed while spacing, blur, timing, and color intensity can be adjusted after each live review.

## Acceptance Criteria

- The new project is independent and the old project remains unchanged.
- The home page visibly reads as a twelve-month book collection inspired by the reference video.
- The month page visibly reads as the supplied clipped paper calendar over a memory background.
- The product uses a light, multicolor visual system rather than a black theme.
- The full month grid is visible on a phone without horizontal calendar scrolling.
- Diary images are the primary content on the shelf, calendar, and record layer.
- Both triggers open one shared diary layer with the correct date.
- Existing records display completely in chronological order.
- Backgrounds come only from diary images and support random and pinned modes.
- Records survive refresh, work offline, and synchronize to private cloud storage when online.
- The PWA is installable and its application shell works offline.
- The three experience checkpoints are completed before the implementation is treated as finished.
