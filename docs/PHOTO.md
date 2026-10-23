# Photo and cinematic mode

Press **O** (or Photo mode in the menu). The HUD steps away, clicks on the town do nothing, and a bar offers **Take photo** (Enter), **Cinematic** (Space), **Controls** and **Done** (O or Esc). The sim is never touched; leaving puts the camera, lens and sky back as they were.

- **Viewpoints** (`VIEWPOINTS` in `src/render/photo-math.js`): Postcard (the game's orthographic view), Bird's eye, Low angle, Street level (perspective lens) and Side on (orthographic, low). Sliders for lens (field of view, perspective only), zoom, tilt and turn follow the camera and move it.
- **Camera lens** (`src/render/camera.js`): a third camera, `pers`, placed from the same orbit state (`view.tx/tz/az/elev/zoom`) at the distance that frames the same patch of town as the orthographic view. `setLens('ortho'|'persp', fov)` switches it; `setFloor(lo)` lowers the lowest tilt (photo mode only, street level is about 0.06 rad).
- **Filters** are CSS filter strings: natural, warm film, old postcard, golden hour, ink sketch, black and white, moonlit. They sit on the canvas live and are used again (canvas 2D `filter`) when the PNG is drawn, so there is no extra render pass and no extra draw calls. A browser without 2D `filter` saves the picture unfiltered and says so.
- **Vignette** and **frame** (none, paper edge, snapshot with the town name) are drawn over the town live (CSS) and into the PNG (`frameMargins`), from the same numbers.
- **Time of day**: `scene.setHour(h)` overrides the sim hour for the sky and lights only. "Let the day pass" sweeps the clock round (80 s a day at pace 1).
- **Cinematic** (`cinePose`): slow orbit, drift along the town, rise and fall. Any camera key or grabbing the town stops it. All three are smooth loops around where the camera was, kept inside the town limit.
- **Saving**: `scene.grab(cb)` runs `cb(canvas)` straight after the next render, then the picture is composed on a 2D canvas and downloaded as `nexus-<town>-<date>.png` through an `<a download>`. No network.
- Choices (viewpoint aside) are kept in `localStorage` under `nexus.photo.v1`, wrapped in try/catch.
