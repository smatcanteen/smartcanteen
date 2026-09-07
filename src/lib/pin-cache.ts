/**
 * Offline PIN unlock.
 *
 * After a successful online sign-in we keep a scrambled copy of the PIN on the
 * phone itself. If the operator opens the app with no network, we can still
 * check the PIN against that copy and let them keep working — their session is
 * already stored on the device, and everything they record syncs later.
 */
const KEY = "smartcanteen.pin.cache";

type Cached = { phone: string; hash: string; userId: string; savedAt: number };

async function digest(phone: string, pin: string) {
  const data = new TextEncoder().encode(`smartcanteen:${phone}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function rememberPin(phone: string, pin: string, userId: string) {
  try {
    const entry: Cached = { phone, hash: await digest(phone, pin), userId, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    /* private browsing — offline unlock simply will not be available */
  }
}

export async function checkCachedPin(phone: string, pin: string) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const entry = JSON.parse(raw) as Cached;
    if (entry.phone !== phone) return false;
    return entry.hash === (await digest(phone, pin));
  } catch {
    return false;
  }
}

export function forgetPin() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
