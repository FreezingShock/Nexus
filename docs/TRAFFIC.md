# Traffic

Traffic is derived from the roads and zoning on the shared grid (see GRID.md and ROADS.md). Only two numbers are saved: the last committed commute penalty and efficiency (`state.commutePenalty`, `state.commuteEff`). A reload restores them, so income matches the save. Flows, colours and the spawn table are derived and rebuild on load.

## Layers

- `src/sim/traffic.js`: pure math. BPR travel time, congestion classes, the directed network, Dijkstra flow fields, gravity trip split, assignment, tree times, zone anchors and demand. No DOM, no THREE.
- `src/sim/systems/traffic.js`: the budgeted cycle and the commit. Sets `sim.traffic` and `grid.traffic` (the same object, read only by render), writes `grid.load` (congestion class per road tile) and bumps `grid.loadRev`. Its `rate` hook adds the commute income penalty.
- `src/render/cars.js`: cars and buses. `src/render/townsfolk.js`: pedestrians. Both are visual only.
- `src/render/systems/roads.js`: tints roads with the Traffic overlay from `grid.load`.
- `src/ui/modules/commute.js`: one line in the Traffic flyout with commute efficiency and what the jams cost.

## Model

- Traffic zones are 8 x 8 tiles, so the 64 x 64 grid has 64 zones. Each zone's trips start and end at its **anchor**: the road tile nearest the zone centre (or the nearest road in town when the zone has none).
- Trips come from residents. A resident makes `1.6 / DAY_MIN` trips a game minute. `DAY_MIN = 24`: one town day is 24 game minutes. This is the main tuning knob, and it is a default to confirm with nate.
- Purposes split the trips: work 0.6 (to jobs), shops 0.25, services 0.1, other homes 0.05.
- Gravity: a zone's trips to a destination are weighted by `attraction / (travel time + 1)^1.5`, and each origin's trips sum to its total.
- Trips are one-way. The 1.6 figure counts every one-way trip.
- Lots from zoning count: residential 4 people per level, commercial 3 shops and 3 jobs per level, industrial 4 jobs per level, civic 1 service per level. The shipped town counts too: houses are homes (2 per floor) and shop-front buildings are shops and jobs.
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

- Cars spawn on an edge picked in proportion to its volume, then drive their destination's flow field. They respawn (despawn on arrival) at the end of their route. Target 300 cars, instance cap 500, `0.35 x` the total volume on the network.
- Buses: each connected run of bus tiles gets one closed loop (a depth-first walk of its spanning tree, so every street is driven both ways). One bus per loop, up to 16.
- Townsfolk: walk, idle at junctions, sometimes slip into a building (shrink, hidden for a few seconds, come back out). Target 300, instance cap 500. Their count follows road tiles.
- Culling: vehicles and townsfolk outside a circle around the view centre are hidden and skip their line updates.
- Draw calls added: cars 3, buses 3, townsfolk 2.

## Not done yet

- Flow fields are re-solved for every destination each cycle. The spec asked for re-solving only the affected region after a road change; that needs incremental tree repair and is a follow-up.
- Visual cars are sampled from the sim's volumes, so they do not queue or collide. That matches the spec.
- Budgets are checked in node, not on a phone. See the PR for the measured numbers.
