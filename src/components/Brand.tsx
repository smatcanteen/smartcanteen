import { useCallback, useEffect, useState } from "react";
import markLight from "@/assets/mark-light.png";
// mark-dark.png was ~158KB; the light mark is ~29KB and works on green with a white disc.




/**
 * One brand framework for every surface: operator app, admin console and agent
 * dashboard all use the same mark, lockup and account placeholder.
 */

type Size = "sm" | "md" | "lg";

const box: Record<Size, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

/** The circular SmartCanteen mark, always inside a clean padded disc. */
export function BrandMark({
  size = "md",
  variant = "light",
  className = "",
}: {
  size?: Size;
  /** light = on cream surfaces, dark = on the green band or photos. */
  variant?: "light" | "dark";
  className?: string;
}) {
  const dark = variant === "dark";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${
        dark ? "bg-white" : "bg-transparent"
      } ${box[size]} ${className}`}
    >
      <img
        src={markLight}
        alt=""
        aria-hidden
        className="h-full w-full object-contain p-0.5"
        width={56}
        height={56}
        decoding="async"
      />
    </span>
  );
}



/** Mark + wordmark + optional context line (role, canteen, territory). */
export function BrandLock({
  variant = "light",
  context,
  title = "SmartCanteen",
  size = "md",
  tagline = false,
}: {
  variant?: "light" | "dark";
  context?: string;
  title?: string;
  size?: Size;
  tagline?: boolean;
}) {
  const dark = variant === "dark";
  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <BrandMark size={size} variant={variant} />
      <div className="min-w-0 leading-tight">
        <p
          className={`truncate font-display font-bold ${size === "lg" ? "text-xl" : "text-base"} ${
            dark ? "text-on-primary" : "text-on-surface"
          }`}
        >
          {title}
        </p>
        {tagline ? (
          <p
            className={`truncate text-[9px] font-semibold uppercase tracking-[0.14em] sm:text-[10px] ${
              dark ? "text-on-primary/70" : "text-on-surface-variant"
            }`}
          >
            The smarter way to run your canteen
          </p>
        ) : null}
        {context ? (
          <p className={`truncate text-[11px] ${dark ? "text-on-primary/75" : "text-on-surface-variant"}`}>
            {context}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "SC";

/** Account logo placeholder — uploaded canteen logo, or clean initials disc. */
export function AccountAvatar({
  name,
  logo,
  size = "md",
  variant = "light",
  className = "",
}: {
  name: string;
  logo?: string | null;
  size?: Size;
  variant?: "light" | "dark";
  className?: string;
}) {
  const dark = variant === "dark";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-sm font-bold ${
        dark
          ? "bg-on-primary/15 text-on-primary ring-1 ring-on-primary/25"
          : "bg-primary/10 text-primary ring-1 ring-outline-variant/60"
      } ${box[size]} ${className}`}
      aria-hidden={!logo}
    >
      {logo ? <img src={logo} alt={`${name} logo`} className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

const logoKey = (id: string) => `smartcanteen.logo.${id}`;

/** Per-account logo placeholder stored on the device. */
export function useAccountLogo(accountId?: string) {
  const [logo, setLogoState] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return setLogoState(null);
    try {
      setLogoState(localStorage.getItem(logoKey(accountId)));
    } catch {
      setLogoState(null);
    }
  }, [accountId]);

  const setLogo = useCallback(
    (dataUrl: string | null) => {
      if (!accountId) return;
      try {
        if (dataUrl) localStorage.setItem(logoKey(accountId), dataUrl);
        else localStorage.removeItem(logoKey(accountId));
      } catch {
        /* storage full — keep the in-memory value */
      }
      setLogoState(dataUrl);
    },
    [accountId],
  );

  return { logo, setLogo };
}
