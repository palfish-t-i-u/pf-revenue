import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

function Logo() {
  return (
    <div className="auth-logo">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <rect width="36" height="36" rx="9" fill="rgba(255,255,255,0.2)" />
        <rect x="6" y="6" width="10" height="10" rx="2.5" fill="white" opacity="0.9" />
        <rect x="20" y="6" width="10" height="10" rx="2.5" fill="white" opacity="0.9" />
        <rect x="6" y="20" width="10" height="10" rx="2.5" fill="white" opacity="0.9" />
        <rect x="20" y="20" width="10" height="10" rx="2.5" fill="white" opacity="0.4" />
      </svg>
    </div>
  );
}

export default function AuthLayout({ children, title, subtitle }: Props) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-brand-inner">
          <Logo />
          <h1 className="auth-brand-title">Quản lý Doanh thu</h1>
          <p className="auth-brand-desc">
            Hệ thống quản lý doanh thu nội bộ PalFish
          </p>
          <div className="auth-brand-features">
            <div className="auth-feature">
              <span className="auth-feature-icon">📊</span>
              <div>
                <div className="auth-feature-label">Nhập & theo dõi doanh thu</div>
                <div className="auth-feature-desc">AG Grid editable, báo cáo tự sinh</div>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">📋</span>
              <div>
                <div className="auth-feature-label">Báo cáo & đối soát</div>
                <div className="auth-feature-desc">BCTB, theo team, theo kênh</div>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">🔒</span>
              <div>
                <div className="auth-feature-label">Phân quyền RBAC</div>
                <div className="auth-feature-desc">4 cấp: sale, leader, manager, system</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="auth-content">
        <div className="auth-card">
          <h2 className="auth-title">{title}</h2>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
