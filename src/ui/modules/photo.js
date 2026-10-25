// Photo and cinematic mode (key O, or Photo mode in the menu). Hides the HUD, then offers viewpoints (the game's view, bird's
// eye, low angle, street level), filters, a vignette, a frame, a chosen time of day, a slow camera move (orbit, drift, rise)
// and a button that saves a PNG to the computer. Nothing is sent anywhere. The sim is never touched: this reads state and
// steers the camera, the sky hour and the canvas. Filters are CSS filter strings (render/photo-math.js), used on the live
// canvas and again when the picture is drawn out, so no extra render passes. Not browser-run at the time of writing.
import { $ } from '../format.js';
import { book } from '../book.js';
import { PAGE_ICONS } from '../page-icons.js';
import { ISO, clamp } from '../../render/camera-math.js';
import {
  FILTERS, VIEWPOINTS, FRAMES, CINEMATICS, LOW_TILT, cleanPhoto, filterCss, viewpointOf, cinePose, cineHour,
  clockLabel, photoFileName, frameMargins,
} from '../../render/photo-math.js';

const KEY = 'nexus.photo.v1';
const CAMERA_SVG = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#2B2620" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M3 7.5h3.2L7.6 5h6.8l1.4 2.5H19a1 1 0 0 1 1 1V17a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1Z" fill="#FBF6EA"/><circle cx="11" cy="12.5" r="3.4"/></svg>';
const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';

const load = () => { try { return cleanPhoto(JSON.parse(localStorage.getItem(KEY))); } catch { return cleanPhoto(null); } };
const store = (st) => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private window: choices just do not stick */ } };

const chips = (list, attr, cur) => list.map((o) => `<button class="gfx-opt" data-${attr}="${o.id}" aria-pressed="${o.id === cur}">${o.name}</button>`).join('');
const slider = (id, label, min, max, step) => `<label class="ph-row"><span class="gfx-label">${label} <output id="${id}-o"></output></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}"></label>`;

export default {
  id: 'photo',
  order: -50, // first in line for keys, so tool keys do nothing while the camera is out
  create({ sim, scene, toast, tool, setTool }) {
    const camera = scene.camera, view = camera.view;
    let st = load(), on = false, panelOpen = true, cine = null, saved = null, hour0 = 15, dayT = 0, syncAcc = 0, userBusy = false;

    // ---- markup
    const btn = document.createElement('button');
    btn.className = 'ib'; btn.id = 'photobtn';
    btn.setAttribute('aria-label', 'Photo mode'); btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = CAMERA_SVG;
    $('settingsbtn').before(btn);

    const veil = document.createElement('div'); // vignette and frame, over the town
    veil.className = 'photoui ph-veil'; veil.hidden = true; veil.setAttribute('aria-hidden', 'true');
    veil.innerHTML = '<i class="ph-vig"></i><i class="ph-edge"></i><b class="ph-cap"></b>';
    const flash = document.createElement('div');
    flash.className = 'photoui ph-flash'; flash.setAttribute('aria-hidden', 'true');

    const bar = document.createElement('div');
    bar.className = 'photoui card ph-bar'; bar.dataset.mo = 'up'; bar.hidden = true;
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Photo mode');
    bar.innerHTML = `<button class="btn primary" id="ph-shot">Take photo</button>
      <button class="btn" id="ph-cine" aria-pressed="false">Cinematic</button>
      <button class="btn" id="ph-ctl" aria-pressed="true">Controls</button>
      <button class="btn" id="ph-exit">Done</button>`;

    const panel = document.createElement('aside');
    panel.id = 'photo'; panel.className = 'photoui card ph-panel'; panel.dataset.mo = 'pop'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Photo settings');
    panel.innerHTML = `<span class="tape ph-tape" aria-hidden="true"></span><header class="ph-head"><span class="nb-ico" style="--pg:#E8D9EC">${PAGE_ICONS.photo}</span><span><h2 class="h-disp">Photo mode</h2><small>O or Done to leave, Enter to take a photo</small></span></header>
      <div class="pad">
        <section class="ph-sec"><h3 class="h-disp">Viewpoint</h3><div class="ph-seg" id="ph-views">${chips(VIEWPOINTS, 'view', st.viewpoint)}</div>
          ${slider('ph-fov', 'Lens', 20, 80, 1)}${slider('ph-zoom', 'Zoom', 0.55, 3, 0.01)}${slider('ph-tilt', 'Tilt', 5, 140, 1)}${slider('ph-turn', 'Turn', 0, 360, 1)}</section>
        <section class="ph-sec"><h3 class="h-disp">Look</h3><div class="ph-seg" id="ph-filters">${chips(FILTERS, 'filter', st.filter)}</div>
          ${slider('ph-vig', 'Vignette', 0, 100, 1)}<div class="ph-seg" id="ph-frames">${chips(FRAMES, 'frame', st.frame)}</div></section>
        <section class="ph-sec"><h3 class="h-disp">Time of day</h3>
          <button class="gfx-sw" id="ph-hourOn" role="switch" aria-checked="false">Choose the hour<i></i></button>
          ${slider('ph-hour', 'Hour', 0, 24, 0.25)}</section>
        <section class="ph-sec"><h3 class="h-disp">Cinematic</h3><div class="ph-seg" id="ph-cines">${chips(CINEMATICS, 'cine', st.cine)}</div>
          ${slider('ph-speed', 'Pace', 0.25, 3, 0.05)}
          <button class="gfx-sw" id="ph-dayPass" role="switch" aria-checked="false">Let the day pass<i></i></button></section>
      </div>`;
    const x = document.createElement('button');
    x.className = 'x'; x.setAttribute('aria-label', 'Hide the settings'); x.innerHTML = CLOSE_SVG;
    panel.prepend(x);
    $('app').append(veil, flash, panel, bar);

    // ---- look: the canvas filter, vignette and frame (the same numbers drive the saved picture)
    function paintLook() {
      scene.canvas.style.filter = on ? filterCss(st.filter) : '';
      veil.hidden = !on;
      veil.style.setProperty('--vig', (st.vignette * 0.6).toFixed(3));
      const w = scene.canvas.clientWidth, h = scene.canvas.clientHeight, m = frameMargins(st.frame, w, h);
      veil.style.setProperty('--m-t', m.top + 'px'); veil.style.setProperty('--m-r', m.right + 'px');
      veil.style.setProperty('--m-b', m.bottom + 'px'); veil.style.setProperty('--m-l', m.left + 'px');
      veil.dataset.frame = st.frame;
      veil.querySelector('.ph-cap').textContent = st.frame === 'polaroid' ? sim.state.town.name : '';
    }
    function paintControls() {
      for (const [id, attr] of [['ph-views', 'view'], ['ph-filters', 'filter'], ['ph-frames', 'frame'], ['ph-cines', 'cine']]) {
        const key = { view: 'viewpoint', filter: 'filter', frame: 'frame', cine: 'cine' }[attr];
        for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset[attr] === st[key]));
      }
      $('ph-vig').value = Math.round(st.vignette * 100); $('ph-vig-o').textContent = Math.round(st.vignette * 100) + '%';
      $('ph-hourOn').setAttribute('aria-checked', String(st.hourOn)); $('ph-hour').disabled = !st.hourOn || st.dayPass;
      $('ph-hour').value = st.hour; $('ph-hour-o').textContent = clockLabel(st.hour);
      $('ph-dayPass').setAttribute('aria-checked', String(st.dayPass));
      $('ph-speed').value = st.speed; $('ph-speed-o').textContent = st.speed.toFixed(2).replace(/0$/, '') + 'x';
      $('ph-fov').closest('.ph-row').hidden = view.lens !== 'persp';
      paintLook();
    }
    // The camera sliders follow the camera (dragging, keys, a cinematic) unless a hand is on one.
    function syncCamera() {
      if (userBusy) return;
      const set = (id, v, text) => { $(id).value = v; $(id + '-o').textContent = text; };
      set('ph-fov', view.fov, Math.round(view.fov) + '°');
      set('ph-zoom', view.tzoom, view.tzoom.toFixed(2) + 'x');
      set('ph-tilt', Math.round(view.telev * 100), Math.round(view.telev * 57.3) + '°');
      const turn = ((view.taz % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      set('ph-turn', Math.round(turn * 57.3), Math.round(turn * 57.3) + '°');
    }

    // ---- camera
    function goView(id) {
      const v = viewpointOf(id);
      if (camera.mode === 'fly') camera.toggleFly();
      st.viewpoint = v.id;
      camera.setLens(v.lens, v.fov);
      view.telev = v.elev; view.tzoom = v.zoom;
      store(st); paintControls(); syncCamera();
    }
    function startCine() {
      if (camera.mode === 'fly') camera.toggleFly();
      cine = { t: 0, base: { tx: view.ttx, tz: view.ttz, az: view.taz, elev: view.telev } };
      $('ph-cine').setAttribute('aria-pressed', 'true'); $('ph-cine').textContent = 'Stop';
    }
    function stopCine() {
      cine = null; $('ph-cine').setAttribute('aria-pressed', 'false'); $('ph-cine').textContent = 'Cinematic';
    }

    // ---- enter, leave
    function enter() {
      if (on) return;
      book.close(); // a page would sit over the picture
      if (tool()) setTool(null);
      on = true;
      saved = { tx: view.ttx, tz: view.ttz, az: view.taz, elev: view.telev, zoom: view.tzoom, lens: view.lens, fov: view.fov };
      st.viewpoint = 'postcard'; // the camera starts as the game left it
      if (!st.hourOn && !st.dayPass) st.hour = sim.state.hour;
      hour0 = st.hour; dayT = 0;
      document.body.classList.add('photo');
      scene.setInert(true); camera.setFloor(LOW_TILT);
      btn.setAttribute('aria-pressed', 'true');
      bar.hidden = false; panel.hidden = !panelOpen; $('ph-ctl').setAttribute('aria-pressed', String(panelOpen));
      applyHour(); paintControls(); syncCamera();
      toast('Photo mode. Nothing here changes the town.');
    }
    function leave() {
      if (!on) return;
      stopCine(); on = false;
      document.body.classList.remove('photo');
      scene.setInert(false); scene.setHour(null);
      camera.setLens('ortho'); camera.setFloor(ISO.elevMin);
      if (saved) { view.ttx = saved.tx; view.ttz = saved.tz; view.taz = saved.az; view.telev = Math.max(saved.elev, ISO.elevMin); view.tzoom = saved.zoom; }
      btn.setAttribute('aria-pressed', 'false');
      bar.hidden = true; panel.hidden = true;
      paintLook();
    }
    const applyHour = () => scene.setHour(st.hourOn || st.dayPass ? st.hour : null);

    // ---- taking the picture
    function compose(src) {
      const w = src.width, h = src.height, c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      const css = filterCss(st.filter);
      let plain = false;
      if (css) { if ('filter' in g) g.filter = css; else plain = true; }
      g.drawImage(src, 0, 0);
      if ('filter' in g) g.filter = 'none';
      if (st.vignette > 0) {
        const r = Math.hypot(w, h) / 2, grad = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
        grad.addColorStop(0, 'rgba(43,38,32,0)'); grad.addColorStop(1, `rgba(43,38,32,${(st.vignette * 0.6).toFixed(3)})`);
        g.fillStyle = grad; g.fillRect(0, 0, w, h);
      }
      const m = frameMargins(st.frame, w, h);
      if (st.frame !== 'none') {
        g.fillStyle = '#FBF6EA';
        g.fillRect(0, 0, w, m.top); g.fillRect(0, h - m.bottom, w, m.bottom);
        g.fillRect(0, 0, m.left, h); g.fillRect(w - m.right, 0, m.right, h);
        g.strokeStyle = '#2B2620'; g.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.003));
        g.strokeRect(m.left, m.top, w - m.left - m.right, h - m.top - m.bottom);
        if (st.frame === 'polaroid') {
          g.fillStyle = '#5A4D3F'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = `italic 700 ${Math.round(m.bottom * 0.36)}px Fraunces, Georgia, serif`;
          g.fillText(sim.state.town.name, w / 2, h - m.bottom * 0.5);
        }
      }
      return { c, plain };
    }
    function shoot() {
      scene.grab((src) => {
        const { c, plain } = compose(src);
        const name = photoFileName(sim.state.town.name);
        c.toBlob((blob) => {
          if (!blob) { toast('The photo did not come out. Try again.'); return; }
          const url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          toast(plain ? `Saved ${name} (this browser could not add the filter to the file)` : `Saved ${name}`);
        }, 'image/png');
      });
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    }

    // ---- wiring
    btn.onclick = () => (on ? leave() : enter());
    $('ph-exit').onclick = leave;
    $('ph-shot').onclick = shoot;
    $('ph-cine').onclick = () => (cine ? stopCine() : startCine());
    $('ph-ctl').onclick = () => { panelOpen = !panelOpen; panel.hidden = !panelOpen; $('ph-ctl').setAttribute('aria-pressed', String(panelOpen)); };
    x.onclick = () => $('ph-ctl').click();
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-view],button[data-filter],button[data-frame],button[data-cine]');
      if (!b) return;
      if (b.dataset.view) return goView(b.dataset.view);
      if (b.dataset.filter) st.filter = b.dataset.filter;
      else if (b.dataset.frame) st.frame = b.dataset.frame;
      else st.cine = b.dataset.cine;
      if (b.dataset.cine && cine) startCine(); // a new move starts from here
      store(st); paintControls();
    });
    const bindRange = (id, fn) => $(id).addEventListener('input', () => { fn(+$(id).value); store(st); paintControls(); syncCamera(); });
    bindRange('ph-vig', (v) => { st.vignette = v / 100; });
    bindRange('ph-hour', (v) => { st.hour = v % 24; applyHour(); });
    bindRange('ph-speed', (v) => { st.speed = v; });
    bindRange('ph-fov', (v) => { view.fov = clamp(v, 20, 80); camera.setLens('persp', v); });
    bindRange('ph-zoom', (v) => { view.tzoom = clamp(v, 0.55, 3); });
    bindRange('ph-tilt', (v) => { view.telev = clamp(v / 100, LOW_TILT, ISO.elevMax); });
    bindRange('ph-turn', (v) => { view.taz = v / 57.3; });
    for (const id of ['ph-fov', 'ph-zoom', 'ph-tilt', 'ph-turn']) {
      $(id).addEventListener('pointerdown', () => { userBusy = true; if (cine) stopCine(); });
    }
    addEventListener('pointerup', () => { userBusy = false; });
    $('ph-hourOn').onclick = () => { st.hourOn = !st.hourOn; if (st.hourOn && !st.dayPass) st.hour = sim.state.hour; applyHour(); store(st); paintControls(); };
    $('ph-dayPass').onclick = () => {
      st.dayPass = !st.dayPass; hour0 = st.hour; dayT = 0; // the clock sweeps on from the hour it was at
      applyHour(); store(st); paintControls();
    };
    // Grabbing the town with the mouse hands the camera back to you.
    scene.canvas.addEventListener('pointerdown', () => { if (on && cine) stopCine(); });
    addEventListener('resize', () => { if (on) paintLook(); });

    return {
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 'o') { on ? leave() : enter(); return true; }
        if (!on) return false;
        if (e.key === 'Escape') { leave(); return true; }
        if (e.key === 'Enter') { e.preventDefault(); shoot(); return true; }
        if (k === ' ') { e.preventDefault(); cine ? stopCine() : startCine(); return true; }
        // Camera keys keep working; the movement keys also end a cinematic. Every other key (the tool keys) does nothing.
        if ('wasdqe'.includes(k) || k.startsWith('arrow') || k === 'shift') { if (cine && k !== 'shift') stopCine(); return false; }
        return k.length === 1 && k !== 'h'; // F (free fly) is among them: the photo lens needs the orbit camera
      },
      frame(dt) {
        if (!on) return;
        if (st.dayPass) { dayT += dt; st.hour = cineHour(hour0, dayT, st.speed); applyHour(); }
        if (cine) {
          cine.t += dt;
          const p = cinePose(st.cine, cine.t, cine.base, st.speed);
          view.ttx = p.tx; view.ttz = p.tz; view.taz = p.az; view.telev = clamp(p.elev, LOW_TILT, ISO.elevMax);
        }
        syncAcc += dt;
        if (syncAcc > 0.2) { syncAcc = 0; syncCamera(); if (st.dayPass) { $('ph-hour').value = st.hour; $('ph-hour-o').textContent = clockLabel(st.hour); } }
      },
    };
  },
};
