/* =========================================================
   Audio — tiny WebAudio synth for SFX. No asset files, so the
   whole arcade stays portable (single folder, no downloads).
   All sounds are generated from oscillators + gain envelopes.

   AudioContext must be created after a user gesture, so we lazy-
   init on the first play() and on a global pointer/key unlock.
   ========================================================= */
(function (Arcade) {
  "use strict";

  // note name ("A4", "C#5", "G#2") -> frequency in Hz
  const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
    "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  function noteToFreq(n) {
    if (typeof n === "number") return n;
    const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
    if (!m) return 0;
    const midi = (parseInt(m[2], 10) + 1) * 12 + NOTE[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  class AudioEngine {
    constructor(storage) {
      this._storage = storage || null;
      this._ctx = null;
      this._master = null;
      this._muted = storage ? !!storage.get("muted", false) : false;
      // music (chiptune sequencer)
      this._musicGain = null;
      this._song = null;
      this._tracks = null;
      this._sched = null;
      this._spb = 0;
      this._tempoBpm = null; // tempo override (lets level progression speed music up)
      this._oscs = []; // live music oscillators, so we can cut them on stop
    }

    /** Ensure the context exists AND is running (browsers auto-suspend it
        when a tab is hidden / on mobile backgrounding). Call before any
        sound so audio never silently drops after a resume. */
    _wake() {
      this._ensure();
      if (this._ctx && this._ctx.state === "suspended") this._ctx.resume();
    }

    get muted() { return this._muted; }

    _ensure() {
      if (this._ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this._ctx = new AC();
      this._master = this._ctx.createGain();
      this._master.gain.value = 0.5;
      this._master.connect(this._ctx.destination);
    }

    /** Call from a user gesture to satisfy autoplay policies. */
    unlock() {
      this._wake();
      this.resumeMusic();
    }

    setMuted(v) {
      this._muted = !!v;
      if (this._storage) this._storage.set("muted", this._muted);
      if (this._muted) this._stopSched();
      else if (this._song) this._startSched();
    }
    toggleMuted() { this.setMuted(!this._muted); return this._muted; }

    /** Low-level tone with an ADSR-ish gain envelope. */
    _tone(freq, dur, type, vol, glideTo) {
      if (this._muted) return;
      this._wake();
      if (!this._ctx) return;
      const t0 = this._ctx.currentTime;
      const osc = this._ctx.createOscillator();
      const g = this._ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
      const peak = (vol != null ? vol : 0.3);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this._master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    _noise(dur, vol) {
      if (this._muted) return;
      this._wake();
      if (!this._ctx) return;
      const t0 = this._ctx.currentTime;
      const frames = Math.floor(this._ctx.sampleRate * dur);
      const buf = this._ctx.createBuffer(1, frames, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const g = this._ctx.createGain();
      g.gain.value = vol != null ? vol : 0.25;
      const f = this._ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 1200;
      src.connect(f); f.connect(g); g.connect(this._master);
      src.start(t0);
    }

    // soft two-tone air-raid wail
    _siren() {
      if (this._muted) return; this._wake(); if (!this._ctx) return;
      const t0 = this._ctx.currentTime, osc = this._ctx.createOscillator(), g = this._ctx.createGain(), f = this._ctx.createBiquadFilter();
      osc.type = "sawtooth"; f.type = "lowpass"; f.frequency.value = 1500;
      const lo = 560, hi = 940, seg = 0.22, segs = 4;
      osc.frequency.setValueAtTime(lo, t0);
      for (let i = 0; i < segs; i++) osc.frequency.linearRampToValueAtTime(i % 2 === 0 ? hi : lo, t0 + seg * (i + 1));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.06);
      g.gain.setValueAtTime(0.09, t0 + seg * segs - 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + seg * segs);
      osc.connect(f); f.connect(g); g.connect(this._master);
      osc.start(t0); osc.stop(t0 + seg * segs + 0.05);
    }

    // short crowd-murmur swell (filtered noise + a couple faint voices)
    _crowd() {
      if (this._muted) return; this._wake(); if (!this._ctx) return;
      const t0 = this._ctx.currentTime, dur = 0.5;
      const frames = Math.floor(this._ctx.sampleRate * dur), buf = this._ctx.createBuffer(1, frames, this._ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) { const env = Math.sin(Math.PI * i / frames); d[i] = (Math.random() * 2 - 1) * env; }
      const src = this._ctx.createBufferSource(); src.buffer = buf;
      const f = this._ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.7;
      f.frequency.setValueAtTime(650, t0); f.frequency.linearRampToValueAtTime(1250, t0 + dur);
      const g = this._ctx.createGain(); g.gain.value = 0.085;
      src.connect(f); f.connect(g); g.connect(this._master); src.start(t0); src.stop(t0 + dur + 0.02);
      this._tone(430, 0.13, "sawtooth", 0.045, 520);
      this._tone(300, 0.15, "sawtooth", 0.04, 360);
    }

    // ---- Named SFX (semantic; games call these) ----
    play(name) {
      switch (name) {
        case "move":     this._tone(220, 0.04, "square", 0.12); break;
        case "rotate":   this._tone(440, 0.06, "square", 0.16); break;
        case "softdrop": this._tone(180, 0.03, "square", 0.08); break;
        case "harddrop": this._tone(140, 0.10, "sawtooth", 0.22, 70); this._noise(0.06, 0.12); break;
        case "lock":     this._tone(150, 0.07, "triangle", 0.18); break;
        case "hold":     this._tone(330, 0.08, "sine", 0.16); break;
        case "clear1":   this._arp([523, 659], 0.07); break;
        case "clear2":   this._arp([523, 659, 784], 0.07); break;
        case "clear3":   this._arp([523, 659, 784, 988], 0.07); break;
        case "tetris":   this._arp([523, 659, 784, 1047, 1319], 0.08, "sawtooth"); this._noise(0.12, 0.16); break;
        case "levelup":  this._arp([392, 523, 659, 784], 0.09, "triangle"); break;
        case "gameover": this._arp([440, 392, 330, 262, 196], 0.16, "sawtooth"); break;
        case "select":   this._tone(660, 0.06, "square", 0.16); break;
        // Dr. Quackers SFX
        case "pill":     this._tone(200, 0.05, "square", 0.13); break;
        case "combo":    this._arp([659, 784, 988, 1175], 0.06); break;
        case "win":      this._arp([523, 659, 784, 1047, 1319, 1568], 0.10, "square"); break;
        // Asteroids / Missile Defense
        case "shoot":    this._tone(900, 0.07, "square", 0.12, 300); break;
        case "launch":   this._tone(120, 0.40, "sawtooth", 0.18, 620); this._noise(0.34, 0.13); break;
        case "eject":    this._tone(155, 0.13, "sine", 0.22, 66); this._noise(0.14, 0.10); break;
        case "artillery": this._tone(95, 0.16, "square", 0.22, 52); this._noise(0.12, 0.13); break;
        case "rail":     this._tone(1500, 0.09, "sawtooth", 0.16, 520); this._noise(0.05, 0.08); break;
        case "cryo":     this._tone(820, 0.26, "sine", 0.12, 1700); break;
        case "boom":     this._tone(110, 0.22, "sawtooth", 0.22, 38); this._noise(0.18, 0.16); break;
        // Space Pinball
        case "flip":     this._tone(280, 0.04, "square", 0.12); break;
        case "bump":     this._tone(720, 0.07, "square", 0.20, 540); break;
        case "plunger":  this._tone(170, 0.20, "sawtooth", 0.20, 540); break;
        case "drain":    this._tone(330, 0.40, "sine", 0.18, 70); break;
        case "ufo":      this._tone(520, 0.26, "square", 0.10, 720); break;
        case "extralife": this._arp([523, 659, 784, 1047], 0.07, "square"); break;
        case "siren":    this._siren(); break;
        case "crowd":    this._crowd(); break;
        default: break;
      }
    }

    _arp(freqs, step, type) {
      if (this._muted) return;
      this._wake();
      if (!this._ctx) return;
      freqs.forEach((f, i) => {
        setTimeout(() => this._tone(f, step + 0.04, type || "square", 0.2), i * step * 1000);
      });
    }

    // ---- chiptune music sequencer (lookahead scheduler) ----
    // A song = { bpm, volume?, tracks: [ { wave, gain, notes: [[pitch, beats], ...] } ] }
    // pitch is a note name ("E5"), a frequency number, or null for a rest.
    // Tracks loop independently, so give every track the same total beats.
    playMusic(song) {
      this.stopMusic();
      this._wake();
      if (!this._ctx || !song) return;
      this._song = song;
      if (!this._musicGain) { this._musicGain = this._ctx.createGain(); this._musicGain.connect(this._master); }
      this._musicGain.gain.value = (song.volume != null ? song.volume : 0.16);
      if (!this._muted) this._startSched();
    }

    stopMusic() { this._stopSched(); this._song = null; this._tracks = null; this._tempoBpm = null; }
    suspendMusic() { this._stopSched(); }
    resumeMusic() { this._wake(); if (this._song && !this._muted && !this._sched) this._startSched(); }

    /** Override playback tempo (e.g. speed the music up with the level).
        Future-scheduled notes pick this up seamlessly; all tracks share it
        so they stay in sync. */
    setMusicTempo(bpm) { this._tempoBpm = bpm; if (this._song && this._sched) this._spb = 60 / Math.max(1, bpm); }

    _startSched() {
      if (this._sched || !this._song || !this._ctx) return;
      if (this._ctx.state === "suspended") this._ctx.resume();
      this._spb = 60 / (this._tempoBpm || this._song.bpm || 120);
      const start = this._ctx.currentTime + 0.1;
      this._tracks = this._song.tracks.map(t => ({ def: t, i: 0, time: start }));
      this._sched = setInterval(() => this._scheduler(), 25);
      this._scheduler();
    }

    _stopSched() {
      if (this._sched) { clearInterval(this._sched); this._sched = null; }
      // Cut any oscillators already queued in the lookahead window so a
      // restart/skin-switch doesn't bleed the old song over the new one.
      if (this._oscs.length && this._ctx) {
        const now = this._ctx.currentTime;
        for (const o of this._oscs) { try { o.stop(now); } catch (e) { /* ignore */ } }
      }
      this._oscs.length = 0;
    }

    _scheduler() {
      if (!this._ctx || !this._tracks) return;
      const ahead = this._ctx.currentTime + 0.2;
      for (const tr of this._tracks) {
        const notes = tr.def.notes;
        let guard = 0;
        while (tr.time < ahead && guard < 256) {
          guard++;
          const note = notes[tr.i];
          const dur = note[1] * this._spb;
          if (note[0] != null) {
            if (tr.def.drum) this._scheduleDrum(tr.def, note[0], tr.time);
            else this._scheduleNote(tr.def, note[0], tr.time, dur);
          }
          tr.time += dur;
          tr.i = (tr.i + 1) % notes.length;
        }
      }
    }

    _scheduleNote(def, pitch, time, dur) {
      const f = noteToFreq(pitch);
      if (!f) return;
      const osc = this._ctx.createOscillator();
      const g = this._ctx.createGain();
      osc.type = def.wave || "square";
      osc.frequency.setValueAtTime(f, time);
      const vol = def.gain != null ? def.gain : 0.2;
      const atk = 0.006, rel = Math.min(0.09, dur * 0.35), end = time + dur;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(vol, time + atk);
      g.gain.setValueAtTime(vol, Math.max(time + atk, end - rel));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g); g.connect(this._musicGain);
      osc.start(time); osc.stop(end + 0.03);
      this._track(osc);
    }

    _track(osc) {
      this._oscs.push(osc);
      osc.onended = () => { const i = this._oscs.indexOf(osc); if (i >= 0) this._oscs.splice(i, 1); };
    }

    // Percussion for techno tracks. note name: 'K' kick, 'H' hat, 'S' snare.
    _scheduleDrum(def, name, time) {
      const ctx = this._ctx, vol = def.gain != null ? def.gain : 0.3;
      if (name === "K") {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(165, time);
        o.frequency.exponentialRampToValueAtTime(46, time + 0.12);
        g.gain.setValueAtTime(vol, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
        o.connect(g); g.connect(this._musicGain);
        o.start(time); o.stop(time + 0.18);
        this._track(o);
      } else if (name === "H") {
        this._noiseAt(time, 0.03, vol, 7000);
      } else if (name === "S") {
        this._noiseAt(time, 0.13, vol, 1500);
      }
    }

    _noiseAt(time, dur, vol, hp) {
      const ctx = this._ctx;
      const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = vol != null ? vol : 0.2;
      const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 1000;
      src.connect(f); f.connect(g); g.connect(this._musicGain);
      src.start(time);
    }
  }

  // Helpers for building songs (shared by game modules).
  Arcade.MusicKit = {
    repeat: function (note, n) { const o = []; for (let i = 0; i < n; i++) o.push(note.slice()); return o; },
    fourOnFloor: function (beats) { return this.repeat(["K", 1], beats); },
    eighthHats: function (beats) { return this.repeat(["H", 0.5], beats * 2); },
    backbeat: function (measures) { const o = []; for (let i = 0; i < measures; i++) o.push([null, 1], ["S", 1], [null, 1], ["S", 1]); return o; },
    eighthBass: function (roots) { const o = []; roots.forEach(r => { for (let i = 0; i < 8; i++) o.push([r, 0.5]); }); return o; },
    quarterBass: function (roots) { const o = []; roots.forEach(r => { for (let i = 0; i < 4; i++) o.push([r, 1]); }); return o; }
  };

  Arcade.AudioEngine = AudioEngine;
})(window.Arcade = window.Arcade || {});
