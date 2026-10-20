import type { Category, TransactionKind } from "@domo/core";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useDialog } from "../../components/Dialogs.tsx";
import { api } from "../../lib/api.ts";
import { useHousehold, useHouseholdMutation } from "../../lib/queries.ts";

type Editing = { id: string; name: string } | { parentId: string; name: string } | null;

export function CategoriesSection() {
  const { data } = useHousehold();
  const dialog = useDialog();
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [newParent, setNewParent] = useState("");
  const [editing, setEditing] = useState<Editing>(null);

  const add = useHouseholdMutation((body: { kind: TransactionKind; parentId: string | null; name: string }) => api("/api/categories", { method: "POST", body }));
  const rename = useHouseholdMutation(({ id, name }: { id: string; name: string }) => api(`/api/categories/${id}`, { method: "PATCH", body: { name } }));
  const remove = useHouseholdMutation((id: string) => api<{ archived: boolean }>(`/api/categories/${id}`, { method: "DELETE" }));
  const reorder = useHouseholdMutation((ids: string[]) => api("/api/categories/order", { method: "PUT", body: { ids } }));
  const fail = (title: string) => (err: Error) => void dialog.alert(title, err.message);

  const all = data!.categories.filter((c) => !c.archived);
  const parents = all.filter((c) => c.kind === kind && !c.parentId);
  const childrenOf = (id: string) => all.filter((c) => c.parentId === id);

  function saveEditing(e: FormEvent) {
    e.preventDefault();
    if (!editing || !editing.name.trim()) return;
    const done = { onSuccess: () => setEditing(null) };
    if ("id" in editing) rename.mutate({ id: editing.id, name: editing.name.trim() }, { ...done, onError: fail("저장하지 못했습니다") });
    else add.mutate({ kind, parentId: editing.parentId, name: editing.name.trim() }, { ...done, onError: fail("추가하지 못했습니다") });
  }

  async function onDelete(c: Category) {
    const isParent = !c.parentId;
    const ok = await dialog.confirm({
      title: "분류 삭제",
      message: `${c.name}${isParent ? "과(와) 소분류 전체" : ""}를 삭제할까요?\n기록에 쓰인 분류는 숨겨지고 과거 내역에는 그대로 남습니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (ok) remove.mutate(c.id, { onError: fail("삭제하지 못했습니다") });
  }

  function move(list: Category[], index: number, delta: number) {
    const ids = list.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    reorder.mutate(ids, { onError: fail("순서를 바꾸지 못했습니다") });
  }

  const editor = (
    <form className="inline-form" style={{ flex: 1 }} onSubmit={saveEditing}>
      <input className="input" style={{ height: 36 }} aria-label="분류 이름" maxLength={40} value={editing?.name ?? ""} onChange={(e) => setEditing((v) => v && { ...v, name: e.target.value })} autoFocus />
      <button type="submit" className="icon-btn" aria-label="저장">
        <Check size={18} aria-hidden="true" />
      </button>
      <button type="button" className="icon-btn" aria-label="취소" onClick={() => setEditing(null)}>
        <X size={18} aria-hidden="true" />
      </button>
    </form>
  );

  return (
    <>
      <section>
        <div className="section-head">
          <div className="segmented" role="group" aria-label="분류 종류">
            <button type="button" aria-pressed={kind === "expense"} onClick={() => setKind("expense")}>
              지출 분류
            </button>
            <button type="button" aria-pressed={kind === "income"} onClick={() => setKind("income")}>
              수입 분류
            </button>
          </div>
        </div>
        <div className="list">
          {parents.map((p, i) => (
            <div key={p.id} className="cat-block">
              <div className="cat-parent">
                {editing && "id" in editing && editing.id === p.id ? (
                  editor
                ) : (
                  <>
                    <strong>{p.name}</strong>
                    <span className="list-actions">
                      <button type="button" className="icon-btn" aria-label={`${p.name} 위로`} title="위로" disabled={i === 0} onClick={() => move(parents, i, -1)}>
                        <ArrowUp size={17} aria-hidden="true" />
                      </button>
                      <button type="button" className="icon-btn" aria-label={`${p.name} 아래로`} title="아래로" disabled={i === parents.length - 1} onClick={() => move(parents, i, 1)}>
                        <ArrowDown size={17} aria-hidden="true" />
                      </button>
                      <button type="button" className="icon-btn" aria-label={`${p.name} 이름 수정`} title="이름 수정" onClick={() => setEditing({ id: p.id, name: p.name })}>
                        <Pencil size={17} aria-hidden="true" />
                      </button>
                      <button type="button" className="icon-btn danger" aria-label={`${p.name} 삭제`} title="삭제" onClick={() => void onDelete(p)}>
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </span>
                  </>
                )}
              </div>
              <div className="cat-children">
                {childrenOf(p.id).map((c) =>
                  editing && "id" in editing && editing.id === c.id ? (
                    <div key={c.id} style={{ display: "flex", width: "100%" }}>
                      {editor}
                    </div>
                  ) : (
                    <span key={c.id} className="cat-chip">
                      {c.name}
                      <button type="button" aria-label={`${c.name} 이름 수정`} onClick={() => setEditing({ id: c.id, name: c.name })}>
                        <Pencil size={13} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={`${c.name} 삭제`} onClick={() => void onDelete(c)}>
                        <X size={14} aria-hidden="true" />
                      </button>
                    </span>
                  ),
                )}
                {editing && "parentId" in editing && editing.parentId === p.id ? (
                  <div style={{ display: "flex", width: "100%" }}>{editor}</div>
                ) : (
                  <button type="button" className="cat-add" onClick={() => setEditing({ parentId: p.id, name: "" })}>
                    <Plus size={13} aria-hidden="true" /> 소분류
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="section-head">
          <h2>대분류 추가</h2>
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (newParent.trim()) add.mutate({ kind, parentId: null, name: newParent.trim() }, { onSuccess: () => setNewParent(""), onError: fail("추가하지 못했습니다") });
          }}
        >
          <input className="input" placeholder="예: 반려동물" aria-label="대분류 이름" maxLength={40} value={newParent} onChange={(e) => setNewParent(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!newParent.trim() || add.isPending}>
            추가
          </button>
        </form>
      </section>
    </>
  );
}
