---
description: Unattended version of /next, used by run-tasks.ps1
---

You're running unattended. Nobody will answer questions during this session, so never stop to ask. Use the STATUS line at the end instead.

1. **Resume first.** Check `git status` and the top of `docs/PROGRESS.md`. If there is uncommitted work, or an "IN PROGRESS" entry, finish that task before starting a new one.
2. **Otherwise pick the next task** the same way `/next` does. Follow `.claude/commands/next.md` for the work itself (scope, verification, ticking it off, the PROGRESS entry, the commit), with the changes below.
3. **Decisions.** Before you start, check whether the task is marked as needing a decision from me, or whether it needs a choice that the plan, `CLAUDE.md` and `docs/DECISIONS.md` don't already settle and that is hard to reverse. That includes product direction, anything that costs money, legal or terms-of-service questions about data sources, deleting data, and schema changes that drop or rename columns. If so, don't start the task. Put the question at the top of `docs/PROGRESS.md` under `## Waiting on Luka`, with the options and your recommendation. Commit, and end with `STATUS: NEEDS_INPUT`.
   Make small implementation choices yourself (naming, file layout, which helper to use), log anything notable in `docs/DECISIONS.md`, and keep going.
4. **Emulator.** If the task needs Android and `adb devices` lists no device, end with `STATUS: BLOCKED - emulator not running`.
5. **Failing checks.** If verification still fails after a couple of real attempts to fix it, don't weaken or skip tests and don't tick the task. Follow `.claude/commands/handoff.md`, then end with `STATUS: BLOCKED - <reason>`.
6. **Too big.** If the task turns out to be much bigger than one session, stop at a clean point and follow `.claude/commands/handoff.md`, splitting the task in `docs/PLAN.md`. Then end with `STATUS: CONTINUE`. A fresh session will pick it up.
7. **Look ahead.** After you commit a finished task, look at the next unticked task. If it needs a decision from me, write the question now (as in step 3) and end with `STATUS: NEEDS_INPUT`, so I can answer before the next run.
8. **Push.** After each task commit, run `git push origin main` and check that the CI run for that commit is green (`gh run list --limit 3`, `gh run watch <id> --exit-status`). If CI fails, fix it in a follow-up commit, or follow `.claude/commands/handoff.md` and end with `STATUS: BLOCKED - CI failing`. Never force-push or rewrite history, and never push anything that contains secrets or personal data (the repo is public). The usual rules in `CLAUDE.md` still apply: the legacy folder and `supabase-legacy` stay read-only.

The very last line of your reply must be exactly one of these:

```
STATUS: CONTINUE
STATUS: NEEDS_INPUT
STATUS: BLOCKED - <one-line reason>
STATUS: DONE
```

`CONTINUE` means the work is committed and the next task needs nothing from me. `DONE` means there are no unticked tasks left in `docs/PLAN.md`.
