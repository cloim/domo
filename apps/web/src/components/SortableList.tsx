import { GripVertical } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** 포인터 손잡이로 모바일과 데스크톱을 함께 지원하고 방향키로도 순서를 저장한다. */
export function SortableList<T extends { id: string; name: string }>({ items, onReorder, disabled = false, className = "", renderItem }: {
  items: T[];
  onReorder: (ids: string[]) => void;
  disabled?: boolean;
  className?: string;
  renderItem: (item: T) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: string; target: string; x: number; y: number; pointerId: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; target: string } | null>(null);
  const dragging = drag !== null;
  const [announcement, setAnnouncement] = useState("");
  const helpId = useId();

  useEffect(() => {
    if (!dragging) return;
    let frame: number;
    const tick = () => {
      const g = gesture.current;
      if (g && root.current) {
        const scroller = root.current.closest<HTMLElement>(".md-list-body, .md-detail-body");
        if (scroller) {
          const rect = scroller.getBoundingClientRect();
          const delta = g.y < rect.top + 40 ? -8 : g.y > rect.bottom - 40 ? 8 : 0;
          if (delta) scroller.scrollTop += delta;
        }
        const row = document.elementFromPoint(g.x, g.y)?.closest<HTMLElement>("[data-sort-id]");
        if (row && row.parentElement === root.current && row.dataset.sortId !== g.target) {
          g.target = row.dataset.sortId!;
          setDrag({ id: g.id, target: g.target });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

  function move(id: string, target: string) {
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(target);
    if (disabled || from < 0 || to < 0 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    onReorder(ids);
    setAnnouncement(`${items[from]!.name}, ${to + 1}번째 위치로 이동`);
  }

  return (
    <>
      <span id={helpId} className="sr-only">끌어서 순서를 바꾸거나 위아래 방향키로 이동하세요. Escape 키로 끌기를 취소합니다.</span>
      <span className="sr-only" role="status">{announcement}</span>
      <div ref={root} className={`sortable-list ${className}`} role="list">
        {items.map((item, index) => (
          <div key={item.id} role="listitem" data-sort-id={item.id}
            className={`sortable-row${drag?.id === item.id ? " is-dragging" : ""}${drag?.target === item.id && drag.id !== item.id ? " is-drop-target" : ""}`}>
            <button type="button" className="icon-btn sort-handle" aria-label={`${item.name} 순서 변경`} aria-describedby={helpId}
              title="끌어서 순서 변경" disabled={disabled || items.length < 2}
              onPointerDown={(e) => {
                if (e.button !== 0 || !e.isPrimary || disabled || gesture.current) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                gesture.current = { id: item.id, target: item.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
                setDrag({ id: item.id, target: item.id });
              }}
              onPointerMove={(e) => {
                if (gesture.current?.pointerId === e.pointerId) {
                  gesture.current.x = e.clientX;
                  gesture.current.y = e.clientY;
                }
              }}
              onPointerUp={(e) => {
                const g = gesture.current;
                const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-sort-id]");
                if (g?.pointerId === e.pointerId && row?.parentElement === root.current) move(g.id, row.dataset.sortId!);
                gesture.current = null;
                setDrag(null);
              }}
              onPointerCancel={() => { gesture.current = null; setDrag(null); }}
              onLostPointerCapture={() => { gesture.current = null; setDrag(null); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { gesture.current = null; setDrag(null); }
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                const target = items[index + (e.key === "ArrowUp" ? -1 : 1)];
                if (target) move(item.id, target.id);
              }}>
              <GripVertical size={18} aria-hidden="true" />
            </button>
            {renderItem(item)}
          </div>
        ))}
      </div>
    </>
  );
}
