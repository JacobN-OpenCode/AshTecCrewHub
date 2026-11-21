# Themes

Every look renders **one** layout: the shell in `src/components/AppShell.tsx` and
the home page in `src/pages/Home.tsx`. Colour, type, texture and card language
come from `src/index.css` plus the palette variables in `src/lib/themes.ts`, and a
theme made for you (ticket 36b2cc84) only swaps colours on top of its base look.

A theme is a palette plus CSS, never a layout, so no rule may change where things
sit or how wide they are.

The files in this folder are the previous per-theme shells and dashboards. They
are no longer imported: kept here because they hold the artwork and copy for the
five looks (the pines, the mascot card, the hand-lettered headings), so pieces can
be lifted back into the shared layout if wanted. Safe to delete once nobody wants
to lift anything out of them.
