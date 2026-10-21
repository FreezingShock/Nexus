// Spinning wind turbines.
import { buildTurbines } from '../props.js';

export default {
  id: 'turbines',
  create({ world, layout }) {
    const hubs = buildTurbines(world, layout);
    return { frame: (f) => { for (const h of hubs) h.hub.rotation.z += f.dt * h.speed; } };
  },
};
