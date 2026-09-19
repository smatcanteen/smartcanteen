/**
 * Service-worker registration wrapper.
 *
 * SmartCanteen has to keep working when the network drops in a school, so the
 * published app caches its shell. Editor previews, iframes and dev never
 * register a worker — a stale cached shell there would hide fresh changes.
 */

const BLOCKED_HOSTS = [
  "lovableproject.com",
  "lovableproject-dev.com",
  "beta.lovable.dev",
];

function refused() {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  if (new URL(window.location.href).searchParams.has("sw")) {
    return new URL(window.location.href).searchParams.get("sw") === "off";
  }
  return false;
}

async function unregisterAppWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => /\/(?:sw|service-worker)\.js$/.test(r.active?.scriptURL ?? r.installing?.scriptURL ?? ""))
      .map((r) => r.unregister()),
  );
}

/** Call once, after hydration. */
export function registerAppServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (refused()) {
    void unregisterAppWorker();
    return;
  }
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {
      /* offline support is a bonus, never a blocker */
    });
  });
}
