import { BellRing, Bot, ChevronRight, CreditCard, House, Info, Repeat, Shapes, Wand2 } from "lucide-react";
import { Navigate, NavLink, useOutletContext, useParams } from "react-router";
import { TopBar } from "../../components/AppShell.tsx";
import { useHousehold, type Me } from "../../lib/queries.ts";
import { useMedia } from "../../lib/useMedia.ts";
import { AppSection } from "./AppSection.tsx";
import { CategoriesSection } from "./CategoriesSection.tsx";
import { FixedExpensesSection } from "./FixedExpensesSection.tsx";
import { AiSection } from "./notify/AiSection.tsx";
import { NotifySection } from "./notify/NotifySection.tsx";
import { TemplatesSection } from "./notify/TemplatesSection.tsx";
import { notifySupported } from "../../lib/notify.ts";
import { HouseholdSection, MembersSection } from "./HouseholdSections.tsx";
import { InviteSection } from "./InviteSection.tsx";
import { PaymentMethodsSection } from "./PaymentMethodsSection.tsx";

interface Section {
  id: string;
  label: string;
  icon: typeof House;
  ownerOnly?: boolean;
  /** 안드로이드 앱에서만 보인다(휴대폰 알림을 다루는 기능). */
  nativeOnly?: boolean;
  /** 목록 + 상세 화면처럼 폭 제한 없이 상세 영역을 꽉 채운다. */
  fill?: boolean;
  render: () => React.ReactNode;
}

const GROUPS: { title: string; items: Section[] }[] = [
  {
    title: "가계",
    items: [
      { id: "household", label: "가계와 구성원", icon: House, render: () => <HouseholdSettings /> },
    ],
  },
  {
    title: "기록",
    items: [
      { id: "payment-methods", label: "지출수단", icon: CreditCard, fill: true, render: () => <PaymentMethodsSection /> },
      { id: "categories", label: "분류", icon: Shapes, fill: true, render: () => <CategoriesSection /> },
      { id: "fixed-expenses", label: "고정지출", icon: Repeat, fill: true, render: () => <FixedExpensesSection /> },
    ],
  },
  {
    title: "자동 기록",
    items: [
      { id: "notify", label: "알림 연동", icon: BellRing, fill: true, render: () => <NotifySection /> },
      { id: "notify-templates", label: "알림 템플릿", icon: Wand2, fill: true, render: () => <TemplatesSection /> },
      { id: "ai", label: "AI 설정", icon: Bot, render: () => <AiSection /> },
    ],
  },
  { title: "앱", items: [{ id: "app", label: "앱 정보와 업데이트", icon: Info, render: () => <AppSection /> }] },
];

const DEFAULT_SECTION = "household";
// 휴대폰 알림을 다루는 화면은 안드로이드 앱에서만 보인다.
const VISIBLE_GROUPS = GROUPS.map((g) => ({ ...g, items: g.items.filter((s) => !s.nativeOnly || notifySupported) })).filter((g) => g.items.length > 0);

export function SettingsPage() {
  const me = useOutletContext<Me>();
  const { section } = useParams();
  const household = useHousehold();
  const twoPane = useMedia("(min-width: 960px)");
  const isOwner = household.data?.me.role === "owner";
  const sections = VISIBLE_GROUPS.flatMap((g) => g.items).filter((s) => !s.ownerOnly || isOwner);
  // 넓은 화면에서는 /settings 에서도 첫 항목 내용을 함께 보여준다.
  const active = sections.find((s) => s.id === (section ?? DEFAULT_SECTION));

  if (section === "members" || section === "invite") return <Navigate to="/settings/household" replace />;

  return (
    <>
      <TopBar title={section && active ? active.label : "설정"} parent={section && active ? { to: "/settings", label: "설정" } : undefined} me={me} />
      <div className="content">
        <div className={`settings${section ? " has-detail" : ""}`}>
          <nav className="settings-nav" aria-label="설정 항목">
            {VISIBLE_GROUPS.map((g) => {
              const items = g.items.filter((s) => !s.ownerOnly || isOwner);
              return (
                <div key={g.title} className="settings-group">
                  <h2>{g.title}</h2>
                  <ul>
                    {items.map(({ id, label, icon: Icon }) => (
                      <li key={id}>
                        <NavLink to={`/settings/${id}`} className={() => `settings-link${active?.id === id && (section || twoPane) ? " active" : ""}`}>
                          <Icon size={19} aria-hidden="true" />
                          {label}
                          <ChevronRight size={18} className="chev" aria-hidden="true" />
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
          <div className={`settings-detail${active?.fill ? " is-fill" : ""}`}>
            {!household.data ? <SettingsSkeleton /> : active?.fill ? active.render() : <div className="settings-body">{active?.render()}</div>}
          </div>
        </div>
      </div>
    </>
  );
}

function HouseholdSettings() {
  const { data } = useHousehold();
  return <>
    <HouseholdSection />
    <MembersSection />
    {data?.me.role === "owner" && <InviteSection />}
  </>;
}

function SettingsSkeleton() {
  return (
    <div className="settings-body" aria-busy="true" aria-label="불러오는 중">
      <span className="skeleton" style={{ display: "block", height: 160 }} />
    </div>
  );
}
