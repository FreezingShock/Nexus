# Traffic

Traffic is derived from the roads and zoning on the shared grid (see GRID.md and ROADS.md). Only two numbers are saved: the last committed commute penalty and efficiency (`state.commutePenalty`, `state.commuteEff`). A reload restores them, so income matches the save. Flows, colours and the spawn table are derived and rebuild on load.

## Layers

- `src/sim/traffic.js`: pure math. BPR travel time, congestion classes, the directed network, Dijkstra flow fields, gravity trip split, assignment, tree times, zone anchors and demand. No DOM, no THREE.
- `src/sim/systems/traffic.js`: the budgeted cycle and the commit. Sets `sim.traffic` and `grid.traffic` (the same object, read only by render), writes `grid.load` (congestion class per road tile) and bumps `grid.loadRev`. Its `rate` hook adds the commute income penalty.
- `src/render/vehicle-agents.js`: the car and bus agents. Pure logic (no THREE, no DOM), tested in node. Reads the sim's network, flow fields and trip table; never writes to them.
- `src/render/cars.js`: draws the agents as instanced meshes. `src/render/townsfolk.js`: pedestrians. Both are visual only.
- `src/render/systems/roads.js`: tints roads with the Traffic overlay from `grid.load`.
- `src/ui/modules/commute.js`: one line in the Traffic flyout with commute efficiency and what the jams cost.

## Model

- Traffic zones are 8 x 8 tiles, so the 64 x 64 grid has 64 zones. Each zone's trips start and end at its **anchor**: the road tile nearest the zone centre (or the nearest road in town when the zone has none).
- Trips come from residents. A resident makes `1.6 / DAY_MIN` trips a game minute. `DAY_MIN = 24`: one town day is 24 game minutes. This is the main tuning knob, and it is a default to confirm with nate.
- Purposes split the trips: work 0.6 (to jobs), shops 0.25, services 0.1, other homes 0.05.
- Gravity: a zone's trips to a destination are weighted by `attraction / (travel time + 1)^1.5`, and each origin's trips sum to its total.
- Trips are one-way. The 1.6 figure counts every one-way trip.
- Lots from zoning count: residential 4 people per level, commercial 3 shops and 3 jobs per level, industrial 4 jobs per level, civic 1 service per level. Placed buildings count too, the starter village included (see [STARTER-TOWN.md](STARTER-TOWN.md)): homes are 2 people per floor, shops are a shop and a job each plus a person per floor, workplaces are 2 jobs per floor, and services and landmarks are one service each. Parks have no storeys and count for nothing.
- Road capacity is lanes per direction times planning capacity per lane (vehicles per game minute). Free-flow minutes per tile differ by tier (see `ROAD_FLOW`).
- BPR: `t = t0 (1 + 0.15 (v/c)^4)`. Road colours: free below 0.6 load, busy below 0.9, jammed above.
- Commute efficiency is `1 - (congested / free-flow commute time - 1)`, clamped to 0.6 to 1.0. It multiplies zone income: the penalty is `(eff - 1) x zone income`, so it can only take income away.

## Cycle

Work runs in steps so a tick stays small. One cycle does this, in order:

1. **solve**: one Dijkstra per destination zone (a flow field, one next hop per tile). 4 per tick.
2. **split**: gravity on the travel times from the solve, once per cycle.
3. **assign**: each destination's trips go onto its tree; the demand moves from leaves to the root. 8 per tick.
4. **commit volumes**: `flow = 0.5 old + 0.5 new` (damped iteration), then recost the edges.
5. **time**: free-flow and congested tree times, to get the commute ratio. 8 per tick.
6. **commit**: efficiency, income penalty, road colours, and the spawn table for cars.

A cycle takes about 35 ticks with all 64 zones active, fewer on a small town. A road change is picked up at the start of the next cycle.

## Visuals

Cars and buses are agents that drive the sim's routes lane by lane (`src/render/vehicle-agents.js`). They are visual only: they never change the economy, the saves or the sim.

- **Trips.** A car's origin and destination come from the sim's zone-to-zone trip table (`total`, the gravity split). The origin is a random road tile of the origin zone, so cars do not all start from one anchor. The destination is the zone's anchor. The route is the destination's flow field (`next`), so cars drive the same routes the congestion model assumes.
- **Following.** Cars use the intelligent driver model (IDM) against the nearest car ahead on their lane, up to four tiles ahead. They keep a safe gap, slow for the car in front, and queue. A car never moves past the car ahead: the position is clamped to the leader's position at the start of the step.
- **Junctions.** A straight road takes any car. A bend or junction takes one entry arm at a time, and the car that has waited longest goes first. Waiting cars stop at a line before the tile. A car blocked for 15 s leaves the road (a gridlock breaker).
- **Slowing.** Cars slow for the congestion on their road (BPR travel time against free flow, the same numbers the commute uses), and for bends on the tile they are on and the next one.
- **Lanes.** Lane 0 is the right-hand lane on every road type, so a car keeps its side of the road across tile types. Cars keep to the right: lane changes are not modelled yet, and cars never sweep across a road.
- **Arrival.** A car stops in the middle of its destination tile, stands at the kerb for half a second, then shrinks away over 0.7 s. A bus drives its loop for ever.
- **Spawning.** Cars spawn in proportion to the network's volume (target 300, cap 500, `0.35 x` the volume). Buses: one per loop, up to 16. A spawn attempt tries a few trips before giving up.
- **Culling.** Vehicles outside a circle around the view centre are not written to the GPU; they still move, so traffic carries on when the camera turns.
- **Models.** Three car models (hatchback, saloon, van) and one bus. Each is a body and a cabin, instanced, with ink edges in one dynamic line buffer. Colours come from the palette, one per vehicle. Draw calls: 9 for cars, 3 for buses, 2 for townsfolk.
- **Cost.** The agent step is O(vehicles x 4): the tile occupancy list is the spatial hash, so neighbour checks never scan the whole fleet. On the shipped town a frame's car update takes about 0.16 ms in node (not on a phone).

## Not done yet

- Lane changes and overtaking. Cars use one lane per direction.
- Flow fields are re-solved for every destination each cycle. The spec asked for re-solving only the affected region after a road change; that needs incremental tree repair and is a follow-up.
- Cars do not stop for bus stops, traffic lights or pedestrians. Junctions use first-come-first-served instead of signals.
- Budgets are checked in node, not on a phone. Frame cost on the shipped town is about 0.16 ms in node; the rest of the frame is not measured.
- The shipped town has no bus loop yet, so buses only appear on a town with bus roads.
