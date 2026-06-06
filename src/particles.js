/**
 * Impact Typer — Particle System
 * Canvas-based particles: sparks, confetti, shockwaves, embers
 */

const COLORS = {
  explosion: ['#ff6a00', '#ff2020', '#ffd700', '#ff8c00', '#ffffff', '#ff4500'],
  laser: ['#00f5ff', '#a855f7', '#ff00ff', '#0080ff', '#00ff80', '#ffffff'],
  mechanical: ['#ffd700', '#ffffff', '#c0c0c0', '#87ceeb', '#ffa500', '#e0e0e0'],
  nuclear: ['#39ff14', '#ff6a00', '#ff2020', '#ffd700', '#ff00ff', '#00f5ff'],
};

class Particle {
  constructor(x, y, mode, intensity) {
    this.x = x;
    this.y = y;
    this.mode = mode;
    this.intensity = intensity;
    this.reset();
  }

  reset() {
    const colors = COLORS[this.mode] || COLORS.explosion;
    this.color = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = (2 + Math.random() * 8) * this.intensity;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - Math.random() * 4 * this.intensity;
    this.life = 1.0;
    this.decay = 0.02 + Math.random() * 0.04;
    this.size = (2 + Math.random() * 5) * Math.min(this.intensity, 2);
    this.gravity = 0.15 * this.intensity;
    this.type = Math.random() < 0.3 ? 'spark' : Math.random() < 0.5 ? 'circle' : 'square';
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.3;
    this.trail = [];
    this.maxTrail = this.type === 'spark' ? 5 : 0;
  }

  update() {
    if (this.maxTrail > 0) {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > this.maxTrail) this.trail.shift();
    }
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.98;
    this.life -= this.decay;
    this.rotation += this.rotSpeed;
  }

  draw(ctx) {
    if (this.life <= 0) return;

    // Draw trail for sparks
    if (this.trail.length > 1 && this.type === 'spark') {
      ctx.save();
      for (let i = 0; i < this.trail.length - 1; i++) {
        const t = i / this.trail.length;
        ctx.globalAlpha = this.life * t * 0.5;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size * t * 0.5;
        ctx.beginPath();
        ctx.moveTo(this.trail[i].x, this.trail[i].y);
        ctx.lineTo(this.trail[i + 1].x, this.trail[i + 1].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.size * 2;

    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    if (this.type === 'spark') {
      ctx.fillRect(-this.size / 2, -this.size * 2, this.size, this.size * 4);
    } else if (this.type === 'square') {
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  isDead() {
    return this.life <= 0;
  }
}

class ShockwaveRing {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = 120 + Math.random() * 80;
    this.life = 1.0;
    this.color = color;
    this.lineWidth = 3;
  }

  update() {
    this.radius += (this.maxRadius - this.radius) * 0.15;
    this.life -= 0.04;
    this.lineWidth = 3 * this.life;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.life * 0.6;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  isDead() {
    return this.life <= 0;
  }
}

class TextBurst {
  constructor(x, y, text) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.life = 1.0;
    this.vy = -3 - Math.random() * 2;
    this.size = 14 + Math.random() * 10;
    this.rotation = (Math.random() - 0.5) * 0.4;
    this.color = COLORS.explosion[Math.floor(Math.random() * COLORS.explosion.length)];
  }

  update() {
    this.y += this.vy;
    this.vy += 0.1;
    this.life -= 0.025;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.font = `700 ${this.size}px 'Inter', -apple-system, sans-serif`;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }

  isDead() {
    return this.life <= 0;
  }
}

export class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.shockwaves = [];
    this.textBursts = [];
    this.animFrame = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._loop();
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  burst(x, y, mode = 'explosion', intensity = 1, count = 30) {
    const colors = COLORS[mode] || COLORS.explosion;
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, mode, intensity));
    }

    // Add shockwave rings
    const ringCount = Math.ceil(intensity * 1.5);
    for (let i = 0; i < ringCount; i++) {
      setTimeout(() => {
        const color = colors[Math.floor(Math.random() * colors.length)];
        this.shockwaves.push(new ShockwaveRing(x, y, color));
      }, i * 60);
    }
  }

  spawnTextBurst(x, y, text) {
    this.textBursts.push(new TextBurst(x, y, text));
  }

  _loop() {
    this.animFrame = requestAnimationFrame(() => this._loop());
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Update & draw shockwaves
    this.shockwaves = this.shockwaves.filter(s => {
      s.update();
      s.draw(ctx);
      return !s.isDead();
    });

    // Update & draw particles
    this.particles = this.particles.filter(p => {
      p.update();
      p.draw(ctx);
      return !p.isDead();
    });

    // Update & draw text bursts
    this.textBursts = this.textBursts.filter(t => {
      t.update();
      t.draw(ctx);
      return !t.isDead();
    });
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}
