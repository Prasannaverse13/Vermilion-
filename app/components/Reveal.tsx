"use client";

import { useEffect, useRef, useState, type ElementType } from "react";

type RevealProps = {
  children: React.ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
  threshold?: number;
  rootMargin?: string;
};

/**
 * Reveal — wraps content, fades + slides up when it enters the viewport.
 * Triggers once. Children get a `reveal in-view` class pair they can style
 * with, and descendants with `.bar-fill` / `.bar-fill-right` will animate
 * when this wrapper is in view.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  threshold = 0.15,
  rootMargin = "0px 0px -40px 0px",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return (
    <Tag
      ref={ref as React.Ref<HTMLElement>}
      className={`reveal ${inView ? "in-view" : ""} ${className}`.trim()}
      data-delay={delay}
    >
      {children}
    </Tag>
  );
}
