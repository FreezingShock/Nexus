// Used by the workflows right after integration moves, from the integration checkout. For every open PR against
// `main` or `integration` that does not contain integration yet, keeps one comment (marked <!-- integration-behind -->)
// saying whether bringing integration in is clean, registry-only or conflicting. The comment is edited in place;
// a new one is added only when a PR first falls behind, or when its merge starts to conflict. Never pushes.
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY, TOOLS (a checkout that holds scripts/ci-dry-merge.sh).
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addComment, editComment, findComment, listAll } from './ci-github.mjs';

const TOOLS = process.env.TOOLS || join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = '<!-- integration-behind';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const isAncestor = (a, b) => {
  try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; }
};

git('fetch', '--quiet', 'origin', 'integration');
const integration = git('rev-parse', 'origin/integration');
const at = `\`${integration.slice(0, 7)}\``;
const checked = `Checked ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against \`integration\` ${at}.`;
const pull = `Bring it in before your next push: \`git fetch origin && git merge origin/integration\`. Do not force-push.`;

const prs = (await listAll('/pulls?state=open')).filter((p) => ['main', 'integration'].includes(p.base.ref));
for (const pr of prs) {
  try {
    git('fetch', '--quiet', 'origin', `refs/pull/${pr.number}/head`);
    const head = git('rev-parse', 'FETCH_HEAD');
    let state;
    let text;
    if (isAncestor(head, integration)) {
      state = 'merged';
      text = 'Already merged into `integration`. Nothing to merge.';
    } else if (isAncestor(integration, head)) {
      state = 'current';
      text = `Up to date with \`integration\`.`;
    } else {
      const verdict = execFileSync('sh', [join(TOOLS, 'scripts/ci-dry-merge.sh'), head, integration], { encoding: 'utf8' }).trim();
      if (verdict === 'clean') {
        state = 'clean';
        text = `\`integration\` has moved on since this branch started. A test merge is clean today. ${pull}`;
      } else if (verdict === 'registry') {
        state = 'registry';
        text = `\`integration\` has moved on. Only the generated registry indexes differ. If the merge stops on them, run \`npm run registry\` and commit. ${pull}`;
      } else {
        state = 'conflict';
        const files = verdict.replace(/^conflict /, '').split(' ').filter(Boolean).map((f) => `- \`${f}\``).join('\n');
        text = `Merging \`integration\` into this branch conflicts today, in:\n\n${files}\n\nMerge it in soon so the conflict stays small. ${pull} Then run \`npm test\`.`;
      }
    }
    const body = `${MARK}:${state} -->\n${text}\n\n${checked}`;
    const found = await findComment(pr.number, MARK);
    const wasConflict = /integration-behind:conflict/.test(found?.body ?? '');
    if (found) {
      await editComment(found.id, body);
      if (state === 'conflict' && !wasConflict) {
        await addComment(pr.number, 'Heads-up: merging `integration` into this branch now conflicts. Details are in the integration comment above.');
      }
    } else if (state !== 'merged' && state !== 'current') {
      await addComment(pr.number, body);
    }
    console.log(`#${pr.number} ${pr.head.ref}: ${state}`);
  } catch (err) {
    // one PR failing must not stop the others
    console.error(`#${pr.number}: ${err.message}`);
  }
}
