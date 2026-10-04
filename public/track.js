/* Трасса тараканьих бегов: рисуем всё на canvas, без картинок. */
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
  };

  const MEDALS = { 1: '#f0b429', 2: '#c9ced3', 3: '#c98b4e' };

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

  // ---------- Трасса ----------
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
      this.last = performance.now();
      this.resize(true);
      window.addEventListener('resize', () => this.resize(true));
      requestAnimationFrame((t) => this.frame(t));
    }

    get narrow() {
      return this.cssW < 560;
    }

    layout() {
      const laneH = this.narrow ? 50 : 58;
      const gateW = this.narrow ? 30 : 132;
      const bodyL = this.narrow ? 38 : 48;
      const startX = gateW + bodyL + 8;
      const finishX = this.cssW - (this.narrow ? 34 : 46);
      return { laneH, gateW, bodyL, startX, finishX, top: 10, bottom: 10 };
    }

    resize(force) {
      const parent = this.canvas.parentElement;
      const w = Math.max(280, Math.floor(parent.clientWidth));
      const lanes = Math.max(3, this.order.length);
      const L = (this.cssW = w, this.layout());
      const h = L.top + lanes * L.laneH + L.bottom;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!force && w === this.lastW && h === this.cssH && dpr === this.dpr) return;
      this.lastW = w;
      this.cssH = h;
      this.dpr = dpr;
      this.canvas.style.height = h + 'px';
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.buildPattern(L.laneH / 2);
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
      if (changed) this.resize(false);
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
      const L = this.layout();
      const runPx = L.finishX - L.startX;

      for (const r of this.racers.values()) {
        const prev = r.x;
        r.x += (r.target - r.x) * Math.min(1, dt * 7);
        if (Math.abs(r.target - r.x) < 0.0004) r.x = r.target;
        const movedPx = (r.x - prev) * runPx;
        r.moving = r.moving * 0.85 + Math.min(1, movedPx / (dt * 60 || 1)) * 0.15;
        r.phase += movedPx * 0.45;
        r.twitch += dt * (2 + r.moving * 10);

        if (!reducedMotion) {
          if (movedPx > 0.4 && Math.random() < 0.6) {
            const cx = L.startX - L.bodyL / 2 + r.x * runPx;
            r.dust.push({ x: cx - 20, y: (Math.random() - 0.5) * 14, life: 1, vx: -20 - Math.random() * 30 });
            if (r.dust.length > 24) r.dust.shift();
          }
          for (const d of r.dust) {
            d.life -= dt * 2.2;
            d.x += d.vx * dt;
          }
          r.dust = r.dust.filter((d) => d.life > 0);
        }
      }

      this.draw(L);
      requestAnimationFrame((tt) => this.frame(tt));
    }

    draw(L) {
      const ctx = this.ctx;
      const W = this.cssW;
      const H = this.cssH;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.tilePattern || PAL.tileA;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const lanes = Math.max(3, this.order.length);

      // своя дорожка
      const you = this.racers.get(this.youId);
      if (you) {
        ctx.fillStyle = PAL.you;
        ctx.fillRect(0, L.top + you.lane * L.laneH, W, L.laneH);
      }

      // разделители дорожек
      ctx.strokeStyle = 'rgba(33, 68, 55, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 8]);
      for (let i = 0; i <= lanes; i++) {
        const y = L.top + i * L.laneH + 0.5;
        ctx.beginPath();
        ctx.moveTo(L.gateW, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // стартовые боксы
      ctx.fillStyle = PAL.gate;
      ctx.fillRect(0, 0, L.gateW, H);
      for (let i = 0; i < lanes; i++) {
        const y = L.top + i * L.laneH;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(4, y + 3, L.gateW - 8, L.laneH - 6);
      }

      // линия старта
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(L.startX - 1, L.top, 3, lanes * L.laneH);

      // финиш - шахматка
      const sq = 6;
      for (let y = L.top, row = 0; y < L.top + lanes * L.laneH; y += sq, row++) {
        for (let col = 0; col < 2; col++) {
          ctx.fillStyle = (row + col) % 2 ? '#16302a' : '#fbfaf5';
          ctx.fillRect(L.finishX + col * sq, y, sq, Math.min(sq, L.top + lanes * L.laneH - y));
        }
      }

      // подписи и тараканы
      ctx.textBaseline = 'middle';
      for (const id of this.order) {
        const r = this.racers.get(id);
        if (!r) continue;
        const cy = L.top + r.lane * L.laneH + L.laneH / 2;
        const isYou = id === this.youId;

        // номер и ник в стартовом боксе
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(this.narrow ? 15 : 20, cy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 9px "Unbounded", "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(r.number), this.narrow ? 15 : 20, cy + 0.5);

        ctx.textAlign = 'left';
        if (!this.narrow) {
          ctx.fillStyle = PAL.gateText;
          ctx.font = (isYou ? '600 ' : '400 ') + '13px "Golos Text", system-ui, sans-serif';
          ctx.fillText(this.fit(ctx, r.nick, L.gateW - 42), 34, cy - (isYou ? 6 : 0));
          if (isYou) {
            ctx.fillStyle = '#f0b429';
            ctx.font = '500 11px "Golos Text", system-ui, sans-serif';
            ctx.fillText('это ты', 34, cy + 9);
          }
        } else {
          ctx.fillStyle = 'rgba(22, 48, 42, 0.75)';
          ctx.font = (isYou ? '600 ' : '400 ') + '10px "Golos Text", system-ui, sans-serif';
          ctx.fillText(this.fit(ctx, isYou ? r.nick + ' (ты)' : r.nick, 140), L.startX + 6, L.top + r.lane * L.laneH + 8);
        }

        const cx = L.startX - L.bodyL / 2 + r.x * (L.finishX - L.startX);

        // пыль
        for (const d of r.dust) {
          ctx.fillStyle = `rgba(120, 100, 70, ${d.life * 0.35})`;
          ctx.beginPath();
          ctx.arc(d.x, cy + d.y, 1.5 + (1 - d.life) * 2, 0, Math.PI * 2);
          ctx.fill();
        }

        drawRoach(ctx, cx, cy, {
          color: r.color,
          number: r.number,
          phase: r.phase,
          twitch: r.twitch,
          moving: r.moving > 0.05 ? 1 : 0,
          scale: this.narrow ? 0.9 : 1.15,
        });

        // место на финише
        if (r.place && !r.dnf) {
          const bx = L.finishX + 12 + (this.narrow ? 10 : 16);
          ctx.fillStyle = MEDALS[r.place] || '#8a9a92';
          ctx.beginPath();
          ctx.arc(bx, cy, this.narrow ? 10 : 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PAL.ink;
          ctx.font = '800 11px "Unbounded", "Arial Black", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(r.place), bx, cy + 0.5);
        }
      }
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
