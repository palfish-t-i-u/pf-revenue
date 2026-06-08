import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import AuthAccountsTab from "../components/AuthAccountsTab";
import PermissionsTab from "../components/permissions/PermissionsTab";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import ProfilePage from "./ProfilePage";
import AppShell, { type NavItem } from "../layouts/AppShell";
import { DEPARTMENT_LIST } from "../types/permissions";

const PaymentsTab = lazy(() => import("../components/PaymentsTab"));

type ViewId = "payments" | "authAccounts" | "permissions" | "profile";

function ViewFallback() {
  return (
    <div className="p-6 text-center text-sm text-gmv-muted animate-pulse">
      Đang tải dữ liệu...
    </div>
  );
}

const I = {
  database: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

const TITLES: Record<ViewId, { title: string; subtitle?: string }> = {
  payments: {
    title: "Quản lý Doanh thu",
    subtitle: "Nhập / sửa doanh thu, báo cáo tự sinh, đối soát nội bộ",
  },
  authAccounts: {
    title: "Tài khoản Auth",
    subtitle: "Quản lý tài khoản đăng nhập — liên kết CRM & phân quyền vai trò",
  },
  permissions: {
    title: "Phân quyền sử dụng",
    subtitle: "Quản lý quyền truy cập module theo nhóm và cá nhân",
  },
  profile: { title: "Thông tin cá nhân" },
};

export default function MainPage() {
  const { user, signOut, isDevMode } = useAuth();
  const { profile } = useMe();
  const [activeView, setActiveView] = useState<ViewId>("payments");

  const perms = profile?.permissions ?? {};
  const can = useCallback(
    (key: string) => isDevMode || (perms[key] ?? "none") !== "none",
    [isDevMode, perms],
  );

  useEffect(() => {
    if (activeView !== "profile" && !can(activeView)) {
      setActiveView("payments");
    }
  }, [perms, activeView, can]);

  const items: NavItem[] = useMemo(() => {
    const list: NavItem[] = [];

    if (can("payments"))
      list.push({ id: "payments", label: "Quản lý Doanh thu", icon: I.database, section: "Doanh thu" });

    const sysItems: NavItem[] = [];
    if (can("authAccounts"))
      sysItems.push({ id: "authAccounts", label: "Tài khoản Auth", icon: I.shield });
    if (can("permissions"))
      sysItems.push({ id: "permissions", label: "Phân quyền", icon: I.check });
    if (can("profile"))
      sysItems.push({ id: "profile", label: "Thông tin cá nhân", icon: I.user });

    if (sysItems.length > 0) {
      sysItems[0] = { ...sysItems[0], section: "Hệ thống" };
      list.push(...sysItems);
    }

    return list;
  }, [can]);

  const head = TITLES[activeView] ?? TITLES.payments;

  const wideContent = activeView === "payments" || activeView === "permissions";

  const renderActiveView = () => {
    if (!can(activeView) && activeView !== "profile") return null;
    switch (activeView) {
      case "payments": return <PaymentsTab />;
      case "authAccounts": return <AuthAccountsTab />;
      case "permissions": return <PermissionsTab />;
      case "profile": return <ProfilePage />;
      default: return <PaymentsTab />;
    }
  };

  return (
    <AppShell
      items={items}
      activeId={activeView}
      wideContent={wideContent}
      onSelect={(id) => setActiveView(id as ViewId)}
      title={head.title}
      subtitle={head.subtitle}
      userEmail={user?.email || undefined}
      userRole={DEPARTMENT_LIST.find((d) => d.key === profile?.department)?.label ?? profile?.role}
      isDevMode={isDevMode}
      onSignOut={signOut}
    >
      <Suspense fallback={<ViewFallback />}>{renderActiveView()}</Suspense>
    </AppShell>
  );
}
