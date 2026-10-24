"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/*
 * The Assistant, drawn as a soft circular gradient (after Google's Gemini visual
 * design, IMPLEMENTATION_PLAN.md section 7.4). Its colours come from the Event's
 * Theme, so every Event's Assistant looks a little different; without a Theme it
 * wears the brand palette (`--orb-1` to `--orb-4` in app/globals.css).
 *
 * While it thinks or streams, colour moves inside the circle ("inner activity"):
 * a conic field turns, two soft lights wander, and the whole orb breathes, more
 * slowly while thinking than while streaming. When the run ends it settles: the
 * motion stops and one soft glow fades out around it. Hues close to marigold are
 * dropped, so the pointing ring stays the only marigold on screen. With reduced
 * motion it is a still gradient.
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
  "var(--orb-1)",
  "var(--orb-2)",
  "var(--orb-3)",
  "var(--orb-4)",
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

/** Keeps the Theme's usable hues, in order, and pads with the brand palette. */
export function orbColours(palette: string[]): string[] {
  const kept: string[] = [];
  for (const raw of palette) {
    const hsl = parseHex(raw);
    if (!hsl || isNearMarigold(hsl)) continue;
    // Near-black, near-white and grey make the gradient muddy or invisible.
    if (hsl.l < 0.12 || hsl.l > 0.94 || hsl.s < 0.12) continue;
    kept.push(raw.startsWith("#") ? raw : `#${raw}`);
  }
  for (const token of FALLBACK) {
    if (kept.length >= 3) break;
    if (!kept.includes(token)) kept.push(token);
  }
  return kept.slice(0, 4);
}

/**
 * True for a moment after the orb goes from working to idle, so the settle
 * glow plays once when a reply finishes (and never on first render).
 */
function useSettling(active: boolean) {
  const [settling, setSettling] = useState(false);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) {
      setSettling(true);
      const timer = setTimeout(() => setSettling(false), 900);
      wasActive.current = active;
      return () => clearTimeout(timer);
    }
    wasActive.current = active;
  }, [active]);
  return settling;
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
  const active = state !== "idle";
  const settling = useSettling(active);
  const blur = Math.max(2, Math.round(size * 0.16));

  const light = (colour: string, x: string, y: string): CSSProperties => ({
    position: "absolute",
    left: x,
    top: y,
    width: "70%",
    height: "70%",
    borderRadius: "9999px",
    background: `radial-gradient(circle, ${colour} 0%, transparent 68%)`,
    translate: "-50% -50%",
  });

  // Layers pause rather than stop at idle, so the orb keeps the colours it
  // settled on instead of snapping back to its starting position.
  const run =
    "motion-reduce:animate-none group-data-[state=idle]/orb:[animation-play-state:paused]";

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-state={state}
      className={cn("group/orb relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* A soft halo of the same colours while working, and once on settling. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-(--dur-arrival) ease-standard",
          "group-data-[state=streaming]/orb:opacity-45 group-data-[state=thinking]/orb:opacity-30",
        )}
        style={{
          background: `conic-gradient(from 90deg, ${c1}, ${c2}, ${c3}, ${c4}, ${c1})`,
          filter: `blur(${Math.max(4, Math.round(size * 0.28))}px)`,
          scale: "1.15",
        }}
      />
      {settling ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-[orb-settle_0.9s_var(--ease-emphasized)_forwards] rounded-full motion-reduce:hidden"
          style={{
            background: `conic-gradient(from 200deg, ${c1}, ${c3}, ${c2}, ${c1})`,
            filter: `blur(${Math.max(3, Math.round(size * 0.2))}px)`,
          }}
        />
      ) : null}
      <span
        className={cn(
          "absolute inset-0 overflow-hidden rounded-full",
          "shadow-[inset_0_0_0_1px_var(--orb-rim)]",
          "group-data-[state=streaming]/orb:animate-[orb-breathe_2.2s_var(--ease-standard)_infinite]",
          "group-data-[state=thinking]/orb:animate-[orb-breathe_3.4s_var(--ease-standard)_infinite]",
          "motion-reduce:animate-none",
        )}
        style={{
          background: `linear-gradient(140deg, ${c1}, ${c2} 55%, ${c3})`,
        }}
      >
        {/* Inner activity: a turning conic field under two wandering lights. */}
        <span
          className={cn(
            "absolute -inset-1/4 animate-orb-drift group-data-[state=thinking]/orb:[animation-duration:11s] group-data-[state=streaming]/orb:[animation-duration:5s]",
            run,
          )}
          style={{
            background: `conic-gradient(from 0deg, ${c1}, ${c2}, ${c3}, ${c4}, ${c1})`,
            filter: `blur(${blur}px)`,
            opacity: 0.85,
          }}
        />
        <span
          className={cn(
            "absolute inset-0 animate-[orb-wander_6s_var(--ease-standard)_infinite] group-data-[state=streaming]/orb:[animation-duration:3.2s]",
            run,
          )}
          style={{ filter: `blur(${blur}px)` }}
        >
          <span style={light(c4, "30%", "30%")} />
          <span style={light(c2, "72%", "70%")} />
        </span>
        {/* A soft light from the upper left gives the orb its roundness. */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 26%, var(--orb-sheen), transparent 56%)",
          }}
        />
      </span>
    </span>
  );
}
