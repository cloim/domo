import { ChartPie, ChevronRight, LogOut, NotebookPen, Settings } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { signOut } from "../lib/auth.ts";
import { useHousehold, type Me } from "../lib/queries.ts";
import logoUrl from "../assets/logo.svg";

const NAV = [
  { to: "/records", label: "입출기록", icon: NotebookPen },
  { to: "/stats", label: "통계", icon: ChartPie },
  { to: "/settings", label: "설정", icon: Settings },
];

export function AppShell({ me }: { me: Me }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/records" className="brand" aria-label="도모 홈">
          <img src={logoUrl} alt="" className="brand-mark" />
          도모
        </Link>
        <nav className="side-nav" aria-label="주요 메뉴">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={19} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <Outlet context={me} />
        <nav className="bottom-nav" aria-label="주요 메뉴">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={22} aria-hidden="true" />
              {label}
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
    <div ref={ref} style={{ position: "relative" }}>
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
