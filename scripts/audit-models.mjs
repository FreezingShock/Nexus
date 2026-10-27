// Model audit, run in Node: `node scripts/audit-models.mjs [modelId ...]`.
// Builds every model at every drawn size and level, for twelve different seeds, and lists z-fighting candidates
// (see tests/support/zfight.js for what counts). Prints nothing but "clean" for a model that passes.
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
const { MODELS, describe, footprintsOf, canonicalDims } = await import('../src/world/models.js');
const { buildParts } = await import('../src/render/models/builders.js');
const { zFights } = await import('../tests/support/zfight.js');

const only = process.argv.slice(2);
const SEEDS = Array.from({ length: 12 }, (_, i) => 'b' + (1000 + i));
let total = 0;
for (const m of MODELS) {
  if (only.length && !only.includes(m.id)) continue;
  const seen = new Map();
  for (const size of footprintsOf(m)) for (let lv = 1; lv <= 5; lv++) for (const id of SEEDS) {
    const [fw, fd] = canonicalDims(m, size);
    for (const f of zFights(buildParts(describe({ id, model: m.id, gx: 10, gz: 10, fw, fd, rot: 0 }, lv)))) {
      const key = `${size} ${f.normal} @${f.at}`;
      if (!seen.has(key)) seen.set(key, `${m.id} ${size} L${lv} ${id}: normal ${f.normal} near ${f.at}\n        ${f.boxes.join('\n        ')}`);
    }
  }
  total += seen.size;
  console.log(`${m.id}: ${seen.size ? seen.size + ' z-fight candidates' : 'clean'}`);
  for (const l of [...seen.values()].slice(0, 12)) console.log('   ' + l);
}
console.log(`total candidates ${total}`);
