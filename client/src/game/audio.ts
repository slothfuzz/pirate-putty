let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

// Initialize audio context on first user interaction
export function initAudio(): void {
  getCtx();
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gainStart: number,
  gainEnd: number,
  freqEnd?: number,
): void {
  const ac = getCtx();
  if (!ac) return;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (freqEnd !== undefined) {
    osc.frequency.linearRampToValueAtTime(freqEnd, ac.currentTime + duration);
  }

  gain.gain.setValueAtTime(gainStart, ac.currentTime);
  gain.gain.linearRampToValueAtTime(gainEnd, ac.currentTime + duration);

  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration);
}

export function playPutt(): void {
  const ac = getCtx();
  if (!ac) return;

  // Short percussive pop
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.08);

  gain.gain.setValueAtTime(0.3, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);

  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.1);
}

export function playBounce(): void {
  // Wooden knock
  playTone(300, 0.06, 'square', 0.15, 0.001, 100);
}

export function playSink(): void {
  const ac = getCtx();
  if (!ac) return;

  // Triumphant ascending two-tone
  const t = ac.currentTime;

  const osc1 = ac.createOscillator();
  const gain1 = ac.createGain();
  osc1.connect(gain1);
  gain1.connect(ac.destination);
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(440, t);
  osc1.frequency.linearRampToValueAtTime(660, t + 0.15);
  gain1.gain.setValueAtTime(0.25, t);
  gain1.gain.linearRampToValueAtTime(0.001, t + 0.3);
  osc1.start(t);
  osc1.stop(t + 0.3);

  const osc2 = ac.createOscillator();
  const gain2 = ac.createGain();
  osc2.connect(gain2);
  gain2.connect(ac.destination);
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(660, t + 0.12);
  osc2.frequency.linearRampToValueAtTime(880, t + 0.3);
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.linearRampToValueAtTime(0.2, t + 0.15);
  gain2.gain.linearRampToValueAtTime(0.001, t + 0.5);
  osc2.start(t + 0.12);
  osc2.stop(t + 0.5);
}

export function playSplash(): void {
  const ac = getCtx();
  if (!ac) return;

  // White noise burst for splash
  const bufferSize = ac.sampleRate * 0.15;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, ac.currentTime);
  filter.frequency.linearRampToValueAtTime(400, ac.currentTime + 0.15);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.2, ac.currentTime);
  gain.gain.linearRampToValueAtTime(0.001, ac.currentTime + 0.2);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  source.start(ac.currentTime);
}

export function playTimerWarning(): void {
  // Low ominous pulse
  playTone(110, 0.3, 'sine', 0.15, 0.001, 80);
}
