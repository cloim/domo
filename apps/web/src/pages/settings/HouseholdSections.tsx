import { MEMBER_COLORS } from "@domo/core";
import { Check, Pencil, UserMinus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Avatar } from "../../components/AppShell.tsx";
import { useDialog } from "../../components/Dialogs.tsx";
import { api } from "../../lib/api.ts";
import { useHousehold, useHouseholdMutation, type HouseholdMember } from "../../lib/queries.ts";

export function HouseholdSection() {
  const { data } = useHousehold();
  const dialog = useDialog();
  const [name, setName] = useState(data!.household.name);
  const rename = useHouseholdMutation((n: string) => api("/api/household", { method: "PATCH", body: { name: n } }));
  const isOwner = data!.me.role === "owner";

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await rename.mutateAsync(name.trim());
      await dialog.alert("저장했습니다", "가계 이름을 바꿨어요.");
    } catch (err) {
      await dialog.alert("저장하지 못했습니다", (err as Error).message);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>가계 이름</h2>
      </div>
      <form className="inline-form" onSubmit={submit}>
        <input className="input" aria-label="가계 이름" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
        {isOwner && (
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || name.trim() === data!.household.name || rename.isPending}>
            저장
          </button>
        )}
      </form>
    </section>
  );
}

export function MembersSection() {
  const { data } = useHousehold();
  const dialog = useDialog();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<string | null>(null);
  const update = useHouseholdMutation(({ id, body }: { id: string; body: object }) => api(`/api/members/${id}`, { method: "PATCH", body }));
  const remove = useHouseholdMutation((id: string) => api(`/api/members/${id}`, { method: "DELETE" }));
  const me = data!.me;

  async function onRemove(m: HouseholdMember) {
    const self = m.id === me.memberId;
    const ok = await dialog.confirm({
      title: self ? "가계 나가기" : "구성원 내보내기",
      message: self ? "가계를 나가면 다시 초대를 받아야 합니다." : `${m.displayName}님을 가계에서 내보낼까요?`,
      confirmLabel: self ? "나가기" : "내보내기",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(m.id);
      if (self) navigate("/onboarding", { replace: true });
    } catch (err) {
      await dialog.alert("처리하지 못했습니다", (err as Error).message);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>구성원 {data!.members.length}명</h2>
      </div>
      <ul className="list">
        {data!.members.map((m) => {
          const canEdit = m.id === me.memberId || me.role === "owner";
          const canRemove = m.role !== "owner" && (m.id === me.memberId || me.role === "owner");
          return (
            <li key={m.id} style={{ flexWrap: "wrap" }}>
              <span className="avatar-btn" style={{ margin: 0, boxShadow: `0 0 0 2px ${m.color}` }}>
                <Avatar name={m.displayName} url={m.avatarUrl} />
              </span>
              {editing === m.id ? (
                <MemberEditor
                  member={m}
                  onCancel={() => setEditing(null)}
                  onSave={async (body) => {
                    try {
                      await update.mutateAsync({ id: m.id, body });
                      setEditing(null);
                    } catch (err) {
                      await dialog.alert("저장하지 못했습니다", (err as Error).message);
                    }
                  }}
                />
              ) : (
                <>
                  <span className="list-main">
                    <strong>
                      {m.displayName} {m.role === "owner" && <span className="badge badge-accent">대표자</span>}
                    </strong>
                    <span>{m.email}</span>
                  </span>
                  <span className="list-actions">
                    {canEdit && (
                      <button type="button" className="icon-btn" aria-label={`${m.displayName} 정보 수정`} title="수정" onClick={() => setEditing(m.id)}>
                        <Pencil size={17} aria-hidden="true" />
                      </button>
                    )}
                    {canRemove && (
                      <button type="button" className="icon-btn danger" aria-label={m.id === me.memberId ? "가계 나가기" : `${m.displayName} 내보내기`} title={m.id === me.memberId ? "나가기" : "내보내기"} onClick={() => void onRemove(m)}>
                        <UserMinus size={17} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MemberEditor({ member, onSave, onCancel }: { member: HouseholdMember; onSave: (body: { displayName: string; color: string }) => void; onCancel: () => void }) {
  const [displayName, setDisplayName] = useState(member.displayName);
  const [color, setColor] = useState(member.color);
  return (
    <form
      style={{ display: "flex", flex: 1, flexWrap: "wrap", alignItems: "center", gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (displayName.trim()) onSave({ displayName: displayName.trim(), color });
      }}
    >
      <input className="input" style={{ flex: "1 1 140px" }} aria-label="표시 이름" maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
      <span className="color-swatches" role="group" aria-label="표시색">
        {MEMBER_COLORS.map((c) => (
          <button key={c} type="button" aria-label={`색 ${c}`} aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </span>
      <span className="list-actions">
        <button type="submit" className="icon-btn" aria-label="저장">
          <Check size={18} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" aria-label="취소" onClick={onCancel}>
          <X size={18} aria-hidden="true" />
        </button>
      </span>
    </form>
  );
}
