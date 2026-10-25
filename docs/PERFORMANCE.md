# Performance

Budgets (project rules): 16.7 ms a frame, sim tick under 2 ms, under 100 draw calls, JS under 300 KB gzipped. Phone
numbers are only claimed once measured on a phone.

## The probe

`node scripts/perf-probe.mjs` builds the whole render scene in Node the way `render/scene.js` does (no WebGL), runs
600 frames of every render system, and prints:

- an estimate of draw calls (one per visible renderable per material group, plus one per shadow caster in the sun's
  shadow pass), split by the system that made them, and triangles;
- CPU time per frame for the render systems and the town, startup cost per system, and the worst frame after a
  bulldoze (placed buildings) or a grown lot levelling up;
- sim tick time over 600 ticks;
- gzipped size of the JS the site loads (own code per file, plus three.js).

`--big` grows a stand-in late-game town first: streets on a 6-tile grid over the whole map, every block zoned, a day of
closed-form growth, then lots raised a few levels (about 500 grown lots). Use it to see how a change scales.

What it cannot see: GPU time, shader compiles, texture uploads, real frustum culling, and anything on a phone. The
frame-time numbers are CPU only. In the browser, Settings > Graphics has a frame and draw-call readout
(`renderer.info`); that is the number to trust.

## Merging buildings

Placed buildings (`render/town.js`) and grown lots (`render/systems/lots.js`) are merged into one mesh per material,
plus one ink-line buffer. `Batch` in `render/geom.js` records parts and writes them straight into typed arrays when it
builds. Each building is also baked once into world-space arrays (`Batch.bake`) and merged again with `addBaked`, so a
rebuild after a level-up or bulldoze is a copy, not a transform of every vertex.

Measured in Node on the cloud desktop (2026-10-25, `--big`, 513 grown lots): the worst frame after a lot levels up
went from about 440 to 1,800 ms to about 35 ms (p50). Placed-building rebuild in the starter town went from about 10 ms
to about 1 ms.

Placed buildings and grown lots share one set of merged meshes (`render/building-batch.js`): the town and the lots
system each register a source of baked buildings, and either one's change re-merges both. They use the same wall and
roof materials, so this draws each material once instead of once per owner, in both passes. In the `--big` stand-in it
took the building calls from 27 (main) + 26 (shadow) to 18 + 17. The cost: a bulldoze or upgrade of a placed building
now re-merges the grown lots too (about 20 to 30 ms in that town instead of about 1 ms), still a single frame.

## Draw calls in the `--big` stand-in (with shadows)

| step | calls |
|---|---:|
| start of the pass | ~154 |
| one vehicle edge buffer, no trim shadows, 24-tile road chunks | ~131 |
| shared building meshes | ~118 |
