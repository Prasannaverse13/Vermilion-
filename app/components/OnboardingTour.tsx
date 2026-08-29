"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  {
    title: "Run the agent",
    body: "Click here to score every symbol on your watchlist. The agent publishes a refusal or a paper trade to your audit log.",
    cta: "Next",
  },
  {
    title: "Audit every decision",
    body: "Every evaluation — refused, executed, or skipped — lands in the Decisions page with the full reasoning chain.",
    cta: "Next",
  },
  {
    title: "Curate your watchlist",
    body: "Add or remove symbols you want the agent to consider. The 13 default names stay unless you remove them.",
    cta: "Done",
  },
];

const STORAGE_KEY = "vermilion.onboarded";

export function OnboardingTour({ forceShow = false }: { forceShow?: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = window.localStorage.getItem(STORAGE_KEY);
    if (!done || forceShow) {
      // Tiny delay so the spotlight anchors have time to mount
      setTimeout(() => setShow(true), 300);
    }
  }, [forceShow]);

  const finish = () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
      onClick={finish}
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.72)" }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative rounded-cards p-6 md:p-7 mx-4 max-w-md w-full"
        style={{
          background: "var(--color-graphite)",
          border: "1px solid #1a1a1f",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: i === step ? "var(--color-bone)" : "var(--color-ash)",
              }}
            />
          ))}
          <span
            className="ml-auto text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "11px",
            }}
          >
            {step + 1} of {STEPS.length}
          </span>
        </div>
        <h3
          className="text-bone-white"
          style={{ fontSize: "22px", lineHeight: 1.2, letterSpacing: "-0.014em" }}
        >
          {current.title}
        </h3>
        <p
          className="text-fog mt-3"
          style={{ fontSize: "14px", lineHeight: 1.5 }}
        >
          {current.body}
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            className="px-4 py-2.5 rounded-buttons text-[14px] text-bone-white transition-all"
            style={{ background: "var(--color-indigo-dusk)" }}
          >
            {current.cta}
          </button>
          <button
            type="button"
            onClick={finish}
            className="text-fog hover:text-bone-white text-[13px] transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
