# Working on Nexus in parallel

Many threads work at once. Each one gets its own branch and its own pull request, and a bot merges finished PRs into `integration`, which is what nate's localhost shows. `main` stays stable.

```
your branch ──PR──> tests pass + PR is not a draft ──bot──> integration ──nate checks localhost──> nate merges to main
```

## Rules

1. **Never push to `main` or `integration`.** The bot owns `integration`. nate owns `main`.
2. **Branch names:** `claude/<short-topic>` (for example `claude/road-curves`). One topic per branch.
3. **Start from the latest `integration`** so you build on what nate is already looking at: `git fetch origin && git checkout -b claude/<topic> origin/integration`. Fall back to `main` if `integration` does not exist yet.
4. **Open the PR against `main`.** Keep it small and visible: one improvement a person can see or feel. A PR that is several screens of diff should probably be two.
5. **Run `npm test` before every push.** The CI check runs the same command. Add tests for sim, economy, save and migration changes.
6. **Open as draft while it is rough.** Mark it ready for review when it is done and the bot will merge it into `integration` once tests pass. Drafts are never merged.
7. **Include the attribution block** as the first two lines of the PR body (the thread supplies the exact text), then a short description of what changed and what you did and did not measure.
8. **If the bot comments about a conflict,** merge `origin/integration` into your branch, resolve, and push. Do not force-push and do not rewrite shared history.

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

## Shared files: keep them stable

Avoid edits to `index.html`, `css/ui.css`, `src/main.js`, `src/sim/sim.js`, `src/sim/save.js`, `src/render/scene.js` and `src/ui/ui.js` unless the change cannot live in a system or module. When it cannot, keep the edit small and mention it in the PR. Put new CSS in your own file under `css/` and link it from `index.html` with one line. Do not reformat or reorder code you are not changing.

## Budgets and project rules

16.7 ms frame, sim tick under 2 ms, under 100 draw calls, JS under 300 KB gzipped, measured on a phone before claiming a budget is met. No new dependency, bundler or framework without asking nate. No network calls after load, no monetization, no copied LightsOn names, icons, art or text. Say in the PR what you ran and what you did not measure.

## Plan and memory

When a design decision or budget changes, update the Development Plan artifact and project memory in the same turn, and say so in the PR. If you made a taste decision on nate's behalf, say which default you chose.

## Seeing your work

`scripts/refresh.ps1` (Windows) or `scripts/refresh.sh` (macOS and Linux) pulls `integration` and restarts the server. See the README.

## Maintainer setup (one time, for nate)

- Settings > Actions > General: Workflow permissions = "Read and write permissions".
- Settings > Branches: protect `main` (require a PR; tests check optional). Do not protect `integration`, or the bot cannot push to it.
- Merge PRs into `main` with "Create a merge commit" rather than squash, so `integration` and `main` do not drift apart.
- Set the default branch to `main` (Settings > General > Default branch). It is currently a stale `claude/...` branch; scheduled and `workflow_run` workflows only run from the default branch.
