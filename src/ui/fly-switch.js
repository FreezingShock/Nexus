// Motion for the build flyout when the player switches tools while it is already open (Roads to Zones, Buildings to
// Services...). The menu stays up, so the open and close tweens never run; these fill the gap. Quick, and skipped
// under Calm motion or reduced motion.
const EASE = 'cubic-bezier(.2,.8,.3,1)';

export const calmMotion = () => {
  try {
    return document.documentElement.dataset.motion === 'calm' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
};

// The tabs of a flyout that was already open slide out from behind the menu, one after another.
export function tabsIn(fly) {
  if (calmMotion()) return;
  fly.querySelectorAll('.ptab').forEach((t, i) => {
    if (typeof t.animate === 'function') t.animate([{ translate: '105% 0' }, { translate: '0 0' }], { duration: 300, delay: 60 + i * 40, easing: EASE, fill: 'backwards' });
  });
}

// A copy of the tabs slides back behind the menu when the next tool has none.
function tabsOut(fly, ghost) {
  const box = ghost.rect;
  ghost.el.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;right:auto;bottom:auto`;
  ghost.el.querySelectorAll('.ptab').forEach((t) => { t.style.transition = 'none'; });
  fly.parentNode.appendChild(ghost.el);
  const tabs = [...ghost.el.querySelectorAll('.ptab')];
  const anims = tabs.map((t, i) => t.animate([{ translate: '0 0' }, { translate: '105% 0' }], { duration: 220, delay: i * 30, easing: 'ease-in', fill: 'forwards' }));
  Promise.all(anims.map((a) => a.finished)).then(() => ghost.el.remove(), () => ghost.el.remove());
}

// Call before the tool changes; the returned function after the new tool has filled the flyout.
export function beginFlySwitch(fly, was, now) {
  const open = !fly.hidden && was && was !== now;
  fly._wasOpen = !!open;
  if (!open || calmMotion() || typeof fly.animate !== 'function' || typeof fly.getBoundingClientRect !== 'function') return () => { fly._wasOpen = false; };
  const before = fly.getBoundingClientRect();
  const tabs = fly.querySelector(':scope > .pbar > .ptabs');
  const ghost = tabs && { el: tabs.cloneNode(true), rect: tabs.getBoundingClientRect() };
  const order = [...document.querySelectorAll('.tool')].map((b) => b.dataset.tool);
  const dir = order.indexOf(now) >= order.indexOf(was) ? 1 : -1;
  return () => {
    fly._wasOpen = false;
    if (fly.hidden) return;
    const after = fly.getBoundingClientRect();
    const wide = innerWidth > 900;
    const from = { opacity: 0.35, transform: `translateX(${dir * 26}px)`, height: before.height + 'px' };
    const to = { opacity: 1, transform: 'none', height: after.height + 'px' };
    if (wide) { from.width = before.width + 'px'; to.width = after.width + 'px'; }
    fly.animate([from, to], { duration: 240, easing: EASE });
    if (ghost && !fly.querySelector(':scope > .pbar > .ptabs')) tabsOut(fly, ghost);
  };
}
