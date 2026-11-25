import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { categories, initialProducts, initialOrders, money, steps, defaultBusinessInfo } from './data';
import type { Product, CartItem, Order, BusinessInfo } from './data';
import {
  supabase,
  getCurrentSession,
  getUserRoles,
  signInWithEmail,
  signUpWithEmail,
  sendEmailOtp,
  verifyEmailOtp,
  signOut,
  claimGuestOrders,
  sendPasswordResetEmail,
  updatePassword,
  fetchProductsWithDetails,
  fetchCategories,
  fetchBakerySettings,
  mapDatabaseProductToFrontend,
  mapDatabaseSettingsToBusinessInfo,
  createOrderSecurely,
  fetchCustomerOrders,
  fetchAdminOrders,
  fetchGuestOrderByToken,
  fetchCustomerProfile,
  updateCustomerProfile,
  mapOrderStatusToStep,
  updateOrderStatusByAdmin,
  fetchCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  updateProductAvailability,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  uploadProductImage,
  VariantTemplateKey,
  fetchAdminCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  AdminCategory,
} from './lib/supabase';
import { AddressMapPicker } from './components/AddressMapPicker';
import type { ReverseGeocodeResult } from './lib/geocoding';
import type {
  User,
  AppRole,
  CreateOrderItemInput,
  PaymentMethod,
  GuestOrderDetails,
  OrderStatus,
  DatabaseProfile,
  DatabaseAddress,
  CreateCustomerAddressInput,
  UpdateCustomerAddressInput,
} from './lib/supabase';

type TrackedOrderDetails = GuestOrderDetails & {
  payment_method?: string;
  payment_status?: string;
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    bag: <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
    user: <><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>,
    heart: <path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15Z" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L20 5" />,
    cake: <><path d="M3 12h18v9H3zM3 15q3 4 6 0 3 4 6 0 3 4 6 0M6 12V8h12v4M9 8V4m6 4V4M9 2v1m6-1v1" /></>,
    truck: <><path d="M2 5h12v12H2zM14 10h4l4 5v2h-8" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    leaf: <><path d="M20 3C8 1 0 9 7 17c8 7 16-1 13-14ZM4 21 16 9" /></>,
    star: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
    grid: <><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z" /></>,
    bell: <><path d="M4 17h16l-2-4V8A6 6 0 0 0 6 8v5l-2 4ZM10 21h4" /></>,
    edit: <><path d="m4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    refresh: <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8m0 0V3m0 5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16m0 0v5m0-5h-5" />,
    mail: <><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 shrink-0 ${className}`} aria-hidden="true">{paths[name] || paths.cake}</svg>;
}
function Photo({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className={`flex items-center justify-center bg-[#f3e5db] ${className}`} role="img" aria-label={alt}><Icon name="cake" className="!w-16 !h-16 text-[#9b6655]" /></div> : <img src={src} alt={alt} onError={() => setFailed(true)} className={className} />;
}

function getCustomerStatusUpdateMessage(orderNumber: string, status: string): string {
  switch (status) {
    case 'confirmed':
      return `Good news! Your order #${orderNumber} has been confirmed.`;
    case 'preparing':
      return `Your delicious order #${orderNumber} is being prepared in our ovens!`;
    case 'ready_for_pickup':
      return `Your order #${orderNumber} is ready for pickup!`;
    case 'out_for_delivery':
      return `Your order #${orderNumber} is on its way to your doorstep!`;
    case 'delivered':
      return `Your order #${orderNumber} has been delivered. Enjoy your sweet treats!`;
    case 'rejected':
    case 'cancelled':
      return `Update: Order #${orderNumber} was cancelled or rejected. Please contact the bakery.`;
    default:
      return `Order #${orderNumber} status updated: ${status.replace(/_/g, ' ')}`;
  }
}

export type NotificationSoundId =
  | 'classic-bell'
  | 'double-bell'
  | 'digital-alert'
  | 'bakery-chime'
  | 'doorbell'
  | 'triple-alert'
  | 'marimba'
  | 'urgent-alert';

export interface SoundOption {
  id: NotificationSoundId;
  name: string;
  tagline: string;
  description: string;
  durationLabel: string;
}

export const NOTIFICATION_SOUNDS: SoundOption[] = [
  {
    id: 'classic-bell',
    name: 'Classic Bell',
    tagline: 'Traditional shop counter bell',
    description: 'Crisp brass bell strike with resonant musical harmonics.',
    durationLabel: '~0.9s',
  },
  {
    id: 'double-bell',
    name: 'Double Bell',
    tagline: 'Two consecutive bell strikes',
    description: 'Bright double tap ("ting-ting") perfect for active bakeries.',
    durationLabel: '~0.8s',
  },
  {
    id: 'digital-alert',
    name: 'Digital Alert',
    tagline: 'Modern electronic notification',
    description: 'Clean two-tone electronic chirp designed for modern devices.',
    durationLabel: '~0.5s',
  },
  {
    id: 'bakery-chime',
    name: 'Bakery Chime',
    tagline: 'Warm musical ascending notes',
    description: 'Signature ascending C-E-G major triad with warm bell decay.',
    durationLabel: '~0.7s',
  },
  {
    id: 'doorbell',
    name: 'Doorbell',
    tagline: 'Familiar two-tone doorbell',
    description: 'Classic "Ding-Dong" entrance chime with lingering reverberation.',
    durationLabel: '~1.3s',
  },
  {
    id: 'triple-alert',
    name: 'Triple Alert',
    tagline: 'Three attention-grabbing notes',
    description: 'Snappy rhythmic triad (A4-C#5-E5) for immediate notice.',
    durationLabel: '~0.6s',
  },
  {
    id: 'marimba',
    name: 'Marimba',
    tagline: 'Cheerful, bright percussive tones',
    description: 'Warm acoustic wooden mallet arpeggio with organic character.',
    durationLabel: '~0.6s',
  },
  {
    id: 'urgent-alert',
    name: 'Urgent Alert',
    tagline: 'Strong repeated alert pattern',
    description: 'Two-stage pulsing rhythm for busy peak-hour rush alerts.',
    durationLabel: '~0.8s',
  },
];

let audioCtx: AudioContext | null = null;
let activeSoundStopper: (() => void) | null = null;

function stopActiveNotificationSound(): void {
  if (activeSoundStopper) {
    try {
      activeSoundStopper();
    } catch {
      // ignore
    }
    activeSoundStopper = null;
  }
}

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioCtx();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

async function playNotificationSound(soundId: NotificationSoundId = 'classic-bell', volumePercent = 75): Promise<boolean> {
  const safeVol = Math.max(0, Math.min(100, Math.round(volumePercent)));
  if (safeVol === 0) {
    stopActiveNotificationSound();
    return true; // Silent when volume is 0
  }

  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state !== 'running') return false;

    // Stop previous sound to prevent overlapping
    stopActiveNotificationSound();

    const masterGain = ctx.createGain();
    const volumeMultiplier = (safeVol / 100) * 0.18; // safe distortion-free laptop output
    masterGain.gain.setValueAtTime(volumeMultiplier, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const activeOscillators: OscillatorNode[] = [];
    const registerOsc = (osc: OscillatorNode) => {
      activeOscillators.push(osc);
    };

    activeSoundStopper = () => {
      try {
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.015);
        setTimeout(() => {
          activeOscillators.forEach(osc => {
            try { osc.stop(); osc.disconnect(); } catch {}
          });
          try { masterGain.disconnect(); } catch {}
        }, 20);
      } catch {}
    };

    const now = ctx.currentTime;

    switch (soundId) {
      case 'classic-bell': {
        // Traditional brass shop bell: fundamental A5 (880Hz) + rich harmonic overtone (1760Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.9, now + 0.005);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc1.start(now);
        osc1.stop(now + 0.85);
        registerOsc(osc1);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1760, now);
        gain2.gain.setValueAtTime(0.0001, now);
        gain2.gain.linearRampToValueAtTime(0.25, now + 0.004);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.start(now);
        osc2.stop(now + 0.5);
        registerOsc(osc2);
        break;
      }

      case 'double-bell': {
        // Two consecutive bell tones: G5 (784Hz) then A5 (880Hz)
        [
          { freq: 783.99, time: 0.00, dur: 0.55 },
          { freq: 880.00, time: 0.16, dur: 0.65 },
        ].forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);
          gain.gain.setValueAtTime(0.0001, now + time);
          gain.gain.linearRampToValueAtTime(0.85, now + time + 0.006);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + time);
          osc.stop(now + time + dur);
          registerOsc(osc);
        });
        break;
      }

      case 'digital-alert': {
        // Modern electronic two-tone notification: D5 (587.33Hz) -> A5 (880Hz)
        [
          { freq: 587.33, time: 0.00, dur: 0.12 },
          { freq: 880.00, time: 0.11, dur: 0.35 },
        ].forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + time);
          gain.gain.setValueAtTime(0.0001, now + time);
          gain.gain.linearRampToValueAtTime(0.75, now + time + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + time);
          osc.stop(now + time + dur);
          registerOsc(osc);
        });
        break;
      }

      case 'bakery-chime': {
        // Warm musical ascending triad: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz)
        [
          { freq: 523.25, time: 0.00, dur: 0.30 },
          { freq: 659.25, time: 0.11, dur: 0.34 },
          { freq: 783.99, time: 0.23, dur: 0.50 },
        ].forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);
          gain.gain.setValueAtTime(0.0001, now + time);
          gain.gain.linearRampToValueAtTime(0.75, now + time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + time);
          osc.stop(now + time + dur);
          registerOsc(osc);
        });
        break;
      }

      case 'doorbell': {
        // Classic Ding-Dong: E5 (659.25Hz) -> C5 (523.25Hz) with sustained reverberation
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now);
        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.85, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc1.start(now);
        osc1.stop(now + 0.55);
        registerOsc(osc1);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(523.25, now + 0.38);
        gain2.gain.setValueAtTime(0.0001, now + 0.38);
        gain2.gain.linearRampToValueAtTime(0.9, now + 0.38 + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.38 + 0.95);
        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.start(now + 0.38);
        osc2.stop(now + 0.38 + 0.95);
        registerOsc(osc2);
        break;
      }

      case 'triple-alert': {
        // 3 crisp ascending triad notes: A4 (440Hz), C#5 (554.37Hz), E5 (659.25Hz)
        [
          { freq: 440.00, time: 0.00, dur: 0.20 },
          { freq: 554.37, time: 0.09, dur: 0.22 },
          { freq: 659.25, time: 0.18, dur: 0.45 },
        ].forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + time);
          gain.gain.setValueAtTime(0.0001, now + time);
          gain.gain.linearRampToValueAtTime(0.7, now + time + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + time);
          osc.stop(now + time + dur);
          registerOsc(osc);
        });
        break;
      }

      case 'marimba': {
        // Bright wooden marimba 4-note run: G4 (392Hz), C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz)
        [
          { freq: 392.00, time: 0.00, dur: 0.18 },
          { freq: 523.25, time: 0.08, dur: 0.18 },
          { freq: 659.25, time: 0.16, dur: 0.20 },
          { freq: 783.99, time: 0.24, dur: 0.38 },
        ].forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);
          gain.gain.setValueAtTime(0.0001, now + time);
          gain.gain.linearRampToValueAtTime(0.85, now + time + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + time);
          osc.stop(now + time + dur);
          registerOsc(osc);
        });
        break;
      }

      case 'urgent-alert': {
        // Strong repeated alert: two high-low double pulses (880Hz -> 698.46Hz) x 2
        [
          { freq: 880.00, time: 0.00, dur: 0.12 },
          { freq: 698.46, time: 0.11, dur: 0.14 },
          { freq: 880.00, time: 0.35, dur: 0.12 },
          { freq: 698.46, time: 0.46, dur: 0.26 },
        ].forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);
          gain.gain.setValueAtTime(0.0001, now + time);
          gain.gain.linearRampToValueAtTime(0.85, now + time + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + time);
          osc.stop(now + time + dur);
          registerOsc(osc);
        });
        break;
      }
    }

    return true;
  } catch {
    return false;
  }
}

async function playChime(soundId: NotificationSoundId = 'classic-bell', volumePercent = 75): Promise<boolean> {
  return playNotificationSound(soundId, volumePercent);
}

function compressImage(file: File, maxDim = 600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function generateOrderId(existingOrders: Order[]): string {
  let id = '';
  let attempts = 0;
  do {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = `BC${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    } else {
      const rand = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0').toUpperCase();
      id = `BC${rand}`;
    }
    attempts++;
  } while (existingOrders.some(o => o.id === id) && attempts < 100);
  return id;
}

const emptyProfile = { name: '', email: '', phone: '', address: '' };

function useLocal<T>(key: string, initial: T, onError?: (msg: string) => void) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null || stored === undefined) return initial;
      return JSON.parse(stored) ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      const isQuota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);
      if (isQuota) {
        onError?.('Storage quota exceeded. Changes could not be saved to your browser.');
      } else {
        onError?.('Could not save data locally in this browser.');
      }
    }
  }, [key, value, onError]);
  return [value, setValue] as const;
}
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#734738] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#513023] focus-visible:ring-2 focus-visible:ring-[#b76b64] cursor-pointer disabled:opacity-60';
const field = 'min-h-11 w-full rounded-md border border-[#ded3c9] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ba7770]';
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 text-sm text-[#644d43]">{label}{children}</label>; }
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const getNodes = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, [href], [tabindex="0"]:not([tabindex="-1"])') || []).filter(el => !el.hasAttribute('disabled'));

    // Focus first interactive element once on initial mount
    const nodes = getNodes();
    nodes[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const all = getNodes();
        if (all.length === 0) return;
        const first = all[0];
        const last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = oldOverflow;
      previous?.focus?.();
    };
  }, []);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#30231f]/60 p-2 sm:p-4 backdrop-blur-sm overflow-y-auto" onMouseDown={e => e.target === e.currentTarget && closeRef.current()}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="my-auto max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-xl sm:rounded-2xl bg-[#fffdf9] p-4 sm:p-6 md:p-8 shadow-2xl border border-[#e8ded2]"><div className="mb-4 sm:mb-6 flex items-center justify-between gap-3"><h2 id="dialog-title" className="font-serif text-xl sm:text-2xl md:text-3xl pr-2 leading-tight">{title}</h2><button type="button" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full hover:bg-stone-100" aria-label="Close dialog" onClick={() => closeRef.current()}><Icon name="close" /></button></div>{children}</div></div>;
}

interface ProductCardProps {
  product: Product;
  isWished: boolean;
  onOpen: (product: Product) => void;
  onToggleWishlist: (productId: number) => void;
  onAddToCart: (product: Product) => void;
}

function ProductCard({ product: p, isWished, onOpen, onToggleWishlist, onAddToCart }: ProductCardProps) {
  return <article className="group flex flex-col min-w-0 overflow-hidden rounded-xl border border-[#e9dfd5] bg-white transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#5e3825]/5"><div className="relative aspect-[1.13] overflow-hidden bg-[#f1e9e2] shrink-0"><button className="block h-full w-full" onClick={() => onOpen(p)} aria-label={`View ${p.name}`}><Photo src={p.image} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></button>{p.bestseller && <span className="absolute left-2 top-2 sm:left-3 sm:top-3 rounded bg-[#fffaf1]/95 px-1.5 py-0.5 sm:px-2 sm:py-1 text-[10px] sm:text-xs font-medium text-[#6e4935] shadow-xs">Bestseller</span>}<button aria-label={isWished ? `Remove ${p.name} from wishlist` : `Save ${p.name}`} aria-pressed={isWished} onClick={() => onToggleWishlist(p.id)} className={`absolute right-1.5 top-1.5 sm:right-2 sm:top-2 flex min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center rounded-full bg-white/95 shadow-xs ${isWished ? 'text-[#a73c50]' : 'text-[#644d43]'}`}><Icon name="heart" className={`!h-4 !w-4 sm:!h-5 sm:!w-5 ${isWished ? 'fill-[#f7dce0]' : ''}`} /></button></div><div className="flex flex-1 flex-col p-3 sm:p-4"><div className="mb-1.5 sm:mb-2 flex items-center justify-between text-[11px] sm:text-xs text-[#76685d]"><span className="truncate">Freshly baked · Eggless</span><span className="flex items-center gap-1 shrink-0 ml-1"><Icon name="star" className="!h-3 !w-3 fill-[#9a6f35] text-[#9a6f35]" />{p.rating}</span></div><button onClick={() => onOpen(p)} className="min-h-10 sm:min-h-11 text-left font-serif text-base sm:text-lg md:text-xl leading-snug line-clamp-2 hover:text-[#734738]">{p.name}</button><div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><span className="text-sm sm:text-base font-semibold">{money(p.price)}</span><span className="ml-1 text-[11px] sm:text-xs text-[#76685d]">/ 500g</span></div><button onClick={() => onAddToCart(p)} disabled={!p.available} className="min-h-9 sm:min-h-10 rounded-md border border-[#b9a08e] px-2.5 sm:px-3 text-xs sm:text-sm font-medium transition hover:bg-[#734738] hover:text-white disabled:cursor-not-allowed disabled:opacity-50">{p.available ? '+ Add' : 'Sold out'}</button></div></div></article>;
}

const normalizePath = (raw: string) => {
  const cleaned = raw.replace(/^#/, '').trim();
  if (cleaned.startsWith('access_token=') || cleaned.startsWith('error=') || cleaned.includes('type=recovery')) {
    return '/account';
  }
  if (!cleaned || cleaned === '/') return '/';
  const pathOnly = cleaned.split('?')[0];
  const withoutTrailing = pathOnly.replace(/\/+$/, '');
  return withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;
};

const mapOrderToTrackedDetails = (o: Order): TrackedOrderDetails => {
  const step = o.status;
  const rawStatus = (o.rawStatus as OrderStatus) || (step === -1 ? 'rejected' : step === 5 ? 'delivered' : step === 4 ? 'out_for_delivery' : step === 3 ? 'ready_for_pickup' : step === 2 ? 'preparing' : step === 1 ? 'confirmed' : 'placed');

  return {
    order_number: o.id,
    customer_name: o.customer,
    customer_phone: o.phone,
    delivery_street_address: o.address,
    delivery_date: o.date,
    delivery_time_slot: o.time,
    status: rawStatus,
    subtotal_amount: o.subtotal ?? o.total,
    delivery_fee: o.deliveryFee ?? 0,
    discount_amount: o.discount ?? 0,
    total_amount: o.total,
    created_at: new Date(o.createdAt).toISOString(),
    payment_method: o.payment,
    payment_status: o.paymentStatus,
    items: o.items.map(it => ({
      product_name: it.name,
      product_image_url: it.image || null,
      weight_label: it.weight,
      egg_preference: it.egg,
      custom_message: it.message || null,
      unit_price: it.unitPrice,
      quantity: it.qty,
      total_price: it.unitPrice * it.qty,
    })),
    timeline: (o.timeline || []).map(t => ({
      from_status: null,
      to_status: (t.status as OrderStatus) || 'placed',
      notes: t.notes || null,
      created_at: t.created_at,
    })),
  };
};

export default function App() {
  const notify = (text: string) => { setToast(text); };
  const [products, setProducts] = useLocal<Product[]>('crumb-products-v1', initialProducts, notify);
  const [cart, setCart] = useLocal<CartItem[]>('crumb-cart-v1', [], notify);
  const [orders, setOrders] = useLocal<Order[]>('crumb-orders-v1', initialOrders, notify);
  const [wishlist, setWishlist] = useLocal<number[]>('crumb-wishlist-v1', [], notify);
  const [profile, setProfile] = useState<{
    name: string;
    email: string;
    phone: string;
    address: string;
  }>(emptyProfile);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFetchError, setProfileFetchError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');

  // Customer Saved Addresses Integration (Phase 5.5.4 & 5.5.6)
  const [customerAddresses, setCustomerAddresses] = useState<DatabaseAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesFetchError, setAddressesFetchError] = useState<string | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<DatabaseAddress | null>(null);
  const [addressFormFields, setAddressFormFields] = useState({
    street_address: '',
    landmark: '',
    city: 'Bejjanki',
    state: 'Telangana',
    postal_code: '505528',
  });
  const manuallyEditedFieldsRef = useRef<Set<string>>(new Set());
  const [addressActionLoadingId, setAddressActionLoadingId] = useState<string | null>(null);
  const [isSubmittingAddress, setIsSubmittingAddress] = useState(false);
  const [addressFormError, setAddressFormError] = useState('');
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [selectedCheckoutAddressId, setSelectedCheckoutAddressId] = useState<string | null>(null);
  const hasInitializedCheckoutAddressRef = useRef(false);
  const [path, setPath] = useState(() => normalizePath(location.hash.slice(1)));
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All treats');
  const [sort, setSort] = useState('Popular');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [weight, setWeight] = useState('500g');
  const [egg, setEgg] = useState('Eggless');
  const [message, setMessage] = useState('');
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState('');
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [productVariantTemplate, setProductVariantTemplate] = useState<VariantTemplateKey>('cake');
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [updatingProductAvailabilityId, setUpdatingProductAvailabilityId] = useState<number | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);

  // Admin Category Management State (Phase 6.5.3)
  const [adminCategories, setAdminCategories] = useState<AdminCategory[]>([]);
  const [adminCategoriesLoading, setAdminCategoriesLoading] = useState(false);
  const [adminCategoriesError, setAdminCategoriesError] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<AdminCategory | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isUploadingCategoryImage, setIsUploadingCategoryImage] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);
  const [sound, setSound] = useLocal('crumb-sound-v1', false);
  const [soundType, setSoundType] = useLocal<NotificationSoundId>('crumb-sound-type-v1', 'classic-bell');
  const [soundVolume, setSoundVolume] = useLocal<number>('crumb-sound-volume-v1', 75);
  const [previewingSoundId, setPreviewingSoundId] = useState<string | null>(null);

  const handleTestSound = async (overrideSoundId?: NotificationSoundId) => {
    const targetSound = overrideSoundId || soundType;
    setPreviewingSoundId(targetSound);
    const played = await playNotificationSound(targetSound, soundVolume);
    setTimeout(() => {
      setPreviewingSoundId(curr => (curr === targetSound ? null : curr));
    }, 700);

    if (played) {
      if (soundVolume === 0) {
        notify('Sound volume is set to 0% (muted).');
      } else {
        const soundObj = NOTIFICATION_SOUNDS.find(s => s.id === targetSound);
        notify(`Playing ${soundObj?.name || 'test sound'} at ${soundVolume}% volume.`);
      }
    } else {
      notify('Audio output is suspended. Please click anywhere on the page to enable sound playback.');
    }
  };
  const [authMode, setAuthMode] = useState('Login');
  const [mobileNav, setMobileNav] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [report, setReport] = useState('Weekly');
  const [stockOnly, setStockOnly] = useState(false);
  const [seen, setSeen] = useLocal('crumb-seen-v1', 0);
  const [business, setBusiness] = useLocal<BusinessInfo>('sln-business-info-v2', defaultBusinessInfo, notify);
  const [offerActive, setOfferActive] = useLocal('crumb-offer', true);

  // Centralized Supabase Auth & Role State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<AppRole[]>([]);
  const authRequestIdRef = useRef(0);
  const authUserIdRef = useRef<string | null>(null);
  const signedIn = Boolean(authUser);

  // Preserve intended admin route upon unauthenticated navigation
  const [adminRedirectPath, setAdminRedirectPath] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const initial = normalizePath(window.location.hash.slice(1));
      return initial.startsWith('/admin') ? initial : null;
    }
    return null;
  });

  // Form states for login, registration & recovery
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  // Supabase Catalogue & Settings State
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [categoriesList, setCategoriesList] = useState<string[]>(categories);
  const [isUsingOfflineCatalogue, setIsUsingOfflineCatalogue] = useState(false);

  // Secure Checkout State (Phase 1)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  // Two-step Email OTP Checkout State (Phase 5.3.1 / 5.3.2)
  const [checkoutStep, setCheckoutStep] = useState<'details' | 'otp'>('details');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '', '', '']);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpResendSeconds, setOtpResendSeconds] = useState(0);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const handleVerifyOtpRef = useRef<() => void>(() => {});

  // Resend countdown timer (Phase 5.3.2)
  useEffect(() => {
    if (checkoutStep !== 'otp' || otpResendSeconds <= 0) return;
    const timer = setInterval(() => {
      setOtpResendSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [checkoutStep, otpResendSeconds]);

  // Focus first OTP input when entering OTP verification screen
  useEffect(() => {
    if (checkoutStep === 'otp') {
      const timer = setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [checkoutStep]);

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setOtpError('');
    if (digit && index < 7) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
        const next = [...otpDigits];
        next[index - 1] = '';
        setOtpDigits(next);
        e.preventDefault();
      } else if (otpDigits[index]) {
        const next = [...otpDigits];
        next[index] = '';
        setOtpDigits(next);
        e.preventDefault();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && index < 7) {
      otpInputRefs.current[index + 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (otpDigits.join('').length === 8 && !isVerifyingOtp && !isSendingOtp) {
        e.preventDefault();
        handleVerifyOtpRef.current();
      }
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    const digits = pastedData.replace(/\D/g, '').slice(0, 8).split('');
    if (!digits.length) return;
    const next = [...otpDigits];
    digits.forEach((d, i) => {
      if (i < 8) next[i] = d;
    });
    setOtpDigits(next);
    setOtpError('');
    const targetIdx = Math.min(digits.length, 7);
    otpInputRefs.current[targetIdx]?.focus();
  };

  const handleBackToCheckoutDetails = () => {
    setCheckoutStep('details');
    setOtpDigits(['', '', '', '', '', '', '', '']);
    setOtpError('');
  };

  const handleResendOtp = async () => {
    if (otpResendSeconds > 0 || isSendingOtp) return;
    const targetEmail = (checkoutDraft.email || '').trim().toLowerCase();
    if (!targetEmail) {
      setOtpError('No email address found. Please go back to checkout details and re-enter your email.');
      return;
    }
    setIsSendingOtp(true);
    setOtpError('');
    try {
      const res = await sendEmailOtp(targetEmail, {
        fullName: checkoutDraft.name,
        phone: checkoutDraft.phone,
      });
      if (!res.success || res.error) {
        setOtpError(res.error?.message || 'Unable to resend verification code. Please try again.');
        return;
      }
      setOtpResendSeconds(60);
      notify(`A fresh verification code was sent to ${targetEmail}.`);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Unable to resend verification code. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };
  const [confirmedOrder, setConfirmedOrder] = useState<{
    orderNumber: string;
    total: number;
    status: string;
    customerName: string;
    customerEmail: string;
    deliveryAddress: string;
    deliveryDate: string;
    deliveryTimeSlot: string;
    paymentMethod: string;
    items: CartItem[];
    guestAccessToken?: string;
  } | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('slnb_latest_confirmed_order_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            typeof parsed.orderNumber === 'string' &&
            parsed.orderNumber.trim() &&
            typeof parsed.total === 'number' &&
            Array.isArray(parsed.items) &&
            parsed.items.length > 0
          ) {
            return parsed;
          }
        }
      } catch {
        // Safe fallback
      }
    }
    return null;
  });

  // Persistent Checkout Draft State (Phase 5.2 / 5.2.1: Account Isolated)
  interface CheckoutDraft {
    name: string;
    phone: string;
    email: string;
    address: string;
    pinCode: string;
    date: string;
    timeSlot: string;
    instructions: string;
    paymentMethod: string;
  }

  const GUEST_CHECKOUT_DRAFT_KEY = 'slnb_checkout_draft_guest_v1';
  const getCheckoutDraftKey = (userId?: string | null) => {
    return userId ? `slnb_checkout_draft_user_${userId}_v1` : GUEST_CHECKOUT_DRAFT_KEY;
  };

  const defaultCheckoutDraft: CheckoutDraft = {
    name: '',
    phone: '',
    email: '',
    address: '',
    pinCode: '',
    date: '',
    timeSlot: '10 AM – 1 PM',
    instructions: '',
    paymentMethod: 'Cash on delivery',
  };

  const loadCheckoutDraftFromStorage = (userId?: string | null): CheckoutDraft => {
    if (typeof window === 'undefined') return { ...defaultCheckoutDraft };
    try {
      const key = getCheckoutDraftKey(userId);
      let raw = localStorage.getItem(key);
      // Migration fallback for guest from legacy un-scoped key
      if (!raw && !userId) {
        raw = localStorage.getItem('slnb_checkout_draft_v1');
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            name: String(parsed.name || ''),
            phone: String(parsed.phone || ''),
            email: String(parsed.email || ''),
            address: String(parsed.address || ''),
            pinCode: String(parsed.pinCode || ''),
            date: String(parsed.date || ''),
            timeSlot: String(parsed.timeSlot || '10 AM – 1 PM'),
            instructions: String(parsed.instructions || ''),
            paymentMethod: String(parsed.paymentMethod || 'Cash on delivery'),
          };
        }
      }
    } catch {
      // Safe fallback
    }
    return { ...defaultCheckoutDraft };
  };

  const saveCheckoutDraftToStorage = (draft: CheckoutDraft, userId?: string | null) => {
    if (typeof window === 'undefined') return;
    try {
      const key = getCheckoutDraftKey(userId);
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // Safe fallback
    }
  };

  const clearCheckoutDraftFromStorage = (userId?: string | null) => {
    if (typeof window === 'undefined') return;
    try {
      const key = getCheckoutDraftKey(userId);
      localStorage.removeItem(key);
      if (!userId) {
        localStorage.removeItem('slnb_checkout_draft_v1');
      }
    } catch {
      // Safe fallback
    }
  };

  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft>(() => {
    return loadCheckoutDraftFromStorage(null);
  });

  const updateCheckoutDraft = (updates: Partial<CheckoutDraft>) => {
    setCheckoutDraft(prev => {
      const next = { ...prev, ...updates };
      if (updates.address && !updates.pinCode) {
        const match = updates.address.match(/\b([1-9][0-9]{5})\b/);
        if (match) next.pinCode = match[1];
      }
      saveCheckoutDraftToStorage(next, authUserIdRef.current);
      return next;
    });
  };

  const clearCheckoutDraft = (userId?: string | null) => {
    const targetUserId = userId !== undefined ? userId : authUserIdRef.current;
    setCheckoutDraft({ ...defaultCheckoutDraft });
    clearCheckoutDraftFromStorage(targetUserId);
  };

  // Pre-fill empty checkout draft fields from authenticated profile without overwriting entered values
  useEffect(() => {
    if (signedIn && authUser?.id) {
      setCheckoutDraft(prev => {
        let changed = false;
        const next = { ...prev };
        if (!next.name.trim() && profile.name.trim()) {
          next.name = profile.name.trim();
          changed = true;
        }
        if (!next.email.trim() && profile.email.trim()) {
          next.email = profile.email.trim();
          changed = true;
        }
        if (!next.phone.trim() && profile.phone.trim()) {
          next.phone = profile.phone.trim();
          changed = true;
        }
        if (!next.address.trim() && profile.address.trim()) {
          next.address = profile.address.trim();
          const match = profile.address.match(/\b([1-9][0-9]{5})\b/);
          if (match && !next.pinCode) next.pinCode = match[1];
          changed = true;
        }
        if (changed) {
          saveCheckoutDraftToStorage(next, authUser.id);
          return next;
        }
        return prev;
      });
    }
  }, [signedIn, authUser?.id, profile.name, profile.email, profile.phone, profile.address]);

  // Helper to format a Supabase saved address into the standard delivery address string
  const formatDatabaseAddressForDelivery = (addr: DatabaseAddress): string => {
    const parts: string[] = [];
    if (addr.street_address && addr.street_address.trim()) {
      parts.push(addr.street_address.trim());
    }
    if (addr.landmark && addr.landmark.trim()) {
      parts.push(`Landmark: ${addr.landmark.trim()}`);
    }
    const locality = [addr.city?.trim(), addr.state?.trim()].filter(Boolean).join(', ');
    const pin = addr.postal_code?.trim();
    if (locality && pin) {
      parts.push(`${locality} - ${pin}`);
    } else if (locality) {
      parts.push(locality);
    } else if (pin) {
      parts.push(pin);
    }
    return parts.filter(Boolean).join(', ');
  };

  // Phase 5.5.5: Reset checkout default-address initialization when customer navigates away from /checkout
  useEffect(() => {
    if (path !== '/checkout') {
      hasInitializedCheckoutAddressRef.current = false;
      setSelectedCheckoutAddressId(null);
    } else if (signedIn && authUser?.id) {
      // Re-fetch saved addresses when re-entering checkout to ensure latest Supabase default is evaluated
      loadCustomerAddresses();
    }
  }, [path, signedIn, authUser?.id]);

  // Phase 5.5.5: Automatically synchronize and select the customer's Supabase default address for checkout
  useEffect(() => {
    if (path === '/checkout' && signedIn && authUser?.id && customerAddresses.length > 0 && !hasInitializedCheckoutAddressRef.current) {
      // Only auto-initialize if customer hasn't chosen manual entry during this visit
      if (selectedCheckoutAddressId !== 'manual') {
        const defaultAddr = customerAddresses.find(a => a.is_default) || customerAddresses[0];
        if (defaultAddr) {
          setSelectedCheckoutAddressId(defaultAddr.id);
          hasInitializedCheckoutAddressRef.current = true;
          const formatted = formatDatabaseAddressForDelivery(defaultAddr);
          updateCheckoutDraft({
            address: formatted,
            pinCode: defaultAddr.postal_code?.trim() || '505528',
            name: defaultAddr.recipient_name?.trim() || checkoutDraft.name,
            phone: defaultAddr.phone?.trim() || checkoutDraft.phone,
          });
        }
      }
    }
  }, [path, signedIn, authUser?.id, customerAddresses, selectedCheckoutAddressId]);

  // If a selected saved address was deleted from Account, fall back to current default
  useEffect(() => {
    if (!signedIn || customerAddresses.length === 0) return;
    if (
      selectedCheckoutAddressId &&
      selectedCheckoutAddressId !== 'manual' &&
      !customerAddresses.some(a => a.id === selectedCheckoutAddressId)
    ) {
      const defaultAddr = customerAddresses.find(a => a.is_default) || customerAddresses[0];
      if (defaultAddr) {
        setSelectedCheckoutAddressId(defaultAddr.id);
        const formatted = formatDatabaseAddressForDelivery(defaultAddr);
        updateCheckoutDraft({
          address: formatted,
          pinCode: defaultAddr.postal_code?.trim() || '505528',
          name: defaultAddr.recipient_name?.trim() || checkoutDraft.name,
          phone: defaultAddr.phone?.trim() || checkoutDraft.phone,
        });
      }
    }
  }, [signedIn, customerAddresses, selectedCheckoutAddressId]);

  const handleSelectSavedAddress = (addr: DatabaseAddress) => {
    setSelectedCheckoutAddressId(addr.id);
    const formatted = formatDatabaseAddressForDelivery(addr);
    updateCheckoutDraft({
      address: formatted,
      pinCode: addr.postal_code?.trim() || '505528',
      name: addr.recipient_name?.trim() || checkoutDraft.name,
      phone: addr.phone?.trim() || checkoutDraft.phone,
    });
  };

  const handleSelectManualAddress = () => {
    setSelectedCheckoutAddressId('manual');
  };

  // Customer & Guest Order Tracking State (Phase 2)
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);
  const [customerOrdersError, setCustomerOrdersError] = useState<string | null>(null);
  const isFetchingCustomerOrdersRef = useRef(false);

  // Admin Live Orders State (Connected to Supabase)
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);
  const [adminOrdersError, setAdminOrdersError] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const [newOrderAlert, setNewOrderAlert] = useState<{
    id: string;
    orderNumber: string;
    amount: number;
    customer: string;
  } | null>(null);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const customerOrderStatusCacheRef = useRef<Map<string, string>>(new Map());
  const isGuestPollingRef = useRef(false);

  // Sound preference references to avoid subscription recreation on volume/sound change
  const soundRef = useRef(sound);
  const soundTypeRef = useRef(soundType);
  const soundVolumeRef = useRef(soundVolume);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  useEffect(() => {
    soundTypeRef.current = soundType;
  }, [soundType]);

  useEffect(() => {
    soundVolumeRef.current = soundVolume;
  }, [soundVolume]);

  useEffect(() => {
    if (!newOrderAlert) return;
    const timer = setTimeout(() => {
      setNewOrderAlert(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [newOrderAlert]);

  useEffect(() => {
    if (!highlightedOrderId) return;
    const timer = setTimeout(() => {
      setHighlightedOrderId(null);
    }, 20000);
    return () => clearTimeout(timer);
  }, [highlightedOrderId]);

  // Realtime 3-play chime queue and timers management
  const alertTimersRef = useRef<number[]>([]);
  const isPlayingTripleAlertRef = useRef(false);
  const pendingAlertCountRef = useRef(0);

  const clearAlertTimers = () => {
    alertTimersRef.current.forEach(timer => clearTimeout(timer));
    alertTimersRef.current = [];
    pendingAlertCountRef.current = 0;
    isPlayingTripleAlertRef.current = false;
    stopActiveNotificationSound();
  };

  const processAlertQueue = () => {
    if (isPlayingTripleAlertRef.current) return;
    if (pendingAlertCountRef.current <= 0) return;
    if (!soundRef.current || soundVolumeRef.current <= 0) {
      pendingAlertCountRef.current = 0;
      return;
    }

    isPlayingTripleAlertRef.current = true;
    pendingAlertCountRef.current -= 1;

    // 1st play: immediate
    void playNotificationSound(soundTypeRef.current, soundVolumeRef.current);

    // 2nd play: after ~700ms
    const t1 = window.setTimeout(() => {
      alertTimersRef.current = alertTimersRef.current.filter(t => t !== t1);
      if (!soundRef.current || soundVolumeRef.current <= 0) {
        isPlayingTripleAlertRef.current = false;
        return;
      }
      void playNotificationSound(soundTypeRef.current, soundVolumeRef.current);

      // 3rd play: after another ~700ms (1400ms from start)
      const t2 = window.setTimeout(() => {
        alertTimersRef.current = alertTimersRef.current.filter(t => t !== t2);
        if (!soundRef.current || soundVolumeRef.current <= 0) {
          isPlayingTripleAlertRef.current = false;
          return;
        }
        void playNotificationSound(soundTypeRef.current, soundVolumeRef.current);

        // Sequence cooldown: allow tone to ring out (~700ms) before next queued alert
        const t3 = window.setTimeout(() => {
          alertTimersRef.current = alertTimersRef.current.filter(t => t !== t3);
          isPlayingTripleAlertRef.current = false;
          if (pendingAlertCountRef.current > 0) {
            processAlertQueue();
          }
        }, 700);
        alertTimersRef.current.push(t3);
      }, 700);
      alertTimersRef.current.push(t2);
    }, 700);
    alertTimersRef.current.push(t1);
  };

  const triggerNewOrderChime = () => {
    if (!soundRef.current || soundVolumeRef.current <= 0) return;
    // Cap pending alerts queue to prevent infinite audio playback on bursts
    pendingAlertCountRef.current = Math.min(pendingAlertCountRef.current + 1, 2);
    processAlertQueue();
  };

  useEffect(() => {
    return () => {
      clearAlertTimers();
    };
  }, []);

  // Phase 4.3: Desktop Browser Notifications State & Handlers
  const [desktopNotifications, setDesktopNotifications] = useLocal<boolean>('crumb-desktop-notifications-v1', false);
  const desktopNotificationsRef = useRef(desktopNotifications);
  useEffect(() => {
    desktopNotificationsRef.current = desktopNotifications;
  }, [desktopNotifications]);

  type DesktopPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';
  const getBrowserNotificationPermission = (): DesktopPermissionState => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission as DesktopPermissionState;
  };

  const [desktopPermission, setDesktopPermission] = useState<DesktopPermissionState>(getBrowserNotificationPermission);

  useEffect(() => {
    const updatePermission = () => {
      setDesktopPermission(getBrowserNotificationPermission());
    };
    window.addEventListener('focus', updatePermission);
    return () => {
      window.removeEventListener('focus', updatePermission);
    };
  }, []);

  const requestDesktopNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      notify('Desktop notifications are not supported by this browser.');
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setDesktopPermission(res as DesktopPermissionState);
      if (res === 'granted') {
        setDesktopNotifications(true);
        notify('Desktop notifications enabled successfully!');
      } else if (res === 'denied') {
        setDesktopNotifications(false);
        notify('Desktop notifications are blocked in your browser site settings.');
      }
    } catch {
      notify('Unable to request desktop notification permission.');
    }
  };

  const handleTestDesktopNotification = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      notify('Desktop notifications are not supported by this browser.');
      return;
    }
    if (Notification.permission !== 'granted') {
      notify('Notification permission is not granted yet.');
      return;
    }

    try {
      const testNotif = new Notification('Sri Laxmi Narasimha Bakery', {
        body: 'Test Notification — Desktop order alerts are working properly!',
        icon: '/favicon.ico',
        tag: 'slnb-test-desktop-notification',
        silent: true,
      });

      testNotif.onclick = () => {
        try {
          window.focus();
        } catch {}
        testNotif.close();
      };

      notify('Sample desktop notification sent.');
    } catch {
      notify('Failed to display sample desktop notification.');
    }
  };

  const sendAdminDesktopNotification = (orderNumber: string, amount: number) => {
    if (!isStaffOrAdmin || !signedIn) return;
    if (!desktopNotificationsRef.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const notif = new Notification('Sri Laxmi Narasimha Bakery', {
        body: `New Order Received — #${orderNumber} · ${money(amount)}`,
        icon: '/favicon.ico',
        tag: `slnb-order-${orderNumber}`,
        silent: true, // prevents OS chime from clashing with custom bakery 3-play chime
      });

      notif.onclick = () => {
        try {
          window.focus();
        } catch {}
        window.location.hash = '#/admin/orders';
        const target = adminOrders.find(o => o.id === orderNumber);
        if (target) {
          setDetail(target);
        }
        notif.close();
      };
    } catch (err) {
      console.warn('[Desktop Notification] Failed to display:', err);
    }
  };

  const [guestTrackNumber, setGuestTrackNumber] = useState('');
  const [guestTrackToken, setGuestTrackToken] = useState('');
  const [guestTrackLoading, setGuestTrackLoading] = useState(false);
  const [guestTrackError, setGuestTrackError] = useState<string | null>(null);
  const [guestOrderResult, setGuestOrderResult] = useState<TrackedOrderDetails | null>(null);
  const [selectedTrackOrderNumber, setSelectedTrackOrderNumber] = useState<string | null>(null);
  const isGuestTrackingRef = useRef(false);
  const [savedGuestOrders, setSavedGuestOrders] = useState<Array<{
    order_number: string;
    guest_access_token: string;
    created_at: string;
    total: number;
    status?: string;
  }>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('slnb_guest_orders');
        if (raw) {
          const data = JSON.parse(raw);
          if (Array.isArray(data)) {
            return data.filter(item => Boolean(item && item.order_number && item.guest_access_token));
          }
        }
      } catch {
        // Safe fallback
      }
    }
    return [];
  });
  const [savedGuestOrdersLoading, setSavedGuestOrdersLoading] = useState(false);
  const [showManualTrack, setShowManualTrack] = useState(false);
  const checkoutIdempotencyKeyRef = useRef<string>('');
  if (!checkoutIdempotencyKeyRef.current) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      checkoutIdempotencyKeyRef.current = crypto.randomUUID();
    } else {
      checkoutIdempotencyKeyRef.current = 'idemp-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  const loadCatalogueAndSettings = async () => {
    setCatalogueLoading(true);
    setCatalogueError(null);
    try {
      const [productsRes, categoriesRes, settingsRes] = await Promise.all([
        fetchProductsWithDetails(),
        fetchCategories(),
        fetchBakerySettings(),
      ]);

      if (productsRes.error) {
        throw new Error(`Catalogue error: ${productsRes.error.message}`);
      }
      if (categoriesRes.error) {
        throw new Error(`Category error: ${categoriesRes.error.message}`);
      }

      if (productsRes.products && productsRes.products.length > 0) {
        const mapped = productsRes.products.map(mapDatabaseProductToFrontend);
        setProducts(mapped);
      }
      if (categoriesRes.categories && categoriesRes.categories.length > 0) {
        setCategoriesList(categoriesRes.categories.map(c => c.name));
      }
      if (settingsRes.settings) {
        setBusiness(mapDatabaseSettingsToBusinessInfo(settingsRes.settings));
      }
      setCatalogueError(null);
      setIsUsingOfflineCatalogue(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to connect to live catalogue database.';
      setCatalogueError(msg);
    } finally {
      setCatalogueLoading(false);
    }
  };

  // Customer Profile Integration (Phase 5.5.3)
  const loadCustomerProfile = async (targetUser?: User | null) => {
    const userToFetch = targetUser !== undefined ? targetUser : authUser;
    if (!userToFetch?.id) {
      setProfile(emptyProfile);
      setProfileLoading(false);
      setProfileFetchError(null);
      return;
    }

    const currentRequestId = authRequestIdRef.current;
    setProfileLoading(true);
    setProfileFetchError(null);

    try {
      const { profile: dbProfile, error } = await fetchCustomerProfile();
      // Guard against stale async resolution across account switches or logout
      if (currentRequestId !== authRequestIdRef.current) return;

      if (error) {
        setProfileFetchError(error.message);
        // Fall back to auth user metadata if database profile fetch fails, but ensure authoritative email
        const metaName = (userToFetch.user_metadata?.full_name || userToFetch.user_metadata?.name || '') as string;
        const metaPhone = (userToFetch.user_metadata?.phone || '') as string;
        setProfile(prev => ({
          name: prev.name || metaName,
          email: userToFetch.email || '',
          phone: prev.phone || metaPhone,
          address: prev.address || '',
        }));
      } else if (dbProfile) {
        setProfile(prev => ({
          name: dbProfile.full_name || '',
          email: userToFetch.email || dbProfile.email || '', // Authoritative session email
          phone: dbProfile.phone || '',
          address: prev.address || '',
        }));
        setProfileFetchError(null);
      }
    } catch (err: unknown) {
      if (currentRequestId !== authRequestIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load profile';
      setProfileFetchError(msg);
    } finally {
      if (currentRequestId === authRequestIdRef.current) {
        setProfileLoading(false);
      }
    }
  };

  const handleProfileSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSavingProfile) return;

    const d = new FormData(e.currentTarget);
    const fullName = String(d.get('name') || '').trim();
    const phone = String(d.get('phone') || '').trim();

    if (!fullName) {
      setProfileSaveError('Full name cannot be empty.');
      return;
    }

    setIsSavingProfile(true);
    setProfileSaveError('');

    try {
      const { profile: updatedProfile, error } = await updateCustomerProfile({
        full_name: fullName,
        phone: phone || null,
      });

      if (error || !updatedProfile) {
        setProfileSaveError(error?.message || 'Failed to update profile. Please try again.');
        return;
      }

      // Refresh profile state using authoritative database result
      setProfile(prev => ({
        ...prev,
        name: updatedProfile.full_name,
        email: authUser?.email || updatedProfile.email || prev.email,
        phone: updatedProfile.phone || '',
      }));

      // Update active user checkout draft to keep full name & phone synchronized
      if (authUser?.id) {
        setCheckoutDraft(prev => {
          const next = {
            ...prev,
            name: updatedProfile.full_name,
            phone: updatedProfile.phone || prev.phone,
          };
          saveCheckoutDraftToStorage(next, authUser.id);
          return next;
        });
      }

      notify('Profile updated successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred while saving your profile.';
      setProfileSaveError(msg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Customer Saved Addresses Integration (Phase 5.5.4)
  const loadCustomerAddresses = async (targetUser?: User | null) => {
    const userToFetch = targetUser !== undefined ? targetUser : authUser;
    if (!userToFetch?.id) {
      setCustomerAddresses([]);
      setAddressesLoading(false);
      setAddressesFetchError(null);
      return;
    }

    const currentRequestId = authRequestIdRef.current;
    setAddressesLoading(true);
    setAddressesFetchError(null);

    try {
      const { addresses, error } = await fetchCustomerAddresses();
      // Guard against stale async resolution across account switches or logout
      if (currentRequestId !== authRequestIdRef.current) return;

      if (error) {
        setAddressesFetchError(error.message);
      } else {
        setCustomerAddresses(addresses || []);
        setAddressesFetchError(null);
      }
    } catch (err: unknown) {
      if (currentRequestId !== authRequestIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load saved addresses';
      setAddressesFetchError(msg);
    } finally {
      if (currentRequestId === authRequestIdRef.current) {
        setAddressesLoading(false);
      }
    }
  };

  const handleSaveAddress = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmittingAddress) return;

    const d = new FormData(e.currentTarget);
    const label = String(d.get('label') || 'Home').trim() || 'Home';
    const recipientName = String(d.get('recipient_name') || '').trim();
    const phone = String(d.get('phone') || '').trim();
    const streetAddress = String(d.get('street_address') || '').trim();
    const landmarkRaw = String(d.get('landmark') || '').trim();
    const city = String(d.get('city') || 'Bejjanki').trim() || 'Bejjanki';
    const state = String(d.get('state') || 'Telangana').trim() || 'Telangana';
    const postalCode = String(d.get('postal_code') || '505528').trim() || '505528';
    const isDefault = Boolean(d.get('is_default'));

    if (!recipientName) {
      setAddressFormError('Recipient name is required.');
      return;
    }
    if (!phone) {
      setAddressFormError('Phone number is required.');
      return;
    }
    const phonePattern = /^[+0-9 ()\-]{10,16}$/;
    if (!phonePattern.test(phone)) {
      setAddressFormError('Please enter a valid phone number (10 to 16 digits).');
      return;
    }
    if (!streetAddress) {
      setAddressFormError('Street address is required.');
      return;
    }

    setIsSubmittingAddress(true);
    setAddressFormError('');

    try {
      if (editingAddress) {
        const { address: updated, error } = await updateCustomerAddress(editingAddress.id, {
          label,
          recipient_name: recipientName,
          phone,
          street_address: streetAddress,
          landmark: landmarkRaw ? landmarkRaw : null, // null explicitly clears landmark via p_update_landmark
          city,
          state,
          postal_code: postalCode,
          is_default: isDefault,
        });

        if (error || !updated) {
          setAddressFormError(error?.message || 'Failed to update delivery address.');
          return;
        }

        notify('Delivery address updated successfully.');
      } else {
        const { address: created, error } = await createCustomerAddress({
          label,
          recipient_name: recipientName,
          phone,
          street_address: streetAddress,
          landmark: landmarkRaw ? landmarkRaw : null,
          city,
          state,
          postal_code: postalCode,
          is_default: isDefault || customerAddresses.length === 0,
        });

        if (error || !created) {
          setAddressFormError(error?.message || 'Failed to save delivery address.');
          return;
        }

        notify('New delivery address saved.');
      }

      setIsAddressModalOpen(false);
      setEditingAddress(null);
      await loadCustomerAddresses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while saving the address.';
      setAddressFormError(msg);
    } finally {
      setIsSubmittingAddress(false);
    }
  };

  const handleSetDefaultAddress = async (address: DatabaseAddress) => {
    if (address.is_default || addressActionLoadingId) return;

    setAddressActionLoadingId(address.id);
    try {
      const { error } = await updateCustomerAddress(address.id, {
        is_default: true,
      });

      if (error) {
        notify(error.message);
      } else {
        notify(`"${address.label || 'Address'}" set as your default delivery address.`);
        await loadCustomerAddresses();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set default address';
      notify(msg);
    } finally {
      setAddressActionLoadingId(null);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (addressActionLoadingId) return;

    setAddressActionLoadingId(addressId);
    try {
      const { success, error } = await deleteCustomerAddress(addressId);
      if (error || !success) {
        notify(error?.message || 'Failed to delete address.');
      } else {
        notify('Address removed successfully.');
        setDeletingAddressId(null);
        setSelectedCheckoutAddressId(null);
        hasInitializedCheckoutAddressRef.current = false;
        await loadCustomerAddresses();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete address';
      notify(msg);
    } finally {
      setAddressActionLoadingId(null);
    }
  };

  const loadCustomerOrders = async (targetOrderNumber?: string | unknown) => {
    if (isFetchingCustomerOrdersRef.current) return;
    isFetchingCustomerOrdersRef.current = true;
    setCustomerOrdersLoading(true);
    setCustomerOrdersError(null);
    try {
      const { orders: liveOrders, error } = await fetchCustomerOrders();
      if (error) {
        setCustomerOrdersError(error.message);
      } else {
        // Cache current order statuses to prevent duplicate toasts on non-status updates
        liveOrders.forEach(o => {
          if (o.id) {
            customerOrderStatusCacheRef.current.set(
              o.id,
              (o.rawStatus as string) || (o.status === -1 ? 'rejected' : o.status === 5 ? 'delivered' : o.status === 4 ? 'out_for_delivery' : o.status === 3 ? 'ready_for_pickup' : o.status === 2 ? 'preparing' : o.status === 1 ? 'confirmed' : 'placed')
            );
          }
        });
        setCustomerOrders(liveOrders);
        setDetail(currentDetail => {
          if (!currentDetail) return null;
          const fresh = liveOrders.find(o => o.id === currentDetail.id);
          return fresh ? fresh : currentDetail;
        });

        // Sync track-order page if an authenticated order is being tracked
        const targetId = typeof targetOrderNumber === 'string' ? targetOrderNumber : undefined;
        const activeNum = targetId || selectedTrackOrderNumber || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('slnb_track_order_number') : null);
        if (activeNum) {
          const freshTrack = liveOrders.find(o => o.id === activeNum);
          if (freshTrack) {
            setGuestOrderResult(mapOrderToTrackedDetails(freshTrack));
          }
        }
      }
    } catch (err) {
      setCustomerOrdersError(err instanceof Error ? err.message : 'Failed to fetch customer orders.');
    } finally {
      isFetchingCustomerOrdersRef.current = false;
      setCustomerOrdersLoading(false);
    }
  };

  const trackCustomerOrder = (orderId: string) => {
    setSelectedTrackOrderNumber(orderId);
    setGuestTrackError(null);
    try {
      sessionStorage.setItem('slnb_track_order_number', orderId);
    } catch {}

    const existing = customerOrders.find(o => o.id === orderId);
    if (existing) {
      setGuestOrderResult(mapOrderToTrackedDetails(existing));
    } else {
      setGuestOrderResult(null);
    }
    go('/track-order');
    loadCustomerOrders(orderId);
  };

  const loadAdminOrders = async () => {
    setAdminOrdersLoading(true);
    setAdminOrdersError(null);
    try {
      const { orders: liveOrders, error } = await fetchAdminOrders();
      if (error) {
        setAdminOrdersError(error.message);
      } else {
        // Record all existing order IDs into deduplication set so they never trigger false alerts
        liveOrders.forEach(o => {
          if (o.id) knownOrderIdsRef.current.add(o.id);
        });
        setAdminOrders(liveOrders);
      }
    } catch (err) {
      setAdminOrdersError(err instanceof Error ? err.message : 'Failed to fetch admin orders.');
    } finally {
      setAdminOrdersLoading(false);
    }
  };

  const loadSavedGuestOrders = async () => {
    let parsed: Array<{
      order_number: string;
      guest_access_token: string;
      created_at: string;
      total: number;
      status?: string;
    }> = [];
    try {
      const raw = localStorage.getItem('slnb_guest_orders');
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          parsed = data.filter(item => Boolean(item && item.order_number && item.guest_access_token));
        }
      }
    } catch {
      // ignore
    }
    setSavedGuestOrders(parsed);
    if (parsed.length === 0) return [];

    setSavedGuestOrdersLoading(true);
    try {
      const updated = await Promise.all(
        parsed.map(async item => {
          try {
            const { data } = await fetchGuestOrderByToken(item.order_number, item.guest_access_token);
            if (data?.status) {
              return { ...item, status: data.status, total: data.total_amount || item.total };
            }
          } catch {
            // Keep existing entry if lookup fails
          }
          return item;
        })
      );
      setSavedGuestOrders(updated);
      try {
        localStorage.setItem('slnb_guest_orders', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    } finally {
      setSavedGuestOrdersLoading(false);
    }
  };

  const handleTrackGuestOrder = async (orderNum?: string, token?: string) => {
    if (isGuestTrackingRef.current) return;
    const targetNum = (orderNum !== undefined ? orderNum : guestTrackNumber).trim().toUpperCase();
    const targetToken = (token !== undefined ? token : guestTrackToken).trim();

    if (!targetNum) {
      setGuestTrackError('Please enter your bakery order number (e.g. BCB5DB49).');
      return;
    }
    if (!targetToken) {
      setGuestTrackError('Please enter your secret guest access token.');
      return;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetToken)) {
      setGuestTrackError('Please provide a valid 36-character guest access token.');
      return;
    }

    isGuestTrackingRef.current = true;
    setGuestTrackLoading(true);
    setGuestTrackError(null);

    try {
      const { data, error } = await fetchGuestOrderByToken(targetNum, targetToken);
      if (error || !data) {
        setGuestTrackError(error?.message || 'No order found matching this order number and access token.');
        if (!guestOrderResult || guestOrderResult.order_number !== targetNum) {
          setGuestOrderResult(null);
        }
      } else {
        setGuestOrderResult(data);
        setGuestTrackNumber(targetNum);
        setGuestTrackToken(targetToken);

        // Keep savedGuestOrders updated with the latest live status
        setSavedGuestOrders(prev => {
          const index = prev.findIndex(o => o.order_number === targetNum);
          let updated: typeof prev;
          if (index >= 0) {
            updated = [...prev];
            updated[index] = { ...updated[index], status: data.status, total: data.total_amount || updated[index].total };
          } else {
            updated = [{
              order_number: targetNum,
              guest_access_token: targetToken,
              created_at: data.created_at || new Date().toISOString(),
              total: data.total_amount,
              status: data.status,
            }, ...prev];
          }
          try {
            localStorage.setItem('slnb_guest_orders', JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });

        // Store active tracked order in sessionStorage for seamless page refresh recovery
        try {
          sessionStorage.setItem('slnb_active_guest_track', JSON.stringify({ order_number: targetNum, token: targetToken }));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setGuestTrackError(err instanceof Error ? err.message : 'Unable to connect to order tracking service.');
      if (!guestOrderResult || guestOrderResult.order_number !== targetNum) {
        setGuestOrderResult(null);
      }
    } finally {
      isGuestTrackingRef.current = false;
      setGuestTrackLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogueAndSettings();
  }, []);

  useEffect(() => {
    if (path === '/track-order') {
      if (signedIn) {
        const storedOrderNum = selectedTrackOrderNumber || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('slnb_track_order_number') : null);
        if (storedOrderNum) {
          setSelectedTrackOrderNumber(storedOrderNum);
          const existing = customerOrders.find(o => o.id === storedOrderNum);
          if (existing) {
            setGuestOrderResult(mapOrderToTrackedDetails(existing));
          }
        } else if (customerOrders.length > 0 && !guestOrderResult) {
          setSelectedTrackOrderNumber(customerOrders[0].id);
          setGuestOrderResult(mapOrderToTrackedDetails(customerOrders[0]));
        }
        loadCustomerOrders(storedOrderNum || undefined);
      } else {
        loadSavedGuestOrders().then(updatedList => {
          // Check if an active guest order was being tracked before refresh
          let activeTrack: { order_number: string; token: string } | null = null;
          try {
            const raw = sessionStorage.getItem('slnb_active_guest_track');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.order_number && parsed?.token) activeTrack = parsed;
            }
          } catch {}

          if (activeTrack) {
            handleTrackGuestOrder(activeTrack.order_number, activeTrack.token);
          } else if (updatedList && updatedList.length > 0 && !guestOrderResult && !guestTrackNumber) {
            const latest = updatedList[0];
            handleTrackGuestOrder(latest.order_number, latest.guest_access_token);
          }
        });
      }
    }
  }, [path, signedIn]);

  useEffect(() => {
    // Detect expired links or recovery tokens on mount
    const rawHash = typeof window !== 'undefined' ? window.location.hash || '' : '';
    const rawSearch = typeof window !== 'undefined' ? window.location.search || '' : '';
    const hashParams = new URLSearchParams(rawHash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(rawSearch.replace(/^\?/, ''));

    const err = hashParams.get('error') || searchParams.get('error') || hashParams.get('error_code') || searchParams.get('error_code');
    const errDesc = hashParams.get('error_description') || searchParams.get('error_description');

    if (err) {
      if (err === 'access_denied' || err === 'otp_expired' || errDesc?.toLowerCase().includes('expired') || errDesc?.toLowerCase().includes('invalid')) {
        setAuthError('This password recovery link has expired or is invalid. Please request a new reset email.');
        setAuthMode('Forgot Password');
        setPath('/account');
        return;
      }
    }

    if (hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery') {
      setIsRecoveryMode(true);
      setAuthMode('Set New Password');
      setPath('/account');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function handleSessionUpdate(sessionUser: User | null) {
      const requestId = ++authRequestIdRef.current;

      if (!sessionUser) {
        if (isMounted && requestId === authRequestIdRef.current) {
          setAuthUser(null);
          authUserIdRef.current = null;
          setUserRoles([]);
          setAuthLoading(false);
          setCustomerOrders([]);
          setAdminOrders([]);
          setAdminOrdersError(null);
          setProfile(emptyProfile);
          setProfileLoading(false);
          setProfileFetchError(null);
          setProfileSaveError('');
          setCustomerAddresses([]);
          setAddressesLoading(false);
          setAddressesFetchError(null);
          setIsAddressModalOpen(false);
          setEditingAddress(null);
          setAddressActionLoadingId(null);
          setDeletingAddressId(null);
          setSelectedCheckoutAddressId(null);
          hasInitializedCheckoutAddressRef.current = false;
          // Load clean guest draft so signed-out customer information is not exposed
          setCheckoutDraft(loadCheckoutDraftFromStorage(null));
          try {
            localStorage.removeItem('crumb-profile-v1');
          } catch {
            // ignore
          }
        }
        return;
      }

      if (isMounted && requestId === authRequestIdRef.current) {
        if (authUserIdRef.current !== sessionUser.id) {
          setSelectedCheckoutAddressId(null);
          hasInitializedCheckoutAddressRef.current = false;
        }
        setAuthUser(sessionUser);
        authUserIdRef.current = sessionUser.id;
        const metaName = (sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || '') as string;
        const metaPhone = (sessionUser.user_metadata?.phone || '') as string;
        // Cleanly initialize this user's profile with authoritative session email without cross-user leak
        setProfile({
          name: metaName,
          email: sessionUser.email || '',
          phone: metaPhone,
          address: '',
        });
        loadCustomerProfile(sessionUser);
        loadCustomerOrders();
        loadCustomerAddresses(sessionUser);

        // Account-isolated draft management during session update (e.g. OTP verification or login mid-checkout)
        const guestDraft = loadCheckoutDraftFromStorage(null);
        const hasGuestDraftContent = Boolean(
          guestDraft.address.trim() ||
          guestDraft.phone.trim() ||
          guestDraft.name.trim() ||
          guestDraft.instructions.trim() ||
          guestDraft.date.trim()
        );

        const existingUserDraft = loadCheckoutDraftFromStorage(sessionUser.id);

        let resolvedDraft: CheckoutDraft;
        if (hasGuestDraftContent) {
          // Customer was actively checking out as a guest and just authenticated (e.g. via OTP).
          // Seamlessly migrate guest draft to the authenticated customer's account:
          resolvedDraft = {
            name: guestDraft.name.trim() || existingUserDraft.name.trim() || metaName,
            email: sessionUser.email || guestDraft.email.trim() || existingUserDraft.email.trim(),
            phone: guestDraft.phone.trim() || existingUserDraft.phone.trim() || metaPhone,
            address: guestDraft.address.trim() || existingUserDraft.address.trim(),
            pinCode: guestDraft.pinCode.trim() || existingUserDraft.pinCode.trim(),
            date: guestDraft.date.trim() || existingUserDraft.date.trim(),
            timeSlot: guestDraft.timeSlot.trim() || existingUserDraft.timeSlot.trim() || '10 AM – 1 PM',
            instructions: guestDraft.instructions.trim() || existingUserDraft.instructions.trim(),
            paymentMethod: guestDraft.paymentMethod || existingUserDraft.paymentMethod || 'Cash on delivery',
          };
          saveCheckoutDraftToStorage(resolvedDraft, sessionUser.id);
          // Clear guest draft so guest storage does not linger with customer data
          clearCheckoutDraftFromStorage(null);
        } else {
          // Standard login / session restore: load ONLY this user's draft, pre-filling empty contact info from metadata
          resolvedDraft = {
            ...existingUserDraft,
            name: existingUserDraft.name.trim() || metaName,
            email: sessionUser.email || existingUserDraft.email.trim(),
            phone: existingUserDraft.phone.trim() || metaPhone,
          };
          saveCheckoutDraftToStorage(resolvedDraft, sessionUser.id);
        }

        setCheckoutDraft(resolvedDraft);
      }

      try {
        const { roles, error: rolesError } = await getUserRoles(sessionUser.id);
        if (!isMounted || requestId !== authRequestIdRef.current) return;

        if (rolesError || !roles) {
          setUserRoles([]);
        } else {
          setUserRoles(roles);
          if (roles.includes('admin') || roles.includes('staff')) {
            loadAdminOrders();
            loadAdminCategories();
          }
        }
      } catch {
        if (isMounted && requestId === authRequestIdRef.current) {
          setUserRoles([]);
        }
      } finally {
        if (isMounted && requestId === authRequestIdRef.current) {
          setAuthLoading(false);
        }
      }
    }

    // 1. Initial session retrieval
    getCurrentSession().then(({ session }) => {
      handleSessionUpdate(session?.user ?? null);
    });

    // 2. Real-time auth state subscription
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
        setAuthMode('Set New Password');
        setPath('/account');
      }
      handleSessionUpdate(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAdminUser = userRoles.includes('admin');
  const isStaffOrAdmin = userRoles.includes('admin') || userRoles.includes('staff');

  useEffect(() => {
    if (isStaffOrAdmin && (path === '/admin' || path === '/admin/orders')) {
      loadAdminOrders();
    }
    if (isStaffOrAdmin && (path === '/admin' || path === '/admin/categories')) {
      loadAdminCategories();
    }
  }, [path, isStaffOrAdmin]);

  useEffect(() => {
    if (signedIn && (path === '/account' || path === '/account/orders')) {
      loadCustomerOrders();
    }
    if (signedIn && (path === '/account/addresses' || path === '/checkout')) {
      loadCustomerAddresses();
    }
  }, [path, signedIn]);

  // Phase 4.2: Realtime Admin New Order Subscription
  useEffect(() => {
    if (!isStaffOrAdmin || !signedIn) {
      return;
    }

    let isMounted = true;
    const channelName = `admin-orders-live-${authUser?.id || 'staff'}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
        },
        async (payload) => {
          if (!isMounted) return;

          const newRecord = payload.new as {
            id?: string;
            order_number?: string;
            total_amount?: number;
            customer_name?: string;
          };

          const orderNumber = newRecord.order_number || newRecord.id;
          const orderId = newRecord.id;

          if (!orderNumber) return;

          // Prevent false/duplicate alerts: check if already seen
          if (
            (orderNumber && knownOrderIdsRef.current.has(orderNumber)) ||
            (orderId && knownOrderIdsRef.current.has(orderId))
          ) {
            return;
          }

          // Mark as known immediately to avoid race conditions
          if (orderNumber) knownOrderIdsRef.current.add(orderNumber);
          if (orderId) knownOrderIdsRef.current.add(orderId);

          const amount = Number(newRecord.total_amount) || 0;
          const customer = newRecord.customer_name || 'Customer';

          // Refresh the admin order list using the existing loadAdminOrders function
          await loadAdminOrders();

          // Highlight the newly received order in the admin order list
          setHighlightedOrderId(orderNumber);

          // Show immediate in-app notification / alert banner containing order number and amount
          setNewOrderAlert({
            id: orderId || orderNumber,
            orderNumber,
            amount,
            customer,
          });

          notify(`New order #${orderNumber} received (${money(amount)})`);

          // Play the selected notification sound three times in succession (0ms, ~700ms, ~1400ms)
          triggerNewOrderChime();

          // Phase 4.3: Trigger desktop browser notification
          sendAdminDesktopNotification(orderNumber, amount);
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn('[Realtime Orders] Subscription warning:', status, err);
        }
      });

    return () => {
      isMounted = false;
      clearAlertTimers();
      void supabase.removeChannel(channel);
    };
  }, [isStaffOrAdmin, signedIn, authUser?.id]);

  // Phase 4.4: Authenticated Customer Realtime Order Status Synchronization
  useEffect(() => {
    // Only subscribe for authenticated customers (not staff/admin)
    if (!signedIn || !authUser?.id || isStaffOrAdmin) {
      return;
    }

    let isMounted = true;
    const channelName = `customer-orders-${authUser.id}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${authUser.id}`,
        },
        async (payload) => {
          if (!isMounted) return;

          const newRecord = payload.new as {
            id?: string;
            order_number?: string;
            status?: string;
          };

          const orderNumber = newRecord.order_number || newRecord.id;
          const newStatus = newRecord.status;

          if (!orderNumber || !newStatus) return;

          // Check if status genuinely changed to prevent duplicate/unrelated notifications
          const prevStatus =
            customerOrderStatusCacheRef.current.get(orderNumber) ||
            (newRecord.id ? customerOrderStatusCacheRef.current.get(newRecord.id) : undefined);

          if (prevStatus === newStatus) {
            return;
          }

          // Cache updated status
          customerOrderStatusCacheRef.current.set(orderNumber, newStatus);
          if (newRecord.id) {
            customerOrderStatusCacheRef.current.set(newRecord.id, newStatus);
          }

          // Refresh the customer order list, active details modal, and tracking view
          await loadCustomerOrders(orderNumber);

          // Display a friendly in-app notification identifying the order and new status
          notify(getCustomerStatusUpdateMessage(orderNumber, newStatus));
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn('[Customer Realtime] Subscription warning:', status, err);
        }
      });

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [signedIn, authUser?.id, isStaffOrAdmin]);

  // Phase 4.4: Guest Customer Automatic 20s Polling on #/track-order
  useEffect(() => {
    if (signedIn) return;
    if (path !== '/track-order') return;
    if (!guestOrderResult) return;

    const activeOrderNumber = guestOrderResult.order_number;
    const currentStatus = guestOrderResult.status;

    // Stop polling if order has reached terminal status
    if (currentStatus === 'delivered' || currentStatus === 'rejected' || currentStatus === 'cancelled') {
      return;
    }

    const activeToken = guestTrackToken || savedGuestOrders.find(o => o.order_number === activeOrderNumber)?.guest_access_token;
    if (!activeToken) return;

    let isMounted = true;
    let pollIntervalId: number | null = null;

    const executeGuestPoll = async () => {
      if (!isMounted) return;
      if (isGuestPollingRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      isGuestPollingRef.current = true;
      try {
        const { data, error } = await fetchGuestOrderByToken(activeOrderNumber, activeToken);
        if (!isMounted) return;
        if (!error && data) {
          const prevStatus = guestOrderResult.status;
          const newStatus = data.status;

          // Always update guestOrderResult with fresh data & timeline
          setGuestOrderResult(data);

          // Update savedGuestOrders in localStorage if present
          setSavedGuestOrders(prev => {
            const index = prev.findIndex(o => o.order_number === activeOrderNumber);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = { ...updated[index], status: newStatus, total: data.total_amount || updated[index].total };
              try {
                localStorage.setItem('slnb_guest_orders', JSON.stringify(updated));
              } catch {}
              return updated;
            }
            return prev;
          });

          // Show in-app notification only when status genuinely changes
          if (prevStatus && prevStatus !== newStatus) {
            notify(getCustomerStatusUpdateMessage(activeOrderNumber, newStatus));
          }
        }
      } catch {
        // Silent fail on polling errors to avoid interrupting user view
      } finally {
        isGuestPollingRef.current = false;
      }
    };

    const startPolling = () => {
      if (pollIntervalId !== null) clearInterval(pollIntervalId);
      pollIntervalId = window.setInterval(executeGuestPoll, 20000);
    };

    const stopPolling = () => {
      if (pollIntervalId !== null) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        // Immediate status check on tab focus, then restart 20s interval
        void executeGuestPoll();
        startPolling();
      } else {
        stopPolling();
      }
    };

    // Start 20s polling interval if tab is currently visible
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [path, signedIn, guestOrderResult?.order_number, guestOrderResult?.status, guestTrackToken, savedGuestOrders]);

  const handleUserSignOut = async (msg = 'Signed out successfully.', redirectPath?: string) => {
    try {
      await signOut();
    } finally {
      authRequestIdRef.current++;
      setCustomerOrders([]);
      setAdminOrders([]);
      setAdminOrdersError(null);
      setCustomerAddresses([]);
      setAddressesLoading(false);
      setAddressesFetchError(null);
      setIsAddressModalOpen(false);
      setEditingAddress(null);
      setAddressActionLoadingId(null);
      setDeletingAddressId(null);
      setSelectedCheckoutAddressId(null);
      hasInitializedCheckoutAddressRef.current = false;
      setSelectedTrackOrderNumber(null);
      setGuestOrderResult(null);
      knownOrderIdsRef.current.clear();
      customerOrderStatusCacheRef.current.clear();
      clearAlertTimers();
      setHighlightedOrderId(null);
      setNewOrderAlert(null);
      try {
        sessionStorage.removeItem('slnb_track_order_number');
      } catch {
        // ignore
      }
      setProfile(emptyProfile);
      setProfileLoading(false);
      setProfileFetchError(null);
      setProfileSaveError('');
      try {
        localStorage.removeItem('crumb-profile-v1');
      } catch {
        // ignore
      }
      setUserRoles([]);
      setAuthUser(null);
      authUserIdRef.current = null;
      // Load isolated guest draft so previous user's draft is not visible
      setCheckoutDraft(loadCheckoutDraftFromStorage(null));
      notify(msg);
      if (redirectPath) {
        go(redirectPath);
      }
    }
  };

  const handleAuthSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isAuthSubmitting) return;

    const d = new FormData(e.currentTarget);
    setAuthError('');
    setAuthNotice('');

    if (isRecoveryMode || authMode === 'Set New Password') {
      const password = String(d.get('password') || '');
      const confirmPassword = String(d.get('confirmPassword') || '');

      if (!password || password.length < 6) {
        setAuthError('New password must be at least 6 characters long.');
        return;
      }

      if (password !== confirmPassword) {
        setAuthError('Passwords do not match. Please re-enter.');
        return;
      }

      setIsAuthSubmitting(true);
      try {
        const { user, error } = await updatePassword(password);

        if (error) {
          const msg = error.message || '';
          if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('session') || msg.toLowerCase().includes('invalid')) {
            setAuthError('Your password recovery link has expired or is invalid. Please request a new reset email.');
            setIsRecoveryMode(false);
            setAuthMode('Forgot Password');
          } else {
            setAuthError(msg || 'Failed to update password. Please try again.');
          }
          return;
        }

        if (user) {
          notify('Your password has been updated successfully!');
          setIsRecoveryMode(false);
          setAuthMode('Login');
          setAuthNotice('Password updated successfully. You are now logged in.');
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + '#/account');
          }
          go('/account');
        }
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'An unexpected error occurred while updating your password.');
      } finally {
        setIsAuthSubmitting(false);
      }
      return;
    }

    if (authMode === 'Forgot Password') {
      const email = String(d.get('email') || '').trim();

      if (!email) {
        setAuthError('Please enter your email address.');
        return;
      }

      setIsAuthSubmitting(true);
      try {
        const origin = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined;
        const { error } = await sendPasswordResetEmail(email, origin);

        if (error) {
          if (error.message?.toLowerCase().includes('rate limit')) {
            setAuthError('Too many password reset requests. Please wait a few minutes before trying again.');
            return;
          }
        }

        // Avoid revealing whether an email exists in the database
        setAuthNotice('If an account exists with this email address, a password reset link has been sent. Please check your inbox.');
        setAuthError('');
      } catch {
        setAuthNotice('If an account exists with this email address, a password reset link has been sent. Please check your inbox.');
      } finally {
        setIsAuthSubmitting(false);
      }
      return;
    }

    if (authMode === 'Login') {
      const email = String(d.get('email') || '').trim();
      const password = String(d.get('password') || '');

      if (!email || !password) {
        setAuthError('Please enter both your email and password.');
        return;
      }

      setIsAuthSubmitting(true);
      try {
        const { user, session, error } = await signInWithEmail(email, password);

        if (error) {
          const msg = error.message || '';
          if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid credentials')) {
            setAuthError('Incorrect email or password. Please verify your credentials and try again.');
          } else if (msg.toLowerCase().includes('email not confirmed')) {
            setAuthError('Your email address has not been confirmed yet. Please check your inbox for the verification link.');
          } else {
            setAuthError(msg || 'Authentication failed. Please check your connection and try again.');
          }
          return;
        }

        if (!session || !user) {
          setAuthError('Unable to establish an authenticated session. Please try again.');
          return;
        }

        // Claim eligible guest orders
        try {
          const { claimedCount } = await claimGuestOrders();
          if (claimedCount > 0) {
            notify(`Welcome back! Linked ${claimedCount} previous order${claimedCount === 1 ? '' : 's'} to your account.`);
          } else {
            notify('Welcome back! Signed in to your sweet space.');
          }
        } catch {
          notify('Welcome back! Signed in to your sweet space.');
        }

        // Fetch roles to decide redirection if an admin route was pending
        let targetRoute = '/account';
        try {
          const { roles } = await getUserRoles(user.id);
          if (roles) {
            setUserRoles(roles);
            if (adminRedirectPath && (roles.includes('admin') || roles.includes('staff'))) {
              targetRoute = adminRedirectPath;
              setAdminRedirectPath(null);
            }
          }
        } catch {
          // default to /account
        }

        go(targetRoute);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'An unexpected error occurred during sign in.');
      } finally {
        setIsAuthSubmitting(false);
      }
    } else if (authMode === 'Registration') {
      const name = String(d.get('name') || '').trim();
      const email = String(d.get('email') || '').trim();
      const phone = String(d.get('phone') || '').trim();
      const password = String(d.get('password') || '');

      if (!name) {
        setAuthError('Please enter your full name.');
        return;
      }
      if (!email) {
        setAuthError('Please enter a valid email address.');
        return;
      }
      if (!password || password.length < 6) {
        setAuthError('Password must be at least 6 characters long.');
        return;
      }

      setIsAuthSubmitting(true);
      try {
        const { user, session, error } = await signUpWithEmail(email, password, name, phone);

        if (error) {
          const msg = error.message || '';
          if (msg.toLowerCase().includes('user already registered') || msg.toLowerCase().includes('already registered')) {
            setAuthError('An account with this email address already exists. Please sign in instead.');
          } else {
            setAuthError(msg || 'Failed to create your account. Please check your details and try again.');
          }
          return;
        }

        if (!user) {
          setAuthError('Unable to create account. Please try again.');
          return;
        }

        // Check if email confirmation is required by Supabase (no active session returned)
        if (!session) {
          setAuthNotice(`Account created successfully! We sent a confirmation link to ${email}. Please check your inbox and verify your email before signing in.`);
          setAuthMode('Login');
          return;
        }

        // If registration immediately authenticates the user (session created)
        try {
          const { claimedCount } = await claimGuestOrders();
          if (claimedCount > 0) {
            notify(`Welcome, ${name}! Linked ${claimedCount} previous order${claimedCount === 1 ? '' : 's'} to your new account.`);
          } else {
            notify(`Welcome to Sri Laxmi Narasimha Bakery, ${name}!`);
          }
        } catch {
          notify(`Welcome to Sri Laxmi Narasimha Bakery, ${name}!`);
        }

        go('/account');
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'An unexpected error occurred during registration.');
      } finally {
        setIsAuthSubmitting(false);
      }
    }
  };

  const handleAdminLoginSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isAuthSubmitting) return;

    const d = new FormData(e.currentTarget);
    const email = String(d.get('email') || '').trim();
    const password = String(d.get('password') || '');

    if (!email || !password) {
      setAuthError('Please enter both your email and password.');
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const { user, session, error } = await signInWithEmail(email, password);

      if (error) {
        const msg = error.message || '';
        if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid credentials')) {
          setAuthError('Incorrect email or password. Please verify your administrative credentials and try again.');
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          setAuthError('Your email address has not been confirmed yet. Please verify your email before accessing the bakery workspace.');
        } else {
          setAuthError(msg || 'Authentication failed. Please check your connection and try again.');
        }
        return;
      }

      if (!session || !user) {
        setAuthError('Unable to establish an authenticated session. Please try again.');
        return;
      }

      // Explicitly check user roles in database (public.user_roles)
      const { roles, error: rolesError } = await getUserRoles(user.id);
      const verifiedRoles = rolesError || !roles ? [] : roles;
      setUserRoles(verifiedRoles);

      const hasAdminOrStaff = verifiedRoles.includes('admin') || verifiedRoles.includes('staff');
      if (!hasAdminOrStaff) {
        notify('Signed in as customer. Staff or administrator privileges required.');
        return;
      }

      notify('Welcome to Sri Laxmi Narasimha Bakery workspace!');
      const target = adminRedirectPath || (path.startsWith('/admin') ? path : '/admin');
      setAdminRedirectPath(null);
      go(target);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'An unexpected error occurred during administrative sign in.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  useEffect(() => {
    // Purge legacy un-scoped customer profile from browser storage
    try {
      localStorage.removeItem('crumb-profile-v1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.title = `${business.name} – Fresh Cakes & Bakes`;
  }, [business.name]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const update = () => {
      const newPath = normalizePath(location.hash.slice(1));
      setPath(newPath);
      if (newPath.startsWith('/admin')) {
        setAdminRedirectPath(newPath);
      }
      setMobileNav(false);
      setAdminMenuOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const go = (p: string) => { location.hash = p; };
  const shop = (cat = 'All treats') => { setCategory(cat); setQuery(''); go('/shop'); };
  const isAdmin = path.startsWith('/admin');
  const isAccount = path.startsWith('/account');
  const customerRoutes = ['/', '/shop', '/cart', '/checkout', '/about', '/contact', '/account', '/account/profile', '/account/orders', '/account/addresses', '/track-order'];
  const adminRoutes = ['/admin', '/admin/orders', '/admin/products', '/admin/categories', '/admin/customers', '/admin/offers-coupons', '/admin/reports', '/admin/settings'];
  const isKnownCustomerRoute = customerRoutes.includes(path) || path === '/order-success';
  const isKnownAdminRoute = adminRoutes.includes(path);
  const isItemAvailable = (item: CartItem) => {
    const live = products.find(p => p.id === item.id);
    return live ? live.available : item.available;
  };
  const unavailableItems = cart.filter(item => !isItemAvailable(item));
  const hasUnavailableItems = unavailableItems.length > 0;
  const subtotal = cart.reduce((sum, p) => sum + p.unitPrice * p.qty, 0);
  const freeDeliveryThreshold = business.freeDeliveryThreshold ?? 999;
  const standardDeliveryFee = business.deliveryFee ?? 49;
  const delivery = subtotal >= freeDeliveryThreshold || subtotal === 0 ? 0 : standardDeliveryFee;
  const isCouponValid = discount && offerActive && subtotal > 0;
  const savings = isCouponValid ? Math.round(subtotal * .1) : 0;
  const total = subtotal + delivery - savings;
  const pending = adminOrders.filter(o => o.status === 0);
  const newCount = adminOrders.filter(o => o.createdAt > seen && !o.sample).length;
  const filteredAdminOrders = adminOrders.filter(o => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || `${o.id} ${o.customer} ${o.phone} ${o.email || ''}`.toLowerCase().includes(q);
    const matchesStatus =
      category === 'Pending'
        ? o.status === 0
        : category === 'In progress'
        ? o.status > 0 && o.status < 5
        : category === 'Delivered'
        ? o.status === 5
        : true;
    return matchesQuery && matchesStatus;
  });
  const visibleProducts = products.filter(p => (category === 'All treats' || (category === 'Wishlist' ? wishlist.includes(p.id) : p.category === category || p.tags.includes(category))) && p.name.toLowerCase().includes(query.toLowerCase()) && (!stockOnly || p.available)).sort((a, b) => sort === 'Price: low to high' ? a.price - b.price : sort === 'Price: high to low' ? b.price - a.price : sort === 'Top rated' ? b.rating - a.rating : Number(b.bestseller) - Number(a.bestseller));
  const addToCart = (p: Product, custom = false) => {
    const current = products.find(prod => prod.id === p.id) || p;
    if (!current.available) {
      notify(`${p.name} is currently sold out.`);
      return;
    }
    const defaultWeight = current.variants?.[0]?.weight_label || '500g';
    const selectedWeight = custom ? weight : defaultWeight;
    const defaultEgg = current.is_eggless_available ? 'Eggless' : (current.is_with_egg_available ? 'With egg' : 'Eggless');
    const selectedEgg = custom ? egg : defaultEgg;
    const selectedMessage = custom ? message.trim() : '';
    const addQty = custom ? qty : 1;
    const selectedDate = custom ? date : '';

    const matchingVariant = current.variants?.find(v => v.weight_label === selectedWeight);
    const unitPrice = matchingVariant
      ? (matchingVariant.calculated_price ?? Math.round(current.price * matchingVariant.price_multiplier))
      : Math.round(current.price * ({ '500g': 1, '1kg': 1.9, '1.5kg': 2.8, '2kg': 3.7 }[selectedWeight] || 1));

    setCart(old => {
      const matchIndex = old.findIndex(item =>
        item.id === current.id &&
        item.weight === selectedWeight &&
        item.egg === selectedEgg &&
        item.message === selectedMessage
      );
      if (matchIndex > -1) {
        return old.map((item, idx) =>
          idx === matchIndex
            ? { ...item, qty: item.qty + addQty, date: selectedDate || item.date }
            : item
        );
      }
      const newItem: CartItem = {
        ...current,
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        weight: selectedWeight,
        egg: selectedEgg,
        message: selectedMessage,
        qty: addQty,
        date: selectedDate,
        unitPrice
      };
      return [...old, newItem];
    });
    notify(`${current.name} added to your bag`);
    setSelected(null);
  };
  const openProduct = (p: Product) => {
    const defaultWeight = p.variants?.[0]?.weight_label || '500g';
    const defaultEgg = p.is_eggless_available ? 'Eggless' : (p.is_with_egg_available ? 'With egg' : 'Eggless');
    setWeight(defaultWeight);
    setEgg(defaultEgg);
    setMessage('');
    setQty(1);
    setDate('');
    setSelected(p);
  };
  const updateQty = (key: string, amount: number) => setCart(old => old.map(p => p.key === key ? { ...p, qty: Math.max(1, p.qty + amount) } : p));
  const updateStatus = async (orderId: string, status: number) => {
    if (updatingOrderId) return;
    setUpdatingOrderId(orderId);

    try {
      const { data, error } = await updateOrderStatusByAdmin(orderId, status);

      if (error || !data || data.success === false) {
        const errorMsg = error?.message || data?.error || 'Failed to update order status.';
        notify(`Error: ${errorMsg}`);
        return;
      }

      const statusLabel = status === -1 ? 'rejected' : steps[status]?.toLowerCase() || 'updated';
      notify(`Sweet! Order #${orderId} marked as ${statusLabel}.`);

      // 1. Reload live admin orders to ensure complete synchronicity with Supabase
      await loadAdminOrders();

      // 2. Keep the currently open detail modal consistent
      setDetail(old => {
        if (!old || old.id !== orderId) return old;
        const newTimeline = [...(old.timeline || [])];
        if (data.status) {
          newTimeline.push({
            status: data.status,
            notes: data.notes || '',
            created_at: data.updated_at || new Date().toISOString(),
          });
        }
        return {
          ...old,
          status,
          rawStatus: data.status || old.rawStatus,
          timeline: newTimeline,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to complete status update.';
      notify(`Error: ${msg}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };
  interface OrderSubmissionParams {
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    deliveryAddress: string;
    deliveryDate: string;
    deliveryTimeSlot: string;
    paymentMethod: PaymentMethod;
    specialInstructions?: string;
    authenticatedUser?: User | null;
  }

  const executeOrderSubmission = async (params: OrderSubmissionParams) => {
    const {
      customerName,
      customerEmail,
      customerPhone,
      deliveryAddress,
      deliveryDate,
      deliveryTimeSlot,
      paymentMethod,
      specialInstructions,
      authenticatedUser,
    } = params;

    if (isPlacingOrder) return;
    const effectiveUser = authenticatedUser || authUser || null;

    // 5. Build p_items
    const p_items: CreateOrderItemInput[] = cart.map(item => ({
      product_id: item.id,
      weight_label: item.weight || '500g',
      egg_preference: item.egg === 'With egg' ? 'With egg' : 'Eggless',
      custom_message: item.message ? item.message.slice(0, 50) : undefined,
      quantity: Math.max(1, item.qty),
    }));

    // 6. Submit via Supabase RPC createOrderSecurely
    setIsPlacingOrder(true);
    try {
      const activeCoupon = isCouponValid && coupon.trim() ? coupon.trim().toUpperCase() : undefined;
      const res = await createOrderSecurely({
        p_idempotency_key: checkoutIdempotencyKeyRef.current,
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_phone: customerPhone,
        p_delivery_address: deliveryAddress,
        p_delivery_date: deliveryDate,
        p_delivery_time_slot: deliveryTimeSlot,
        p_special_instructions: specialInstructions || undefined,
        p_payment_method: paymentMethod,
        p_coupon_code: activeCoupon,
        p_items,
      });

      if (res.error) {
        let displayError = res.error.message;
        if (displayError.includes('postal code') || displayError.includes('PIN')) {
          displayError = `Delivery address issue: ${displayError}`;
        } else if (displayError.includes('Lead time') || displayError.includes('cutoff')) {
          displayError = `Delivery time issue: ${displayError}`;
        } else if (displayError.includes('coupon') || displayError.includes('Coupon')) {
          displayError = `Coupon error: ${displayError}`;
        }
        setCheckoutError(displayError);
        setCheckoutStep('details');
        return;
      }

      const orderResult = res.data;
      if (!orderResult || !orderResult.order_number) {
        setCheckoutError('Unexpected response from bakery ordering service. Please try again.');
        setCheckoutStep('details');
        return;
      }

      // 1. Immediate Guest Order Saving
      if (!effectiveUser && orderResult.guest_access_token) {
        try {
          const GUEST_STORAGE_KEY = 'slnb_guest_orders';
          const existingRaw = localStorage.getItem(GUEST_STORAGE_KEY);
          let guestOrdersList: Array<{
            order_number: string;
            guest_access_token: string;
            created_at: string;
            total: number;
            status?: string;
          }> = [];
          if (existingRaw) {
            try {
              const parsed = JSON.parse(existingRaw);
              if (Array.isArray(parsed)) {
                guestOrdersList = parsed.filter(o => Boolean(o && o.order_number && o.guest_access_token));
              }
            } catch {
              guestOrdersList = [];
            }
          }

          const newGuestEntry = {
            order_number: orderResult.order_number,
            guest_access_token: orderResult.guest_access_token,
            created_at: new Date().toISOString(),
            total: orderResult.total,
            status: orderResult.status || 'placed',
          };

          // Deduplicate by order_number and put the newest order first
          const updatedGuestOrders = [
            newGuestEntry,
            ...guestOrdersList.filter(o => o.order_number !== orderResult.order_number),
          ];

          localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(updatedGuestOrders));
          setSavedGuestOrders(updatedGuestOrders);
        } catch {
          // Handle localStorage errors safely without treating a successfully created database order as failed
        }
      }

      // Update in-memory profile state for the active session
      setProfile(p => ({
        ...p,
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        address: deliveryAddress,
      }));

      // Set confirmed order state with real database details & preserve across page refresh
      const confirmedData = {
        orderNumber: orderResult.order_number,
        total: orderResult.total,
        status: orderResult.status || 'placed',
        customerName,
        customerEmail,
        deliveryAddress,
        deliveryDate,
        deliveryTimeSlot,
        paymentMethod: 'Cash on delivery',
        items: [...cart],
        guestAccessToken: orderResult.guest_access_token,
      };
      setConfirmedOrder(confirmedData);
      try {
        sessionStorage.setItem('slnb_latest_confirmed_order_v1', JSON.stringify(confirmedData));
      } catch {
        // Safe fallback
      }

      if (effectiveUser) {
        loadCustomerOrders();
      }

      // Reset idempotency key for next order attempt
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        checkoutIdempotencyKeyRef.current = crypto.randomUUID();
      } else {
        checkoutIdempotencyKeyRef.current = 'idemp-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      }

      // Clear cart and checkout coupons
      setCart([]);
      setDiscount(false);
      setCoupon('');
      setCheckoutError('');
      setCheckoutStep('details');
      setOtpDigits(['', '', '', '', '', '', '', '']);
      setOtpError('');
      clearCheckoutDraft();

      // Navigate to order-success
      go('/order-success');
      notify(`Sweet! Order #${orderResult.order_number} confirmed with ${business.name}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to complete your order. Please check your connection and retry.';
      setCheckoutError(msg);
      setCheckoutStep('details');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleVerifyOtpAndContinue = async () => {
    if (isVerifyingOtp || isSendingOtp || isPlacingOrder) return;
    setOtpError('');

    // 1. Validate that exactly 8 numeric digits are entered
    const token = otpDigits.join('').trim();
    if (token.length !== 8 || !/^\d{8}$/.test(token)) {
      setOtpError('Please enter the complete 8-digit verification code.');
      return;
    }

    // 2. Normalize the checkout email
    const normalizedEmail = (checkoutDraft.email || '').trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setOtpError('No valid email address found. Please go back to checkout details and re-enter your email.');
      return;
    }

    // 3. Set loading state
    setIsVerifyingOtp(true);

    try {
      // 4. Call verifyEmailOtp
      const result = await verifyEmailOtp(normalizedEmail, token);

      if (!result || result.error || !result.user || !result.session) {
        const errorMsg = result?.error?.message || 'Verification failed. Please check the code and try again.';
        setOtpError(errorMsg);
        return;
      }

      const verifiedUser = result.user;
      const verifiedSession = result.session;

      // 5. Confirm email matches
      const userEmail = (verifiedUser.email || '').trim().toLowerCase();
      if (userEmail !== normalizedEmail) {
        setOtpError('The verified email address does not match your checkout email. Please restart checkout.');
        return;
      }

      // 6. Role check & strict authorization
      let { roles: fetchedRoles, error: rolesError } = await getUserRoles(verifiedUser.id);
      if (rolesError || !fetchedRoles || fetchedRoles.length === 0) {
        // Wait briefly for trigger on_auth_user_created to commit if this is a newly registered customer
        await new Promise(resolve => setTimeout(resolve, 350));
        const retry = await getUserRoles(verifiedUser.id);
        fetchedRoles = retry.roles;
        rolesError = retry.error;
      }

      if (rolesError || !fetchedRoles || fetchedRoles.length === 0) {
        setOtpError('Unable to verify account permissions. Please check your connection and retry.');
        return;
      }

      // Reject accounts containing either admin or staff (even if they also have customer role)
      if (fetchedRoles.includes('admin') || fetchedRoles.includes('staff')) {
        setOtpError('Staff and administrator accounts cannot place orders via customer OTP checkout. Please use a customer account.');
        return;
      }

      // Explicitly require customer role
      if (!fetchedRoles.includes('customer')) {
        setOtpError('Your account does not have customer ordering permissions. Please contact bakery support.');
        return;
      }

      // 7. Update React state immediately after successful authorization
      setAuthUser(verifiedUser);
      authUserIdRef.current = verifiedUser.id;
      setUserRoles(fetchedRoles);

      // 8. Account-scoped draft migration and persistence
      const currentGuestDraft = loadCheckoutDraftFromStorage(null);
      const metaName = (verifiedUser.user_metadata?.full_name || verifiedUser.user_metadata?.name || '') as string;
      const metaPhone = (verifiedUser.user_metadata?.phone || '') as string;

      const userDraft: CheckoutDraft = {
        name: checkoutDraft.name.trim() || currentGuestDraft.name.trim() || metaName,
        email: normalizedEmail,
        phone: checkoutDraft.phone.trim() || currentGuestDraft.phone.trim() || metaPhone,
        address: checkoutDraft.address.trim() || currentGuestDraft.address.trim(),
        pinCode: checkoutDraft.pinCode.trim() || currentGuestDraft.pinCode.trim(),
        date: checkoutDraft.date.trim() || currentGuestDraft.date.trim(),
        timeSlot: checkoutDraft.timeSlot.trim() || currentGuestDraft.timeSlot.trim() || '10 AM – 1 PM',
        instructions: checkoutDraft.instructions.trim() || currentGuestDraft.instructions.trim(),
        paymentMethod: checkoutDraft.paymentMethod || currentGuestDraft.paymentMethod || 'Cash on delivery',
      };

      saveCheckoutDraftToStorage(userDraft, verifiedUser.id);
      clearCheckoutDraftFromStorage(null);
      setCheckoutDraft(userDraft);

      // 9. Show brief success message
      notify('Email verified successfully! Placing your order...');

      // 10. Automatically continue checkout: call executeOrderSubmission
      await executeOrderSubmission({
        customerName: userDraft.name,
        customerEmail: userDraft.email,
        customerPhone: userDraft.phone,
        deliveryAddress: userDraft.address,
        deliveryDate: userDraft.date,
        deliveryTimeSlot: userDraft.timeSlot,
        paymentMethod: 'cash_on_delivery',
        specialInstructions: userDraft.instructions || undefined,
        authenticatedUser: verifiedUser,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred during verification. Please try again.';
      setOtpError(msg);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  handleVerifyOtpRef.current = handleVerifyOtpAndContinue;

  const placeOrder = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPlacingOrder || isSendingOtp) return;

    // Safeguard: For authenticated customers, wait until saved addresses finish loading
    if (signedIn && addressesLoading) {
      setCheckoutError('Please wait a moment while your saved addresses load.');
      return;
    }

    setCheckoutError('');

    if (!cart.length) {
      notify('Your bag is currently empty.');
      return;
    }

    if (hasUnavailableItems) {
      notify('Your bag contains items that are out of stock. Please remove them to proceed.');
      go('/cart');
      return;
    }

    const data = new FormData(e.currentTarget);
    const customerName = (checkoutDraft.name || String(data.get('name') || '')).trim();
    const customerEmail = (checkoutDraft.email || String(data.get('email') || '')).trim();
    const customerPhone = (checkoutDraft.phone || String(data.get('phone') || '')).trim();
    const deliveryAddress = (checkoutDraft.address || String(data.get('address') || '')).trim();
    const deliveryDate = (checkoutDraft.date || String(data.get('date') || '')).trim();
    const deliveryTimeSlot = (checkoutDraft.timeSlot || String(data.get('time') || '')).trim();
    const paymentSelection = (checkoutDraft.paymentMethod || String(data.get('payment') || 'Cash on delivery')).trim();
    const specialInstructions = (checkoutDraft.instructions || String(data.get('instructions') || '')).trim();

    // 1. Basic field validation
    if (!customerName || customerName.length < 2) {
      setCheckoutError('Please enter your full name (minimum 2 characters).');
      return;
    }
    if (!customerEmail || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(customerEmail)) {
      setCheckoutError('Please provide a valid email address.');
      return;
    }
    const cleanPhone = customerPhone.replace(/[\s\(\)\-]/g, '');
    if (!cleanPhone || !/^\+?[0-9]{10,15}$/.test(cleanPhone)) {
      setCheckoutError('Please provide a valid 10 to 15 digit contact phone number.');
      return;
    }

    // 2. PIN code validation
    const pinMatch = deliveryAddress.match(/\b([1-9][0-9]{5})\b/);
    if (!pinMatch) {
      setCheckoutError('Delivery address must include a valid 6-digit Indian PIN code (e.g. 505528 or 502103).');
      return;
    }
    const enteredPin = pinMatch[1];
    const serviceableCodes = business.serviceablePostalCodes && business.serviceablePostalCodes.length > 0
      ? business.serviceablePostalCodes
      : ['505528', '502103'];
    if (!serviceableCodes.includes(enteredPin)) {
      setCheckoutError(`Postcode ${enteredPin} is currently outside our delivery service area. Serviceable areas: ${serviceableCodes.join(', ')}.`);
      return;
    }

    // 3. Date & time slot validation
    if (!deliveryDate) {
      setCheckoutError('Please select your preferred delivery date.');
      return;
    }
    if (!deliveryTimeSlot) {
      setCheckoutError('Please select a preferred delivery time slot.');
      return;
    }

    // 4. Payment method mapping
    let paymentMethod: PaymentMethod = 'cash_on_delivery';
    if (paymentSelection.toLowerCase().includes('cash')) {
      paymentMethod = 'cash_on_delivery';
    } else {
      setCheckoutError('Online and simulated payment methods are currently disabled in production. Please select Cash on Delivery to complete your order.');
      return;
    }

    // Phase 5.3.3: Authenticated customers bypass OTP and submit order directly
    if (signedIn && authUser) {
      await executeOrderSubmission({
        customerName,
        customerEmail,
        customerPhone: cleanPhone,
        deliveryAddress,
        deliveryDate,
        deliveryTimeSlot,
        paymentMethod,
        specialInstructions: specialInstructions || undefined,
        authenticatedUser: authUser,
      });
      return;
    }

    // Unauthenticated customers: save draft & send Email OTP
    updateCheckoutDraft({
      name: customerName,
      email: customerEmail,
      phone: cleanPhone,
      address: deliveryAddress,
      date: deliveryDate,
      timeSlot: deliveryTimeSlot,
      paymentMethod: paymentSelection,
      instructions: specialInstructions,
      pinCode: enteredPin,
    });

    const normalizedEmail = customerEmail.toLowerCase();
    setIsSendingOtp(true);
    try {
      const res = await sendEmailOtp(normalizedEmail, {
        fullName: customerName,
        phone: cleanPhone,
      });

      if (!res.success || res.error) {
        setCheckoutError(res.error?.message || 'Unable to send verification code. Please check your email and try again.');
        return;
      }

      setCheckoutStep('otp');
      setOtpDigits(['', '', '', '', '', '', '', '']);
      setOtpError('');
      setOtpResendSeconds(60);
      notify(`An 8-digit verification code has been sent to ${normalizedEmail}.`);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to send verification code. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };
  const saveProduct = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editProduct) return;

    if (!signedIn || !isAdminUser) {
      notify('Administrator authorization is required to add or update products.');
      return;
    }

    if (isSavingProduct) return;

    const data = new FormData(e.currentTarget);
    const rawName = String(data.get('name') || '').trim();
    const rawPrice = Number(data.get('price'));
    const rawCategory = String(data.get('category') || '').trim();
    const rawDesc = String(data.get('description') || '').trim();
    const rawImage = String(data.get('image') || editProduct.image || '').trim();
    const isAvailable = data.has('available');
    const isBestseller = data.has('bestseller');

    if (!rawName) {
      notify('Please enter a valid product name.');
      return;
    }
    if (!rawDesc) {
      notify('Please enter a product description.');
      return;
    }
    if (isNaN(rawPrice) || rawPrice <= 0 || rawPrice > 99999999.99) {
      notify('Product price must be between ₹1 and ₹99,999,999.99.');
      return;
    }
    if (!rawCategory) {
      notify('Please select a valid product category.');
      return;
    }
    if (!rawImage) {
      notify('Please provide a valid product image URL.');
      return;
    }
    if (rawImage.startsWith('data:image/')) {
      notify('Direct image uploads via base64 cannot be saved to the database. Image hosting will be integrated in a later phase. Please provide an HTTP/HTTPS image URL.');
      return;
    }

    setIsSavingProduct(true);

    try {
      if (isNewProduct) {
        const { data: createData, error: createError } = await adminCreateProduct({
          name: rawName,
          description: rawDesc,
          base_price: rawPrice,
          category_name: rawCategory,
          image_url: rawImage,
          is_available: isAvailable,
          is_bestseller: isBestseller,
          variant_template: productVariantTemplate,
        });

        if (createError || !createData || createData.success === false) {
          const errText = createError?.message || createData?.error || 'Failed to create product in database.';
          notify(`Error: ${errText}`);
          return;
        }

        notify(`"${rawName}" has been successfully added to the catalog!`);
      } else {
        const { data: updateData, error: updateError } = await adminUpdateProduct({
          product_id: editProduct.id,
          name: rawName,
          description: rawDesc,
          base_price: rawPrice,
          category_name: rawCategory,
          image_url: rawImage,
          is_available: isAvailable,
          is_bestseller: isBestseller,
        });

        if (updateError || !updateData || updateData.success === false) {
          const errText = updateError?.message || updateData?.error || 'Failed to update product in database.';
          notify(`Error: ${errText}`);
          return;
        }

        notify(`"${rawName}" has been updated successfully!`);
      }

      // Reload products from Supabase to guarantee state matches live database
      await loadCatalogueAndSettings();
      setEditProduct(null);
      setIsNewProduct(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while saving the product.';
      notify(`Error: ${msg}`);
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Phase 6.1: Connect admin/staff product availability toggle to Supabase RPC
  const handleToggleProductAvailability = async (product: Product) => {
    if (!signedIn || !isStaffOrAdmin) {
      notify('Authentication with staff or administrator privileges is required to toggle availability.');
      return;
    }

    if (updatingProductAvailabilityId === product.id) {
      return; // Prevent duplicate clicks for the same product while in flight
    }

    const previousStatus = product.available;
    const targetStatus = !previousStatus;

    setUpdatingProductAvailabilityId(product.id);

    try {
      const { data, error } = await updateProductAvailability(product.id, targetStatus);

      if (error || !data || data.success === false) {
        const errorMsg = error?.message || data?.error || 'Failed to update product availability.';
        notify(`Error: ${errorMsg}`);
        return;
      }

      // Update UI state only after database confirmation
      setProducts(old =>
        old.map(p =>
          p.id === product.id ? { ...p, available: targetStatus } : p
        )
      );

      notify(`${product.name} is now marked ${targetStatus ? 'Available' : 'Sold Out'}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      notify(`Error: ${msg}`);
    } finally {
      setUpdatingProductAvailabilityId(null);
    }
  };
  // Phase 6.4.3: Connect admin product delete/archive to Supabase RPC
  const handleDeleteProduct = async (product: Product) => {
    if (!signedIn || !isAdminUser) {
      notify('Administrator authorization is required to remove products from the catalog.');
      return;
    }

    if (deletingProductId === product.id) {
      return; // Prevent duplicate clicks while deletion is in flight
    }

    const confirmed = window.confirm(
      `Are you sure you want to remove "${product.name}" from the catalog?\n\n` +
      `• If this product has historical orders, it will be safely archived (marked Sold Out) to protect sales records.\n` +
      `• If it has never been ordered, it will be permanently deleted.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingProductId(product.id);
    notify(`Processing removal for "${product.name}"...`);

    try {
      const { data, error } = await adminDeleteProduct(product.id);

      if (error || !data || data.success === false) {
        const errorMsg = error?.message || data?.error || 'Failed to remove product from the database.';
        notify(`Error: ${errorMsg}`);
        return;
      }

      // Display specific feedback based on the server-determined action
      if (data.action === 'archived') {
        notify(`"${product.name}" has historical orders and was archived (marked Sold Out).`);
      } else {
        notify(`"${product.name}" was permanently removed from the catalog.`);
      }

      // Refresh catalogue directly from Supabase so the UI reflects the live database state
      await loadCatalogueAndSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during product removal.';
      notify(`Error: ${msg}`);
    } finally {
      setDeletingProductId(null);
    }
  };

  // Phase 6.5.3: Admin Category Management Handlers
  const loadAdminCategories = async () => {
    setAdminCategoriesLoading(true);
    setAdminCategoriesError(null);
    try {
      const { categories: liveCats, error } = await fetchAdminCategories();
      if (error) {
        setAdminCategoriesError(error.message);
      } else {
        setAdminCategories(liveCats);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch categories from database.';
      setAdminCategoriesError(msg);
    } finally {
      setAdminCategoriesLoading(false);
    }
  };

  const handleToggleCategoryActive = async (cat: AdminCategory) => {
    if (!signedIn || !isAdminUser) {
      notify('Administrator authorization is required to change category visibility.');
      return;
    }

    if (togglingCategoryId === cat.id) return;

    setTogglingCategoryId(cat.id);
    const targetStatus = !cat.is_active;

    try {
      const { data, error } = await adminUpdateCategory({
        category_id: cat.id,
        name: cat.name,
        description: cat.description,
        image_url: cat.image_url,
        display_order: cat.display_order,
        is_active: targetStatus,
      });

      if (error || !data || data.success === false) {
        const errorMsg = error?.message || data?.error || 'Failed to update category visibility.';
        notify(`Error: ${errorMsg}`);
        return;
      }

      notify(`"${cat.name}" is now ${targetStatus ? 'Active (visible on storefront)' : 'Hidden (archived from storefront)'}.`);
      await Promise.all([loadAdminCategories(), loadCatalogueAndSettings()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      notify(`Error: ${msg}`);
    } finally {
      setTogglingCategoryId(null);
    }
  };

  const handleDeleteCategory = async (cat: AdminCategory) => {
    if (!signedIn || !isAdminUser) {
      notify('Administrator authorization is required to remove collections.');
      return;
    }

    if (deletingCategoryId === cat.id) return;

    const assignedCount = products.filter(p => p.category === cat.name || p.tags.includes(cat.name)).length;

    const confirmMsg =
      assignedCount > 0
        ? `Warning: Collection "${cat.name}" currently has ${assignedCount} product(s) assigned to it.\n\n` +
          `• Database safety rules will prevent deleting categories with assigned products.\n` +
          `• You can HIDE this collection instead to remove it from customer storefront.\n\n` +
          `Do you want to continue with the deletion request?`
        : `Are you sure you want to permanently delete the collection "${cat.name}"?\n\nThis action cannot be undone.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setDeletingCategoryId(cat.id);
    notify(`Processing removal for collection "${cat.name}"...`);

    try {
      const { data, error } = await adminDeleteCategory(cat.id);

      // Always dismiss the loading toast once the operation returns
      setToast('');

      if (error || !data || data.success === false) {
        const errorMsg = data?.error || error?.message || 'Failed to delete category.';
        notify(`Cannot delete "${cat.name}": ${errorMsg}`);

        if (data?.product_count && data.product_count > 0) {
          setTimeout(() => {
            window.alert(
              `Deletion Blocked\n\n` +
              `${errorMsg}\n\n` +
              `To protect your catalog:\n` +
              `1. Reassign or delete these products first, OR\n` +
              `2. Use the "Hide collection" button to remove it from customer view while keeping products intact.`
            );
          }, 50);
        }
        return;
      }

      notify(data.message || `Collection "${cat.name}" was permanently removed.`);
      await Promise.all([loadAdminCategories(), loadCatalogueAndSettings()]);
    } catch (err: unknown) {
      setToast('');
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while deleting the category.';
      notify(`Error: ${msg}`);
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const saveCategory = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editCategory) return;

    if (!signedIn || !isAdminUser) {
      notify('Administrator authorization is required to create or modify categories.');
      return;
    }

    if (isSavingCategory) return;

    const data = new FormData(e.currentTarget);
    const rawName = String(data.get('name') || '').trim();
    const rawDesc = String(data.get('description') || '').trim();
    const rawImage = String(data.get('image_url') || editCategory.image_url || '').trim();
    const rawOrder = Number(data.get('display_order')) || 0;
    const isActive = data.has('is_active');

    if (!rawName) {
      notify('Please enter a valid category name.');
      return;
    }

    if (rawName.length > 100) {
      notify('Category name cannot exceed 100 characters.');
      return;
    }

    setIsSavingCategory(true);

    try {
      if (isNewCategory) {
        const { data: createData, error: createError } = await adminCreateCategory({
          name: rawName,
          description: rawDesc || null,
          image_url: rawImage || null,
          display_order: rawOrder,
          is_active: isActive,
        });

        if (createError || !createData || createData.success === false) {
          const errText = createError?.message || createData?.error || 'Failed to create category in database.';
          notify(`Error: ${errText}`);
          return;
        }

        notify(`Collection "${rawName}" created successfully!`);
      } else {
        const { data: updateData, error: updateError } = await adminUpdateCategory({
          category_id: editCategory.id,
          name: rawName,
          description: rawDesc || null,
          image_url: rawImage || null,
          display_order: rawOrder,
          is_active: isActive,
        });

        if (updateError || !updateData || updateData.success === false) {
          const errText = updateError?.message || updateData?.error || 'Failed to update category in database.';
          notify(`Error: ${errText}`);
          return;
        }

        notify(`Collection "${rawName}" updated successfully!`);
      }

      await Promise.all([loadAdminCategories(), loadCatalogueAndSettings()]);
      setEditCategory(null);
      setIsNewCategory(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while saving the collection.';
      notify(`Error: ${msg}`);
    } finally {
      setIsSavingCategory(false);
    }
  };

  const toggleWishlist = (id: number) => {
    setWishlist(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  };
  const heading = (eyebrow: string, title: string, desc?: string) => <div className="mb-6 sm:mb-8"><p className="mb-1.5 sm:mb-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[.2em] text-[#9b6255]">{eyebrow}</p><h1 className="font-serif text-2xl xs:text-3xl sm:text-4xl md:text-5xl leading-tight text-[#432e26]">{title}</h1>{desc && <p className="mt-2 sm:mt-3 text-xs sm:text-sm leading-relaxed text-[#776457] max-w-2xl">{desc}</p>}</div>;
  const logo = <a href="#/" className="flex shrink-0 items-center gap-2 sm:gap-3 min-w-0" aria-label={`${business.name} home`}><span className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-[#b99778] bg-[#faf6ef]"><Icon name="cake" className="!h-5 !w-5 sm:!h-7 sm:!w-7 text-[#8b6244]" /></span><span className="min-w-0"><span className="block font-serif text-sm xs:text-base sm:text-lg md:text-xl font-medium leading-tight tracking-tight text-[#432e26] truncate max-w-[140px] xs:max-w-[190px] sm:max-w-[280px] md:max-w-none">{business.name}</span><span className="mt-0.5 block text-[8px] sm:text-[10px] uppercase tracking-[.15em] sm:tracking-[.25em] text-[#7b6250] truncate">{business.tagline}</span></span></a>;
  const orderList = (list: Order[], admin = false) => (
    <div className="space-y-4">
      {list.length ? (
        list.map(o => {
          const isHighlighted = admin && highlightedOrderId === o.id;
          return (
            <div
              key={o.id}
              className={`rounded-xl border p-4 sm:p-5 transition-all duration-500 ${
                isHighlighted
                  ? 'border-[#8b634b] bg-[#fbf5ee] ring-2 ring-[#8b634b]/30 shadow-md'
                  : 'border-[#e7ddd2] bg-white'
              }`}
            >
              {isHighlighted && (
                <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#8b634b] px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-xs">
                  <Icon name="bell" className="!w-3 !h-3" />
                  <span>New Order Received</span>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                <div>
                  <p className="font-semibold text-sm sm:text-base">
                    #{o.id} <span className="ml-2 font-normal text-xs sm:text-sm text-[#786658]">{o.customer}</span>
                  </p>
                  <p className="mt-1 text-xs sm:text-sm text-[#786658]">
                    {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {o.items.reduce((s, p) => s + p.qty, 0)} items · {money(o.total)}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${o.status === 5 ? 'bg-green-50 text-green-800' : o.status === -1 ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-[#f9e9db] text-[#81552d]'}`}>
                  {o.status === -1 ? 'Rejected' : steps[o.status]}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#eee6dd] pt-3">
                <p className="text-xs sm:text-sm text-[#76685d]">
                  {o.items.map(p => `${p.qty} × ${p.name}`).join(', ')}
                </p>
                <button
                  className="min-h-10 text-xs sm:text-sm font-medium underline underline-offset-4"
                  onClick={() => {
                    if (admin) {
                      setDetail(o);
                    } else {
                      trackCustomerOrder(o.id);
                    }
                  }}
                >
                  {admin ? 'Manage order' : 'Track Order'} →
                </button>
              </div>
              {admin && o.status === 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={updatingOrderId === o.id}
                    className={`${button} flex-1 sm:flex-initial text-xs sm:text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                    onClick={() => updateStatus(o.id, 1)}
                  >
                    {updatingOrderId === o.id ? 'Updating...' : 'Accept order'}
                  </button>
                  <button
                    disabled={updatingOrderId === o.id}
                    className="min-h-11 px-4 text-xs sm:text-sm font-medium text-red-800 border border-red-200 rounded-md hover:bg-red-50 flex-1 sm:flex-initial disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => updateStatus(o.id, -1)}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })
      ) : admin ? (
        <div className="rounded-xl border border-dashed border-[#d6c4b5] p-8 sm:p-12 text-center bg-white">
          <Icon name="bag" className="mx-auto mb-4 !h-10 !w-10 text-[#8b6244]" />
          <h3 className="font-serif text-xl sm:text-2xl text-[#432e26]">No bakery orders found</h3>
          <p className="my-3 text-xs sm:text-sm text-[#76685d]">
            {query || (category && category !== 'All treats')
              ? 'No orders match your search query or status filter.'
              : 'There are currently no customer or guest orders recorded in the database.'}
          </p>
          <button className="min-h-11 rounded-md border border-[#b9a08e] px-5 text-xs sm:text-sm font-medium text-[#734738] hover:bg-[#faf6ef]" onClick={loadAdminOrders}>
            Refresh orders
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#d6c4b5] p-8 sm:p-12 text-center">
          <Icon name="bag" className="mx-auto mb-4 !h-10 !w-10" />
          <h3 className="font-serif text-xl sm:text-2xl">Your next sweet memory starts here</h3>
          <p className="my-3 text-xs sm:text-sm text-[#76685d]">You haven’t placed an order yet.</p>
          <button className={button} onClick={() => shop()}>Explore our bakes</button>
        </div>
      )}
    </div>
  );
  const realOrders = signedIn ? customerOrders : orders.filter(o => !o.sample && o.email.toLowerCase() === profile.email.toLowerCase());
  const adminTabs = ['Overview', 'Orders', 'Products', 'Categories', 'Customers', 'Offers & Coupons', 'Reports', 'Settings'];

  return <div className="min-h-screen overflow-x-hidden bg-[#fffdf9] font-sans text-[#432e26] selection:bg-[#f4ded5] [&_button]:cursor-pointer [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#b77968] [&_a]:focus-visible:ring-2">
    {!isAdmin ? (
      <>
        <div className="bg-[#754936] px-3 py-2 sm:px-4 sm:py-2.5 text-center text-[11px] sm:text-xs tracking-wide text-[#fff9ee]">
          A little sweetness, on us. <span className="hidden sm:inline">Enjoy 10% off your first order with </span><strong className="ml-1 font-semibold">SWEET10</strong><span className="mx-3 hidden sm:inline">✧</span><span className="hidden sm:inline">Freshly baked. Lovingly delivered.</span>
        </div>
        {isUsingOfflineCatalogue && (
          <aside aria-label="Offline Mode" className="bg-[#faf6ef] border-b border-[#e8ded2] px-4 py-2 text-center text-xs text-[#79695c] flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
            <span>Browsing local preview catalogue (offline mode).</span>
            <button onClick={() => loadCatalogueAndSettings()} className="underline font-medium text-[#734738] hover:text-[#513023] ml-1">
              Reconnect to Supabase
            </button>
          </aside>
        )}
        <header className="border-b border-[#e9e0d6] bg-[#fffdf9] sticky top-0 z-40">
          <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-2 sm:gap-5 px-3 sm:px-6 py-3 sm:py-4 lg:px-12">
            {logo}
            <form className="hidden w-full max-w-[370px] items-center gap-3 rounded-md border border-[#e6ddd1] bg-[#faf7f1] px-4 md:flex" onSubmit={e => { e.preventDefault(); go('/shop'); }}>
              <Icon name="search" className="text-[#8c7865]" />
              <input aria-label="Search for cakes and treats" placeholder="Search for a little happiness..." value={query} onChange={e => { setQuery(e.target.value); if (e.target.value) go('/shop'); }} className="min-h-11 w-full bg-transparent text-sm outline-none" />
            </form>
            <div className="flex items-center gap-1 sm:gap-3 md:gap-5">
              <span className="hidden items-center gap-1 text-xs lg:flex"><Icon name="pin" className="!h-4 !w-4" /> {business.cityState || 'Bejjanki, Telangana'}</span>
              <a
                href="#/track-order"
                aria-label={signedIn ? 'My Orders' : 'Track Orders'}
                title={signedIn ? 'My Orders' : 'Track Orders'}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#d6c4b5] bg-[#faf6ef] px-2.5 sm:px-3 py-1 text-xs font-medium text-[#734738] hover:bg-[#f2e7d8] transition"
              >
                <Icon name="truck" className="!h-3.5 !w-3.5 text-[#8b6244]" />
                <span>{signedIn ? 'My Orders' : 'Track Orders'}</span>
                {!signedIn && savedGuestOrders.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-[#8b5943] px-1.5 py-0.2 text-[10px] font-bold text-white">
                    {savedGuestOrders.length}
                  </span>
                )}
              </a>
              <a href="#/account" aria-label="My account" className="flex min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center rounded-full hover:bg-stone-100"><Icon name="user" /></a>
              <button onClick={() => { setCategory('Wishlist'); go('/shop'); }} aria-label={`Wishlist, ${wishlist.length} items`} className="hidden min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center sm:flex rounded-full hover:bg-stone-100"><Icon name="heart" /></button>
              <a href="#/cart" aria-label={`Shopping bag, ${cart.reduce((s, p) => s + p.qty, 0)} items`} className="relative flex min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center rounded-full hover:bg-stone-100">
                <Icon name="bag" />
                <span className="absolute right-0 top-0 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-[#8b5943] text-[10px] sm:text-xs text-white">{cart.reduce((s, p) => s + p.qty, 0)}</span>
              </a>
              <button className="flex min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center rounded-full hover:bg-stone-100 md:hidden" aria-label="Toggle navigation menu" aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Icon name="menu" /></button>
            </div>
          </div>
          {mobileNav && <div className="border-t border-[#f1e9df] bg-[#fffdf9] px-4 py-4 md:hidden shadow-lg animate-in slide-in-from-top-2 duration-200">
            <form className="mb-4 flex items-center gap-2 rounded-md border border-[#e4d9ce] bg-[#faf7f1] px-3 py-1" onSubmit={e => { e.preventDefault(); setMobileNav(false); go('/shop'); }}>
              <Icon name="search" className="text-[#8c7865]" />
              <input className="min-h-10 w-full bg-transparent text-sm outline-none" placeholder="Search cakes, bakes, treats..." value={query} onChange={e => { setQuery(e.target.value); }} />
              <button className="text-xs font-semibold text-[#8b5943] px-2 py-1">Go</button>
            </form>
            <div className="grid grid-cols-2 gap-1.5 pb-3 border-b border-[#eee4d6]">
              {['All treats', ...categoriesList].map(c => (
                <button key={c} onClick={() => { setMobileNav(false); shop(c === 'All treats' ? 'All treats' : c); }} className={`flex min-h-10 items-center rounded-md px-3 text-left text-xs sm:text-sm ${category === c && path === '/shop' ? 'bg-[#734738] text-white font-medium' : 'hover:bg-[#f6efe6]'}`}>
                  {c === 'All treats' ? 'All Cakes' : c}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1 pt-3">
              <a href="#/track-order" onClick={() => setMobileNav(false)} className={`flex min-h-10 items-center justify-between px-3 text-sm font-medium ${path === '/track-order' ? 'text-[#734738] font-semibold' : 'hover:text-[#734738]'}`}>
                <span>{signedIn ? 'My Orders & Tracking →' : 'Track Orders / Guest Orders →'}</span>
                {!signedIn && savedGuestOrders.length > 0 && (
                  <span className="rounded-full bg-[#8b5943] px-2 py-0.5 text-[10px] font-bold text-white">
                    {savedGuestOrders.length} saved
                  </span>
                )}
              </a>
              <a href="#/about" onClick={() => setMobileNav(false)} className="flex min-h-10 items-center px-3 text-sm font-medium hover:text-[#734738]">About Us →</a>
              <a href="#/contact" onClick={() => setMobileNav(false)} className="flex min-h-10 items-center px-3 text-sm font-medium hover:text-[#734738]">Contact & Location →</a>
              <a href="#/account" onClick={() => setMobileNav(false)} className="flex min-h-10 items-center px-3 text-sm font-medium hover:text-[#734738]">My Account & Login →</a>
            </div>
          </div>}
          <nav aria-label="Main navigation" className="hidden mx-auto max-w-[1360px] flex-wrap items-center justify-center gap-x-8 border-t border-[#f1e9df] px-5 md:flex">
            {['All treats', ...categoriesList.slice(0, 5)].map(c => (
              <button key={c} onClick={() => shop(c)} className={`min-h-11 text-sm ${category === c && path === '/shop' ? 'font-semibold text-[#a45d4c]' : 'hover:text-[#a45d4c]'}`}>{c === 'All treats' ? 'All Cakes' : c}</button>
            ))}
            {categoriesList.includes('Wedding Cakes') ? (
              <button onClick={() => shop('Wedding Cakes')} className="min-h-11 text-sm hover:text-[#a45d4c]">Special Occasions <span className="ml-1 text-xs">⌄</span></button>
            ) : null}
            <a href="#/about" className="flex min-h-11 items-center text-sm hover:text-[#a45d4c]">About Us</a>
            <a href="#/contact" className="flex min-h-11 items-center text-sm hover:text-[#a45d4c]">Contact & Location</a>
            <a href="#/track-order" className={`flex min-h-11 items-center text-sm font-medium ${path === '/track-order' ? 'font-semibold text-[#a45d4c]' : 'text-[#734738] hover:text-[#a45d4c]'}`}>
              {signedIn ? 'My Orders' : 'Track Orders'}
            </a>
          </nav>
        </header>
      </>
    ) : (!authLoading && isStaffOrAdmin) ? (
      <>
        <header className="flex items-center justify-between gap-3 border-b border-[#e5dbd0] bg-white px-3 sm:px-6 py-3 sm:py-4 lg:px-10 sticky top-0 z-40">
          {logo}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <span className={`hidden sm:inline-flex rounded-full px-3 py-1 text-xs font-semibold ${isAdminUser ? 'bg-[#f5e8da] text-[#734738]' : 'bg-[#e7eede] text-[#4a633a]'}`}>
              {isAdminUser ? 'Administrator' : 'Bakery Staff'}
            </span>
            <button aria-label={`${newCount} new orders`} onClick={() => { setSeen(Date.now()); go('/admin/orders'); }} className="relative flex min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center rounded-full hover:bg-stone-100">
              <Icon name="bell" />
              {newCount > 0 && <span className="absolute right-0.5 top-0.5 rounded-full bg-[#934c3f] px-1.5 text-[10px] font-bold text-white">{newCount}</span>}
            </button>
            <button className="flex min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center rounded-full hover:bg-stone-100 lg:hidden" aria-label="Toggle admin menu" aria-expanded={adminMenuOpen} onClick={() => setAdminMenuOpen(!adminMenuOpen)}>
              <Icon name="menu" />
            </button>
            <button onClick={async () => { await handleUserSignOut('Signed out of bakery workspace.', '/'); }} className="hidden md:inline-flex text-xs text-[#974c40] hover:underline px-2 py-1">
              Sign out
            </button>
            <a href="#/" className="hidden sm:inline-flex text-xs sm:text-sm underline">Visit store ↗</a>
          </div>
        </header>
        {adminMenuOpen && (
          <div className="border-b border-[#e4d9ce] bg-[#fffdf9] px-4 py-3 lg:hidden shadow-lg animate-in slide-in-from-top-2 duration-200">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8b705c]">Admin Workspace Navigation</p>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${isAdminUser ? 'bg-[#f5e8da] text-[#734738]' : 'bg-[#e7eede] text-[#4a633a]'}`}>
                {isAdminUser ? 'Admin' : 'Staff'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {adminTabs.map((tab, i) => {
                const url = `/admin${i ? '/' + tab.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-') : ''}`;
                return (
                  <a key={tab} href={`#${url}`} onClick={() => setAdminMenuOpen(false)} className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-xs sm:text-sm ${path === url ? 'bg-[#754936] text-white font-medium' : 'hover:bg-[#f6efe6]'}`}>
                    <Icon name={['grid', 'bag', 'cake', 'menu', 'user', 'heart', 'grid', 'edit'][i]} className="!h-3.5 !w-3.5" />
                    {tab}
                  </a>
                );
              })}
            </div>
            <div className="mt-3 pt-2 border-t border-[#eee4d6] flex justify-between items-center">
              <button onClick={async () => { setAdminMenuOpen(false); await handleUserSignOut('Signed out of bakery workspace.', '/'); }} className="text-xs text-[#974c40] underline">
                Sign out
              </button>
              <a href="#/" className="text-xs font-medium text-[#754936] underline">Visit customer store ↗</a>
              <button onClick={() => setAdminMenuOpen(false)} className="text-xs text-[#79695c]">Close ✕</button>
            </div>
          </div>
        )}
      </>
    ) : (
      <header className="flex items-center justify-between gap-3 border-b border-[#e5dbd0] bg-white px-3 sm:px-6 py-3 sm:py-4 lg:px-10 sticky top-0 z-40">
        {logo}
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="rounded-full bg-[#f5e8da] px-3 py-1 text-xs font-semibold text-[#734738]">Management Portal</span>
          <a href="#/" className="text-xs sm:text-sm underline hover:text-[#734738]">Visit customer store ↗</a>
        </div>
      </header>
    )}

    {path === '/' && (
      catalogueLoading ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center animate-in fade-in duration-300">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d6c3ae] bg-[#faf6ef] shadow-sm animate-pulse mb-4">
            <Icon name="cake" className="!h-8 !w-8 text-[#8b6244]" />
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl text-[#432e26]">Preparing fresh bakes...</h2>
          <p className="mt-2 text-xs sm:text-sm text-[#79695c] max-w-sm">
            Connecting to Sri Laxmi Narasimha Bakery catalogue.
          </p>
        </div>
      ) : (catalogueError && !isUsingOfflineCatalogue) ? (
        <div className="mx-auto max-w-lg my-12 px-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 sm:p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 border border-amber-300">
              <Icon name="cake" className="!h-6 !w-6 text-amber-800" />
            </div>
            <h3 className="font-serif text-xl sm:text-2xl text-[#432e26]">Catalogue Connection Notice</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#79695c]">
              {catalogueError}
            </p>
            <div className="mt-6 flex flex-col xs:flex-row gap-3 justify-center">
              <button onClick={() => loadCatalogueAndSettings()} className={button}>
                Retry Connection
              </button>
              <button
                onClick={() => setIsUsingOfflineCatalogue(true)}
                className="min-h-11 rounded-md border border-[#b9a08e] px-4 text-xs sm:text-sm font-medium text-[#734738] hover:bg-white transition"
              >
                Browse Offline Preview
              </button>
            </div>
          </div>
        </div>
      ) : (
        <main>
          <section className="relative isolate min-h-[440px] sm:min-h-[470px] overflow-hidden bg-[#f1e9dc] lg:min-h-[520px]"><Photo src="/images/strawberry-hero.png" alt="Fresh strawberry cream cake on a ceramic stand in our sunlit bakery" className="absolute inset-0 -z-20 h-full w-full object-cover object-[65%_58%] md:object-[center_58%]" /><div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#f4eee3] via-[#f4eee3]/90 to-transparent md:via-[#f4eee3]/40 md:to-transparent" /><div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 sm:py-16 md:py-20 lg:px-14"><div className="max-w-[540px]"><p className="mb-3 sm:mb-5 flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs font-medium uppercase tracking-[.2em] sm:tracking-[.23em] text-[#865b43]"><span className="h-px w-5 sm:w-7 bg-[#ad8567]" /> Little moments. Sweeter memories.</p><h1 className="font-serif text-3xl xs:text-4xl sm:text-5xl md:text-[56px] lg:text-[68px] leading-[1.1] tracking-tight">Made with love.<br />Baked for <em className="font-normal text-[#a76556]">your</em><br /><em className="font-normal text-[#a76556]">happy moments.</em></h1><p className="mb-6 sm:mb-7 mt-4 sm:mt-6 max-w-[380px] text-xs sm:text-sm leading-6 sm:leading-7 text-[#685347]">Handcrafted cakes and delightful bakes, made fresh every day. Because every moment deserves a little sweetness.</p><button onClick={() => shop()} className={`${button} w-full xs:w-auto min-h-12 justify-center`}>Find your sweet treat <Icon name="arrow" className="ml-3 sm:ml-4 !h-4 !w-4" /></button><div className="mt-6 sm:mt-7 flex items-center gap-3"><div className="flex -space-x-2">{['photo-1534528741775-53994a69daeb', 'photo-1506794778202-cad84cf45f1d', 'photo-1517841905240-472988babdf9'].map((id, i) => <Photo key={id} src={`https://images.unsplash.com/${id}?w=80&h=80&fit=crop&crop=faces`} alt={`Happy customer ${i + 1}`} className="h-8 w-8 rounded-full border-2 border-[#fff8ed] object-cover" />)}</div><div className="text-xs"><span className="tracking-widest text-[#946a37]">★★★★★</span><p className="mt-0.5 sm:mt-1 text-[#685347] text-[11px] sm:text-xs">Loved by 2,000+ happy customers</p></div></div></div></div><div className="absolute bottom-4 sm:bottom-5 left-1/2 flex -translate-x-1/2 gap-2" aria-hidden="true"><span className="h-1.5 w-6 rounded-full bg-[#8c5b43]" /><span className="h-1.5 w-1.5 rounded-full bg-[#b4a28b]" /><span className="h-1.5 w-1.5 rounded-full bg-[#b4a28b]" /></div></section>
          <div className="border-y border-[#e7dfd3] bg-[#faf6ef]"><div className="mx-auto grid max-w-[1280px] grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5 px-4 sm:px-6 py-4 sm:py-5">{[['cake', 'Baked fresh, every day', 'No shortcuts. Just real ingredients.'], ['leaf', 'Made with the good stuff', 'Quality you can taste in every bite.'], ['truck', 'Happiness, delivered', 'Carefully packed. Right on time.'], ['heart', 'A little love in every bite', 'Handcrafted for your special moments.']].map(([icon, title, sub]) => <div key={title} className="flex items-center justify-start xs:justify-center gap-3 p-1"><Icon name={icon} className="!h-6 !w-6 sm:!h-7 sm:!w-7 shrink-0 text-[#8e7651]" /><div className="min-w-0"><p className="text-xs sm:text-sm font-semibold truncate">{title}</p><p className="mt-0.5 hidden text-xs text-[#796a5b] lg:block">{sub}</p></div></div>)}</div></div>
          <section className="mx-auto max-w-[1360px] px-4 sm:px-6 py-10 sm:py-14 lg:px-12"><div className="text-center"><p className="mb-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[.2em] text-[#9b6255]">There’s something for every craving</p><h2 className="font-serif text-2xl xs:text-3xl sm:text-4xl">What are you celebrating?</h2><p className="mt-2 sm:mt-3 text-xs sm:text-sm text-[#79695c]">Big occasions or just-because days. Find your perfect treat.</p></div><div className="mt-7 sm:mt-9 grid grid-cols-2 xs:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-5 md:gap-8">{categoriesList.slice(0, 6).map((c, i) => <button key={c} onClick={() => shop(c)} className="group text-center min-w-0"><div className="mx-auto aspect-square w-full max-w-[110px] xs:max-w-[130px] sm:max-w-[148px] overflow-hidden rounded-full bg-[#f2e5dd] p-1.5 ring-1 ring-[#e7dace] ring-offset-2 sm:ring-offset-4 ring-offset-[#fffdf9]"><Photo src={products[[0, 3, 1, 4, 6, 5][i % 6]]?.image || initialProducts[i % initialProducts.length]?.image} alt={c} className="h-full w-full rounded-full object-cover transition duration-500 group-hover:scale-110" /></div><p className="mt-3 sm:mt-5 text-xs sm:text-sm font-medium truncate">{c}</p></button>)}</div></section>
          <section className="mx-auto max-w-[1360px] px-4 sm:px-6 pb-10 sm:pb-14 pt-2 lg:px-12"><div className="mb-5 sm:mb-7 flex flex-col xs:flex-row xs:items-end justify-between gap-3"><div><p className="mb-1.5 sm:mb-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[.2em] text-[#9b6255]">The ones everyone loves</p><h2 className="font-serif text-2xl xs:text-3xl sm:text-4xl">Baked to be bestsellers</h2><p className="mt-1.5 sm:mt-3 text-xs sm:text-sm text-[#79695c]">Tried, tasted, and loved. Your next favourite is right here.</p></div><button onClick={() => shop()} className="flex min-h-11 shrink-0 items-center gap-2 text-xs sm:text-sm underline decoration-[#b9a18d] underline-offset-4">View all treats <Icon name="arrow" className="!h-4 !w-4" /></button></div><div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">{products.filter(p => p.bestseller).slice(0, 4).map(p => <ProductCard key={p.id} product={p} isWished={wishlist.includes(p.id)} onOpen={openProduct} onToggleWishlist={toggleWishlist} onAddToCart={addToCart} />)}</div></section>
          <section className="mx-auto grid max-w-[1360px] gap-4 sm:gap-6 px-4 sm:px-6 pb-10 sm:pb-14 md:grid-cols-2 lg:px-12">{[['Little treats. Big smiles.', 'A box full of happiness, just for you.', 'Cupcakes', products[4]?.image || initialProducts[4].image], ['For your forever kind of love.', 'Celebrate your beautiful story with a beautiful cake.', 'Anniversary Cakes', products[3]?.image || initialProducts[3].image]].map(([title, sub, cat, image], i) => <div key={title} className={`flex flex-col-reverse xs:flex-row min-h-[200px] sm:min-h-[230px] items-stretch xs:items-center overflow-hidden rounded-xl ${i ? 'bg-[#f4e5de]' : 'bg-[#edf0e5]'}`}><div className="z-10 w-full xs:w-3/5 p-5 sm:p-7"><p className="mb-2 sm:mb-3 text-[10px] sm:text-xs uppercase tracking-widest">{i ? 'Made for your moments' : 'Happiness in a little box'}</p><h3 className="font-serif text-xl sm:text-2xl md:text-3xl leading-tight">{title}</h3><p className="mb-3 sm:mb-4 mt-2 sm:mt-3 text-xs sm:text-sm text-[#6d5c50]">{sub}</p><button className="min-h-11 text-xs sm:text-sm font-semibold underline underline-offset-4" onClick={() => shop(cat)}>Explore collection →</button></div><div className="w-full xs:w-2/5 h-44 xs:h-full xs:min-h-[230px] shrink-0"><Photo src={image} alt={cat} className="h-full w-full object-cover" /></div></div>)}</section>
          <section className="bg-[#f8f3ec] px-4 sm:px-6 py-10 sm:py-14"><div className="mx-auto max-w-[1264px]"><div className="text-center"><p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[.2em] text-[#9b6255]">Notes that make our day</p><h2 className="mt-1.5 sm:mt-2 font-serif text-2xl xs:text-3xl sm:text-4xl">Sweet words, sweeter memories.</h2></div><div className="mt-7 sm:mt-9 grid gap-4 sm:gap-5 md:grid-cols-3">{[['Ananya S.', 'The strawberry cake was an absolute dream. Not too sweet, so fresh, and honestly the highlight of my birthday!'], ['Rahul M.', 'Ordered for our anniversary and every little detail was perfect. You can really taste the love that goes into it.'], ['Priya K.', 'Our go-to for every celebration now. The Belgian chocolate cake never lasts more than a minute!']].map(([name, text]) => <div key={name} className="rounded-xl border border-[#eadfd4] bg-[#fffdf9] p-5 sm:p-7"><p className="tracking-widest text-[#8f6334] text-xs sm:text-sm">★★★★★</p><p className="my-3 sm:my-5 text-xs sm:text-sm leading-6 sm:leading-7 text-[#6c574b]">“{text}”</p><p className="text-xs sm:text-sm font-semibold">{name} <span className="ml-2 text-[10px] sm:text-xs font-normal text-[#726a56]">Verified customer</span></p></div>)}</div></div></section>
          <section className="mx-auto flex max-w-[1264px] flex-col items-start md:items-center justify-between gap-6 px-4 sm:px-6 py-10 sm:py-14 md:flex-row"><div><p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[.2em] text-[#9b6255]">From our oven to your inbox</p><h2 className="mt-1.5 sm:mt-2 font-serif text-2xl sm:text-3xl">A little sweetness. Delivered.</h2><p className="mt-2 sm:mt-3 text-xs sm:text-sm text-[#79695c]">New bakes, special treats, and a little inspiration.</p></div><form className="flex flex-col xs:flex-row w-full max-w-md gap-2" onSubmit={e => { e.preventDefault(); notify('You’re on the list! Subscription saved in this browser.'); try { localStorage.setItem('crumb-newsletter', String(new FormData(e.currentTarget).get('newsletter'))); } catch { /* optional */ } e.currentTarget.reset(); }}><input required name="newsletter" type="email" aria-label="Email for newsletter" placeholder="Your email address" className={field} /><button className={`${button} shrink-0 justify-center`}>Subscribe</button></form></section>
        </main>
      )
    )}

    {path === '/shop' && (
      catalogueLoading ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center animate-in fade-in duration-300">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d6c3ae] bg-[#faf6ef] shadow-sm animate-pulse mb-4">
            <Icon name="cake" className="!h-8 !w-8 text-[#8b6244]" />
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl text-[#432e26]">Preparing fresh bakes...</h2>
          <p className="mt-2 text-xs sm:text-sm text-[#79695c] max-w-sm">
            Connecting to Sri Laxmi Narasimha Bakery catalogue.
          </p>
        </div>
      ) : (catalogueError && !isUsingOfflineCatalogue) ? (
        <div className="mx-auto max-w-lg my-12 px-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 sm:p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 border border-amber-300">
              <Icon name="cake" className="!h-6 !w-6 text-amber-800" />
            </div>
            <h3 className="font-serif text-xl sm:text-2xl text-[#432e26]">Catalogue Connection Notice</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#79695c]">
              {catalogueError}
            </p>
            <div className="mt-6 flex flex-col xs:flex-row gap-3 justify-center">
              <button onClick={() => loadCatalogueAndSettings()} className={button}>
                Retry Connection
              </button>
              <button
                onClick={() => setIsUsingOfflineCatalogue(true)}
                className="min-h-11 rounded-md border border-[#b9a08e] px-4 text-xs sm:text-sm font-medium text-[#734738] hover:bg-white transition"
              >
                Browse Offline Preview
              </button>
            </div>
          </div>
        </div>
      ) : (
        <main className="mx-auto max-w-[1360px] px-3 sm:px-6 py-6 sm:py-10 lg:px-12"><p className="mb-4 sm:mb-6 text-xs text-[#79695c]"><a href="#/">Home</a> / Our bakes</p>{heading('A little something sweet', category === 'All treats' ? 'Freshly baked happiness.' : category, 'Made with real ingredients, a little patience, and a whole lot of love.')}<div className="mb-5 sm:mb-7 flex flex-col justify-between gap-3 sm:gap-4 sm:flex-row"><form onSubmit={e => e.preventDefault()} className="flex w-full sm:max-w-md lg:max-w-lg items-center gap-2 sm:gap-3 rounded-md border border-[#e4d9ce] px-3 bg-white"><Icon name="search" className="shrink-0 text-[#8c7865]" /><input className="min-h-11 w-full bg-transparent text-sm outline-none" aria-label="Search products" placeholder="Find your favourite treat…" value={query} onChange={e => setQuery(e.target.value)} /></form><select aria-label="Sort products" className={`${field} sm:max-w-[200px] lg:max-w-[220px]`} value={sort} onChange={e => setSort(e.target.value)}>{['Popular', 'Price: low to high', 'Price: high to low', 'Top rated'].map(s => <option key={s}>{s}</option>)}</select></div><div className="flex flex-col gap-6 lg:flex-row lg:gap-8"><aside className="shrink-0 lg:w-48"><h2 className="mb-3 sm:mb-4 font-serif text-lg sm:text-xl">Our collections</h2><div className="flex overflow-x-auto pb-2 gap-1.5 lg:flex-col lg:overflow-visible scrollbar-none">{['All treats', ...categoriesList, 'Wishlist'].map(c => <button key={c} className={`min-h-10 shrink-0 whitespace-nowrap rounded-md px-3 text-left text-xs sm:text-sm ${c === category ? 'bg-[#f2e5d9] font-semibold' : 'hover:bg-[#f8f2eb]'}`} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="mt-3 sm:mt-5 flex min-h-11 items-center gap-2 text-xs sm:text-sm"><input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)} className="accent-[#734738]" />Available only</label></aside><div className="min-w-0 flex-1"><p className="mb-3 sm:mb-4 text-xs sm:text-sm text-[#79695c]">{visibleProducts.length} delicious possibilities</p><div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">{visibleProducts.map(p => <ProductCard key={p.id} product={p} isWished={wishlist.includes(p.id)} onOpen={openProduct} onToggleWishlist={toggleWishlist} onAddToCart={addToCart} />)}</div>{!visibleProducts.length && <div className="rounded-xl bg-[#f8f2eb] p-8 sm:p-12 text-center"><h2 className="font-serif text-xl sm:text-2xl">No treats found just yet</h2><p className="my-3 sm:my-4 text-xs sm:text-sm">Try another search or explore all our bakes.</p><button className={button} onClick={() => { setQuery(''); setCategory('All treats'); }}>Clear filters</button></div>}</div></div></main>
      )
    )}

    {(path === '/cart' || path === '/checkout') && <main className="mx-auto max-w-[1160px] px-3 sm:px-6 py-6 sm:py-12">{heading('Your sweetest delivery', path === '/cart' ? 'A bag full of happiness.' : checkoutStep === 'otp' ? 'Verify your email.' : 'The final little details.', path === '/cart' ? 'Freshly made for you. Carefully delivered to your door.' : checkoutStep === 'otp' ? 'We’ve sent an 8-digit verification code to confirm your order.' : 'Freshly made for you. Carefully delivered to your door.')}<div className="grid items-start gap-6 sm:gap-8 lg:grid-cols-[1fr_360px]"><div>{path === '/cart' ? <>{hasUnavailableItems && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:p-4 text-xs sm:text-sm text-red-900"><span>Some bakes in your bag are currently out of stock. Please remove them to proceed.</span><button type="button" onClick={() => setCart(old => old.filter(isItemAvailable))} className="rounded border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-100">Remove sold out bakes</button></div>}{cart.length ? cart.map(p => { const available = isItemAvailable(p); return <div key={p.key} className={`mb-3 sm:mb-4 flex flex-col xs:flex-row gap-3 sm:gap-4 rounded-xl border p-3 sm:p-4 ${available ? 'border-[#e7ddd2] bg-white' : 'border-red-200 bg-red-50/40'}`}><Photo src={p.image} alt={p.name} className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-lg object-cover" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-1.5"><h2 className="font-serif text-lg sm:text-xl truncate">{p.name}</h2>{!available && <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-red-800 border border-red-200">Sold out</span>}</div><p className="mt-1 text-xs sm:text-sm text-[#79695c]">{p.weight} · {p.egg}{p.message && ` · “${p.message}”`}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f2eae1] pt-2 xs:border-none xs:pt-0"><div className="flex items-center rounded border border-[#e7ddd2]"><button aria-label={`Decrease ${p.name} quantity`} className="min-h-10 min-w-10 sm:min-h-11 sm:min-w-11" onClick={() => updateQty(p.key, -1)}>−</button><span className="px-2 text-xs sm:text-sm">{p.qty}</span><button aria-label={`Increase ${p.name} quantity`} className="min-h-10 min-w-10 sm:min-h-11 sm:min-w-11" onClick={() => updateQty(p.key, 1)}>+</button></div><span className="font-semibold text-sm sm:text-base">{money(p.unitPrice * p.qty)}</span><button aria-label={`Remove ${p.name}`} onClick={() => setCart(old => old.filter(x => x.key !== p.key))} className="flex min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center text-[#8b5d4a] hover:bg-stone-50 rounded-full"><Icon name="trash" /></button></div></div></div>; }) : <div className="rounded-xl bg-[#f8f2eb] p-8 sm:p-10 text-center"><Icon name="bag" className="mx-auto mb-4 !h-10 !w-10 sm:!h-12 sm:!w-12" /><h2 className="font-serif text-2xl sm:text-3xl">A little room for something sweet.</h2><p className="my-3 sm:my-4 text-xs sm:text-sm">Your bag is empty. Let’s fix that.</p><button className={button} onClick={() => shop()}>Explore our bakes</button></div>}<button onClick={() => shop()} className="min-h-11 text-xs sm:text-sm underline underline-offset-4">← Keep exploring</button></> : checkoutStep === 'otp' ? (
  <div className="rounded-xl border border-[#e7ddd2] bg-white p-4 xs:p-6 sm:p-8 md:p-10 shadow-xs">
    <div className="text-center mb-6 sm:mb-8">
      <div className="mx-auto mb-4 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-[#f6eee4] border border-[#d6c3ae] text-[#734738]">
        <Icon name="mail" className="!h-7 !w-7 text-[#734738]" />
      </div>
      <h2 className="font-serif text-2xl xs:text-3xl text-[#432e26]">Verify your email</h2>
      <p className="mt-2 text-xs sm:text-sm text-[#79695c] max-w-md mx-auto">
        We've sent an 8-digit verification code to
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
        <span className="font-medium text-[#432e26] text-xs sm:text-sm bg-[#faf6ef] px-3 py-1 rounded-full border border-[#eee4d6]">
          {checkoutDraft.email || 'your email'}
        </span>
        <button
          type="button"
          onClick={handleBackToCheckoutDetails}
          className="text-xs text-[#734738] font-medium underline underline-offset-2 hover:text-[#5a3427]"
        >
          Change email address
        </button>
      </div>
    </div>

    {otpError && (
      <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 sm:p-4 text-xs sm:text-sm text-red-900 leading-relaxed font-medium" role="alert">
        <p className="font-semibold mb-0.5">Verification notice:</p>
        <p>{otpError}</p>
      </div>
    )}

    <div className="mb-6 sm:mb-8">
      <label className="block text-center text-xs font-semibold uppercase tracking-wider text-[#9b6255] mb-4">
        Enter 8-digit verification code
      </label>
      <div className="flex justify-center items-center gap-1 xs:gap-1.5 sm:gap-2.5 max-w-full overflow-x-auto py-1">
        {otpDigits.map((digit, idx) => (
          <input
            key={idx}
            ref={el => { otpInputRefs.current[idx] = el; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete={idx === 0 ? 'one-time-code' : 'off'}
            value={digit}
            onChange={e => handleOtpChange(idx, e.target.value)}
            onKeyDown={e => handleOtpKeyDown(idx, e)}
            onPaste={handleOtpPaste}
            disabled={isVerifyingOtp || isSendingOtp}
            className={`h-11 w-8 xs:h-12 xs:w-9 sm:h-14 sm:w-11 text-center text-lg xs:text-xl sm:text-2xl font-serif font-bold rounded-lg border transition outline-none p-0 ${
              digit ? 'border-[#734738] bg-[#fffcf7] text-[#432e26]' : 'border-[#d6c3ae] bg-white text-[#432e26]'
            } focus:border-[#734738] focus:ring-2 focus:ring-[#734738]/20 disabled:opacity-50`}
            aria-label={`Digit ${idx + 1} of verification code`}
          />
        ))}
      </div>
    </div>

    <div className="space-y-4 max-w-sm mx-auto">
      <button
        type="button"
        onClick={handleVerifyOtpAndContinue}
        disabled={otpDigits.join('').length < 8 || isVerifyingOtp || isSendingOtp}
        className={`${button} w-full min-h-12 justify-center text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isVerifyingOtp ? (
          <span className="flex items-center gap-2">
            <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            Verifying code...
          </span>
        ) : isSendingOtp ? (
          <span className="flex items-center gap-2">
            <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            Sending code...
          </span>
        ) : (
          'Verify & Continue'
        )}
      </button>

      <div className="text-center text-xs text-[#79695c]">
        {otpResendSeconds > 0 ? (
          <span>Resend code in {otpResendSeconds}s</span>
        ) : (
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={isSendingOtp || isVerifyingOtp}
            className="text-[#734738] font-semibold underline underline-offset-2 hover:text-[#5a3427] disabled:opacity-50"
          >
            {isSendingOtp ? 'Sending code...' : 'Resend code'}
          </button>
        )}
      </div>

      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={handleBackToCheckoutDetails}
          disabled={isSendingOtp || isVerifyingOtp}
          className="text-xs text-[#79695c] hover:text-[#432e26] underline underline-offset-4 disabled:opacity-50"
        >
          ← Back to checkout details
        </button>
      </div>
    </div>
  </div>
) : <form id="checkout" onSubmit={placeOrder} className="grid gap-4 sm:gap-5 rounded-xl border border-[#e7ddd2] bg-white p-4 sm:p-6">{hasUnavailableItems && <div className="rounded-lg border border-red-200 bg-red-50 p-3 sm:p-4 text-xs sm:text-sm text-red-900"><p className="font-semibold">Some items are unavailable</p><p className="mt-1">Your bag contains sold out items. <a href="#/cart" className="underline font-medium">Return to bag</a> to remove them before placing your order.</p></div>}{checkoutError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 sm:p-4 text-xs sm:text-sm text-red-900 leading-relaxed font-medium" role="alert"><p className="font-semibold mb-0.5">Please check your details:</p><p>{checkoutError}</p></div>}<h2 className="font-serif text-xl sm:text-2xl">Delivery details</h2><div className="grid gap-3 sm:gap-4 md:grid-cols-2"><Field label="Full name"><input required name="name" value={checkoutDraft.name} onChange={e => updateCheckoutDraft({ name: e.target.value })} className={field} autoComplete="name" disabled={isPlacingOrder || isSendingOtp} /></Field><Field label="Mobile number"><input required name="phone" type="tel" pattern="[+0-9 \(\)\-]{10,16}" value={checkoutDraft.phone} onChange={e => updateCheckoutDraft({ phone: e.target.value })} className={field} autoComplete="tel" disabled={isPlacingOrder || isSendingOtp} /></Field></div><Field label="Email address"><input required type="email" name="email" value={checkoutDraft.email} onChange={e => updateCheckoutDraft({ email: e.target.value })} className={field} autoComplete="email" disabled={isPlacingOrder || isSendingOtp} /></Field>{signedIn && (
  <div className="space-y-2.5 pt-1">
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs sm:text-sm font-semibold text-[#432e26] flex items-center gap-1.5">
        <Icon name="pin" className="!h-4 !w-4 text-[#734738]" />
        Saved Delivery Addresses
      </label>
      <a
        href="#/account/addresses"
        className="text-xs font-medium text-[#734738] hover:underline"
      >
        Manage saved addresses ↗
      </a>
    </div>

    {addressesLoading ? (
      <div className="rounded-xl border border-[#e7ddd2] bg-[#faf6ef]/50 p-4 text-center">
        <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#734738] font-medium">
          <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-[#734738] border-t-transparent" />
          Loading your saved addresses...
        </div>
      </div>
    ) : addressesFetchError ? (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <span className="font-semibold block mb-0.5">Could not load saved addresses</span>
          <span>{addressesFetchError}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadCustomerAddresses()}
            className="px-2.5 py-1 text-xs font-semibold bg-white border border-red-300 rounded shadow-xs hover:bg-red-100 text-red-800"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={handleSelectManualAddress}
            className="px-2.5 py-1 text-xs font-semibold bg-[#734738] text-white rounded shadow-xs hover:bg-[#5a3427]"
          >
            Enter manually
          </button>
        </div>
      </div>
    ) : customerAddresses.length > 0 ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {customerAddresses.map(addr => {
          const isSelected = selectedCheckoutAddressId === addr.id;
          return (
            <div
              key={addr.id}
              onClick={() => handleSelectSavedAddress(addr)}
              className={`relative flex flex-col justify-between rounded-xl border p-3.5 cursor-pointer transition text-left ${
                isSelected
                  ? 'border-[#734738] bg-[#fcf8f4] ring-2 ring-[#734738]/20 shadow-xs'
                  : 'border-[#e7ddd2] bg-white hover:border-[#bda38f]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      addr.label?.toLowerCase() === 'work'
                        ? 'bg-stone-100 text-stone-700 border border-stone-200'
                        : addr.label?.toLowerCase() === 'other'
                        ? 'bg-[#f0e8e0] text-[#705244] border border-[#e4d6ca]'
                        : 'bg-[#f8ede2] text-[#844c38] border border-[#ebd2c3]'
                    }`}
                  >
                    {addr.label || 'Home'}
                  </span>
                  {addr.is_default && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#edf0e5] text-[#3d502d] border border-[#d2dcb9]">
                      <Icon name="check" className="!h-2.5 !w-2.5 text-[#3d502d]" />
                      Default
                    </span>
                  )}
                </div>
                <p className="font-semibold text-xs sm:text-sm text-[#432e26]">{addr.recipient_name}</p>
                <p className="text-[11px] text-[#79695c]">{addr.phone}</p>
                <p className="text-xs text-[#523e35] mt-1 leading-snug line-clamp-2">
                  {addr.street_address}{addr.landmark ? `, ${addr.landmark}` : ''}
                </p>
                <p className="text-[11px] font-medium text-[#79695c] mt-0.5">
                  {addr.city}, {addr.state} - {addr.postal_code}
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[#f0e6dc] flex items-center justify-between">
                <span className={`text-[11px] font-medium ${isSelected ? 'text-[#734738] font-bold' : 'text-[#79695c]'}`}>
                  {isSelected ? '✓ Delivering to this address' : 'Deliver here'}
                </span>
              </div>
            </div>
          );
        })}

        {/* Deliver to a different address card */}
        <div
          onClick={handleSelectManualAddress}
          className={`flex flex-col justify-center items-center rounded-xl border-2 border-dashed p-4 cursor-pointer transition text-center min-h-[105px] ${
            selectedCheckoutAddressId === 'manual'
              ? 'border-[#734738] bg-[#fcf8f4] ring-2 ring-[#734738]/20 shadow-xs'
              : 'border-[#ddcebd] bg-[#faf6ef]/40 hover:bg-[#faf6ef] hover:border-[#bda38f]'
          }`}
        >
          <span className="text-xs sm:text-sm font-semibold text-[#734738]">
            + Deliver to a different address
          </span>
          <span className="text-[11px] text-[#79695c] mt-1">
            {selectedCheckoutAddressId === 'manual'
              ? 'Editing custom address below'
              : 'Enter a custom or one-off delivery location'}
          </span>
        </div>
      </div>
    ) : null}
  </div>
)}<Field label={signedIn && customerAddresses.length > 0 && selectedCheckoutAddressId && selectedCheckoutAddressId !== 'manual' ? "Delivery address details (from selected address)" : "Delivery address, including postcode"}><textarea required minLength={12} name="address" value={checkoutDraft.address} onChange={e => { const addr = e.target.value; const match = addr.match(/\b([1-9][0-9]{5})\b/); updateCheckoutDraft({ address: addr, pinCode: match ? match[1] : checkoutDraft.pinCode }); }} className={field} rows={3} autoComplete="street-address" placeholder="House/Flat, Street, Area, City, PIN Code (e.g. 505528)" disabled={isPlacingOrder || isSendingOtp} /></Field><div className="grid gap-3 sm:gap-4 md:grid-cols-2"><Field label="Delivery date"><input required type="date" name="date" min={new Date().toLocaleDateString('en-CA')} value={checkoutDraft.date || cart.find(p => p.date)?.date || ''} onChange={e => updateCheckoutDraft({ date: e.target.value })} className={field} disabled={isPlacingOrder || isSendingOtp} /></Field><Field label="Preferred delivery time"><select name="time" value={checkoutDraft.timeSlot || (business.deliveryTimeSlots && business.deliveryTimeSlots.length > 0 ? business.deliveryTimeSlots[0] : '10 AM – 1 PM')} onChange={e => updateCheckoutDraft({ timeSlot: e.target.value })} className={field} disabled={isPlacingOrder || isSendingOtp}>{(business.deliveryTimeSlots && business.deliveryTimeSlots.length > 0 ? business.deliveryTimeSlots : ['10 AM – 1 PM', '1 PM – 4 PM', '4 PM – 7 PM', '7 PM – 10 PM']).map(s => <option key={s} value={s}>{s}</option>)}</select></Field></div><Field label="Special instructions (optional)"><textarea name="instructions" value={checkoutDraft.instructions} onChange={e => updateCheckoutDraft({ instructions: e.target.value })} className={field} rows={2} placeholder="Anything we should know?" disabled={isPlacingOrder || isSendingOtp} /></Field><fieldset className="space-y-2.5 sm:space-y-3"><legend className="mb-2 sm:mb-3 font-serif text-xl sm:text-2xl">Payment method</legend>{['Cash on delivery', 'UPI — simulated payment', 'Card — simulated payment'].map((m, i) => <label key={m} className={`flex min-h-11 items-center gap-3 rounded-md border border-[#e7ddd2] px-3 sm:px-4 text-xs sm:text-sm ${i !== 0 ? 'opacity-60 bg-stone-50 cursor-not-allowed' : ''}`}><input type="radio" name="payment" value={m} checked={(checkoutDraft.paymentMethod || 'Cash on delivery') === m} onChange={() => updateCheckoutDraft({ paymentMethod: m })} disabled={i !== 0 || isPlacingOrder || isSendingOtp} className="accent-[#734738]" /><span>{m}</span>{i !== 0 && <span className="ml-auto text-[10px] text-[#79695c] font-medium bg-[#f2e7db] px-2 py-0.5 rounded">Disabled in prod</span>}</label>)}</fieldset><p className="text-xs leading-5 text-[#79695c]">Real order placed securely with Sri Laxmi Narasimha Bakery. Pay via Cash on Delivery when your fresh bakes arrive.</p></form>}</div><aside className="rounded-xl border border-[#e7ddd2] bg-[#faf6ef] p-4 sm:p-6"><h2 className="mb-4 sm:mb-5 font-serif text-xl sm:text-2xl">Your sweet summary</h2>{path === '/checkout' && cart.map(p => <p key={p.key} className="mb-2.5 sm:mb-3 flex justify-between gap-3 text-xs sm:text-sm"><span>{p.qty} × {p.name} <span className="text-[11px] sm:text-xs text-[#76685d]">({p.weight})</span></span><span className="shrink-0 font-medium">{money(p.qty * p.unitPrice)}</span></p>)}<div className="space-y-3 sm:space-y-4 border-b border-[#e5d9cd] pb-4 sm:pb-5 text-xs sm:text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></p><p className="flex justify-between"><span>Delivery</span><span>{delivery ? money(delivery) : 'On us'}</span></p>{discount && isCouponValid && <div className="flex items-center justify-between text-green-800"><span>SWEET10 · 10% off</span><div className="flex items-center gap-2"><span>−{money(savings)}</span><button type="button" onClick={() => { setDiscount(false); notify('Coupon removed'); }} className="text-xs text-red-700 underline hover:text-red-900" aria-label="Remove coupon">Remove</button></div></div>}{discount && !offerActive && <p className="text-xs text-amber-800 bg-amber-50 rounded p-2 border border-amber-200">The SWEET10 promotion is currently paused by the bakery.</p>}</div><form className="my-4 sm:my-5 flex flex-wrap xs:flex-nowrap gap-2" onSubmit={e => { e.preventDefault(); if (!subtotal) { notify('Add items to your bag before applying a coupon.'); return; } if (coupon.trim().toUpperCase() === 'SWEET10') { if (!offerActive) { notify('SWEET10 is currently paused and cannot be applied.'); setDiscount(false); return; } setDiscount(true); notify('A sweet 10% off applied!'); } else { setDiscount(false); notify('That coupon is not available. Try SWEET10.'); } }}><input className={`${field} flex-1 min-w-[120px]`} value={coupon} onChange={e => setCoupon(e.target.value)} aria-label="Coupon code" placeholder="Coupon code..." disabled={isPlacingOrder || isSendingOtp} /><button className="min-h-11 px-3 text-xs sm:text-sm font-semibold shrink-0 bg-[#e6dacb] rounded-md hover:bg-[#d8c8b6]" disabled={isPlacingOrder || isSendingOtp}>Apply</button>{(discount || coupon) && <button type="button" onClick={() => { setDiscount(false); setCoupon(''); notify('Coupon cleared'); }} className="min-h-11 px-2 text-xs text-[#79695c] hover:underline shrink-0" disabled={isPlacingOrder || isSendingOtp}>Clear</button>}</form><p className="mb-5 sm:mb-6 flex justify-between text-base sm:text-lg font-semibold"><span>Total</span><span>{money(total)}</span></p>{path === '/cart' ? <button disabled={!cart.length || hasUnavailableItems} className={`${button} w-full min-h-12 justify-center text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed`} onClick={() => go('/checkout')}>{hasUnavailableItems ? 'Remove sold out items to checkout' : <>Proceed to checkout <Icon name="arrow" /></>}</button> : checkoutStep === 'otp' ? <button type="button" onClick={handleVerifyOtpAndContinue} disabled={otpDigits.join('').length < 8 || isVerifyingOtp || isSendingOtp} className={`${button} w-full min-h-12 justify-center text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed`}>{isVerifyingOtp ? <span className="flex items-center gap-2"><span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />Verifying code...</span> : 'Verify & Continue'}</button> : <button form="checkout" disabled={!cart.length || hasUnavailableItems || isPlacingOrder || isSendingOtp || (signedIn && addressesLoading)} className={`${button} w-full min-h-12 justify-center text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed`}>{isPlacingOrder ? 'Placing your order with bakery...' : isSendingOtp ? 'Sending verification code...' : (signedIn && addressesLoading) ? 'Loading saved addresses...' : hasUnavailableItems ? 'Cannot order sold out items' : `Place order · ${money(total)}`}</button>}<p className="mt-3 sm:mt-4 text-center text-[11px] sm:text-xs text-[#79695c]">Made fresh. Packed with care. Always.</p></aside></div></main>}

    {path === '/order-success' && (
      <main className="mx-auto max-w-[800px] px-3 sm:px-6 py-8 sm:py-14">
        {confirmedOrder ? (
          <div className="rounded-2xl border border-[#e7ddd2] bg-white p-5 sm:p-8 md:p-10 shadow-sm">
            <div className="text-center mb-6 sm:mb-8">
              <div className="mx-auto mb-4 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-[#f2e7db] text-[#734738] border border-[#d6c3ae]">
                <Icon name="check" className="!h-7 !w-7 sm:!h-8 sm:!w-8 text-[#734738]" />
              </div>
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[.2em] text-[#9b6255]">Order Confirmed</p>
              <h1 className="mt-1 font-serif text-2xl xs:text-3xl sm:text-4xl text-[#432e26]">Your fresh bakes are on the way!</h1>
              <p className="mt-2 text-xs sm:text-sm text-[#79695c] max-w-md mx-auto">
                Thank you for ordering with Sri Laxmi Narasimha Bakery. Our ovens are ready to prepare your handcrafted treats.
              </p>
            </div>

            <div className="rounded-xl bg-[#faf6ef] border border-[#e8ded2] p-4 sm:p-6 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-[#e5d9cd] text-xs sm:text-sm">
                <div>
                  <span className="text-[#79695c] block text-[11px] sm:text-xs">Order Number</span>
                  <span className="font-serif text-lg sm:text-xl font-bold text-[#734738]">{confirmedOrder.orderNumber}</span>
                </div>
                <div>
                  <span className="text-[#79695c] block text-[11px] sm:text-xs">Order Status</span>
                  <span className="inline-block mt-0.5 rounded-full bg-[#f4ded5] px-2.5 py-0.5 text-xs font-semibold text-[#81552d] capitalize">
                    {confirmedOrder.status}
                  </span>
                </div>
                <div>
                  <span className="text-[#79695c] block text-[11px] sm:text-xs">Scheduled Delivery</span>
                  <span className="font-medium text-[#432e26]">{confirmedOrder.deliveryDate} ({confirmedOrder.deliveryTimeSlot})</span>
                </div>
                <div>
                  <span className="text-[#79695c] block text-[11px] sm:text-xs">Payment Method</span>
                  <span className="font-medium text-[#432e26]">{confirmedOrder.paymentMethod}</span>
                </div>
              </div>

              <div className="pt-4 text-xs sm:text-sm">
                <span className="text-[#79695c] block text-[11px] sm:text-xs">Delivering To</span>
                <span className="font-medium text-[#432e26]">{confirmedOrder.customerName}</span>
                <p className="text-[#79695c] mt-0.5">{confirmedOrder.deliveryAddress}</p>
                <p className="text-[#79695c] mt-0.5">{confirmedOrder.customerEmail}</p>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="font-serif text-base sm:text-lg font-semibold mb-3">Order Items</h2>
              <div className="space-y-2.5">
                {confirmedOrder.items.map(p => (
                  <div key={p.key} className="flex items-center gap-3 rounded-lg border border-[#eee5dc] p-2.5 sm:p-3">
                    <Photo src={p.image} alt={p.name} className="h-12 w-12 rounded object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">{p.qty} × {p.name}</p>
                      <p className="text-[11px] sm:text-xs text-[#79695c]">{p.weight} · {p.egg}{p.message && ` · “${p.message}”`}</p>
                    </div>
                    <span className="text-xs sm:text-sm font-semibold">{money(p.unitPrice * p.qty)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center border-t border-[#e8ded2] pt-4 mb-6">
              <span className="font-serif text-lg sm:text-xl font-bold">Total (Calculated by Bakery)</span>
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#734738]">{money(confirmedOrder.total)}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                className={`${button} justify-center`}
                onClick={() => {
                  if (signedIn) {
                    trackCustomerOrder(confirmedOrder.orderNumber);
                  } else {
                    let tokenToUse = confirmedOrder.guestAccessToken;
                    if (!tokenToUse) {
                      try {
                        const raw = localStorage.getItem('slnb_guest_orders');
                        if (raw) {
                          const parsed = JSON.parse(raw);
                          const match = Array.isArray(parsed) ? parsed.find((o: { order_number: string; guest_access_token: string }) => o.order_number === confirmedOrder.orderNumber) : null;
                          if (match) tokenToUse = match.guest_access_token;
                        }
                      } catch {
                        // fallback
                      }
                    }
                    if (tokenToUse) {
                      setGuestTrackNumber(confirmedOrder.orderNumber);
                      setGuestTrackToken(tokenToUse);
                      go('/track-order');
                      handleTrackGuestOrder(confirmedOrder.orderNumber, tokenToUse);
                    } else {
                      go('/track-order');
                    }
                  }
                }}
              >
                Track this order →
              </button>
              <button
                className="min-h-11 rounded-md border border-[#b9a08e] px-5 text-xs sm:text-sm font-medium text-[#734738] hover:bg-[#faf6ef] transition justify-center"
                onClick={() => {
                  try {
                    sessionStorage.removeItem('slnb_latest_confirmed_order_v1');
                  } catch {
                    // ignore
                  }
                  setConfirmedOrder(null);
                  shop();
                }}
              >
                Order more sweet treats
              </button>
              {signedIn ? (
                <button
                  className="min-h-11 rounded-md border border-[#b9a08e] px-5 text-xs sm:text-sm font-medium text-[#734738] hover:bg-[#faf6ef] transition justify-center"
                  onClick={() => go('/account/orders')}
                >
                  View My Orders
                </button>
              ) : (
                <button
                  className="min-h-11 rounded-md border border-[#b9a08e] px-5 text-xs sm:text-sm font-medium text-[#734738] hover:bg-[#faf6ef] transition justify-center"
                  onClick={() => go('/track-order')}
                >
                  View Saved Orders ({savedGuestOrders.length || 1})
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#d6c4b5] bg-[#fffdf9] p-8 sm:p-12 text-center">
            <Icon name="bag" className="mx-auto mb-4 !h-10 !w-10 sm:!h-12 sm:!w-12 text-[#8b6244]" />
            <h2 className="font-serif text-2xl sm:text-3xl">No recent order to display</h2>
            <p className="my-3 sm:my-4 text-xs sm:text-sm text-[#79695c]">
              Check your bag or explore our catalogue to place an order.
            </p>
            <button className={button} onClick={() => shop()}>
              Explore our bakes
            </button>
          </div>
        )}
      </main>
    )}

    {isAccount && <main className="mx-auto max-w-[1240px] px-3 sm:px-6 py-6 sm:py-12">{heading('Your little corner', isRecoveryMode || authMode === 'Set New Password' ? 'Set your new password' : signedIn ? (profile.name.trim() ? `Hello, ${profile.name.trim().split(' ')[0]}.` : 'Welcome back.') : 'Welcome to the sweet side.', isRecoveryMode || authMode === 'Set New Password' ? 'Choose a strong password to protect your sweet account.' : 'Your orders, your favourites, and all the happy moments in between.')}
      {isRecoveryMode || authMode === 'Set New Password' ? (
        <div className="mx-auto max-w-md rounded-xl border border-[#e7ddd2] bg-white p-5 sm:p-7">
          <div className="mb-5 sm:mb-6">
            <h2 className="font-serif text-xl sm:text-2xl text-[#432e26]">Set New Password</h2>
            <p className="mt-1 text-xs text-[#79695c]">Enter a secure new password for your account.</p>
          </div>

          {authError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-900 leading-relaxed" role="alert">
              {authError}
            </div>
          )}

          {authNotice && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs sm:text-sm text-amber-900 leading-relaxed" role="status">
              {authNotice}
            </div>
          )}

          <form className="grid gap-4 sm:gap-5" onSubmit={handleAuthSubmit}>
            <Field label="New password">
              <input required minLength={6} type="password" name="password" className={field} autoComplete="new-password" placeholder="At least 6 characters" disabled={isAuthSubmitting} />
            </Field>
            <Field label="Confirm new password">
              <input required minLength={6} type="password" name="confirmPassword" className={field} autoComplete="new-password" placeholder="Re-enter your new password" disabled={isAuthSubmitting} />
            </Field>
            <button disabled={isAuthSubmitting} className={`${button} justify-center min-h-11 disabled:opacity-50 disabled:cursor-not-allowed`}>
              {isAuthSubmitting ? 'Updating password...' : 'Update password & continue'}
            </button>
            <button
              type="button"
              disabled={isAuthSubmitting}
              onClick={() => {
                setIsRecoveryMode(false);
                setAuthMode('Login');
                setAuthError('');
                setAuthNotice('');
                if (window.history && window.history.replaceState) {
                  window.history.replaceState(null, '', window.location.pathname + '#/account');
                }
              }}
              className="text-xs text-[#734738] underline text-center"
            >
              Cancel and return to login
            </button>
          </form>
        </div>
      ) : !signedIn ? <div className="mx-auto max-w-md rounded-xl border border-[#e7ddd2] bg-white p-5 sm:p-7">
        <div className="mb-5 rounded-xl border border-[#ddcebd] bg-[#faf6ef] p-3.5 text-xs text-[#734738] flex items-center justify-between gap-3">
          <div>
            <span className="font-semibold block text-sm text-[#432e26]">Placed an order as a guest?</span>
            <span className="text-[#79695c]">Track and manage orders saved on this device without signing in.</span>
          </div>
          <a
            href="#/track-order"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#734738] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#513023] transition"
          >
            <Icon name="truck" className="!h-3.5 !w-3.5" />
            <span>Track Orders →</span>
          </a>
        </div>
        <div className="mb-5 sm:mb-6 grid grid-cols-3 gap-1 sm:flex sm:gap-5" role="tablist" aria-label="Account access">
          {['Login', 'Registration', 'Forgot Password'].map(m => (
            <button
              type="button"
              role="tab"
              aria-selected={authMode === m}
              key={m}
              onClick={() => {
                setAuthMode(m);
                setAuthError('');
                setAuthNotice('');
              }}
              className={`min-h-11 text-xs sm:text-sm text-center ${authMode === m ? 'border-b-2 border-[#734738] font-semibold text-[#734738]' : 'text-[#76685d]'}`}
            >
              {m}
            </button>
          ))}
        </div>

        {authError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-900 leading-relaxed" role="alert">
            {authError}
          </div>
        )}

        {authNotice && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs sm:text-sm text-amber-900 leading-relaxed" role="status">
            {authNotice}
          </div>
        )}

        <form className="grid gap-4 sm:gap-5" onSubmit={handleAuthSubmit}>
          {authMode === 'Registration' && (
            <>
              <Field label="Your name">
                <input required name="name" className={field} autoComplete="name" placeholder="Full name" disabled={isAuthSubmitting} />
              </Field>
              <Field label="Mobile number (optional)">
                <input name="phone" type="tel" pattern="[+0-9 \(\)\-]{10,16}" className={field} autoComplete="tel" placeholder="e.g. +91 98765 43210" disabled={isAuthSubmitting} />
              </Field>
            </>
          )}
          <Field label="Email">
            <input required name="email" type="email" className={field} autoComplete="email" placeholder="name@example.com" disabled={isAuthSubmitting} />
          </Field>
          {authMode !== 'Forgot Password' && (
            <Field label="Password">
              <input required minLength={6} name="password" type="password" className={field} autoComplete={authMode === 'Registration' ? 'new-password' : 'current-password'} placeholder="••••••••" disabled={isAuthSubmitting} />
            </Field>
          )}
          <button disabled={isAuthSubmitting} className={`${button} justify-center min-h-11 disabled:opacity-50 disabled:cursor-not-allowed`}>
            {isAuthSubmitting ? 'Processing...' : authMode === 'Forgot Password' ? 'Send reset link' : authMode === 'Login' ? 'Sign in to your sweet space' : 'Create account'}
          </button>
          <p className="text-[11px] sm:text-xs leading-5 text-[#79695c]">
            {authMode === 'Forgot Password'
              ? 'Enter your registered email to request password recovery.'
              : 'Secured by Sri Laxmi Narasimha Bakery authentication.'}
          </p>
        </form>
        <div className="mt-5 border-t border-[#eee6dd] pt-4 space-y-2 text-center">
          <p className="text-xs text-[#79695c]">
            Placed an order as a guest?{' '}
            <a href="#/track-order" className="font-semibold text-[#734738] hover:underline">
              Track with your access token →
            </a>
          </p>
          <p className="text-xs text-[#79695c]">
            Staff or Administrator?{' '}
            <a href="#/admin" className="font-semibold text-[#734738] hover:underline">
              Sign in to bakery workspace →
            </a>
          </p>
        </div>
      </div> : <div className="grid gap-6 md:grid-cols-[210px_1fr]"><nav aria-label="Account navigation" className="flex overflow-x-auto pb-2 gap-1.5 self-start rounded-xl border border-[#e7ddd2] p-2 sm:p-3 md:flex-col md:overflow-visible scrollbar-none">{[['My Dashboard', '/account'], ['My Profile', '/account/profile'], ['My Orders', '/account/orders'], ['Saved Addresses', '/account/addresses']].map(([label, url]) => <a href={`#${url}`} key={url} className={`flex min-h-10 sm:min-h-11 shrink-0 whitespace-nowrap items-center rounded-md px-3 sm:px-4 text-xs sm:text-sm ${path === url ? 'bg-[#f0e3d6] font-medium' : 'hover:bg-stone-50'}`}>{label}</a>)}<button className="min-h-10 sm:min-h-11 shrink-0 whitespace-nowrap px-3 sm:px-4 text-left text-xs sm:text-sm text-[#974c40] hover:bg-red-50 rounded-md" onClick={async () => { await handleUserSignOut('Signed out successfully.', '/account'); }}>Sign out</button></nav><div className="min-w-0">{path === '/account/profile' ? (
            <div className="max-w-xl">
              {profileLoading ? (
                <div className="rounded-xl border border-[#e7ddd2] bg-white p-8 sm:p-12 text-center shadow-xs">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#734738] border-t-transparent mb-3" />
                  <p className="text-xs sm:text-sm text-[#79695c]">Fetching your profile from bakery service...</p>
                </div>
              ) : (
                <form
                  key={`${authUser?.id || 'customer'}-${profile.name}-${profile.phone}`}
                  className="grid gap-4 sm:gap-5 rounded-xl border border-[#e7ddd2] p-4 sm:p-6 bg-white shadow-xs"
                  onSubmit={handleProfileSubmit}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[#f1e9df] pb-3">
                    <div>
                      <h2 className="font-serif text-xl sm:text-2xl text-[#432e26]">A little about you</h2>
                      <p className="text-xs text-[#79695c] mt-0.5">Your personal bakery profile details</p>
                    </div>
                    {profileFetchError && (
                      <button
                        type="button"
                        onClick={() => loadCustomerProfile()}
                        className="text-xs text-[#734738] underline hover:text-[#523326]"
                      >
                        Retry load
                      </button>
                    )}
                  </div>

                  {profileFetchError && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs sm:text-sm text-amber-900 leading-relaxed font-medium" role="status">
                      Notice: Could not load the latest profile from server ({profileFetchError}). Displaying session details.
                    </div>
                  )}

                  {profileSaveError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-900 leading-relaxed font-medium" role="alert">
                      <p className="font-semibold mb-0.5">Could not update profile:</p>
                      <p>{profileSaveError}</p>
                    </div>
                  )}

                  <Field label="Full name">
                    <input
                      name="name"
                      required
                      className={field}
                      defaultValue={profile.name}
                      placeholder="Full name"
                      disabled={isSavingProfile}
                    />
                  </Field>
                  <Field label="Email address (cannot be modified directly)">
                    <input
                      name="email"
                      type="email"
                      disabled
                      className={`${field} bg-[#faf6ef] text-[#79695c] cursor-not-allowed border-[#e5dcd1]`}
                      value={authUser?.email || profile.email}
                      title="Email address is tied to your account login and cannot be modified directly"
                    />
                  </Field>
                  <Field label="Phone number (optional)">
                    <input
                      name="phone"
                      type="tel"
                      pattern="[+0-9 \(\)\-]{10,16}"
                      className={field}
                      defaultValue={profile.phone}
                      placeholder="e.g. +91 98765 43210"
                      disabled={isSavingProfile}
                    />
                  </Field>

                  <div className="pt-2">
                    <button
                      disabled={isSavingProfile}
                      className={`${button} justify-center w-full xs:w-auto min-h-11 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isSavingProfile ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                          Saving changes...
                        </span>
                      ) : (
                        'Save details'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : path === '/account/addresses' ? (
            <div className="space-y-6">
              {/* Header with Title and Action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#f1e9df] pb-4">
                <div>
                  <h2 className="font-serif text-xl sm:text-2xl text-[#432e26]">Your Saved Addresses</h2>
                  <p className="text-xs text-[#79695c] mt-0.5">Manage delivery locations for quick, effortless bakery orders</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => loadCustomerAddresses()}
                    disabled={addressesLoading}
                    className="flex items-center gap-1.5 rounded-md border border-[#ddcebd] bg-white px-3 py-2 text-xs font-medium text-[#734738] hover:bg-[#faf6ef] disabled:opacity-60 transition shadow-xs cursor-pointer"
                    title="Refresh address list"
                  >
                    <Icon name="refresh" className={`!h-3.5 !w-3.5 ${addressesLoading ? 'animate-spin' : ''}`} />
                    {addressesLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAddress(null);
                      setAddressFormFields({
                        street_address: '',
                        landmark: '',
                        city: 'Bejjanki',
                        state: 'Telangana',
                        postal_code: '505528',
                      });
                      manuallyEditedFieldsRef.current.clear();
                      setAddressFormError('');
                      setIsAddressModalOpen(true);
                    }}
                    className={`${button} !px-4 !py-2 text-xs sm:text-sm font-medium shadow-xs`}
                  >
                    + Add New Address
                  </button>
                </div>
              </div>

              {/* Error banner */}
              {addressesFetchError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-red-800" role="alert">
                  <p className="font-medium text-xs sm:text-sm mb-2">{addressesFetchError}</p>
                  <button className={`${button} text-xs py-1.5 px-3`} onClick={() => loadCustomerAddresses()}>
                    Retry loading addresses
                  </button>
                </div>
              )}

              {/* Loading, Empty, or Populated state */}
              {addressesLoading && customerAddresses.length === 0 ? (
                <div className="rounded-xl border border-[#e7ddd2] bg-white p-8 sm:p-12 text-center shadow-xs">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#734738] border-t-transparent mb-3" />
                  <p className="text-xs sm:text-sm text-[#79695c]">Fetching your saved delivery addresses from bakery service...</p>
                </div>
              ) : customerAddresses.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-[#ddcebd] bg-[#faf6ef]/70 p-8 sm:p-12 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#f0e3d6] text-[#734738]">
                    <Icon name="pin" className="!h-7 !w-7" />
                  </div>
                  <h3 className="font-serif text-xl sm:text-2xl text-[#432e26]">No saved delivery addresses yet</h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#79695c] max-w-md mx-auto">
                    Add your home, office, or celebration venue so we can bring fresh cakes, warm puffs, and artisan bakes right to your doorstep.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAddress(null);
                      setAddressFormFields({
                        street_address: '',
                        landmark: '',
                        city: 'Bejjanki',
                        state: 'Telangana',
                        postal_code: '505528',
                      });
                      manuallyEditedFieldsRef.current.clear();
                      setAddressFormError('');
                      setIsAddressModalOpen(true);
                    }}
                    className={`${button} mt-5 text-xs sm:text-sm`}
                  >
                    + Add Your First Address
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customerAddresses.map(addr => (
                    <div
                      key={addr.id}
                      className={`relative flex flex-col justify-between rounded-xl border p-4 sm:p-5 bg-white transition shadow-xs ${
                        addr.is_default
                          ? 'border-[#734738] ring-1 ring-[#734738]/20 bg-linear-to-b from-[#faf6ef]/40 to-white'
                          : 'border-[#e7ddd2] hover:border-[#bda38f]'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
                                addr.label?.toLowerCase() === 'work'
                                  ? 'bg-stone-100 text-stone-700 border border-stone-200'
                                  : addr.label?.toLowerCase() === 'other'
                                  ? 'bg-[#f0e8e0] text-[#705244] border border-[#e4d6ca]'
                                  : 'bg-[#f8ede2] text-[#844c38] border border-[#ebd2c3]'
                              }`}
                            >
                              {addr.label || 'Home'}
                            </span>
                            {addr.is_default && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#edf0e5] text-[#3d502d] border border-[#d2dcb9]">
                                <Icon name="check" className="!h-3 !w-3 text-[#3d502d]" />
                                Default Delivery Address
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="font-semibold text-base text-[#432e26]">{addr.recipient_name}</p>
                        <p className="text-xs text-[#79695c] mt-0.5 flex items-center gap-1.5">
                          <span>{addr.phone}</span>
                        </p>

                        <p className="text-xs sm:text-sm text-[#432e26] mt-2 leading-relaxed">
                          {addr.street_address}
                        </p>
                        {addr.landmark && (
                          <p className="text-xs text-[#8c7768] mt-0.5 italic">
                            Landmark: {addr.landmark}
                          </p>
                        )}
                        <p className="text-xs font-medium text-[#79695c] mt-1">
                          {addr.city}, {addr.state} - {addr.postal_code}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#f1e9df] flex items-center justify-between gap-2 text-xs">
                        <div>
                          {!addr.is_default && (
                            <button
                              type="button"
                              disabled={addressActionLoadingId === addr.id}
                              onClick={() => handleSetDefaultAddress(addr)}
                              className="text-[#734738] hover:text-[#513023] font-medium hover:underline disabled:opacity-50 cursor-pointer"
                            >
                              {addressActionLoadingId === addr.id ? 'Setting default...' : 'Set as default'}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={addressActionLoadingId === addr.id}
                            onClick={() => {
                              setEditingAddress(addr);
                              setAddressFormFields({
                                street_address: addr.street_address || '',
                                landmark: addr.landmark || '',
                                city: addr.city || 'Bejjanki',
                                state: addr.state || 'Telangana',
                                postal_code: addr.postal_code || '505528',
                              });
                              manuallyEditedFieldsRef.current.clear();
                              setAddressFormError('');
                              setIsAddressModalOpen(true);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#ddcebd] bg-white text-[#734738] hover:bg-[#faf6ef] disabled:opacity-50 transition cursor-pointer"
                          >
                            <Icon name="edit" className="!h-3.5 !w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={addressActionLoadingId === addr.id}
                            onClick={() => setDeletingAddressId(addr.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-200 bg-white text-[#974c40] hover:bg-red-50 disabled:opacity-50 transition cursor-pointer"
                          >
                            <Icon name="trash" className="!h-3.5 !w-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add / Edit Address Modal */}
              {isAddressModalOpen && (
                <Modal
                  title={editingAddress ? 'Edit Delivery Address' : 'Add New Delivery Address'}
                  close={() => {
                    setIsAddressModalOpen(false);
                    setEditingAddress(null);
                    setAddressFormError('');
                  }}
                >
                  <form
                    onSubmit={handleSaveAddress}
                    className="grid gap-4"
                  >
                    {addressFormError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-900 leading-relaxed font-medium" role="alert">
                        <p className="font-semibold mb-0.5">Please check your details:</p>
                        <p>{addressFormError}</p>
                      </div>
                    )}

                    <Field label="Address Label">
                      <div className="flex items-center gap-2">
                        {['Home', 'Work', 'Other'].map(l => (
                          <label
                            key={l}
                            className="flex-1 flex min-h-11 items-center justify-center rounded-md border border-[#ded3c9] bg-white text-xs sm:text-sm font-medium cursor-pointer transition has-checked:border-[#734738] has-checked:bg-[#f0e3d6] has-checked:text-[#432e26] has-checked:font-semibold hover:bg-stone-50"
                          >
                            <input
                              type="radio"
                              name="label"
                              value={l}
                              defaultChecked={editingAddress ? (editingAddress.label || 'Home') === l : l === 'Home'}
                              className="sr-only"
                            />
                            {l}
                          </label>
                        ))}
                      </div>
                    </Field>

                    {/* Phase 5.5.6: Interactive Map Pin & Live Geolocation */}
                    <AddressMapPicker
                      initialStreetAddress={editingAddress?.street_address}
                      onLocationResolved={(resolved: ReverseGeocodeResult) => {
                        setAddressFormFields(prev => {
                          const next = { ...prev };
                          // Only update fields the customer has not manually typed during this session
                          if (!manuallyEditedFieldsRef.current.has('street_address') && resolved.streetAddress) {
                            next.street_address = resolved.streetAddress;
                          }
                          if (!manuallyEditedFieldsRef.current.has('landmark') && resolved.landmark) {
                            next.landmark = resolved.landmark;
                          }
                          if (!manuallyEditedFieldsRef.current.has('city') && resolved.city) {
                            next.city = resolved.city;
                          }
                          if (!manuallyEditedFieldsRef.current.has('state') && resolved.state) {
                            next.state = resolved.state;
                          }
                          if (!manuallyEditedFieldsRef.current.has('postal_code') && resolved.postalCode) {
                            next.postal_code = resolved.postalCode;
                          }
                          return next;
                        });
                      }}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <Field label="Recipient Name">
                        <input
                          name="recipient_name"
                          required
                          defaultValue={editingAddress?.recipient_name || profile.name || ''}
                          placeholder="Full name of recipient"
                          className={field}
                          disabled={isSubmittingAddress}
                        />
                      </Field>
                      <Field label="Phone Number">
                        <input
                          name="phone"
                          type="tel"
                          required
                          pattern="[+0-9 \(\)\-]{10,16}"
                          defaultValue={editingAddress?.phone || profile.phone || ''}
                          placeholder="e.g. +91 98765 43210"
                          className={field}
                          disabled={isSubmittingAddress}
                        />
                      </Field>
                    </div>

                    <Field label="Street Address">
                      <textarea
                        name="street_address"
                        required
                        rows={2}
                        value={addressFormFields.street_address}
                        onChange={e => {
                          manuallyEditedFieldsRef.current.add('street_address');
                          setAddressFormFields(prev => ({ ...prev, street_address: e.target.value }));
                        }}
                        placeholder="House/flat number, building name, street, locality"
                        className={field}
                        disabled={isSubmittingAddress}
                      />
                    </Field>

                    <Field label="Landmark (Optional — clear to remove)">
                      <input
                        name="landmark"
                        value={addressFormFields.landmark}
                        onChange={e => {
                          manuallyEditedFieldsRef.current.add('landmark');
                          setAddressFormFields(prev => ({ ...prev, landmark: e.target.value }));
                        }}
                        placeholder="e.g. Near Venkateshwara Temple, Opp. Water Tank"
                        className={field}
                        disabled={isSubmittingAddress}
                      />
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="City">
                        <input
                          name="city"
                          required
                          value={addressFormFields.city}
                          onChange={e => {
                            manuallyEditedFieldsRef.current.add('city');
                            setAddressFormFields(prev => ({ ...prev, city: e.target.value }));
                          }}
                          className={field}
                          disabled={isSubmittingAddress}
                        />
                      </Field>
                      <Field label="State">
                        <input
                          name="state"
                          required
                          value={addressFormFields.state}
                          onChange={e => {
                            manuallyEditedFieldsRef.current.add('state');
                            setAddressFormFields(prev => ({ ...prev, state: e.target.value }));
                          }}
                          className={field}
                          disabled={isSubmittingAddress}
                        />
                      </Field>
                      <Field label="PIN Code">
                        <input
                          name="postal_code"
                          required
                          value={addressFormFields.postal_code}
                          onChange={e => {
                            manuallyEditedFieldsRef.current.add('postal_code');
                            setAddressFormFields(prev => ({ ...prev, postal_code: e.target.value }));
                          }}
                          className={field}
                          disabled={isSubmittingAddress}
                        />
                      </Field>
                    </div>

                    <div className="pt-1">
                      <label className="flex items-center gap-2.5 text-xs sm:text-sm text-[#432e26] cursor-pointer">
                        <input
                          type="checkbox"
                          name="is_default"
                          defaultChecked={editingAddress ? editingAddress.is_default : customerAddresses.length === 0}
                          disabled={isSubmittingAddress || (editingAddress?.is_default && customerAddresses.length === 1)}
                          className="h-4 w-4 rounded border-[#ded3c9] text-[#734738] focus:ring-[#ba7770] accent-[#734738]"
                        />
                        <span>Set as default delivery address</span>
                      </label>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-[#f1e9df]">
                      <button
                        type="button"
                        disabled={isSubmittingAddress}
                        onClick={() => {
                          setIsAddressModalOpen(false);
                          setEditingAddress(null);
                          setAddressFormError('');
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm text-[#79695c] hover:bg-stone-100 rounded-md transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingAddress}
                        className={`${button} w-full sm:w-auto justify-center min-h-11 disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isSubmittingAddress ? (
                          <span className="flex items-center gap-2">
                            <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                            Saving address...
                          </span>
                        ) : editingAddress ? (
                          'Update Address'
                        ) : (
                          'Save Address'
                        )}
                      </button>
                    </div>
                  </form>
                </Modal>
              )}

              {/* Delete Confirmation Modal */}
              {deletingAddressId && (() => {
                const target = customerAddresses.find(a => a.id === deletingAddressId);
                if (!target) return null;
                return (
                  <Modal
                    title="Delete Delivery Address"
                    close={() => setDeletingAddressId(null)}
                  >
                    <div className="space-y-4">
                      <p className="text-sm text-[#79695c]">
                        Are you sure you want to delete this saved delivery address for{' '}
                        <span className="font-semibold text-[#432e26]">{target.recipient_name}</span> (
                        <span className="font-medium text-[#734738]">{target.label || 'Home'}</span>)?
                      </p>
                      <div className="rounded-lg border border-[#e7ddd2] bg-[#faf6ef] p-3 text-xs text-[#523e35]">
                        <p className="font-medium">{target.street_address}</p>
                        {target.landmark && <p className="italic mt-0.5">Landmark: {target.landmark}</p>}
                        <p className="mt-0.5">{target.city}, {target.state} - {target.postal_code}</p>
                      </div>
                      {target.is_default && customerAddresses.length > 1 && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                          Notice: This is your default delivery address. Deleting it will automatically promote your newest remaining address as the new default.
                        </p>
                      )}
                      <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-[#f1e9df]">
                        <button
                          type="button"
                          onClick={() => setDeletingAddressId(null)}
                          className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm text-[#79695c] hover:bg-stone-100 rounded-md transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={addressActionLoadingId === target.id}
                          onClick={() => handleDeleteAddress(target.id)}
                          className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-medium bg-[#974c40] text-white hover:bg-[#7e3d33] rounded-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                        >
                          {addressActionLoadingId === target.id ? (
                            <>
                              <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                              Deleting...
                            </>
                          ) : (
                            'Delete Address'
                          )}
                        </button>
                      </div>
                    </div>
                  </Modal>
                );
              })()}
            </div>
          ) : <>{path === '/account' && <div className="mb-6 sm:mb-7 grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4"><div className="rounded-xl bg-[#f5e8dc] p-4 sm:p-6"><p className="text-xs sm:text-sm text-[#6c5545]">Sweet memories made</p><p className="mt-2 font-serif text-3xl sm:text-4xl">{realOrders.length}</p></div><div className="rounded-xl bg-[#edf0e5] p-4 sm:p-6"><p className="text-xs sm:text-sm text-[#5c6850]">On the way to happiness</p><p className="mt-2 font-serif text-3xl sm:text-4xl">{realOrders.filter(o => o.status >= 0 && o.status < 5).length}</p></div></div>}<div className="mb-4 sm:mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl sm:text-2xl">{path.endsWith('orders') ? 'Your orders' : 'Recent sweet moments'}</h2><button type="button" onClick={() => loadCustomerOrders()} disabled={customerOrdersLoading} className="flex items-center gap-2 rounded-md border border-[#ddcebd] bg-white px-3.5 py-1.5 text-xs font-medium text-[#734738] hover:bg-[#faf6ef] disabled:opacity-60 transition shadow-xs"><Icon name="refresh" className={`!h-3.5 !w-3.5 ${customerOrdersLoading ? 'animate-spin' : ''}`} />{customerOrdersLoading ? 'Refreshing...' : 'Refresh orders'}</button></div>{customerOrdersLoading ? <div className="rounded-xl border border-[#e7ddd2] bg-white p-8 sm:p-12 text-center"><div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#734738] border-t-transparent mb-3" /><p className="text-xs sm:text-sm text-[#79695c]">Fetching your orders from the bakery...</p></div> : customerOrdersError ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800"><p className="font-medium text-xs sm:text-sm mb-3">{customerOrdersError}</p><button className={`${button} text-xs py-2`} onClick={() => loadCustomerOrders()}>Retry</button></div> : orderList(realOrders)}</>}</div></div>}</main>}

    {isAdmin && (
      authLoading ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d6c3ae] bg-[#faf6ef] shadow-sm animate-pulse mb-5">
            <Icon name="cake" className="!h-8 !w-8 text-[#8b6244]" />
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl text-[#432e26]">Verifying administrative privileges...</h2>
          <p className="mt-2 text-xs sm:text-sm text-[#79695c] max-w-sm">
            Checking credentials and access permissions with Sri Laxmi Narasimha Bakery security service.
          </p>
        </div>
      ) : !authUser ? (
        <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
          <div className="rounded-2xl border border-[#e7ddd2] bg-white p-6 sm:p-8 shadow-sm">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#faf6ef] border border-[#d6c3ae]">
                <Icon name="user" className="!h-6 !w-6 text-[#8b6244]" />
              </div>
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[.2em] text-[#9b6255]">Restricted Area</p>
              <h1 className="mt-1 font-serif text-2xl sm:text-3xl text-[#432e26]">Bakery Management</h1>
              <p className="mt-2 text-xs sm:text-sm text-[#79695c]">
                Please sign in with your staff or administrator account to access the bakery management workspace.
              </p>
              {adminRedirectPath && adminRedirectPath !== '/admin' && (
                <div className="mt-3 rounded-md bg-[#faf6ef] border border-[#e8ded2] px-3 py-1.5 text-xs text-[#734738]">
                  Requested destination: <code className="font-semibold">{adminRedirectPath}</code>
                </div>
              )}
            </div>

            {authError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-900 leading-relaxed" role="alert">
                {authError}
              </div>
            )}

            {authNotice && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs sm:text-sm text-amber-900 leading-relaxed" role="status">
                {authNotice}
              </div>
            )}

            <form className="grid gap-4" onSubmit={handleAdminLoginSubmit}>
              <Field label="Staff / Admin email">
                <input required name="email" type="email" className={field} autoComplete="email" placeholder="staff@example.com" disabled={isAuthSubmitting} />
              </Field>
              <Field label="Password">
                <input required minLength={6} type="password" name="password" className={field} autoComplete="current-password" placeholder="••••••••" disabled={isAuthSubmitting} />
              </Field>
              <button disabled={isAuthSubmitting} className={`${button} justify-center min-h-11 mt-1 disabled:opacity-50 disabled:cursor-not-allowed`}>
                {isAuthSubmitting ? 'Verifying credentials...' : 'Sign in to Bakery Workspace'}
              </button>
            </form>

            <div className="mt-6 border-t border-[#f0e6dc] pt-4 text-center">
              <a href="#/" className="text-xs text-[#734738] underline">
                ← Return to customer store
              </a>
            </div>
          </div>
        </div>
      ) : !isStaffOrAdmin ? (
        <div className="mx-auto max-w-lg px-4 py-12 sm:py-16">
          <div className="rounded-2xl border border-amber-200 bg-white p-6 sm:p-8 shadow-sm">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
                <Icon name="grid" className="!h-7 !w-7 text-amber-700" />
              </div>
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[.2em] text-amber-800">Security Notice</p>
              <h1 className="mt-1 font-serif text-2xl sm:text-3xl text-[#432e26]">Access Restricted</h1>
              <p className="mt-2 text-xs sm:text-sm text-[#79695c]">
                Administrator or staff privileges required to access the bakery management workspace.
              </p>
            </div>

            <div className="my-6 rounded-xl border border-[#ede3d7] bg-[#faf6ef] p-4 text-xs sm:text-sm text-[#6c574b] space-y-2">
              <div className="flex justify-between">
                <span className="font-medium text-[#432e26]">Signed in as:</span>
                <span className="font-mono text-xs">{authUser?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-[#432e26]">Assigned role(s):</span>
                <span className="font-semibold text-amber-800">{userRoles.length > 0 ? userRoles.join(', ') : 'None (customer)'}</span>
              </div>
              <p className="pt-2 text-[11px] leading-relaxed text-[#79695c] border-t border-[#e8ded2]">
                Your account is currently registered as a customer and does not possess administrator or staff privileges in the Sri Laxmi Narasimha Bakery database.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button onClick={() => go('/')} className={`${button} justify-center w-full min-h-11`}>
                Return to Customer Store
              </button>
              <button
                onClick={async () => {
                  await handleUserSignOut('Signed out. Please sign in with staff or administrator credentials.');
                  setAuthMode('Login');
                }}
                className="min-h-11 rounded-md border border-[#b9a08e] px-4 text-xs sm:text-sm font-medium text-[#734738] hover:bg-[#faf6ef] text-center"
              >
                Sign in with a different account
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-[1600px] flex-col lg:min-h-[80vh] lg:flex-row">
          <aside className="shrink-0 border-b border-[#e4d9ce] bg-[#faf6ef] p-3 sm:p-4 lg:w-60 lg:border-b-0 lg:border-r lg:p-6">
            <div className="mb-4 hidden lg:block px-3">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#8b705c]">Bakery Workspace</p>
              <p className="mt-1 text-xs font-medium text-[#432e26] truncate">{authUser?.email}</p>
              <span className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${isAdminUser ? 'bg-[#f0dfd1] text-[#734738]' : 'bg-[#e7eede] text-[#4a633a]'}`}>
                {isAdminUser ? 'Administrator' : 'Bakery Staff'}
              </span>
            </div>
            <nav aria-label="Admin navigation" className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible scrollbar-none">
              {adminTabs.map((tab, i) => {
                const url = `/admin${i ? '/' + tab.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-') : ''}`;
                return (
                  <a key={tab} href={`#${url}`} className={`flex min-h-10 sm:min-h-11 shrink-0 whitespace-nowrap items-center gap-2.5 rounded-md px-3 text-xs sm:text-sm ${path === url ? 'bg-[#754936] text-white font-medium' : 'hover:bg-[#eee2d7]'}`}>
                    <Icon name={['grid', 'bag', 'cake', 'menu', 'user', 'heart', 'grid', 'edit'][i]} className="!h-4 !w-4 shrink-0" />
                    {tab}
                    {tab === 'Orders' && pending.length > 0 && <span className="ml-1.5 rounded-full bg-[#e8d2bd] px-2 text-[10px] sm:text-xs text-[#4f3525] font-semibold">{pending.length}</span>}
                  </a>
                );
              })}
            </nav>
            <div className="mt-6 pt-4 border-t border-[#e8ded2] hidden lg:block px-3">
              <button onClick={async () => { await handleUserSignOut('Signed out of bakery workspace.', '/'); }} className="text-xs text-[#974c40] hover:underline flex items-center gap-1.5">
                Sign out →
              </button>
            </div>
            <p className="mt-10 hidden text-xs leading-5 text-[#79695c] lg:block">Made for good things.<br />All changes stay in this browser.</p>
          </aside>
          <main className="min-w-0 flex-1 px-3 py-6 sm:px-6 sm:py-8 lg:p-10">
            {newCount > 0 && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#ddc8a6] bg-[#fcf2dc] p-3 sm:p-4"><span className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm"><Icon name="bell" className="shrink-0" />{newCount} new {newCount === 1 ? 'order needs' : 'orders need'} a little love.</span><button className="min-h-10 text-xs sm:text-sm font-semibold underline" onClick={() => { setSeen(Date.now()); go('/admin/orders'); }}>Review incoming orders →</button></div>}
            {path === '/admin' && <>{heading('A fresh start', 'Good things are baking.', 'Here’s a little look at your bakery today.')}<div className="mb-6 sm:mb-8 grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">{[['Today’s revenue', money(adminOrders.filter(o => o.status !== -1 && new Date(o.createdAt).toDateString() === new Date().toDateString()).reduce((s, o) => s + o.total, 0))], ['Total orders', adminOrders.length], ['Pending orders', pending.length], ['Completed orders', adminOrders.filter(o => o.status === 5).length]].map(([label, n]) => <div key={label} className="rounded-xl border border-[#e6dace] bg-white p-4 sm:p-5"><p className="text-xs sm:text-sm text-[#79695c]">{label}</p><p className="mt-2 sm:mt-3 font-serif text-2xl sm:text-3xl">{n}</p></div>)}</div><div className="mb-6 sm:mb-8 grid gap-4 sm:gap-6 xl:grid-cols-[1.5fr_1fr]"><div className="rounded-xl border border-[#e6dace] p-4 sm:p-6 bg-white overflow-hidden"><h2 className="font-serif text-xl sm:text-2xl">A week of sweetness</h2><p className="mt-1 sm:mt-2 text-xs sm:text-sm text-[#79695c]">Order value over the last seven days</p><SalesChart orders={adminOrders} range="Weekly" /></div><div className="rounded-xl bg-[#f5ecdf] p-4 sm:p-6"><h2 className="font-serif text-xl sm:text-2xl">Customer love</h2><p className="my-2 sm:my-3 font-serif text-4xl sm:text-5xl">{new Set(adminOrders.map(o => o.email)).size}</p><p className="mb-5 sm:mb-6 text-xs sm:text-sm text-[#79695c]">Unique customers across all orders</p><h3 className="mb-3 sm:mb-4 text-sm font-medium">Bestselling bakes</h3>{products.map(p => ({ p, count: adminOrders.filter(o => o.status !== -1).flatMap(o => o.items).filter(i => i.id === p.id).reduce((s, i) => s + i.qty, 0) })).sort((a, b) => b.count - a.count).slice(0, 3).map(({ p, count }) => <div className="mb-3 flex items-center justify-between gap-3 text-xs sm:text-sm" key={p.id}><span className="truncate">{p.name}</span><span className="shrink-0 text-[#79695c]">{count} sold</span></div>)}</div></div><div className="mb-4 sm:mb-5 flex items-center justify-between"><h2 className="font-serif text-xl sm:text-2xl">Fresh from the order book</h2><a href="#/admin/orders" className="min-h-11 py-3 text-xs sm:text-sm underline">View all</a></div>{orderList(adminOrders.slice(0, 4), true)}</>}
            {path === '/admin/orders' && <>
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {heading('The heart of your bakery', 'Every order, a happy moment.', 'Accept new orders and keep your customers in the loop.')}
                <button
                  onClick={loadAdminOrders}
                  disabled={adminOrdersLoading}
                  className="self-start sm:self-center flex items-center gap-2 rounded-md border border-[#ddcebd] bg-white px-4 py-2.5 text-xs sm:text-sm font-medium text-[#734738] hover:bg-[#faf6ef] disabled:opacity-60 transition shadow-xs"
                >
                  <Icon name="refresh" className={`!h-4 !w-4 ${adminOrdersLoading ? 'animate-spin' : ''}`} />
                  {adminOrdersLoading ? 'Refreshing...' : 'Refresh orders'}
                </button>
              </div>

              {adminOrdersError && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="font-semibold">Error loading orders:</span>
                    <span>{adminOrdersError}</span>
                  </div>
                  <button
                    onClick={loadAdminOrders}
                    className="self-start sm:self-center min-h-9 px-4 py-1.5 rounded-md bg-[#734738] text-white font-medium hover:bg-[#5a362b] text-xs shrink-0"
                  >
                    Retry
                  </button>
                </div>
              )}

              <div className="mb-6 flex flex-col xs:flex-row flex-wrap items-stretch xs:items-center gap-3 sm:gap-4">
                <input
                  className={`${field} flex-1 sm:max-w-sm`}
                  placeholder="Search order ID, name or phone…"
                  aria-label="Search orders"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-pressed={sound}
                    onClick={async () => {
                      const next = !sound;
                      setSound(next);
                      if (next) {
                        const played = await playNotificationSound(soundType, soundVolume);
                        if (!played) {
                          notify('Notification sound enabled (click page to unlock audio).');
                          return;
                        }
                      }
                      notify(`Notification sound ${next ? 'enabled' : 'disabled'}`);
                    }}
                    className={`min-h-11 rounded-md border px-3 sm:px-4 text-xs sm:text-sm font-medium transition flex items-center gap-2 ${
                      sound
                        ? 'border-[#8b634b] bg-[#8b634b] text-white shadow-xs'
                        : 'border-[#ddcebd] bg-white text-[#734738] hover:bg-[#faf6ef]'
                    }`}
                    title={sound ? 'Notification sound enabled' : 'Notification sound muted'}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full ${sound ? 'bg-emerald-300' : 'bg-stone-300'}`} />
                    <span>Sound: {sound ? 'On' : 'Off'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestSound()}
                    className="min-h-11 rounded-md border border-[#ddcebd] bg-[#faf6ef] px-3 py-2 text-xs sm:text-sm font-medium text-[#734738] hover:bg-[#f2e7d8] transition flex items-center gap-1.5"
                    title={`Test ${NOTIFICATION_SOUNDS.find(s => s.id === soundType)?.name || 'selected sound'}`}
                  >
                    <Icon name="bell" className="!w-4 !h-4 text-[#8b6244]" />
                    <span className="hidden sm:inline">Test Sound</span>
                    <span className="sm:hidden">Test</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (desktopPermission === 'granted') {
                        const next = !desktopNotifications;
                        setDesktopNotifications(next);
                        notify(`Desktop notifications ${next ? 'enabled' : 'disabled'}`);
                      } else if (desktopPermission === 'default') {
                        requestDesktopNotificationPermission();
                      } else if (desktopPermission === 'denied') {
                        notify('Desktop notifications are blocked in your browser site settings.');
                      } else {
                        notify('Desktop notifications are not supported by this browser.');
                      }
                    }}
                    className={`min-h-11 rounded-md border px-3 py-2 text-xs sm:text-sm font-medium transition flex items-center gap-1.5 ${
                      desktopPermission === 'granted' && desktopNotifications
                        ? 'border-[#8b634b] bg-[#8b634b] text-white shadow-xs'
                        : desktopPermission === 'denied'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : 'border-[#ddcebd] bg-white text-[#734738] hover:bg-[#faf6ef]'
                    }`}
                    title={
                      desktopPermission === 'granted'
                        ? desktopNotifications
                          ? 'Desktop alerts active (click to mute)'
                          : 'Desktop alerts muted (click to enable)'
                        : desktopPermission === 'denied'
                        ? 'Desktop alerts blocked in browser site settings'
                        : 'Click to enable desktop browser alerts'
                    }
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        desktopPermission === 'granted' && desktopNotifications
                          ? 'bg-emerald-300'
                          : desktopPermission === 'denied'
                          ? 'bg-red-400'
                          : 'bg-stone-300'
                      }`}
                    />
                    <span>
                      Desktop: {desktopPermission === 'granted' ? (desktopNotifications ? 'On' : 'Off') : desktopPermission === 'denied' ? 'Blocked' : 'Enable'}
                    </span>
                  </button>
                </div>
                <select
                  aria-label="Filter order status"
                  className={`${field} sm:max-w-[200px] shrink-0`}
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  <option>All treats</option>
                  <option>Pending</option>
                  <option>In progress</option>
                  <option>Delivered</option>
                </select>
              </div>

              {adminOrdersLoading && adminOrders.length === 0 ? (
                <div className="rounded-xl border border-[#e6dace] bg-white p-12 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#8b6244] border-t-transparent mb-3" />
                  <p className="text-sm font-medium text-[#76685d]">Loading orders from Supabase...</p>
                </div>
              ) : (
                orderList(filteredAdminOrders, true)
              )}
            </>}
            {path === '/admin/products' && <><div className="flex flex-col xs:flex-row xs:items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">{heading('Your oven’s finest', 'The bake collection.', `${products.length} products, made to make someone’s day.`)}{isAdminUser ? <button className={`${button} w-full xs:w-auto shrink-0 justify-center`} onClick={() => { setIsNewProduct(true); setProductVariantTemplate('cake'); setEditProduct({ id: 0, name: '', description: '', price: 599, category: categoriesList[0] || categories[0], image: initialProducts[0].image, rating: 5.0, bestseller: false, available: true, tags: [] }); }}>+ Add a new bake</button> : <span className="text-xs text-[#79695c] italic bg-[#faf6ef] border border-[#e8ded2] rounded px-3 py-1.5">Catalog additions reserved for Admin</span>}</div><div className="space-y-3 md:hidden">{products.map(p => <div key={p.id} className="rounded-xl border border-[#e7ddd2] bg-white p-3.5"><div className="flex items-start gap-3"><Photo src={p.image} alt={p.name} className="h-16 w-16 rounded-md object-cover shrink-0" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-1"><h3 className="font-serif text-base font-medium truncate">{p.name}</h3><span className="text-sm font-semibold shrink-0">{money(p.price)}</span></div><p className="text-xs text-[#79695c] mt-0.5">{p.category}{p.bestseller && <span className="ml-2 text-[#97713b] font-medium">· Bestseller</span>}</p><div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f1e9de] pt-2"><button type="button" disabled={updatingProductAvailabilityId === p.id} onClick={() => handleToggleProductAvailability(p)} className={`min-h-10 rounded-full px-3 text-xs font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed ${p.available ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{updatingProductAvailabilityId === p.id ? 'Updating...' : p.available ? '● Available' : '● Unavailable'}</button><div className="flex items-center gap-1">{isAdminUser && <button aria-label={`Edit ${p.name}`} className="flex min-h-10 min-w-10 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => { setIsNewProduct(false); setEditProduct(p); }}><Icon name="edit" /></button>}{isAdminUser && <button aria-label={`Delete ${p.name}`} disabled={deletingProductId === p.id} className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-red-800 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => handleDeleteProduct(p)}>{deletingProductId === p.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-800 border-t-transparent" /> : <Icon name="trash" />}</button>}</div></div></div></div></div>)}</div><div className="hidden md:block overflow-x-auto rounded-xl border border-[#e7ddd2]"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f6efe6]"><tr>{['Product', 'Category', 'Price', 'Availability', 'Actions'].map(h => <th key={h} className="p-4 font-medium">{h}</th>)}</tr></thead><tbody>{products.map(p => <tr key={p.id} className="border-t border-[#e7ddd2]"><td className="p-3"><div className="flex items-center gap-3"><Photo src={p.image} alt={p.name} className="h-12 w-12 rounded-md object-cover" /><span>{p.name}{p.bestseller && <span className="block text-xs text-[#97713b]">Bestseller</span>}</span></div></td><td className="p-3">{p.category}</td><td className="p-3">{money(p.price)}</td><td className="p-3"><button aria-pressed={p.available} disabled={updatingProductAvailabilityId === p.id} onClick={() => handleToggleProductAvailability(p)} className={`min-h-11 rounded-full px-3 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${p.available ? 'text-green-800 bg-green-50/70 border border-green-200 hover:bg-green-100' : 'text-red-800 bg-red-50/70 border border-red-200 hover:bg-red-100'}`}>{updatingProductAvailabilityId === p.id ? 'Updating...' : p.available ? '● Available' : '● Unavailable'}</button></td><td className="p-3"><div className="flex">{isAdminUser ? <><button aria-label={`Edit ${p.name}`} className="flex min-h-11 min-w-11 items-center justify-center" onClick={() => { setIsNewProduct(false); setEditProduct(p); }}><Icon name="edit" /></button><button aria-label={`Delete ${p.name}`} disabled={deletingProductId === p.id} className="flex min-h-11 min-w-11 items-center justify-center text-red-800 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => handleDeleteProduct(p)}>{deletingProductId === p.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-800 border-t-transparent" /> : <Icon name="trash" />}</button></> : <span className="text-xs text-[#79695c] px-2 py-1">View only</span>}</div></td></tr>)}</tbody></table></div></>}
            {path === '/admin/categories' && (
              <>
                <div className="flex flex-col xs:flex-row xs:items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                  {heading(
                    'A place for every bake',
                    'Your collections.',
                    `${adminCategories.length} collection${adminCategories.length === 1 ? '' : 's'} · Organize and display bakery treats for customer browsing.`
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadAdminCategories}
                      disabled={adminCategoriesLoading}
                      title="Refresh collections"
                      aria-label="Refresh collections"
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#b9a08e] text-[#734738] hover:bg-[#faf6ef] disabled:opacity-50 transition"
                    >
                      <Icon name="refresh" className={adminCategoriesLoading ? 'animate-spin' : ''} />
                    </button>
                    {isAdminUser ? (
                      <button
                        type="button"
                        className={`${button} w-full xs:w-auto shrink-0 justify-center`}
                        onClick={() => {
                          setIsNewCategory(true);
                          setEditCategory({
                            id: '',
                            name: '',
                            slug: '',
                            description: '',
                            image_url: '',
                            display_order: (adminCategories.length + 1) * 10,
                            is_active: true,
                            created_at: '',
                            updated_at: '',
                          });
                        }}
                      >
                        + Add Category
                      </button>
                    ) : (
                      <span className="text-xs text-[#79695c] italic bg-[#faf6ef] border border-[#e8ded2] rounded px-3 py-1.5">
                        Collection additions reserved for Admin
                      </span>
                    )}
                  </div>
                </div>

                {adminCategoriesError && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-800 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">Failed to load categories from database</p>
                      <p className="mt-0.5">{adminCategoriesError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={loadAdminCategories}
                      className="shrink-0 min-h-9 px-3 rounded bg-red-100 hover:bg-red-200 font-medium text-xs text-red-900"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {adminCategoriesLoading && adminCategories.length === 0 ? (
                  <div className="rounded-xl border border-[#e6dace] bg-white p-12 text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#8b6244] border-t-transparent mb-3" />
                    <p className="text-sm font-medium text-[#76685d]">Loading collections from Supabase...</p>
                  </div>
                ) : !adminCategoriesLoading && !adminCategoriesError && adminCategories.length === 0 ? (
                  <div className="rounded-xl border border-[#e6dace] bg-white p-12 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#f8f1e7] text-[#8b6244]">
                      <Icon name="cake" className="!h-7 !w-7" />
                    </div>
                    <h3 className="font-serif text-lg text-[#432e26]">No collections found</h3>
                    <p className="mt-1 text-xs sm:text-sm text-[#79695c]">Click "+ Add Category" above to create your first collection.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                    {adminCategories.map(cat => {
                      const productCount = products.filter(p => p.category === cat.name || p.tags.includes(cat.name)).length;
                      const isToggling = togglingCategoryId === cat.id;
                      const isDeleting = deletingCategoryId === cat.id;

                      return (
                        <div
                          key={cat.id}
                          className={`flex flex-col justify-between rounded-xl border bg-white p-4 sm:p-5 transition hover:shadow-sm ${
                            cat.is_active ? 'border-[#e6dace]' : 'border-dashed border-[#d5c3b2] bg-[#fbf8f4]'
                          }`}
                        >
                          <div>
                            <div className="flex items-start gap-3 mb-3">
                              <div className="h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-lg border border-[#e2d5c8] bg-[#f7efe6] shrink-0">
                                {cat.image_url ? (
                                  <Photo src={cat.image_url} alt={cat.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[#9b6655]">
                                    <Icon name="cake" className="!w-8 !h-8 opacity-75" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-1">
                                  <h3 className="font-serif text-base sm:text-lg font-medium text-[#432e26] truncate">{cat.name}</h3>
                                  <span
                                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                                      cat.is_active
                                        ? 'border-green-200 bg-green-50 text-green-800'
                                        : 'border-stone-300 bg-stone-100 text-stone-600'
                                    }`}
                                  >
                                    {cat.is_active ? '● Active' : '○ Hidden'}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[11px] font-mono text-[#8c7465] truncate">slug: {cat.slug}</p>
                                <p className="mt-1 text-xs text-[#79695c] line-clamp-2">
                                  {cat.description || <span className="italic text-[#a8978a]">No description provided</span>}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs text-[#79695c] border-t border-[#f0e6dc] pt-2.5 mt-2">
                              <span>
                                <strong className="text-[#432e26]">{productCount}</strong> product{productCount === 1 ? '' : 's'} assigned
                              </span>
                              <span className="font-mono text-[11px] bg-[#f5ecdf] px-2 py-0.5 rounded text-[#6b5648]">
                                Order: #{cat.display_order}
                              </span>
                            </div>
                          </div>

                          {/* Action Controls */}
                          <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[#f0e6dc] pt-2.5">
                            <button
                              type="button"
                              disabled={isToggling || isDeleting || !isAdminUser}
                              onClick={() => handleToggleCategoryActive(cat)}
                              className={`min-h-9 rounded-full px-3 text-xs font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                cat.is_active
                                  ? 'border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100'
                                  : 'border-green-200 bg-green-50/60 text-green-800 hover:bg-green-100'
                              }`}
                            >
                              {isToggling ? 'Updating...' : cat.is_active ? 'Hide collection' : 'Show collection'}
                            </button>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => shop(cat.name)}
                                title="View on storefront"
                                aria-label={`View ${cat.name} on storefront`}
                                className="flex min-h-9 min-w-9 items-center justify-center rounded-md hover:bg-stone-100 text-[#734738]"
                              >
                                <Icon name="arrow" />
                              </button>
                              {isAdminUser ? (
                                <>
                                  <button
                                    type="button"
                                    aria-label={`Edit ${cat.name}`}
                                    onClick={() => {
                                      setIsNewCategory(false);
                                      setEditCategory(cat);
                                    }}
                                    className="flex min-h-9 min-w-9 items-center justify-center rounded-md hover:bg-stone-100 text-[#432e26]"
                                  >
                                    <Icon name="edit" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${cat.name}`}
                                    disabled={isDeleting || isToggling}
                                    onClick={() => handleDeleteCategory(cat)}
                                    className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-red-800 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isDeleting ? (
                                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-800 border-t-transparent" />
                                    ) : (
                                      <Icon name="trash" />
                                    )}
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-[#79695c] px-2 py-1">View only</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {path === '/admin/customers' && <>{heading('People behind the happy moments', 'Your lovely customers.')}<div className="space-y-4">{Array.from(new Set(orders.map(o => o.email))).map(email => { const list = orders.filter(o => o.email === email); const customer = list[0]; return <div key={email} className="rounded-xl border border-[#e7ddd2] bg-white p-4 sm:p-6"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-serif text-lg sm:text-xl">{customer.customer}</h2><p className="mt-1 sm:mt-2 text-xs sm:text-sm text-[#79695c]">{email} · {customer.phone}</p><p className="mt-1 sm:mt-2 text-xs sm:text-sm text-[#79695c]">{customer.address}</p></div><span className="text-xs sm:text-sm font-medium">{list.length} orders · {money(list.reduce((s, o) => s + (o.status === -1 ? 0 : o.total), 0))}</span></div><div className="mt-3 sm:mt-4 flex flex-wrap gap-2">{list.map(o => <button key={o.id} className="min-h-10 rounded-md bg-[#f5ecdf] px-3 text-xs sm:text-sm" onClick={() => setDetail(o)}>#{o.id} →</button>)}</div></div>; })}</div></>}
            {path === '/admin/offers-coupons' && <>{heading('A little extra sweetness', 'Offers & coupons.')}<div className="max-w-xl rounded-xl border border-dashed border-[#b89c7e] bg-[#f8eedf] p-5 sm:p-8"><p className="text-[10px] sm:text-xs uppercase tracking-widest font-semibold text-[#8b5943]">A warm welcome</p><h2 className="my-3 sm:my-4 font-serif text-3xl sm:text-4xl">SWEET10</h2><p className="mb-5 sm:mb-6 text-xs sm:text-sm leading-6 text-[#6d5c50]">10% off the cart subtotal. Applied instantly at checkout, with no minimum spend.</p><button className={`${button} w-full xs:w-auto justify-center`} aria-pressed={offerActive} onClick={() => { setOfferActive(!offerActive); notify(`Welcome offer ${offerActive ? 'paused' : 'activated'}`); }}>{offerActive ? 'Active · Pause offer' : 'Paused · Activate offer'}</button></div></>}
            {path === '/admin/reports' && <>{heading('The bigger picture', 'Good things, growing.')}<div className="mb-5 sm:mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Sales report period">{['Daily', 'Weekly', 'Monthly'].map(r => <button role="tab" aria-selected={report === r} onClick={() => setReport(r)} key={r} className={`min-h-10 sm:min-h-11 shrink-0 rounded-md px-4 sm:px-5 text-xs sm:text-sm ${report === r ? 'bg-[#754936] text-white font-medium' : 'bg-[#f4e9dd]'}`}>{r}</button>)}</div><div className="rounded-xl border border-[#e6dace] p-4 sm:p-6 bg-white overflow-hidden"><h2 className="font-serif text-xl sm:text-2xl">{report} sales</h2><SalesChart orders={orders} range={report} /></div><div className="mt-5 sm:mt-6 grid gap-3 sm:gap-4 grid-cols-1 xs:grid-cols-3">{[['Lifetime order value', money(orders.filter(o => o.status !== -1).reduce((s, o) => s + o.total, 0))], ['Total orders', orders.length], ['Average order value', money(orders.filter(o => o.status !== -1).reduce((s, o) => s + o.total, 0) / Math.max(1, orders.filter(o => o.status !== -1).length))]].map(([label, value]) => <div key={label} className="rounded-xl bg-[#f7efe5] p-4 sm:p-6"><p className="text-xs sm:text-sm text-[#79695c]">{label}</p><p className="mt-2 sm:mt-3 font-serif text-2xl sm:text-3xl">{value}</p></div>)}</div></>}
            {path === '/admin/settings' && <>{heading('Bakery workspace', 'Official Business Details & Settings.', 'Manage official bakery details, contact links, and local preferences.')}
            {!isAdminUser && (
              <div className="mb-6 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs sm:text-sm text-amber-900 leading-relaxed">
                <p className="font-semibold flex items-center gap-2"><Icon name="edit" className="!h-4 !w-4 text-amber-700" /> Administrator Role Required for Settings Modification</p>
                <p className="mt-1">You are signed in with <strong>Bakery Staff</strong> privileges. Staff members can review business credentials and contact information, but only designated <strong>Administrators</strong> can save updates to official business info, phone numbers, and maps locations.</p>
              </div>
            )}
            <form className="grid max-w-2xl gap-4 sm:gap-5 rounded-xl border border-[#e7ddd2] bg-white p-4 sm:p-6 md:p-8" onSubmit={e => {
              e.preventDefault();
              if (!isAdminUser) {
                notify('Administrator privileges are required to save official business settings.');
                return;
              }
              const d = new FormData(e.currentTarget);
              const updated: BusinessInfo = {
                name: String(d.get('name') || business.name).trim(),
                tagline: String(d.get('tagline') || business.tagline).trim(),
                address: String(d.get('address') || business.address).trim(),
                cityState: String(d.get('cityState') || business.cityState).trim(),
                phone: String(d.get('phone') || business.phone).trim(),
                mapsUrl: String(d.get('mapsUrl') || business.mapsUrl).trim(),
                ownerName: String(d.get('ownerName') || '').trim(),
                email: String(d.get('email') || '').trim(),
                openingHours: String(d.get('openingHours') || '').trim(),
              };
              setBusiness(updated);
              notify('Official business details saved to local storage.');
            }}>
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl">Official Business Information</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isAdminUser ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                  {isAdminUser ? 'Administrator: Editable' : 'Staff: Read-only'}
                </span>
              </div>
              <Field label="Bakery name"><input required name="name" defaultValue={business.name} disabled={!isAdminUser} className={`${field} ${!isAdminUser ? 'bg-stone-50 cursor-not-allowed opacity-80' : ''}`} /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Contact phone number"><input required name="phone" defaultValue={business.phone} disabled={!isAdminUser} className={`${field} ${!isAdminUser ? 'bg-stone-50 cursor-not-allowed opacity-80' : ''}`} type="tel" /></Field>
                <Field label="City / Region tag"><input name="cityState" defaultValue={business.cityState} disabled={!isAdminUser} className={`${field} ${!isAdminUser ? 'bg-stone-50 cursor-not-allowed opacity-80' : ''}`} placeholder="e.g. Bejjanki, Telangana" /></Field>
              </div>
              <Field label="Full business address"><textarea required name="address" defaultValue={business.address} disabled={!isAdminUser} className={`${field} ${!isAdminUser ? 'bg-stone-50 cursor-not-allowed opacity-80' : ''}`} rows={2} /></Field>
              <Field label="Google Maps location URL"><input required name="mapsUrl" defaultValue={business.mapsUrl} disabled={!isAdminUser} className={`${field} ${!isAdminUser ? 'bg-stone-50 cursor-not-allowed opacity-80' : ''}`} type="url" /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Owner name (optional)"><input name="ownerName" defaultValue={business.ownerName} disabled={!isAdminUser} className={`${field} ${!isAdminUser ? 'bg-stone-50 cursor-not-allowed opacity-80' : ''}`} placeholder="Leave blank until supplied" /></Field>
                <Field label="Business email (optional)"><input name="email" defaultValue={business.email} disabled={!isAdminUser} className={`${field} ${!isAdminUser ? 'bg-stone-50 cursor-not-allowed opacity-80' : ''}`} type="email" placeholder="Leave blank until supplied" /></Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Opening hours (optional)"><input name="openingHours" defaultValue={business.openingHours} disabled={!isAdminUser} className={`${field} ${!isAdminUser ? 'bg-stone-50 cursor-not-allowed opacity-80' : ''}`} placeholder="Leave blank until supplied" /></Field>
                <Field label="Motto / Tagline"><input name="tagline" defaultValue={business.tagline} disabled={!isAdminUser} className={`${field} ${!isAdminUser ? 'bg-stone-50 cursor-not-allowed opacity-80' : ''}`} /></Field>
              </div>
              <div className="border-t border-[#eee6dd] pt-6 mt-6">
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl sm:text-2xl text-[#3b2b23]">Notification Sound Studio</h3>
                    <p className="text-xs sm:text-sm text-[#79695c]">Configure alert tones and volume for incoming bakery orders.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestSound()}
                    className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-[#8b634b] bg-[#8b634b] px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-xs hover:bg-[#734738] transition shrink-0"
                  >
                    <Icon name="bell" className="!w-4 !h-4 text-white" />
                    <span>Test Selected Sound</span>
                  </button>
                </div>

                {/* Master Controls: Sound Enabled Toggle & Volume Slider */}
                <div className="mb-6 grid gap-4 sm:grid-cols-2 rounded-xl border border-[#e8ded2] bg-[#fdfbf7] p-4 sm:p-5">
                  <div className="flex flex-col justify-center">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sound}
                        onChange={async (e) => {
                          const next = e.target.checked;
                          setSound(next);
                          if (next) {
                            const played = await playNotificationSound(soundType, soundVolume);
                            if (!played) {
                              notify('Notification sound enabled (click page to unlock audio).');
                              return;
                            }
                          }
                          notify(`Notification sound ${next ? 'enabled' : 'disabled'}`);
                        }}
                        className="accent-[#734738] h-4 w-4 rounded"
                      />
                      <div>
                        <span className="text-sm font-semibold text-[#423126]">Order Notification Alerts</span>
                        <p className="text-xs text-[#79695c]">Play sound when new bakery orders arrive</p>
                      </div>
                    </label>
                  </div>

                  <div className="flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-[#eee6dd] pt-3 sm:pt-0 sm:pl-5">
                    <div className="flex items-center justify-between text-xs sm:text-sm mb-1.5">
                      <span className="font-semibold text-[#423126]">Alert Volume</span>
                      <span className="font-mono text-xs font-bold text-[#8b634b] bg-[#f4ebde] px-2 py-0.5 rounded">
                        {soundVolume === 0 ? 'Muted (0%)' : `${soundVolume}%`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#9b897b]">0%</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={soundVolume}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSoundVolume(val);
                        }}
                        onMouseUp={() => {
                          if (sound && soundVolume > 0) {
                            playNotificationSound(soundType, soundVolume);
                          }
                        }}
                        onTouchEnd={() => {
                          if (sound && soundVolume > 0) {
                            playNotificationSound(soundType, soundVolume);
                          }
                        }}
                        className="w-full accent-[#8b634b] cursor-pointer"
                        aria-label="Notification alert volume"
                      />
                      <span className="text-xs text-[#9b897b]">100%</span>
                    </div>
                  </div>
                </div>

                {/* Phase 4.3: Desktop Browser Notifications Card */}
                <div className="mb-6 rounded-xl border border-[#e8ded2] bg-[#fdfbf7] p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#423126]">Desktop Browser Notifications</span>
                        {desktopPermission === 'granted' && desktopNotifications && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        )}
                        {desktopPermission === 'granted' && !desktopNotifications && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 border border-stone-200 px-2.5 py-0.5 text-[10px] font-semibold text-stone-600">
                            Paused
                          </span>
                        )}
                        {desktopPermission === 'default' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            Not Enabled
                          </span>
                        )}
                        {desktopPermission === 'denied' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[10px] font-semibold text-red-800">
                            Blocked in Browser
                          </span>
                        )}
                        {desktopPermission === 'unsupported' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 border border-stone-200 px-2.5 py-0.5 text-[10px] font-semibold text-stone-600">
                            Not Supported
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#79695c]">
                        Receive OS-level alerts when new orders arrive, even when browsing other tabs or apps.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {desktopPermission === 'default' && (
                        <button
                          type="button"
                          onClick={requestDesktopNotificationPermission}
                          className="min-h-9 rounded-lg border border-[#8b634b] bg-[#8b634b] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#734738] transition"
                        >
                          Enable Desktop Alerts
                        </button>
                      )}

                      {desktopPermission === 'granted' && (
                        <>
                          <label className="flex items-center gap-2 text-xs font-medium text-[#46382f] cursor-pointer mr-2">
                            <input
                              type="checkbox"
                              checked={desktopNotifications}
                              onChange={(e) => {
                                setDesktopNotifications(e.target.checked);
                                notify(`Desktop notifications ${e.target.checked ? 'enabled' : 'disabled'}`);
                              }}
                              className="accent-[#734738] h-4 w-4 rounded"
                            />
                            <span>Allow Alerts</span>
                          </label>
                          <button
                            type="button"
                            onClick={handleTestDesktopNotification}
                            className="min-h-9 rounded-md border border-[#ddcebd] bg-white px-3 py-1.5 text-xs font-medium text-[#734738] hover:bg-[#faf6ef] transition shadow-xs"
                          >
                            Test Notification
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {desktopPermission === 'denied' && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-xs text-red-800">
                      <p className="font-semibold mb-0.5">Notifications are blocked by your browser</p>
                      <p className="leading-relaxed">
                        To enable them, click the lock/settings icon in your browser address bar (beside the site URL), change Notifications to <strong>Allow</strong>, and refresh the page.
                      </p>
                    </div>
                  )}

                  {desktopPermission === 'unsupported' && (
                    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-[#79695c]">
                      This browser environment does not support desktop Web Notifications.
                    </div>
                  )}
                </div>

                {/* Sound Selection Grid */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase tracking-wider font-semibold text-[#8b634b]">Selectable Alert Tones (8 Options)</span>
                    <span className="text-xs text-[#79695c]">Selected: <strong className="text-[#432e26] font-medium">{NOTIFICATION_SOUNDS.find(s => s.id === soundType)?.name || soundType}</strong></span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                    {NOTIFICATION_SOUNDS.map((snd) => {
                      const isSelected = soundType === snd.id;
                      const isPreviewing = previewingSoundId === snd.id;

                      return (
                        <div
                          key={snd.id}
                          onClick={() => {
                            setSoundType(snd.id);
                            handleTestSound(snd.id);
                          }}
                          className={`relative flex items-center justify-between rounded-xl border p-3.5 sm:p-4 cursor-pointer transition select-none ${
                            isSelected
                              ? 'border-[#8b634b] bg-[#f9f4ec] shadow-xs ring-1 ring-[#8b634b]/20'
                              : 'border-[#e8ded2] bg-white hover:border-[#cfbea9] hover:bg-[#fffefb]'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0 pr-2">
                            <div className="mt-0.5">
                              <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-[#8b634b] bg-[#8b634b]' : 'border-[#cfbea9] bg-white'}`}>
                                {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold truncate ${isSelected ? 'text-[#3b271d]' : 'text-[#4a3b32]'}`}>
                                  {snd.name}
                                </span>
                                <span className="text-[10px] font-mono rounded bg-[#eee5dc] px-1.5 py-0.5 text-[#735e51]">
                                  {snd.durationLabel}
                                </span>
                              </div>
                              <p className="text-xs text-[#79695c] mt-0.5 leading-snug line-clamp-1 sm:line-clamp-none">
                                {snd.description}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestSound(snd.id);
                            }}
                            className={`min-h-9 px-3 py-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 shrink-0 ${
                              isPreviewing
                                ? 'border-[#8b634b] bg-[#8b634b] text-white animate-pulse'
                                : 'border-[#ddcebd] bg-white text-[#734738] hover:bg-[#f4ecdf]'
                            }`}
                            title={`Preview ${snd.name}`}
                          >
                            <Icon name="bell" className={`!w-3.5 !h-3.5 ${isPreviewing ? 'text-white' : 'text-[#8b6244]'}`} />
                            <span>{isPreviewing ? 'Playing' : 'Preview'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-[#88786b]">
                  Tone selection and volume are saved in your browser and will automatically be applied to incoming order alerts.
                </p>
              </div>
              {isAdminUser ? (
                <button className={button}>Save Business Information</button>
              ) : (
                <button type="button" disabled className={`${button} opacity-50 cursor-not-allowed`}>
                  Administrator role required to save changes
                </button>
              )}
            </form></>}
            {!isKnownAdminRoute && <div className="rounded-xl border border-dashed border-[#d6c4b5] p-12 text-center"><Icon name="grid" className="mx-auto mb-4 !h-10 !w-10 text-[#8b6244]" /><h2 className="font-serif text-2xl">Admin section not found</h2><p className="my-3 text-sm text-[#79695c]">The bakery workspace section you are looking for does not exist.</p><button className={button} onClick={() => go('/admin')}>Back to Bakery Overview</button></div>}
          </main>
        </div>
      )
    )}

    {path === '/about' && <main className="mx-auto grid max-w-[1160px] items-center gap-6 sm:gap-10 px-4 sm:px-6 py-10 sm:py-16 md:grid-cols-2"><Photo src="/images/strawberry-hero.png" alt={`A handcrafted celebration cake from ${business.name}`} className="h-[280px] xs:h-[360px] sm:h-[420px] md:h-[460px] w-full rounded-2xl object-cover" /><div>{heading('Baked with care. Always.', business.name, 'Good bakes, honest ingredients, and happier celebrations.')}<p className="text-xs sm:text-sm leading-6 sm:leading-8 text-[#79695c]">We believe the best celebrations begin with honest bakes made fresh every day. At {business.name}, we craft cakes, pastries, and treats with patience, quality ingredients, and an eye for the little details. Whether it is a birthday, an anniversary, or an everyday tea-time craving — we are here to make your moments sweeter.</p><div className="mb-3 mt-6 sm:mt-8 border-t border-[#eee6dd] pt-5 sm:pt-6"><h2 className="font-serif text-xl sm:text-2xl">Visit or reach out to us</h2><p className="mt-2 text-xs sm:text-sm leading-6 sm:leading-7 text-[#79695c]">{business.address}<br />{business.openingHours && <>{business.openingHours}<br /></>}<a href={`tel:${business.phone}`} className="font-medium text-[#8b5943] underline underline-offset-4">{business.phone}</a>{business.email && <><br /><a href={`mailto:${business.email}`} className="font-medium text-[#8b5943] underline underline-offset-4">{business.email}</a></>}</p><div className="mt-5 flex flex-col xs:flex-row flex-wrap gap-3"><a href={business.mapsUrl} target="_blank" rel="noopener noreferrer" className={`${button} justify-center`}><Icon name="pin" /> Get Directions ↗</a><button className="min-h-11 rounded-md border border-[#b9a08e] px-6 text-xs sm:text-sm font-medium transition hover:bg-[#734738] hover:text-white justify-center" onClick={() => shop()}>Explore our bakes</button></div></div></div></main>}

    {path === '/contact' && <main className="mx-auto max-w-[1160px] px-3 sm:px-6 py-8 sm:py-12">{heading('Get in touch', 'We would love to welcome you.', 'Visit our bakery in Bejjanki or give us a call for special orders and custom cakes.')}<div className="grid gap-6 sm:gap-8 lg:grid-cols-[1.2fr_1fr]"><div className="rounded-2xl border border-[#e7ddd2] bg-white p-4 sm:p-6 md:p-8"><h2 className="font-serif text-2xl sm:text-3xl">Bakery Location & Contact</h2><p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-[#79695c]">Freshly baked delights right here in Bejjanki, Siddipet.</p><div className="mt-5 sm:mt-6 space-y-4 sm:space-y-5 border-t border-[#eee6dd] pt-5 sm:pt-6 text-xs sm:text-sm"><div className="flex items-start gap-3"><Icon name="pin" className="mt-0.5 sm:mt-1 !h-5 !w-5 text-[#8b6244] shrink-0" /><div><p className="font-semibold text-sm sm:text-base">Address</p><p className="mt-1 leading-relaxed text-[#725e4e]">{business.address}</p></div></div><div className="flex items-start gap-3"><Icon name="truck" className="mt-0.5 sm:mt-1 !h-5 !w-5 text-[#8b6244] shrink-0" /><div><p className="font-semibold text-sm sm:text-base">Phone</p><p className="mt-1"><a href={`tel:${business.phone}`} className="font-medium text-[#8b5943] hover:underline underline-offset-4 text-sm sm:text-base">{business.phone}</a></p><p className="text-[11px] sm:text-xs text-[#79695c] mt-0.5">Click to call directly</p></div></div>{business.email && <div className="flex items-start gap-3"><Icon name="user" className="mt-0.5 sm:mt-1 !h-5 !w-5 text-[#8b6244] shrink-0" /><div><p className="font-semibold text-sm sm:text-base">Email</p><p className="mt-1"><a href={`mailto:${business.email}`} className="font-medium text-[#8b5943] hover:underline underline-offset-4">{business.email}</a></p></div></div>}{business.openingHours && <div className="flex items-start gap-3"><Icon name="cake" className="mt-0.5 sm:mt-1 !h-5 !w-5 text-[#8b6244] shrink-0" /><div><p className="font-semibold text-sm sm:text-base">Opening Hours</p><p className="mt-1 text-[#725e4e]">{business.openingHours}</p></div></div>}{business.ownerName && <div className="flex items-start gap-3"><Icon name="user" className="mt-0.5 sm:mt-1 !h-5 !w-5 text-[#8b6244] shrink-0" /><div><p className="font-semibold text-sm sm:text-base">Proprietor / Owner</p><p className="mt-1 text-[#725e4e]">{business.ownerName}</p></div></div>}</div><div className="mt-6 sm:mt-8 flex flex-col xs:flex-row flex-wrap items-stretch xs:items-center gap-3 sm:gap-4 border-t border-[#eee6dd] pt-5 sm:pt-6"><a href={business.mapsUrl} target="_blank" rel="noopener noreferrer" className={`${button} justify-center`}><Icon name="pin" /> Get Directions ↗</a><a href={`tel:${business.phone}`} className="min-h-11 rounded-md border border-[#b9a08e] px-4 sm:px-5 text-xs sm:text-sm font-medium flex items-center justify-center transition hover:bg-[#734738] hover:text-white">Call Bakery ({business.phone})</a></div></div><div className="flex flex-col justify-between gap-6 rounded-2xl border border-[#e7ddd2] bg-[#faf6ef] p-4 sm:p-6 md:p-8"><div><div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-[#f1e6d8] text-[#8b6244] mb-3 sm:mb-4"><Icon name="pin" className="!h-5 !w-5 sm:!h-6 sm:!w-6" /></div><h3 className="font-serif text-xl sm:text-2xl">Find Us on Google Maps</h3><p className="mt-2 text-xs sm:text-sm leading-6 text-[#725e4e]">Conveniently located at 9-2-5, Siddipet, Bejjanki, Telangana. Click below to view the official Google Maps location pin and directions.</p><div className="mt-5 sm:mt-6 rounded-xl border border-[#e0d3c4] bg-white p-4 sm:p-5"><p className="text-[10px] sm:text-xs uppercase tracking-wider text-[#9b6255] font-semibold">Location Pin</p><p className="font-medium text-xs sm:text-sm mt-1">{business.name}</p><p className="text-[11px] sm:text-xs text-[#79695c] mt-1">{business.address}</p><a href={business.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8b5943] hover:underline">Open in Google Maps ↗</a></div></div><div className="border-t border-[#ebdccf] pt-4"><p className="text-[11px] sm:text-xs text-[#79695c] leading-5">Planning a celebration or custom birthday cake? Contact our team or visit us at the bakery counter.</p></div></div></div></main>}

    {path === '/track-order' && (
      <main className="mx-auto max-w-[1160px] px-3 sm:px-6 py-8 sm:py-12">
        {heading('Order Tracking', "Where's your sweet bake?", 'Follow your handcrafted treats from our ovens in Bejjanki directly to your doorstep.')}
        {signedIn && (
          <div className="mb-4 sm:mb-6">
            <button
              type="button"
              onClick={() => go('/account/orders')}
              className="inline-flex items-center gap-2 rounded-md border border-[#ddcebd] bg-white px-3.5 py-1.5 text-xs font-medium text-[#734738] hover:bg-[#faf6ef] transition shadow-xs"
            >
              <span>← Back to My Orders</span>
            </button>
          </div>
        )}
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[1.1fr_1.3fr]">
          <div className="space-y-6">
            {signedIn ? (
              customerOrders.length > 0 ? (
                <div className="rounded-2xl border border-[#e7ddd2] bg-[#faf7f2] p-5 sm:p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="font-serif text-lg sm:text-xl text-[#432e26]">Your Orders</h2>
                      <p className="text-xs text-[#79695c] mt-0.5">Orders in your bakery account ({customerOrders.length})</p>
                    </div>
                    <button
                      type="button"
                      disabled={customerOrdersLoading}
                      onClick={() => loadCustomerOrders()}
                      className="flex items-center gap-1.5 rounded-md border border-[#ddcebd] bg-white px-2.5 py-1 text-xs font-medium text-[#734738] hover:bg-[#faf6ef] disabled:opacity-50 transition"
                      title="Check for updated status on all orders"
                    >
                      <Icon name="refresh" className={`!h-3 !w-3 ${customerOrdersLoading ? 'animate-spin' : ''}`} />
                      <span>{customerOrdersLoading ? 'Checking...' : 'Refresh'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-[#79695c] mb-4">
                    Select any order to follow its live preparation and delivery progress in real time.
                  </p>
                  <div className="space-y-3">
                    {customerOrders.map(o => {
                      const isCurrentlyTracking = guestOrderResult?.order_number === o.id;
                      const statusLabel = o.status === 5 ? 'Delivered' : o.status === -1 ? 'Cancelled' : steps[o.status] || 'Order Placed';
                      const statusBadgeClass = o.status === 5
                        ? 'bg-green-50 text-green-800 border-green-200'
                        : o.status === -1
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : 'bg-[#f9e9db] text-[#81552d] border-[#f0d4bd]';

                      return (
                        <div
                          key={o.id}
                          className={`rounded-xl border p-4 sm:p-5 transition bg-white ${
                            isCurrentlyTracking
                              ? 'border-[#8b634b] ring-1 ring-[#8b634b]/20 shadow-xs'
                              : 'border-[#e5dcce] hover:border-[#d6c4b5]'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div>
                              <span className="font-semibold text-sm sm:text-base text-[#432e26]">#{o.id}</span>
                              <span className="ml-2 text-xs text-[#79695c]">
                                {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${statusBadgeClass}`}>
                              {statusLabel}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee5dc] pt-3 mt-2">
                            <p className="text-xs sm:text-sm font-semibold text-[#734738]">
                              Total: {money(o.total)}
                            </p>
                            <button
                              type="button"
                              onClick={() => trackCustomerOrder(o.id)}
                              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                                isCurrentlyTracking
                                  ? 'bg-[#faf6ef] text-[#734738] border border-[#ddcebd]'
                                  : 'bg-[#734738] text-white hover:bg-[#513023]'
                              }`}
                            >
                              {isCurrentlyTracking ? (
                                <>
                                  <Icon name="check" className="!h-3.5 !w-3.5 text-[#6b7746]" />
                                  <span>Viewing Details</span>
                                </>
                              ) : (
                                <span>Track Order →</span>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#d6c4b5] bg-[#faf7f2] p-5 sm:p-6 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f1e6d8] text-[#8b6244]">
                    <Icon name="bag" className="!h-5 !w-5" />
                  </div>
                  <h3 className="font-serif text-base sm:text-lg text-[#432e26]">No orders in your account</h3>
                  <p className="mt-1 text-xs text-[#79695c] max-w-sm mx-auto leading-relaxed">
                    You haven't placed an order with this account yet.
                  </p>
                  <button className={`${button} mt-4 text-xs py-2`} onClick={() => shop()}>Explore our bakes</button>
                </div>
              )
            ) : savedGuestOrders.length > 0 ? (
              <div className="rounded-2xl border border-[#e7ddd2] bg-[#faf7f2] p-5 sm:p-6 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-serif text-lg sm:text-xl text-[#432e26]">Your Saved Orders</h2>
                    <p className="text-xs text-[#79695c] mt-0.5">Orders on this browser ({savedGuestOrders.length})</p>
                  </div>
                  <button
                    type="button"
                    disabled={savedGuestOrdersLoading}
                    onClick={() => loadSavedGuestOrders()}
                    className="flex items-center gap-1.5 rounded-md border border-[#ddcebd] bg-white px-2.5 py-1 text-xs font-medium text-[#734738] hover:bg-[#faf6ef] disabled:opacity-50 transition"
                    title="Check for updated status on all saved orders"
                  >
                    <Icon name="refresh" className={`!h-3 !w-3 ${savedGuestOrdersLoading ? 'animate-spin' : ''}`} />
                    <span>{savedGuestOrdersLoading ? 'Checking...' : 'Check All'}</span>
                  </button>
                </div>
                <p className="text-xs text-[#79695c] mb-4">
                  Orders placed on this device are automatically saved for one-click tracking without entering your access token.
                </p>
                <div className="space-y-3">
                  {savedGuestOrders.map(so => {
                    const isCurrentlyTracking = guestOrderResult?.order_number === so.order_number;
                    const isThisLoading = guestTrackLoading && guestTrackNumber === so.order_number;

                    const statusStep = so.status ? mapOrderStatusToStep(so.status) : -1;
                    const statusLabel = so.status === 'delivered'
                      ? 'Delivered'
                      : so.status === 'cancelled' || so.status === 'rejected'
                      ? 'Cancelled'
                      : so.status
                      ? (steps[statusStep] || so.status.replace(/_/g, ' '))
                      : (savedGuestOrdersLoading ? 'Checking...' : 'Order Placed');

                    const statusBadgeClass = so.status === 'delivered'
                      ? 'bg-green-50 text-green-800 border-green-200'
                      : so.status === 'cancelled' || so.status === 'rejected'
                      ? 'bg-red-50 text-red-800 border-red-200'
                      : so.status
                      ? 'bg-[#f9e9db] text-[#81552d] border-[#f0d4bd]'
                      : 'bg-stone-50 text-stone-600 border-stone-200';

                    return (
                      <div
                        key={so.order_number}
                        className={`rounded-xl border p-4 sm:p-5 transition bg-white ${
                          isCurrentlyTracking
                            ? 'border-[#8b634b] ring-1 ring-[#8b634b]/20 shadow-xs'
                            : 'border-[#e5dcce] hover:border-[#d6c4b5]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div>
                            <span className="font-semibold text-sm sm:text-base text-[#432e26]">#{so.order_number}</span>
                            <span className="ml-2 text-xs text-[#79695c]">
                              {new Date(so.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${statusBadgeClass}`}>
                            {statusLabel}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee5dc] pt-3 mt-2">
                          <p className="text-xs sm:text-sm font-semibold text-[#734738]">
                            Total: {money(so.total)}
                          </p>
                          <button
                            type="button"
                            disabled={guestTrackLoading}
                            onClick={() => handleTrackGuestOrder(so.order_number, so.guest_access_token)}
                            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                              isCurrentlyTracking
                                ? 'bg-[#faf6ef] text-[#734738] border border-[#ddcebd]'
                                : 'bg-[#734738] text-white hover:bg-[#513023]'
                            }`}
                          >
                            {isThisLoading ? (
                              <>
                                <Icon name="refresh" className="!h-3.5 !w-3.5 animate-spin" />
                                <span>Loading...</span>
                              </>
                            ) : isCurrentlyTracking ? (
                              <>
                                <Icon name="check" className="!h-3.5 !w-3.5 text-[#6b7746]" />
                                <span>Viewing Details</span>
                              </>
                            ) : (
                              <span>Track Order →</span>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#d6c4b5] bg-[#faf7f2] p-5 sm:p-6 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f1e6d8] text-[#8b6244]">
                  <Icon name="bag" className="!h-5 !w-5" />
                </div>
                <h3 className="font-serif text-base sm:text-lg text-[#432e26]">No saved orders on this browser</h3>
                <p className="mt-1 text-xs text-[#79695c] max-w-sm mx-auto leading-relaxed">
                  Orders placed as a guest on this device appear here automatically for one-click tracking. If you ordered on another device, use the recovery form below.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-[#e7ddd2] bg-white p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-base sm:text-lg text-[#432e26]">Track an order from another device</h3>
                  <p className="text-xs text-[#79695c] mt-0.5">
                    {signedIn || savedGuestOrders.length > 0
                      ? 'Have a guest order placed with an access token?'
                      : 'Enter your order number and secret guest access token to view live status.'}
                  </p>
                </div>
                {(signedIn || savedGuestOrders.length > 0) && (
                  <button
                    type="button"
                    onClick={() => setShowManualTrack(prev => !prev)}
                    className="text-xs font-semibold text-[#8b5943] hover:underline flex items-center gap-1 shrink-0 ml-2 py-1 px-2.5 rounded-md hover:bg-[#faf6ef]"
                  >
                    {showManualTrack ? 'Hide form ↑' : 'Enter access token ↓'}
                  </button>
                )}
              </div>

              {(showManualTrack || (!signedIn && savedGuestOrders.length === 0)) && (
                <div className="mt-4 pt-4 border-t border-[#eee5dc]">
                  {guestTrackError && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-900 leading-relaxed" role="alert">
                      {guestTrackError}
                    </div>
                  )}

                  <form onSubmit={e => { e.preventDefault(); handleTrackGuestOrder(); }} className="grid gap-4">
                    <Field label="Order Number">
                      <input
                        required
                        value={guestTrackNumber}
                        onChange={e => setGuestTrackNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. BCB5DB49"
                        className={`${field} uppercase tracking-wider font-medium`}
                        disabled={guestTrackLoading}
                      />
                    </Field>

                    <Field label="Guest Access Token (Manual Recovery)">
                      <input
                        required
                        type="password"
                        autoComplete="off"
                        value={guestTrackToken}
                        onChange={e => setGuestTrackToken(e.target.value.trim())}
                        placeholder="Enter 36-character access token"
                        className={`${field} font-mono text-xs`}
                        disabled={guestTrackLoading}
                      />
                      <span className="text-[11px] text-[#79695c]">
                        Optional recovery method: enter the 36-character secret access token received at checkout.
                      </span>
                    </Field>

                    <div className="flex gap-2 pt-1">
                      <button disabled={guestTrackLoading} className={`${button} flex-1 justify-center`}>
                        {guestTrackLoading ? 'Looking up order...' : 'Track Order →'}
                      </button>
                      {(guestTrackNumber || guestTrackToken) && (
                        <button
                          type="button"
                          disabled={guestTrackLoading}
                          onClick={() => {
                            setGuestTrackNumber('');
                            setGuestTrackToken('');
                            setGuestTrackError(null);
                          }}
                          className="min-h-11 rounded-md border border-[#ded3c9] px-4 text-xs font-medium text-[#734738] hover:bg-[#faf6ef]"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>

            {!signedIn && (
              <div className="rounded-xl border border-[#e5dcce] bg-[#fffdfa] p-4 text-center">
                <p className="text-xs text-[#79695c]">
                  Have a customer account with us?{' '}
                  <a href="#/account" className="font-semibold text-[#734738] hover:underline">
                    Sign in to view your full order history →
                  </a>
                </p>
              </div>
            )}
          </div>

          <div>
            {guestOrderResult ? (
              <div className="rounded-2xl border border-[#e7ddd2] bg-white p-5 sm:p-8 shadow-xs">
                {guestTrackError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-900 leading-relaxed" role="alert">
                    {guestTrackError}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#eee5dc]">
                  <div>
                    <h2 className="font-serif text-xl sm:text-2xl text-[#432e26]">Order #{guestOrderResult.order_number}</h2>
                    <p className="text-xs text-[#79695c] mt-0.5">
                      Placed {new Date(guestOrderResult.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const isAuthOrder = signedIn && customerOrders.some(o => o.id === guestOrderResult.order_number);
                      const isRefreshing = isAuthOrder ? customerOrdersLoading : guestTrackLoading;
                      return (
                        <button
                          type="button"
                          disabled={isRefreshing}
                          onClick={() => {
                            if (isAuthOrder) {
                              loadCustomerOrders(guestOrderResult.order_number);
                            } else {
                              handleTrackGuestOrder(guestOrderResult.order_number, guestTrackToken);
                            }
                          }}
                          className="flex items-center gap-1.5 rounded-full border border-[#ddcebd] bg-[#faf6ef] px-3 py-1 text-xs font-medium text-[#734738] hover:bg-[#f3ebd0] disabled:opacity-60 transition"
                          title="Check for live progress updates"
                        >
                          <Icon name="refresh" className={`!h-3 !w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                          {isRefreshing ? 'Refreshing...' : 'Refresh status'}
                        </button>
                      );
                    })()}
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      guestOrderResult.status === 'delivered'
                        ? 'bg-green-50 text-green-800 border border-green-200'
                        : guestOrderResult.status === 'cancelled' || guestOrderResult.status === 'rejected'
                        ? 'bg-red-50 text-red-800 border border-red-200'
                        : 'bg-[#f9e9db] text-[#81552d] border border-[#f0d4bd]'
                    }`}>
                      {guestOrderResult.status === 'delivered'
                        ? 'Delivered'
                        : guestOrderResult.status === 'cancelled' || guestOrderResult.status === 'rejected'
                        ? 'Cancelled'
                        : steps[mapOrderStatusToStep(guestOrderResult.status)] || guestOrderResult.status}
                    </span>
                  </div>
                </div>

                <div className="my-6">
                  {guestOrderResult.status === 'cancelled' || guestOrderResult.status === 'rejected' ? (
                    <div className="rounded-lg bg-red-50 p-3.5 text-xs text-red-800 leading-relaxed border border-red-200">
                      This order was marked as <strong>{guestOrderResult.status}</strong>. If you need any assistance, please reach out to our bakery team at {business.phone}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                      {steps.map((s, i) => {
                        const currentStep = mapOrderStatusToStep(guestOrderResult.status);
                        const isCompleted = currentStep >= i;
                        return (
                          <div key={s} className="min-w-0">
                            <div className={`mx-auto mb-1.5 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border ${
                              isCompleted ? 'border-[#8b634b] bg-[#8b634b] text-white' : 'border-[#d7cbbb] text-[#79695c]'
                            }`}>
                              {isCompleted ? <Icon name="check" className="!h-3.5 !w-3.5" /> : <span className="text-[10px] sm:text-xs">{i + 1}</span>}
                            </div>
                            <p className="text-[10px] sm:text-xs text-[#79695c] truncate px-0.5">{s}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="my-5 grid gap-3 sm:gap-4 rounded-xl border border-[#eee5dc] bg-[#faf7f2] p-4 text-xs sm:text-sm md:grid-cols-2">
                  <div>
                    <p className="font-semibold text-[#432e26] mb-1">Delivering to</p>
                    <p className="text-[#725e4e] leading-relaxed">
                      {guestOrderResult.customer_name}<br />
                      {guestOrderResult.customer_phone}<br />
                      {guestOrderResult.delivery_street_address}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-[#432e26] mb-1">Delivery Slot</p>
                    <p className="text-[#725e4e] leading-relaxed">
                      {guestOrderResult.delivery_date}<br />
                      {guestOrderResult.delivery_time_slot}
                    </p>
                  </div>
                </div>

                <div className="my-5">
                  <h3 className="font-serif text-sm sm:text-base font-semibold mb-3">Ordered Treats</h3>
                  <div className="space-y-2.5">
                    {guestOrderResult.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 rounded-lg border border-[#eee5dc] p-2.5 sm:p-3">
                        <div className="min-w-0">
                          <p className="font-medium text-xs sm:text-sm text-[#432e26] truncate">
                            {item.quantity} × {item.product_name}
                          </p>
                          <p className="text-[11px] text-[#79695c] mt-0.5">
                            {item.weight_label} · {item.egg_preference}
                            {item.custom_message ? ` · “${item.custom_message}”` : ''}
                          </p>
                        </div>
                        <span className="font-semibold text-xs sm:text-sm text-[#432e26] shrink-0">
                          {money(item.total_price)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[#eee5dc] pt-3 text-xs sm:text-sm space-y-1.5">
                  <div className="flex justify-between text-[#79695c]">
                    <span>Subtotal</span>
                    <span>{money(guestOrderResult.subtotal_amount)}</span>
                  </div>
                  <div className="flex justify-between text-[#79695c]">
                    <span>Delivery fee</span>
                    <span>{guestOrderResult.delivery_fee === 0 ? 'FREE' : money(guestOrderResult.delivery_fee)}</span>
                  </div>
                  {guestOrderResult.discount_amount > 0 && (
                    <div className="flex justify-between text-[#8b5943]">
                      <span>Discount</span>
                      <span>-{money(guestOrderResult.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base sm:text-lg font-semibold pt-2 border-t border-[#eee5dc]">
                    <span>Total Amount</span>
                    <span className="text-[#734738]">{money(guestOrderResult.total_amount)}</span>
                  </div>
                  {(guestOrderResult.payment_method || guestOrderResult.payment_status) && (
                    <div className="flex justify-between text-[11px] sm:text-xs text-[#79695c] pt-1">
                      <span>Payment Details</span>
                      <span className="font-medium text-[#432e26] capitalize">
                        {guestOrderResult.payment_method || 'Standard'}
                        {guestOrderResult.payment_status ? ` · ${guestOrderResult.payment_status.toUpperCase()}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {guestOrderResult.timeline && guestOrderResult.timeline.length > 0 && (
                  <div className="mt-6 border-t border-[#eee5dc] pt-4">
                    <h3 className="font-serif text-sm font-semibold mb-3 text-[#432e26]">Status Timeline</h3>
                    <div className="space-y-2.5">
                      {guestOrderResult.timeline.map((entry, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs text-[#79695c]">
                          <span className="h-2 w-2 rounded-full bg-[#8b634b] mt-1 shrink-0" />
                          <div className="flex-1">
                            <span className="font-medium text-[#432e26] capitalize">
                              {entry.to_status.replace(/_/g, ' ')}
                            </span>
                            {entry.notes && <span className="ml-1 text-[#79695c]">· {entry.notes}</span>}
                            <span className="block text-[11px] text-[#9b897b]">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-[#eee5dc] text-center">
                  <p className="text-xs text-[#79695c]">
                    Freshly baked by {business.name}, Bejjanki. Need help? Call{' '}
                    <a href={`tel:${business.phone}`} className="font-medium text-[#8b5943] hover:underline">
                      {business.phone}
                    </a>
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#d6c4b5] bg-[#fffdf9] p-8 sm:p-12 text-center h-full flex flex-col items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#faf6ef] border border-[#d6c3ae] mb-4 text-[#8b6244]">
                  <Icon name="truck" className="!h-7 !w-7" />
                </div>
                <h3 className="font-serif text-xl sm:text-2xl text-[#432e26]">Track Your Fresh Delivery</h3>
                <p className="my-2 max-w-sm text-xs sm:text-sm text-[#79695c] leading-relaxed">
                  {signedIn
                    ? 'Select an order from your account on the left to follow live preparation and delivery progress.'
                    : savedGuestOrders.length > 0
                    ? 'Select an order from your saved orders on the left to follow live preparation and delivery progress.'
                    : 'Enter your order number and secret guest access token to follow preparation and delivery progress in real time.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    )}

    {!isAdmin && !isKnownCustomerRoute && <main className="mx-auto max-w-[800px] px-4 sm:px-6 py-12 sm:py-20 text-center"><div className="mx-auto mb-5 sm:mb-6 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full border border-[#d8c5b2] bg-[#f8f1e7]"><Icon name="cake" className="!h-8 !w-8 sm:!h-10 sm:!w-10 text-[#8b6244]" /></div><p className="mb-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[.2em] text-[#9b6255]">Error 404</p><h1 className="font-serif text-3xl sm:text-4xl md:text-5xl">A recipe gone missing.</h1><p className="mx-auto mb-6 sm:mb-8 mt-3 sm:mt-4 max-w-md text-xs sm:text-sm leading-6 text-[#79695c]">We couldn’t find the sweet treat or page you were looking for. It might have been moved, renamed, or nibbled away!</p><div className="flex flex-col xs:flex-row flex-wrap justify-center gap-3 sm:gap-4"><button className={`${button} justify-center`} onClick={() => go('/')}>Back to Home</button><button className="min-h-11 rounded-md border border-[#b9a08e] px-6 text-xs sm:text-sm font-medium transition hover:bg-[#734738] hover:text-white justify-center" onClick={() => shop()}>Explore our bakes</button></div></main>}

    {!isAdmin && <footer className="border-t border-[#e6dbce] bg-[#f3ebdf]"><div className="mx-auto grid max-w-[1360px] gap-6 sm:gap-8 px-4 sm:px-6 py-8 sm:py-12 grid-cols-1 xs:grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1.2fr] lg:px-12"><div className="col-span-1 xs:col-span-2 md:col-span-1">{logo}<p className="mt-4 sm:mt-5 max-w-xs text-xs sm:text-sm leading-6 sm:leading-7 text-[#725e4e]">Handcrafted with love.<br />For the moments that matter.</p><a href="#/admin" className="mt-3 sm:mt-4 inline-flex min-h-10 sm:min-h-11 items-center text-xs underline underline-offset-4">Bakery team · Admin preview ↗</a></div><div><h3 className="mb-3 sm:mb-4 text-xs sm:text-sm font-medium uppercase tracking-wider text-[#6a5445]">A little exploring</h3>{['All treats', 'Birthday Cakes', 'Cupcakes', 'Wedding Cakes'].map(c => <button className="block min-h-9 sm:min-h-11 text-xs sm:text-sm text-[#725e4e] hover:text-[#432e26]" key={c} onClick={() => shop(c)}>{c}</button>)}</div><div><h3 className="mb-3 sm:mb-4 text-xs sm:text-sm font-medium uppercase tracking-wider text-[#6a5445]">Here to help</h3>{[['About Us', '/about'], ['Contact & Location', '/contact'], ['My account', '/account'], ['Track your order', '/track-order'], ['Your shopping bag', '/cart']].map(([t, p]) => <a href={`#${p}`} key={t} className="flex min-h-9 sm:min-h-11 items-center text-xs sm:text-sm text-[#725e4e] hover:text-[#432e26]">{t}</a>)}</div><div className="col-span-1 xs:col-span-2 md:col-span-1"><h3 className="mb-3 sm:mb-4 text-xs sm:text-sm font-medium uppercase tracking-wider text-[#6a5445]">Contact & Visit</h3><a href={`tel:${business.phone}`} className="flex min-h-9 sm:min-h-11 items-center text-xs sm:text-sm text-[#725e4e] font-medium hover:underline">{business.phone}</a>{business.email && <a href={`mailto:${business.email}`} className="flex min-h-9 sm:min-h-11 items-center text-xs sm:text-sm text-[#725e4e] hover:underline">{business.email}</a>}<p className="mt-1 sm:mt-2 text-xs sm:text-sm leading-relaxed text-[#725e4e]">{business.address}</p><a href={business.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#8b5943] underline underline-offset-4 hover:text-[#5e3825]">Get Directions on Google Maps ↗</a></div></div><div className="border-t border-[#e0d3c2] px-4 sm:px-5 py-4 sm:py-5 text-center text-[11px] sm:text-xs text-[#725e4e] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3"><span>© {new Date().getFullYear()} {business.name}. Made with a little extra love.</span><span className="hidden sm:inline">·</span><span>Local frontend preview · No real payments</span></div></footer>}

    {selected && <Modal title="A little closer to delicious." close={() => setSelected(null)}><div className="grid gap-4 sm:gap-6 md:grid-cols-2"><div><Photo src={selected.image} alt={selected.name} className="aspect-square w-full rounded-xl object-cover" /><div className="mt-3 flex gap-2 sm:gap-3">{[selected.image, '/images/strawberry-hero.png'].map((src, i) => <button key={i} className="overflow-hidden rounded-lg border border-[#d6c3ae]" aria-label={`View gallery image ${i + 1}`} onClick={() => setSelected({ ...selected, image: src })}><Photo src={src} alt={`Cake gallery ${i + 1}`} className="h-16 w-16 sm:h-20 sm:w-20 object-cover" /></button>)}</div></div><div><p className="text-[10px] sm:text-xs uppercase tracking-widest text-[#946346]">{selected.category} · ★ {selected.rating}</p><h3 className="my-2 sm:my-3 font-serif text-2xl sm:text-3xl">{selected.name}</h3><p className="text-xs sm:text-sm leading-6 sm:leading-7 text-[#79695c]">{selected.description}</p><p className="my-3 sm:my-5 text-xl sm:text-2xl font-semibold">{(() => { const matchingVariant = selected.variants?.find(v => v.weight_label === weight); const calculatedPrice = matchingVariant ? (matchingVariant.calculated_price ?? Math.round(selected.price * matchingVariant.price_multiplier)) : Math.round(selected.price * ({ '500g': 1, '1kg': 1.9, '1.5kg': 2.8, '2kg': 3.7 }[weight] || 1)); return money(calculatedPrice); })()}</p><div className="grid gap-3 sm:gap-4"><div className="grid grid-cols-1 xs:grid-cols-2 gap-2 sm:gap-3"><Field label="Weight"><select className={field} value={weight} onChange={e => setWeight(e.target.value)}>{(selected.variants && selected.variants.length > 0 ? selected.variants.filter(v => v.is_active).map(v => v.weight_label) : ['500g', '1kg', '1.5kg', '2kg']).map(w => <option key={w}>{w}</option>)}</select></Field><Field label="Made your way"><select value={egg} onChange={e => setEgg(e.target.value)} className={field}>{selected.is_eggless_available !== false && <option>Eggless</option>}{selected.is_with_egg_available && <option>With egg</option>}{selected.is_eggless_available === false && !selected.is_with_egg_available && <option>Eggless</option>}</select></Field></div><Field label="A message on your cake (optional)"><input maxLength={40} value={message} onChange={e => setMessage(e.target.value)} placeholder="Happy birthday, lovely!" className={field} /></Field><div className="grid grid-cols-1 xs:grid-cols-2 gap-2 sm:gap-3"><Field label="Delivery date"><input type="date" min={new Date().toLocaleDateString('en-CA')} value={date} onChange={e => setDate(e.target.value)} className={field} /></Field><Field label="Quantity"><input type="number" min={1} max={20} value={qty} onChange={e => setQty(Math.max(1, Math.min(20, Number(e.target.value))))} className={field} /></Field></div><button disabled={!selected.available} className={`${button} w-full min-h-12 justify-center text-sm sm:text-base`} onClick={() => addToCart(selected, true)}><Icon name="bag" />{selected.available ? 'Add a little happiness to your bag' : 'Currently unavailable'}</button><p className="text-[11px] sm:text-xs text-[#79695c]">Contains dairy, gluten, and may contain nuts.</p></div></div></div></Modal>}
    {editProduct && (
      <Modal
        title={isNewProduct ? 'Something new from the oven.' : 'Perfect your bake.'}
        close={() => {
          if (!isSavingProduct) {
            setEditProduct(null);
            setIsNewProduct(false);
          }
        }}
      >
        <form onSubmit={saveProduct} className="grid gap-3 sm:gap-4">
          <Field label="Product name">
            <input
              name="name"
              defaultValue={editProduct.name}
              required
              disabled={isSavingProduct}
              className={field}
              placeholder="e.g. Royal Butterscotch Crunch"
            />
          </Field>

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            <Field label="Base price (₹)">
              <input
                type="number"
                name="price"
                min="1"
                max="99999999.99"
                step="any"
                required
                disabled={isSavingProduct}
                defaultValue={editProduct.price}
                className={field}
              />
            </Field>

            <Field label="Category">
              <select
                name="category"
                defaultValue={editProduct.category}
                disabled={isSavingProduct}
                className={field}
              >
                {categoriesList.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {isNewProduct && (
            <Field label="Variant Weight/Packaging Template">
              <select
                value={productVariantTemplate}
                onChange={e => setProductVariantTemplate(e.target.value as VariantTemplateKey)}
                disabled={isSavingProduct}
                className={field}
              >
                <option value="cake">Cake (500g, 1kg, 1.5kg, 2kg)</option>
                <option value="cupcake_box">Cupcake Box (Box of 6)</option>
                <option value="cookie_pack">Cookie Pack (Pack of 6)</option>
                <option value="assorted_box">Assorted Box (Assorted Box)</option>
                <option value="standard">Standard (Standard)</option>
              </select>
            </Field>
          )}

          <Field label="Description">
            <textarea
              name="description"
              required
              disabled={isSavingProduct}
              defaultValue={editProduct.description}
              className={field}
              rows={3}
              placeholder="Describe the flavors, texture, and handcrafted ingredients..."
            />
          </Field>

          {/* Product Image Preview & Controls */}
          <div className="rounded-xl border border-[#e7ddd2] bg-[#faf6ef] p-3 sm:p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#796353]">Product Image Preview</p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-lg border border-[#dfd2c4] bg-white shrink-0 shadow-xs">
                {editProduct.image ? (
                  <Photo
                    src={editProduct.image}
                    alt={editProduct.name || 'Product preview'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#f4ebde] text-[#a0745f]">
                    <Icon name="cake" className="!h-10 !w-10 opacity-70" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
                <p className="text-xs sm:text-sm font-medium text-[#443026] truncate">
                  {editProduct.image ? 'Image connected' : 'No image connected'}
                </p>
                <p className="text-[11px] sm:text-xs text-[#79695c] break-all line-clamp-2">
                  {editProduct.image || 'Upload an image from your device or paste a valid web URL below.'}
                </p>
                {isUploadingImage && (
                  <p className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-[#8b5943]">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#8b5943] border-t-transparent" />
                    Uploading to Supabase Storage...
                  </p>
                )}
              </div>
            </div>
          </div>

          <Field label="Upload Image from Device (JPEG, PNG, WebP, AVIF up to 5 MB)">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={isSavingProduct || isUploadingImage}
              className={`${field} file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#8b5943] file:text-white hover:file:bg-[#734738] file:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;

                if (isUploadingImage) return;

                const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
                if (!allowedTypes.includes(file.type.toLowerCase())) {
                  notify('Unsupported image type. Please select a JPEG, PNG, WebP, or AVIF image.');
                  e.target.value = '';
                  return;
                }

                if (file.size > 5 * 1024 * 1024) {
                  notify('Image file exceeds the 5 MB limit. Please select a smaller image.');
                  e.target.value = '';
                  return;
                }

                setIsUploadingImage(true);
                notify('Uploading image to Supabase Storage...');

                try {
                  const { publicUrl, error } = await uploadProductImage(file);
                  if (error || !publicUrl) {
                    notify(`Image upload failed: ${error?.message || 'Unknown error'}`);
                    return;
                  }

                  // Update editProduct image state immediately to display preview and set URL
                  setEditProduct(prev => (prev ? { ...prev, image: publicUrl } : prev));
                  notify('Image successfully uploaded and connected!');
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Upload failed.';
                  notify(`Error: ${msg}`);
                } finally {
                  setIsUploadingImage(false);
                  e.target.value = '';
                }
              }}
            />
          </Field>

          <Field label="Or Image URL (HTTP/HTTPS)">
            <input
              name="image"
              value={editProduct.image}
              onChange={e => setEditProduct({ ...editProduct, image: e.target.value })}
              disabled={isSavingProduct || isUploadingImage}
              className={field}
              placeholder="https://images.unsplash.com/... or Supabase Storage URL"
            />
          </Field>

          <div className="flex flex-wrap gap-4 sm:gap-6">
            {['available', 'bestseller'].map(k => (
              <label key={k} className="flex min-h-10 sm:min-h-11 items-center gap-2 text-xs sm:text-sm capitalize cursor-pointer">
                <input
                  type="checkbox"
                  name={k}
                  disabled={isSavingProduct}
                  defaultChecked={editProduct[k as 'available' | 'bestseller']}
                  className="accent-[#734738]"
                />
                {k}
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={isSavingProduct}
            className={`${button} justify-center min-h-12 w-full xs:w-auto disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSavingProduct ? 'Saving to bake collection...' : isNewProduct ? 'Add to the bake collection' : 'Save changes to bake'}
          </button>
        </form>
      </Modal>
    )}
    {editCategory && (
      <Modal
        title={isNewCategory ? 'Create a new collection.' : `Edit "${editCategory.name || 'collection'}"`}
        close={() => {
          if (!isSavingCategory && !isUploadingCategoryImage) {
            setEditCategory(null);
            setIsNewCategory(false);
          }
        }}
      >
        <form onSubmit={saveCategory} className="grid gap-3 sm:gap-4">
          <Field label="Category name *">
            <input
              name="name"
              defaultValue={editCategory.name}
              required
              maxLength={100}
              disabled={isSavingCategory}
              className={field}
              placeholder="e.g. Traditional Sweets, Festive Hampers"
            />
          </Field>

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            <Field label="Display Order (number)">
              <input
                type="number"
                name="display_order"
                defaultValue={editCategory.display_order ?? 0}
                disabled={isSavingCategory}
                className={field}
                placeholder="0"
              />
            </Field>

            <Field label="Storefront Visibility">
              <label className="flex min-h-11 items-center gap-2.5 text-xs sm:text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={editCategory.is_active}
                  disabled={isSavingCategory}
                  className="accent-[#734738] h-4 w-4"
                />
                <span className="font-medium text-[#432e26]">Visible on customer storefront</span>
              </label>
            </Field>
          </div>

          <Field label="Description (optional)">
            <textarea
              name="description"
              defaultValue={editCategory.description || ''}
              disabled={isSavingCategory}
              className={field}
              rows={3}
              placeholder="Describe the sweet occasions and handcrafted specialties in this collection..."
            />
          </Field>

          {/* Category Image Preview & Controls */}
          <div className="rounded-xl border border-[#e7ddd2] bg-[#faf6ef] p-3 sm:p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#796353]">Collection Image</p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-lg border border-[#dfd2c4] bg-white shrink-0 shadow-xs">
                {editCategory.image_url ? (
                  <Photo
                    src={editCategory.image_url}
                    alt={editCategory.name || 'Category preview'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#f4ebde] text-[#a0745f]">
                    <Icon name="cake" className="!h-8 !w-8 opacity-70" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
                <p className="text-xs sm:text-sm font-medium text-[#432e26] truncate">
                  {editCategory.image_url ? 'Image connected' : 'No image connected'}
                </p>
                <p className="text-[11px] sm:text-xs text-[#79695c] break-all line-clamp-2">
                  {editCategory.image_url || 'Upload an image from your device or paste a valid web URL below.'}
                </p>
                {isUploadingCategoryImage && (
                  <p className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-[#8b5943]">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#8b5943] border-t-transparent" />
                    Uploading to Supabase Storage...
                  </p>
                )}
              </div>
            </div>
          </div>

          <Field label="Upload Image from Device (JPEG, PNG, WebP, AVIF up to 5 MB)">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={isSavingCategory || isUploadingCategoryImage}
              className={`${field} file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#8b5943] file:text-white hover:file:bg-[#734738] file:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (isUploadingCategoryImage) return;

                const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
                if (!allowedTypes.includes(file.type.toLowerCase())) {
                  notify('Unsupported image type. Please select a JPEG, PNG, WebP, or AVIF image.');
                  e.target.value = '';
                  return;
                }

                if (file.size > 5 * 1024 * 1024) {
                  notify('Image file exceeds the 5 MB limit. Please select a smaller image.');
                  e.target.value = '';
                  return;
                }

                setIsUploadingCategoryImage(true);
                notify('Uploading category image to Supabase Storage...');

                try {
                  const { publicUrl, error } = await uploadProductImage(file);
                  if (error || !publicUrl) {
                    notify(`Image upload failed: ${error?.message || 'Unknown error'}`);
                    return;
                  }
                  setEditCategory(prev => (prev ? { ...prev, image_url: publicUrl } : prev));
                  notify('Category image uploaded and connected!');
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Upload failed.';
                  notify(`Error: ${msg}`);
                } finally {
                  setIsUploadingCategoryImage(false);
                  e.target.value = '';
                }
              }}
            />
          </Field>

          <Field label="Or Image URL (HTTP/HTTPS)">
            <input
              name="image_url"
              value={editCategory.image_url || ''}
              onChange={e => setEditCategory({ ...editCategory, image_url: e.target.value })}
              disabled={isSavingCategory || isUploadingCategoryImage}
              className={field}
              placeholder="https://images.unsplash.com/... or Supabase Storage URL"
            />
          </Field>

          <button
            type="submit"
            disabled={isSavingCategory || isUploadingCategoryImage}
            className={`${button} justify-center min-h-12 w-full xs:w-auto disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSavingCategory
              ? 'Saving collection...'
              : isNewCategory
              ? 'Create collection'
              : 'Save collection changes'}
          </button>
        </form>
      </Modal>
    )}
    {detail && <Modal title={`Order #${detail.id}`} close={() => setDetail(null)}><p className="mb-4 sm:mb-6 text-xs sm:text-sm text-[#79695c]">Placed {new Date(detail.createdAt).toLocaleString()} · {detail.payment}{detail.paymentStatus ? ` · Payment: ${detail.paymentStatus.toUpperCase()}` : ''}</p><div className="mb-6 sm:mb-7 grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">{steps.map((s, i) => <div key={s} className="text-center"><div className={`mx-auto mb-1.5 sm:mb-2 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border ${detail.status >= i ? 'border-[#8b634b] bg-[#8b634b] text-white' : 'border-[#d7cbbb] text-[#79695c]'}`}>{detail.status >= i ? <Icon name="check" className="!h-3.5 !w-3.5 sm:!h-4 sm:!w-4" /> : <span className="text-[10px] sm:text-xs">{i + 1}</span>}</div><p className="px-0.5 text-[10px] sm:text-xs truncate">{s}</p></div>)}</div>{detail.status === -1 && <p className="mb-4 sm:mb-5 rounded bg-red-50 p-3 text-xs sm:text-sm text-red-800">This order was rejected or cancelled. Please contact the bakery for help.</p>}<div className="space-y-2.5 sm:space-y-3">{detail.items.map(p => <div key={p.key} className="flex flex-col xs:flex-row items-start xs:items-center gap-2.5 sm:gap-4 rounded-lg bg-[#f7f1e8] p-2.5 sm:p-3"><Photo src={p.image} alt={p.name} className="h-14 w-14 sm:h-16 sm:w-16 rounded object-cover shrink-0" /><div className="flex-1 min-w-0"><p className="text-xs sm:text-sm font-medium truncate">{p.qty} × {p.name}</p><p className="mt-0.5 text-[11px] sm:text-xs text-[#79695c]">{p.weight} · {p.egg}{p.message && ` · “${p.message}”`}</p></div><span className="text-xs sm:text-sm font-semibold shrink-0">{money(p.unitPrice * p.qty)}</span></div>)}</div><div className="my-4 sm:my-5 grid gap-3 sm:gap-4 rounded-lg border border-[#e7ddd2] p-3 sm:p-4 text-xs sm:text-sm md:grid-cols-2"><div><p className="mb-1.5 sm:mb-2 font-semibold">Delivering a little happiness to</p><p className="leading-relaxed text-[#79695c]">{detail.customer}<br />{detail.phone}<br />{detail.address}</p></div><div><p className="mb-1.5 sm:mb-2 font-semibold">The perfect moment</p><p className="leading-relaxed text-[#79695c]">{detail.date}<br />{detail.time}<br />{detail.instructions || 'No special instructions'}</p></div></div>{detail.timeline && detail.timeline.length > 0 && <div className="my-4 rounded-lg border border-[#eee5dc] bg-[#faf6ef] p-3 sm:p-4 text-xs sm:text-sm"><p className="mb-2 font-semibold text-[#432e26]">Status Timeline</p><div className="space-y-2">{detail.timeline.map((entry, idx) => <div key={idx} className="flex items-start gap-2 text-xs text-[#79695c]"><span className="h-2 w-2 rounded-full bg-[#8b634b] mt-1 shrink-0" /><div className="flex-1"><span className="font-medium text-[#432e26] capitalize">{entry.status.replace(/_/g, ' ')}</span>{entry.notes && <span className="ml-1 text-[#79695c]">· {entry.notes}</span>}<span className="block text-[11px] text-[#9b897b]">{new Date(entry.created_at).toLocaleString()}</span></div></div>)}</div></div>}<div className="mb-4 sm:mb-5 border-t border-[#eee5dc] pt-3 text-xs sm:text-sm space-y-1">{detail.subtotal !== undefined && <div className="flex justify-between text-[#79695c]"><span>Subtotal</span><span>{money(detail.subtotal)}</span></div>}{detail.deliveryFee !== undefined && <div className="flex justify-between text-[#79695c]"><span>Delivery fee</span><span>{detail.deliveryFee === 0 ? 'FREE' : money(detail.deliveryFee)}</span></div>}{detail.discount ? <div className="flex justify-between text-[#8b5943]"><span>Discount</span><span>-{money(detail.discount)}</span></div> : null}<div className="flex justify-between text-base sm:text-lg font-semibold pt-1 border-t border-[#eee5dc]"><span>Total paid / payable</span><span>{money(detail.total)}</span></div></div>{isAdmin ? <div className="flex flex-col xs:flex-row flex-wrap gap-2 sm:gap-3">{detail.status >= 0 && detail.status < 5 && <button disabled={updatingOrderId === detail.id} className={`${button} justify-center w-full xs:w-auto flex-1 disabled:opacity-50 disabled:cursor-not-allowed`} onClick={() => updateStatus(detail.id, detail.status + 1)}>{updatingOrderId === detail.id ? 'Updating status...' : ['Accept order', 'Mark preparing', 'Mark ready for pickup', 'Mark out for delivery', 'Mark delivered'][detail.status]}</button>}{detail.status === 0 && <button disabled={updatingOrderId === detail.id} className="min-h-11 rounded-md border border-red-200 px-5 text-xs sm:text-sm text-red-800 hover:bg-red-50 justify-center w-full xs:w-auto disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => updateStatus(detail.id, -1)}>Reject order</button>}</div> : <button className={`${button} justify-center w-full`} onClick={() => { setCart(old => [...old, ...detail.items.map((p, i) => ({ ...p, key: `${Date.now()}-${i}`, date: '' }))]); setDetail(null); go('/cart'); notify('Your favourite treats are back in your bag.'); }}>Reorder these treats</button>}</Modal>}
    {newOrderAlert && (
      <div
        role="alert"
        className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[75] flex w-[calc(100%-32px)] max-w-md items-center justify-between gap-3 rounded-xl border-2 border-[#8b634b] bg-[#fffaf0] p-4 shadow-2xl transition-all animate-in slide-in-from-top-3 duration-300"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4ebde] text-[#8b634b]">
            <Icon name="bell" className="!w-5 !h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[#8b634b]">New Order Received!</p>
            <p className="text-sm sm:text-base font-bold text-[#3b271d] truncate">
              #{newOrderAlert.orderNumber} · {money(newOrderAlert.amount)}
            </p>
            <p className="text-xs text-[#79695c] truncate">From {newOrderAlert.customer}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              const target = adminOrders.find(o => o.id === newOrderAlert.orderNumber);
              if (target) {
                setDetail(target);
              }
              if (path !== '/admin/orders') {
                go('/admin/orders');
              }
              setNewOrderAlert(null);
            }}
            className="rounded-lg bg-[#8b634b] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#734738] transition"
          >
            Manage
          </button>
          <button
            type="button"
            onClick={() => setNewOrderAlert(null)}
            className="flex min-h-8 min-w-8 items-center justify-center rounded-full text-[#9b897b] hover:bg-[#f4ebde] hover:text-[#423126]"
            aria-label="Dismiss alert"
          >
            <Icon name="close" className="!w-4 !h-4" />
          </button>
        </div>
      </div>
    )}
    {toast && <div role="status" className="fixed bottom-4 sm:bottom-6 left-1/2 z-[70] flex w-[calc(100%-24px)] max-w-lg -translate-x-1/2 items-center gap-2.5 sm:gap-3 rounded-xl border border-[#d6bf9f] bg-[#fffaf0] px-3.5 py-3 sm:px-5 sm:py-4 text-xs sm:text-sm shadow-xl"><Icon name="check" className="text-[#6b7746] shrink-0" /><span className="flex-1">{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')} className="flex min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center rounded-full hover:bg-stone-100 shrink-0"><Icon name="close" /></button></div>}
  </div>;
}

function SalesChart({ orders, range }: { orders: Order[]; range: string }) {
  const now = new Date();
  const count = range === 'Daily' ? 6 : range === 'Monthly' ? 6 : 7;
  const values = Array.from({ length: count }, (_, i) => {
    const d = new Date(now); if (range === 'Monthly') { d.setDate(1); d.setMonth(d.getMonth() - (count - 1 - i)); } else if (range === 'Daily') d.setHours(i * 4, 0, 0, 0); else d.setDate(d.getDate() - (count - 1 - i));
    const amount = orders.filter(o => { const od = new Date(o.createdAt); return o.status !== -1 && (range === 'Monthly' ? od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear() : range === 'Daily' ? od.toDateString() === now.toDateString() && Math.floor(od.getHours() / 4) === i : od.toDateString() === d.toDateString()); }).reduce((s, o) => s + o.total, 0);
    return { amount, label: range === 'Monthly' ? d.toLocaleDateString('en', { month: 'short' }) : range === 'Daily' ? `${i * 4}:00` : d.toLocaleDateString('en', { weekday: 'short' }) };
  });
  const max = Math.max(100, ...values.map(v => v.amount));
  return <div className="mt-7" role="img" aria-label={`${range} sales: ${values.map(v => `${v.label} ${money(v.amount)}`).join(', ')}`}><div className="flex h-52 items-end gap-3 border-b border-[#decebc] md:gap-5">{values.map((v, i) => <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-xs text-[#79695c]">{v.amount >= 1000 ? `${(v.amount / 1000).toFixed(1)}k` : v.amount}</span><div className={`w-full max-w-12 rounded-t-md ${i === values.length - 1 ? 'bg-[#80543e]' : 'bg-[#dbc2a7]'}`} style={{ height: `${Math.max(2, v.amount / max * 78)}%` }} /></div>)}</div><div className="mt-3 flex gap-3 md:gap-5">{values.map((v, i) => <span key={i} className="min-w-0 flex-1 text-center text-xs text-[#79695c]">{v.label}</span>)}</div></div>;
}
