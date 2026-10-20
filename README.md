# Fusion Check-In

Admin web app for the **University of Windsor's Fusion Innovation & Entrepreneurship Network** —
manage students, run events, and check people in by QR code from a kiosk or a staff member's
phone, with live attendance tracking as it happens.

## Features

- **Student directory** — add students manually, import in bulk from CSV/Excel, search, filter,
  and manage status (active / alumni / withdrawn).
- **QR pass generation** — every student gets a printable PDF pass with a unique QR code.
- **Event management** — create single-day or multi-day events, open or invite-only, with
  per-session check-in windows and capacity limits.
- **QR scanner** — a kiosk mode (self-serve, propped-up device) and a staff mode (handheld),
  sharing one camera-based scanner tuned for fast, reliable reads even on older hardware.
- **Live monitoring** — real-time check-in feed, arrival status (early / on-time / late), and
  who's missing, powered by Supabase Realtime.
- **Analytics** — attendance by day/session/faculty, no-shows, students who joined an event
  partway through, and exportable CSV reports.
- **Role-based access** — Admin and Kiosk staff accounts, enforced with Postgres Row Level
  Security.
- **Keyboard accessible** — every page is fully operable without a mouse.

## Tech stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) — Postgres, Auth, Realtime, Row Level Security
- [React Router](https://reactrouter.com/), [Recharts](https://recharts.org/), [jsQR](https://github.com/cozmo/jsQR), [jsPDF](https://github.com/parallax/jsPDF)
- [Vitest](https://vitest.dev/) for tests, [ESLint](https://eslint.org/) for linting
- Deployed on [Cloudflare Pages](https://pages.cloudflare.com/)

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A [Supabase](https://supabase.com/) project

### Setup

```bash
# Install dependencies
npm install

# Copy the env template and fill in your Supabase project's URL and anon key
cp .env.example .env
```

Run the SQL files in [`supabase/`](./supabase) against your Supabase project, in order, to set up
the schema, policies, and functions the app relies on.

### Run locally

```bash
npm run dev
```

## Scripts

| Command         | Description                              |
| ---------------- | ----------------------------------------- |
| `npm run dev`     | Start the local dev server                |
| `npm run build`   | Type-check and build for production       |
| `npm run lint`    | Run ESLint                                |
| `npm test`        | Run the test suite (Vitest)               |
| `npm run preview` | Preview a production build locally        |

## Project structure

```
src/
  auth/        Auth context and session handling
  components/  Shared UI components (modals, cards, inputs, nav, …)
  data/        Supabase queries and data-shaping logic
  lib/         Small shared utilities
  pages/       One folder per feature area (Events, Students, Scanner, …)
supabase/      SQL migrations/schema, applied directly in the Supabase SQL editor
```
