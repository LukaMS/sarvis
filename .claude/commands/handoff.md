---
description: Save the current state so the next session can resume cleanly
---

Stop starting new work and save state for the next session.

1. Bring the code to a state that builds. If that isn't possible, leave the broken part clearly marked with a `TODO(handoff)` comment.
2. Add an entry at the top of `docs/PROGRESS.md` titled "IN PROGRESS: <task ID>" with:
   - what's done so far
   - the exact next step
   - any failing checks and what you believe the cause is
   - files touched
3. Leave the task unticked in `docs/PLAN.md`. If it turned out bigger than one session, split it into smaller tasks there.
4. Commit with a message that starts with "WIP <task ID>:".
5. Reply with three lines at most: where things stand, and what the next session will do first.
