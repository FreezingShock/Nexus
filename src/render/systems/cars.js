// Moving cars (visual only).
import { buildCars } from '../cars.js';

export default {
  id: 'cars',
  create({ world, layout }) {
    const cars = buildCars(world, layout);
    return { frame: (f) => cars.update(f.simDt) };
  },
};
