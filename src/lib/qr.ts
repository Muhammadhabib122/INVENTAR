'use client';
// QR o'qish: avval brauzerning o'z BarcodeDetector'i (Android Chrome), bo'lmasa jsQR.
// Yorliqlar ichida faqat inventar raqam yozilgan — matn o'zgarishsiz qaytariladi.
import jsQR from 'jsqr';

type BD = { detect: (src: CanvasImageSource | ImageBitmap) => Promise<{ rawValue: string }[]> };
let detector: BD | null | undefined;
async function getDetector(): Promise<BD | null> {
  if (detector !== undefined) return detector;
  try {
    const W = window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): BD; getSupportedFormats?: () => Promise<string[]> } };
    if (W.BarcodeDetector) {
      const f = (await W.BarcodeDetector.getSupportedFormats?.()) || ['qr_code'];
      detector = f.includes('qr_code') ? new W.BarcodeDetector({ formats: ['qr_code'] }) : null;
    } else detector = null;
  } catch {
    detector = null;
  }
  return detector;
}

const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const cx = cv?.getContext('2d', { willReadFrequently: true }) ?? null;

function jsqrRect(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, max: number, both: boolean) {
  if (!cv || !cx) return null;
  const sc = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * sc)),
    h = Math.max(1, Math.round(sh * sc));
  cv.width = w;
  cv.height = h;
  cx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h);
  const r = jsQR(d.data, w, h, { inversionAttempts: both ? 'attemptBoth' : 'dontInvert' });
  return r?.data || null;
}

/** Video kadrdan o'qish (tez) */
export async function decodeVideo(v: HTMLVideoElement): Promise<string | null> {
  if (v.readyState < 2 || !v.videoWidth) return null;
  const d = await getDetector();
  if (d) {
    try {
      const r = await d.detect(v);
      if (r[0]?.rawValue) return r[0].rawValue;
      return null;
    } catch {}
  }
  return jsqrRect(v, 0, 0, v.videoWidth, v.videoHeight, 640, false);
}

/** Rasmdan o'qish (sekinroq, lekin puxta: bir nechta o'lcham va qirqim) */
export async function decodeImage(img: HTMLImageElement): Promise<string | null> {
  const d = await getDetector();
  if (d) {
    try {
      const r = await d.detect(img);
      if (r[0]?.rawValue) return r[0].rawValue;
    } catch {}
  }
  const W = img.naturalWidth,
    H = img.naturalHeight;
  for (const m of [2000, 1200, 700, 450]) {
    const r = jsqrRect(img, 0, 0, W, H, m, true);
    if (r) return r;
  }
  const fr = [
    [0.15, 0.15, 0.7, 0.7],
    [0.25, 0.25, 0.5, 0.5],
    [0, 0, 0.6, 0.6],
    [0.4, 0, 0.6, 0.6],
    [0, 0.4, 0.6, 0.6],
    [0.4, 0.4, 0.6, 0.6],
  ];
  for (const f of fr) {
    const r = jsqrRect(img, W * f[0], H * f[1], W * f[2], H * f[3], 900, true) || jsqrRect(img, W * f[0], H * f[1], W * f[2], H * f[3], 500, true);
    if (r) return r;
  }
  return null;
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      res(im);
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    };
    im.onerror = () => {
      URL.revokeObjectURL(u);
      rej(new Error('img'));
    };
    im.src = u;
  });
}

// --- ovoz va tebranish ---
let ac: AudioContext | null = null;
export function unlockAudio() {
  try {
    if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch {}
}
function tone(freq: number, ms: number, delay = 0) {
  if (!ac) return;
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.frequency.value = freq;
  o.type = 'sine';
  g.gain.value = 0.15;
  o.connect(g);
  g.connect(ac.destination);
  const t = ac.currentTime + delay / 1000;
  o.start(t);
  o.stop(t + ms / 1000);
}
export function feedback(kind: 'ok' | 'warn' | 'err') {
  unlockAudio();
  try {
    if (kind === 'ok') {
      tone(1200, 110);
      navigator.vibrate?.(60);
    } else if (kind === 'warn') {
      tone(700, 120);
      tone(700, 120, 180);
      navigator.vibrate?.([80, 60, 80]);
    } else {
      tone(300, 350);
      navigator.vibrate?.([200, 80, 200]);
    }
  } catch {}
}
