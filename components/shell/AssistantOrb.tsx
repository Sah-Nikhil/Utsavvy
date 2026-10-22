import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/*
 * The Assistant, drawn as a soft circular gradient (after Google's Gemini visual
 * design, IMPLEMENTATION_PLAN.md section 7.4). Its colours come from the Event's
 * Theme, so every Event's Assistant looks a little different. While it thinks or
 * streams, colour drifts inside the circle ("inner activity"); at idle it settles
 * and stops. Hues close to marigold are dropped so the pointing ring stays the
 * only marigold on screen. With reduced motion it is a still gradient.
 */

export type AssistantOrbState = "idle" | "thinking" | "streaming";

export type AssistantOrbProps = {
  /** Theme colours as hex strings from data. May be empty. */
  palette: string[];
  state?: AssistantOrbState;
  /** Diameter in px. */
  size?: number;
  /** Accessible name. Without one the orb is decorative and hidden from screen readers. */
  label?: string;
  className?: string;
};

// Used when the Theme gives fewer than three usable colours.
const FALLBACK = [
  "color-mix(in oklab, var(--action) 72%, var(--surface))",
  "color-mix(in oklab, var(--quote) 55%, var(--surface))",
  "color-mix(in oklab, var(--avatar-1) 50%, var(--surface))",
  "color-mix(in oklab, var(--avatar-2) 60%, var(--surface))",
];

type Hsl = { h: number; s: number; l: number };

function parseHex(value: string): Hsl | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match?.[1]) return null;
  let hex = match[1];
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** True for colours a person would read as marigold, saffron or amber. */
function isNearMarigold({ h, s, l }: Hsl) {
  return h >= 25 && h <= 52 && s >= 0.35 && l >= 0.25 && l <= 0.82;
}

/** Keeps the Theme's usable hues, in order, and pads with token colours. */
export function orbColours(palette: string[]): string[] {
  const kept: string[] = [];
  for (const raw of palette) {
    const hsl = parseHex(raw);
    if (!hsl || isNearMarigold(hsl)) continue;
    // Near-black and near-white make the gradient muddy or invisible.
    if (hsl.l < 0.12 || hsl.l > 0.94) continue;
    kept.push(raw.startsWith("#") ? raw : `#${raw}`);
  }
  for (const token of FALLBACK) {
    if (kept.length >= 3) break;
    kept.push(token);
  }
  return kept.slice(0, 4);
}

export function AssistantOrb({
  palette,
  state = "idle",
  size = 32,
  label,
  className,
}: AssistantOrbProps) {
  const [c1, c2, c3, c4 = c1] = orbColours(palette) as [
    string,
    string,
    string,
    string?,
  ];
  const blur = Math.max(2, Math.round(size * 0.14));

  const blob = (
    colour: string,
    x: string,
    y: string,
    scale: number,
  ): CSSProperties => ({
    position: "absolute",
    left: x,
    top: y,
    width: `${scale * 100}%`,
    height: `${scale * 100}%`,
    borderRadius: "9999px",
    background: `radial-gradient(circle, ${colour} 0%, ${colour} 30%, transparent 70%)`,
    translate: "-50% -50%",
  });

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-state={state}
      className={cn(
        "group/orb relative inline-block shrink-0 overflow-hidden rounded-full",
        "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.35)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, ${c1}, ${c2} 55%, ${c3})`,
      }}
    >
      {/* Inner activity: two layers turning at different speeds and directions.
          Streaming adds a slow swell on top, so a reply in progress feels alive. */}
      <span
        className={cn(
          "absolute inset-0",
          "group-data-[state=streaming]/orb:animate-[orb-breathe_1.8s_var(--ease-standard)_infinite]",
        )}
      >
        <span
          className="absolute inset-0 animate-orb-drift group-data-[state=idle]/orb:[animation-play-state:paused]"
          style={{ filter: `blur(${blur}px)` }}
        >
          <span style={blob(c3, "28%", "30%", 0.8)} />
          <span style={blob(c4, "74%", "68%", 0.75)} />
        </span>
        <span
          className="absolute inset-0 animate-orb-drift group-data-[state=idle]/orb:[animation-play-state:paused]"
          style={{
            filter: `blur(${blur}px)`,
            animationDuration: "4.6s",
            animationDirection: "reverse",
          }}
        >
          <span style={blob(c2, "70%", "26%", 0.7)} />
          <span style={blob(c1, "30%", "76%", 0.65)} />
        </span>
      </span>
      {/* A soft light from the upper left gives the orb its roundness */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.32), rgb(255 255 255 / 0) 58%)",
        }}
      />
    </span>
  );
}
