"use client";

import { forwardRef, useState } from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

/**
 * PasswordInput — input with an eye toggle for show/hide.
 * Renders the eye icon inside a button at the right edge of the field.
 * The button has type="button" so it doesn't submit a form.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput({ label, className, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative w-full">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          autoComplete={rest.autoComplete}
          className={
            "w-full px-4 py-3 pr-12 text-bone outline-none transition-all " +
            (className ?? "")
          }
          style={{
            background: "var(--color-tar)",
            border: "1px solid var(--color-smoke)",
            borderRadius: 6,
            fontSize: "15px",
            letterSpacing: "-0.01em",
          }}
          {...rest}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
          className="absolute top-0 right-0 h-full px-3 flex items-center justify-center text-ash hover:text-bone transition-colors"
          style={{ background: "transparent" }}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  },
);

function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.45 18.45 0 0 1 4.22-5.39" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a18.4 18.4 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
