/**
 * Impact Typer — Sound Engine
 * Web Audio API を使用して外部ファイルなしで爆音を生成
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.masterGain = null;
    this._initContext();
  }

  _initContext() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio API not available', e);
    }
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.7,
        this.ctx.currentTime,
        0.1
      );
    }
  }

  /**
   * 爆発音
   */
  playExplosion(intensity = 1) {
    if (!this.ctx || this.muted) return;
    this._resume();

    const now = this.ctx.currentTime;
    const duration = 0.5 + intensity * 0.3;

    // Noise burst
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Low-pass for rumble
    const lowPass = this.ctx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.setValueAtTime(800, now);
    lowPass.frequency.exponentialRampToValueAtTime(150, now + duration);

    // Distortion
    const distortion = this.ctx.createWaveShaper();
    distortion.curve = this._makeDistortionCurve(400 * intensity);
    distortion.oversample = '4x';

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(1.5 * intensity, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Sub boom oscillator
    const boom = this.ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80 * intensity, now);
    boom.frequency.exponentialRampToValueAtTime(30, now + duration * 0.5);
    const boomGain = this.ctx.createGain();
    boomGain.gain.setValueAtTime(2 * intensity, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);
    boom.connect(boomGain);
    boomGain.connect(this.masterGain);
    boom.start(now);
    boom.stop(now + duration * 0.7);

    source.connect(lowPass);
    lowPass.connect(distortion);
    distortion.connect(gainNode);
    gainNode.connect(this.masterGain);
    source.start(now);
  }

  /**
   * メカニカルキーボード音（カチカチ）
   */
  playMechanical(intensity = 1) {
    if (!this.ctx || this.muted) return;
    this._resume();

    const now = this.ctx.currentTime;

    // Click transient
    const clickDuration = 0.015 + intensity * 0.01;
    const bufSize = Math.floor(this.ctx.sampleRate * clickDuration);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const env = 1 - i / bufSize;
      d[i] = (Math.random() * 2 - 1) * env * env;
    }

    const click = this.ctx.createBufferSource();
    click.buffer = buf;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 8000 - intensity * 2000;
    bp.Q.value = 2;

    const gn = this.ctx.createGain();
    gn.gain.value = 3 * intensity;

    click.connect(hp);
    hp.connect(bp);
    bp.connect(gn);
    gn.connect(this.masterGain);
    click.start(now);

    // Bottom thock
    const thock = this.ctx.createOscillator();
    thock.type = 'square';
    thock.frequency.setValueAtTime(200 + intensity * 100, now);
    thock.frequency.exponentialRampToValueAtTime(80, now + 0.05);
    const tgn = this.ctx.createGain();
    tgn.gain.setValueAtTime(1.5 * intensity, now);
    tgn.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    thock.connect(tgn);
    tgn.connect(this.masterGain);
    thock.start(now);
    thock.stop(now + 0.08);

    // Reverb tail with higher intensity
    if (intensity > 1.5) {
      this._addReverb(gn, 0.2);
    }
  }

  /**
   * レーザー音
   */
  playLaser(intensity = 1) {
    if (!this.ctx || this.muted) return;
    this._resume();

    const now = this.ctx.currentTime;
    const duration = 0.12 + intensity * 0.08;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const startFreq = 2000 + Math.random() * 1000 * intensity;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(200 + intensity * 50, now + duration);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(startFreq * 0.5, now);
    osc2.frequency.exponentialRampToValueAtTime(100 + intensity * 30, now + duration);

    const dist = this.ctx.createWaveShaper();
    dist.curve = this._makeDistortionCurve(200 * intensity);

    const gn = this.ctx.createGain();
    gn.gain.setValueAtTime(1 * intensity, now);
    gn.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const gn2 = this.ctx.createGain();
    gn2.gain.value = 0.4;

    osc.connect(dist);
    dist.connect(gn);
    gn.connect(this.masterGain);

    osc2.connect(gn2);
    gn2.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);
    osc2.start(now);
    osc2.stop(now + duration);

    // Zap noise
    const zapBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
    const zapData = zapBuf.getChannelData(0);
    for (let i = 0; i < zapData.length; i++) {
      zapData[i] = (Math.random() * 2 - 1) * (1 - i / zapData.length);
    }
    const zapSrc = this.ctx.createBufferSource();
    zapSrc.buffer = zapBuf;
    const zapFilt = this.ctx.createBiquadFilter();
    zapFilt.type = 'bandpass';
    zapFilt.frequency.value = 5000;
    zapFilt.Q.value = 3;
    const zapGn = this.ctx.createGain();
    zapGn.gain.value = 2 * intensity;
    zapSrc.connect(zapFilt);
    zapFilt.connect(zapGn);
    zapGn.connect(this.masterGain);
    zapSrc.start(now);
  }

  /**
   * ☢️ Nuclear — すべてをまとめた超破壊音
   */
  playNuclear(intensity = 1) {
    if (!this.ctx || this.muted) return;
    this._resume();

    // Play multiple layers simultaneously
    this.playExplosion(intensity * 1.5);
    setTimeout(() => this.playLaser(intensity), 30);
    setTimeout(() => this.playExplosion(intensity * 0.8), 80);
    setTimeout(() => this.playMechanical(intensity * 2), 50);

    // Nuclear sine sweep
    const now = this.ctx.currentTime;
    const sweep = this.ctx.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(50, now);
    sweep.frequency.linearRampToValueAtTime(8000 * intensity, now + 0.3);
    sweep.frequency.exponentialRampToValueAtTime(30, now + 0.8);

    const sweepGain = this.ctx.createGain();
    sweepGain.gain.setValueAtTime(0.8 * intensity, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    const sweepDist = this.ctx.createWaveShaper();
    sweepDist.curve = this._makeDistortionCurve(800);

    sweep.connect(sweepDist);
    sweepDist.connect(sweepGain);
    sweepGain.connect(this.masterGain);
    sweep.start(now);
    sweep.stop(now + 0.8);
  }

  _makeDistortionCurve(amount) {
    const samples = 512;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  _addReverb(node, duration) {
    const convolver = this.ctx.createConvolver();
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      }
    }
    convolver.buffer = impulse;
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.3;
    node.connect(convolver);
    convolver.connect(reverbGain);
    reverbGain.connect(this.masterGain);
  }
}
