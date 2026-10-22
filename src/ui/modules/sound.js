// Sound glue. Menus and buttons get soft clicks, the town's actions get their own cues, day and night get a bell and a
// change of soundscape, and the ambience follows the camera. Reads the sim, the camera and the DOM; changes none of them.
// Nothing plays until the first click or key press (browsers require one), and nothing is fetched.
import { createEngine } from '../../audio/engine.js';
import { layersFor, cueFor, transitionCue } from '../../audio/soundscape.js';
import { listenerOf, sourceGains } from '../../audio/attenuation.js';

const GESTURES = ['pointerdown', 'keydown'];
const HOVER_SEL = 'button, [role="switch"]';
const LEVEL_EVERY_S = 0.25; // how often the ambience and its distances are refreshed

export default {
  id: 'sound',
  create({ sim, scene, sound }) {
    if (!sound) return {};
    const engine = createEngine();
    engine.apply(sound.get());
    sound.subscribe((s) => engine.apply(s));

    // The first real gesture starts the context. The listeners go once it has.
    const unlock = () => {
      if (!engine.unlock()) return;
      for (const ev of GESTURES) removeEventListener(ev, unlock, true);
    };
    for (const ev of GESTURES) addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => engine.setActive(document.visibilityState !== 'hidden'));

    // Buttons click softly. Tools are left to onTool, which knows whether a tool was picked or dropped.
    addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled && !b.classList.contains('tool')) engine.cue('select');
    }, true);

    // Hover is for a mouse only: a touch screen has no hover, and a tap should not sound twice.
    let hovered = null;
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest && e.target.closest(HOVER_SEL);
      if (b === hovered) return;
      hovered = b;
      if (b && !b.disabled) engine.cue('hover');
    });

    // Cards and modals open and close by their hidden attribute. One observer covers every menu, present and future.
    // The toast and the tool flyout have their own cues, so they are skipped here.
    const menus = new MutationObserver((muts) => {
      for (const m of muts) {
        const el = m.target;
        if (!(el instanceof Element) || !el.matches('.card, .modal')) continue;
        if (el.id === 'toast' || el.id === 'fly') continue;
        const wasHidden = m.oldValue !== null;
        if (wasHidden === el.hidden) continue; // the attribute did not change state
        if (el.id === 'offline') { if (!el.hidden) engine.cue('postcard'); continue; }
        engine.cue(el.hidden ? 'close' : 'open');
      }
    });
    menus.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });

    let lastNight = null, acc = 0;

    return {
      // Each sim event that has a cue. The mapping lives in audio/soundscape.js (cueFor).
      onEvent(e) {
        const name = cueFor(e);
        if (name) engine.cue(name);
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
        // Season and weather are read when another system puts them on the state; until then they count as spring and clear.
        engine.setLevels(layersFor({ night, season: st.season, weather: st.weather }));
        const cam = scene.camera;
        if (cam) engine.setSources(sourceGains(listenerOf({ mode: cam.mode, view: cam.view, free: cam.free })));
      },
    };
  },
};
