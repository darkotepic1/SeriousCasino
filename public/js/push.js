// Push-Benachrichtigungen im Browser an- und abmelden.
import { get, post } from './api.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration('./')) || navigator.serviceWorker.register('sw.js', { scope: './' });
}

/** Aktueller Zustand: 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' */
export async function pushStatus() {
  if (!pushSupported()) return isIOS() && !standalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush() {
  const k = await get('/api/push/key');
  if (!k.available) throw new Error('Push ist auf diesem Server nicht verfügbar.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey) {
    // Server-Schlüssel geändert? Dann neu abonnieren
    const cur = new Uint8Array(sub.options.applicationServerKey);
    const want = keyBytes(k.publicKey);
    if (cur.length !== want.length || cur.some((b, i) => b !== want[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.publicKey) });
  await post('/api/push/subscribe', { subscription: sub.toJSON() });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/** Nach dem Anmelden: bestehendes Abo dem (evtl. neuen) Profil zuordnen */
export async function resyncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration('./');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await post('/api/push/subscribe', { subscription: sub.toJSON() });
  } catch { /* egal */ }
}
