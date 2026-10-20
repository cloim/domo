import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, QrCode, Share2, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useDialog } from "../../components/Dialogs.tsx";
import { api } from "../../lib/api.ts";
import { keys } from "../../lib/queries.ts";

interface Invite {
  id: string;
  code: string;
  expiresAt: string;
  url: string;
}

export function InviteSection() {
  const qc = useQueryClient();
  const dialog = useDialog();
  const invites = useQuery({ queryKey: keys.invites, queryFn: () => api<Invite[]>("/api/invites") });
  const create = useMutation({ mutationFn: () => api<Invite>("/api/invites", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites }) });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/api/invites/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites }) });

  async function onRevoke(invite: Invite) {
    const ok = await dialog.confirm({ title: "초대 취소", message: `초대 코드 ${invite.code}를 더 이상 쓸 수 없게 할까요?`, confirmLabel: "초대 취소", danger: true });
    if (ok) revoke.mutate(invite.id);
  }

  return (
    <section>
      <div className="section-head">
        <h2>구성원 초대</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={create.isPending}
          onClick={() => create.mutate(undefined, { onError: (err) => void dialog.alert("만들지 못했습니다", err.message) })}
        >
          <QrCode size={16} aria-hidden="true" /> 새 초대 만들기
        </button>
      </div>
      {invites.isPending ? (
        <span className="skeleton" style={{ display: "block", height: 220 }} />
      ) : invites.isError ? (
        <div className="empty" role="alert">
          <strong>초대 목록을 불러오지 못했어요</strong>
          <button type="button" className="btn btn-ghost" onClick={() => void invites.refetch()}>
            다시 시도
          </button>
        </div>
      ) : invites.data.length === 0 ? (
        <div className="empty">
          <strong>사용 중인 초대가 없어요</strong>
          <span>초대를 만들면 구성원이 도모 앱에서 QR을 스캔해 합류할 수 있어요. 초대는 7일 동안 유효합니다.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {invites.data.map((inv) => (
            <InviteCard key={inv.id} invite={inv} onRevoke={() => void onRevoke(inv)} />
          ))}
        </div>
      )}
    </section>
  );
}

function InviteCard({ invite, onRevoke }: { invite: Invite; onRevoke: () => void }) {
  const dialog = useDialog();
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(invite.url, { margin: 1, width: 360, color: { dark: "#1f1a14", light: "#ffffff" } }).then(setQr);
  }, [invite.url]);
  const expires = new Date(invite.expiresAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  async function share() {
    const text = `도모 가계부에 초대합니다. 초대 코드: ${invite.code}`;
    if (navigator.share) {
      await navigator.share({ title: "도모 초대", text, url: invite.url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${invite.url}`);
    await dialog.alert("복사했습니다", "초대 링크를 클립보드에 복사했어요.");
  }

  return (
    <div className="invite-card">
      {qr ? <img src={qr} alt={`초대 QR 코드, 코드 ${invite.code}`} /> : <span className="skeleton" style={{ width: 180, height: 180 }} />}
      <div className="invite-info">
        <span style={{ color: "var(--ink-3)", fontSize: 13 }}>초대 코드</span>
        <span className="invite-code num">{invite.code}</span>
        <span style={{ color: "var(--ink-3)", fontSize: 13 }}>{expires}까지 유효</span>
        <div className="invite-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void share()}>
            {"share" in navigator ? <Share2 size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} 링크 공유
          </button>
          <button type="button" className="btn btn-sm btn-text-danger" onClick={onRevoke}>
            <Trash2 size={15} aria-hidden="true" /> 초대 취소
          </button>
        </div>
      </div>
    </div>
  );
}
