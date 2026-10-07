/* PRISMA — Neon-Survival-Arcade. Pure HTML5 canvas + Web Audio, no dependencies. */
(() => {
'use strict';

// ============================================================ Helpers
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const $ = (s) => document.querySelector(s);
const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const fmtNum = (n) => Math.floor(n).toLocaleString('de-DE');
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const touchDevice = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const COL = {
  red: '#ff4d6d', amber: '#ff9f43', yellow: '#ffe66d', green: '#4dffb0', cyan: '#4dd6ff',
  blue: '#6b7bff', violet: '#c06bff', white: '#f4f1ff', gold: '#ffd166', ink: '#07060f', body: '#150f28',
};
const SPECTRUM = [COL.red, COL.amber, COL.yellow, COL.green, COL.cyan, COL.blue, COL.violet];

// ============================================================ Save data
const SAVE_KEY = 'prisma.save.v1';
function loadSave() {
  const def = {
    crystals: 0, earned: 0, runs: 0, totalKills: 0, seenHint: false,
    best: { score: 0, time: 0, level: 0, kills: 0 },
    shop: {}, ach: {},
    settings: { sfx: true, music: true, shake: !reducedMotion },
  };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw) || {};
      return {
        ...def, ...d,
        best: { ...def.best, ...(d.best || {}) },
        shop: { ...(d.shop || {}) },
        ach: { ...(d.ach || {}) },
        settings: { ...def.settings, ...(d.settings || {}) },
      };
    }
  } catch (e) { /* storage blocked: play without persistence */ }
  return def;
}
const save = loadSave();
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}
const shopLv = (id) => save.shop[id] || 0;

// ============================================================ Sound (synthesised, no assets)
const Sound = (() => {
  let ac = null, sfx = null, mus = null, duckG = null, noiseBuf = null;
  const last = Object.create(null);
  let musicTimer = 0, step = 0, nextT = 0, intensity = 0, musicOn = false;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5;
    const master = ac.createGain(); master.gain.value = 0.9;
    sfx = ac.createGain(); mus = ac.createGain(); duckG = ac.createGain();
    applySettings();
    sfx.connect(comp); mus.connect(duckG); duckG.connect(comp); comp.connect(master); master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function applySettings() {
    if (!ac) return;
    sfx.gain.value = save.settings.sfx ? 0.5 : 0;
    mus.gain.value = save.settings.music ? 0.3 : 0;
  }
  const ok = (key, gap) => {
    if (!ac || !save.settings.sfx) return false;
    const t = ac.currentTime;
    if (last[key] !== undefined && t - last[key] < gap) return false;
    last[key] = t;
    return true;
  };
  function tone(f, dur, o = {}) {
    if (!ac) return;
    const t = ac.currentTime + (o.when || 0);
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), t + dur);
    const v = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = osc;
    if (o.lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; osc.connect(fl); out = fl; }
    out.connect(g); g.connect(o.bus || sfx);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(dur, o = {}) {
    if (!ac) return;
    const t = ac.currentTime + (o.when || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const fl = ac.createBiquadFilter();
    fl.type = o.type || 'bandpass';
    fl.frequency.setValueAtTime(o.f || 1200, t);
    fl.Q.value = o.q || 1;
    if (o.slide) fl.frequency.exponentialRampToValueAtTime(Math.max(30, (o.f || 1200) * o.slide), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(o.bus || sfx);
    src.start(t, Math.random() * 0.8); src.stop(t + dur + 0.05);
  }

  // Music: A minor, i–VI–III–VII, layers join as the run heats up.
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const BPM = 118;
  function musicTick() {
    if (!ac || !musicOn) return;
    const s16 = 60 / BPM / 4;
    if (nextT < ac.currentTime - 0.2) nextT = ac.currentTime + 0.05; // tab was throttled: skip, don't burst
    while (nextT < ac.currentTime + 0.15) {
      const when = Math.max(0, nextT - ac.currentTime);
      const pos = step % 16, bar = ((step / 16) | 0) % 4, ch = PROG[bar];
      if (save.settings.music) {
        if (pos % 4 === 0) tone(150, 0.16, { slide: 0.28, vol: 0.5, bus: mus, when });
        if (pos === 0 || pos === 3 || pos === 6 || pos === 8 || pos === 11 || pos === 14) {
          tone(mtof(ch[0] - 24), s16 * 1.8, { type: 'sawtooth', vol: 0.15, lp: 300 + intensity * 260, bus: mus, when });
        }
        if (intensity >= 1 && pos % 2 === 0) {
          const n = ch[(pos >> 1) % 3] + (pos >= 8 ? 24 : 12);
          tone(mtof(n), s16 * 1.3, { type: 'triangle', vol: 0.05, bus: mus, when });
        }
        if (intensity >= 2 && pos % 4 === 2) noise(0.05, { f: 9000, type: 'highpass', vol: 0.05, bus: mus, when });
        if (intensity >= 2 && (pos === 4 || pos === 12)) noise(0.14, { f: 1700, q: 0.8, vol: 0.11, bus: mus, when });
        if (intensity >= 3 && (pos === 0 || pos === 6 || pos === 10)) {
          tone(mtof(ch[(bar + pos) % 3] + 12), s16 * 2.5, { type: 'square', vol: 0.035, lp: 1800, bus: mus, when });
        }
      }
      nextT += s16; step++;
    }
  }

  return {
    init, applySettings,
    musicStart() {
      if (!ac) return;
      musicOn = true; step = 0; intensity = 0; nextT = ac.currentTime + 0.1;
      clearInterval(musicTimer); musicTimer = setInterval(musicTick, 30);
    },
    musicStop() { musicOn = false; clearInterval(musicTimer); },
    setIntensity(n) { intensity = n; },
    duck(on) { if (ac) duckG.gain.setTargetAtTime(on ? 0.35 : 1, ac.currentTime, 0.08); },
    shoot() { if (ok('shoot', 0.07)) tone(rand(900, 1000), 0.07, { type: 'square', vol: 0.022, slide: 0.45, lp: 3500 }); },
    hit() { if (ok('hit', 0.03)) noise(0.05, { f: 2400, q: 1.5, vol: 0.045 }); },
    kill() {
      if (!ok('kill', 0.035)) return;
      tone(rand(170, 230), 0.14, { type: 'triangle', vol: 0.09, slide: 0.35 });
      noise(0.09, { f: 900, vol: 0.05 });
    },
    gem(n) {
      if (!ok('gem', 0.03)) return;
      const sc = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
      tone(mtof(74 + sc[Math.min(n, sc.length - 1)]), 0.09, { vol: 0.05 });
    },
    crystal() { if (ok('crystal', 0.05)) { tone(1568, 0.12, { vol: 0.07 }); tone(2349, 0.16, { vol: 0.05, when: 0.05 }); } },
    levelUp() { if (ok('lvl', 0.2)) [0, 4, 7, 12, 16].forEach((s, i) => tone(mtof(64 + s), 0.26, { type: 'triangle', vol: 0.11, when: i * 0.055 })); },
    pick() {
      if (!ok('pick', 0.05)) return;
      tone(880, 0.08, { type: 'square', vol: 0.04, lp: 2500 });
      tone(1320, 0.12, { type: 'square', vol: 0.035, lp: 2500, when: 0.05 });
    },
    click() { if (ok('click', 0.04)) tone(700, 0.05, { type: 'square', vol: 0.03, lp: 2200 }); },
    hurt() {
      if (!ok('hurt', 0.12)) return;
      tone(140, 0.25, { type: 'sawtooth', vol: 0.16, slide: 0.45, lp: 900 });
      noise(0.18, { f: 500, vol: 0.14 });
    },
    nova() { if (ok('nova', 0.1)) { noise(0.45, { f: 250, type: 'lowpass', slide: 8, vol: 0.13 }); tone(90, 0.3, { vol: 0.18, slide: 0.5 }); } },
    zap() { if (ok('zap', 0.08)) { noise(0.12, { f: 4200, q: 3, vol: 0.07 }); tone(1600, 0.09, { type: 'square', vol: 0.022, slide: 0.3 }); } },
    laser() {
      if (!ok('laser', 0.1)) return;
      tone(2000, 0.32, { type: 'sawtooth', vol: 0.035, slide: 0.2, lp: 6000 });
      tone(1000, 0.32, { type: 'square', vol: 0.028, slide: 0.25, lp: 3000 });
    },
    dash() { if (ok('dash', 0.1)) noise(0.22, { f: 1800, slide: 0.25, vol: 0.11 }); },
    warn() { if (ok('warn', 1)) for (let i = 0; i < 3; i++) tone(220, 0.35, { type: 'sawtooth', vol: 0.08, slide: 1.6, lp: 1400, when: i * 0.42 }); },
    boom() { if (ok('boom', 0.2)) { noise(1.3, { f: 900, type: 'lowpass', slide: 0.08, vol: 0.38 }); tone(70, 1.1, { vol: 0.32, slide: 0.4 }); } },
    heal() { if (ok('heal', 0.1)) { tone(523, 0.12, { type: 'triangle', vol: 0.1 }); tone(784, 0.18, { type: 'triangle', vol: 0.1, when: 0.08 }); } },
    power() { if (ok('power', 0.2)) tone(392, 0.4, { type: 'sawtooth', vol: 0.06, slide: 2, lp: 2000 }); },
    combo() { if (ok('combo', 0.2)) [0, 7, 12].forEach((s, i) => tone(mtof(76 + s), 0.18, { type: 'square', vol: 0.035, lp: 3000, when: i * 0.04 })); },
    death() {
      if (!ok('death', 0.5)) return;
      noise(1.4, { f: 1200, type: 'lowpass', slide: 0.05, vol: 0.3 });
      tone(330, 1.2, { type: 'sawtooth', slide: 0.1, vol: 0.13, lp: 1200 });
    },
    buy() { if (ok('buy', 0.08)) [0, 5, 9, 12].forEach((s, i) => tone(mtof(72 + s), 0.14, { type: 'triangle', vol: 0.08, when: i * 0.04 })); },
    unlock() { if (ok('unlock', 0.3)) [0, 4, 7, 11, 14].forEach((s, i) => tone(mtof(79 + s), 0.2, { vol: 0.06, when: i * 0.06 })); },
  };
})();

// ============================================================ Icons
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICONS = {
  beam: svg('<circle cx="4.5" cy="12" r="1.6"/><circle cx="10" cy="12" r="1.6"/><path d="M14.5 7.5 20.5 12l-6 4.5z"/>'),
  orbit: svg('<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="8" stroke-dasharray="2.5 3"/><circle cx="20" cy="12" r="1.8" fill="currentColor"/><circle cx="4" cy="12" r="1.8" fill="currentColor"/>'),
  nova: svg('<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="5.8"/><circle cx="12" cy="12" r="9.6" stroke-dasharray="3 2.4"/>'),
  chain: svg('<path d="M13.5 2.5 5.5 13.5h6l-1.5 8 8.5-12h-6z"/>'),
  laser: svg('<path d="M10 4.5 16.5 17h-13z"/><path d="M1.5 12.5h5"/><path d="M14 11.5l8.5-3.5M14.8 13.5h7.7M15.5 15.4l7 2.8"/>'),
  hp: svg('<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>'),
  dmg: svg('<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  cd: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.8 2M9.5 2.5h5"/>'),
  speed: svg('<path d="M4 6l6 6-6 6M12 6l6 6-6 6"/>'),
  magnet: svg('<path d="M6 3.5v8.5a6 6 0 0 0 12 0V3.5"/><path d="M6 8h3.2M14.8 8H18"/>'),
  regen: svg('<path d="M12 21c-4-2-7-5.5-7-10 3 0 5.5 1.5 7 4 1.5-2.5 4-4 7-4 0 4.5-3 8-7 10z"/><path d="M12 15V4"/>'),
  crit: svg('<path d="M12 2.8l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z"/>'),
  area: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle cx="12" cy="12" r="2.4"/>'),
  xp: svg('<path d="M5 20v-7M10 20V6M15 20v-9M20 20V3"/>'),
  multi: svg('<path d="M2.5 12h7"/><path d="M9.5 12l11-6.5M9.5 12h12M9.5 12l11 6.5"/>'),
  crystal: svg('<path d="M12 2.5l8 4.6v9.8L12 21.5l-8-4.6V7.1z"/><path d="M12 2.5v19M4 7.1l16 9.8M20 7.1 4 16.9" opacity=".45"/>'),
  armor: svg('<path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6z"/>'),
  dice: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  eye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  phoenix: svg('<path d="M12 21c-4.5 0-7-3-7-6.5 0-4 4-5.5 4-10 2.5 1.5 3.5 3.5 3.5 6 1-1 1.5-2.5 1.5-4 3 2 5 5 5 8.5 0 3.5-2.5 6-7 6z"/>'),
  luck: svg('<path d="M12 2c.8 5 2 7.2 7 8-5 .8-6.2 3-7 8-.8-5-2-7.2-7-8 5-.8 6.2-3 7-8z"/><path d="M19 15.5c.3 1.8.8 2.6 2.5 3-1.7.4-2.2 1.2-2.5 3-.3-1.8-.8-2.6-2.5-3 1.7-.4 2.2-1.2 2.5-3z"/>'),
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  trophy: svg('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  dash: svg('<path d="M2.5 12h10"/><path d="M8.5 7l5 5-5 5"/><path d="M17 5.5v13M21 8v8"/>'),
  lens: svg('<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>'),
};

// ============================================================ Game data
const WEAPONS = {
  beam: {
    name: 'Photonenstrahl', icon: 'beam', color: COL.yellow,
    lv: [
      { cd: 0.62, dmg: 11, n: 1, pierce: 0 },
      { cd: 0.56, dmg: 13, n: 1, pierce: 1 },
      { cd: 0.5, dmg: 15, n: 2, pierce: 1 },
      { cd: 0.44, dmg: 18, n: 2, pierce: 2 },
      { cd: 0.36, dmg: 23, n: 3, pierce: 3 },
    ],
    up: [
      'Feuert gebündelte Photonen auf den nächsten Schatten.',
      'Durchschlägt einen Gegner mehr, +18 % Schaden.',
      '+1 Projektil und schnelleres Feuer.',
      'Durchschlägt einen Gegner mehr, +20 % Schaden.',
      '+1 Projektil, +1 Durchschlag, Dauerfeuer.',
    ],
  },
  orbit: {
    name: 'Linsenkranz', icon: 'orbit', color: COL.cyan,
    lv: [
      { n: 2, dmg: 9, rad: 72, spd: 2.6 },
      { n: 3, dmg: 10, rad: 76, spd: 2.8 },
      { n: 3, dmg: 14, rad: 88, spd: 3.1 },
      { n: 4, dmg: 16, rad: 94, spd: 3.3 },
      { n: 6, dmg: 21, rad: 104, spd: 3.7 },
    ],
    up: [
      'Zwei Linsen kreisen um dich und schneiden durch alles.',
      '+1 Linse.',
      '+40 % Schaden und ein weiterer Kreis.',
      '+1 Linse, schnellere Umdrehung.',
      '+2 Linsen, +30 % Schaden.',
    ],
  },
  nova: {
    name: 'Supernova', icon: 'nova', color: COL.violet,
    lv: [
      { cd: 3.4, dmg: 20, rad: 115 },
      { cd: 3.0, dmg: 26, rad: 130 },
      { cd: 2.7, dmg: 32, rad: 146 },
      { cd: 2.4, dmg: 40, rad: 166 },
      { cd: 2.0, dmg: 54, rad: 196 },
    ],
    up: [
      'Eine Schockwelle trifft und stößt alles in deiner Nähe zurück.',
      'Größerer Radius, öfter.',
      '+25 % Schaden, größerer Radius.',
      'Größer und öfter.',
      'Riesige Welle, +35 % Schaden.',
    ],
  },
  chain: {
    name: 'Kettenblitz', icon: 'chain', color: COL.blue,
    lv: [
      { cd: 1.7, dmg: 16, jumps: 3 },
      { cd: 1.5, dmg: 19, jumps: 4 },
      { cd: 1.35, dmg: 23, jumps: 5 },
      { cd: 1.2, dmg: 28, jumps: 6 },
      { cd: 0.95, dmg: 35, jumps: 8 },
    ],
    up: [
      'Ein Blitz springt von Schatten zu Schatten.',
      '+1 Sprung, schneller.',
      '+1 Sprung, +20 % Schaden.',
      '+1 Sprung, schneller.',
      '+2 Sprünge, +25 % Schaden.',
    ],
  },
  laser: {
    name: 'Spektrallaser', icon: 'laser', color: COL.red,
    lv: [
      { cd: 2.8, dmg: 26, w: 12, len: 560 },
      { cd: 2.5, dmg: 32, w: 14, len: 610 },
      { cd: 2.25, dmg: 39, w: 16, len: 660 },
      { cd: 2.0, dmg: 47, w: 19, len: 720 },
      { cd: 1.6, dmg: 62, w: 26, len: 820 },
    ],
    up: [
      'Zerlegtes Licht durchbohrt ganze Reihen.',
      'Breiter und öfter.',
      '+20 % Schaden, größere Reichweite.',
      'Breiter und öfter.',
      'Gewaltiger Strahl, +30 % Schaden.',
    ],
  },
};

const PASSIVES = {
  hp: { name: 'Kristallhülle', icon: 'hp', color: COL.red, max: 5, desc: '+20 maximales Leben, heilt sofort 20.' },
  dmg: { name: 'Fokuslinse', icon: 'dmg', color: COL.amber, max: 5, desc: '+10 % Schaden für alle Waffen.' },
  cd: { name: 'Taktgeber', icon: 'cd', color: COL.yellow, max: 5, desc: '−8 % Abklingzeit aller Waffen.' },
  speed: { name: 'Lichtsprung', icon: 'speed', color: COL.green, max: 5, desc: '+8 % Tempo, Sprint lädt schneller.' },
  magnet: { name: 'Gravitation', icon: 'magnet', color: COL.cyan, max: 5, desc: '+30 % Sammelradius für Photonen.' },
  regen: { name: 'Photosynthese', icon: 'regen', color: COL.green, max: 5, desc: '+0,5 Leben pro Sekunde.' },
  crit: { name: 'Brennpunkt', icon: 'crit', color: COL.yellow, max: 5, desc: '+8 % Chance auf doppelten Schaden.' },
  area: { name: 'Streuung', icon: 'area', color: COL.violet, max: 5, desc: '+12 % Wirkungsbereich.' },
  xp: { name: 'Spektrometer', icon: 'xp', color: COL.blue, max: 5, desc: '+10 % Erfahrung aus Photonen.' },
  multi: { name: 'Brechung', icon: 'multi', color: COL.white, max: 2, desc: '+1 Projektil für Strahl, Linsen, Blitz und Laser.' },
};

const SHOP = [
  { id: 'vital', name: 'Vitalität', icon: 'hp', color: COL.red, max: 5, base: 25, desc: '+10 maximales Leben zu Beginn jedes Laufs.' },
  { id: 'power', name: 'Schliff', icon: 'dmg', color: COL.amber, max: 5, base: 35, desc: '+6 % Schaden für alle Waffen.' },
  { id: 'swift', name: 'Tempo', icon: 'speed', color: COL.green, max: 5, base: 25, desc: '+4 % Bewegungstempo.' },
  { id: 'magnet', name: 'Anziehung', icon: 'magnet', color: COL.cyan, max: 5, base: 20, desc: '+15 % Sammelradius für Photonen.' },
  { id: 'wisdom', name: 'Wissen', icon: 'xp', color: COL.blue, max: 5, base: 30, desc: '+6 % Erfahrung.' },
  { id: 'luck', name: 'Glück', icon: 'luck', color: COL.yellow, max: 5, base: 35, desc: '+2 % Krit-Chance und mehr Splitter.' },
  { id: 'dash', name: 'Sprintkern', icon: 'dash', color: COL.cyan, max: 3, base: 30, desc: '−10 % Abklingzeit für den Sprint.' },
  { id: 'armor', name: 'Panzerung', icon: 'armor', color: COL.violet, max: 3, base: 60, desc: '−1 Schaden bei jedem Treffer.' },
  { id: 'reroll', name: 'Würfel', icon: 'dice', color: COL.white, max: 3, base: 45, desc: '+1 Neu würfeln pro Lauf.' },
  { id: 'second', name: 'Zweitlinse', icon: 'lens', color: COL.red, max: 1, base: 200, desc: 'Starte jeden Lauf mit einer zweiten, zufälligen Waffe.' },
  { id: 'insight', name: 'Weitsicht', icon: 'eye', color: COL.cyan, max: 1, base: 260, desc: 'Vier statt drei Karten bei jedem Level-up.' },
  { id: 'phoenix', name: 'Phönix', icon: 'phoenix', color: COL.amber, max: 1, base: 380, desc: 'Einmal pro Lauf mit halbem Leben zurückkehren.' },
];
const shopCost = (it, lv) => Math.round((it.base * (lv + 1) * (lv + 2)) / 2);

const ENEMIES = {
  shade: { hp: 10, speed: 72, r: 13, dmg: 9, xp: 1, color: COL.red, shape: 'tri' },
  runner: { hp: 8, speed: 128, r: 10, dmg: 7, xp: 1, color: COL.amber, shape: 'dart' },
  splitter: { hp: 28, speed: 64, r: 17, dmg: 11, xp: 2, color: COL.green, shape: 'sq' },
  mini: { hp: 8, speed: 105, r: 9, dmg: 6, xp: 1, color: COL.green, shape: 'sq' },
  brute: { hp: 75, speed: 50, r: 25, dmg: 18, xp: 5, color: COL.violet, shape: 'hex' },
  shooter: { hp: 22, speed: 66, r: 14, dmg: 9, xp: 3, color: COL.cyan, shape: 'dia' },
  boss: { hp: 1600, speed: 58, r: 48, dmg: 26, xp: 0, color: COL.white, shape: 'boss' },
};

const ACHIEVEMENTS = [
  { id: 't1', name: 'Erste Minute', desc: 'Überlebe 1 Minute.', reward: 10, test: (r) => r.t >= 60 },
  { id: 't5', name: 'Ausdauer', desc: 'Überlebe 5 Minuten.', reward: 40, test: (r) => r.t >= 300 },
  { id: 't10', name: 'Lichtjahr', desc: 'Überlebe 10 Minuten.', reward: 120, test: (r) => r.t >= 600 },
  { id: 'k500', name: 'Schattenjäger', desc: '500 Schatten in einem Lauf.', reward: 30, test: (r) => r.kills >= 500 },
  { id: 'k2000', name: 'Auslöschung', desc: '2.000 Schatten in einem Lauf.', reward: 100, test: (r) => r.kills >= 2000 },
  { id: 'c50', name: 'Kettenreaktion', desc: 'Erreiche Combo ×50.', reward: 30, test: (r) => r.maxCombo >= 50 },
  { id: 'c200', name: 'Supraleiter', desc: 'Erreiche Combo ×200.', reward: 80, test: (r) => r.maxCombo >= 200 },
  { id: 'l15', name: 'Aufgeladen', desc: 'Erreiche Level 15.', reward: 30, test: (r) => r.level >= 15 },
  { id: 'l30', name: 'Erleuchtet', desc: 'Erreiche Level 30.', reward: 100, test: (r) => r.level >= 30 },
  { id: 'boss', name: 'Finsternis gebrochen', desc: 'Besiege einen Boss.', reward: 60, test: (r) => r.bosses >= 1 },
  { id: 'boss3', name: 'Dreifaches Dunkel', desc: 'Besiege drei Bosse in einem Lauf.', reward: 150, test: (r) => r.bosses >= 3 },
  { id: 'cr50', name: 'Splittersammler', desc: 'Hebe 50 Splitter in einem Lauf auf.', reward: 40, test: (r) => r.crystals >= 50 },
  { id: 'arsenal', name: 'Arsenal', desc: 'Führe vier Waffen gleichzeitig.', reward: 40, test: (r) => Object.keys(r.weapons).length >= 4 },
  { id: 'max', name: 'Meisterstück', desc: 'Bringe eine Waffe auf Stufe V.', reward: 40, test: (r) => Object.values(r.weapons).some((l) => l >= 5) },
  { id: 'clean', name: 'Unberührt', desc: 'Überlebe 2 Minuten ohne Treffer.', reward: 50, test: (r) => r.t - r.lastHurt >= 120 },
];

const MAX_WEAPONS = 4, MAX_PASSIVES = 5, MAX_ENEMIES = 420;
const xpFor = (l) => Math.round(4 + (l - 1) * 4.2 + Math.pow(l - 1, 1.75) * 0.45);
const comboColor = (c) => (c < 10 ? COL.red : c < 25 ? COL.amber : c < 50 ? COL.yellow : c < 100 ? COL.green : c < 200 ? COL.cyan : c < 400 ? COL.blue : COL.violet);

// ============================================================ Canvas & view
const canvas = $('#game');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 1, H = 1, DPR = 1, VS = 1;
let gridPattern = null;

function resize() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxPx = 2.6e6; // keep fill-rate sane on big high-DPI screens
  if (W * H * dpr * dpr > maxPx) dpr = Math.max(1, Math.sqrt(maxPx / (W * H)));
  DPR = dpr;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  VS = clamp(Math.min(W, H) / 680, 0.62, 1.25);
  if (!gridPattern) {
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(170,160,235,0.16)';
    g.fillRect(0, 0, 2, 2);
    gridPattern = ctx.createPattern(c, 'repeat');
  }
}

const glowCache = new Map();
function glow(col) {
  let c = glowCache.get(col);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hexA(col, 1));
  gr.addColorStop(0.2, hexA(col, 0.55));
  gr.addColorStop(0.5, hexA(col, 0.16));
  gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(col, c);
  return c;
}
function drawGlow(col, x, y, r, a) {
  ctx.globalAlpha = a;
  ctx.drawImage(glow(col), x - r, y - r, r * 2, r * 2);
}

// ============================================================ Entities & state
let state = 'menu'; // menu | play | levelup | pause | over
let run = null;
let uid = 0;
let enemies = [], bullets = [], ebullets = [], gems = [], pickups = [], parts = [], texts = [], fx = [];
const player = { x: 0, y: 0, r: 13, hp: 100, inv: 0, dashT: 0, dashCd: 0, dvx: 0, dvy: 0, fx: 0, fy: -1, ang: -Math.PI / 2, vx: 0, vy: 0, trail: [] };
const cam = { x: 0, y: 0 };

function newRun() {
  enemies = []; bullets = []; ebullets = []; gems = []; pickups = []; parts = []; texts = []; fx = [];
  Object.assign(player, { x: 0, y: 0, inv: 1.2, dashT: 0, dashCd: 0, fx: 0, fy: -1, ang: -Math.PI / 2, vx: 0, vy: 0, trail: [] });
  cam.x = 0; cam.y = 0;
  run = {
    t: 0, score: 0, kills: 0, level: 1, xp: 0, xpNext: xpFor(1), pendingLv: 0, chestPending: 0, chestOpen: false,
    combo: 0, comboT: 0, maxCombo: 0, comboPop: 1, nextMilestone: 25, pendingShock: false,
    crystals: 0, achCrystals: 0,
    weapons: { beam: 1 }, passives: {}, wt: {}, orbA: 0, lenses: [], st: null, choices: [],
    rerolls: 1 + shopLv('reroll'), revives: shopLv('phoenix'),
    spawnAcc: 5, nextSwarm: 70, nextBoss: 180, bossWarned: false, boss: null, bossCount: 0, bosses: 0,
    shake: 0, flash: 0, flashCol: COL.red, timeScale: 1, slowT: 0, dying: 0,
    lastHurt: 0, dashReq: false, dashId: 0, ghostT: 0, trailT: 0,
    gemStreak: 0, gemStreakT: 0, achT: 0, luOpenT: 0, quitArmed: false,
  };
  if (shopLv('second')) run.weapons[pick(['orbit', 'nova', 'chain', 'laser'])] = 1;
  calcStats();
  player.hp = run.st.maxHp;
  return run;
}

function calcStats() {
  const P = run.passives;
  const lv = (id) => P[id] || 0;
  run.st = {
    dmg: (1 + 0.1 * lv('dmg')) * (1 + 0.06 * shopLv('power')),
    cd: Math.pow(0.92, lv('cd')),
    area: 1 + 0.12 * lv('area'),
    speed: 205 * (1 + 0.08 * lv('speed')) * (1 + 0.04 * shopLv('swift')),
    magnet: 90 * (1 + 0.3 * lv('magnet')) * (1 + 0.15 * shopLv('magnet')),
    regen: 0.5 * lv('regen'),
    crit: 0.05 + 0.08 * lv('crit') + 0.02 * shopLv('luck'),
    xpMul: (1 + 0.1 * lv('xp')) * (1 + 0.06 * shopLv('wisdom')),
    maxHp: 100 + 20 * lv('hp') + 10 * shopLv('vital'),
    multi: lv('multi'),
    dashCd: 2.2 * Math.pow(0.93, lv('speed')) * (1 - 0.1 * shopLv('dash')),
  };
}

// ============================================================ Spatial grid (linked lists in typed arrays)
const G_CELL = 64, G_SIZE = 44, G_HALF = (G_CELL * G_SIZE) / 2;
const cellHead = new Int32Array(G_SIZE * G_SIZE);
let cellNext = new Int32Array(1024);
let gOX = 0, gOY = 0;
const Q = new Int32Array(8192);

function buildGrid() {
  cellHead.fill(-1);
  gOX = player.x - G_HALF;
  gOY = player.y - G_HALF;
  if (cellNext.length < enemies.length) cellNext = new Int32Array(enemies.length * 2);
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const cx = Math.floor((e.x - gOX) / G_CELL), cy = Math.floor((e.y - gOY) / G_CELL);
    if (cx < 0 || cy < 0 || cx >= G_SIZE || cy >= G_SIZE) { cellNext[i] = -1; continue; }
    const k = cy * G_SIZE + cx;
    cellNext[i] = cellHead[k];
    cellHead[k] = i;
  }
}
// Fills Q with indices of enemies in cells overlapping the circle. Callers must not nest queries.
function query(x, y, r) {
  let n = 0;
  const x0 = Math.max(0, Math.floor((x - r - gOX) / G_CELL)), x1 = Math.min(G_SIZE - 1, Math.floor((x + r - gOX) / G_CELL));
  const y0 = Math.max(0, Math.floor((y - r - gOY) / G_CELL)), y1 = Math.min(G_SIZE - 1, Math.floor((y + r - gOY) / G_CELL));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      let j = cellHead[cy * G_SIZE + cx];
      while (j !== -1 && n < Q.length) { Q[n++] = j; j = cellNext[j]; }
    }
  }
  return n;
}
function nearestEnemy(x, y, range, exclude) {
  let best = null, bd = range * range;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead || (exclude && exclude.has(e.id))) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function randomEnemyNear(x, y, range) {
  const r2 = range * range, cand = [];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy < r2) cand.push(e);
  }
  return cand.length ? pick(cand) : null;
}

// ============================================================ Spawning
function edgePos(pad = 70) {
  const hw = W / 2 / VS + pad, hh = H / 2 / VS + pad;
  const per = Math.random() * (hw + hh) * 2;
  let x, y;
  if (per < hw * 2) { x = -hw + per; y = Math.random() < 0.5 ? -hh : hh; }
  else { x = Math.random() < 0.5 ? -hw : hw; y = -hh + (per - hw * 2); }
  return [player.x + x, player.y + y];
}

function spawnEnemy(type, x, y, forceElite = false) {
  const D = ENEMIES[type], m = run.t / 60;
  const hpMul = 1 + 0.45 * m + 0.06 * m * m;
  if (x === undefined) [x, y] = edgePos();
  const canElite = type !== 'mini' && type !== 'boss';
  const elite = canElite && (forceElite || Math.random() < Math.min(0.03, 0.01 + 0.002 * m));
  const e = {
    id: ++uid, type, x, y,
    r: D.r * (elite ? 1.3 : 1),
    hp: D.hp * hpMul * (elite ? 4 : 1),
    speed: D.speed * (1 + Math.min(0.35, m * 0.03)) * (elite ? 0.9 : 1) * rand(0.92, 1.08),
    dmg: D.dmg * (1 + m * 0.08),
    xp: D.xp * (elite ? 5 : 1),
    color: D.color, shape: D.shape, elite, boss: false,
    kx: 0, ky: 0, flash: 0, dead: false, t: rand(0, 6), rot: rand(0, TAU),
    lensT: 0, dashHit: 0, shootT: rand(1.2, 2.6),
  };
  e.maxHp = e.hp;
  enemies.push(e);
  return e;
}

function chooseType(m) {
  const w = [
    ['shade', 10],
    ['runner', m > 0.6 ? 4 + m : 0],
    ['splitter', m > 1.5 ? 3 : 0],
    ['brute', m > 2 ? 1.5 + m * 0.3 : 0],
    ['shooter', m > 3 ? 2 + m * 0.15 : 0],
  ];
  let tot = 0;
  for (const [, v] of w) tot += v;
  let r = Math.random() * tot;
  for (const [k, v] of w) { if ((r -= v) < 0) return k; }
  return 'shade';
}

function swarm() {
  const m = run.t / 60;
  const n = Math.min(60, Math.round(16 + m * 4));
  const R = Math.max(W, H) / 2 / VS + 40;
  const type = m > 4 && Math.random() < 0.5 ? 'runner' : 'shade';
  const off = Math.random() * TAU;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU;
    if (enemies.length < MAX_ENEMIES + 40) spawnEnemy(type, player.x + Math.cos(a) * R, player.y + Math.sin(a) * R);
  }
  banner('Umzingelt', 'Brich durch den Ring', COL.red);
}

function spawnBoss() {
  run.bossCount++;
  const [x, y] = edgePos(40);
  const e = spawnEnemy('boss', x, y);
  e.boss = true;
  e.hp = e.maxHp = 1300 * (1 + (run.bossCount - 1) * 1.6) * (1 + (run.t / 60) * 0.25);
  e.dmg = 26 * (1 + (run.t / 60) * 0.08);
  e.phase = 0; e.actT = 2.2; e.windT = 0; e.chargeT = 0; e.cvx = 0; e.cvy = 0;
  run.boss = e;
  run.bossWarned = false;
  $('#bossName').textContent = 'Finsternis ' + ROMAN[Math.min(4, run.bossCount - 1)];
  Sound.setIntensity(3);
}

function director(dt) {
  const r = run, m = r.t / 60;
  const rate = Math.min(28, 1.1 + 0.85 * m + 0.07 * m * m) * (r.boss ? 0.45 : 1);
  r.spawnAcc += dt * rate;
  while (r.spawnAcc >= 1) {
    r.spawnAcc -= 1;
    if (enemies.length < MAX_ENEMIES) spawnEnemy(chooseType(m));
  }
  if (r.t >= r.nextSwarm) { r.nextSwarm += 50; swarm(); }
  if (!r.bossWarned && !r.boss && r.t >= r.nextBoss - 4) {
    r.bossWarned = true;
    banner('Finsternis naht', 'Ein Boss erscheint in 4 Sekunden', COL.white);
    Sound.warn();
  }
  if (r.t >= r.nextBoss) {
    r.nextBoss += 180;
    if (!r.boss) spawnBoss();
  }
  if (!r.boss) Sound.setIntensity(r.t < 30 ? 0 : r.t < 90 ? 1 : 2);
}

// ============================================================ Combat
function addText(x, y, val, crit, col) {
  if (texts.length > 70) return;
  texts.push({ x, y, vy: -46, life: 0.7, max: 0.7, s: typeof val === 'number' ? String(Math.round(val)) : val, crit, col: col || (crit ? COL.yellow : COL.white) });
}
function burst(x, y, col, n, spd, size = 3) {
  for (let i = 0; i < n && parts.length < 900; i++) {
    const a = Math.random() * TAU, s = rand(0.25, 1) * spd;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), max: 0.7, size: rand(size * 0.6, size * 1.3), col, drag: 4, spark: Math.random() < 0.6 });
  }
}

function hurtEnemy(e, base, kx = 0, ky = 0) {
  if (e.dead) return 0;
  const crit = Math.random() < run.st.crit;
  const dmg = base * run.st.dmg * (crit ? 2 : 1) * rand(0.92, 1.08);
  e.hp -= dmg;
  e.flash = 0.09;
  const kb = e.boss ? 0.06 : e.type === 'brute' ? 0.4 : 1;
  e.kx += kx * kb;
  e.ky += ky * kb;
  addText(e.x + rand(-6, 6), e.y - e.r, dmg, crit);
  Sound.hit();
  if (e.hp <= 0) killEnemy(e);
  return dmg;
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  const r = run;
  r.kills++;
  r.combo++;
  r.comboT = 2.4;
  r.comboPop = 1.3;
  if (r.combo > r.maxCombo) r.maxCombo = r.combo;
  r.score += (e.boss ? 5000 : e.xp * 10) * (1 + Math.min(r.combo, 500) * 0.02);
  Sound.kill();

  if (e.boss) {
    r.boss = null;
    r.bosses++;
    r.slowT = 0.9;
    r.shake = 26;
    r.flash = 0.9; r.flashCol = COL.white;
    for (const c of SPECTRUM) burst(e.x, e.y, c, 16, 620, 5);
    for (let i = 0; i < 18; i++) dropPickup(e.x, e.y, 'crystal', 260);
    for (let i = 0; i < 8; i++) dropGem(e.x + rand(-50, 50), e.y + rand(-50, 50), 25);
    dropPickup(e.x, e.y, 'chest', 0);
    fx.push({ k: 'ring', x: e.x, y: e.y, R: 420, life: 0.8, max: 0.8, col: COL.white, w: 10 });
    banner('Finsternis gebrochen', '+5.000 Punkte · Truhe erscheint', COL.yellow);
    Sound.boom();
    Sound.setIntensity(2);
  } else {
    burst(e.x, e.y, e.color, e.elite ? 26 : 9, e.elite ? 380 : 240);
    dropGem(e.x, e.y, e.xp);
    const luck = shopLv('luck');
    if (e.elite) {
      for (let i = 0, n = luck >= 3 ? 3 : 2; i < n; i++) dropPickup(e.x, e.y, 'crystal', 140);
      if (Math.random() < 0.5) dropPickup(e.x, e.y, pick(['heart', 'magnet', 'bomb']), 80);
      r.shake = Math.max(r.shake, 6);
    } else if (Math.random() < 0.011 + 0.003 * luck) {
      dropPickup(e.x, e.y, 'crystal', 60);
    }
    const roll = Math.random();
    if (roll < 0.005) { if (player.hp < r.st.maxHp * 0.9) dropPickup(e.x, e.y, 'heart', 40); }
    else if (roll < 0.007) dropPickup(e.x, e.y, 'magnet', 40);
    else if (roll < 0.0085) dropPickup(e.x, e.y, 'bomb', 40);
    if (e.type === 'splitter') {
      for (let i = 0; i < 2; i++) {
        const m = spawnEnemy('mini', e.x + rand(-12, 12), e.y + rand(-12, 12));
        m.kx = rand(-160, 160); m.ky = rand(-160, 160);
      }
    }
  }
  if (r.combo >= r.nextMilestone) {
    r.pendingShock = true;
    r.nextMilestone += r.nextMilestone < 100 ? 25 : 50;
  }
}

function gemColor(v) { return v < 5 ? COL.red : v < 20 ? COL.green : COL.violet; }
function dropGem(x, y, v) {
  if (gems.length > 320) { // merge into the closest photon so the field stays readable
    let g = gems[0], bd = Infinity;
    for (let i = 0; i < gems.length; i++) {
      const o = gems[i];
      if (o.dead || o.pull) continue;
      const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
      if (d < bd) { bd = d; g = o; }
    }
    g.v += v; g.col = gemColor(g.v); g.r = Math.min(13, 4 + Math.log2(g.v + 1) * 1.3);
    return;
  }
  gems.push({ x, y, v, col: gemColor(v), r: Math.min(13, 4 + Math.log2(v + 1) * 1.3), vx: rand(-40, 40), vy: rand(-40, 40), pull: false, sp: 0, t: Math.random() * TAU, dead: false });
}
function dropPickup(x, y, kind, spread) {
  const a = Math.random() * TAU, s = rand(0.3, 1) * spread;
  pickups.push({ x, y, kind, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: Math.random() * TAU, pull: false, sp: 0, dead: false });
}

function hurtPlayer(dmg) {
  const r = run, p = player;
  if (p.inv > 0 || p.dashT > 0 || r.dying) return false;
  dmg = Math.max(1, dmg - shopLv('armor'));
  p.hp -= dmg;
  p.inv = 0.7;
  r.lastHurt = r.t;
  r.shake = Math.max(r.shake, 11);
  r.flash = 0.5; r.flashCol = COL.red;
  r.combo = Math.floor(r.combo / 2);
  r.nextMilestone = Math.max(25, Math.ceil((r.combo + 1) / 25) * 25);
  addText(p.x, p.y - 22, '-' + Math.round(dmg), false, COL.red);
  burst(p.x, p.y, COL.red, 10, 260);
  Sound.hurt();
  if (p.hp <= 0) {
    if (r.revives > 0) {
      r.revives--;
      p.hp = r.st.maxHp * 0.5;
      p.inv = 2.5;
      shockwave(260, 60, COL.amber);
      banner('Phönix', 'Zurück aus der Asche', COL.amber);
      Sound.power();
    } else {
      killPlayer();
    }
  }
  return true;
}

function killPlayer() {
  const r = run, p = player;
  p.hp = 0;
  r.dying = 1.5;
  r.shake = 22;
  r.flash = 1; r.flashCol = COL.white;
  for (const c of SPECTRUM) burst(p.x, p.y, c, 14, 420, 4);
  Sound.death();
  Sound.musicStop();
}

// Knock back (and optionally damage) everything around the player.
function shockwave(R, dmg, col) {
  const p = player;
  fx.push({ k: 'ring', x: p.x, y: p.y, R, life: 0.45, max: 0.45, col, w: 7 });
  const n = query(p.x, p.y, R + 50);
  for (let k = 0; k < n; k++) {
    const e = enemies[Q[k]];
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > R + e.r) continue;
    if (dmg > 0) hurtEnemy(e, dmg, (dx / d) * 420, (dy / d) * 420);
    else if (!e.boss) { e.kx += (dx / d) * 420; e.ky += (dy / d) * 420; }
  }
}

// ============================================================ Weapons
const FIRE = {
  beam(L) {
    const p = player;
    const tgt = nearestEnemy(p.x, p.y, 560);
    if (!tgt) return false;
    const base = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    const n = L.n + run.st.multi;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.13;
      const c = Math.cos(a), s = Math.sin(a);
      bullets.push({ x: p.x + c * 14, y: p.y + s * 14, vx: c * 640, vy: s * 640, r: 5 * Math.sqrt(run.st.area), dmg: L.dmg, pierce: L.pierce, life: 1.1, hits: [], col: COL.yellow, dead: false });
    }
    Sound.shoot();
    return true;
  },
  nova(L) {
    const p = player, R = L.rad * run.st.area;
    if (!nearestEnemy(p.x, p.y, R + 20)) return false;
    fx.push({ k: 'ring', x: p.x, y: p.y, R, life: 0.42, max: 0.42, col: COL.violet, w: 9 });
    const n = query(p.x, p.y, R + 50);
    for (let k = 0; k < n; k++) {
      const e = enemies[Q[k]];
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < R + e.r) hurtEnemy(e, L.dmg, (dx / d) * 330, (dy / d) * 330);
    }
    run.shake = Math.max(run.shake, 4);
    Sound.nova();
    return true;
  },
  chain(L) {
    const p = player;
    const bolts = 1 + run.st.multi;
    let fired = false;
    for (let b = 0; b < bolts; b++) {
      let cur = randomEnemyNear(p.x, p.y, 430);
      if (!cur) break;
      const pts = [p.x, p.y];
      const hit = new Set();
      for (let j = 0; j <= L.jumps && cur; j++) {
        pts.push(cur.x, cur.y);
        hit.add(cur.id);
        hurtEnemy(cur, L.dmg);
        cur = nearestEnemy(cur.x, cur.y, 175, hit);
      }
      fx.push({ k: 'bolt', pts, life: 0.22, max: 0.22, col: COL.blue });
      fired = true;
    }
    if (fired) Sound.zap();
    return fired;
  },
  laser(L) {
    const p = player;
    const tgt = nearestEnemy(p.x, p.y, L.len * 0.85);
    if (!tgt) return false;
    const base = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    const beams = 1 + run.st.multi;
    const w = L.w * run.st.area, len = L.len;
    const N = enemies.length;
    for (let b = 0; b < beams; b++) {
      const a = base + (b - (beams - 1) / 2) * 0.32;
      const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < N; i++) {
        const e = enemies[i];
        if (e.dead) continue;
        const ex = e.x - p.x, ey = e.y - p.y;
        const along = ex * c + ey * s;
        if (along < -e.r || along > len + e.r) continue;
        const perp = Math.abs(-ex * s + ey * c);
        if (perp < w / 2 + e.r) hurtEnemy(e, L.dmg, c * 140, s * 140);
      }
      fx.push({ k: 'laser', x: p.x, y: p.y, a, len, w, life: 0.34, max: 0.34 });
    }
    run.shake = Math.max(run.shake, 3);
    Sound.laser();
    return true;
  },
};

function updateOrbit(dt, L) {
  const p = player, r = run;
  r.orbA += dt * L.spd;
  const n = L.n + r.st.multi, R = L.rad * r.st.area, lr = 10 * Math.sqrt(r.st.area);
  r.lenses.length = 0;
  for (let i = 0; i < n; i++) {
    const a = r.orbA + (i / n) * TAU;
    const lx = p.x + Math.cos(a) * R, ly = p.y + Math.sin(a) * R;
    r.lenses.push(lx, ly);
    const q = query(lx, ly, lr + 50);
    for (let k = 0; k < q; k++) {
      const e = enemies[Q[k]];
      if (e.dead || e.lensT > r.t) continue;
      const dx = e.x - lx, dy = e.y - ly, rr = e.r + lr;
      if (dx * dx + dy * dy < rr * rr) {
        e.lensT = r.t + 0.4;
        const d = Math.hypot(dx, dy) || 1;
        hurtEnemy(e, L.dmg, (dx / d) * 200, (dy / d) * 200);
        burst(lx, ly, COL.cyan, 3, 160, 2);
      }
    }
  }
}

function updateWeapons(dt) {
  const r = run;
  if (!r.weapons.orbit) r.lenses.length = 0;
  for (const id in r.weapons) {
    const L = WEAPONS[id].lv[r.weapons[id] - 1];
    if (id === 'orbit') { updateOrbit(dt, L); continue; }
    r.wt[id] = (r.wt[id] === undefined ? 0.3 : r.wt[id]) - dt;
    if (r.wt[id] <= 0) r.wt[id] = FIRE[id](L) ? L.cd * r.st.cd : 0.12;
  }
}

// ============================================================ Input
const keys = new Set();
const joy = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
const pad = { x: 0, y: 0, prev: [], navPrev: 0 };

function readMove() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (joy.on) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
    if (d > 6) { const m = Math.min(1, d / 56); x += (dx / d) * m; y += (dy / d) * m; }
  }
  x += pad.x; y += pad.y;
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return [x, y];
}

canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play' || joy.on) return;
  joy.on = true; joy.id = e.pointerId;
  joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!joy.on || e.pointerId !== joy.id) return;
  joy.x = e.clientX; joy.y = e.clientY;
  const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), max = 56 * 1.4;
  if (d > max) { joy.ox = joy.x - (dx / d) * max; joy.oy = joy.y - (dy / d) * max; } // floating stick
});
const endJoy = (e) => { if (e.pointerId === joy.id) { joy.on = false; joy.id = null; } };
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  const code = e.code;
  if (state === 'play' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
  keys.add(code);
  if (e.repeat) return;
  if (code === 'KeyM') { toggleAllSound(); return; }
  if (state === 'play') {
    if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') run.dashReq = true;
    else if (code === 'Escape' || code === 'KeyP') pauseGame();
  } else if (state === 'pause') {
    if (code === 'Escape' || code === 'KeyP') resumeGame();
  } else if (state === 'levelup') {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[code];
    if (n !== undefined) choose(n, true);
    else if (code === 'KeyR') reroll();
  } else if (state === 'over' && !panelOpen()) {
    if (code === 'KeyR' && performance.now() - overOpenT > 600) startRun();
  }
  if (state !== 'play' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
    e.preventDefault();
    moveFocus(code === 'ArrowUp' || code === 'ArrowLeft' ? -1 : 1);
  }
  if (code === 'Escape' && panelOpen()) closePanels();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); joy.on = false; if (state === 'play') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pauseGame(); });

function activeScreen() {
  for (const id of ['shop', 'ach', 'levelup', 'pause', 'over', 'menu']) {
    const el = document.getElementById(id);
    if (!el.hidden) return el;
  }
  return null;
}
function moveFocus(delta) {
  const scr = activeScreen();
  if (!scr) return;
  const btns = [...scr.querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null);
  if (!btns.length) return;
  let i = btns.indexOf(document.activeElement);
  i = i < 0 ? 0 : (i + delta + btns.length) % btns.length;
  btns[i].focus();
}

function pollGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of gps) if (g && g.connected) { gp = g; break; }
  if (!gp) { pad.x = pad.y = 0; return; }
  const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
  const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const pressed = (i) => btn(i) && !pad.prev[i];
  pad.x = dz(gp.axes[0] || 0);
  pad.y = dz(gp.axes[1] || 0);
  if (btn(14)) pad.x = -1;
  if (btn(15)) pad.x = 1;
  if (btn(12)) pad.y = -1;
  if (btn(13)) pad.y = 1;
  if (state === 'play') {
    if (pressed(0) || pressed(1) || pressed(5)) run.dashReq = true;
    if (pressed(9)) pauseGame();
  } else {
    const nav = pad.x < -0.5 || pad.y < -0.5 ? -1 : pad.x > 0.5 || pad.y > 0.5 ? 1 : 0;
    if (nav && nav !== pad.navPrev) moveFocus(nav);
    pad.navPrev = nav;
    if (pressed(0)) {
      const a = document.activeElement;
      if (a && a.tagName === 'BUTTON' && activeScreen() && activeScreen().contains(a)) a.click();
      else moveFocus(0);
    }
    if (pressed(9) && state === 'pause') resumeGame();
    if (pressed(1)) { if (panelOpen()) closePanels(); else if (state === 'pause') resumeGame(); }
  }
  pad.prev = gp.buttons.map((b) => b.pressed);
}

// ============================================================ Update
function update(dt) {
  const r = run, p = player;
  if (!r.dying) r.t += dt;
  r.shake *= Math.exp(-dt * 9);
  r.flash = Math.max(0, r.flash - dt * 2.2);
  r.comboPop = lerp(r.comboPop, 1, 1 - Math.exp(-dt * 12));

  buildGrid();

  // --- player
  if (!r.dying) {
    const [mx, my] = readMove();
    if (mx || my) { const l = Math.hypot(mx, my); p.fx = mx / l; p.fy = my / l; }
    p.dashCd -= dt;
    p.inv -= dt;
    if (r.dashReq) {
      r.dashReq = false;
      if (p.dashCd <= 0) {
        const dx = mx || my ? mx : p.fx, dy = mx || my ? my : p.fy, l = Math.hypot(dx, dy) || 1;
        p.dvx = (dx / l) * 760; p.dvy = (dy / l) * 760;
        p.dashT = 0.17; p.dashCd = r.st.dashCd; r.dashId++;
        Sound.dash();
      }
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dvx; p.vy = p.dvy;
      r.ghostT -= dt;
      if (r.ghostT <= 0) { r.ghostT = 0.025; fx.push({ k: 'ghost', x: p.x, y: p.y, a: p.ang, life: 0.28, max: 0.28 }); }
      const n = query(p.x, p.y, p.r + 60);
      for (let k = 0; k < n; k++) {
        const e = enemies[Q[k]];
        if (e.dead || e.dashHit === r.dashId) continue;
        const dx = e.x - p.x, dy = e.y - p.y, rr = e.r + p.r + 6;
        if (dx * dx + dy * dy < rr * rr) { e.dashHit = r.dashId; hurtEnemy(e, 12 + r.level, p.dvx * 0.25, p.dvy * 0.25); }
      }
    } else {
      const k = 1 - Math.exp(-dt * 14);
      p.vx = lerp(p.vx, mx * r.st.speed, k);
      p.vy = lerp(p.vy, my * r.st.speed, k);
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const ta = Math.atan2(p.fy, p.fx);
    let da = ta - p.ang;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    p.ang += da * Math.min(1, dt * 14);
    if (r.st.regen) p.hp = Math.min(r.st.maxHp, p.hp + r.st.regen * dt);
    r.trailT -= dt;
    if (r.trailT <= 0) {
      r.trailT = 0.018;
      p.trail.push(p.x, p.y);
      if (p.trail.length > 36) p.trail.splice(0, 2);
    }
    updateWeapons(dt);
    director(dt);
  } else if (p.trail.length) {
    p.trail.splice(0, 2);
  }

  // --- enemies
  const hw = W / 2 / VS, hh = H / 2 / VS;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead) continue;
    e.t += dt;
    e.flash -= dt;
    let dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    let sp = e.speed;
    if (e.boss) {
      if (bossAI(e, dt, dx, dy)) sp = 0;
    } else if (e.type === 'shooter') {
      if (d < 240) sp = -sp * 0.7;
      else if (d < 330) sp = 0;
      e.shootT -= dt;
      if (e.shootT <= 0 && d < 560 && !r.dying) {
        e.shootT = 2.6 + Math.random();
        ebullets.push({ x: e.x, y: e.y, vx: dx * 190, vy: dy * 190, r: 6, dmg: e.dmg, life: 4, col: COL.cyan, dead: false });
      }
    }
    if (r.dying) sp *= 0.3;
    // separation against neighbours in the same and adjacent cells
    let sx = 0, sy = 0;
    if (!e.boss) {
      const cx = Math.floor((e.x - gOX) / G_CELL), cy = Math.floor((e.y - gOY) / G_CELL);
      for (let oy = -1; oy <= 1; oy++) {
        const yy = cy + oy;
        if (yy < 0 || yy >= G_SIZE) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox;
          if (xx < 0 || xx >= G_SIZE) continue;
          let j = cellHead[yy * G_SIZE + xx], cnt = 0;
          while (j !== -1 && cnt < 6) {
            if (j !== i) {
              const o = enemies[j];
              const ddx = e.x - o.x, ddy = e.y - o.y, rr = e.r + o.r, dd = ddx * ddx + ddy * ddy;
              if (dd < rr * rr && dd > 0.01) {
                const dl = Math.sqrt(dd), push = ((rr - dl) / rr) * 110;
                sx += (ddx / dl) * push; sy += (ddy / dl) * push;
              }
            }
            j = cellNext[j];
            cnt++;
          }
        }
      }
    }
    if (e.boss && e.chargeT > 0) {
      e.x += e.cvx * dt; e.y += e.cvy * dt;
    } else {
      e.x += (dx * sp + sx + e.kx) * dt;
      e.y += (dy * sp + sy + e.ky) * dt;
    }
    const kd = Math.exp(-dt * 7);
    e.kx *= kd; e.ky *= kd;
    e.rot += dt * (e.shape === 'sq' ? 2.2 : e.boss ? 0.5 : 0.7);
    if (!r.dying && d < e.r + p.r - 3) hurtPlayer(e.dmg);
    if (!e.boss && (Math.abs(p.x - e.x) > hw + 420 || Math.abs(p.y - e.y) > hh + 420)) {
      const [nx, ny] = edgePos();
      e.x = nx; e.y = ny; // recycle stragglers in front of the player
    }
  }

  // --- player projectiles
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (b.dead) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    const n = query(b.x, b.y, b.r + 52);
    for (let k = 0; k < n; k++) {
      const e = enemies[Q[k]];
      if (e.dead || b.hits.includes(e.id)) continue;
      const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r;
      if (dx * dx + dy * dy < rr * rr) {
        b.hits.push(e.id);
        hurtEnemy(e, b.dmg, b.vx * 0.12, b.vy * 0.12);
        burst(b.x, b.y, b.col, 3, 180, 2);
        if (b.pierce-- <= 0) { b.dead = true; break; }
      }
    }
  }

  // --- enemy projectiles
  for (let i = 0; i < ebullets.length; i++) {
    const b = ebullets[i];
    if (b.dead) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    const dx = b.x - p.x, dy = b.y - p.y, rr = b.r + p.r - 2;
    if (!r.dying && dx * dx + dy * dy < rr * rr && hurtPlayer(b.dmg)) b.dead = true;
  }

  // --- photons (xp)
  const mag2 = r.st.magnet * r.st.magnet;
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    if (g.dead) continue;
    g.t += dt;
    const dx = p.x - g.x, dy = p.y - g.y, d2 = dx * dx + dy * dy;
    if (!g.pull && d2 < mag2 && !r.dying) g.pull = true;
    if (g.pull && !r.dying) {
      const d = Math.sqrt(d2) || 1;
      g.sp = Math.min(1100, (g.sp || 140) + dt * 1500);
      const step = Math.min(d, g.sp * dt);
      g.x += (dx / d) * step; g.y += (dy / d) * step;
      if (d < p.r + 8) {
        g.dead = true;
        gainXp(g.v);
        r.gemStreak++;
        r.gemStreakT = 0.55;
        Sound.gem(r.gemStreak);
      }
    } else {
      const k = Math.exp(-dt * 5);
      g.vx *= k; g.vy *= k;
      g.x += g.vx * dt; g.y += g.vy * dt;
    }
  }
  if (r.gemStreakT > 0) { r.gemStreakT -= dt; if (r.gemStreakT <= 0) r.gemStreak = 0; }

  // --- pickups
  for (let i = 0; i < pickups.length; i++) {
    const u = pickups[i];
    if (u.dead) continue;
    u.t += dt;
    const dx = p.x - u.x, dy = p.y - u.y, d2 = dx * dx + dy * dy;
    if (u.kind === 'crystal' && !u.pull && d2 < mag2 * 1.2 && !r.dying) u.pull = true;
    if (u.pull && !r.dying) {
      const d = Math.sqrt(d2) || 1;
      u.sp = Math.min(1000, (u.sp || 160) + dt * 1400);
      const step = Math.min(d, u.sp * dt);
      u.x += (dx / d) * step; u.y += (dy / d) * step;
    } else {
      const k = Math.exp(-dt * 4);
      u.vx *= k; u.vy *= k;
      u.x += u.vx * dt; u.y += u.vy * dt;
    }
    const reach = p.r + (u.kind === 'chest' ? 26 : 14);
    if (!r.dying && dx * dx + dy * dy < reach * reach) collectPickup(u);
  }

  // --- particles, texts, effects
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    q.life -= dt;
    if (q.life <= 0) { q.dead = true; continue; }
    const k = Math.exp(-dt * q.drag);
    q.vx *= k; q.vy *= k;
    q.x += q.vx * dt; q.y += q.vy * dt;
  }
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    t.life -= dt;
    if (t.life <= 0) { t.dead = true; continue; }
    t.y += t.vy * dt;
    t.vy *= Math.exp(-dt * 3);
  }
  for (let i = 0; i < fx.length; i++) {
    const f = fx[i];
    f.life -= dt;
    if (f.life <= 0) f.dead = true;
  }

  // --- combo
  if (r.combo > 0) {
    r.comboT -= dt;
    if (r.comboT <= 0) { r.combo = 0; r.nextMilestone = 25; }
  }
  if (r.pendingShock && !r.dying) {
    r.pendingShock = false;
    const c = comboColor(r.combo);
    shockwave(170 * r.st.area, 10 + r.level * 1.5, c);
    addText(p.x, p.y - 34, 'COMBO ×' + r.combo, true, c);
    Sound.combo();
  }

  compact(enemies); compact(bullets); compact(ebullets); compact(gems);
  compact(pickups); compact(parts); compact(texts); compact(fx);

  r.achT -= dt;
  if (r.achT <= 0) { r.achT = 0.5; checkAchievements(); }

  if (!r.dying && (r.pendingLv > 0 || r.chestPending > 0)) openLevelUp();
}

function compact(arr) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) { const o = arr[i]; if (!o.dead) arr[j++] = o; }
  arr.length = j;
}

// Returns true while the boss is rooted (winding up).
function bossAI(e, dt, dx, dy) {
  const r = run;
  if (e.chargeT > 0) {
    e.chargeT -= dt;
    if (Math.random() < 0.6) burst(e.x, e.y, COL.white, 1, 80, 3);
    return false;
  }
  if (e.windT > 0) {
    e.windT -= dt;
    if (e.windT <= 0) {
      e.chargeT = 0.75;
      e.cvx = Math.cos(e.chargeA) * 560;
      e.cvy = Math.sin(e.chargeA) * 560;
      r.shake = Math.max(r.shake, 6);
    }
    return true;
  }
  e.actT -= dt;
  if (e.actT > 0) return false;
  e.phase = (e.phase + 1) % 3;
  if (e.phase === 0) {
    const n = 14 + r.bossCount * 4, off = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 7, dmg: e.dmg * 0.6, life: 5, col: COL.violet, dead: false });
    }
    Sound.nova();
    e.actT = 2.6;
  } else if (e.phase === 1) {
    for (let i = 0; i < 5 + r.bossCount * 2; i++) {
      const a = Math.random() * TAU;
      if (enemies.length < MAX_ENEMIES + 40) spawnEnemy(pick(['shade', 'runner']), e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70);
    }
    e.actT = 2.6;
  } else {
    e.windT = 0.7;
    e.chargeA = Math.atan2(dy, dx);
    fx.push({ k: 'tele', x: e.x, y: e.y, a: e.chargeA, len: 470, life: 0.7, max: 0.7 });
    Sound.warn();
    e.actT = 3.2;
  }
  return false;
}

function gainXp(v) {
  const r = run;
  r.xp += v * r.st.xpMul;
  r.score += v * 2;
  while (r.xp >= r.xpNext) {
    r.xp -= r.xpNext;
    r.level++;
    r.xpNext = xpFor(r.level);
    r.pendingLv++;
  }
}

function collectPickup(u) {
  const r = run, p = player;
  u.dead = true;
  switch (u.kind) {
    case 'crystal':
      r.crystals++;
      Sound.crystal();
      burst(u.x, u.y, COL.white, 5, 160, 2);
      break;
    case 'heart': {
      const heal = Math.round(r.st.maxHp * 0.3);
      p.hp = Math.min(r.st.maxHp, p.hp + heal);
      addText(p.x, p.y - 26, '+' + heal, false, COL.green);
      burst(p.x, p.y, COL.green, 14, 220);
      Sound.heal();
      break;
    }
    case 'magnet':
      for (const g of gems) g.pull = true;
      for (const c of pickups) if (c.kind === 'crystal') c.pull = true;
      fx.push({ k: 'ring', x: p.x, y: p.y, R: 300, life: 0.5, max: 0.5, col: COL.cyan, w: 4 });
      addText(p.x, p.y - 26, 'MAGNET', true, COL.cyan);
      Sound.power();
      break;
    case 'bomb': {
      const hw = W / 2 / VS + 40, hh = H / 2 / VS + 40;
      for (const e of enemies) {
        if (e.dead || Math.abs(e.x - p.x) > hw || Math.abs(e.y - p.y) > hh) continue;
        if (e.boss) hurtEnemy(e, (e.maxHp * 0.08) / r.st.dmg);
        else killEnemy(e);
      }
      for (const b of ebullets) b.dead = true;
      r.flash = 0.8; r.flashCol = COL.white;
      r.shake = Math.max(r.shake, 16);
      fx.push({ k: 'ring', x: p.x, y: p.y, R: Math.max(hw, hh), life: 0.6, max: 0.6, col: COL.white, w: 14 });
      Sound.boom();
      break;
    }
    case 'chest':
      r.chestPending++;
      r.score += 1000;
      burst(u.x, u.y, COL.gold, 30, 340, 4);
      Sound.power();
      break;
  }
}

// ============================================================ Achievements
function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (save.ach[a.id] || !a.test(run)) continue;
    save.ach[a.id] = Date.now();
    save.crystals += a.reward;
    run.achCrystals += a.reward;
    persist();
    toast(a.name, `Erfolg · +${a.reward} Splitter`);
    Sound.unlock();
  }
}

// ============================================================ Render
const menuDust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: rand(0.3, 1), c: pick(SPECTRUM), ph: Math.random() * TAU }));

function render(now, dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = COL.ink;
  ctx.fillRect(0, 0, W, H);
  if (state === 'menu' || !run) renderMenuArt(now / 1000, dt);
  else renderWorld(now / 1000);
}

function renderMenuArt(t, dt) {
  const narrow = W < 760;
  ctx.setTransform(DPR, 0, 0, DPR, -((t * 10) % 48) * DPR, -((t * 5) % 48) * DPR);
  ctx.fillStyle = gridPattern;
  ctx.fillRect(0, 0, W + 96, H + 96);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const cx = narrow ? W * 0.5 : W * 0.67, cy = narrow ? H * 0.26 : H * 0.47;
  const s = narrow ? Math.min(W * 0.24, H * 0.13) : Math.min(W, H) * 0.17;
  const rot = reducedMotion ? 0 : Math.sin(t * 0.35) * 0.06;
  const vx = [], vy = [];
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 3 + rot;
    vx.push(cx + Math.cos(a) * s);
    vy.push(cy + Math.sin(a) * s);
  }
  const inX = lerp(vx[0], vx[2], 0.55), inY = lerp(vy[0], vy[2], 0.55);
  const outX = lerp(vx[0], vx[1], 0.55), outY = lerp(vy[0], vy[1], 0.55);

  ctx.globalCompositeOperation = 'lighter';
  const srcY = inY - s * 0.55, x0 = narrow ? 0 : W * 0.42;
  const beamG = ctx.createLinearGradient(x0, 0, inX, 0);
  beamG.addColorStop(0, 'rgba(244,241,255,0)');
  beamG.addColorStop(1, 'rgba(244,241,255,0.9)');
  ctx.globalAlpha = 1;
  ctx.strokeStyle = beamG;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, srcY - (inX / W) * 10); ctx.lineTo(inX, inY); ctx.stroke();
  drawGlow(COL.white, inX, inY, 46, 0.7);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(244,241,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(inX, inY); ctx.lineTo(outX, outY); ctx.stroke();

  // Dispersion fan: red bends least, violet most — just like a real prism.
  const reach = Math.hypot(W, H);
  const baseA = 0.16 + rot * 2;
  for (let i = 0; i < 7; i++) {
    const a0 = baseA + (i - 3) * 0.055 + (reducedMotion ? 0 : Math.sin(t * 0.8 + i) * 0.004);
    const a1 = a0 + 0.05;
    const gr = ctx.createLinearGradient(outX, outY, outX + Math.cos(a0) * reach * 0.7, outY + Math.sin(a0) * reach * 0.7);
    gr.addColorStop(0, hexA(SPECTRUM[i], 0.6));
    gr.addColorStop(1, hexA(SPECTRUM[i], 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(outX, outY);
    ctx.lineTo(outX + Math.cos(a0) * reach, outY + Math.sin(a0) * reach);
    ctx.lineTo(outX + Math.cos(a1) * reach, outY + Math.sin(a1) * reach);
    ctx.closePath();
    ctx.fill();
  }
  drawGlow(COL.white, outX, outY, 30, 0.5);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(vx[0], vy[0]); ctx.lineTo(vx[1], vy[1]); ctx.lineTo(vx[2], vy[2]); ctx.closePath();
  ctx.fillStyle = 'rgba(244,241,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(244,241,255,0.92)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.globalCompositeOperation = 'lighter';
  for (const d of menuDust) {
    if (!reducedMotion) d.x -= dt * 0.012 * d.z;
    if (d.x < -0.02) d.x = 1.02;
    const x = d.x * W, y = d.y * H + Math.sin(t * 0.7 + d.ph) * 8;
    drawGlow(d.c, x, y, 7 * d.z, 0.45 * d.z);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function renderWorld(t) {
  const r = run, p = player;
  let sx = 0, sy = 0;
  if (save.settings.shake && r.shake > 0.2) { sx = (Math.random() * 2 - 1) * r.shake; sy = (Math.random() * 2 - 1) * r.shake; }

  // nebula in screen space, drifting with a little parallax
  ctx.globalCompositeOperation = 'lighter';
  const nb = Math.max(W, H) * 0.9;
  const c1 = SPECTRUM[((t / 9) | 0) % 7], c2 = SPECTRUM[(((t / 9) | 0) + 4) % 7];
  drawGlow(c1, W * 0.25 - cam.x * 0.04 % W, H * 0.3 - cam.y * 0.04 % H, nb, 0.07);
  drawGlow(c2, W * 0.8 - cam.x * 0.06 % W, H * 0.75 - cam.y * 0.06 % H, nb * 0.8, 0.06);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  const k = DPR * VS;
  ctx.setTransform(k, 0, 0, k, DPR * (W / 2 + sx) - cam.x * k, DPR * (H / 2 + sy) - cam.y * k);
  const hw = W / 2 / VS + 60, hh = H / 2 / VS + 60;
  const vx0 = cam.x - hw, vx1 = cam.x + hw, vy0 = cam.y - hh, vy1 = cam.y + hh;
  const vis = (x, y, rr) => x + rr > vx0 && x - rr < vx1 && y + rr > vy0 && y - rr < vy1;

  ctx.fillStyle = gridPattern;
  ctx.fillRect(vx0, vy0, hw * 2, hh * 2);

  // ---------- glow pass (additive)
  ctx.globalCompositeOperation = 'lighter';
  for (const g of gems) if (vis(g.x, g.y, 20)) drawGlow(g.col, g.x, g.y, g.r * 3.4, 0.5);
  for (const u of pickups) if (vis(u.x, u.y, 40)) drawGlow(pickupColor(u, t), u.x, u.y, u.kind === 'chest' ? 70 : 26, 0.6);
  for (const e of enemies) if (vis(e.x, e.y, e.r * 2)) drawGlow(e.elite ? COL.gold : e.color, e.x, e.y, e.r * (e.boss ? 3.4 : 2.3), e.boss ? 0.5 : 0.2);

  // effects under units
  for (const f of fx) {
    const a = f.life / f.max;
    if (f.k === 'ring') {
      const R = f.R * (1 - a * a * 0.85);
      ctx.globalAlpha = a;
      ctx.strokeStyle = f.col;
      ctx.lineWidth = f.w * a + 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * 0.08;
      ctx.fillStyle = f.col;
      ctx.fill();
    } else if (f.k === 'laser') {
      const c = Math.cos(f.a), s = Math.sin(f.a), nx = -s, ny = c;
      const w = f.w * (0.35 + 0.65 * a);
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const off = (i - 3) * w * 0.22, spread = (i - 3) * (0.06 + (1 - a) * 0.08);
        ctx.globalAlpha = 0.6 * a;
        ctx.strokeStyle = SPECTRUM[i];
        ctx.lineWidth = w * 0.42;
        ctx.beginPath();
        ctx.moveTo(f.x + nx * off * 0.15, f.y + ny * off * 0.15);
        ctx.lineTo(f.x + c * f.len + nx * (off + spread * f.len * 0.12), f.y + s * f.len + ny * (off + spread * f.len * 0.12));
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.strokeStyle = COL.white;
      ctx.lineWidth = w * 0.3;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + c * f.len, f.y + s * f.len); ctx.stroke();
    } else if (f.k === 'tele') {
      ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 20));
      ctx.strokeStyle = COL.red;
      ctx.lineWidth = 36;
      ctx.lineCap = 'butt';
      ctx.setLineDash([18, 14]);
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(f.a) * f.len, f.y + Math.sin(f.a) * f.len); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---------- photons & pickups
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  for (const g of gems) {
    if (!vis(g.x, g.y, 20)) continue;
    const rr = g.r, bob = Math.sin(g.t * 4) * 0.15 + 1;
    ctx.fillStyle = g.col;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - rr * 1.35 * bob); ctx.lineTo(g.x + rr, g.y); ctx.lineTo(g.x, g.y + rr * 1.35 * bob); ctx.lineTo(g.x - rr, g.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  for (const g of gems) {
    if (!vis(g.x, g.y, 20)) continue;
    const rr = g.r * 0.42;
    ctx.moveTo(g.x, g.y - rr * 1.35); ctx.lineTo(g.x + rr, g.y); ctx.lineTo(g.x, g.y + rr * 1.35); ctx.lineTo(g.x - rr, g.y); ctx.closePath();
  }
  ctx.fill();
  for (const u of pickups) if (vis(u.x, u.y, 40)) drawPickup(u, t);

  // ---------- enemies
  for (const e of enemies) if (vis(e.x, e.y, e.r * 1.5)) drawEnemy(e, t);

  // ---------- projectiles, lenses, player (additive)
  ctx.globalCompositeOperation = 'lighter';
  for (const b of ebullets) {
    if (!vis(b.x, b.y, 20)) continue;
    drawGlow(b.col, b.x, b.y, b.r * 3.2, 0.8);
  }
  for (const b of bullets) {
    if (!vis(b.x, b.y, 30)) continue;
    drawGlow(b.col, b.x, b.y, 16, 0.7);
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff7cc';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  for (const b of bullets) {
    if (!vis(b.x, b.y, 30)) continue;
    ctx.moveTo(b.x - b.vx * 0.024, b.y - b.vy * 0.024);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.fillStyle = COL.white;
  ctx.beginPath();
  for (const b of ebullets) {
    if (!vis(b.x, b.y, 20)) continue;
    ctx.moveTo(b.x + b.r * 0.55, b.y);
    ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU);
  }
  ctx.fill();

  if (r.lenses.length) {
    const R = WEAPONS.orbit.lv[(r.weapons.orbit || 1) - 1].rad * r.st.area;
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = COL.cyan;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke();
    const lr = 10 * Math.sqrt(r.st.area);
    for (let i = 0; i < r.lenses.length; i += 2) drawGlow(COL.cyan, r.lenses[i], r.lenses[i + 1], lr * 3, 0.8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#d9f6ff';
    ctx.beginPath();
    for (let i = 0; i < r.lenses.length; i += 2) {
      ctx.moveTo(r.lenses[i] + lr * 0.7, r.lenses[i + 1]);
      ctx.ellipse(r.lenses[i], r.lenses[i + 1], lr * 0.7, lr * 0.45, r.orbA * 2, 0, TAU);
    }
    ctx.fill();
  }

  // dash afterimages
  for (const f of fx) {
    if (f.k !== 'ghost') continue;
    ctx.globalAlpha = (f.life / f.max) * 0.5;
    ctx.strokeStyle = SPECTRUM[(f.life * 40) % 7 | 0];
    ctx.lineWidth = 2;
    prismPath(f.x, f.y, f.a, p.r * 1.4);
    ctx.stroke();
  }

  if (!r.dying) drawPlayer(t);

  // lightning
  for (const f of fx) {
    if (f.k !== 'bolt') continue;
    const a = f.life / f.max;
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = pass ? a : a * 0.5;
      ctx.strokeStyle = pass ? COL.white : f.col;
      ctx.lineWidth = pass ? 1.6 : 6;
      ctx.beginPath();
      ctx.moveTo(f.pts[0], f.pts[1]);
      for (let i = 2; i < f.pts.length; i += 2) {
        const x0 = f.pts[i - 2], y0 = f.pts[i - 1], x1 = f.pts[i], y1 = f.pts[i + 1];
        const mx = (x0 + x1) / 2 + rand(-14, 14), my = (y0 + y1) / 2 + rand(-14, 14);
        ctx.lineTo(mx, my);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
  }

  // particles
  ctx.lineCap = 'round';
  for (const q of parts) {
    if (!vis(q.x, q.y, 10)) continue;
    const a = q.life / q.max;
    ctx.globalAlpha = a;
    if (q.spark) {
      ctx.strokeStyle = q.col;
      ctx.lineWidth = q.size * 0.7;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04);
      ctx.stroke();
    } else {
      ctx.fillStyle = q.col;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
  }

  // floating numbers
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tx of texts) {
    const a = Math.min(1, (tx.life / tx.max) * 2);
    const big = tx.crit;
    ctx.font = big ? '800 17px "JetBrains Mono", monospace' : '700 12px "JetBrains Mono", monospace';
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = COL.ink;
    ctx.fillText(tx.s, tx.x + 1, tx.y + 1.5);
    ctx.globalAlpha = a;
    ctx.fillStyle = tx.col;
    ctx.fillText(tx.s, tx.x, tx.y);
  }
  ctx.globalAlpha = 1;

  // ---------- screen space overlays
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(7,6,15,0)');
  vg.addColorStop(1, 'rgba(7,6,15,0.7)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const hpFrac = p.hp / r.st.maxHp;
  if (hpFrac < 0.3 && !r.dying) {
    const pulse = 0.35 + 0.25 * Math.sin(t * 7);
    const lg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    lg.addColorStop(0, 'rgba(255,77,109,0)');
    lg.addColorStop(1, hexA(COL.red, pulse * (1 - hpFrac / 0.3)));
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
  }
  if (r.flash > 0) {
    ctx.globalAlpha = Math.min(0.45, r.flash * 0.4);
    ctx.fillStyle = r.flashCol;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // boss off-screen pointer
  if (r.boss) {
    const bx = (r.boss.x - cam.x) * VS + W / 2, by = (r.boss.y - cam.y) * VS + H / 2;
    if (bx < 0 || bx > W || by < 0 || by > H) {
      const a = Math.atan2(by - H / 2, bx - W / 2);
      const m = 34, ex = clamp(bx, m, W - m), ey = clamp(by, m + 80, H - m);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = COL.white;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // touch stick
  if (joy.on && state === 'play') {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), m = Math.min(d, 56);
    const kx = d ? joy.ox + (dx / d) * m : joy.ox, ky = d ? joy.oy + (dy / d) * m : joy.oy;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = COL.white;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 56, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = COL.white;
    ctx.beginPath(); ctx.arc(kx, ky, 20, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function prismPath(x, y, a, s) {
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  ctx.lineTo(x + Math.cos(a + 2.3) * s * 0.85, y + Math.sin(a + 2.3) * s * 0.85);
  ctx.lineTo(x + Math.cos(a - 2.3) * s * 0.85, y + Math.sin(a - 2.3) * s * 0.85);
  ctx.closePath();
}

function drawPlayer(t) {
  const p = player, r = run;
  // dispersion trail: the prism leaves a ribbon of split light behind it
  const tr = p.trail;
  if (tr.length >= 6) {
    const nx = -p.fy, ny = p.fx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let c = 0; c < 7; c++) {
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = SPECTRUM[c];
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < tr.length; i += 2) {
        const age = 1 - i / tr.length;
        const off = (c - 3) * 1.7 * age;
        const x = tr[i] + nx * off, y = tr[i + 1] + ny * off;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }
  const blink = p.inv > 0 && p.dashT <= 0 && ((t * 18) | 0) % 2 === 0;
  drawGlow(COL.white, p.x, p.y, 54, blink ? 0.25 : 0.55);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = blink ? 0.45 : 1;
  const s = p.r * 1.45;
  prismPath(p.x, p.y, p.ang, s);
  ctx.fillStyle = COL.white;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COL.ink;
  ctx.stroke();
  // internal refraction lines
  ctx.lineWidth = 1.6;
  const tipX = p.x + Math.cos(p.ang) * s * 0.8, tipY = p.y + Math.sin(p.ang) * s * 0.8;
  const backX = p.x - Math.cos(p.ang) * s * 0.35, backY = p.y - Math.sin(p.ang) * s * 0.35;
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * s * 0.28;
    ctx.strokeStyle = [COL.red, COL.green, COL.blue][i];
    ctx.beginPath();
    ctx.moveTo(backX - Math.sin(p.ang) * off, backY + Math.cos(p.ang) * off);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // dash charge arc
  if (p.dashCd > 0) {
    const f = 1 - p.dashCd / r.st.dashCd;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = COL.white;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 11, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // hp bar when hurt
  if (p.hp < r.st.maxHp) {
    const w = 34, f = clamp(p.hp / r.st.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(7,6,15,0.8)';
    ctx.fillRect(p.x - w / 2 - 1, p.y + 23, w + 2, 6);
    ctx.fillStyle = f < 0.3 ? COL.red : COL.green;
    ctx.fillRect(p.x - w / 2, p.y + 24, w * f, 4);
  }
  ctx.globalCompositeOperation = 'lighter';
}

function drawEnemy(e, t) {
  const ang = Math.atan2(player.y - e.y, player.x - e.x);
  const R = e.r;
  ctx.beginPath();
  switch (e.shape) {
    case 'tri':
      ctx.moveTo(e.x + Math.cos(ang) * R * 1.15, e.y + Math.sin(ang) * R * 1.15);
      ctx.lineTo(e.x + Math.cos(ang + 2.4) * R, e.y + Math.sin(ang + 2.4) * R);
      ctx.lineTo(e.x + Math.cos(ang - 2.4) * R, e.y + Math.sin(ang - 2.4) * R);
      break;
    case 'dart':
      ctx.moveTo(e.x + Math.cos(ang) * R * 1.3, e.y + Math.sin(ang) * R * 1.3);
      ctx.lineTo(e.x + Math.cos(ang + 2.55) * R, e.y + Math.sin(ang + 2.55) * R);
      ctx.lineTo(e.x + Math.cos(ang + Math.PI) * R * 0.35, e.y + Math.sin(ang + Math.PI) * R * 0.35);
      ctx.lineTo(e.x + Math.cos(ang - 2.55) * R, e.y + Math.sin(ang - 2.55) * R);
      break;
    case 'dia':
      ctx.moveTo(e.x + Math.cos(ang) * R * 1.3, e.y + Math.sin(ang) * R * 1.3);
      ctx.lineTo(e.x + Math.cos(ang + Math.PI / 2) * R * 0.75, e.y + Math.sin(ang + Math.PI / 2) * R * 0.75);
      ctx.lineTo(e.x - Math.cos(ang) * R * 1.1, e.y - Math.sin(ang) * R * 1.1);
      ctx.lineTo(e.x + Math.cos(ang - Math.PI / 2) * R * 0.75, e.y + Math.sin(ang - Math.PI / 2) * R * 0.75);
      break;
    case 'sq':
    case 'hex': {
      const n = e.shape === 'sq' ? 4 : 6;
      for (let i = 0; i < n; i++) {
        const a = e.rot + (i / n) * TAU;
        const x = e.x + Math.cos(a) * R, y = e.y + Math.sin(a) * R;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      break;
    }
    case 'boss': {
      const n = 12, pulse = 1 + Math.sin(t * 5) * 0.04;
      for (let i = 0; i < n * 2; i++) {
        const a = e.rot + (i / (n * 2)) * TAU;
        const rr = (i % 2 ? R * 0.74 : R * 1.08) * pulse;
        const x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      break;
    }
  }
  ctx.closePath();
  ctx.globalAlpha = 1;
  ctx.fillStyle = e.flash > 0 ? COL.white : COL.body;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = e.boss ? 3.5 : e.elite ? 3 : 2.2;
  ctx.strokeStyle = e.boss ? SPECTRUM[((t * 6) | 0) % 7] : e.elite ? COL.gold : e.color;
  ctx.stroke();
  // eye, always watching the prism
  const eo = e.boss ? 0.2 : 0.32;
  ctx.fillStyle = e.boss ? COL.white : e.elite ? COL.gold : e.color;
  ctx.beginPath();
  ctx.arc(e.x + Math.cos(ang) * R * eo, e.y + Math.sin(ang) * R * eo, Math.max(2.2, R * (e.boss ? 0.2 : 0.17)), 0, TAU);
  ctx.fill();
  if (e.elite) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = COL.gold;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.arc(e.x, e.y, R * 1.45, e.t, e.t + TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function pickupColor(u, t) {
  switch (u.kind) {
    case 'crystal': return SPECTRUM[((t * 3 + u.t) | 0) % 7];
    case 'heart': return COL.green;
    case 'magnet': return COL.cyan;
    case 'bomb': return COL.white;
    default: return COL.gold;
  }
}

function drawPickup(u, t) {
  const bob = Math.sin(u.t * 3) * 2.5;
  const x = u.x, y = u.y + bob;
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (u.kind) {
    case 'crystal': {
      ctx.fillStyle = COL.white;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = u.t * 1.5 + (i / 6) * TAU;
        const px = x + Math.cos(a) * 6, py = y + Math.sin(a) * 6;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'heart':
      ctx.strokeStyle = COL.green;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
      break;
    case 'magnet':
      ctx.strokeStyle = COL.cyan;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI); ctx.moveTo(x - 8, y); ctx.lineTo(x - 8, y - 8); ctx.moveTo(x + 8, y); ctx.lineTo(x + 8, y - 8); ctx.stroke();
      break;
    case 'bomb': {
      ctx.fillStyle = COL.white;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = u.t * 2 + (i / 16) * TAU, rr = i % 2 ? 5 : 11;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'chest': {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x, y - 140, x, y);
      g.addColorStop(0, 'rgba(255,209,102,0)');
      g.addColorStop(1, 'rgba(255,209,102,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 16, y - 140, 32, 140);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = COL.body;
      ctx.strokeStyle = COL.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - 18, y - 13, 36, 26, 5) : ctx.rect(x - 18, y - 13, 36, 26);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 18, y - 2); ctx.lineTo(x + 18, y - 2); ctx.stroke();
      ctx.fillStyle = COL.gold;
      ctx.fillRect(x - 4, y - 5, 8, 8);
      break;
    }
  }
}

// ============================================================ UI
const ui = {
  hud: $('#hud'), menu: $('#menu'), levelup: $('#levelup'), pause: $('#pause'), over: $('#over'), shop: $('#shop'), ach: $('#ach'),
  xpFill: $('#xpFill'), hpFill: $('#hpFill'), hpText: $('#hpText'), lv: $('#hudLv'), time: $('#hudTime'), score: $('#hudScore'), kills: $('#hudKills'),
  combo: $('#combo'), comboN: $('#comboN'), comboFill: $('#comboFill'), bossbar: $('#bossbar'), bossFill: $('#bossFill'),
  loadout: $('#loadout'), dash: $('#btnDash'), banner: $('#banner'), hint: $('#hint'), cards: $('#cards'), reroll: $('#btnReroll'), toasts: $('#toasts'),
};
let shopReturn = 'menu';
let overOpenT = 0;
let bannerT = 0, hintT = 0;
const hudCache = {};
const setText = (el, key, val) => { if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; } };
const crystalHtml = (n) => `<span class="cr">${ICONS.crystal}<b>${fmtNum(n)}</b></span>`;

function banner(title, sub, col) {
  ui.banner.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
  ui.banner.style.setProperty('--c', col || COL.white);
  ui.banner.hidden = false;
  ui.banner.classList.remove('in');
  void ui.banner.offsetWidth;
  ui.banner.classList.add('in');
  bannerT = 2.4;
}
function toast(title, sub) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="ti">${ICONS.trophy}</span><div><b>${title}</b><span>${sub}</span></div>`;
  ui.toasts.appendChild(el);
  while (ui.toasts.children.length > 3) ui.toasts.firstElementChild.remove();
  setTimeout(() => el.remove(), 3500);
}

function updateHud() {
  const r = run, p = player;
  ui.xpFill.style.transform = `scaleX(${clamp(r.xp / r.xpNext, 0, 1).toFixed(4)})`;
  setText(ui.lv, 'lv', r.level);
  setText(ui.time, 't', fmtTime(r.t));
  setText(ui.score, 's', fmtNum(r.score));
  setText(ui.kills, 'k', fmtNum(r.kills));
  ui.hpFill.style.transform = `scaleX(${clamp(p.hp / r.st.maxHp, 0, 1).toFixed(4)})`;
  setText(ui.hpText, 'hp', `${Math.ceil(Math.max(0, p.hp))} / ${r.st.maxHp}`);
  if (r.combo >= 3) {
    if (ui.combo.hidden) ui.combo.hidden = false;
    setText(ui.comboN, 'c', r.combo);
    const c = comboColor(r.combo);
    if (hudCache.cc !== c) { hudCache.cc = c; ui.combo.style.setProperty('--c', c); }
    ui.combo.style.transform = `scale(${r.comboPop.toFixed(3)})`;
    ui.comboFill.style.transform = `scaleX(${clamp(r.comboT / 2.4, 0, 1).toFixed(3)})`;
  } else if (!ui.combo.hidden) ui.combo.hidden = true;
  if (r.boss) {
    if (ui.bossbar.hidden) ui.bossbar.hidden = false;
    ui.bossFill.style.transform = `scaleX(${clamp(r.boss.hp / r.boss.maxHp, 0, 1).toFixed(4)})`;
  } else if (!ui.bossbar.hidden) ui.bossbar.hidden = true;
  if (!ui.dash.hidden) {
    const f = p.dashCd > 0 ? 1 - p.dashCd / r.st.dashCd : 1;
    ui.dash.style.setProperty('--cd', f.toFixed(3));
    ui.dash.classList.toggle('ready', f >= 1);
  }
}

function renderLoadout() {
  const chip = (it, l, max) => `<span class="chip" style="--c:${it.color}" title="${it.name}">${ICONS[it.icon]}<b>${l >= max ? 'MAX' : l}</b></span>`;
  const w = Object.entries(run.weapons).map(([id, l]) => chip(WEAPONS[id], l, 5)).join('');
  const pz = Object.entries(run.passives).map(([id, l]) => chip(PASSIVES[id], l, PASSIVES[id].max)).join('');
  ui.loadout.innerHTML = `<div class="loadout-row">${w}</div>${pz ? `<div class="loadout-row">${pz}</div>` : ''}`;
}

function rollChoices() {
  const r = run;
  const wCount = Object.keys(r.weapons).length, pCount = Object.keys(r.passives).length;
  const pool = [];
  for (const id in WEAPONS) {
    const l = r.weapons[id] || 0;
    if (l >= 5 || (!l && wCount >= MAX_WEAPONS)) continue;
    pool.push({ kind: 'w', id, w: l ? 1.4 : wCount < 2 ? 2.2 : 1 });
  }
  for (const id in PASSIVES) {
    const l = r.passives[id] || 0;
    if (l >= PASSIVES[id].max || (!l && pCount >= MAX_PASSIVES)) continue;
    pool.push({ kind: 'p', id, w: l ? 1.15 : 0.9 });
  }
  const n = shopLv('insight') ? 4 : 3;
  const out = [];
  while (out.length < n && pool.length) {
    let tot = 0;
    for (const c of pool) tot += c.w;
    let x = Math.random() * tot, idx = 0;
    for (; idx < pool.length - 1; idx++) { if ((x -= pool[idx].w) < 0) break; }
    out.push(pool.splice(idx, 1)[0]);
  }
  if (!out.length) out.push({ kind: 'heal' }, { kind: 'gold' });
  return out;
}

function cardHtml(c, i) {
  let name, desc, kind, icon, col, lvNow = 0, max = 0;
  if (c.kind === 'w') {
    const d = WEAPONS[c.id];
    lvNow = run.weapons[c.id] || 0; max = 5;
    name = d.name; icon = d.icon; col = d.color; desc = d.up[lvNow]; kind = 'Waffe';
  } else if (c.kind === 'p') {
    const d = PASSIVES[c.id];
    lvNow = run.passives[c.id] || 0; max = d.max;
    name = d.name; icon = d.icon; col = d.color; desc = d.desc; kind = 'Modul';
  } else if (c.kind === 'heal') {
    name = 'Reparatur'; desc = 'Stellt 40 Leben wieder her.'; kind = 'Sofort'; icon = 'hp'; col = COL.green;
  } else {
    name = 'Splitterregen'; desc = '+15 Splitter für die Werkstatt.'; kind = 'Sofort'; icon = 'crystal'; col = COL.white;
  }
  const status = max ? (lvNow ? `Stufe ${ROMAN[lvNow]}` : 'Neu') : '';
  const pips = max ? `<span class="pips">${Array.from({ length: max }, (_, k) => `<i class="${k < lvNow ? 'on' : k === lvNow ? 'new' : ''}"></i>`).join('')}</span>` : '';
  return `<button class="card" type="button" data-i="${i}" style="--c:${col};--i:${i}"><span class="card-icon">${ICONS[icon]}</span><span class="card-key">${i + 1}</span><span class="card-body"><span class="card-kind">${kind}${status ? ' · ' + status : ''}</span><span class="card-name">${name}</span><span class="card-desc">${desc}</span>${pips}</span></button>`;
}

function renderCards() {
  const r = run;
  $('#luEyebrow').textContent = r.chestOpen ? 'Truhe geöffnet' : 'Level erreicht';
  $('#luTitle').textContent = r.chestOpen ? 'Belohnung' : `Level ${r.level - r.pendingLv + 1}`;
  ui.cards.style.setProperty('--n', r.choices.length);
  ui.cards.innerHTML = r.choices.map(cardHtml).join('');
  ui.reroll.textContent = `Neu würfeln · ${r.rerolls}`;
  ui.reroll.disabled = r.rerolls <= 0;
  $('#luHint').innerHTML = `<kbd>1</kbd>–<kbd>${r.choices.length}</kbd> wählen · <kbd>R</kbd> neu würfeln`;
}

function openLevelUp() {
  const r = run;
  state = 'levelup';
  joy.on = false;
  r.chestOpen = r.pendingLv <= 0 && r.chestPending > 0;
  r.choices = rollChoices();
  r.luOpenT = performance.now();
  renderCards();
  ui.levelup.hidden = false;
  Sound.levelUp();
  Sound.duck(true);
  blurActive();
}

function choose(i, fromKey) {
  if (state !== 'levelup') return;
  const r = run;
  if (!fromKey && performance.now() - r.luOpenT < 280) return; // swallow stray taps from frantic play
  const c = r.choices[i];
  if (!c) return;
  const before = r.st.maxHp;
  if (c.kind === 'w') {
    r.weapons[c.id] = (r.weapons[c.id] || 0) + 1;
  } else if (c.kind === 'p') {
    r.passives[c.id] = (r.passives[c.id] || 0) + 1;
  } else if (c.kind === 'heal') {
    player.hp = Math.min(r.st.maxHp, player.hp + 40);
  } else {
    r.crystals += 15;
  }
  calcStats();
  if (c.kind === 'p' && c.id === 'hp') player.hp = Math.min(r.st.maxHp, player.hp + (r.st.maxHp - before) + 20);
  player.hp = Math.min(player.hp, r.st.maxHp);
  if (r.chestOpen) r.chestPending--; else r.pendingLv--;
  renderLoadout();
  Sound.pick();
  if (r.pendingLv > 0 || r.chestPending > 0) {
    openLevelUp();
    return;
  }
  ui.levelup.hidden = true;
  state = 'play';
  player.inv = Math.max(player.inv, 0.6);
  buildGrid();
  shockwave(150, 0, COL.white);
  Sound.duck(false);
  blurActive();
}

function reroll() {
  const r = run;
  if (state !== 'levelup' || r.rerolls <= 0) return;
  r.rerolls--;
  r.choices = rollChoices();
  renderCards();
  Sound.click();
}

function blurActive() {
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}

function startRun() {
  Sound.init();
  Sound.click();
  closePanels();
  newRun();
  state = 'play';
  for (const k of ['menu', 'levelup', 'pause', 'over']) ui[k].hidden = true;
  ui.hud.hidden = false;
  ui.dash.hidden = !touchDevice;
  ui.combo.hidden = true;
  ui.bossbar.hidden = true;
  ui.banner.hidden = true;
  for (const k in hudCache) delete hudCache[k];
  renderLoadout();
  updateHud();
  blurActive();
  Sound.duck(false);
  Sound.musicStart();
  if (!save.seenHint || save.runs < 2) {
    ui.hint.innerHTML = touchDevice
      ? 'Ziehen zum Bewegen · <b>Sprint</b> unten rechts<br>Deine Waffen feuern von selbst'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> bewegen · <kbd>Leertaste</kbd> Sprint · <kbd>Esc</kbd> Pause<br>Deine Waffen feuern von selbst';
    ui.hint.hidden = false;
    ui.hint.classList.remove('fade');
    hintT = 7;
    save.seenHint = true;
    persist();
  } else {
    ui.hint.hidden = true;
  }
  lastT = performance.now();
}

function pauseGame() {
  if (state !== 'play' || run.dying) return;
  state = 'pause';
  joy.on = false;
  run.quitArmed = false;
  $('#btnQuit').textContent = 'Lauf beenden';
  $('#pauseInfo').textContent = `${fmtTime(run.t)} · Level ${run.level} · ${fmtNum(run.kills)} Schatten`;
  const rows = [
    ...Object.entries(run.weapons).map(([id, l]) => [WEAPONS[id], l, 5]),
    ...Object.entries(run.passives).map(([id, l]) => [PASSIVES[id], l, PASSIVES[id].max]),
  ];
  $('#pauseBuild').innerHTML = rows.map(([d, l, max]) => `<div class="build-row" style="--c:${d.color}"><span class="ic">${ICONS[d.icon]}</span><span class="nm">${d.name}</span><span class="pips">${Array.from({ length: max }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
  ui.pause.hidden = false;
  Sound.duck(true);
  if (!touchDevice) $('#btnResume').focus({ preventScroll: true });
}

function resumeGame() {
  if (state !== 'pause') return;
  state = 'play';
  ui.pause.hidden = true;
  Sound.init();
  Sound.duck(false);
  blurActive();
  lastT = performance.now();
}

function quitRun() {
  if (state !== 'pause') return;
  if (!run.quitArmed) {
    run.quitArmed = true;
    $('#btnQuit').textContent = 'Wirklich beenden? Nochmal tippen';
    return;
  }
  ui.pause.hidden = true;
  Sound.musicStop();
  endRun(true);
}

function endRun(quit) {
  const r = run;
  state = 'over';
  checkAchievements();
  const minutes = Math.floor(r.t / 60);
  const timeBonus = minutes * 3, scoreBonus = Math.floor(r.score / 5000);
  const earned = r.crystals + timeBonus + scoreBonus;
  save.crystals += earned;
  save.earned += earned;
  save.runs++;
  save.totalKills += r.kills;
  const b = save.best;
  const rec = { time: r.t > b.time, score: r.score > b.score, level: r.level > b.level, kills: r.kills > b.kills };
  const anyRecord = save.runs > 1 && (rec.time || rec.score);
  b.time = Math.max(b.time, r.t);
  b.score = Math.max(b.score, Math.floor(r.score));
  b.level = Math.max(b.level, r.level);
  b.kills = Math.max(b.kills, r.kills);
  persist();

  $('#overEyebrow').textContent = quit ? 'Lauf abgebrochen' : `Lauf ${save.runs}`;
  $('#newRecord').hidden = !anyRecord;
  const stats = [
    ['Zeit', fmtTime(r.t), rec.time],
    ['Punkte', fmtNum(r.score), rec.score],
    ['Level', r.level, rec.level],
    ['Schatten', fmtNum(r.kills), rec.kills],
    ['Max. Combo', '×' + r.maxCombo, false],
    ['Bosse', r.bosses, false],
  ];
  $('#overStats').innerHTML = stats.map(([k, v, isRec]) => `<div class="${isRec && save.runs > 1 ? 'is-record' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const parts = [`${r.crystals} gesammelt`, `${timeBonus} Überlebensbonus`, `${scoreBonus} Punktebonus`];
  if (r.achCrystals) parts.push(`${r.achCrystals} aus Erfolgen`);
  $('#overEarned').innerHTML = `${crystalHtml(earned + r.achCrystals).replace('<b>', '<b>+')}<small>${parts.join(' · ')}</small>`;
  $('#nextGoal').textContent = nextGoalText();
  ui.hud.hidden = true;
  ui.over.hidden = false;
  overOpenT = performance.now();
  blurActive();
  if (!touchDevice) setTimeout(() => { if (state === 'over' && !panelOpen()) $('#btnAgain').focus({ preventScroll: true }); }, 700);
}

function nextGoalText() {
  const opts = SHOP.filter((it) => shopLv(it.id) < it.max)
    .map((it) => ({ it, cost: shopCost(it, shopLv(it.id)) }))
    .sort((a, b) => a.cost - b.cost);
  if (!opts.length) return 'Die Werkstatt ist komplett ausgebaut. Jetzt zählen nur noch Rekorde.';
  const afford = opts.filter((o) => o.cost <= save.crystals);
  if (afford.length) {
    return afford.length === 1
      ? `Du kannst dir jetzt ${afford[0].it.name} ${ROMAN[shopLv(afford[0].it.id)]} in der Werkstatt leisten.`
      : `Du kannst dir jetzt ${afford.length} Verbesserungen in der Werkstatt leisten.`;
  }
  const o = opts[0];
  return `Noch ${fmtNum(o.cost - save.crystals)} Splitter bis ${o.it.name} ${ROMAN[shopLv(o.it.id)]}.`;
}

function renderMenu() {
  const b = save.best;
  $('#records').innerHTML = b.time > 0
    ? `<div><span class="lbl">Rekordzeit</span><b>${fmtTime(b.time)}</b></div><div><span class="lbl">Punkte</span><b>${fmtNum(b.score)}</b></div><div><span class="lbl">Level</span><b>${b.level}</b></div><div><span class="lbl">Splitter</span>${crystalHtml(save.crystals)}</div>`
    : `<div><span class="lbl">Rekordzeit</span><b>--:--</b></div><div><span class="lbl">Splitter</span>${crystalHtml(save.crystals)}</div><div><span class="lbl">Ziel</span><b>3:00 überleben</b></div>`;
  const affordable = SHOP.filter((it) => shopLv(it.id) < it.max && shopCost(it, shopLv(it.id)) <= save.crystals).length;
  const badge = $('#shopBadge');
  badge.hidden = !affordable;
  badge.textContent = affordable;
  const done = ACHIEVEMENTS.filter((a) => save.ach[a.id]).length;
  $('#achCount').textContent = `${done}/${ACHIEVEMENTS.length}`;
  $('#controlsHint').innerHTML = '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> bewegen · <kbd>Leertaste</kbd> Sprint · <kbd>Esc</kbd> Pause · <kbd>M</kbd> Ton<br>Gamepad und Touch funktionieren ebenfalls.';
}

const TOGGLES = [['sfx', 'Effekte'], ['music', 'Musik'], ['shake', 'Wackeln']];
function renderToggles() {
  for (const el of document.querySelectorAll('.toggles')) {
    el.innerHTML = TOGGLES.map(([k, l]) => `<button type="button" class="toggle" data-toggle="${k}" aria-pressed="${!!save.settings[k]}"><span class="dot"></span>${l}</button>`).join('');
  }
}
function toggleAllSound() {
  const on = !(save.settings.sfx || save.settings.music);
  save.settings.sfx = on;
  save.settings.music = on;
  persist();
  Sound.init();
  Sound.applySettings();
  renderToggles();
}

function renderShop() {
  $('#shopBalance').innerHTML = `<span class="lbl">Splitter</span>${crystalHtml(save.crystals)}`;
  $('#shopGrid').innerHTML = SHOP.map((it) => {
    const lv = shopLv(it.id), maxed = lv >= it.max, cost = shopCost(it, lv), can = !maxed && save.crystals >= cost;
    const pips = Array.from({ length: it.max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
    return `<div class="shop-item${maxed ? ' is-max' : ''}" style="--c:${it.color}">
      <div class="shop-head"><span class="shop-icon">${ICONS[it.icon]}</span><div><h3>${it.name}</h3><span class="pips">${pips}</span></div></div>
      <p>${it.desc}</p>
      <button class="btn${can ? ' btn-primary' : ''}" type="button" data-buy="${it.id}" ${can ? '' : 'disabled'}>${maxed ? 'Ausgebaut' : `${lv ? 'Stufe ' + ROMAN[lv] : 'Kaufen'} · ${crystalHtml(cost)}`}</button>
    </div>`;
  }).join('');
}
function buy(id) {
  const it = SHOP.find((s) => s.id === id);
  if (!it) return;
  const lv = shopLv(id), cost = shopCost(it, lv);
  if (lv >= it.max || save.crystals < cost) return;
  save.crystals -= cost;
  save.shop[id] = lv + 1;
  persist();
  Sound.init();
  Sound.buy();
  renderShop();
  renderMenu();
  if (state === 'over') $('#nextGoal').textContent = nextGoalText();
  const again = $(`[data-buy="${id}"]`);
  if (again && !again.disabled) again.focus({ preventScroll: true });
  else moveFocus(0);
}

function renderAch() {
  const done = ACHIEVEMENTS.filter((a) => save.ach[a.id]).length;
  $('#achProgress').textContent = `${done} von ${ACHIEVEMENTS.length} freigeschaltet`;
  $('#achList').innerHTML = ACHIEVEMENTS.map((a) => {
    const ok = !!save.ach[a.id];
    return `<li class="ach${ok ? ' done' : ''}"><span class="ach-icon">${ok ? ICONS.check : ICONS.trophy}</span><span class="ach-text"><b>${a.name}</b><span>${a.desc}</span></span><span class="ach-reward">${ok ? 'Erhalten' : '+' + a.reward}</span></li>`;
  }).join('');
}

function panelOpen() { return !ui.shop.hidden || !ui.ach.hidden; }
function openShop(from) {
  shopReturn = from;
  renderShop();
  ui.shop.hidden = false;
  ui.shop.scrollTop = 0;
  Sound.init();
  Sound.click();
  if (!touchDevice) moveFocus(0);
}
function openAch() {
  renderAch();
  ui.ach.hidden = false;
  ui.ach.scrollTop = 0;
  Sound.init();
  Sound.click();
  if (!touchDevice) moveFocus(0);
}
function closePanels() {
  const wasOpen = panelOpen();
  ui.shop.hidden = true;
  ui.ach.hidden = true;
  if (!wasOpen) return;
  renderMenu();
  if (!touchDevice) {
    const target = state === 'over' ? $('#btnAgain') : $('#btnPlay');
    if (target && target.offsetParent) target.focus({ preventScroll: true });
  }
}
function toMenu() {
  state = 'menu';
  run = null;
  for (const k of ['levelup', 'pause', 'over', 'shop', 'ach']) ui[k].hidden = true;
  ui.hud.hidden = true;
  ui.menu.hidden = false;
  renderMenu();
  Sound.click();
  if (!touchDevice) $('#btnPlay').focus({ preventScroll: true });
}

// buttons
$('#btnPlay').addEventListener('click', startRun);
$('#btnShop').addEventListener('click', () => openShop('menu'));
$('#btnAch').addEventListener('click', openAch);
$('#btnShopBack').addEventListener('click', () => { Sound.click(); closePanels(); });
$('#btnAchBack').addEventListener('click', () => { Sound.click(); closePanels(); });
$('#btnPause').innerHTML = ICONS.pause;
$('#btnPause').addEventListener('click', pauseGame);
$('#btnResume').addEventListener('click', resumeGame);
$('#btnQuit').addEventListener('click', quitRun);
$('#btnAgain').addEventListener('click', () => { if (performance.now() - overOpenT > 600) startRun(); });
$('#btnOverShop').addEventListener('click', () => openShop('over'));
$('#btnOverMenu').addEventListener('click', toMenu);
ui.reroll.addEventListener('click', reroll);
ui.cards.addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (c) choose(+c.dataset.i, e.detail === 0); // detail 0 = keyboard/gamepad activation
});
$('#shopGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-buy]');
  if (b) buy(b.dataset.buy);
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle]');
  if (!t) return;
  const k = t.dataset.toggle;
  save.settings[k] = !save.settings[k];
  persist();
  Sound.init();
  Sound.applySettings();
  renderToggles();
  const again = t.closest('.screen') && t.closest('.screen').querySelector(`[data-toggle="${k}"]`);
  if (again && e.detail === 0) again.focus({ preventScroll: true });
});
ui.dash.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state === 'play') run.dashReq = true;
});

// ============================================================ Main loop
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  pollGamepad();
  if (state === 'play' && run) {
    const r = run;
    if (r.slowT > 0) { r.slowT -= realDt; r.timeScale = r.slowT > 0 ? 0.3 : 1; }
    if (r.dying > 0) {
      r.timeScale = 0.35;
      r.dying -= realDt;
      if (r.dying <= 0) endRun(false);
    }
    if (state === 'play') {
      const dt = realDt * r.timeScale;
      const steps = Math.min(3, Math.max(1, Math.ceil(dt * 60 - 0.01)));
      for (let i = 0; i < steps && state === 'play'; i++) update(dt / steps);
      const ck = 1 - Math.exp(-realDt * 9);
      cam.x = lerp(cam.x, player.x, ck);
      cam.y = lerp(cam.y, player.y, ck);
      updateHud();
    }
    if (bannerT > 0) { bannerT -= realDt; if (bannerT <= 0) ui.banner.hidden = true; }
    if (hintT > 0) {
      hintT -= realDt;
      if (hintT < 0.7) ui.hint.classList.add('fade');
      if (hintT <= 0) ui.hint.hidden = true;
    }
  }
  render(now, realDt);
}

// ============================================================ Boot
resize();
addEventListener('resize', resize);
renderToggles();
renderMenu();
requestAnimationFrame(frame);

// Small hook for automated smoke tests; harmless for players.
window.__prisma = {
  get state() { return state; },
  get run() { return run; },
  get counts() { return { enemies: enemies.length, bullets: bullets.length, gems: gems.length, parts: parts.length, fx: fx.length }; },
  // steer(player, enemies, gems) -> [x, y, dash] lets a test bot drive the prism
  simulate(seconds, autoPick = true, steer = null) {
    const dt = 1 / 60;
    for (let i = 0; i < seconds * 60; i++) {
      if (state === 'levelup' && autoPick) { run.luOpenT = 0; choose((Math.random() * run.choices.length) | 0, true); }
      if (state !== 'play' || run.dying) break;
      if (steer) { const v = steer(player, enemies, gems); pad.x = v[0]; pad.y = v[1]; if (v[2]) run.dashReq = true; }
      update(dt);
    }
    pad.x = pad.y = 0;
    return run && run.dying ? 'dying' : state;
  },
};
})();
