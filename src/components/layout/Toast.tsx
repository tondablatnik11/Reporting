"use client";

import { useEffect, useState, useCallback } from "react";

interface ToastProps {
  toast: { msg: string; type: "ok" | "error" } | null;
  onDismiss: () => void;
  duration?: number;
}

export default function Toast({ toast, onDismiss, duration = 5000 }: ToastProps) {
  const [progress, setProgress] = useState(100);

  const stableDismiss = useCallback(onDismiss, [onDismiss]);

  useEffect(() => {
    if (!toast) {
      setProgress(100);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        stableDismiss();
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast, duration, stableDismiss]);

  if (!toast) return null;

  return (
    <div className="fixed top-6 right-6 z-50 min-w-[280px] max-w-md animate-slide-in">
      <div
        className={`relative overflow-hidden px-5 py-3.5 rounded-2xl text-sm font-bold shadow-2xl backdrop-blur-md border ${
          toast.type === "ok"
            ? "bg-success/20 text-success border-success/30"
            : "bg-danger/20 text-danger border-danger/30"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span>
            {toast.type === "ok" ? "✓" : "✕"} {toast.msg}
          </span>
          <button
            onClick={stableDismiss}
            className="text-current opacity-60 hover:opacity-100 transition-opacity text-lg leading-none shrink-0"
          >
            ×
          </button>
        </div>
        <div
          className={`absolute bottom-0 left-0 h-0.5 transition-all ease-linear ${
            toast.type === "ok" ? "bg-success/50" : "bg-danger/50"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
