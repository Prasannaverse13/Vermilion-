"use client";

import { useEffect, useRef, useState } from "react";

type CountUpProps = {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
  triggerOnView?: boolean;
  startFrom?: number;
};

/**
 * CountUp — animates a number from `startFrom` (default 0) to `value` over
 * `duration` ms with a soft cubic ease-out. Triggers when the element
 * scrolls into view (one-shot). Uses tabular-nums so digits don't reflow.
 */
export function CountUp({
  value,
  duration = 1400,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
  style,
  triggerOnView = true,
  startFrom = 0,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(startFrom);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const elapsed = now - t0;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setDisplay(startFrom + (value - startFrom) * eased);
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          setDisplay(value);
        }
      };
      requestAnimationFrame(tick);
    };

    if (!triggerOnView) {
      start();
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      start();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          start();
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration, startFrom, triggerOnView]);

  return (
    <span
      ref={ref}
      className={`tabular-nums ${className}`.trim()}
      style={style}
    >
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
