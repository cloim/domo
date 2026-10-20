import type { PaymentMethod } from "@domo/core";
import { ArrowDown, ArrowUp, Banknote, Check, CreditCard, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useDialog } from "../../components/Dialogs.tsx";
import { api } from "../../lib/api.ts";
import { useHousehold, useHouseholdMutation } from "../../lib/queries.ts";

export function PaymentMethodsSection() {
  const { data } = useHousehold();
  const dialog = useDialog();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = useHouseholdMutation((n: string) => api("/api/payment-methods", { method: "POST", body: { type: "card", name: n } }));
  const patch = useHouseholdMutation(({ id, body }: { id: string; body: object }) => api(`/api/payment-methods/${id}`, { method: "PATCH", body }));
  const remove = useHouseholdMutation((id: string) => api<{ archived: boolean }>(`/api/payment-methods/${id}`, { method: "DELETE" }));
  const reorder = useHouseholdMutation((ids: string[]) => api("/api/payment-methods/order", { method: "PUT", body: { ids } }));

  const active = data!.paymentMethods.filter((m) => !m.archived);
  const archived = data!.paymentMethods.filter((m) => m.archived);

  const fail = (title: string) => (err: Error) => void dialog.alert(title, err.message);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    add.mutate(name.trim(), { onSuccess: () => setName(""), onError: fail("추가하지 못했습니다") });
  }

  async function onDelete(m: PaymentMethod) {
    const ok = await dialog.confirm({ title: "지출수단 삭제", message: `${m.name}을(를) 삭제할까요?\n기록에 쓰인 수단은 보관함으로 옮겨져 과거 내역에 그대로 남습니다.`, confirmLabel: "삭제", danger: true });
    if (!ok) return;
    remove.mutate(m.id, {
      onSuccess: (r) => r.archived && void dialog.alert("보관했습니다", `${m.name}은(는) 기록에 쓰여 보관함으로 옮겼어요.`),
      onError: fail("삭제하지 못했습니다"),
    });
  }

  function move(index: number, delta: number) {
    const ids = active.map((m) => m.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    reorder.mutate(ids, { onError: fail("순서를 바꾸지 못했습니다") });
  }

  return (
    <>
      <section>
        <div className="section-head">
          <h2>사용 중</h2>
        </div>
        <ul className="list">
          {active.map((m, i) => (
            <li key={m.id}>
              {m.type === "cash" ? <Banknote size={19} aria-hidden="true" /> : <CreditCard size={19} aria-hidden="true" />}
              {editing?.id === m.id ? (
                <form
                  className="inline-form"
                  style={{ flex: 1 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editing.name.trim()) patch.mutate({ id: m.id, body: { name: editing.name.trim() } }, { onSuccess: () => setEditing(null), onError: fail("저장하지 못했습니다") });
                  }}
                >
                  <input className="input" aria-label="지출수단 이름" maxLength={40} value={editing.name} onChange={(e) => setEditing({ id: m.id, name: e.target.value })} autoFocus />
                  <button type="submit" className="icon-btn" aria-label="저장">
                    <Check size={18} aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-btn" aria-label="취소" onClick={() => setEditing(null)}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <>
                  <span className="list-main">
                    <strong>{m.name}</strong>
                    <span>{m.type === "cash" ? "현금" : "카드"}</span>
                  </span>
                  <span className="list-actions">
                    <button type="button" className="icon-btn" aria-label={`${m.name} 위로`} title="위로" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp size={17} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`${m.name} 아래로`} title="아래로" disabled={i === active.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown size={17} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`${m.name} 이름 수정`} title="이름 수정" onClick={() => setEditing({ id: m.id, name: m.name })}>
                      <Pencil size={17} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-btn danger" aria-label={`${m.name} 삭제`} title="삭제" disabled={active.length <= 1} onClick={() => void onDelete(m)}>
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="section-head">
          <h2>카드 추가</h2>
        </div>
        <form className="inline-form" onSubmit={submit}>
          <input className="input" placeholder="예: 신한 Deep Dream" aria-label="카드 이름" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || add.isPending}>
            추가
          </button>
        </form>
      </section>

      {archived.length > 0 && (
        <section>
          <div className="section-head">
            <h2>보관함</h2>
          </div>
          <ul className="list">
            {archived.map((m) => (
              <li key={m.id}>
                <CreditCard size={19} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
                <span className="list-main">
                  <strong style={{ color: "var(--ink-2)" }}>{m.name}</strong>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch.mutate({ id: m.id, body: { archived: false } }, { onError: fail("복원하지 못했습니다") })}>
                  <RotateCcw size={15} aria-hidden="true" /> 다시 사용
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
