---
description: Pick up the next task from docs/PLAN.md and complete it
---

Start a work session on Sarvis.

1. Read `docs/PROGRESS.md` (top entry only) and `docs/PLAN.md`.
2. If the top PROGRESS entry says a task was left mid-way, resume that task. Otherwise take the first unticked task whose dependencies are all ticked. $ARGUMENTS
3. Tell me in two or three lines which task you're doing and how you'll verify it. Then start without waiting, unless the task needs a decision from me.
4. Do the task. Stay inside its scope. If you find extra work that's needed, add it to PLAN.md as a new task instead of doing it now.
5. Run the task's verification exactly as written in PLAN.md (screenshots, tests, sample runs). If it fails, fix it or record what's broken.
6. When verification passes:
   - Tick the task in `docs/PLAN.md`.
   - Add an entry at the top of `docs/PROGRESS.md`: date, task ID, what changed, how it was verified, anything I need to know.
   - Add an entry to `docs/DECISIONS.md` if you made a design choice.
   - Update the Commands table in `CLAUDE.md` if any command changed.
   - Commit with a message that starts with the task ID.
7. End with one line naming the next task.

If the session is getting long or you're running low on context, stop at a clean point and follow `/handoff` instead of starting new work.
