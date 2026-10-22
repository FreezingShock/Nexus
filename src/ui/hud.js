// Top HUD: currencies, renewal meter, pause / speed / night / settings buttons, and toasts.
import { $, fmt, fmtRate } from './format.js';

export function createHud({ sim, send, onSettings, calendar }) {
  let acc = 0, toastTimer = 0;
  const s = sim.state;

  function toast(text) {
    const el = $('toast');
    el.textContent = text; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  $('pause').onclick = () => send({ type: 'togglePause' });
  $('speed').onclick = () => send({ type: 'cycleSpeed' });
  // Time of day: the sky follows the clock, and this button locks it to night, then day, then back to the cycle.
  const NEXT_LOCK = { auto: 'night', night: 'day', day: 'auto' }, LOCK_TEXT = { auto: 'Time of day: cycle', night: 'Time of day: night locked', day: 'Time of day: day locked' };
  $('night').onclick = () => {
    if (!calendar) return;
    const lock = NEXT_LOCK[calendar.get().timeLock] || 'auto';
    calendar.set('timeLock', lock);
    toast(LOCK_TEXT[lock]);
    sync();
  };
  $('settingsbtn').onclick = onSettings;

  function sync() {
    $('pause').setAttribute('aria-pressed', String(s.paused));
    $('speed').textContent = s.speed + '×';
    const lock = calendar ? calendar.get().timeLock : 'auto';
    $('night').setAttribute('aria-pressed', String(lock !== 'auto'));
    $('night').setAttribute('aria-label', LOCK_TEXT[lock]);
    $('rate').textContent = fmtRate(sim.rate());
    $('prate').textContent = fmtRate(sim.partsRate());
  }
  sync();

  return {
    toast, sync,
    // Called every frame; the DOM is only touched five times a second.
    frame(dt, alpha, force) {
      acc += dt;
      if (acc < 0.2 && !force) return false;
      acc = 0;
      const d = sim.display(alpha);
      $('coins').textContent = fmt(d.coins);
      $('parts').textContent = fmt(d.parts);
      return true;
    },
  };
}
