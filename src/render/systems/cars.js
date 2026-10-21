// Moving cars (visual only), driving the road network in state.roads.
import { buildCars } from '../cars.js';

export default {
  id: 'cars',
  create({ world, layout }) {
    const cars = buildCars(world, layout);
    return { frame: (f) => cars.update(f.simDt, f.state.roads), count: cars.count };
  },
};
