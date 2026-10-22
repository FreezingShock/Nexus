// Static game data the UI lists and the sim validates against. Parts gates come from balance.js.
import { BALANCE } from './balance.js';
const T = BALANCE.tiers;
export const ROAD_TYPES = [
  { id: 'two', short: 'Street',  name: 'Two-way street',        sub: '1 lane each way · 600 cars/h each', cost: 20 },
  { id: 'bike', short: 'Bike street', name: 'Street with bike lanes', sub: 'Calmer traffic · greener lanes', cost: 35, unlockParts: T.bike },
  { id: 'one', short: 'Avenue',  name: 'One-way avenue',        sub: '2 lanes · 1,100 cars/h', cost: 45, unlockParts: T.one },
  { id: 'bus', short: 'Bus avenue',  name: 'Bus avenue',            sub: 'Bus lanes for faster buses', cost: 60, unlockParts: T.bus },
  { id: 'free', short: 'Freeway', name: 'Freeway',               sub: 'Fast and wide', cost: 90, unlockParts: T.free },
];

for (const r of ROAD_TYPES) r.cost = Math.round(r.cost * BALANCE.priceMult);
