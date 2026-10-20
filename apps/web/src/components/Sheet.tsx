import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 모바일 하단 시트. 화면 아래에서 올라오는 패널 패턴이라 Modal과 따로 둔다. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
