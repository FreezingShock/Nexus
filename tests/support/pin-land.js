// Loaded before every test file (see the test script in package.json). New villages roll a random land; the older tests
// were written against the original land, so they pin it. Tests of the seeded land set their own seed.
globalThis.NEXUS_TERRAIN_SEED = 0;
