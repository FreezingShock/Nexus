// The list of render systems. To add a visual feature, create src/render/systems/<name>.js and add one line here.
// (Merges with `merge=union` in .gitattributes, so parallel one-line additions rarely conflict.)
//
// A render system is { id, create(ctx) } where ctx = { THREE, world, layout, camera, scene } and create returns
// an object whose optional hooks are called by scene.js:
//   frame(f)          every frame; f = { dt, t, simDt, state, tool }  (simDt is wall dt scaled by game speed, 0 paused)
//   setNight(on)      when the day/night blend crosses halfway
// Render systems read sim state, never write it, and keep draw calls low (instance or merge geometry).
import cars from './cars.js';
import turbines from './turbines.js';

export const renderSystems = [cars, turbines];
