// Static game data the UI lists and the sim validates against. Parts gates come from balance.js.
import { BALANCE } from './balance.js';
const T = BALANCE.tiers;
export const ROAD_TYPES = [
  { id: 'two', short: 'Street',  name: 'Two-way street',        sub: '1 lane each way · 600 cars/h each', cost: 20 },
  { id: 'bike', short: 'Bike street', name: 'Street with bike lanes', sub: 'Calmer traffic · greener lanes · ' + T.bike + ' Parts to unlock', cost: 35, unlockParts: T.bike },
  { id: 'one', short: 'Avenue',  name: 'One-way avenue',        sub: '2 lanes · 1,100 cars/h · ' + T.one + ' Parts to unlock', cost: 45, unlockParts: T.one },
  { id: 'bus', short: 'Bus avenue',  name: 'Bus avenue',            sub: 'Bus lanes · ' + T.bus + ' Parts to unlock',   cost: 60, unlockParts: T.bus },
  { id: 'free', short: 'Freeway', name: 'Freeway',               sub: 'Fast and wide · ' + T.free.toLocaleString('en-US') + ' Parts to unlock', cost: 90, unlockParts: T.free },
];

export const ZONES = [['Residential', '#BFD8C4'], ['Commercial', '#E9C1B8'], ['Industrial', '#E7D8BF'], ['Civic', '#DCE8EC']];

// Placement lists are display-only until the grid milestone.
export const TOOL_LISTS = {
  build: [['Terrace house', '2 to 3 floors', '120'], ['Mansard block', '4 to 6 floors', '340'], ['Tower block', '8+ floors', '1,200'], ['Shop row', 'Awnings, planters', '200']],
  services: [['Clinic', 'Covers 12 tiles', '400'], ['School', 'Covers 16 tiles', '520'], ['Fire station', 'Covers 14 tiles', '480'], ['Police station', 'Covers 14 tiles', '480']],
  parks: [['Green', 'Lawn and trees', '60'], ['Plaza', 'Paving and lamps', '90'], ['Playground', 'Swings and benches', '140'], ['Pond', 'Water and reeds', '180']],
};
