/* Трасса тараканьих бегов: кольцевой стадион, всё рисуем на canvas, без картинок. */
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
    stands: '#17231e',
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

  // ---------- Мир тараканов: болельщики, чирлидерши, репортёры ----------
  // Болельщик на трибуне: круглая мордашка с усами и глазками, слегка подпрыгивает.
  function drawFan(ctx, x, y, color, bob, scale) {
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(scale, scale);
    ctx.strokeStyle = 'rgba(30, 18, 8, 0.8)';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2.5, -4);
    ctx.quadraticCurveTo(-6, -10, -7.5, -13);
    ctx.moveTo(2.5, -4);
    ctx.quadraticCurveTo(6, -10, 7.5, -13);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.ellipse(-2, -2.5, 2.5, 1.6, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-2.4, -1, 1.5, 0, Math.PI * 2);
    ctx.arc(2.4, -1, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16302a';
    ctx.beginPath();
    ctx.arc(-2.4, -0.7, 0.8, 0, Math.PI * 2);
    ctx.arc(2.4, -0.7, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Чирлидерша-тараканша: юбочка и два помпона, которыми машет в такт.
  function drawCheer(ctx, x, y, t, color, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const wave = Math.sin(t * 7) * 0.6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-6, 4);
    ctx.lineTo(6, 4);
    ctx.lineTo(3.5, 10);
    ctx.lineTo(-3.5, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6a3d22';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 18, 8, 0.85)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -5);
    ctx.lineTo(-4, -11);
    ctx.moveTo(2, -5);
    ctx.lineTo(4, -11);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-2, -2, 1.4, 0, Math.PI * 2);
    ctx.arc(2, -2, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16302a';
    ctx.beginPath();
    ctx.arc(-2, -1.8, 0.7, 0, Math.PI * 2);
    ctx.arc(2, -1.8, 0.7, 0, Math.PI * 2);
    ctx.fill();
    for (const sgn of [-1, 1]) {
      ctx.save();
      ctx.translate(sgn * 5, -1);
      ctx.rotate(sgn * (0.5 + wave));
      ctx.strokeStyle = '#6a3d22';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(sgn * 3, -6);
      ctx.stroke();
      const px = sgn * 4;
      const py = -8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * 3.2, py + Math.sin(a) * 3.2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // Репортёр-таракан с камерой на плече (с мигающей красной точкой записи).
  function drawReporter(ctx, x, y, scale, flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? -scale : scale, scale);
    ctx.fillStyle = '#3f2414';
    ctx.beginPath();
    ctx.ellipse(-1, 1, 5.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 18, 8, 0.85)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(-5, -11);
    ctx.moveTo(0, -6);
    ctx.lineTo(1, -12);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.fillRect(2, -7, 9, 7);
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(11.5, -3.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9fe0ff';
    ctx.beginPath();
    ctx.arc(11.5, -3.5, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e23';
    ctx.beginPath();
    ctx.arc(3.5, -8.2, 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-1, -2, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16302a';
    ctx.beginPath();
    ctx.arc(-0.6, -2, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
      this.last = performance.now();
      this.resize(true);
      window.addEventListener('resize', () => this.resize(true));
      requestAnimationFrame((t) => this.frame(t));
    }

    get narrow() {
      return this.cssW < 560;
    }

    layout() {
      const W = this.cssW;
      const H = this.cssH;
      const narrow = this.narrow;
      const stand = narrow ? 16 : 30; // ширина трибун по краю (там болельщики)
      const pad = stand; // трасса начинается сразу за трибунами
      const lanes = Math.max(3, this.order.length);
      const minSide = Math.min(W, H);
      const band = narrow
        ? Math.min(Math.max(48, minSide * 0.17), 92)
        : Math.min(Math.max(96, minSide * 0.16), 150); // чуть шире прежнего, но поле в центре сохраняем
      const edge = narrow ? 8 : 12; // от края трассы до первой дорожки
      const laneSpan = Math.max(1, band - edge - 6);
      const gap = laneSpan / lanes;
      const corner = narrow ? 22 : 46;
      const roachScale = narrow ? 0.62 : 1.0;
      const baseInset = pad + edge; // центр дорожки i = baseInset + (i + 0.5) * gap
      const infieldInset = pad + band; // внутренний край трассы = начало поля
      return { W, H, narrow, stand, pad, lanes, band, gap, corner, roachScale, baseInset, infieldInset };
    }

    // Замкнутая дорожка - скруглённый прямоугольник, вставленный на inset от краёв.
    // at(f) по доле пути [0..1) даёт точку и угол направления движения (ПО ЧАСОВОЙ,
    // старт в середине ВЕРХНЕЙ стороны, таракан сперва бежит вправо).
    makeLoop(inset, L) {
      const x = inset;
      const y = inset;
      const w = L.W - 2 * inset;
      const h = L.H - 2 * inset;
      const r = Math.max(6, Math.min(L.corner, Math.min(w, h) / 2 - 2));
      const segs = [];
      const straight = (ax, ay, bx, by) => {
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 0.0001;
        segs.push({ len, pt: (d) => ({ x: ax + dx * (d / len), y: ay + dy * (d / len) }) });
      };
      const arc = (cx, cy, a0, a1) => {
        const len = Math.abs(a1 - a0) * r || 0.0001;
        segs.push({
          len,
          pt: (d) => {
            const a = a0 + (a1 - a0) * (d / len);
            return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
          },
        });
      };
      straight(x + r, y, x + w - r, y); // верх, вправо
      arc(x + w - r, y + r, -Math.PI / 2, 0); // угол справа сверху
      straight(x + w, y + r, x + w, y + h - r); // право, вниз
      arc(x + w - r, y + h - r, 0, Math.PI / 2); // угол справа снизу
      straight(x + w - r, y + h, x + r, y + h); // низ, влево
      arc(x + r, y + h - r, Math.PI / 2, Math.PI); // угол слева снизу
      straight(x, y + h - r, x, y + r); // лево, вверх
      arc(x + r, y + r, Math.PI, 1.5 * Math.PI); // угол слева сверху

      const total = segs.reduce((s, g) => s + g.len, 0) || 1;
      const startDist = Math.max(0, w / 2 - r); // f = 0 в середине верхней стороны
      const raw = (dist) => {
        let d = ((dist % total) + total) % total;
        for (const g of segs) {
          if (d <= g.len) return g.pt(d);
          d -= g.len;
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
      for (let i = 0; i < L.lanes; i++) this.loops.push(this.makeLoop(L.baseInset + (i + 0.5) * L.gap, L));
      this.boundInsets = [];
      for (let i = 1; i < L.lanes; i++) this.boundInsets.push(L.baseInset + i * L.gap);
      if (this.ring) {
        const ins = Math.round(L.infieldInset + (L.narrow ? 6 : 14));
        this.ring.style.inset = ins + 'px';
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

    // players: [{id, nick, color, progress, place, finished}]
    setRace(players, youId, textLen) {
      this.youId = youId;
      this.textLen = Math.max(1, textLen);
      const ids = new Set(players.map((p) => p.id));
      for (const id of [...this.racers.keys()]) if (!ids.has(id)) this.racers.delete(id);
      players.forEach((p, i) => {
        let r = this.racers.get(p.id);
        if (!r) {
          r = { x: 0, target: 0, phase: Math.random() * 6, twitch: Math.random() * 6, moving: 0, dust: [] };
          this.racers.set(p.id, r);
        }
        r.nick = p.nick;
        r.color = p.color;
        r.lane = i;
        r.number = i + 1;
        r.place = p.place;
        r.finished = p.finished;
        r.dnf = p.dnf;
        if (p.id !== youId || p.progress === 0) r.target = Math.min(1, p.progress / this.textLen);
      });
      const changed = this.order.length !== players.length;
      this.order = players.map((p) => p.id);
      if (changed) this.buildLoops();
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

      for (const r of this.racers.values()) {
        const loop = this.loops[r.lane] || this.loops[0];
        const prev = r.x;
        r.x += (r.target - r.x) * Math.min(1, dt * 7);
        if (Math.abs(r.target - r.x) < 0.0004) r.x = r.target;
        const movedPx = Math.abs(r.x - prev) * (loop ? loop.len : 600);
        r.moving = r.moving * 0.85 + Math.min(1, movedPx / (dt * 60 || 1)) * 0.15;
        r.phase += movedPx * 0.45;
        r.twitch += dt * (2 + r.moving * 10);

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

      this.draw();
      requestAnimationFrame((tt) => this.frame(tt));
    }

    draw() {
      const L = this._L || this.layout();
      this._L = L;
      const ctx = this.ctx;
      const W = L.W;
      const H = L.H;

      const t = this.clock || 0;

      // фон-трибуны на весь холст + толпа болельщиков по краю
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = PAL.stands;
      ctx.fillRect(0, 0, W, H);
      this.drawCrowd(L, t);

      // всё ниже рисуем внутри внешнего скругления трассы
      ctx.save();
      this.roundRect(ctx, L.pad, L.pad, W - 2 * L.pad, H - 2 * L.pad, L.corner + 6);
      ctx.clip();

      // покрытие (плитка)
      ctx.fillStyle = this.tilePattern || PAL.tileA;
      ctx.fillRect(L.pad, L.pad, W - 2 * L.pad, H - 2 * L.pad);

      // подсветка твоей дорожки (широкая мягкая лента)
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
      for (const ins of this.boundInsets) {
        this.roundRect(ctx, ins, ins, W - 2 * ins, H - 2 * ins, Math.max(6, L.corner - (ins - L.baseInset)));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // поле внутри кольца (сюда ложится панель со счётом и текстом)
      const ii = L.infieldInset;
      this.roundRect(ctx, ii, ii, W - 2 * ii, H - 2 * ii, Math.max(10, L.corner * 0.7));
      ctx.fillStyle = PAL.gate;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // старт/финиш - шахматка поперёк ВЕРХНЕЙ стороны по центру
      const sq = 7;
      const sx = W / 2;
      for (let yy = L.pad, row = 0; yy < ii; yy += sq, row++) {
        ctx.fillStyle = row % 2 ? '#16302a' : '#fbfaf5';
        ctx.fillRect(sx - 4, yy, 8, Math.min(sq, ii - yy));
      }

      ctx.restore(); // снимаем клип трассы

      // бортик трассы поверх покрытия
      this.roundRect(ctx, L.pad, L.pad, W - 2 * L.pad, H - 2 * L.pad, L.corner + 6);
      ctx.strokeStyle = '#16302a';
      ctx.lineWidth = 4;
      ctx.stroke();

      // тараканы
      ctx.textBaseline = 'middle';
      for (const id of this.order) {
        const r = this.racers.get(id);
        if (!r) continue;
        const loop = this.loops[r.lane];
        if (!loop) continue;
        const p = loop.at(r.x);
        const isYou = id === this.youId;

        // пыль из-под лапок
        for (const d of r.dust) {
          ctx.fillStyle = `rgba(120, 100, 70, ${d.life * 0.35})`;
          ctx.beginPath();
          ctx.arc(d.x, d.y, 1.5 + (1 - d.life) * 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // сам таракан, повёрнутый по ходу трассы
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
        const tdx = W / 2 - p.x;
        const tdy = H / 2 - p.y;
        const tl = Math.hypot(tdx, tdy) || 1;
        const off = L.narrow ? 15 : 21;
        const lx = p.x + (tdx / tl) * off;
        const ly = p.y + (tdy / tl) * off;

        // ник у таракана (горизонтально, с обводкой для читаемости)
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

        // медаль за место на финише
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
    }

    // Трибуны: ряды болельщиков по четырём сторонам + чирлидерши у старта и репортёры снизу.
    drawCrowd(L, t) {
      const ctx = this.ctx;
      const W = L.W;
      const H = L.H;
      const s = L.stand;
      const mid = s * 0.52;
      const step = L.narrow ? 15 : 20;
      const fscale = s / 20;
      let i = 0;
      const fan = (x, y) => {
        drawFan(ctx, x, y, FAN_COLORS[i % FAN_COLORS.length], Math.sin(t * 5 + i * 0.7) * 2, fscale);
        i++;
      };
      for (let x = s + step / 2; x < W - s; x += step) fan(x, mid); // верх
      for (let x = s + step / 2; x < W - s; x += step) fan(x, H - mid); // низ
      for (let y = s + step / 2; y < H - s; y += step) fan(mid, y); // лево
      for (let y = s + step / 2; y < H - s; y += step) fan(W - mid, y); // право

      // чирлидерши по бокам от старта (сверху по центру)
      const cx = L.narrow ? 32 : 58;
      drawCheer(ctx, W / 2 - cx, mid, t, '#ff5fa2', fscale * 1.15);
      drawCheer(ctx, W / 2 + cx, mid, t + 0.4, '#ffd23f', fscale * 1.15);

      // репортёры с камерами в нижних углах
      const rx = L.narrow ? 24 : 44;
      drawReporter(ctx, s + rx, H - mid, fscale * 1.2, false);
      drawReporter(ctx, W - s - rx, H - mid, fscale * 1.2, true);
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
