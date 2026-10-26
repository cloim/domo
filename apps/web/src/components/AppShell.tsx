import { CalendarDays, ChartPie, ChevronRight, LogOut, MessageCircle, NotebookPen, Settings } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { signOut } from "../lib/auth.ts";
import { useHousehold, type Me } from "../lib/queries.ts";
import { NotifyStatus } from "./NotifyStatus.tsx";
import logoUrl from "../assets/logo.svg";
import { api } from "../lib/api.ts";
import { useFamily } from "../lib/family.ts";
import { useQueryClient } from "@tanstack/react-query";
import { WidgetSync } from "./WidgetSync.tsx";
import { widgetSupported } from "../lib/widget.ts";
import { currentYearMonth } from "@domo/core";

const NAV = [
  { to: "/records", label: "입출기록", icon: NotebookPen },
  { to: "/plan", label: "생활비 계획", icon: CalendarDays },
  { to: "/stats", label: "통계", icon: ChartPie },
  { to: "/family", label: "가족 소식", icon: MessageCircle },
  { to: "/settings", label: "설정", icon: Settings },
];

export function AppShell({ me }: { me: Me }) {
  const [offline, setOffline] = useState(!navigator.onLine);
  const qc = useQueryClient();
  const feed = useFamily(currentYearMonth());
  useEffect(() => {
    const status = () => setOffline(!navigator.onLine);
    window.addEventListener("online", status); window.addEventListener("offline", status);
    return () => { window.removeEventListener("online", status); window.removeEventListener("offline", status); };
  }, []);
  useEffect(() => {
    let active = true;
    const check = () => { if (navigator.onLine) void api("/api/budgets/check", { method: "POST" }).then(() => { if (active) void qc.invalidateQueries({ queryKey: ["family"] }); }).catch(() => {}); };
    check(); const interval = setInterval(check, 60_000);
    return () => { active = false; clearInterval(interval); };
  }, [qc]);
  return (
    <div className="shell">
      {widgetSupported && <WidgetSync />}
      <aside className="sidebar">
        <Link to="/records" className="brand" aria-label="도모 홈">
          <img src={logoUrl} alt="" className="brand-mark" />
          도모
        </Link>
        <nav className="side-nav" aria-label="주요 메뉴">
          {/* 설정은 상단바 프로필 메뉴에 있으므로 사이드바에서는 뺀다. 모바일 하단 탭에는 엄지로 닿기 쉽게 남긴다. */}
          {NAV.filter((n) => n.to !== "/settings").map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={19} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        {offline && <div className="offline-status" role="status">오프라인 | 마지막으로 불러온 내역을 보고 있어요. 저장하려면 인터넷에 연결해 주세요.</div>}
        <Outlet context={me} />
        <nav className="bottom-nav" aria-label="주요 메뉴">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={22} aria-hidden="true" />
              {label}
              {to === "/family" && !!feed.data?.alerts.length && <span className="nav-count" aria-label={`예산 알림 ${feed.data.alerts.length}건`}>{feed.data.alerts.length}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

interface TopBarProps {
  title: string;
  /** 하위 페이지는 제목 대신 breadcrumb를 쓴다. */
  parent?: { to: string; label: string };
  actions?: ReactNode;
  me: Me;
}

export function TopBar({ title, parent, actions, me }: TopBarProps) {
  const household = useHousehold();
  return (
    <header className="topbar">
      <div className="topbar-title">
        {parent ? (
          <h1 className="crumbs">
            <Link to={parent.to}>{parent.label}</Link>
            <ChevronRight size={18} aria-hidden="true" />
            <span>{title}</span>
          </h1>
        ) : (
          <>
            <h1>{title}</h1>
            {household.data && <span className="topbar-sub">{household.data.household.name}</span>}
          </>
        )}
      </div>
      <div className="topbar-actions">
        {actions}
        <NotifyStatus />
        <AvatarMenu me={me} />
      </div>
    </header>
  );
}

function AvatarMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="avatar-menu">
      <button type="button" className="avatar-btn" aria-label="계정 메뉴" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Avatar name={me.user.name} url={me.user.avatarUrl} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{me.user.name}</strong>
            <span>{me.user.email}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/settings");
            }}
          >
            <Settings size={17} aria-hidden="true" /> 설정
          </button>
          <button type="button" role="menuitem" onClick={() => void signOut()}>
            <LogOut size={17} aria-hidden="true" /> 로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) return <img className="avatar" src={url} alt="" referrerPolicy="no-referrer" />;
  return <span className="avatar-fallback">{name.slice(0, 1)}</span>;
}
