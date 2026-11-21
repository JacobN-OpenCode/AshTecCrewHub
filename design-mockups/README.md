# AshTec Crew Hub — redesign mockups

Three design directions for the app after outgrowing Zite's original top-bar layout.
Each image shows **desktop + mobile** plus a "what moves & why" panel.

| File | Direction |
|---|---|
| `01-direction-a-desktop.png` / `02-direction-a-mobile.png` | **A · Sidebar Console** (recommended) |
| `03-direction-b-desktop.png` / `04-direction-b-mobile.png` | B · Command Bar |
| `05-direction-c-desktop.png` / `06-direction-c-mobile.png` | C · Dashboard Hub |

## The problem
The current header is one long horizontal nav with everything else hidden behind an
**Admin dropdown**. Every new page either lengthens the tab row (it had to be made
scrollable + drag-scroll already) or goes into the dropdown where nobody finds it.

## What moves (Direction A — recommended)

| Now (today) | New home | Why |
|---|---|---|
| Top tabs: Home, Check-in, Calendar, Stage, Live, Parents, Tools, Settings | Sidebar groups **Main / Production / Club** (desktop); bottom tabs + drawer (mobile) | Grouped, never scrolls, room to grow |
| Admin dropdown (Events, Crew, Check-in, Emails, Support, Live Setup, Diagnostics) | A dedicated **Admin** group in the sidebar / drawer grid | Always visible, labelled, no hidden menu |
| "Collapse top tabs to icons" preference | Explicit **sidebar collapse** toggle (desktop) | Same intent, real control |
| Search (nowhere) | **Command palette (⌘K)** in the sidebar / top bar | Jump to any page; nav no longer the only path |
| Presence banner | Compact status chip in the top bar | Less intrusive, still visible |
| Account + accent/layout settings | Sidebar footer → **Settings** (`/profile`) | Identity pinned, prefs in one place |
| Live check-in / support | **Live dot** on Check-in, **badge** on Support | State visible wherever you are |

## The three directions at a glance

- **A · Sidebar Console** — labelled sidebar grouped into Main / Production / Admin (icon rail on collapse). Bottom tabs + drawer on mobile. *Scales best, most familiar, recommended.*
- **B · Command Bar** — no sidebar; slim top bar with grouped segmented tabs, an **Admin mega-menu**, and ⌘K. Content gets full width. *Compact, but busier and still menu-dependent.*
- **C · Dashboard Hub** — 70px icon rail + a widget **Home** (tonight's schedule, check-in, support queue). *Great on show nights, heavy for casual browsing.*

## Page map (unchanged routes, new homes)

- `/` Home — role-aware: My Events (member) / Roster (staff) / Stage Layout (actor)
- `/attendance` Check-in · `/calendar` Calendar · `/stage` Stage Layout · `/show-dash` Live Show
- `/parents` For parents · `/tools` Tools · `/profile` Settings
- `/roster` Roster (non-staff admins)
- Admin: `/admin/events` · `/admin/members` · `/admin/attendance` · `/admin/emails` · `/admin/support` · `/admin/live-show` · `/admin/diagnostics` (+ new `/admin` Overview)

## Re-rendering the images

```sh
D=design-mockups
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --screenshot="$D/01-direction-a-desktop.png" --window-size=1680,965 "file://$PWD/$D/a-desktop.html"
```

Sizes: desktop sheets `1680x965`, mobile sheets `1300x990`.
