# 2026-05-22 0016 - Course guide line

## What was done

- Added a faint world-space course guide line through each selected course's start and gate centers.
- Updated course-board rendering so the selected course row scrolls into view after title/course re-renders.
- Build-checked with `npm run build`.
- Started Vite and confirmed `http://127.0.0.1:5173/Slingshot/` returns HTTP 200.

## What worked

- The build passed.
- The dev server responded locally on port 5173.

## What didn't and why

- Browser automation could not attach to the `iab` browser, so the course guide line and course-list scrolling still need manual visual verification.

## Decisions made

none

## Left unfinished

- Manually inspect the faint course guide line in a live race.
- Manually verify the course-board selected row scrolls correctly with keyboard/controller navigation.

## state.md updated: yes
