"use client";

import { useEffect, useState } from "react";

/**
 * PageBackground — Henry-style darkroom backplane.
 *
 * - Near-black canvas (Obsidian)
 * - One subtle warm radial glow at the top
 * - No abstract artifact placeholder — the ProductMockup now lives
 *   in the hero flow where it belongs
 *
 * No colored mesh, no animated blobs — the system is rationed.
 */

export function PageBackground() {
  const [scrollY, setScrollY] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let raf = 0;
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      raf = requestAnimationFrame(() => {
        setScrollY(window.scrollY);
        pending = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="page-bg">
      <div className="page-bg-base" />
    </div>
  );
}
