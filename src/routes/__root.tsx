import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import { PlatformProvider } from "@/lib/platform";
import { InstallApp } from "@/components/InstallApp";
import { OfflineStatus } from "@/components/OfflineStatus";
import { SubscriptionAccess } from "@/components/SubscriptionAccess";
import { registerAppServiceWorker } from "@/lib/pwa";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-[420px] text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-[420px] text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SmartCanteen — Canteen Financial System" },
      {
        name: "description",
        content:
          "From opening term capital to term-end profit: one connected cash book for school canteen operators.",
      },
      { property: "og:title", content: "SmartCanteen" },
      { property: "og:description", content: "Tell the system what happened, and let it do the arithmetic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#2f6b46" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "SmartCanteen" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/app-icon-192.png" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Critical styles + a branded splash so the very first paint is never the
 * half-styled, overlapping layout people saw while the web fonts loaded.
 */
const criticalCss = `
  html { background: #f5f1e6; -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: #f5f1e6; overflow-x: hidden;
    font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif; }
  #app-splash { position: fixed; inset: 0; z-index: 9999; display: flex;
    align-items: center; justify-content: center; flex-direction: column; gap: 14px;
    background: #2f6b46; color: #fff; transition: opacity .3s ease; }
  #app-splash p { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: .12em;
    text-transform: uppercase; opacity: .8; }
  #app-splash span { width: 34px; height: 34px; border-radius: 999px;
    border: 3px solid rgba(255,255,255,.3); border-top-color: #fff;
    animation: sc-spin .8s linear infinite; }
  @keyframes sc-spin { to { transform: rotate(360deg); } }
  #app-splash.is-ready { opacity: 0; pointer-events: none; visibility: hidden; }
  /* Safety net: never trap anyone behind the splash if scripts are slow. */
  @keyframes sc-splash-out { to { opacity: 0; visibility: hidden; } }
  #app-splash { animation: sc-splash-out .3s ease 5s forwards; }
`;

function RootShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  // Hide the splash once the web fonts are in, so the first thing people see
  // is the finished layout rather than a jumbled one.
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(finish);
    }
    const t = setTimeout(finish, 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
      </head>
      <body>
        <div id="app-splash" className={ready ? "is-ready" : ""} aria-hidden="true">
          <span />
          <p>SmartCanteen</p>
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    registerAppServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlatformProvider>
        <StoreProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <SubscriptionAccess><Outlet /></SubscriptionAccess>
          <OfflineStatus />
          <InstallApp />
        </StoreProvider>
        </PlatformProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

