// Moving traffic (visual only): cars on the sim's flow fields, buses on their loops, and townsfolk on the pavements.
import { buildCars } from '../cars.js';
import { buildTownsfolk } from '../townsfolk.js';
import { dayIndexOf } from '../../core/calendar.js';

export default {
  id: 'cars',
  create({ world, grid, camera }) {
    const cars = buildCars(world, grid, camera);
    const folk = buildTownsfolk(world, grid, camera);
    return {
      frame: (f) => { cars.update(f.simDt, f.state.roads, f.state.pop, f.state.popLive, f.state.routineHour, dayIndexOf(f.state.days || 0)); folk.update(f.simDt, f.state.roads, f.state.pop, f.state.popLive, f.state.routineHour, dayIndexOf(f.state.days || 0)); },
      count: cars.count,
      folk: folk.count,
      // Graphics settings: crowd size and vehicle ink edges.
      quality: (rs) => { cars.setQuality(rs); folk.setCrowd(rs.crowd); },
    };
  },
};
