"use client";

/**
 * HeroHeadline — replaces the old colored "I show my work" mural.
 * Henry-style: single dramatic display headline in Space Grotesk
 * weight 300 at ~96px, with one word accented in warm Bone color.
 * No colored blobs, no SVG magic. Just type.
 *
 * Uses the Space Grotesk variable font (--font-space-grotesk) at
 * weight 300 (Light) per the Henry brief — "whisper at 300,
 * achieve more authority than bold at 700".
 */
export function HeroHeadline() {
  return (
    <div className="w-full" style={{ lineHeight: 1.0 }}>
      <h1
        className="text-chalk"
        style={{
          fontWeight: 300,
          fontSize: "clamp(48px, 9.6vw, 128px)",
          letterSpacing: "-0.037em",
          lineHeight: 0.95,
          margin: 0,
        }}
      >
        I <span style={{ color: "var(--color-bone)" }}>show</span> my work
      </h1>
    </div>
  );
}
