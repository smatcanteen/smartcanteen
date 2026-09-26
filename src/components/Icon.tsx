/** Material Symbols glyph. Name must stay lowercase_with_underscores for ligatures. */
export function Icon({ name, className = "" }: { name: string; className?: string }) {
  // Parent buttons/labels sometimes set uppercase + tracking — never inherit those.
  return (
    <span
      aria-hidden
      className={`material-symbols-outlined ${className}`}
      style={{
        textTransform: "none",
        letterSpacing: "normal",
        fontWeight: 400,
      }}
    >
      {name}
    </span>
  );
}
