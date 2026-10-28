# Release notes

A pull request that changes something a player can see or hear adds **one small file here** instead of editing
`src/changelog.js` or `src/version.js` (those two are only written when a release is cut, so parallel threads never
conflict on them).

Name it after your branch: `release-notes/<topic>.json`, a list of lines:

```json
[
  { "k": "new", "t": "One plain sentence for players.", "pr": 123 }
]
```

`k` is one of `new`, `better`, `look`, `sound`, `fix`. `pr` is your PR number (optional until it is open).

When nate says to promote, run `node scripts/release.mjs <version> "<name>" "<one-sentence blurb>"`. It folds every
file here into a new newest entry in `src/changelog.js`, bumps `src/version.js`, `package.json` and the `?v=` in
`index.html`, and deletes the folded files. Commit the result in the release PR.
