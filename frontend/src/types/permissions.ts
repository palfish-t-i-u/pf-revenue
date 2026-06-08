/**
 * Permission system types & constants.
 *
 * Two layers:
 *   1. Department → Module  (which modules a department can see/use)
 *   2. Role (User/Leader/Admin) → Data scope (defined in Tài khoản Auth)
 *
 * Access levels per department×module cell:
 *   "full"  — Toàn quyền: xem + tạo/sửa/xoá
 *   "read"  — Chỉ xem: xem data, không thao tác
 *   "none"  — Không có quyền: ẩn module khỏi sidebar
 */

export type AccessLevel = "full" | "read" | "none";

export type MinRole = "sale" | "leader" | "manager";

export const MIN_ROLE_LIST: { value: MinRole; label: string }[] = [
  { value: "sale", label: "Tất cả" },
  { value: "leader", label: "Từ Leader" },
  { value: "manager", label: "Từ Manager" },
];

export const MIN_ROLE_LABELS: Record<MinRole, string> = {
  sale: "Tất cả",
  leader: "Từ Leader",
  manager: "Từ Manager",
};

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  section: string;
}

export interface DepartmentDef {
  key: string;
  label: string;
  color: string; // CSS color class
}

/** All modules in the system, grouped by sidebar section */
export const MODULE_LIST: ModuleDef[] = [
  { key: "payments", label: "Quản lý Doanh thu", description: "Nhập / sửa doanh thu, báo cáo, đối soát", section: "Doanh thu" },
  { key: "authAccounts", label: "Tài khoản Auth", description: "Quản lý tài khoản đăng nhập", section: "Hệ thống" },
  { key: "permissions", label: "Phân quyền", description: "Ma trận phân quyền phòng ban × module", section: "Hệ thống" },
  { key: "profile", label: "Thông tin cá nhân", description: "Hồ sơ cá nhân", section: "Hệ thống" },
];

/** Unique section names in order */
export const MODULE_SECTIONS = [...new Set(MODULE_LIST.map((m) => m.section))];

/** Departments that can be assigned permissions */
export const DEPARTMENT_LIST: DepartmentDef[] = [
  { key: "sale", label: "Bán hàng", color: "blue" },
  { key: "hr", label: "Nhân sự & Quản trị", color: "purple" },
  { key: "marketing", label: "Marketing", color: "orange" },
  { key: "cs", label: "CS", color: "green" },
];

/** Default permission matrix — seed data */
export const DEFAULT_PERMISSIONS: Record<string, Record<string, AccessLevel>> = {
  sale: {
    payments: "none", authAccounts: "none", permissions: "none", profile: "full",
  },
  hr: {
    payments: "full", authAccounts: "full", permissions: "full", profile: "full",
  },
  marketing: {
    payments: "none", authAccounts: "none", permissions: "none", profile: "full",
  },
  cs: {
    payments: "none", authAccounts: "none", permissions: "none", profile: "full",
  },
};

/** Override for individual users */
export interface PermissionOverride {
  email: string;
  moduleKey: string;
  accessLevel: AccessLevel;
}

/** Cycle access level on click: full → read → none → full */
export function cycleAccessLevel(current: AccessLevel): AccessLevel {
  if (current === "full") return "read";
  if (current === "read") return "none";
  return "full";
}

/** Display labels */
export const ACCESS_LABELS: Record<AccessLevel, string> = {
  full: "Toàn quyền",
  read: "Chỉ xem",
  none: "Không có quyền",
};
