// utils/mascotSequencer.js
// Drives all animation logic. Import this once; use mascotSay() everywhere else.

// ── Sequence definitions ──────────────────────────────────────────

const SEQUENCES = {
  idle: {
    type: 'managed',
    fps: 6,
  },
  listening: {
    type: 'intro_then_hold',
    intro: ['listen_neutral', 'listen_perk', 'listen_lean', 'listen_open'],
    hold: 'listen_lean',
    fps: 8,
  },
  speaking: {
    type: 'weighted_loop',
    frames: ['mouth_M','mouth_M','mouth_M','mouth_A','mouth_E','mouth_O','mouth_M','mouth_F','mouth_M'],
    fps: 10,
  },
  thinking: {
    type: 'intro_then_hold',
    intro: ['think_start', 'think_lookup', 'think_bubble_sm', 'think_bubble_lg'],
    hold: 'think_bubble_lg',
    fps: 6,
  },
  scanning: {
    type: 'ping_pong',
    frames: ['scan_left', 'scan_mid_l', 'scan_mid_r', 'scan_right'],
    fps: 6,
  },
  happy: {
    type: 'intro_then_hold',
    intro: [
      'happy_stand','happy_crouch','happy_rise',
      'happy_peak','happy_fall','happy_land',
      'happy_rise','happy_peak','happy_fall','happy_land',
    ],
    hold: 'happy_peak',
    fps: 10,
    autoReturn: { state: 'idle', after: 3500 },
  },
  booking_done: {
    type: 'intro_then_hold',
    intro: ['book_hold','book_pull','book_pop','book_confetti','book_wide','book_settle'],
    hold: 'book_settle',
    fps: 8,
    autoReturn: { state: 'idle', after: 4000 },
  },
  alert: {
    type: 'intro_then_hold',
    intro: ['alert_notice','alert_brow','alert_worried','alert_full'],
    hold: 'alert_full',
    fps: 6,
  },
  error: {
    type: 'intro_then_loop',
    intro: ['error_start','error_sweat'],
    loop: ['error_wave1','error_wave2'],
    fps: 7,
  },
};

// Transition map — which frame to show between two states
const TRANSITIONS = {
  'idle→listening':         'trans_idle_listen',
  'listening→scanning':     'trans_listen_scan',
  'scanning→thinking':      'trans_scan_think',
  'thinking→speaking':      'trans_think_speak',
  'speaking→happy':         'trans_speak_happy',
  'listening→alert':        'trans_listen_alert',
  'idle→speaking':          'trans_idle_speak',
  'scanning→booking_done':  'trans_scan_book',
  '_→idle':                 ['trans_any_idle_1', 'trans_any_idle_2'],
};

// ── Idle manager — sway + random blinks ──────────────────────────

const IDLE_SWAY  = ['idle_left','idle_center','idle_right','idle_center'];
const BLINK_SEQ  = ['blink_half','blink_closed','blink_half','idle_center'];

class IdleManager {
  constructor(setFrame) {
    this.setFrame   = setFrame;
    this.swayIdx    = 0;
    this.swayTimer  = null;
    this.blinkTimer = null;
    this.active     = false;
  }

  start() {
    this.active = true;
    this.setFrame('idle_center');
    this._scheduleNextSway();
    this._scheduleNextBlink();
  }

  stop() {
    this.active = false;
    clearTimeout(this.swayTimer);
    clearTimeout(this.blinkTimer);
  }

  _scheduleNextSway() {
    if (!this.active) return;
    this.swayTimer = setTimeout(() => {
      if (!this.active) return;
      this.swayIdx = (this.swayIdx + 1) % IDLE_SWAY.length;
      this.setFrame(IDLE_SWAY[this.swayIdx]);
      this._scheduleNextSway();
    }, 600 + Math.random() * 400);
  }

  _scheduleNextBlink() {
    if (!this.active) return;
    const delay = 3000 + Math.random() * 2000;
    this.blinkTimer = setTimeout(async () => {
      if (!this.active) return;
      for (const frame of BLINK_SEQ) {
        if (!this.active) return;
        this.setFrame(frame);
        await sleep(62);
      }
      this._scheduleNextBlink();
    }, delay);
  }
}

// ── Main sequencer ────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class MascotSequencer {
  constructor(setFrame) {
    this.setFrame     = setFrame;
    this.currentState = null;
    this.intervalId   = null;
    this.returnTimer  = null;
    this.idleManager  = new IdleManager(setFrame);
    this._running     = false;
  }

  async transition(fromState, toState) {
    const key       = `${fromState}→${toState}`;
    const transFrame = TRANSITIONS[key] || (toState === 'idle' ? TRANSITIONS['_→idle'] : null);

    if (transFrame) {
      const frames = Array.isArray(transFrame) ? transFrame : [transFrame];
      for (const f of frames) {
        this.setFrame(f);
        await sleep(80);
      }
    }
  }

  async setState(state, fromState) {
    this._running = false;
    clearInterval(this.intervalId);
    clearTimeout(this.returnTimer);
    this.idleManager.stop();

    if (fromState && fromState !== state) {
      await this.transition(fromState, state);
    }

    this.currentState = state;
    const seq = SEQUENCES[state];
    if (!seq) return;

    const frameMs = 1000 / seq.fps;
    this._running = true;

    if (state === 'idle') {
      this.idleManager.start();
      return;
    }

    if (seq.type === 'weighted_loop') {
      let idx = 0;
      this.setFrame(seq.frames[0]);
      this.intervalId = setInterval(() => {
        if (!this._running) return;
        idx = (idx + 1) % seq.frames.length;
        this.setFrame(seq.frames[idx]);
      }, frameMs);
    }

    if (seq.type === 'ping_pong') {
      let idx = 0;
      let dir = 1;
      this.setFrame(seq.frames[0]);
      this.intervalId = setInterval(() => {
        if (!this._running) return;
        idx += dir;
        if (idx >= seq.frames.length - 1) dir = -1;
        if (idx <= 0) dir = 1;
        this.setFrame(seq.frames[idx]);
      }, frameMs);
    }

    if (seq.type === 'intro_then_hold' || seq.type === 'intro_then_loop') {
      for (const frame of (seq.intro || [])) {
        if (!this._running) return;
        this.setFrame(frame);
        await sleep(frameMs);
      }
      if (!this._running) return;

      if (seq.type === 'intro_then_hold') {
        this.setFrame(seq.hold);
      }

      if (seq.type === 'intro_then_loop') {
        let idx = 0;
        this.intervalId = setInterval(() => {
          if (!this._running) return;
          idx = (idx + 1) % seq.loop.length;
          this.setFrame(seq.loop[idx]);
        }, frameMs);
      }

      if (seq.autoReturn) {
        this.returnTimer = setTimeout(() => {
          if (this._running) this.setState('idle', state);
        }, seq.autoReturn.after);
      }
    }
  }
}
