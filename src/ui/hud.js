// Top HUD: currencies, renewal meter, pause / speed / night / settings buttons, and toasts.
import { $, fmt, fmtRate } from './format.js';

export function createHud({ sim, send, onSettings }) {
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
  $('night').onclick = () => send({ type: 'setNight', on: !s.night });
  $('settingsbtn').onclick = onSettings;

  function sync() {
    $('pause').setAttribute('aria-pressed', String(s.paused));
    $('speed').textContent = s.speed + '×';
    $('night').setAttribute('aria-pressed', String(!!s.night));
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
