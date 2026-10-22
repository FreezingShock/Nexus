// Sound glue. Anything that reads as a control gets a soft tick on hover and a click, the town's actions get their own
// cues, toasts get a gentle note, day and night get a bell and a change of soundscape, and the ambience follows the
// camera. Reads the sim, the camera and the DOM; changes none of them. Nothing plays until the first click or key press.
import { createEngine } from '../../audio/engine.js';
import { layersFor, cueFor, countOf, transitionCue } from '../../audio/soundscape.js';
import { listenerOf, sourceGains } from '../../audio/attenuation.js';
import { setCueSink } from '../../audio/cuehub.js';
import { interactiveAnchor } from '../sound-targets.js';

const GESTURES = ['pointerdown', 'keydown'];
const LEVEL_EVERY_S = 0.25; // how often the ambience and its distances are refreshed
const styleOf = (el) => {
  try { return getComputedStyle(el).cursor; }
  catch { return ''; }
};

export default {
  id: 'sound',
  create({ sim, scene, sound }) {
    if (!sound) return {};
    const engine = createEngine();
    engine.apply(sound.get());
    sound.subscribe((s) => engine.apply(s));
    setCueSink((name, opts) => engine.cue(name, opts));

    // The first real gesture starts the context. The listeners go once it has.
    const unlock = () => {
      if (!engine.unlock()) return;
      for (const ev of GESTURES) removeEventListener(ev, unlock, true);
    };
    for (const ev of GESTURES) addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => engine.setActive(document.visibilityState !== 'hidden'));

    // Clicks: any control (a button, or anything that shows a pointer) gets a soft click. Tools are left to onTool, which
    // knows whether a tool was picked or dropped. Form fields are handled by their own events below.
    addEventListener('click', (e) => {
      const a = e.target && e.target.nodeType === 1 ? interactiveAnchor(e.target, styleOf) : null;
      if (a && !a.classList.contains('tool')) engine.cue('select');
    }, true);
    addEventListener('change', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type === 'checkbox'))) engine.cue('select');
    }, true);
    addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'range') engine.cue('tick');
    }, true);

    // Hover is for a mouse only: a touch screen has no hover, and a tap should not sound twice. The tick plays when the
    // pointer moves onto a different control, and the engine's gap keeps a fast sweep from chattering.
    let hovered = null;
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const a = e.target && e.target.nodeType === 1 ? interactiveAnchor(e.target, styleOf) : null;
      if (a === hovered) return;
      hovered = a;
      if (a) engine.cue('hover');
    });

    // Cards, modals and the toast open and close by their hidden attribute. One observer covers them all, present and
    // future. The tool flyout has its own cue (onTool), and the postcard has its own.
    const menus = new MutationObserver((muts) => {
      for (const m of muts) {
        const el = m.target;
        if (!(el instanceof Element) || !el.matches('.card, .modal')) continue;
        if (el.id === 'fly') continue;
        const wasHidden = m.oldValue !== null;
        if (wasHidden === el.hidden) continue; // the attribute did not change state
        if (el.id === 'toast') { if (!el.hidden && !/Not enough/.test(el.textContent || '')) engine.cue('note'); continue; }
        if (el.id === 'offline') { if (!el.hidden) engine.cue('postcard'); continue; }
        engine.cue(el.hidden ? 'close' : 'open');
      }
    });
    menus.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });

    let lastNight = null, acc = 0;

    return {
      // Each sim event that has a cue. The mapping lives in audio/soundscape.js (cueFor and countOf).
      onEvent(e) {
        const name = cueFor(e);
        if (name) engine.cue(name, { n: countOf(e) });
      },
      onTool(tool) { engine.cue(tool ? 'tool' : 'close'); },
      frame(dt) {
        const st = sim.state;
        const night = !!st.night;
        if (lastNight === null) { lastNight = night; engine.setNight(night); }
        else if (night !== lastNight) {
          const cue = transitionCue(lastNight, night);
          lastNight = night;
          engine.setNight(night);
          if (cue) engine.cue(cue);
        }
        acc += dt;
        if (acc < LEVEL_EVERY_S) return;
        acc = 0;
        // Season and weather come from the sim's calendar state (state.season, state.weather), read here, never written.
        engine.setLevels(layersFor({ night, season: st.season, weather: st.weather }));
        const cam = scene.camera;
        if (cam) engine.setSources(sourceGains(listenerOf({ mode: cam.mode, view: cam.view, free: cam.free })));
      },
    };
  },
};
