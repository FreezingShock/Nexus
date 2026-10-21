// Used by .github/workflows/test.yml. Two modes:
//   node scripts/ci-pr.mjs gate     decide whether this run may merge into integration; writes `run` to $GITHUB_OUTPUT
//   node scripts/ci-pr.mjs report   record the outcome of the merge in the PR's status comment (env RESULT)
// Reads the PR live rather than from the event payload, so a re-run or a changed base is handled.
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT, PR (number), SHA (the commit this run tested), RESULT.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { addComment, api, editComment, findComment, repo } from './ci-github.mjs';

const mode = process.argv[2];
const pr = Number(process.env.PR);
const sha = process.env.SHA || '';
const short = (s) => s.slice(0, 7);
const STATUS = '<!-- integration-status';
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

async function setStatus(state, text) {
  const body = `<!-- integration-status:${state} ${sha} -->\n${text}`;
  const found = await findComment(pr, STATUS);
  if (found) await editComment(found.id, body); else await addComment(pr, body);
  return { isNew: !found, previous: found?.body ?? '' };
}

async function gate() {
  const live = await api(`/pulls/${pr}`);
  // A newer commit has its own run, which will report. Leave this one quiet rather than overwrite its status.
  if (live.head.sha !== sha) {
    console.log(`PR head is now ${short(live.head.sha)}; this run tested ${short(sha)}. Skipping quietly.`);
    return setOutput('false');
  }
  let reason = '';
  if (live.state !== 'open') reason = `the PR is ${live.state}`;
  else if (live.draft) reason = 'the PR is a draft. Mark it ready for review and it merges into `integration` once the tests pass';
  else if (!['main', 'integration'].includes(live.base.ref)) reason = `the base is \`${live.base.ref}\`. Only PRs against \`main\` or \`integration\` merge into \`integration\``;
  else if (live.head.repo?.full_name !== repo()) reason = 'the PR comes from a fork, and the bot only merges branches from this repository';
  else if (live.head.ref === 'integration') reason = 'the PR head is `integration` itself';
  if (!reason) return setOutput('true');
  console.log(`Not merging: ${reason}.`);
  await setStatus('skipped', `Not merged into \`integration\` yet: ${reason}.`);
  return setOutput('false');
}

function setOutput(run) {
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
}

async function report() {
  const result = process.env.RESULT;
  const conflicts = read('work/conflicts.txt').trim().split('\n').filter(Boolean).map((f) => `- \`${f}\``).join('\n');
  const text = {
    merged: `Merged \`${short(sha)}\` into \`integration\`. It shows on localhost after the next refresh.`,
    already: `\`${short(sha)}\` was already in \`integration\`. Nothing to merge.`,
    conflict: `Could not merge \`${short(sha)}\` into \`integration\` because of conflicts in:\n\n${conflicts}\n\n` +
      'To fix: merge the latest `integration` into this branch (`git fetch origin && git merge origin/integration`), resolve the conflicts, run `npm test`, and push. ' +
      'Do not force-push. The merge is retried automatically when the tests pass. Nothing was changed on `integration`.',
    testfail: `\`${short(sha)}\` passes its own tests, but the tests fail once merged with the current \`integration\`. Nothing was changed on \`integration\`.\n\n` +
      '<details><summary>Test output</summary>\n\n```\n' + read('work/test-tail.txt') + '\n```\n</details>\n\n' +
      'To fix: merge the latest `integration` into this branch, make the tests pass, and push.',
    error: `The merge into \`integration\` hit an error for \`${short(sha)}\`. See the workflow run log.`,
  }[result];
  if (!text) throw new Error(`unknown RESULT "${result}"`);
  const { isNew, previous } = await setStatus(result, text);
  // A status edit does not notify anyone. Say so once when a PR starts to need attention.
  const needsAttention = result === 'conflict' || result === 'testfail' || result === 'error';
  if (needsAttention && !isNew && !previous.includes(`<!-- integration-status:${result} ${sha} -->`)) {
    await addComment(pr, `The merge into \`integration\` needs attention for \`${short(sha)}\`. Details are in the integration status comment on this PR.`);
  }
}

try {
  if (mode === 'gate') await gate();
  else if (mode === 'report') await report();
  else throw new Error(`unknown mode "${mode}"`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
