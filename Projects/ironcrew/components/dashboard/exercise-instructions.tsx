"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ExerciseDetailsButton({
  name,
  instructions,
}: {
  name: string;
  instructions: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`Details for ${name}`}
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Details
      </button>
      {open ? (
        <ExerciseInstructionsDialog name={name} instructions={instructions} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function ExerciseInstructionsDialog({
  name,
  instructions,
  onClose,
}: {
  name: string;
  instructions: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const text = instructions?.trim() ? instructions : null;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-slate-950">
            {name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <h3 className="mt-4 text-xs font-semibold text-slate-500">Instructions</h3>
        <p className={`mt-1 text-sm text-slate-800 ${text ? "whitespace-pre-wrap" : ""}`}>
          {text ?? "No instructions for this exercise."}
        </p>
      </div>
    </div>
  );
}
