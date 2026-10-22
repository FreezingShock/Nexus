// The town's people and little goings-on, in one place so every zone draws into the same few meshes. It owns the shared
// pools (people, hanging cloth, ...) and one director per kind of place (life/directors): homes, commercial, industry, farms, civic.
// Each director builds once per change of the town and then works only on buildings near the camera. Visual only.
// Graphics: Off draws none, Light has half the people and no cats, washing or forklifts, Full everything. Notes: docs/LIFE.md.
import { createPools } from '../life/pools.js';
import { createHomes } from '../life/directors/homes.js';
import { createCommercial } from '../life/directors/commercial.js';
import { createIndustry } from '../life/directors/industry.js';
import { createFarms } from '../life/directors/farms.js';
import { createCivic } from '../life/directors/civic.js';

export default {
  id: 'life-town',
  create({ world, town, camera, sys }) {
    let effects = 1, crowd = 1;
    const pools = createPools(world);
    const directors = [createHomes(pools), createCommercial(pools), createIndustry(pools), createFarms(pools), createCivic(pools)];
    let seenRev = -1;
    const c = {
      dt: 0, t: 0, hour: 12, night: 0, season: 'spring', wk: 'clear', fill: 0.5, happy: 0.4, rain: 0, effects: 1, crowd: 1, r2: 0, vx: 0, vz: 0,
      near(x, z) { const dx = x - c.vx, dz = z - c.vz; return dx * dx + dz * dz < c.r2; },
    };
    return {
      quality(rs) { effects = rs.effects; crowd = rs.crowd; },
      frame(f) {
        const lots = sys('lots'), rev = town.lifeRev() + (lots ? lots.lifeRev() : 0);
        if (rev !== seenRev) {
          seenRev = rev;
          const entries = town.lifeEntries().concat(lots ? lots.lifeEntries() : []);
          pools.cloth.reset();
          for (const d of directors) d.build(entries);
          pools.cloth.mesh.instanceMatrix.needsUpdate = true; pools.cloth.mesh.instanceColor.needsUpdate = true;
        }
        const v = camera.view, r = (v.half / v.zoom) * 2.2 + 4, live = f.state.popLive;
        c.dt = f.dt; c.t = f.t; c.hour = f.state.hour; c.night = f.sky ? f.sky.night : 0; c.season = f.state.season; c.wk = f.state.weatherKind;
        c.fill = live ? live.fill : 0.5; c.happy = live ? live.happy : 0.4; c.rain = f.sky ? f.sky.rain || 0 : 0;
        c.effects = effects; c.crowd = crowd; c.vx = v.tx; c.vz = v.tz; c.r2 = r * r;
        for (const d of directors) d.frame(c);
        pools.folk.step(f.dt, f.t);
        pools.cloth.mesh.visible = effects > 0 && pools.cloth.count > 0;
        if (effects <= 0) pools.folk.mesh.visible = false;
      },
    };
  },
};
