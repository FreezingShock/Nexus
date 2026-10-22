// Vehicle agents: cars and buses that drive the sim's routes, lane by lane. Visual only. This reads the sim's network,
// flow fields and demand and never writes to them. Pure logic: no THREE and no DOM (cars.js draws them).
//
// A vehicle sits on one tile at x in [0, 1), its progress across the tile from the entry edge, in lane `lane`. Cars on
// the same lane and direction follow each other with the intelligent driver model (IDM): they keep a gap, slow for the
// car ahead and queue. A car enters a tile only when the tile can take it. A straight road takes any car. A bend or a
// junction takes one entry arm at a time, and the car that has waited longest goes first. Tile occupancy is the spatial
// hash, so every neighbour check looks at a handful of tiles.
//
// Cars drive the flow field of their destination zone and stop at its anchor, then park at the kerb and shrink away.
// Buses drive their loop for ever. See docs/TRAFFIC.md.
import { GRID_N, inBounds, tileIndex } from '../world/grid.js';
import { DIRS, opposite } from '../world/roadnet.js';
import { ROAD_FLOW, TILES, ZONES, ZONE_SIDE, ZONE_N, stepBetween } from '../sim/traffic.js';
import { TUNNEL_GATE } from '../world/starter.js';
import { makeRng } from '../world/rng.js';

export const CAR = 0, BUS = 1;
export const DRIVE = 0, PARK = 1;
export const KIND = { END: 0, STRAIGHT: 1, BEND: 2, JUNCTION: 3 };

export const CAR_LEN = 0.5;          // car length in tiles (1.5 world units)
export const KERB = 1.4;             // parked cars stand this far right of the centre line (world units)
export const KERB_TIME = 0.5, SHRINK_TIME = 0.7; // a parked car stands, then shrinks away
const MIN_GAP = 0.2, HEADWAY = 1.0, ACC = 1.6, DEC = 2.5; // IDM: minimum gap, time headway, comfortable accel and braking
const LOOK = 4;                      // cells ahead searched for a leader
const STOP_END = 0.5;                // a route that ends stops its car in the middle of the tile
const STOP_LINE = 0.98;              // a car waits here while the next tile cannot take it
const GIVE_UP = 15;                  // seconds a car may wait at a line before it leaves (gridlock breaker)
const SPAWN_GAP = 0.25;              // seconds between spawn attempts
// The tunnel: the gate tile is a dead end at the foot of the mountain. A share of new cars comes out of it, and a share
// of new cars leaves town for it. An exiting car drives east along the stem and goes into the tunnel at the gate.
const GATE = tileIndex(TUNNEL_GATE.gx, TUNNEL_GATE.gz);
const TUNNEL_IN = 0.12, TUNNEL_OUT = 0.12;
const EXIT_FROM = TUNNEL_GATE.gx - 19; // exiting cars join the stem from here, east of the village
const SPAWN_TRIES = 4;               // trips tried per attempt
const SUB_DT = 1 / 30;               // largest integration step
const MAX_DT = 0.25;                 // longer frames (a hidden tab) are cut to this

// Lanes per direction come from the road type (ROAD_FLOW). A car keeps its preferred lane and takes the nearest one a
// tile has, so a two-lane road feeds a one-lane road without a lane change.
export function lanesAt(roads, tile) {
  const r = roads[tile];
  return r ? (ROAD_FLOW[r.t] || ROAD_FLOW.two).lanes : 1;
}
export function laneOf(roads, tile, pref) { return Math.min(pref, lanesAt(roads, tile) - 1); }

// Lateral offset of a lane from the tile centre, to the right of travel. Lane 0 is always the right-hand lane, so a car
// that stays in lane 0 keeps the same side of the road across every tile type. A one-way road's second lane is on the
// left; a freeway's second lane is the outer right one.
export function laneOffset(roads, tile, lane) {
  if (lanesAt(roads, tile) <= 1) return 0.6;
  const r = roads[tile];
  if (r && r.t === 'one') return lane === 0 ? 0.6 : -0.6;
  return lane === 0 ? 0.6 : 1.2;
}

// What each tile is, from the arms that connect to it: END (a dead end or one arm), STRAIGHT (two opposite arms),
// BEND (two arms at a right angle) or JUNCTION (three or more). Arms count a road that leads in or out.
export function tileKinds(net) {
  const kind = new Uint8Array(TILES);
  for (let u = 0; u < TILES; u++) {
    const gx = u % GRID_N, gz = Math.floor(u / GRID_N);
    let mask = 0, n = 0;
    for (let d = 0; d < 4; d++) {
      const vx = gx + DIRS[d][0], vz = gz + DIRS[d][1];
      if (!inBounds(vx, vz)) continue;
      const v = tileIndex(vx, vz);
      if (net.open[u * 4 + d] || net.open[v * 4 + opposite(d)]) { mask |= 1 << d; n++; }
    }
    kind[u] = n <= 1 ? KIND.END : n === 2 ? (mask === 5 || mask === 10 ? KIND.STRAIGHT : KIND.BEND) : KIND.JUNCTION;
  }
  return kind;
}

// Speed through a turn, as a share of the desired speed. Going straight is full speed.
function turnFactor(inDir, outDir) {
  if (outDir < 0 || inDir < 0) return 0.6;
  if (inDir === outDir) return 1;
  return outDir === opposite(inDir) ? 0.4 : 0.6;
}

export class Fleet {
  constructor(seed) {
    this.rng = makeRng(seed);
    this.agents = [];
    this.head = new Int32Array(TILES).fill(-1);    // first driving agent on each tile (linked through agent.link)
    this.claim = new Int32Array(TILES).fill(-1);   // substep stamp of the last car let into a bend or junction
    this.stamp = 0;
    this.clock = 0;
    this.spawnT = 0;
    this.kinds = new Uint8Array(TILES);
    this.kindNet = undefined;
    this.toursRef = undefined;
    this.cum = new Float64Array(ZONES * ZONES);    // cumulative trip weight over origin-destination zone pairs
    this.cumTotal = 0;
    this.cumVersion = undefined;
    this.cumReady = false;
    this.reqs = [];
    this.zoneRoads = [];
  }

  count(kind) {
    let n = 0;
    for (const a of this.agents) if (a.alive && a.state === DRIVE && a.kind === kind) n++;
    return n;
  }
  carCount() { return this.count(CAR); }
  busCount() { return this.count(BUS); }

  // dt is game seconds (already scaled by game speed, 0 when paused). Long frames are split so IDM stays stable.
  // env: { roads, net, fields, anchors, total, version, tours, carWant, busWant }. Read only.
  step(dt, env) {
    if (!(dt > 0)) return;
    const d = Math.min(dt, MAX_DT), n = Math.ceil(d / SUB_DT), h = d / n;
    this.syncRoutes(env);
    for (let i = 0; i < n; i++) this.substep(h, env);
  }

  substep(h, env) {
    this.clock += h;
    this.index();
    this.spawn(h, env);
    this.plan(h, env);
    this.resolve(env);
    this.timers(h);
  }

  // Tiles of driving vehicles, linked lists. Parked vehicles are not on the road and are left out.
  index() {
    this.head.fill(-1);
    for (const a of this.agents) {
      if (!a.alive || a.state !== DRIVE) continue;
      a.link = this.head[a.tile];
      this.head[a.tile] = a.id;
    }
  }

  syncRoutes(env) {
    if (env.net !== this.kindNet) {
      this.kindNet = env.net;
      this.kinds = env.net ? tileKinds(env.net) : new Uint8Array(TILES);
    }
    if (env.tours !== this.toursRef) {
      this.toursRef = env.tours;
      const tours = env.tours || [];
      for (const a of this.agents) {
        if (a.alive && a.kind === BUS && a.state === DRIVE && !tours.includes(a.tour)) this.stop(a, KERB_TIME);
      }
    }
  }

  // The tile after t on this vehicle's route, or -1. An exiting car drives straight east, to the gate.
  nextOf(a, env, t) {
    if (a.exit) return (t % GRID_N) + 1 < GRID_N && env.roads[t + 1] ? t + 1 : -1;
    const f = env.fields[a.dest];
    return f ? f.next[t] : -1;
  }

  // The tile `s` steps ahead of the vehicle along its route, or -1 when the route ends or breaks.
  hop(a, env, s) {
    if (a.kind === BUS) return a.tour[(a.k + s) % a.tour.length];
    let t = a.tile;
    for (let j = 0; j < s; j++) {
      const n = this.nextOf(a, env, t);
      if (n < 0 || !env.roads[n] || stepBetween(t, n) < 0) return -1;
      t = n;
    }
    return t;
  }

  // Refreshes the next tile and the exit direction of a vehicle that has just entered a tile.
  route(a, env) {
    const nt = this.hop(a, env, 1);
    a.nt = nt;
    a.out = nt >= 0 ? stepBetween(a.tile, nt) : a.mv;
  }

  // Free-flow share of the desired speed on this edge: BPR travel time against free flow, so a congested road slows
  // its cars the same way the sim's commute numbers do.
  speedFactor(tile, out, env) {
    const net = env.net;
    if (!net || out < 0) return 1;
    const e = tile * 4 + out;
    if (!net.open[e] || !(net.cost[e] > 0)) return 1;
    const f = net.t0[e] / net.cost[e];
    return f >= 1 ? 1 : f < 0.25 ? 0.25 : f;
  }

  // The nearest driving vehicle ahead on this lane, as a centre-to-centre distance in tiles, or null. The same tile is
  // checked first, then up to LOOK tiles along the route. The first tile that has one is the nearest.
  leader(a, env) {
    const roads = env.roads;
    let best = Infinity, bestV = 0;
    // a car in another lane of this tile is still a leader when both will merge into the same lane of the next tile
    const mergeLane = a.nt >= 0 && roads[a.nt] ? laneOf(roads, a.nt, a.pref) : -1;
    for (let id = this.head[a.tile]; id >= 0; id = this.agents[id].link) {
      const b = this.agents[id];
      if (b === a || b.mv !== a.mv || b.x <= a.x) continue;
      if (b.lane !== a.lane && !(mergeLane >= 0 && laneOf(roads, a.nt, b.pref) === mergeLane)) continue;
      if (b.x - a.x < best) { best = b.x - a.x; bestV = b.v; }
    }
    if (best < Infinity) return { D: best, v: bestV };
    let base = 1 - a.x, t = a.tile;
    for (let s = 1; s <= LOOK; s++) {
      let nt;
      if (a.kind === BUS) nt = a.tour[(a.k + s) % a.tour.length];
      else nt = this.nextOf(a, env, t);
      if (nt < 0 || !roads[nt]) break;
      const mvs = stepBetween(t, nt);
      if (mvs < 0) break;
      const lane = laneOf(roads, nt, a.pref);
      for (let id = this.head[nt]; id >= 0; id = this.agents[id].link) {
        const b = this.agents[id];
        if (b === a || b.mv !== mvs || b.lane !== lane) continue;
        if (base + b.x < best) { best = base + b.x; bestV = b.v; }
      }
      if (best < Infinity) break;
      base += 1;
      t = nt;
    }
    return best < Infinity ? { D: best, v: bestV } : null;
  }

  // Can a car with this entry direction go into tile w now? A straight road always can. A bend or junction only takes
  // cars from one entry arm at a time, so every car already inside must share the entry direction.
  allowed(w, mv, self) {
    if (this.kinds[w] === KIND.STRAIGHT) return true;
    for (let id = this.head[w]; id >= 0; id = this.agents[id].link) {
      const b = this.agents[id];
      if (b !== self && b.mv !== mv) return false;
    }
    return true;
  }

  // Each vehicle picks its speed and its move from the snapshot taken at the start of the substep. Cars that reach the
  // end of a tile ask to cross into the next one; resolve() decides who may.
  plan(h, env) {
    const roads = env.roads;
    for (const a of this.agents) {
      if (!a.alive || a.state !== DRIVE) continue;
      if (!roads[a.tile]) { this.stop(a, KERB_TIME); continue; }   // the road under it was removed
      if (a.exit && a.tile === GATE && a.x >= STOP_END - 0.03) { a.alive = false; a.want = -1; continue; } // into the tunnel
      this.route(a, env);
      const nt = a.nt;

      // Desired speed: the congestion on the road, the bend on this tile, and the bend on the next one when near it.
      let v0 = a.v0 * this.speedFactor(a.tile, a.out, env);
      if (nt >= 0) {
        let turn = turnFactor(a.mv, a.out);
        if (a.x > 0.5) { const n2 = this.hop(a, env, 2); if (n2 >= 0) turn = Math.min(turn, turnFactor(a.out, stepBetween(nt, n2))); }
        v0 *= turn;
      }

      // Where the car must stop: the end of its route, or the line in front of a tile that cannot take it yet.
      let stopAt = -1;
      if (nt < 0) stopAt = STOP_END;
      else if (!this.allowed(nt, a.mv, a)) stopAt = STOP_LINE;
      const lineStop = stopAt === STOP_LINE;
      if (lineStop && !a.queued) { a.queued = true; a.since = this.clock; }
      a.atLine = lineStop;
      if (stopAt >= 0) v0 = Math.min(v0, Math.sqrt(2 * DEC * Math.max(0, stopAt - a.x)));

      const lead = this.leader(a, env);
      const v = a.v, free = 1 - Math.pow(v / Math.max(0.02, v0), 4);
      let acc = ACC * free;
      if (lead) {
        const s = Math.max(0.01, lead.D - CAR_LEN), dv = v - lead.v;
        const sStar = MIN_GAP + Math.max(0, v * HEADWAY + (v * dv) / (2 * Math.sqrt(ACC * DEC)));
        acc = ACC * (free - (sStar / s) ** 2);
      }
      let vNew = Math.max(0, v + acc * h), xNew = a.x + vNew * h;
      if (lead) {
        const xMax = a.x + lead.D - CAR_LEN;
        if (xNew > xMax) { xNew = Math.max(a.x, xMax); vNew = Math.min(vNew, (xNew - a.x) / h); }
      }
      if (stopAt >= 0) {
        const xs = Math.max(a.x, stopAt);
        if (xNew > xs) { xNew = xs; vNew = Math.min(vNew, (xNew - a.x) / h); }
      }

      if (nt < 0 && a.x >= STOP_END - 0.03 && vNew < 0.05) { this.stop(a, 0); continue; }   // stood at the route's end
      if (xNew >= 1 && nt >= 0) { a.want = nt; a.xNew = xNew; a.vNew = vNew; }
      else { a.want = -1; a.x = xNew; a.v = vNew; }
    }
  }

  // Asks in turn: the car queued longest goes first, and a car at a bend or junction must find the tile free.
  resolve(env) {
    const stamp = ++this.stamp;
    const reqs = this.reqs;
    reqs.length = 0;
    for (const a of this.agents) if (a.alive && a.state === DRIVE && a.want >= 0) reqs.push(a);
    if (!reqs.length) return;
    const key = (a) => (a.queued ? a.since : this.clock);
    reqs.sort((p, q) => (key(p) - key(q)) || (p.id - q.id));
    for (const a of reqs) {
      const w = a.want;
      if (this.canEnter(w, a, stamp)) this.enter(a, w, env);
      else {
        a.x = Math.max(a.x, STOP_LINE);
        a.v = 0;
        a.atLine = true;
        if (!a.queued) { a.queued = true; a.since = this.clock; }
      }
    }
  }

  canEnter(w, a, stamp) {
    if (this.kinds[w] === KIND.STRAIGHT) return true;
    if (this.claim[w] === stamp) return false;      // one car per bend or junction per substep
    if (!this.allowed(w, a.mv, a)) return false;
    this.claim[w] = stamp;
    return true;
  }

  enter(a, w, env) {
    const prev = a.tile;
    a.tile = w;
    a.mv = stepBetween(prev, w);
    a.lane = laneOf(env.roads, w, a.pref);
    if (a.kind === BUS) a.k = (a.k + 1) % a.tour.length;
    a.x = a.xNew - 1;
    a.v = a.vNew;
    a.want = -1;
    a.queued = false;
    a.atLine = false;
    a.wait = 0;
    this.route(a, env);
  }

  // Parked (arrived, broken off, or gave up) vehicles leave the lanes. They stand, then shrink.
  stop(a, t0) {
    a.state = PARK;
    a.t = t0;
    a.v = 0;
    a.want = -1;
    a.atLine = false;
    a.queued = false;
  }

  timers(h) {
    for (const a of this.agents) {
      if (!a.alive) continue;
      if (a.state === PARK) {
        a.t += h;
        if (a.t >= KERB_TIME + SHRINK_TIME) a.alive = false;
        continue;
      }
      a.age += h;
      if (a.atLine) { a.wait += h; if (a.wait > GIVE_UP) this.stop(a, KERB_TIME); }
      else a.wait = 0;
    }
  }

  spawn(h, env) {
    this.spawnT -= h;
    if (this.spawnT > 0) return;
    this.spawnT = SPAWN_GAP;
    if (this.carCount() < (env.carWant | 0)) this.spawnCar(env);
    if (this.busCount() < (env.busWant | 0)) this.spawnBus(env);
  }

  // Trip weight for each origin-destination zone pair (the sim's gravity split), cached per cycle.
  refreshCum(env) {
    if (this.cumReady && this.cumVersion === env.version) return;
    const { total, anchors, fields, roads } = env;
    // the road tiles of each zone: cars may start on any of them, so one busy anchor does not gate a whole zone
    this.zoneRoads = Array.from({ length: ZONES }, () => []);
    for (const k of Object.keys(roads)) {
      const u = Number(k), gx = u % GRID_N, gz = Math.floor(u / GRID_N);
      this.zoneRoads[Math.floor(gz / ZONE_SIDE) * ZONE_N + Math.floor(gx / ZONE_SIDE)].push(u);
    }
    let s = 0;
    for (let i = 0; i < ZONES; i++) {
      for (let j = 0; j < ZONES; j++) {
        const q = total[i * ZONES + j];
        if (q > 0 && i !== j && anchors[i] >= 0 && anchors[j] >= 0 && anchors[i] !== anchors[j] && fields[j]) s += q;
        this.cum[i * ZONES + j] = s;
      }
    }
    this.cumTotal = s;
    this.cumVersion = env.version;
    this.cumReady = true;
  }

  // A new car: from the tunnel, from town towards the tunnel, or a trip between two zones.
  spawnCar(env) {
    const r = this.rng();
    const tin = TUNNEL_IN + Math.min(0.25, (env.arrivals || 0) * 0.3); // newcomers arrive by the tunnel
    if (r < tin && this.spawnFromTunnel(env)) return;
    if (r < tin + TUNNEL_OUT && this.spawnToTunnel(env)) return;
    this.spawnTrip(env);
  }

  // A car comes out of the tunnel: it starts on the gate tile facing into town, and takes a route to a random zone.
  spawnFromTunnel(env) {
    const { roads, fields } = env;
    if (!roads[GATE]) return false;
    const j = Math.floor(this.rng() * ZONES), f = fields[j];
    if (!f || !(f.next[GATE] >= 0)) return false;
    const lane = laneOf(roads, GATE, 0);
    if (!this.clear(GATE, 2, lane, env)) return false;
    this.launch(GATE, 2, lane, 0, j, env);
    return true;
  }

  // A car leaves town for the tunnel: it joins the stem east of the village and drives straight to the gate.
  spawnToTunnel(env) {
    const { roads } = env;
    const u = tileIndex(EXIT_FROM + Math.floor(this.rng() * (TUNNEL_GATE.gx - EXIT_FROM)), TUNNEL_GATE.gz);
    if (!roads[u]) return false;
    const lane = laneOf(roads, u, 0);
    if (!this.clear(u, 0, lane, env)) return false;
    this.launch(u, 0, lane, 0, -1, env, true);
    return true;
  }

  // A new car leaves an origin zone for a destination zone, both drawn from the sim's trips. It starts mid-tile.
  spawnTrip(env) {
    const { roads, fields, anchors } = env;
    if (!env.total) return;
    this.refreshCum(env);
    if (!(this.cumTotal > 0)) return;
    const cum = this.cum;
    // a few trips are tried per attempt, so a busy origin does not stall the others
    for (let tries = 0; tries < SPAWN_TRIES; tries++) {
      const r = this.rng() * this.cumTotal;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > r) hi = mid; else lo = mid + 1; }
      const i = Math.floor(lo / ZONES), j = lo % ZONES;
      const local = this.zoneRoads[i], f = fields[j];
      const u = local.length ? local[Math.floor(this.rng() * local.length)] : anchors[i];
      if (!f || u < 0 || !roads[u]) continue;
      const nt = f.next[u];
      const d = nt >= 0 ? stepBetween(u, nt) : -1;
      if (d < 0 || !roads[nt]) continue;
      // cars keep to the right: one lane in use. Lane changes are not modelled yet, so a car never sweeps across a road.
      const pref = 0, lane = laneOf(roads, u, pref);
      if (this.clear(u, d, lane, env)) { this.launch(u, d, lane, pref, j, env); return; }
    }
  }

  launch(u, d, lane, pref, j, env, exit = false) {
    const a = this.slot(CAR);
    a.type = Math.floor(this.rng() * 3);
    a.colour = Math.floor(this.rng() * 6);
    a.dest = j;
    a.exit = exit;
    a.tour = null;
    a.k = 0;
    a.tile = u;
    a.mv = d;
    a.pref = pref;
    a.lane = lane;
    a.x = 0.5;
    a.v0 = 0.85 + this.rng() * 0.45;
    a.v = a.v0 * 0.6;
    this.route(a, env);
    this.link(a);
  }

  // A bus starts at a random stop on a loop that has no bus yet.
  spawnBus(env) {
    const tours = env.tours || [], roads = env.roads;
    if (!tours.length) return;
    const busy = new Set();
    for (const a of this.agents) if (a.alive && a.kind === BUS && a.state === DRIVE) busy.add(a.tour);
    const loop = tours.find((t) => !busy.has(t));
    if (!loop) return;
    const k = Math.floor(this.rng() * loop.length), tile = loop[k];
    if (!roads[tile]) return;
    const prev = loop[(k - 1 + loop.length) % loop.length];
    const d = stepBetween(prev, tile);
    if (d < 0) return;
    const lane = laneOf(roads, tile, 0);
    if (!this.clear(tile, d, lane, env)) return;
    const a = this.slot(BUS);
    a.type = 0;
    a.colour = Math.floor(this.rng() * 2);
    a.dest = -1;
    a.exit = false;
    a.tour = loop;
    a.k = k;
    a.tile = tile;
    a.mv = d;
    a.pref = 0;
    a.lane = lane;
    a.x = 0.5;
    a.v0 = 0.7;
    a.v = 0.5;
    this.route(a, env);
    this.link(a);
  }

  // Room to start a vehicle here: nothing on its lane near the start, nothing in a junction, nothing about to arrive
  // from behind.
  clear(u, d, lane, env) {
    const gx = u % GRID_N, gz = Math.floor(u / GRID_N);
    const straight = this.kinds[u] === KIND.STRAIGHT;
    for (let id = this.head[u]; id >= 0; id = this.agents[id].link) {
      const b = this.agents[id];
      if (!straight && b.x < 1) return false;
      if (b.mv === d && b.lane === lane && Math.abs(b.x - 0.5) < 0.75) return false;
    }
    const px = gx - DIRS[d][0], pz = gz - DIRS[d][1];
    if (inBounds(px, pz)) {
      for (let id = this.head[tileIndex(px, pz)]; id >= 0; id = this.agents[id].link) {
        const b = this.agents[id];
        if (b.mv === d && b.x > 0.25) return false;
      }
    }
    return !!env.roads[u];
  }

  // A slot for a new vehicle: a dead one is reused, so the pool never grows past the peak.
  slot(kind) {
    let a = this.agents.find((b) => !b.alive);
    if (!a) {
      a = { id: this.agents.length, link: -1, type: 0, colour: 0, tile: 0, mv: 0, out: 0, nt: -1, pref: 0, lane: 0, x: 0, v: 0, v0: 1, dest: -1, tour: null, k: 0, wait: 0, since: 0, xNew: 0, vNew: 0, want: -1, queued: false, atLine: false, t: 0, age: 0, state: DRIVE, alive: false, kind };
      this.agents.push(a);
    }
    Object.assign(a, { kind, alive: true, state: DRIVE, t: 0, age: 0, wait: 0, since: 0, queued: false, atLine: false, want: -1, xNew: 0, vNew: 0 });
    return a;
  }

  link(a) {
    a.link = this.head[a.tile];
    this.head[a.tile] = a.id;
  }
}
