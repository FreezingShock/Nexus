# Working on Nexus in parallel

Many threads work at once. Each one gets its own branch and its own pull request, and a bot merges finished PRs into `integration`, which is what nate's localhost shows. `main` stays stable.

```
your branch ──PR──> tests pass + PR is not a draft ──bot──> integration ──nate checks localhost──> nate merges to main
```

## Rules

1. **Never push to `main` or `integration`.** The bot owns `integration`. nate owns `main`.
2. **Branch names:** `claude/<short-topic>` (for example `claude/road-curves`). One topic per branch.
3. **Start from the latest `integration`** so you build on what nate is already looking at: `git fetch origin && git checkout -b claude/<topic> origin/integration`. Fall back to `main` if `integration` does not exist yet.
4. **Open the PR against `main`** (a PR against `integration` also merges, see [Bases and merges](#bases-and-merges)). Keep it small and visible: one improvement a person can see or feel. A PR that is several screens of diff should probably be two.
5. **Run `npm test` before every push.** The CI check runs the same command. Add tests for sim, economy, save and migration changes. A test that counts every coin after the player builds or upgrades something should make its sim with `quietSim` from `tests/support/quiet.js`: milestone stages pay a reward the first time something happens, and `quietSim` starts with them all paid.
6. **Open as draft while it is rough.** Mark it ready for review when it is done and the bot will merge it into `integration` once tests pass. Drafts are never merged. Every run updates one status comment on the PR that says what happened, including why a run skipped.
7. **Include the attribution block** as the first two lines of the PR body (the thread supplies the exact text), then a short description of what changed and what you did and did not measure.
8. **Merge `origin/integration` into your branch when the bot says `integration` has moved** (its comment says whether the merge is clean). Do it before you push more work, not at the end. Do not force-push and do not rewrite shared history.
9. **Add release notes as a file, not by editing the changelog.** For anything a player can see or hear, add `release-notes/<topic>.json` (see `release-notes/README.md`): one plain sentence per line, a kind (new, better, look, sound, fix) and your PR number. **Do not edit `src/changelog.js` or `src/version.js` in a feature PR**; only the release (promotion) PR writes them, by running `node scripts/release.mjs`.

## Adding features without editing shared files

New systems are new files, registered with one line.

| You are adding | Create | Hooks |
| --- | --- | --- |
| Rules, state, income, per-tick logic, commands | `src/sim/systems/<name>.js` | `state`, `sanitize`, `commands`, `rate`, `tick` |
| Meshes, animation, visual effects | `src/render/systems/<name>.js` | `create(ctx)` returning `frame`, `setNight` |
| Panels, HUD widgets, shortcuts | `src/ui/modules/<name>.js` | `create(ctx)` returning `frame`, `onEvent`, `onKey` |

Each file has a default export. After adding, renaming or removing one, run **`npm run registry`**: it regenerates the three `index.js` lists from the folder contents (one import and one list entry per file, sorted by file name). Never edit those index files by hand. A test fails if they are stale or contain conflict markers. Helpers go in a subfolder or outside these folders; only module files live directly in them. Full hook shapes: [docs/EXTENDING.md](docs/EXTENDING.md).

If two PRs both add modules and a registry `index.js` conflicts, the bot resolves it by regenerating when it merges into `integration`. When you resolve the conflict yourself, run `npm run registry` instead of picking lines.

Layers stay separate: the sim never touches the DOM or Three.js, the UI sends commands (`sim.dispatch({ type, ... })`), and render reads sim state. New saved fields come from a system's `state()` and `sanitize()`; a change to existing saved fields needs a migration in `src/sim/save.js` and a `SAVE_VERSION` bump.

## Bases and merges

- **Who merges what.** The bot merges finished PRs into `integration`. nate merges `integration` into `main`, with a merge commit (not a squash), so the two do not drift apart. Nobody else merges into `main`.
- **Base.** `main` and `integration` both work as a PR base. The bot reads the PR's live base every run, so changing the base starts a new run. Use `main` unless you have a reason not to.
- **Draft to ready.** Converting a draft to ready, changing its base, or pushing a commit each start a run. A re-run uses the live PR, not the commit it started with, and a run for an older commit stays quiet because the newer run reports.
- **Status.** One comment, edited in place, says `skipped` (with the reason), `merged`, `already`, `conflict`, or `testfail`. A new comment appears only when a PR first needs attention, so a quiet PR stays quiet.
- **When `integration` moves**, the bot edits one comment on each open PR that is behind. It says whether bringing `integration` in is clean today. Merge it in when it is clean, and resolve it early when it is not.
- **Rebasing.** Do not rebase a branch once its PR is open. Merge `origin/integration` in instead, so the history everyone else has stays valid.
- **Flaky tests block everyone.** If a test fails once and passes on a rerun, fix the test before you push again. Do not skip or delete a test to get green. Keep tests free of the real clock and of random numbers without a seed.

## Shared files: keep them stable

Avoid edits to `index.html`, `css/ui.css`, `src/main.js`, `src/sim/sim.js`, `src/sim/save.js`, `src/render/scene.js` and `src/ui/ui.js` unless the change cannot live in a system or module. When it cannot, keep the edit small and mention it in the PR. Put new CSS in your own file under `css/` and link it from `index.html` with one line. Do not reformat or reorder code you are not changing.

Write words in `color:var(--text)`, not `var(--ink)` (outlines and hard shadows), and dashed stitching in `rgb(var(--line) / a)`, so dark paper (`css/theme-dark.css`) can lift them. If a new surface hard-codes a light background behind words, add a dark rule for it in `css/theme-dark.css`. `tests/theme.test.js` checks every stylesheet for `color:var(--ink)`.

`index.html`, `docs/*.md`, `CONTRIBUTING.md` and `tests/*.test.js` use `merge=union` (see `.gitattributes`): when two threads add lines in the same place, git keeps both instead of stopping. Check the result: `npm test` includes a test that fails on leftover conflict markers and on a stylesheet link to a missing file. A test file that appends a new `test(...)` block next to someone else's is fine; do not reorder or rewrite existing tests.

## Budgets and project rules

16.7 ms frame, sim tick under 2 ms, under 100 draw calls, JS under 300 KB gzipped, measured on a phone before claiming a budget is met. No new dependency, bundler or framework without asking nate. No network calls after load (the one exception is the feedback box, which posts only when a player presses Send; see docs/FEEDBACK.md), no monetization, no copied LightsOn names, icons, art or text. Say in the PR what you ran and what you did not measure.

## Plan and memory

When a design decision or budget changes, update the Development Plan artifact and project memory in the same turn, and say so in the PR. If you made a taste decision on nate's behalf, say which default you chose.

## Seeing your work

`scripts/refresh.ps1` (Windows) or `scripts/refresh.sh` (macOS and Linux) pulls `integration` and restarts the server. See the README.

## Maintainer setup (one time, for nate)

- Settings > Actions > General: Workflow permissions = "Read and write permissions".
- Settings > Branches: protect `main` (require a PR; tests check optional). Do not protect `integration`, or the bot cannot push to it.
- Merge PRs into `main` with "Create a merge commit" rather than squash, so `integration` and `main` do not drift apart.
- Set the default branch to `main` (Settings > General > Default branch). It is currently a stale `claude/...` branch; scheduled and `workflow_run` workflows only run from the default branch.
