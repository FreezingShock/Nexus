// Festive props by the doors (render/festive/props.js): pumpkins and the odd ghost for Halloween, wreaths, snowmen and
// potted firs for Christmas, flags and bunting for the Fourth of July. A building puts its props out the same day it
// hangs its lights (the same luck against state.eventCover). Everything merges into one mesh plus one ink outline,
// rebuilt only when the day's cover, the event or the standing buildings change. Two draw calls, only during an event.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { toonUncached, hullInk } from '../materials.js';
import { kindOf } from '../life/rules.js';
import { luck } from '../festive/strings.js';
import { mergeProps, propsFor } from '../festive/props.js';
import { createLandWatch } from '../land-watch.js';
import { dressShare, isDark } from '../../core/festive.js';

// Which buildings put props out: homes, shops and the civic ones. Workshops and offices keep to their lights.
const DOORS = new Set(['home', 'shop', 'service', 'school', 'landmark', 'farm']);
export const dressedToday = (seed, cover) => luck(seed | 0, 11) < cover; // the same luck the lights use

export default {
  id: 'festive-decor',
  create({ world, town, sys }) {
    const body = new THREE.Mesh(new THREE.BufferGeometry(), toonUncached(0xffffff, { vertexColors: true }));
    const hull = new THREE.Mesh(new THREE.BufferGeometry(), hullInk);
    body.castShadow = true; body.frustumCulled = hull.frustumCulled = false; body.visible = hull.visible = false;
    world.add(body, hull);
    const land = createLandWatch();
    let key = '', seenFestive = null;
    const swap = (mesh, geo) => { mesh.geometry.dispose(); mesh.geometry = geo; };

    function build(event, cover, festive) {
      const lots = sys('lots'), list = [], share = dressShare(event, cover, festive).buildings;
      for (const e of town.lifeEntries().concat(lots ? lots.lifeEntries() : [])) {
        const k = kindOf(e.b), sites = e.parts.sites;
        if (!DOORS.has(k) || !sites || !sites.doors.length || !dressedToday(e.b.seed, share) || isDark(festive, e.b.id)) continue;
        const parts = propsFor(event, sites.doors[0], sites.bodies[0], e.b.seed | 0);
        if (parts.length) list.push({ parts, world: e.world });
      }
      body.visible = hull.visible = list.length > 0;
      if (!list.length) return;
      swap(body, mergeProps(list));
      swap(hull, mergeProps(list, 1.14));
    }

    return {
      frame(f) {
        const s = f.state;
        if (!s.event) { if (body.visible) body.visible = hull.visible = false; key = ''; return; }
        const rev = town.lifeRev() + (sys('lots') ? sys('lots').lifeRev() : 0);
        const k = s.event + ':' + s.eventCover + ':' + rev;
        if (land.poll()) key = '';
        if (k === key && s.festive === seenFestive) return;
        key = k; seenFestive = s.festive;
        build(s.event, s.eventCover, s.festive);
      },
    };
  },
};
