# Visual Diary

A mobile-first visual diary that turns the calendar into a bookshelf of memories.

[Live demo](https://mobile-visual-calendar.vercel.app)

## Overview

Visual Diary is a calm, visual space for capturing everyday moments and revisiting them over time. Each month becomes a book on a yearly shelf, while calendar and diary views make it easy to move between the big picture and individual memories.

## Core experience

- Yearly bookshelf with twelve interactive month books
- Previous- and next-year navigation
- Monthly calendar for browsing memories by date
- Quick diary-entry flow from the primary navigation
- Memory counts that make progress visible
- Customizable backgrounds
- Responsive, mobile-first interface
- Local-first persistence with Dexie and IndexedDB
- Supabase-ready data configuration
- Installable PWA support
- Unit, component, and end-to-end tests

## Product structure

The interface is organized around four feature areas:

- **Shelf** — browse the year as a collection of month books
- **Calendar** — move through dates and see where memories live
- **Diary** — create and revisit individual entries
- **Background** — personalize the atmosphere of the diary

## Tech stack

- React 19 + TypeScript
- Vite
- React Router
- Zustand
- Dexie / IndexedDB
- Supabase
- Motion
- vite-plugin-pwa
- Vitest + Testing Library
- Playwright

## Run locally

### Prerequisites

Use a Node.js version supported by the project:

```text
^20.19.0 || ^22.13.0 || >=24.0.0
```

### Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite.

Supabase configuration is optional for local development unless you need the cloud-backed data flow:

```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Do not commit real credentials.

## Scripts

```bash
npm run dev          # Start the development server
npm run build        # Create a production build
npm run preview      # Preview the production build
npm run lint         # Run ESLint
npm run test         # Run the Vitest suite
npm run test:watch   # Run tests in watch mode
npm run e2e          # Run Playwright end-to-end tests
```

## Project structure

```text
src/app/                  Application shell and routing
src/features/background/  Background customization
src/features/calendar/    Calendar experience
src/features/diary/       Diary entry flows
src/features/shelf/       Yearly bookshelf and month books
src/data/                 Persistence and data access
src/domain/               Core domain models
supabase/migrations/      Database migrations
e2e/                      End-to-end tests
```

## Data and privacy

The app can keep diary data in the browser through IndexedDB and can be configured to use Supabase. Review your deployment and Supabase policies before storing sensitive personal entries.
