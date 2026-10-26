import type { Category, TransactionKind } from "@domo/core";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useDialog } from "../../components/Dialogs.tsx";
import { DndSortableList } from "../../components/SortableList.tsx";
import { api } from "../../lib/api.ts";
import { useHousehold, useHouseholdMutation } from "../../lib/queries.ts";
import { MD_TWO_PANE, useMedia } from "../../lib/useMedia.ts";


export function CategoriesSection() {
  const { data } = useHousehold();
  const dialog = useDialog();
  const [params, setParams] = useSearchParams();
  const twoPane = useMedia(MD_TWO_PANE);
  const [query, setQuery] = useState("");
  const [newParent, setNewParent] = useState("");
  const [newChild, setNewChild] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = useHouseholdMutation((body: { kind: TransactionKind; parentId: string | null; name: string }) => api<{ id: string }>("/api/categories", { method: "POST", body }));
  const rename = useHouseholdMutation(({ id, name }: { id: string; name: string }) => api(`/api/categories/${id}`, { method: "PATCH", body: { name } }));
  const remove = useHouseholdMutation((id: string) => api<{ archived: boolean }>(`/api/categories/${id}`, { method: "DELETE" }));
  const reorder = useHouseholdMutation((ids: string[]) => api("/api/categories/order", { method: "PUT", body: { ids } }));
  const fail = (title: string) => (err: Error) => void dialog.alert(title, err.message);

  const kind: TransactionKind = params.get("kind") === "income" ? "income" : "expense";
  const all = data!.categories.filter((c) => !c.archived);
  const childrenOf = (id: string) => all.filter((c) => c.parentId === id);
  const parents = all.filter((c) => c.kind === kind && !c.parentId);

  // 검색어가 대분류 이름이나 그 소분류 이름에 들어 있으면 보여준다.
  const q = query.trim().toLowerCase();
  const matches = (c: Category) => c.name.toLowerCase().includes(q);
  const visibleParents = q ? parents.filter((p) => matches(p) || childrenOf(p.id).some(matches)) : parents;

  const requested = params.get("parent");
  const selectedId = requested && parents.some((p) => p.id === requested) ? requested : twoPane ? (visibleParents[0]?.id ?? null) : null;
  const selected = parents.find((p) => p.id === selectedId) ?? null;
  const children = selected ? childrenOf(selected.id) : [];
  const visibleChildren = q && selected && !matches(selected) ? children.filter(matches) : children;

  const update = (next: { kind?: TransactionKind; parent?: string | null }) => {
    const p = new URLSearchParams(params);
    if (next.kind) {
      p.set("kind", next.kind);
      p.delete("parent");
    }
    if (next.parent !== undefined) {
      if (next.parent) p.set("parent", next.parent);
      else p.delete("parent");
    }
    setParams(p, { replace: next.kind !== undefined || (!twoPane && !next.parent) });
    setEditing(null);
  };

  async function onDelete(c: Category) {
    const isParent = !c.parentId;
    const ok = await dialog.confirm({
      title: "분류 삭제",
      message: `${c.name}${isParent ? "과(와) 소분류 전체" : ""}를 삭제할까요?\n기록에 쓰인 분류는 숨겨지고 과거 내역에는 그대로 남습니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    remove.mutate(c.id, { onSuccess: () => isParent && update({ parent: null }), onError: fail("삭제하지 못했습니다") });
  }

  function saveRename(e: FormEvent) {
    e.preventDefault();
    if (editing?.name.trim()) rename.mutate({ id: editing.id, name: editing.name.trim() }, { onSuccess: () => setEditing(null), onError: fail("저장하지 못했습니다") });
  }

  const renameForm = (
    <form className="inline-form" style={{ flex: 1 }} onSubmit={saveRename}>
      <input className="input" style={{ height: 38 }} aria-label="분류 이름" maxLength={40} value={editing?.name ?? ""} onChange={(e) => setEditing((v) => v && { ...v, name: e.target.value })} autoFocus />
      <button type="submit" className="icon-btn" aria-label="저장">
        <Check size={18} aria-hidden="true" />
      </button>
      <button type="button" className="icon-btn" aria-label="취소" onClick={() => setEditing(null)}>
        <X size={18} aria-hidden="true" />
      </button>
    </form>
  );

  return (
    <div className={`md${selectedId ? " has-selection" : ""}`}>
      <section className="md-list" aria-label="대분류 목록">
        <div className="md-list-head">
          <div className="segmented" role="group" aria-label="분류 종류" style={{ alignSelf: "flex-start" }}>
            <button type="button" aria-pressed={kind === "expense"} onClick={() => update({ kind: "expense" })}>
              지출 분류
            </button>
            <button type="button" aria-pressed={kind === "income"} onClick={() => update({ kind: "income" })}>
              수입 분류
            </button>
          </div>
          <div className="md-search">
            <Search size={16} aria-hidden="true" />
            <input className="input" type="search" placeholder="대분류, 소분류 이름" aria-label="분류 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="md-list-body">
          <DndSortableList items={visibleParents} disabled={!!q || reorder.isPending || !!editing}
            onReorder={(ids) => reorder.mutate(ids, { onError: fail("순서를 바꾸지 못했습니다") })}
            renderItem={(p) => (
            <button key={p.id} type="button" className="md-item" aria-current={p.id === selectedId} onClick={() => update({ parent: p.id })}>
              <span className="md-item-main">
                <strong>{p.name}</strong>
              </span>
              <span className="md-item-end num">{childrenOf(p.id).length}</span>
              <ChevronRight size={16} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
            </button>
          )} />
          {visibleParents.length === 0 && <p className="hint" style={{ padding: "12px 10px" }}>{q ? "검색 결과가 없어요." : "대분류를 추가해 주세요."}</p>}
        </div>
        <form
          className="md-list-foot inline-form"
          style={{ paddingBlock: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (newParent.trim())
              add.mutate({ kind, parentId: null, name: newParent.trim() }, { onSuccess: (r) => (setNewParent(""), update({ parent: r.id })), onError: fail("추가하지 못했습니다") });
          }}
        >
          <input className="input" placeholder="새 대분류" aria-label="새 대분류 이름" maxLength={40} value={newParent} onChange={(e) => setNewParent(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!newParent.trim() || add.isPending} aria-label="대분류 추가">
            <Plus size={17} aria-hidden="true" />
          </button>
        </form>
      </section>

      <section className="md-detail" aria-label="소분류">
        {selected ? (
          <>
            <div className="md-detail-head">
              <button type="button" className="icon-btn md-back" aria-label="대분류 목록으로" onClick={() => update({ parent: null })}>
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              {editing?.id === selected.id ? (
                renameForm
              ) : (
                <>
                  <h2>{selected.name}</h2>
                  <button type="button" className="icon-btn" aria-label={`${selected.name} 이름 수정`} title="이름 수정" onClick={() => setEditing({ id: selected.id, name: selected.name })}>
                    <Pencil size={17} aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-btn danger" aria-label={`${selected.name} 삭제`} title="삭제" onClick={() => void onDelete(selected)}>
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            <div className="md-detail-body md-detail-body-fill">
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newChild.trim()) add.mutate({ kind, parentId: selected.id, name: newChild.trim() }, { onSuccess: () => setNewChild(""), onError: fail("추가하지 못했습니다") });
                }}
              >
                <input className="input" placeholder={`${selected.name}의 새 소분류`} aria-label="새 소분류 이름" maxLength={40} value={newChild} onChange={(e) => setNewChild(e.target.value)} />
                <button type="submit" className="btn btn-primary" disabled={!newChild.trim() || add.isPending}>
                  추가
                </button>
              </form>
              {visibleChildren.length === 0 ? (
                <p className="hint">{q ? "검색어와 맞는 소분류가 없어요." : "소분류가 없어요. 기록에는 소분류를 골라야 하니 하나 이상 추가해 주세요."}</p>
              ) : (
                <DndSortableList items={visibleChildren} className="list category-child-list" disabled={!!q || reorder.isPending || !!editing}
                  onReorder={(ids) => reorder.mutate(ids, { onError: fail("순서를 바꾸지 못했습니다") })}
                  renderItem={(c) => {
                    return (
                      <div className="sortable-content">
                        {editing?.id === c.id ? (
                          renameForm
                        ) : (
                          <>
                            <span className="list-main">
                              <strong style={{ fontWeight: 500 }}>{c.name}</strong>
                            </span>
                            <span className="list-actions">
                              <button type="button" className="icon-btn" aria-label={`${c.name} 이름 수정`} title="이름 수정" onClick={() => setEditing({ id: c.id, name: c.name })}>
                                <Pencil size={17} aria-hidden="true" />
                              </button>
                              <button type="button" className="icon-btn danger" aria-label={`${c.name} 삭제`} title="삭제" onClick={() => void onDelete(c)}>
                                <Trash2 size={17} aria-hidden="true" />
                              </button>
                            </span>
                          </>
                        )}
                      </div>
                    );
                  }} />
              )}
            </div>
          </>
        ) : (
          <div className="md-empty">대분류를 골라 주세요.</div>
        )}
      </section>
    </div>
  );
}
