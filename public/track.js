/* Трасса тараканьих бегов: кольцевой стадион с трибунами, всё рисуем на canvas, без картинок. */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PAL = {
    tileA: '#e4dccb',
    tileB: '#cfc3aa',
    grout: 'rgba(60, 48, 30, 0.10)',
    gate: '#214437',
    gateText: '#eef0e6',
    ink: '#16302a',
    you: 'rgba(240, 180, 41, 0.28)',
    leg: '#2e1c11',
    wing: '#6a3d22',
    wingDark: '#3f2414',
    pronotum: '#7b4a2a',
    rim: '#b07b4c',
    head: '#2b190e',
    stands: '#e7e2d4',
  };

  const MEDALS = { 1: '#f0b429', 2: '#c9ced3', 3: '#c98b4e' };
  const FAN_COLORS = ['#d64532', '#2f6fde', '#e3a512', '#2f9e63', '#8d4bc4', '#e2702c', '#14a0a0', '#d6457a', '#c0607a', '#5a8f3a'];

  // ---------- Таракан ----------
  // cx, cy - центр тела, смотрит вправо. phase - фаза шага, twitch - фаза усов.
  function drawRoach(ctx, cx, cy, opts) {
    const o = Object.assign({ color: '#d64532', number: '', phase: 0, twitch: 0, scale: 1, moving: 0 }, opts);
    const bob = o.moving ? Math.sin(o.phase * 2) * 0.6 : 0;

    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.scale(o.scale, o.scale);

    // тень
    ctx.fillStyle = 'rgba(40, 25, 10, 0.18)';
    ctx.beginPath();
    ctx.ellipse(1.5, 3.5, 21, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // лапки: трёхопорная походка (как у настоящих тараканов)
    ctx.strokeStyle = PAL.leg;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const legs = [
      { x: 8, side: -1, ph: 0, reach: 7 },
      { x: 1, side: -1, ph: Math.PI, reach: 0 },
      { x: -7, side: -1, ph: 0, reach: -9 },
      { x: 8, side: 1, ph: Math.PI, reach: 7 },
      { x: 1, side: 1, ph: 0, reach: 0 },
      { x: -7, side: 1, ph: Math.PI, reach: -9 },
    ];
    for (const g of legs) {
      const s = Math.sin(o.phase + g.ph);
      const lift = Math.max(0, Math.cos(o.phase + g.ph)) * 1.5;
      const kx = g.x + g.reach * 0.6 + s * 4;
      const ky = g.side * (10 - lift);
      const fx = kx + g.reach * 0.9 + s * 3;
      const fy = g.side * (17 - lift);
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(g.x, g.side * 3);
      ctx.lineTo(kx, ky);
      ctx.stroke();
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }

    // усы
    const w = Math.sin(o.twitch) * 2.2;
    const w2 = Math.sin(o.twitch * 1.3 + 1) * 2.2;
    ctx.lineWidth = 1;
    ctx.strokeStyle = PAL.leg;
    ctx.beginPath();
    ctx.moveTo(18, -2);
    ctx.quadraticCurveTo(30, -4 + w, 41, -13 + w);
    ctx.moveTo(18, 2);
    ctx.quadraticCurveTo(30, 4 + w2, 41, 13 + w2);
    ctx.stroke();

    // крылья (брюшко)
    const g = ctx.createLinearGradient(0, -8, 0, 8);
    g.addColorStop(0, PAL.wing);
    g.addColorStop(0.5, '#7d4a2b');
    g.addColorStop(1, PAL.wingDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-4, 0, 16, 8.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // попона с номером - как у скаковой лошади
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-4, 0, 16, 8.2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = o.color;
    ctx.fillRect(-12, -9, 11, 18);
    ctx.restore();

    // шов между крыльями
    ctx.strokeStyle = 'rgba(30, 15, 5, 0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-19, 0);
    ctx.stroke();

    // номер
    if (o.number !== '') {
      ctx.fillStyle = '#fff';
      ctx.font = '700 8px "Unbounded", "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(o.number), -6.5, 0.5);
    }

    // блик
    ctx.fillStyle = 'rgba(255, 240, 220, 0.22)';
    ctx.beginPath();
    ctx.ellipse(-1, -4, 9, 2.2, -0.08, 0, Math.PI * 2);
    ctx.fill();

    // переднеспинка
    ctx.fillStyle = PAL.rim;
    ctx.beginPath();
    ctx.ellipse(11, 0, 6.6, 7.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.pronotum;
    ctx.beginPath();
    ctx.ellipse(10.4, 0, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // голова
    ctx.fillStyle = PAL.head;
    ctx.beginPath();
    ctx.ellipse(17, 0, 3.4, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // =====================================================================
  // ЗРИТЕЛИ: тараканы во весь рост (вид спереди), с суставами на кинематике
  // =====================================================================
  const TAU = Math.PI * 2;

  // Оттенки тараканов: рыжий прусак, тёмный чёрный, красноватый американский
  const BODY_TONES = [
    { wing: '#5a3219', wingHi: '#8a5530', belly: '#8d5a33', bellyHi: '#b07a4a', seg: '#6b4023', rim: '#c08a55', pron: '#7a4826', pronDark: '#3e2210', head: '#2b170b', leg: '#3a2213' },
    { wing: '#3b2315', wingHi: '#654028', belly: '#6e4529', bellyHi: '#8f6340', seg: '#4f3019', rim: '#a5774a', pron: '#5c3920', pronDark: '#2a170b', head: '#1f1209', leg: '#2a180d' },
    { wing: '#6e3a1c', wingHi: '#a2602f', belly: '#a2683a', bellyHi: '#c98d55', seg: '#7b4a26', rim: '#d39a60', pron: '#8a5229', pronDark: '#4a2811', head: '#33190b', leg: '#43260f' },
  ];

  const HAT_COLORS = [['#d64532', '#fbfaf5'], ['#2f6fde', '#fbfaf5'], ['#e3a512', '#d64532'], ['#2f9e63', '#fbfaf5'], ['#8d4bc4', '#e3a512']];
  const CHEER = { skirt: '#d64532', trim: '#fbfaf5', pom: '#e09a12', pom2: '#ffd04a', bow: '#d64532' };
  const CONFETTI = ['#f0b429', '#d64532', '#fbfaf5', '#2f6fde', '#2f9e63', '#d6457a'];

  // Гардероб болельщиков
  const OUTFITS = ['tee', 'jersey', 'stripes', 'tracksuit', 'tie', 'dress', 'robe', 'antitapok', 'suit', null];
  const CLOTH = ['#d64532', '#2f6fde', '#e3a512', '#2f9e63', '#8d4bc4', '#e2702c', '#14a0a0', '#d6457a', '#3b4a6b', '#f2f0e6', '#7a8f3a'];
  const DOTS = [[-5, -8], [1, -10], [5, -5], [-2, -3], [-7, 2], [3, 1], [8, 6], [-4, 8], [1, 10], [-10, 9], [11, 11]];

  const BANNERS_TOP = ['ЖМИ НА КЛАВИШИ!', 'УСЫ ВПЕРЁД!', 'ВАСИЛИЙ, ЖГИ!', 'ЗА КРОШКУ!'];
  const BANNERS_BOTTOM = ['МАМА, Я НА ТВ', 'БЕЗ ОПЕЧАТОК!', 'ТАПКИ ПРОЧЬ', 'ДИХЛОФОС НЕ ПРОЙДЁТ'];

  // затемнение (k < 0) или осветление (k > 0) цвета
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const to = k < 0 ? 0 : 255;
    const a = Math.abs(k);
    const ch = (v) => Math.round(v + (to - v) * a);
    const r = ch((n >> 16) & 255);
    const g = ch((n >> 8) & 255);
    const b = ch(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function shadePal(p, k) {
    const o = {};
    for (const key of Object.keys(p)) o[key] = shade(p[key], k);
    return o;
  }

  // воспроизводимый генератор, чтобы толпа не перемешивалась при каждом ресайзе
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Двухзвенная кинематика: плечо S, цель T, локоть выгибаем наружу (side)
  function ik(sx, sy, tx, ty, l1, l2, side) {
    let dx = tx - sx;
    let dy = ty - sy;
    let d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.05;
    if (d > max) {
      tx = sx + (dx / d) * max;
      ty = sy + (dy / d) * max;
      dx = tx - sx;
      dy = ty - sy;
      d = max;
    }
    d = Math.max(d, 0.5);
    const th = Math.atan2(dy, dx);
    const al = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const e1x = sx + Math.cos(th + al) * l1;
    const e2x = sx + Math.cos(th - al) * l1;
    const useFirst = e1x * side > e2x * side;
    const a = useFirst ? th + al : th - al;
    return { ex: sx + Math.cos(a) * l1, ey: sy + Math.sin(a) * l1, hx: tx, hy: ty };
  }

  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    ctx.fill();
  }

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // шипики на голенях - главный признак, что это таракан, а не человечек
  function spines(ctx, segs) {
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const [ax, ay, bx, by, side] of segs) {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      let nx = -uy;
      let ny = ux;
      if (nx * side < 0) {
        nx = -nx;
        ny = -ny;
      }
      for (const k of [0.35, 0.7]) {
        const px = ax + dx * k;
        const py = ay + dy * k;
        ctx.moveTo(px, py);
        ctx.lineTo(px + nx * 2.3 + ux * 0.9, py + ny * 2.3 + uy * 0.9);
      }
    }
    ctx.stroke();
  }

  const FEET = [{ x: -8, y: 0 }, { x: 8, y: 0 }];
  const MID_PRESETS = {
    hips: [{ x: -10.5, y: 5 }, { x: 10.5, y: 5 }],
    out: [{ x: -19, y: 1 }, { x: 19, y: 1 }],
    up: [{ x: -16, y: -12 }, { x: 16, y: -12 }],
    down: [{ x: -12.5, y: 10 }, { x: 12.5, y: 10 }],
  };

  function drawPom(ctx, x, y, c1, c2, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.arc(0, 0, 4.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = c2;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const r = 5 + (i % 3) * 0.7;
      ctx.moveTo(Math.cos(a) * 1.8, Math.sin(a) * 1.8);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawFlag(ctx, x, y, color, wave) {
    const top = y - 19;
    ctx.strokeStyle = '#d8c7a5';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x, top);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.quadraticCurveTo(x + 7, top + wave * 1.6, x + 13.5, top + 3.6 + wave);
    ctx.quadraticCurveTo(x + 6.5, top + 5.2 - wave, x, top + 7.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(x, top + 3);
    ctx.quadraticCurveTo(x + 5, top + 3.4 + wave * 0.6, x + 9, top + 3.9 + wave * 0.7);
    ctx.lineTo(x, top + 4.6);
    ctx.closePath();
    ctx.fill();
  }

  function drawMic(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.45, 1.45);
    ctx.translate(-x, -y);
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.lineTo(x + 2.5, y - 6);
    ctx.stroke();
    ctx.fillStyle = '#d64532';
    ctx.fillRect(x + 0.4, y - 6.5, 4.4, 3.2);
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.arc(x + 3.1, y - 9.2, 2.8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 0.6, y - 9.2);
    ctx.lineTo(x + 5.6, y - 9.2);
    ctx.moveTo(x + 3.1, y - 11.8);
    ctx.lineTo(x + 3.1, y - 6.6);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 2.4px "Unbounded", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ТВ', x + 2.6, y - 4.9);
    ctx.restore();
  }

  // ТВ-камера на плече; видоискатель у правого глаза, объектив смотрит вбок
  function drawTvCam(ctx, x, y, tilt, rec) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.fillStyle = '#2b2e31';
    rrect(ctx, -4, -5, 19, 9.5, 2);
    ctx.fill();
    ctx.fillStyle = '#41474d';
    ctx.fillRect(-3, -5, 17, 1.8);
    ctx.strokeStyle = '#2b2e31';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(1, -5);
    ctx.lineTo(1, -8.2);
    ctx.lineTo(10, -8.2);
    ctx.lineTo(10, -5);
    ctx.stroke();
    ctx.fillStyle = '#1b1d1f';
    ctx.fillRect(15, -3.7, 7, 7.4);
    ctx.fillStyle = '#0f1011';
    ctx.fillRect(21.2, -4.6, 2.6, 9.2);
    ctx.fillStyle = '#6fb8e0';
    ell(ctx, 24, 0, 1.1, 3.4);
    ctx.fillStyle = '#1b1d1f';
    ctx.fillRect(-7.5, -3.2, 4, 4.4);
    ctx.fillStyle = '#e8e2d2';
    ctx.font = '700 4.2px "Unbounded", "Arial Black", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('ТВ', 4.5, 2.6);
    if (rec) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(12.4, -2.4, 1.15, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // Одежда поверх брюшка: футболки, тельняшка, олимпийка, платье в горошек, халат...
  function drawOutfit(ctx, acc, by) {
    const o = acc.outfit;
    const c1 = acc.cloth;
    const c2 = acc.cloth2;
    const torso = () => rrect(ctx, -10.8, by - 13.5, 21.6, 21, 4.5);
    const sleeves = (col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(-10.4, by - 10.6, 4.3, 3.2, -0.5, 0, TAU);
      ctx.moveTo(14.7, by - 10.6);
      ctx.ellipse(10.4, by - 10.6, 4.3, 3.2, 0.5, 0, TAU);
      ctx.fill();
    };

    if (o === 'dress') {
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(-8.5, by - 13);
      ctx.lineTo(8.5, by - 13);
      ctx.quadraticCurveTo(12, by, 15.5, by + 13.5);
      ctx.quadraticCurveTo(0, by + 16.5, -15.5, by + 13.5);
      ctx.quadraticCurveTo(-12, by, -8.5, by - 13);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      for (const [dx, dy] of DOTS) {
        ctx.moveTo(dx + 1.1, by + dy);
        ctx.arc(dx, by + dy, 1.1, 0, TAU);
      }
      ctx.fill();
      sleeves(c1);
      ctx.fillStyle = '#fbfaf5';
      ell(ctx, -3, by - 12.6, 3.4, 1.8, 0.3);
      ell(ctx, 3, by - 12.6, 3.4, 1.8, -0.3);
      return;
    }
    if (o === 'robe') {
      // махровый халат с поясом: пришёл болеть прямо из ванной
      ctx.fillStyle = c1;
      rrect(ctx, -11, by - 13.5, 22, 27, 5);
      ctx.fill();
      sleeves(c1);
      ctx.strokeStyle = shade(c1, -0.25);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-6, by - 13.5);
      ctx.lineTo(1.5, by + 13);
      ctx.moveTo(6, by - 13.5);
      ctx.lineTo(0, by - 1);
      ctx.stroke();
      ctx.fillStyle = shade(c1, -0.3);
      ctx.fillRect(-11, by - 1.2, 22, 2.8);
      ell(ctx, 3, by + 0.2, 2, 1.6);
      ctx.fillRect(2.2, by + 1, 1.2, 5);
      ctx.fillRect(4, by + 1, 1.2, 4);
      return;
    }
    if (o === 'vest') {
      // жилет прессы со светоотражающей полосой
      ctx.fillStyle = c1;
      rrect(ctx, -10.8, by - 13, 7.4, 20, 2.5);
      ctx.fill();
      rrect(ctx, 3.4, by - 13, 7.4, 20, 2.5);
      ctx.fill();
      ctx.fillStyle = '#eef4c8';
      ctx.fillRect(-10.8, by - 1.5, 7.4, 1.8);
      ctx.fillRect(3.4, by - 1.5, 7.4, 1.8);
      return;
    }

    // всё «футболочное»
    const base = o === 'tie' || o === 'suit' ? '#eef1f4' : o === 'stripes' ? '#fbfaf5' : c1;
    ctx.fillStyle = base;
    torso();
    ctx.fill();
    sleeves(base);

    if (o === 'stripes') {
      // тельняшка
      ctx.save();
      torso();
      ctx.clip();
      ctx.fillStyle = '#2f5fbf';
      for (let y = by - 12.5; y < by + 8; y += 3.4) ctx.fillRect(-11, y, 22, 1.6);
      ctx.restore();
      ctx.strokeStyle = '#2f5fbf';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-13, by - 11.5);
      ctx.lineTo(-8, by - 9.5);
      ctx.moveTo(13, by - 11.5);
      ctx.lineTo(8, by - 9.5);
      ctx.stroke();
    } else if (o === 'jersey') {
      // игровая майка с номером
      ctx.fillStyle = c2;
      ctx.fillRect(-10.8, by + 3, 21.6, 2);
      ctx.beginPath();
      ctx.moveTo(-4, by - 13.5);
      ctx.lineTo(0, by - 9.5);
      ctx.lineTo(4, by - 13.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c2 === '#f2f0e6' ? '#16302a' : '#fff';
      ctx.font = '800 8px "Unbounded", "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(acc.num), 0, by - 3.5);
    } else if (o === 'tracksuit') {
      // олимпийка: молния, воротник и лампасы
      ctx.strokeStyle = '#fbfaf5';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (const x of [-9, -7.6, 7.6, 9]) {
        ctx.moveTo(x, by - 12);
        ctx.lineTo(x, by + 7);
      }
      ctx.stroke();
      ctx.strokeStyle = shade(c1, -0.4);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, by - 13);
      ctx.lineTo(0, by + 7.5);
      ctx.stroke();
      ctx.fillStyle = shade(c1, -0.2);
      rrect(ctx, -5, by - 14.6, 10, 2.8, 1.2);
      ctx.fill();
    } else if (o === 'tie' || o === 'suit') {
      if (o === 'suit') {
        // пиджак поверх рубашки
        ctx.fillStyle = c1;
        ctx.beginPath();
        ctx.moveTo(-10.8, by - 13.5);
        ctx.lineTo(-3, by - 13.5);
        ctx.lineTo(-1, by + 7.5);
        ctx.lineTo(-10.8, by + 7.5);
        ctx.closePath();
        ctx.moveTo(10.8, by - 13.5);
        ctx.lineTo(3, by - 13.5);
        ctx.lineTo(1, by + 7.5);
        ctx.lineTo(10.8, by + 7.5);
        ctx.closePath();
        ctx.fill();
        sleeves(c1);
      }
      ctx.fillStyle = '#fbfaf5';
      ctx.beginPath();
      ctx.moveTo(-4, by - 13.6);
      ctx.lineTo(0, by - 11.5);
      ctx.lineTo(-1.5, by - 9.5);
      ctx.closePath();
      ctx.moveTo(4, by - 13.6);
      ctx.lineTo(0, by - 11.5);
      ctx.lineTo(1.5, by - 9.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.moveTo(-1.5, by - 12.6);
      ctx.lineTo(1.5, by - 12.6);
      ctx.lineTo(1, by - 10.4);
      ctx.lineTo(2.2, by + 2.5);
      ctx.lineTo(0, by + 5);
      ctx.lineTo(-2.2, by + 2.5);
      ctx.lineTo(-1, by - 10.4);
      ctx.closePath();
      ctx.fill();
    } else if (o === 'antitapok') {
      // футболка «нет тапкам»
      ctx.fillStyle = '#7a4a2a';
      ell(ctx, 0, by - 4, 5.6, 2.4, -0.35);
      ctx.fillStyle = '#c99a6a';
      ell(ctx, 1.2, by - 4.6, 2.6, 1.3, -0.35);
      ctx.strokeStyle = '#d64532';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, by - 4, 6.6, 0, TAU);
      ctx.moveTo(-4.7, by - 8.7);
      ctx.lineTo(4.7, by + 0.7);
      ctx.stroke();
    } else {
      // простая футболка с сердечком
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.moveTo(-4, by - 5);
      ctx.bezierCurveTo(-4, by - 8.5, -8.5, by - 8.5, -8.5, by - 5.8);
      ctx.bezierCurveTo(-8.5, by - 3.5, -5.5, by - 2, -4, by - 0.3);
      ctx.bezierCurveTo(-2.5, by - 2, 0.5, by - 3.5, 0.5, by - 5.8);
      ctx.bezierCurveTo(0.5, by - 8.5, -4, by - 8.5, -4, by - 5);
      ctx.fill();
    }
  }

  // Главный рисовальщик: стоящий таракан. (x, y) - точка между ступнями.
  // pose.hands - цели передних лап относительно плеч (0, py),
  // pose.mids  - цели средних лап относительно брюшка (0, by), или имя пресета,
  // pose.feet  - цели задних лап (на них стоит), координаты от пола.
  function drawStander(ctx, x, y, s, flip, pal, pose, acc, t) {
    const drop = (pose.crouch || 0) * 5;
    const jump = pose.jump || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? -s : s, s);

    // тень остаётся на полу, даже когда таракан подпрыгнул
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ell(ctx, 0, 0.6, Math.max(5, 11.5 - jump * 0.45), 2.4);

    ctx.translate(0, -jump);
    if (pose.sway) ctx.rotate(pose.sway);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const by = -27 + drop;
    const py = -41 + drop;
    const hy = -49 + drop;

    // --- задние ноги ---
    const feet = pose.feet || FEET;
    const legs = [];
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const k = ik(side * 5, by + 12, feet[i].x, feet[i].y, 9.2, 9.2, side);
      legs.push({ side, hx: side * 5, hy: by + 12, k });
    }
    ctx.strokeStyle = pal.leg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const g of legs) {
      ctx.moveTo(g.hx, g.hy);
      ctx.lineTo(g.k.ex, g.k.ey);
    }
    ctx.stroke();
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    for (const g of legs) {
      ctx.moveTo(g.k.ex, g.k.ey);
      ctx.lineTo(g.k.hx, g.k.hy);
    }
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const g of legs) {
      ctx.moveTo(g.k.hx, g.k.hy);
      ctx.lineTo(g.k.hx + g.side * 4.6, g.k.hy + 0.8);
    }
    ctx.stroke();
    if (!acc.simple) spines(ctx, legs.map((g) => [g.k.ex, g.k.ey, g.k.hx, g.k.hy, g.side]));

    // --- церки (хвостовые усики) ---
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2.5, by + 12.5);
    ctx.lineTo(-4.8, by + 16.5);
    ctx.moveTo(2.5, by + 12.5);
    ctx.lineTo(4.8, by + 16.5);
    ctx.stroke();

    // --- туловище: крылья по бокам, брюшко с сегментами ---
    if (acc.simple) {
      ctx.fillStyle = pal.wing;
      ell(ctx, 0, by, 12.2, 15.6);
      ctx.fillStyle = pal.belly;
      ell(ctx, 0, by + 0.6, 9.4, 13.4);
    } else {
      // глянцевый хитин, как у бегунов
      const gw = ctx.createLinearGradient(-12.2, 0, 12.2, 0);
      gw.addColorStop(0, pal.wing);
      gw.addColorStop(0.35, pal.wingHi);
      gw.addColorStop(1, pal.wing);
      ctx.fillStyle = gw;
      ell(ctx, 0, by, 12.2, 15.6);
      const gb = ctx.createLinearGradient(-9.4, by - 10, 9.4, by + 10);
      gb.addColorStop(0, pal.bellyHi);
      gb.addColorStop(1, pal.belly);
      ctx.fillStyle = gb;
      ell(ctx, 0, by + 0.6, 9.4, 13.4);
    }
    ctx.strokeStyle = pal.seg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const yy = by + 8.6 - k * 4.1;
      const w = 8.4 - Math.abs(k - 1.5) * 0.8;
      ctx.moveTo(w, yy);
      ctx.ellipse(0, yy, w, 2.1, 0, 0, Math.PI);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 236, 210, 0.16)';
    ell(ctx, -3.6, by - 5, 2.4, 6.5, 0.25);

    // --- юбочка чирлидерши ---
    if (acc.skirt) {
      ctx.fillStyle = acc.skirt;
      ctx.beginPath();
      ctx.moveTo(-9.6, by + 4);
      ctx.lineTo(9.6, by + 4);
      ctx.lineTo(14, by + 12.5);
      ctx.lineTo(-14, by + 12.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = acc.trim;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-13.6, by + 11.6);
      ctx.lineTo(13.6, by + 11.6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const px of [-5, 0, 5]) {
        ctx.moveTo(px, by + 4.5);
        ctx.lineTo(px * 1.4, by + 11);
      }
      ctx.stroke();
      // топ в цвет юбки
      ctx.fillStyle = acc.skirt;
      rrect(ctx, -8.4, by - 11, 16.8, 5.4, 2.4);
      ctx.fill();
      ctx.fillStyle = acc.trim;
      ctx.fillRect(-8, by - 8.8, 16, 1.2);
    }

    if (acc.outfit) drawOutfit(ctx, acc, by);

    // --- средние лапы ---
    const mids = typeof pose.mids === 'string' ? MID_PRESETS[pose.mids] : pose.mids || MID_PRESETS.hips;
    const marms = [];
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const k = ik(side * 8.6, by - 4, mids[i].x, by + mids[i].y, 7.2, 7.2, side);
      marms.push({ side, sx: side * 8.6, sy: by - 4, k });
    }
    ctx.strokeStyle = pal.leg;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (const g of marms) {
      ctx.moveTo(g.sx, g.sy);
      ctx.lineTo(g.k.ex, g.k.ey);
    }
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (const g of marms) {
      ctx.moveTo(g.k.ex, g.k.ey);
      ctx.lineTo(g.k.hx, g.k.hy);
    }
    ctx.stroke();
    if (!acc.simple) spines(ctx, marms.map((g) => [g.k.ex, g.k.ey, g.k.hx, g.k.hy, g.side]));

    // --- переднеспинка с тёмным рисунком, как у настоящего прусака ---
    ctx.fillStyle = pal.rim;
    ell(ctx, 0, py, 11.6, 6.9);
    ctx.fillStyle = pal.pron;
    ell(ctx, 0, py - 0.4, 9.8, 5.5);
    ctx.fillStyle = pal.pronDark;
    ctx.beginPath();
    ctx.ellipse(-3.3, py - 0.5, 2.9, 2.5, 0, 0, TAU);
    ctx.moveTo(6.2, py - 0.5);
    ctx.ellipse(3.3, py - 0.5, 2.9, 2.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 240, 220, 0.28)';
    ell(ctx, -3.2, py - 3, 3.6, 1.2, -0.15);

    // бабочка
    if (acc.bowtie) {
      ctx.fillStyle = acc.bowtie;
      ctx.beginPath();
      ctx.moveTo(0, py - 4.6);
      ctx.lineTo(-4.4, py - 7);
      ctx.lineTo(-4.4, py - 2.2);
      ctx.closePath();
      ctx.moveTo(0, py - 4.6);
      ctx.lineTo(4.4, py - 7);
      ctx.lineTo(4.4, py - 2.2);
      ctx.closePath();
      ctx.fill();
      ell(ctx, 0, py - 4.6, 1.2, 1.2);
    }

    // --- шарф болельщика ---
    if (acc.scarf) {
      ctx.fillStyle = acc.scarf;
      rrect(ctx, -8.6, py - 5.8, 17.2, 3.9, 1.6);
      ctx.fill();
      ctx.fillStyle = acc.scarf2;
      ctx.fillRect(-4.6, py - 5.8, 2.2, 3.9);
      ctx.fillRect(1.8, py - 5.8, 2.2, 3.9);
      ctx.save();
      ctx.translate(5.2, py - 3.2);
      ctx.rotate(0.22 + Math.sin(t * 4 + (acc.ph || 0)) * 0.14);
      ctx.fillStyle = acc.scarf;
      ctx.fillRect(-1.7, 0, 3.4, 8.6);
      ctx.fillStyle = acc.scarf2;
      ctx.fillRect(-1.7, 3.2, 3.4, 1.8);
      ctx.restore();
    }

    // --- голова ---
    ctx.fillStyle = pal.head;
    ell(ctx, 0, hy, 7, 6.4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ell(ctx, -2.6, hy - 3.4, 2.2, 1.1);

    const look = pose.look || { x: 0, y: 0 };
    const lx = look.x * (flip ? -1 : 1);
    if (pose.blink) {
      ctx.strokeStyle = '#f3ead8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-5.2, hy - 1.2);
      ctx.lineTo(-0.9, hy - 1.2);
      ctx.moveTo(0.9, hy - 1.2);
      ctx.lineTo(5.2, hy - 1.2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fbf6ea';
      ctx.beginPath();
      ctx.ellipse(-3, hy - 1.3, 2.7, 3.1, 0, 0, TAU);
      ctx.moveTo(5.7, hy - 1.3);
      ctx.ellipse(3, hy - 1.3, 2.7, 3.1, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#140a04';
      ctx.beginPath();
      ctx.arc(-3 + lx * 1.15, hy - 1.3 + look.y * 1.2, 1.4, 0, TAU);
      ctx.moveTo(3 + lx * 1.15 + 1.4, hy - 1.3 + look.y * 1.2);
      ctx.arc(3 + lx * 1.15, hy - 1.3 + look.y * 1.2, 1.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-2.5 + lx * 1.15, hy - 2 + look.y * 1.2, 0.5, 0, TAU);
      ctx.moveTo(3.5 + lx * 1.15 + 0.5, hy - 2 + look.y * 1.2);
      ctx.arc(3.5 + lx * 1.15, hy - 2 + look.y * 1.2, 0.5, 0, TAU);
      ctx.fill();
    }
    // рот
    if (pose.mouth === 'open') {
      ctx.fillStyle = '#1a0a05';
      ell(ctx, 0, hy + 3.4, 2.3, 1.9);
      ctx.fillStyle = '#d9506a';
      ell(ctx, 0, hy + 4.3, 1.3, 0.75);
    } else if (pose.mouth === 'o') {
      ctx.strokeStyle = 'rgba(255, 225, 200, 0.7)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, hy + 3.2, 1.1, 0, TAU);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 225, 200, 0.7)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, hy + 1.6, 2.3, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
    }
    // жвальца
    ctx.strokeStyle = pal.leg;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-1.8, hy + 5.4);
    ctx.lineTo(-0.7, hy + 6.7);
    ctx.moveTo(1.8, hy + 5.4);
    ctx.lineTo(0.7, hy + 6.7);
    ctx.stroke();

    // --- очки ---
    if (acc.glasses === 'shades') {
      ctx.fillStyle = '#0d0d0f';
      rrect(ctx, -6.4, hy - 4.2, 5.6, 4.4, 1.8);
      ctx.fill();
      rrect(ctx, 0.8, hy - 4.2, 5.6, 4.4, 1.8);
      ctx.fill();
      ctx.fillRect(-1, hy - 3.4, 2, 0.9);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillRect(-5.3, hy - 3.5, 1.6, 0.8);
      ctx.fillRect(1.9, hy - 3.5, 1.6, 0.8);
    } else if (acc.glasses === 'round') {
      ctx.strokeStyle = '#d9c28a';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(-3, hy - 1.3, 3.4, 0, TAU);
      ctx.moveTo(6.4, hy - 1.3);
      ctx.arc(3, hy - 1.3, 3.4, 0, TAU);
      ctx.moveTo(-0.4, hy - 1.8);
      ctx.lineTo(0.4, hy - 1.8);
      ctx.stroke();
    }

    // --- головной убор ---
    let antY = hy - 5.2;
    if (acc.hat === 'petushok') {
      ctx.fillStyle = acc.hatColor;
      ctx.beginPath();
      ctx.moveTo(-7.2, hy - 3.6);
      ctx.quadraticCurveTo(-3, hy - 15, 1.5, hy - 16.5);
      ctx.quadraticCurveTo(4, hy - 10, 7.2, hy - 3.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = acc.hatColor2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-5.5, hy - 8);
      ctx.lineTo(5.2, hy - 8);
      ctx.moveTo(-3, hy - 12);
      ctx.lineTo(3.6, hy - 12);
      ctx.stroke();
      ctx.fillStyle = acc.hatColor2;
      rrect(ctx, -7.6, hy - 5.4, 15.2, 2.8, 1.2);
      ctx.fill();
      ell(ctx, 1.6, hy - 17.4, 2.5, 2.5);
      antY = hy - 7;
    } else if (acc.hat === 'ushanka') {
      ctx.fillStyle = '#6b5a4a';
      ell(ctx, -7.4, hy, 2.6, 5.2);
      ell(ctx, 7.4, hy, 2.6, 5.2);
      rrect(ctx, -8.6, hy - 11, 17.2, 7.2, 3);
      ctx.fill();
      ctx.fillStyle = '#8a7763';
      rrect(ctx, -7.8, hy - 7, 15.6, 3.2, 1.4);
      ctx.fill();
      antY = hy - 9;
    } else if (acc.hat === 'cap') {
      ctx.fillStyle = acc.hatColor;
      ctx.beginPath();
      ctx.ellipse(0, hy - 3.6, 7.3, 5.4, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = shade(acc.hatColor, -0.3);
      ell(ctx, 0, hy - 3.6, 9, 1.5);
      ctx.fillStyle = acc.hatColor2;
      ell(ctx, 0, hy - 8.8, 1, 0.8);
      antY = hy - 7.5;
    } else if (acc.hat === 'kerchief') {
      // бабушкин платок, узелок под подбородком
      ctx.fillStyle = acc.hatColor;
      ctx.beginPath();
      ctx.moveTo(-7.8, hy + 2);
      ctx.quadraticCurveTo(-8.5, hy - 9.5, 0, hy - 9.8);
      ctx.quadraticCurveTo(8.5, hy - 9.5, 7.8, hy + 2);
      ctx.quadraticCurveTo(6.4, hy - 4, 0, hy - 5.4);
      ctx.quadraticCurveTo(-6.4, hy - 4, -7.8, hy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1.5, hy + 5.6);
      ctx.lineTo(-4.5, hy + 9);
      ctx.lineTo(-0.5, hy + 8);
      ctx.moveTo(1.5, hy + 5.6);
      ctx.lineTo(4.5, hy + 9);
      ctx.lineTo(0.5, hy + 8);
      ctx.fill();
      ctx.fillStyle = acc.hatColor2;
      ctx.beginPath();
      for (const [dx, dy] of [[-4.5, -5.5], [0, -8], [4.5, -5.5], [-6, -1], [6, -1]]) {
        ctx.moveTo(dx + 0.9, hy + dy);
        ctx.arc(dx, hy + dy, 0.9, 0, TAU);
      }
      ctx.fill();
      antY = hy - 8;
    } else if (acc.hat === 'beret') {
      ctx.fillStyle = acc.hatColor;
      ell(ctx, -1.2, hy - 5.6, 8.6, 3.2, -0.18);
      ctx.fillStyle = shade(acc.hatColor, -0.3);
      ctx.fillRect(-0.6, hy - 10.2, 1.4, 2);
      antY = hy - 7;
    } else if (acc.bow) {
      ctx.fillStyle = acc.bow;
      ctx.beginPath();
      ctx.moveTo(0, hy - 6.5);
      ctx.lineTo(-5.4, hy - 9.6);
      ctx.lineTo(-5.4, hy - 3.6);
      ctx.closePath();
      ctx.moveTo(0, hy - 6.5);
      ctx.lineTo(5.4, hy - 9.6);
      ctx.lineTo(5.4, hy - 3.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(acc.bow, -0.25);
      ell(ctx, 0, hy - 6.5, 1.5, 1.5);
    }

    // --- усы: длинные, пружинят и подрагивают ---
    const tw = pose.twitch || 0;
    ctx.strokeStyle = pal.leg;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const sw = Math.sin(tw * 1.3 + side * 0.9) * 2.8;
      const sw2 = Math.cos(tw * 0.9 + side) * 1.6;
      ctx.moveTo(side * 2.3, antY);
      ctx.bezierCurveTo(side * 1.4, antY - 14, side * (9 + sw * 0.6), antY - 29 + sw2, side * (19 + sw), antY - 23 + sw2 * 1.5);
    }
    ctx.stroke();

    // --- передние лапы (руки) ---
    const hands = pose.hands || [{ x: -14, y: 10 }, { x: 14, y: 10 }];
    const arms = [];
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const k = ik(side * 9.6, py - 0.5, hands[i].x, py + hands[i].y, 9.6, 9.6, side);
      arms.push({ side, sx: side * 9.6, sy: py - 0.5, k });
    }
    ctx.strokeStyle = pal.leg;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (const g of arms) {
      ctx.moveTo(g.sx, g.sy);
      ctx.lineTo(g.k.ex, g.k.ey);
    }
    ctx.stroke();
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    for (const g of arms) {
      ctx.moveTo(g.k.ex, g.k.ey);
      ctx.lineTo(g.k.hx, g.k.hy);
    }
    ctx.stroke();
    if (!acc.simple) spines(ctx, arms.map((g) => [g.k.ex, g.k.ey, g.k.hx, g.k.hy, g.side]));
    // коготки
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const g of arms) {
      const dx = g.k.hx - g.k.ex;
      const dy = g.k.hy - g.k.ey;
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l;
      const uy = dy / l;
      ctx.moveTo(g.k.hx, g.k.hy);
      ctx.lineTo(g.k.hx + ux * 2.4 - uy * 1.4, g.k.hy + uy * 2.4 + ux * 1.4);
      ctx.moveTo(g.k.hx, g.k.hy);
      ctx.lineTo(g.k.hx + ux * 2.4 + uy * 1.4, g.k.hy + uy * 2.4 - ux * 1.4);
    }
    ctx.stroke();

    // --- что в лапах ---
    const L = arms[0].k;
    const R = arms[1].k;
    if (acc.pom) {
      drawPom(ctx, L.hx, L.hy, acc.pom, acc.pom2, t * 11);
      drawPom(ctx, R.hx, R.hy, acc.pom, acc.pom2, -t * 11);
    }
    if (acc.flag) drawFlag(ctx, R.hx, R.hy, acc.flag, Math.sin(t * 7 + (acc.ph || 0)));
    if (acc.mic) drawMic(ctx, R.hx, R.hy);
    if (acc.snack && !(pose.mouth === 'open')) {
      ctx.fillStyle = '#d9b27a';
      ell(ctx, (L.hx + R.hx) / 2, (L.hy + R.hy) / 2 - 1, 4.2, 3.2, 0.3);
      ctx.fillStyle = '#b8874c';
      ell(ctx, (L.hx + R.hx) / 2 + 1, (L.hy + R.hy) / 2 - 2, 1.4, 0.9);
    }
    if (acc.cam === 'tv') drawTvCam(ctx, 6.5, hy - 1.2, pose.camTilt || 0, Math.sin(t * 6) > 0);
    if (acc.cam === 'photo') {
      ctx.fillStyle = '#2b2e31';
      rrect(ctx, -7.6, hy - 5.8, 15.2, 9.6, 2);
      ctx.fill();
      ctx.fillStyle = '#41474d';
      ctx.fillRect(-6.8, hy - 5.8, 13.6, 1.6);
      ctx.fillStyle = '#1b1d1f';
      ell(ctx, 0, hy - 0.8, 3.9, 3.9);
      ctx.fillStyle = '#6fb8e0';
      ell(ctx, 0, hy - 0.8, 2.2, 2.2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ell(ctx, -0.8, hy - 1.7, 0.7, 0.7);
      ctx.fillStyle = '#d9d9d9';
      ctx.fillRect(2.4, hy - 10, 5.2, 4.2);
      ctx.fillStyle = pose.flash ? '#ffffff' : '#f6f0c8';
      ctx.fillRect(3, hy - 9.4, 4, 2.2);
    }

    ctx.restore();
  }

  // ---------- Хореография ----------
  // Чирлидерши танцуют синхронно: 4 фразы по 8 счётов, одна из них - волна.
  function cheerPose(t, i, mode, look) {
    const bps = mode === 'idle' ? 1.1 : 2.2;
    const beat = t * bps;
    const phrase = mode === 'idle' || mode === 'ready' ? 0 : mode === 'celebrate' ? 3 : Math.floor(beat / 8) % 4;
    const b = beat % 8;
    const bi = Math.floor(b);
    const fr = b - bi;
    const pulse = Math.sin(fr * Math.PI);
    const pose = { look, mids: 'hips', mouth: 'smile', twitch: t * 6 + i * 0.2, jump: 0, sway: 0 };
    const lerp = (a, c, k) => a + (c - a) * k;

    if (phrase === 0) {
      // «V» на счёт, руки вниз-в-стороны на следующий
      const k = (Math.cos(beat * Math.PI) + 1) / 2;
      const amp = mode === 'idle' ? 0.5 : 1;
      pose.hands = [
        { x: lerp(-19, -21, k), y: lerp(10, -14, k * amp) },
        { x: lerp(19, 21, k), y: lerp(10, -14, k * amp) },
      ];
      pose.jump = pulse * (mode === 'idle' ? 1 : 3);
      pose.sway = Math.sin(beat * Math.PI) * 0.05;
    } else if (phrase === 1) {
      // канкан: махи ногами по очереди, руки в стороны
      const kick = bi % 2 ? 1 : -1;
      const lift = pulse;
      pose.hands = [{ x: -25, y: 0 }, { x: 25, y: 0 }];
      pose.feet = kick < 0
        ? [{ x: -8 - 14 * lift, y: -21 * lift }, { x: 8, y: 0 }]
        : [{ x: -8, y: 0 }, { x: 8 + 14 * lift, y: -21 * lift }];
      pose.sway = -kick * 0.09 * lift;
      pose.mouth = lift > 0.7 ? 'open' : 'smile';
    } else if (phrase === 2) {
      // волна вдоль шеренги
      const w = Math.max(0, Math.sin(TAU * (beat / 4) - i * 0.55));
      pose.hands = [
        { x: lerp(-14, -11, w), y: lerp(11, -17, w) },
        { x: lerp(14, 11, w), y: lerp(11, -17, w) },
      ];
      pose.jump = w * 10;
      pose.mids = w > 0.5 ? 'out' : 'hips';
      pose.mouth = w > 0.6 ? 'open' : 'smile';
    } else {
      // хлопки над головой, потом общий прыжок «звездой»
      if (bi < 6) {
        pose.hands = [
          { x: lerp(-17, -4, pulse), y: lerp(-12, -18.5, pulse) },
          { x: lerp(17, 4, pulse), y: lerp(-12, -18.5, pulse) },
        ];
        pose.jump = pulse * 2;
      } else {
        const k = Math.sin(((b - 6) / 2) * Math.PI);
        pose.jump = k * 15;
        pose.hands = [{ x: -22, y: -14 }, { x: 22, y: -14 }];
        pose.feet = [{ x: -8 - 9 * k, y: -6 * k }, { x: 8 + 9 * k, y: -6 * k }];
        pose.mids = 'out';
        pose.mouth = 'open';
      }
    }
    return pose;
  }

  // ---------- Трасса (кольцо) ----------
  class Track {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.racers = new Map();
      this.order = [];
      this.youId = null;
      this.textLen = 1;
      this.cssW = 0;
      this.cssH = 0;
      this.dpr = 1;
      this.tilePattern = null;
      this.loops = [];
      this.boundInsets = [];
      this.ring = null; // HTML-панель в центре кольца; её inset выставляем по геометрии
      this.phase = 'waiting';
      this.boost = 0;
      this.crowd = { figs: [], clusters: [], banners: [], press: null };
      this.flashes = [];
      this.confetti = [];
      this.leader = null;
      this.last = performance.now();
      this.resize(true);
      window.addEventListener('resize', () => this.resize(true));
      // шрифты подгрузились - перемеряем ширину транспарантов
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.buildCrowd());
      requestAnimationFrame((t) => this.frame(t));
    }

    get narrow() {
      return this.cssW < 560;
    }

    layout() {
      const W = this.cssW;
      const H = this.cssH;
      const narrow = this.narrow;
      const side = narrow ? 8 : 14; // боковые стенки
      // трибуны сверху и снизу: на высоком экране выше и тараканы крупнее,
      // на низком ноутбуке скромнее, чтобы не съесть место под текст
      const standH = narrow ? 56 : Math.round(Math.min(104, Math.max(66, H * 0.115)));
      const standTop = standH;
      const standBottom = standH;
      const ox = side;
      const oy = standTop;
      const ow = W - 2 * side;
      const oh = Math.max(160, H - standTop - standBottom);
      const lanes = Math.max(3, this.order.length);
      const minSide = Math.min(ow, oh);
      const band = narrow
        ? Math.min(Math.max(48, minSide * 0.17), 92)
        : Math.min(Math.max(90, minSide * 0.16), 140);
      const edge = narrow ? 8 : 12; // от края трассы до первой дорожки
      const laneSpan = Math.max(1, band - edge - 6);
      const gap = laneSpan / lanes;
      const corner = narrow ? 22 : 46;
      const roachScale = narrow ? 0.62 : 1.0;
      const crowdScale = narrow ? 0.6 : standH / 90;
      return { W, H, narrow, side, standTop, standBottom, ox, oy, ow, oh, lanes, band, edge, gap, corner, roachScale, crowdScale, cx: W / 2, cy: oy + oh / 2 };
    }

    // Замкнутая дорожка - скруглённый прямоугольник на расстоянии d от внешнего края трассы.
    // at(f) по доле пути [0..1) даёт точку и угол направления движения (ПО ЧАСОВОЙ,
    // старт в середине ВЕРХНЕЙ стороны, таракан сперва бежит вправо).
    makeLoop(d, L) {
      const x = L.ox + d;
      const y = L.oy + d;
      const w = L.ow - 2 * d;
      const h = L.oh - 2 * d;
      const r = Math.max(6, Math.min(L.corner, Math.min(w, h) / 2 - 2));
      const segs = [];
      const straight = (ax, ay, bx, by) => {
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 0.0001;
        segs.push({ len, pt: (dd) => ({ x: ax + dx * (dd / len), y: ay + dy * (dd / len) }) });
      };
      const arc = (cx, cy, a0, a1) => {
        const len = Math.abs(a1 - a0) * r || 0.0001;
        segs.push({
          len,
          pt: (dd) => {
            const a = a0 + (a1 - a0) * (dd / len);
            return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
          },
        });
      };
      straight(x + r, y, x + w - r, y); // верх, вправо
      arc(x + w - r, y + r, -Math.PI / 2, 0);
      straight(x + w, y + r, x + w, y + h - r); // право, вниз
      arc(x + w - r, y + h - r, 0, Math.PI / 2);
      straight(x + w - r, y + h, x + r, y + h); // низ, влево
      arc(x + r, y + h - r, Math.PI / 2, Math.PI);
      straight(x, y + h - r, x, y + r); // лево, вверх
      arc(x + r, y + r, Math.PI, 1.5 * Math.PI);

      const total = segs.reduce((sum, g) => sum + g.len, 0) || 1;
      const startDist = Math.max(0, w / 2 - r); // f = 0 в середине верхней стороны
      const raw = (dist) => {
        let dd = ((dist % total) + total) % total;
        for (const g of segs) {
          if (dd <= g.len) return g.pt(dd);
          dd -= g.len;
        }
        const last = segs[segs.length - 1];
        return last.pt(last.len);
      };
      return {
        len: total,
        rect: { x, y, w, h, r },
        at: (f) => {
          const base = startDist + f * total;
          const p = raw(base);
          const p2 = raw(base + 1.4);
          return { x: p.x, y: p.y, angle: Math.atan2(p2.y - p.y, p2.x - p.x) };
        },
      };
    }

    buildLoops() {
      const L = (this._L = this.layout());
      this.loops = [];
      for (let i = 0; i < L.lanes; i++) this.loops.push(this.makeLoop(L.edge + (i + 0.5) * L.gap, L));
      this.boundInsets = [];
      for (let i = 1; i < L.lanes; i++) this.boundInsets.push(L.edge + i * L.gap);
      if (this.ring) {
        const m = L.narrow ? 6 : 14;
        const top = Math.round(L.oy + L.band + m);
        const bottom = Math.round(L.standBottom + L.band + m);
        const sides = Math.round(L.side + L.band + m);
        this.ring.style.inset = `${top}px ${sides}px ${bottom}px ${sides}px`;
      }
    }

    resize(force) {
      const parent = this.canvas.parentElement;
      const w = Math.max(280, Math.floor(parent.clientWidth));
      const h = Math.max(300, Math.floor(parent.clientHeight));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!force && w === this.cssW && h === this.cssH && dpr === this.dpr) return;
      this.cssW = w;
      this.cssH = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.buildPattern(this.narrow ? 16 : 22);
      this.buildLoops();
      this.buildCrowd();
      // трибуны рисуем в две отдельные полосы и обновляем через кадр - так толпа почти не грузит
      const L = this._L;
      if (!this.standTop) {
        this.standTop = document.createElement('canvas');
        this.standBot = document.createElement('canvas');
      }
      this.standBotY = Math.round((L.oy + L.oh) * dpr);
      this.standTop.width = this.canvas.width;
      this.standTop.height = Math.max(1, Math.round(L.oy * dpr));
      this.standBot.width = this.canvas.width;
      this.standBot.height = Math.max(1, this.canvas.height - this.standBotY);
      this.crowdFresh = false;
    }

    buildPattern(size) {
      const s = Math.round(size * this.dpr);
      const off = document.createElement('canvas');
      off.width = s * 2;
      off.height = s * 2;
      const c = off.getContext('2d');
      c.fillStyle = PAL.tileA;
      c.fillRect(0, 0, s * 2, s * 2);
      c.fillStyle = PAL.tileB;
      c.fillRect(s, 0, s, s);
      c.fillRect(0, s, s, s);
      c.strokeStyle = PAL.grout;
      c.lineWidth = 1;
      c.strokeRect(0.5, 0.5, s, s);
      c.strokeRect(s + 0.5, s + 0.5, s, s);
      this.tilePattern = this.ctx.createPattern(off, 'repeat');
    }

    // ---------- Расстановка толпы (только при смене размера) ----------
    buildCrowd() {
      const L = this.layout();
      const s = L.crowdScale;
      const rnd = rng(20261004 + Math.round(L.W / 40));
      const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
      const ctx = this.ctx;
      const figs = [];
      const clusters = [];
      const banners = [];

      const topY = L.oy - 5 * s;
      const botY = L.H - 6 * s;

      // чирлидерши по центру верхней трибуны, прямо над стартом-финишем
      const cheerN = 8;
      const cheerGap = 30 * s;
      const cheerW = cheerGap * (cheerN - 1);
      for (let i = 0; i < cheerN; i++) {
        figs.push({ kind: 'cheer', side: 'top', i, x: L.cx - cheerW / 2 + i * cheerGap, y: topY, s: s * 0.97, depth: 0, pal: BODY_TONES[0], acc: CHEER, ph: i * 1.37, blinkPeriod: 3.1 + (i % 3) * 0.8 });
      }
      // фотографы по краям группы поддержки - снимают финиш
      const photoOff = cheerW / 2 + 30 * s;
      for (const side of [-1, 1]) {
        figs.push({ kind: 'photo', side: 'top', x: L.cx + side * photoOff, y: topY, s, depth: 0, flip: side > 0, pal: BODY_TONES[1], acc: { cam: 'photo', hat: 'beret', hatColor: '#1b1d1f', outfit: 'vest', cloth: '#e2702c' }, ph: rnd() * TAU, nextFlash: 1 + rnd() * 3 });
      }

      // пресса внизу по центру: операторы, корреспондент с микрофоном, фотограф
      const pressKinds = L.narrow ? ['tv', 'mic', 'photo'] : ['tv', 'mic', 'photo', 'tv'];
      const pressGap = 31 * s;
      const pressW = pressGap * (pressKinds.length - 1);
      pressKinds.forEach((kind, k) => {
        const acc =
          kind === 'tv' ? { cam: 'tv', hat: 'cap', hatColor: '#2f6fde', hatColor2: '#fbfaf5', outfit: 'vest', cloth: '#2f6fde' }
          : kind === 'mic' ? { mic: true, outfit: 'suit', cloth: '#2b3445', cloth2: '#d64532', glasses: 'round' }
          : { cam: 'photo', hat: 'beret', hatColor: '#1b1d1f', outfit: 'vest', cloth: '#e2702c' };
        figs.push({ kind, side: 'bottom', x: L.cx - pressW / 2 + k * pressGap, y: botY - 2 * s, s, depth: 0, flip: false, pal: BODY_TONES[k % 3], acc, ph: rnd() * TAU, nextFlash: 1 + rnd() * 3 });
      });
      const press = { x: L.cx - pressW / 2 - 16 * s, w: pressW + 32 * s, y: botY - 13 * s, h: 12 * s };

      // кучки болельщиков
      const fill = (x0, x1, y, side, queue, forceFirst) => {
        let x = x0 + rnd() * 8 * s;
        let first = true;
        while (true) {
          let n = L.narrow ? 2 + Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 4);
          let banner = null;
          if (!L.narrow && queue.length && ((first && forceFirst) || (n >= 4 && rnd() < 0.5))) {
            banner = queue.shift();
            n = Math.max(n, 4);
          }
          const spacing = 14 * s;
          let cw = spacing * (n - 1);
          let textW = 0;
          if (banner) {
            ctx.font = `800 ${9 * s}px "Unbounded", "Arial Black", sans-serif`;
            textW = ctx.measureText(banner).width;
            cw = Math.max(cw, textW - 4 * s);
          }
          if (x + cw + 12 * s > x1) break;
          const cl = { cx: x + cw / 2, half: cw / 2 + 12 * s, side, hype: 0, jump: 0, team: clusters.length, ph: rnd() * TAU, banner, textW, holders: [] };
          clusters.push(cl);
          for (let k = 0; k < n; k++) {
            const isEnd = k === 0 || k === n - 1;
            let depth;
            if (banner) depth = isEnd ? 0 : 1;
            else depth = (k % 2 === 1) !== (rnd() < 0.2) ? 1 : 0;
            const fx = banner
              ? (isEnd ? x + (k ? cw : 0) : x + (k / (n - 1)) * cw + (rnd() - 0.5) * 4 * s)
              : x + k * spacing + (rnd() - 0.5) * 4 * s;
            const fs = s * (depth ? 0.86 : 1) * (0.9 + rnd() * 0.16);
            const tone = BODY_TONES[Math.floor(rnd() * BODY_TONES.length)];
            const dark = depth ? -0.28 : 0;
            const hc = pick(HAT_COLORS);
            const outfit = pick(OUTFITS);
            let hat = pick([null, null, 'petushok', 'ushanka', 'cap', 'beret', 'kerchief']);
            if (outfit === 'dress' && rnd() < 0.6) hat = 'kerchief';
            const scarfC = outfit === 'tie' || outfit === 'suit' || outfit === 'robe' ? null : rnd() < 0.45 ? pick(FAN_COLORS) : null;
            const cloth = outfit === 'suit' ? pick(['#2b3445', '#3b4a6b', '#4a3a2f']) : pick(CLOTH);
            let cloth2 = pick(CLOTH);
            if (cloth2 === cloth) cloth2 = '#fbfaf5';
            if (outfit === 'tie' || outfit === 'suit') cloth2 = pick(['#d64532', '#2f6fde', '#e3a512', '#2f9e63']);
            const dk = (c) => (dark ? shade(c, dark) : c);
            const gl = rnd();
            const fig = {
              kind: 'fan',
              side,
              cl,
              x: fx,
              y: depth ? y - 9 * s : y,
              s: fs,
              depth,
              flip: rnd() < 0.5,
              pal: depth ? shadePal(tone, dark) : tone,
              acc: {
                simple: depth === 1,
                hat,
                hatColor: dark ? shade(hc[0], dark) : hc[0],
                hatColor2: dark ? shade(hc[1], dark) : hc[1],
                scarf: scarfC ? (dark ? shade(scarfC, dark) : scarfC) : null,
                scarf2: dark ? shade('#fbfaf5', dark) : '#fbfaf5',
                outfit,
                cloth: dk(cloth),
                cloth2: dk(cloth2),
                num: 1 + Math.floor(rnd() * 99),
                glasses: gl < 0.12 ? 'shades' : gl < 0.22 ? 'round' : null,
                bowtie: outfit !== 'tie' && outfit !== 'suit' && rnd() < 0.08 ? dk(pick(['#d64532', '#2f6fde', '#e3a512'])) : null,
              },
              style: pick(['flag', 'flag', 'clap', 'wave', 'fists', 'cheer', 'snack']),
              mids: pick(['hips', 'hips', 'down', 'out']),
              mouth: pick(['smile', 'smile', 'o']),
              ph: rnd() * TAU,
              blinkPeriod: 2.4 + rnd() * 3.5,
            };
            fig.acc.ph = fig.ph;
            if (banner && isEnd) {
              fig.holder = true;
              fig.style = 'holder';
              fig.flip = false;
              if (fig.acc.hat === 'petushok' || fig.acc.hat === 'ushanka') fig.acc.hat = null; // не протыкать транспарант
              cl.holders.push(fig);
            }
            figs.push(fig);
          }
          if (banner) banners.push(cl);
          x += cw + (L.narrow ? 20 : 40) * s + rnd() * (L.narrow ? 14 : 46) * s;
          first = false;
        }
      };

      const edgePad = L.side + 4 * s;
      const qTop = BANNERS_TOP.slice();
      const qBot = BANNERS_BOTTOM.slice();
      fill(edgePad, L.cx - photoOff - 22 * s, topY, 'top', qTop, false);
      fill(L.cx + photoOff + 22 * s, L.W - edgePad, topY, 'top', qTop, false);
      // «МАМА, Я НА ТВ» встаёт сразу рядом с прессой
      fill(L.cx + press.w / 2 + 10 * s, L.W - edgePad, botY, 'bottom', qBot, true);
      fill(edgePad, L.cx - press.w / 2 - 10 * s, botY, 'bottom', qBot, false);

      // сначала задний ряд, потом передний
      figs.sort((a, b) => b.depth - a.depth || a.x - b.x);
      this.crowd = { figs, clusters, banners, press };
    }

    // players: [{id, nick, color, progress, place, finished}]
    setRace(players, youId, textLen) {
      this.youId = youId;
      this.textLen = Math.max(1, textLen);
      const ids = new Set(players.map((p) => p.id));
      for (const id of [...this.racers.keys()]) if (!ids.has(id)) this.racers.delete(id);
      players.forEach((p, i) => {
        let r = this.racers.get(p.id);
        const isNew = !r;
        if (!r) {
          r = { x: 0, target: 0, phase: Math.random() * 6, twitch: Math.random() * 6, moving: 0, dust: [] };
          this.racers.set(p.id, r);
        }
        const wasPlaced = r.place;
        r.nick = p.nick;
        r.color = p.color;
        r.lane = i;
        r.number = i + 1;
        r.place = p.place;
        r.finished = p.finished;
        r.dnf = p.dnf;
        if (p.id !== youId || p.progress === 0) r.target = Math.min(1, p.progress / this.textLen);
        // кто-то финишировал - трибуны взрываются
        if (!isNew && !wasPlaced && p.place && !p.dnf) this.celebrate(r.place === 1);
      });
      const changed = this.order.length !== players.length;
      this.order = players.map((p) => p.id);
      if (changed) this.buildLoops();
    }

    // состояние заезда влияет на настроение трибун
    setPhase(phase) {
      if (phase === this.phase) return;
      const prev = this.phase;
      this.phase = phase;
      if (phase === 'countdown') this.boost = Math.max(this.boost, 0.5);
      if (phase === 'racing' && prev === 'countdown') {
        this.boost = 0.9;
        this.flashAll();
      }
      if (phase === 'finished') this.boost = 1;
      if (phase === 'waiting') this.confetti = [];
    }

    celebrate(big) {
      this.boost = 1;
      this.flashAll();
      if (reducedMotion) return;
      for (const f of this.crowd.figs) {
        if (f.kind !== 'cheer') continue;
        const n = big ? 9 : 4;
        for (let k = 0; k < n; k++) {
          this.confetti.push({
            x: f.x + (Math.random() - 0.5) * 24 * f.s,
            y: f.y - 58 * f.s,
            vx: (Math.random() - 0.5) * 170,
            vy: -90 - Math.random() * 170,
            rot: Math.random() * TAU,
            vr: (Math.random() - 0.5) * 14,
            life: 2 + Math.random() * 1.2,
            color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
          });
        }
      }
      if (this.confetti.length > 220) this.confetti.splice(0, this.confetti.length - 220);
    }

    flashAll() {
      if (reducedMotion) return;
      for (const f of this.crowd.figs) if (f.kind === 'photo') this.flash(f);
    }

    flash(f) {
      const dir = f.flip ? -1 : 1;
      this.flashes.push({ x: f.x + 5 * f.s * dir, y: f.y - 54 * f.s, life: 1, s: f.s });
      f.flashT = 0.18;
    }

    setProgress(id, progress) {
      const r = this.racers.get(id);
      if (r) r.target = Math.min(1, progress / this.textLen);
    }

    resetPositions() {
      for (const r of this.racers.values()) {
        r.x = 0;
        r.target = 0;
        r.dust = [];
      }
    }

    frame(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.clock = (this.clock || 0) + dt;

      let leader = null;
      for (const r of this.racers.values()) {
        const loop = this.loops[r.lane] || this.loops[0];
        const prev = r.x;
        r.x += (r.target - r.x) * Math.min(1, dt * 7);
        if (Math.abs(r.target - r.x) < 0.0004) r.x = r.target;
        const movedPx = Math.abs(r.x - prev) * (loop ? loop.len : 600);
        r.moving = r.moving * 0.85 + Math.min(1, movedPx / (dt * 60 || 1)) * 0.15;
        r.phase += movedPx * 0.45;
        r.twitch += dt * (2 + r.moving * 10);
        if (loop) {
          const a = loop.at(r.x);
          r.px = a.x;
          r.py = a.y;
        }
        if (!leader || r.x > leader.x) leader = r;

        if (!reducedMotion && loop) {
          if (movedPx > 0.4 && Math.random() < 0.6) {
            const a = loop.at(r.x);
            r.dust.push({
              x: a.x - Math.cos(a.angle) * 16,
              y: a.y - Math.sin(a.angle) * 16,
              life: 1,
              vx: (Math.random() - 0.5) * 26,
              vy: (Math.random() - 0.5) * 26,
            });
            if (r.dust.length > 24) r.dust.shift();
          }
          for (const d of r.dust) {
            d.life -= dt * 2.2;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
          }
          r.dust = r.dust.filter((d) => d.life > 0);
        }
      }
      this.leader = leader;
      this.updateCrowd(dt);
      this.draw();
      requestAnimationFrame((tt) => this.frame(tt));
    }

    // кто рядом пробегает - та кучка и сходит с ума
    updateCrowd(dt) {
      const L = this._L || this.layout();
      const t = this.clock || 0;
      this.boost = Math.max(0, this.boost - dt * 0.35);
      const racing = this.phase === 'racing' || this.phase === 'countdown';
      const topZone = L.oy + L.band + 10;
      const botZone = L.oy + L.oh - L.band - 10;
      const leaderId = this.leader && this.leader.x > 0 ? [...this.racers.entries()].find(([, r]) => r === this.leader)[0] : null;

      for (const c of this.crowd.clusters) {
        let target = this.boost * 0.8;
        if (racing) {
          for (const r of this.racers.values()) {
            if (r.px === undefined) continue;
            const onSide = c.side === 'top' ? r.py < topZone : r.py > botZone;
            if (onSide && Math.abs(r.px - c.cx) < c.half + 70) target = 1;
          }
          const teamId = this.order.length ? this.order[c.team % this.order.length] : null;
          if (teamId && teamId === leaderId) target = Math.max(target, 0.3);
        }
        c.hype += (target - c.hype) * Math.min(1, dt * (target > c.hype ? 6 : 1.5));
        c.jump = reducedMotion ? 0 : Math.max(0, Math.sin(t * (5 + 4 * c.hype) + c.ph)) * (2 + 7 * c.hype);
      }

      for (const f of this.crowd.figs) {
        if (f.kind !== 'photo') continue;
        if (f.flashT) f.flashT = Math.max(0, f.flashT - dt);
        if (reducedMotion || !racing) continue;
        f.nextFlash -= dt;
        if (f.nextFlash <= 0) {
          this.flash(f);
          f.nextFlash = 1.2 + Math.random() * 3.5;
        }
      }

      for (const fl of this.flashes) fl.life -= dt * 3.2;
      this.flashes = this.flashes.filter((fl) => fl.life > 0);

      for (const p of this.confetti) {
        p.vy += 260 * dt;
        p.vx *= 1 - dt * 0.6;
        p.x += p.vx * dt + Math.sin(t * 6 + p.rot) * 0.4;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.life -= dt;
      }
      this.confetti = this.confetti.filter((p) => p.life > 0 && p.y < L.H + 10);
    }

    draw() {
      const L = this._L || this.layout();
      this._L = L;
      const ctx = this.ctx;
      const W = L.W;
      const H = L.H;
      const t = this.clock || 0;

      // толпу перерисовываем «через кадр», а если устройство слабое - реже
      this.crowdTick = (this.crowdTick || 0) + 1;
      const every = (this.crowdCost || 0) > 6 ? 3 : 2;
      if (!this.crowdFresh || this.crowdTick % every === 0) {
        const t0 = performance.now();
        const ct = this.standTop.getContext('2d');
        ct.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.drawStands(L, ct);
        this.drawCrowd(L, reducedMotion ? 0 : t, ct, 'top');
        const cb = this.standBot.getContext('2d');
        cb.setTransform(this.dpr, 0, 0, this.dpr, 0, -this.standBotY);
        this.drawStands(L, cb);
        this.drawCrowd(L, reducedMotion ? 0 : t, cb, 'bottom');
        this.crowdFresh = true;
        this.crowdCost = (this.crowdCost || 0) * 0.9 + (performance.now() - t0) * 0.1;
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = PAL.stands;
      ctx.fillRect(0, L.oy, W, L.oh);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.standTop, 0, 0);
      ctx.drawImage(this.standBot, 0, this.standBotY);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // всё ниже рисуем внутри внешнего скругления трассы
      ctx.save();
      this.roundRect(ctx, L.ox, L.oy, L.ow, L.oh, L.corner + 6);
      ctx.clip();

      ctx.fillStyle = this.tilePattern || PAL.tileA;
      ctx.fillRect(L.ox, L.oy, L.ow, L.oh);

      // подсветка твоей дорожки
      const you = this.racers.get(this.youId);
      if (you && this.loops[you.lane]) {
        const rc = this.loops[you.lane].rect;
        this.roundRect(ctx, rc.x, rc.y, rc.w, rc.h, rc.r);
        ctx.strokeStyle = PAL.you;
        ctx.lineWidth = Math.max(6, L.gap * 0.82);
        ctx.stroke();
      }

      // разделители дорожек
      ctx.strokeStyle = 'rgba(33, 68, 55, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([11, 9]);
      for (const d of this.boundInsets) {
        this.roundRect(ctx, L.ox + d, L.oy + d, L.ow - 2 * d, L.oh - 2 * d, Math.max(6, L.corner - (d - L.edge)));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // поле внутри кольца (сюда ложится панель со счётом и текстом)
      this.roundRect(ctx, L.ox + L.band, L.oy + L.band, L.ow - 2 * L.band, L.oh - 2 * L.band, Math.max(10, L.corner * 0.7));
      ctx.fillStyle = PAL.gate;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // старт/финиш - шахматка поперёк верхней стороны по центру
      const sq = 7;
      const sx = W / 2;
      const yEnd = L.oy + L.band;
      for (let yy = L.oy, row = 0; yy < yEnd; yy += sq, row++) {
        ctx.fillStyle = row % 2 ? '#16302a' : '#fbfaf5';
        ctx.fillRect(sx - 4, yy, 8, Math.min(sq, yEnd - yy));
      }

      ctx.restore();

      // бортик трассы поверх покрытия
      this.roundRect(ctx, L.ox, L.oy, L.ow, L.oh, L.corner + 6);
      ctx.strokeStyle = '#16302a';
      ctx.lineWidth = 4;
      ctx.stroke();

      // тараканы-бегуны
      ctx.textBaseline = 'middle';
      for (const id of this.order) {
        const r = this.racers.get(id);
        if (!r) continue;
        const loop = this.loops[r.lane];
        if (!loop) continue;
        const p = loop.at(r.x);
        const isYou = id === this.youId;

        for (const d of r.dust) {
          ctx.fillStyle = `rgba(120, 100, 70, ${d.life * 0.35})`;
          ctx.beginPath();
          ctx.arc(d.x, d.y, 1.5 + (1 - d.life) * 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        drawRoach(ctx, 0, 0, {
          color: r.color,
          number: r.number,
          phase: r.phase,
          twitch: r.twitch,
          moving: r.moving > 0.05 ? 1 : 0,
          scale: L.roachScale,
        });
        ctx.restore();

        // ник и медаль смещаем к центру поля, чтобы не лезли в трибуны
        const tdx = L.cx - p.x;
        const tdy = L.cy - p.y;
        const tl = Math.hypot(tdx, tdy) || 1;
        const off = L.narrow ? 15 : 21;
        const lx = p.x + (tdx / tl) * off;
        const ly = p.y + (tdy / tl) * off;

        if (!L.narrow) {
          ctx.font = (isYou ? '600 ' : '400 ') + '12px "Golos Text", system-ui, sans-serif';
          ctx.textAlign = 'center';
          const label = this.fit(ctx, isYou ? r.nick + ' (ты)' : r.nick, 120);
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(228, 220, 203, 0.9)';
          ctx.strokeText(label, lx, ly);
          ctx.fillStyle = isYou ? '#16302a' : 'rgba(22, 48, 42, 0.8)';
          ctx.fillText(label, lx, ly);
        }

        if (r.place && !r.dnf) {
          const mx = p.x + (tdx / tl) * (off + 6);
          const my = p.y + (tdy / tl) * (off + 6);
          ctx.fillStyle = MEDALS[r.place] || '#8a9a92';
          ctx.beginPath();
          ctx.arc(mx, my, L.narrow ? 9 : 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PAL.ink;
          ctx.font = '800 11px "Unbounded", "Arial Black", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(r.place), mx, my + 0.5);
        }
      }

      this.drawEffects(L);
    }

    // Трибуны: тёмный фон, скамейки, прожекторная подсветка
    drawStands(L, ctx) {
      const W = L.W;
      const H = L.H;
      ctx.fillStyle = PAL.stands;
      ctx.fillRect(0, 0, W, H);

      const bench = (y, h) => {
        ctx.fillStyle = '#d2cab6';
        ctx.fillRect(0, y, W, h);
        ctx.fillStyle = '#f2eee2';
        ctx.fillRect(0, y, W, 1.5);
      };
      const s = L.crowdScale;
      // верх: задний и передний ряд скамеек (светлые трибуны - тёмные усы видно)
      const gTop = ctx.createLinearGradient(0, 0, 0, L.oy);
      gTop.addColorStop(0, '#d9d3c0');
      gTop.addColorStop(1, '#ece7da');
      ctx.fillStyle = gTop;
      ctx.fillRect(0, 0, W, L.oy);
      bench(L.oy - 14 * s, 4 * s);
      bench(L.oy - 5 * s, 5 * s);
      // низ
      const by0 = L.oy + L.oh;
      const gBot = ctx.createLinearGradient(0, by0, 0, H);
      gBot.addColorStop(0, '#ece7da');
      gBot.addColorStop(1, '#d9d3c0');
      ctx.fillStyle = gBot;
      ctx.fillRect(0, by0, W, H - by0);
      bench(H - 15 * s, 4 * s);
      bench(H - 6 * s, 6 * s);

      // мягкий свет прожектора над стартом
      const spot = ctx.createRadialGradient(L.cx, L.oy * 0.4, 4, L.cx, L.oy * 0.4, Math.max(120, W * 0.18));
      spot.addColorStop(0, 'rgba(255, 214, 120, 0.22)');
      spot.addColorStop(1, 'rgba(255, 214, 120, 0)');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, W, L.oy);
    }

    drawCrowd(L, t, ctx, side) {
      const cheerMode = { waiting: 'idle', countdown: 'ready', racing: 'routine', finished: 'celebrate' }[this.phase] || 'idle';
      // все смотрят на лидера (а до старта - на линию старта)
      const lead = this.leader && this.leader.x > 0 && this.leader.px !== undefined
        ? { x: this.leader.px, y: this.leader.py }
        : { x: L.cx, y: L.oy + L.band / 2 };
      const lookAt = (f) => {
        const hx = f.x;
        const hy = f.y - 50 * f.s;
        return {
          x: Math.max(-1, Math.min(1, (lead.x - hx) / 140)),
          y: Math.max(-1, Math.min(1, (lead.y - hy) / 90)),
        };
      };

      for (const f of this.crowd.figs) {
        if (f.side !== side) continue;
        const look = lookAt(f);
        let pose;
        let flip = f.flip;
        const blink = ((t + f.ph * 3) % (f.blinkPeriod || 4)) < 0.13;

        if (f.kind === 'cheer') {
          pose = cheerPose(t, f.i, cheerMode, look);
          pose.blink = blink && pose.mouth !== 'open';
        } else if (f.kind === 'fan') {
          pose = this.fanPose(f, t, look);
          pose.blink = blink;
        } else if (f.kind === 'tv') {
          // оператор разворачивается за лидером (с запасом, чтобы не дёргался)
          if (lead.x < f.x - 30) f.flip = true;
          else if (lead.x > f.x + 30) f.flip = false;
          flip = f.flip;
          const dx = Math.abs(lead.x - f.x) || 1;
          const tilt = Math.max(-0.45, Math.min(0.35, Math.atan2(lead.y - (f.y - 50 * f.s), dx)));
          pose = {
            look,
            blink: false,
            mids: 'hips',
            hands: [{ x: -13 + Math.sin(t * 2 + f.ph) * 2, y: 10 }, { x: 13, y: -3 }],
            camTilt: tilt * 0.8,
            sway: Math.sin(t * 1.2 + f.ph) * 0.03,
            twitch: t * 3 + f.ph,
            mouth: 'o',
          };
        } else if (f.kind === 'mic') {
          const talking = Math.sin(t * 15 + f.ph) > 0;
          pose = {
            look: { x: 0, y: 0.3 },
            blink,
            mids: 'hips',
            hands: [{ x: -16, y: 2 + Math.sin(t * 4 + f.ph) * 5 }, { x: 16, y: -9 }],
            mouth: talking ? 'open' : 'smile',
            sway: Math.sin(t * 2.4 + f.ph) * 0.05,
            twitch: t * 5 + f.ph,
          };
        } else if (f.kind === 'photo') {
          const jolt = f.flashT ? f.flashT / 0.18 : 0;
          pose = {
            look,
            blink: false,
            crouch: 0.5,
            mids: 'out',
            hands: [{ x: -7.5, y: -9 }, { x: 7.5, y: -9 }],
            sway: -jolt * 0.08 * (flip ? -1 : 1),
            twitch: t * 4 + f.ph,
            flash: jolt > 0.3,
            mouth: 'smile',
          };
        }
        drawStander(ctx, f.x, f.y, f.s, flip, f.pal, pose, f.acc, t);
      }

      // транспаранты поверх голов
      for (const c of this.crowd.banners) {
        if (c.side !== side) continue;
        const [a, b] = c.holders;
        if (!a || !b) continue;
        // нижний край транспаранта - в поднятых лапах, сам он над головами
        const h = 13 * a.s;
        const top = a.y - (60 + c.jump) * a.s - h + 2 * a.s;
        const x0 = a.x - 11 * a.s;
        const x1 = b.x + 11 * b.s;
        const sag = Math.sin(t * 3 + c.ph) * 1.5;
        ctx.fillStyle = '#fbfaf5';
        ctx.beginPath();
        ctx.moveTo(x0, top);
        ctx.quadraticCurveTo((x0 + x1) / 2, top + 3 + sag, x1, top);
        ctx.lineTo(x1, top + h);
        ctx.quadraticCurveTo((x0 + x1) / 2, top + h + 3 + sag, x0, top + h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#d64532';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#d64532';
        ctx.font = `800 ${9 * a.s}px "Unbounded", "Arial Black", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.banner, (x0 + x1) / 2, top + h / 2 + 1.5 + sag * 0.6);
      }

      // табличка «ПРЕССА»
      const pr = this.crowd.press;
      if (pr && side === 'bottom') {
        ctx.fillStyle = '#fbfaf5';
        this.roundRect(ctx, pr.x, pr.y, pr.w, pr.h, 3);
        ctx.fill();
        ctx.strokeStyle = '#16302a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#16302a';
        ctx.font = `800 ${8 * L.crowdScale}px "Unbounded", "Arial Black", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ПРЕССА', pr.x + pr.w / 2, pr.y + pr.h / 2 + 0.5);
      }
    }

    fanPose(f, t, look) {
      const c = f.cl;
      const h = c.hype;
      const ph = f.ph;
      const pose = { look, mids: f.mids, mouth: f.mouth, twitch: t * (2 + 8 * h) + ph * 3 };
      pose.sway = Math.sin(t * 1.3 + ph) * 0.04 * (1 - h) + Math.sin(t * 9 + ph) * 0.05 * h;
      if (f.holder) {
        pose.jump = c.jump;
        pose.hands = [{ x: -10, y: -19 }, { x: 10, y: -19 }];
        pose.mids = 'out';
        pose.mouth = h > 0.3 ? 'open' : 'smile';
        pose.sway = 0;
        return pose;
      }
      pose.jump = Math.max(0, Math.sin(t * 9 + ph)) * 8 * h;
      if (h > 0.45) {
        const w = Math.sin(t * 12 + ph) * 3;
        pose.hands = [{ x: -17 + w, y: -13 }, { x: 17 + w, y: -13 }];
        pose.mids = 'out';
        pose.mouth = 'open';
        return pose;
      }
      if (h > 0.3) pose.mouth = 'open';
      switch (f.style) {
        case 'flag':
          pose.hands = [{ x: -13, y: 11 }, { x: 17, y: -9 + Math.sin(t * 3 + ph) * 2 }];
          break;
        case 'clap': {
          const k = (Math.sin(t * 7 + ph) + 1) / 2;
          pose.hands = [{ x: -3 - k * 6, y: 4 }, { x: 3 + k * 6, y: 4 }];
          break;
        }
        case 'wave':
          pose.hands = [{ x: -13, y: 11 }, { x: 18 + Math.sin(t * 6 + ph) * 3, y: -12 }];
          break;
        case 'snack': {
          // жуёт крошку и болеет с набитым ртом
          const chew = Math.sin(t * 10 + ph) > 0;
          pose.hands = [{ x: -4, y: -1 }, { x: 4, y: -1 + (chew ? 0.8 : 0) }];
          pose.mouth = chew ? 'o' : 'smile';
          f.acc.snack = true;
          break;
        }
        case 'cheer':
          pose.hands = [{ x: -12, y: -15 + Math.sin(t * 5 + ph) * 2 }, { x: 12, y: -15 + Math.sin(t * 5 + ph + 1) * 2 }];
          break;
        default: // кулачки у груди
          pose.hands = [{ x: -5, y: 3 + Math.sin(t * 4 + ph) * 1.5 }, { x: 5, y: 3 - Math.sin(t * 4 + ph) * 1.5 }];
      }
      // флаг в цвет «своего» бегуна
      if (f.style === 'flag') {
        const id = this.order.length ? this.order[c.team % this.order.length] : null;
        const r = id && this.racers.get(id);
        f.acc.flag = r ? r.color : FAN_COLORS[c.team % FAN_COLORS.length];
        if (f.depth) f.acc.flag = shade(f.acc.flag, -0.28);
      }
      return pose;
    }

    // вспышки фотоаппаратов и конфетти - поверх всего
    drawEffects(L) {
      const ctx = this.ctx;
      for (const fl of this.flashes) {
        const r = 34 * fl.s * (1.25 - fl.life * 0.25);
        const g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r);
        g.addColorStop(0, `rgba(255, 255, 255, ${0.95 * fl.life})`);
        g.addColorStop(0.3, `rgba(255, 250, 220, ${0.45 * fl.life})`);
        g.addColorStop(1, 'rgba(255, 250, 220, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(fl.x, fl.y, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${fl.life})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const ray = r * 0.75;
        ctx.moveTo(fl.x - ray, fl.y);
        ctx.lineTo(fl.x + ray, fl.y);
        ctx.moveTo(fl.x, fl.y - ray);
        ctx.lineTo(fl.x, fl.y + ray);
        ctx.stroke();
      }
      for (const p of this.confetti) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(-2.2 * L.crowdScale, -1.3 * L.crowdScale, 4.4 * L.crowdScale, 2.6 * L.crowdScale);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    roundRect(ctx, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    fit(ctx, text, maxW) {
      if (ctx.measureText(text).width <= maxW) return text;
      let s = text;
      while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
      return s + '…';
    }
  }

  // ---------- Таракан на плинтусе (экран входа) ----------
  function startHeroRoach(canvas) {
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let dpr = 1;
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    let x = -60;
    let phase = 0;
    let twitch = 0;
    let pause = 0;
    let last = performance.now();

    function frame(t) {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (reducedMotion) {
        x = Math.min(w * 0.72, w - 60);
        drawRoach(ctx, x, h / 2, { color: '#f0b429', number: 1, twitch: 0.5, scale: 1.4 });
        return;
      }
      if (pause > 0) {
        pause -= dt;
        twitch += dt * 9;
      } else {
        const speed = 260 + Math.sin(t / 700) * 90;
        x += speed * dt;
        phase += speed * dt * 0.45;
        twitch += dt * 6;
        // иногда замирает и шевелит усами, как настоящий
        if (Math.random() < dt * 0.35 && x > 80 && x < w - 80) pause = 0.4 + Math.random() * 0.7;
        if (x > w + 70) x = -70;
      }
      drawRoach(ctx, x, h / 2, { color: '#f0b429', number: 1, phase, twitch, moving: pause > 0 ? 0 : 1, scale: 1.4 });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  window.Track = Track;
  window.RoachArt = { drawRoach, startHeroRoach };
})();
