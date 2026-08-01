"use client";

import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

export default function AccountSwitcherPopover({
  open,
  buttonRef,
  onClose,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (
        popoverRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }

      onClose();
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [buttonRef, onClose]);

  if (!open || !buttonRef.current) return null;

  const position = buttonRef.current.getBoundingClientRect();

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-50 w-64 rounded-lg border border-white/10 bg-slate-900 p-3 text-xs text-white shadow-xl max-h-[70vh] overflow-y-auto"
      style={{
        top: Math.min(position.top, window.innerHeight - 520),
        left: position.right + 8,
      }}
    >
      <>
        <input
          type="text"
          placeholder="Procurar por uma subconta"
          className="mb-4 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-blue-500"
        />

        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">
          Recente
        </p>

        <div className="rounded-lg border border-white/10 bg-slate-800 p-3">
          Santa Clara - Spine
        </div>
        <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/40">
          Todas as contas
        </p>

        <div className="space-y-2">
          <button
            type="button"
            className="w-full rounded-lg border border-white/10 bg-slate-800 p-3 text-left hover:bg-slate-700"
          >
            <p className="font-medium text-white">Santa Clara - Ademicon</p>
            <p className="text-[11px] text-white/40">São Paulo</p>
          </button>

          <button
            type="button"
            className="w-full rounded-lg border border-white/10 bg-slate-800 p-3 text-left hover:bg-slate-700"
          >
            <p className="font-medium text-white">Santa Clara - Derrico</p>
            <p className="text-[11px] text-white/40">São Paulo</p>
          </button>

          <button
            type="button"
            className="w-full rounded-lg border border-white/10 bg-slate-800 p-3 text-left hover:bg-slate-700"
          >
            <p className="font-medium text-white">Santa Clara - Espinélio</p>
            <p className="text-[11px] text-white/40">São Paulo</p>
          </button>
        </div>
      </>
    </div>,
    document.body,
  );
}
