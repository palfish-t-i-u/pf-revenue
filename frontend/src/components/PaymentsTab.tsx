import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "../lib/cn";
import { usePermission } from "../hooks/usePermission";
import { useMe } from "../hooks/useMe";
import { api } from "../lib/api";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type CellValueChangedEvent,
  type CellKeyDownEvent,
  type CellContextMenuEvent,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

/* ── Mobile detection hook ── */
const mobileQuery = "(max-width: 639px)";
const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(mobileQuery);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};
const getSnapshot = () => window.matchMedia(mobileQuery).matches;
const getServerSnapshot = () => false;
function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── Types ── */
type SubTab = "grid" | "reports" | "recon" | "master";
type MasterTab = "sales" | "channels" | "packages" | "customers";
type ReportTab = "bctb" | "team" | "channel";
interface Payment {
  payment_id: string;
  uid: string;
  pay_time: string;
  real_pay_vnd: number;
  gmv_rmb?: number;
  gmv_final?: number;
  payment_seq?: number;
  status: string;
  bank_matched: boolean;
  crm_activated: boolean;
  crm_order_id?: string;
  note?: string;
  team?: string;
  sale_id?: string;
  channel_id?: string;
  package_id?: string;
  customers?: { uid: string; full_name: string; phone?: string };
  sales?: { id: string; full_name: string; short_code?: string; team?: string };
  channels?: { id: string; name: string };
  packages?: { id: string; name: string };
  updated_at?: string;
}
interface GmvRuleMeta {
  exchange_rate: number;
  cutoff_at: string;
}
interface ToastItem { id: number; message: string; tone: "ok" | "danger" | "warn" }

/* ── Constants ── */
const SUB_TABS: { id: SubTab; label: string; activeClass: string; inactiveClass: string }[] = [
  { id: "grid", label: "Doanh thu",
    activeClass: "bg-[#7260ff] text-white shadow-gmv-1",
    inactiveClass: "bg-[#7260ff]/10 text-[#7260ff] hover:bg-[#7260ff]/20" },
  { id: "reports", label: "Báo cáo",
    activeClass: "bg-[#2f9e44] text-white shadow-gmv-1",
    inactiveClass: "bg-[#2f9e44]/10 text-[#2f9e44] hover:bg-[#2f9e44]/20" },
  { id: "recon", label: "Đối soát",
    activeClass: "bg-[#f08c00] text-white shadow-gmv-1",
    inactiveClass: "bg-[#f08c00]/10 text-[#f08c00] hover:bg-[#f08c00]/20" },
  { id: "master", label: "Danh mục",
    activeClass: "bg-[#1c7ed6] text-white shadow-gmv-1",
    inactiveClass: "bg-[#1c7ed6]/10 text-[#1c7ed6] hover:bg-[#1c7ed6]/20" },
];
const TEAMS = ["Tất cả", "In-house", "In-house 2", "Offline", "HCM"] as const;
const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "bctb", label: "BCTB" },
  { id: "team", label: "Theo Team" },
  { id: "channel", label: "Theo Kênh" },
];
const MASTER_TABS_META: { id: MasterTab; label: string; endpoint: string; columns: { key: string; label: string; editable?: boolean; align?: "right" }[] }[] = [
  { id: "sales", label: "Sale", endpoint: "/api/v1/payments/master/sales",
    columns: [
      { key: "full_name", label: "Tên", editable: true },
      { key: "short_code", label: "Short Code", editable: true },
      { key: "team", label: "Team", editable: true },
      { key: "khoi", label: "Khối", editable: true },
      { key: "active", label: "Active", editable: true },
    ] },
  { id: "channels", label: "Kênh", endpoint: "/api/v1/payments/master/channels",
    columns: [
      { key: "channel_code", label: "Mã kênh", editable: true },
      { key: "name", label: "Tên", editable: true },
      { key: "type", label: "Loại", editable: true },
    ] },
  { id: "packages", label: "Gói học", endpoint: "/api/v1/payments/master/packages",
    columns: [
      { key: "name", label: "Tên gói", editable: true },
      { key: "fixed", label: "Fixed", editable: true },
    ] },
  { id: "customers", label: "Khách hàng", endpoint: "/api/v1/customers/search",
    columns: [
      { key: "uid", label: "UID" },
      { key: "full_name", label: "Tên", editable: true },
      { key: "phone", label: "SĐT", editable: true },
    ] },
];
const DEFAULT_GMV_RULE: GmvRuleMeta = {
  exchange_rate: 3700,
  cutoff_at: "2026-06-01T00:00:00+00:00",
};

/* ── Helpers ── */
const fmtVND = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));
const fmtGMV = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
const fmtDate = (s: string) => {
  try { return new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return s?.slice(0, 10) ?? "—"; }
};
const computeGmvPreview = (rule: GmvRuleMeta, payTime: string, vnd: number, rmb?: number) => {
  if (!payTime || !vnd) return 0;
  const t = new Date(payTime).getTime();
  return t < new Date(rule.cutoff_at).getTime() && rmb ? rmb : vnd / rule.exchange_rate;
};
let _toastSeq = 0;

/* ── AG Grid Theme ── */
const gridTheme = themeQuartz.withParams({
  accentColor: "#4263eb",
  headerBackgroundColor: "#f8fafc",
  rowHoverColor: "#f1f3f5",
  selectedRowBackgroundColor: "#e8f0fe",
  borderRadius: 8,
  headerFontSize: 12,
  fontSize: 13,
  rowHeight: 44,
  headerHeight: 40,
});

/* ── Toast ── */
function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 sm:bottom-4">
      {toasts.map((t) => (
        <div key={t.id} onClick={() => onDismiss(t.id)}
          className={cn(
            "animate-in slide-in-from-right cursor-pointer rounded-gmv-lg px-4 py-3 text-sm font-medium shadow-gmv-2 transition",
            t.tone === "ok" && "bg-green-600 text-white",
            t.tone === "danger" && "bg-red-600 text-white",
            t.tone === "warn" && "bg-yellow-500 text-yellow-900",
          )}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  const show = useCallback((message: string, tone: ToastItem["tone"] = "ok") => {
    const id = ++_toastSeq;
    setToasts((p) => [...p, { id, message, tone }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);
  return { toasts, show, dismiss };
}

/* ── Shared UI ── */
function SummaryCard({ label, value, sub, tone = "neutral" }: {
  label: string; value: string; sub?: string; tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "text-gmv-text-strong", ok: "text-gmv-ok", warn: "text-gmv-warn", danger: "text-gmv-danger",
  };
  return (
    <div className="flex flex-col gap-0.5 rounded-gmv-lg border border-gmv-border bg-gmv-canvas px-3 py-2 sm:gap-1 sm:px-4 sm:py-3">
      <span className="text-[10px] font-medium text-gmv-muted sm:text-xs">{label}</span>
      <span className={cn("text-lg font-bold tabular-nums sm:text-2xl", toneClasses[tone])}>{value}</span>
      {sub && <span className="hidden text-[11px] text-gmv-muted sm:block">{sub}</span>}
    </div>
  );
}

function TableSkeleton({ cols = 5, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
      <table className="w-full text-sm">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className={r % 2 === 0 ? "bg-gmv-canvas" : "bg-gmv-bg/50"}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <div className="h-4 animate-pulse rounded bg-gmv-border" style={{ width: `${50 + Math.random() * 40}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
      status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
    )}>
      {status === "active" ? "Active" : "Refunded"}
    </span>
  );
}

function BoolBadge({ value, yes = "Có", no = "Chưa" }: { value: boolean; yes?: string; no?: string }) {
  return (
    <span className={cn(
      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
      value ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
    )}>
      {value ? yes : no}
    </span>
  );
}

/* ── Dialog wrapper ── */
function Dialog({ open, onClose, title, wide, children }: {
  open: boolean; onClose: () => void; title: string; wide?: boolean; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[90vh] overflow-y-auto rounded-gmv-xl border border-gmv-border bg-gmv-canvas shadow-gmv-3",
          wide ? "w-full max-w-[720px]" : "w-full max-w-[520px]"
        )}
      >
        <div className="flex items-center justify-between border-b border-gmv-border px-5 py-4">
          <h3 className="text-base font-semibold text-gmv-text-strong">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-gmv-md p-1.5 text-gmv-muted hover:bg-gmv-bg hover:text-gmv-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gmv-muted">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm text-gmv-text placeholder:text-gmv-muted focus:border-gmv-primary focus:outline-none focus:ring-1 focus:ring-gmv-primary/30";
const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-gmv-md bg-gmv-primary px-4 py-2 text-sm font-medium text-white shadow-gmv-1 transition hover:bg-gmv-primary/90 disabled:opacity-50";
const btnSecondary = "inline-flex items-center justify-center gap-1.5 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-4 py-2 text-sm font-medium text-gmv-text-strong shadow-gmv-1 transition hover:bg-gmv-bg disabled:opacity-50";
const btnDanger = "inline-flex items-center justify-center gap-1.5 rounded-gmv-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-gmv-1 transition hover:bg-red-700 disabled:opacity-50";

/* ── Dialog: Thêm doanh thu ── */
function AddPaymentDialog({ open, onClose, onSuccess, salesList, channelsList, packagesList, gmvRule }: {
  open: boolean; onClose: () => void; onSuccess: (newPaymentId?: string) => void;
  salesList: any[]; channelsList: any[]; packagesList: any[];
  gmvRule: GmvRuleMeta;
}) {
  const [form, setForm] = useState({
    uid: "", customer_name: "", customer_phone: "",
    pay_time: new Date().toISOString().slice(0, 16),
    package_id: "", sale_id: "", channel_id: "",
    real_pay_vnd: "", gmv_rmb: "", payment_seq: "1st", note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const uidInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus UID field when dialog opens
  useEffect(() => {
    if (open) {
      // Reset form when re-opened
      setForm({
        uid: "", customer_name: "", customer_phone: "",
        pay_time: new Date().toISOString().slice(0, 16),
        package_id: "", sale_id: "", channel_id: "",
        real_pay_vnd: "", gmv_rmb: "", payment_seq: "1st", note: "",
      });
      setError("");
      setCustomerResults([]);
      setTimeout(() => uidInputRef.current?.focus(), 50);
    }
  }, [open]);

  // Customer search
  useEffect(() => {
    if (!form.uid || form.uid.length < 2) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get("/api/v1/customers/search", { params: { q: form.uid } });
        setCustomerResults(res.data || []);
        setShowCustomerDropdown(true);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [form.uid]);

  const gmvCutoff = new Date(gmvRule.cutoff_at).getTime();
  const gmvPreview = computeGmvPreview(gmvRule, form.pay_time, Number(form.real_pay_vnd) || 0, Number(form.gmv_rmb) || undefined);
  const showGmvRmb = form.pay_time && new Date(form.pay_time).getTime() < gmvCutoff;

  const handleSubmit = async () => {
    setError("");
    if (!form.uid || !form.pay_time || !form.real_pay_vnd || !form.sale_id || !form.package_id) {
      setError("Vui lòng điền đầy đủ các trường bắt buộc");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/api/v1/payments", {
        uid: form.uid,
        pay_time: form.pay_time,
        package_id: form.package_id,
        sale_id: form.sale_id,
        channel_id: form.channel_id || undefined,
        real_pay_vnd: Number(form.real_pay_vnd),
        gmv_rmb: form.gmv_rmb ? Number(form.gmv_rmb) : undefined,
        payment_seq: form.payment_seq || "1st",
        note: form.note || undefined,
        customer_name: form.customer_name || undefined,
        customer_phone: form.customer_phone || undefined,
      });
      onSuccess(res.data?.payment_id);
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Lỗi khi thêm doanh thu";
      if (err?.response?.status === 409) {
        setError("Có thể trùng đơn (uid + pay_time + vnd). Kiểm tra lại.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  if (!open) return null;
  return (
    <Dialog open={open} onClose={onClose} title="Thêm khoản doanh thu">
      <div className="flex flex-col gap-4">
        {/* Customer UID with autocomplete */}
        <FormField label="Khách hàng (UID)" required>
          <div className="relative">
            <input ref={uidInputRef} value={form.uid} onChange={(e) => set("uid", e.target.value)}
              onFocus={() => customerResults.length > 0 && setShowCustomerDropdown(true)}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
              placeholder="Nhập uid, tên hoặc SĐT..." className={inputCls} />
            {showCustomerDropdown && customerResults.length > 0 && (
              <div className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-gmv-md border border-gmv-border bg-gmv-canvas shadow-gmv-2">
                {customerResults.map((c: any) => (
                  <button key={c.uid} type="button"
                    onMouseDown={() => {
                      set("uid", c.uid);
                      set("customer_name", c.full_name || "");
                      set("customer_phone", c.phone || "");
                      setShowCustomerDropdown(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gmv-bg">
                    <span className="font-mono text-xs text-gmv-muted">{c.uid}</span>
                    <span className="truncate">{c.full_name || "—"}</span>
                    {c.phone && <span className="ml-auto text-xs text-gmv-muted">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tên khách">
            <input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)}
              placeholder="Tên (nếu uid mới)" className={inputCls} />
          </FormField>
          <FormField label="SĐT">
            <input value={form.customer_phone} onChange={(e) => set("customer_phone", e.target.value)}
              placeholder="Số điện thoại" className={inputCls} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Thời gian thanh toán" required>
            <input type="datetime-local" value={form.pay_time} onChange={(e) => set("pay_time", e.target.value)} className={inputCls} />
          </FormField>
          <FormField label="Gói" required>
            <select value={form.package_id} onChange={(e) => set("package_id", e.target.value)} className={inputCls}>
              <option value="">Chọn gói</option>
              {packagesList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Sale" required>
            <select value={form.sale_id} onChange={(e) => set("sale_id", e.target.value)} className={inputCls}>
              <option value="">Chọn sale</option>
              {salesList.map((s: any) => <option key={s.id} value={s.id}>{s.short_code || s.full_name} ({s.team})</option>)}
            </select>
          </FormField>
          <FormField label="Kênh">
            <select value={form.channel_id} onChange={(e) => set("channel_id", e.target.value)} className={inputCls}>
              <option value="">Không chọn</option>
              {channelsList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Tiền VNĐ" required>
            <input type="number" value={form.real_pay_vnd} onChange={(e) => set("real_pay_vnd", e.target.value)}
              placeholder="0" className={inputCls} />
          </FormField>
          {showGmvRmb && (
            <FormField label="GMV RMB">
              <input type="number" value={form.gmv_rmb} onChange={(e) => set("gmv_rmb", e.target.value)}
                placeholder="0" className={inputCls} />
            </FormField>
          )}
          <FormField label="Lần TT">
            <select value={form.payment_seq} onChange={(e) => set("payment_seq", e.target.value)} className={inputCls}>
              {["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </FormField>
        </div>

        {/* GMV preview */}
        <div className="rounded-gmv-md bg-gmv-bg px-3 py-2 text-sm">
          <span className="text-gmv-muted">GMV Final (tự tính): </span>
          <span className="font-semibold text-gmv-text-strong">{fmtGMV(gmvPreview)}</span>
          <span className="ml-2 text-xs text-gmv-muted">
            {showGmvRmb ? "= gmv_rmb (trước mốc cutoff)" : `= ${fmtVND(Number(form.real_pay_vnd) || 0)} / ${gmvRule.exchange_rate}`}
          </span>
        </div>

        <FormField label="Ghi chú">
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)}
            placeholder="Ghi chú thêm..." rows={2} className={inputCls} />
        </FormField>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-gmv-border pt-4">
          <button type="button" onClick={onClose} className={btnSecondary}>Hủy</button>
          <button type="button" onClick={handleSubmit} disabled={saving} className={btnPrimary}>
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ── Dialog: Chi tiết doanh thu ── */
function DetailDialog({ open, onClose, payment, onAction }: {
  open: boolean; onClose: () => void; payment: Payment | null;
  onAction: (action: string, extra?: any) => Promise<void>;
}) {
  const [acting, setActing] = useState("");
  const [crmOrderId, setCrmOrderId] = useState("");
  const [showCrm, setShowCrm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!open || !payment) return null;
  const p = payment;

  const act = async (action: string, extra?: any) => {
    setActing(action);
    try { await onAction(action, extra); }
    finally { setActing(""); }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Chi tiết doanh thu" wide>
      <div className="flex flex-col gap-4">
        {/* Info grid */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><span className="text-gmv-muted">Payment ID:</span> <span className="font-mono text-xs">{p.payment_id}</span></div>
          <div><span className="text-gmv-muted">Ngày:</span> {fmtDate(p.pay_time)}</div>
          <div><span className="text-gmv-muted">UID:</span> <span className="font-mono">{p.uid}</span></div>
          <div><span className="text-gmv-muted">Khách:</span> {p.customers?.full_name ?? "—"}</div>
          <div><span className="text-gmv-muted">SĐT:</span> {p.customers?.phone ?? "—"}</div>
          <div><span className="text-gmv-muted">Sale:</span> {p.sales?.short_code ?? p.sales?.full_name ?? "—"}</div>
          <div><span className="text-gmv-muted">Team:</span> {p.team ?? p.sales?.team ?? "—"}</div>
          <div><span className="text-gmv-muted">Kênh:</span> {p.channels?.name ?? "—"}</div>
          <div><span className="text-gmv-muted">Gói:</span> {p.packages?.name ?? "—"}</div>
          <div><span className="text-gmv-muted">Tiền VNĐ:</span> <span className="font-semibold">{fmtVND(p.real_pay_vnd)}</span></div>
          <div><span className="text-gmv-muted">GMV Final:</span> <span className="font-semibold">{fmtGMV(p.gmv_final ?? 0)}</span></div>
          <div><span className="text-gmv-muted">Lần TT:</span> {p.payment_seq ?? 1}</div>
          <div><span className="text-gmv-muted">Trạng thái:</span> <StatusBadge status={p.status} /></div>
          <div><span className="text-gmv-muted">NH:</span> <BoolBadge value={p.bank_matched} yes="Khớp" no="Chưa" /></div>
          <div><span className="text-gmv-muted">CRM:</span> <BoolBadge value={p.crm_activated} /></div>
          {p.crm_order_id && <div className="col-span-2"><span className="text-gmv-muted">CRM Order:</span> <span className="font-mono text-xs">{p.crm_order_id}</span></div>}
          {p.note && <div className="col-span-2"><span className="text-gmv-muted">Note:</span> {p.note}</div>}
          {p.updated_at && <div className="col-span-2 text-xs text-gmv-muted">Cập nhật: {new Date(p.updated_at).toLocaleString("vi-VN")}</div>}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 border-t border-gmv-border pt-4">
          {p.status === "active" && (
            <button type="button" onClick={() => act("refund")} disabled={!!acting}
              className={cn(btnDanger, "gap-1.5")}>
              {acting === "refund" ? "Đang xử lý..." : "Hoàn tiền"}
            </button>
          )}
          {p.status === "refunded" && (
            <button type="button" onClick={() => act("restore")} disabled={!!acting}
              className={cn(btnPrimary, "gap-1.5")}>
              {acting === "restore" ? "Đang xử lý..." : "Khôi phục"}
            </button>
          )}

          {/* Link CRM */}
          {!showCrm ? (
            <button type="button" onClick={() => setShowCrm(true)} className={btnSecondary}>
              Gán CRM
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input value={crmOrderId} onChange={(e) => setCrmOrderId(e.target.value)}
                placeholder="crm_order_id" className={cn(inputCls, "w-48")} />
              <button type="button" disabled={!crmOrderId || !!acting}
                onClick={() => act("link-crm", { crm_order_id: crmOrderId })}
                className={btnPrimary}>
                {acting === "link-crm" ? "..." : "Gán"}
              </button>
              <button type="button" onClick={() => setShowCrm(false)} className="text-xs text-gmv-muted hover:text-gmv-text">Hủy</button>
            </div>
          )}

          <div className="flex-1" />

          {/* Delete */}
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-500 hover:text-red-700">Xóa</button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Chắc chắn xóa?</span>
              <button type="button" onClick={() => act("delete")} disabled={!!acting} className={btnDanger}>
                {acting === "delete" ? "..." : "Xóa"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-gmv-muted">Hủy</button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/* ── Dialog: Import từ file ── */
function ImportDialog({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/api/v1/payments/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      });
      setResult(res.data);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Lỗi import";
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;
  return (
    <Dialog open={open} onClose={onClose} title="Import doanh thu từ file" wide>
      <div className="flex flex-col gap-4">
        <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-8 text-center">
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(""); }} />
          {!file ? (
            <>
              <p className="mb-2 text-sm text-gmv-muted">Chọn file Excel (.xlsx) hoặc CSV</p>
              <button type="button" onClick={() => fileRef.current?.click()} className={btnSecondary}>Chọn file</button>
            </>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm font-medium text-gmv-text-strong">{file.name}</span>
              <span className="text-xs text-gmv-muted">({(file.size / 1024).toFixed(0)} KB)</span>
              <button type="button" onClick={() => { setFile(null); setResult(null); }} className="text-xs text-red-500">Xóa</button>
            </div>
          )}
        </div>

        {result && (
          <div className="rounded-gmv-lg border border-gmv-border bg-gmv-canvas p-4 text-sm">
            <div className="mb-2 font-semibold text-gmv-text-strong">Kết quả import</div>
            <div className="flex gap-4">
              <span className="text-green-600">Đã nhập: {result.inserted ?? 0}</span>
              <span className="text-yellow-600">Bỏ qua: {result.skipped ?? 0}</span>
            </div>
            {result.errors?.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto text-xs text-red-600">
                {result.errors.map((e: any, i: number) => (
                  <div key={i}>Dòng {e.row}: {e.message}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-gmv-border pt-4">
          <button type="button" onClick={onClose} className={btnSecondary}>Đóng</button>
          {!result && (
            <button type="button" onClick={handleUpload} disabled={!file || uploading} className={btnPrimary}>
              {uploading ? "Đang import..." : "Import"}
            </button>
          )}
        </div>

        <p className="text-xs text-gmv-muted">
          API <code className="rounded bg-gmv-bg px-1">POST /payments/import</code> chưa sẵn sàng — Đức cần deploy endpoint này.
        </p>
      </div>
    </Dialog>
  );
}

/* ── Dialog: Thêm master record ── */
function AddMasterDialog({ open, onClose, masterTab, onSuccess }: {
  open: boolean; onClose: () => void; masterTab: MasterTab; onSuccess: () => void;
}) {
  const meta = MASTER_TABS_META.find((t) => t.id === masterTab)!;
  const editableColumns = meta.columns.filter((c) => c.editable);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset form when opening
  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      editableColumns.forEach((c) => { init[c.key] = c.key === "active" ? "true" : ""; });
      setForm(init);
      setError("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {};
      editableColumns.forEach((c) => {
        if (c.key === "active") body[c.key] = form[c.key] === "true";
        else if (c.key === "fixed") body[c.key] = form[c.key] === "true";
        else body[c.key] = form[c.key];
      });
      await api.post(`/api/v1/payments/master/${masterTab}`, body);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Lỗi khi thêm");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <Dialog open={open} onClose={onClose} title={`Thêm ${meta.label}`}>
      <div className="flex flex-col gap-3">
        {editableColumns.map((col) => (
          <FormField key={col.key} label={col.label}>
            {col.key === "active" || col.key === "fixed" ? (
              <select value={form[col.key] ?? "true"} onChange={(e) => setForm((p) => ({ ...p, [col.key]: e.target.value }))} className={inputCls}>
                <option value="true">Có</option>
                <option value="false">Không</option>
              </select>
            ) : (
              <input value={form[col.key] ?? ""} onChange={(e) => setForm((p) => ({ ...p, [col.key]: e.target.value }))}
                placeholder={col.label} className={inputCls} />
            )}
          </FormField>
        ))}
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gmv-border pt-4">
          <button type="button" onClick={onClose} className={btnSecondary}>Hủy</button>
          <button type="button" onClick={handleSubmit} disabled={saving} className={btnPrimary}>
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ═══════════════════════════════════════
   Date picker cell editor
   ═══════════════════════════════════════ */
const CurrencyEditor = forwardRef((props: any, ref) => {
  const [raw, setRaw] = useState(() => String(props.value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  const formatted = useMemo(() => {
    const digits = raw.replace(/\D/g, "");
    return digits ? Number(digits).toLocaleString("vi-VN") : "";
  }, [raw]);

  useImperativeHandle(ref, () => ({
    getValue: () => {
      const digits = raw.replace(/\D/g, "");
      return digits ? Number(digits) : props.value;
    },
    isCancelAfterEnd: () => false,
    afterGuiAttached: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  return (
    <input ref={inputRef} type="text" value={formatted}
      onChange={(e) => setRaw(e.target.value.replace(/\D/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Escape") props.stopEditing();
        if (e.key === "Enter") props.stopEditing();
      }}
      style={{ width: "100%", height: "100%", border: "none", outline: "none", background: "transparent", fontSize: "inherit", fontFamily: "inherit", textAlign: "right" }} />
  );
});

const DatePickerEditor = forwardRef((props: any, ref) => {
  const raw = props.data?.pay_time;
  const [value, setValue] = useState(() => {
    if (!raw) return "";
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    getValue: () => {
      if (!value) return props.value;
      const [y, m, d] = value.split("-");
      return `${d}/${m}/${y}`;
    },
    isCancelAfterEnd: () => false,
    afterGuiAttached: () => {
      inputRef.current?.focus();
      inputRef.current?.showPicker?.();
    },
  }));

  return (
    <input ref={inputRef} type="date" value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") props.stopEditing(); }}
      style={{ width: "100%", height: "100%", border: "none", outline: "none", background: "transparent", fontSize: "inherit", fontFamily: "inherit" }} />
  );
});

/* ═══════════════════════════════════════
   Right-click context menu
   ═══════════════════════════════════════ */
interface CtxMenuState { x: number; y: number; data: any; selectedCount: number }

function GridContextMenu({ menu, onClose, onDeleteRows, onAddRow }: {
  menu: CtxMenuState;
  onClose: () => void;
  onDeleteRows: () => void;
  onAddRow: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("contextmenu", handler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("contextmenu", handler);
    };
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const itemCls = "w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors rounded";

  return (
    <div ref={ref}
      className="fixed z-[9999] min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      style={{ left: menu.x, top: menu.y }}>
      <button type="button" className={itemCls} onClick={() => { onAddRow(); onClose(); }}>
        + Thêm doanh thu mới
      </button>
      <div className="my-1 border-t border-gray-100" />
      <button type="button" className={cn(itemCls, "text-red-600 hover:bg-red-50")}
        onClick={() => { onDeleteRows(); onClose(); }}>
        {menu.selectedCount > 1 ? `Xóa ${menu.selectedCount} dòng đã chọn` : "Xóa dòng này"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   Sub-tab: Doanh thu (AG Grid)
   ═══════════════════════════════════════ */
function GridSubTab({ canWrite, gmvRule, isMobile, isManager, onOpenGmvSettings }: { canWrite: boolean; gmvRule: GmvRuleMeta; isMobile: boolean; isManager?: boolean; onOpenGmvSettings?: () => void }) {
  const toast = useToast();
  const gridRef = useRef<AgGridReact>(null);
  const gmvCutoff = useMemo(() => new Date(gmvRule.cutoff_at).getTime(), [gmvRule]);
  const [teamFilter, setTeamFilter] = useState("Tất cả");
  const [quickFilter, setQuickFilter] = useState<"" | "unmatched_bank" | "uncrm">("");
  const [search, setSearch] = useState("");
  const [filterSale, setFilterSale] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterPackage, setFilterPackage] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Master data for dropdown editors
  const [salesList, setSalesList] = useState<any[]>([]);
  const [channelsList, setChannelsList] = useState<any[]>([]);
  const [packagesList, setPackagesList] = useState<any[]>([]);

  // Dialogs
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);

  // Context menu + inline delete
  const [contextMenu, setContextMenu] = useState<CtxMenuState | null>(null);
  const [deletePending, setDeletePending] = useState<string | null>(null);
  const [, setDeleting] = useState<string | null>(null);

  // Load master data once
  useEffect(() => {
    Promise.all([
      api.get("/api/v1/payments/master/sales").then((r) => setSalesList(r.data || [])).catch(() => {}),
      api.get("/api/v1/payments/master/channels").then((r) => setChannelsList(r.data || [])).catch(() => {}),
      api.get("/api/v1/payments/master/packages").then((r) => setPackagesList(r.data || [])).catch(() => {}),
    ]);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (teamFilter !== "Tất cả") params.team = teamFilter;
      if (search.trim()) params.search = search.trim();
      if (quickFilter === "unmatched_bank") params.bank_matched = "false";
      if (quickFilter === "uncrm") params.crm_activated = "false";
      if (filterSale) params.sale_id = filterSale;
      if (filterChannel) params.channel_id = filterChannel;
      if (filterPackage) params.package_id = filterPackage;
      if (filterDateFrom) params.from = filterDateFrom;
      if (filterDateTo) params.to = filterDateTo;
      const res = await api.get("/api/v1/payments", { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      setSummary(res.data.summary || {});
    } catch (err) {
      console.error("Fetch payments failed:", err);
    } finally {
      setLoading(false);
    }
  }, [teamFilter, quickFilter, search, filterSale, filterChannel, filterPackage, filterDateFrom, filterDateTo, page]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [teamFilter, quickFilter, search, filterSale, filterChannel, filterPackage, filterDateFrom, filterDateTo]);
  // Reset pending delete when data reloads (page/filter change)
  useEffect(() => { setDeletePending(null); }, [items]);

  // Build name→id lookup maps for dropdown editors
  const saleNames = useMemo(() => salesList.map((s: any) => s.short_code || s.full_name), [salesList]);
  const saleNameToId = useMemo(() => {
    const m: Record<string, string> = {};
    salesList.forEach((s: any) => { m[s.short_code || s.full_name] = s.id; });
    return m;
  }, [salesList]);

  const channelNames = useMemo(() => channelsList.map((c: any) => c.name), [channelsList]);
  const channelNameToId = useMemo(() => {
    const m: Record<string, string> = {};
    channelsList.forEach((c: any) => { m[c.name] = c.id; });
    return m;
  }, [channelsList]);

  const packageNames = useMemo(() => packagesList.map((p: any) => p.name), [packagesList]);
  const packageNameToId = useMemo(() => {
    const m: Record<string, string> = {};
    packagesList.forEach((p: any) => { m[p.name] = p.id; });
    return m;
  }, [packagesList]);

  // Inline delete: confirm → delete → remove row
  const handleInlineDelete = useCallback(async (paymentId: string) => {
    setDeleting(paymentId);
    try {
      await api.delete(`/api/v1/payments/${paymentId}`);
      gridRef.current?.api?.applyTransaction({ remove: [{ payment_id: paymentId }] });
      toast.show("Đã xóa", "ok");
    } catch (err: any) {
      toast.show(err?.response?.data?.detail || "Lỗi khi xóa", "danger");
    } finally {
      setDeleting(null);
      setDeletePending(null);
    }
  }, [toast]);

  // Column definitions
  const pin = isMobile ? undefined : ("left" as const);
  const columnDefs = useMemo((): ColDef[] => [
    { headerName: "Ngày", width: isMobile ? 95 : 115, pinned: pin,
      valueGetter: (p: any) => {
        const raw = p.data?.pay_time;
        if (!raw) return "";
        try { return new Date(raw).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }); }
        catch { return ""; }
      },
      comparator: (_a: any, _b: any, nodeA: any, nodeB: any) => {
        const da = new Date(nodeA.data?.pay_time || 0).getTime();
        const db = new Date(nodeB.data?.pay_time || 0).getTime();
        return da - db;
      },
      editable: canWrite,
      cellEditor: DatePickerEditor,
      sortable: true, filter: true },
    { field: "uid", headerName: "UID", width: isMobile ? 100 : 120, pinned: pin, editable: canWrite },
    { headerName: "Khách", width: 120, pinned: pin, hide: isMobile,
      valueGetter: (p: any) => p.data?.customers?.full_name ?? "", editable: canWrite },
    { headerName: "Sale", width: 100, pinned: pin,
      valueGetter: (p: any) => p.data?.sales?.short_code ?? p.data?.sales?.full_name ?? "—",
      editable: canWrite,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: saleNames },
    },
    { field: "team", headerName: "Team", width: 100, editable: false, hide: isMobile },
    { headerName: "Kênh", width: 110, hide: isMobile,
      valueGetter: (p: any) => p.data?.channels?.name ?? "—",
      editable: canWrite,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: channelNames },
    },
    { headerName: "Gói", width: 140, hide: isMobile,
      valueGetter: (p: any) => p.data?.packages?.name ?? "—",
      editable: canWrite,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: packageNames },
    },
    { field: "real_pay_vnd", headerName: "VNĐ", width: isMobile ? 110 : 130, type: "numericColumn",
      valueFormatter: (p: any) => fmtVND(p.value ?? 0), editable: canWrite,
      cellEditor: CurrencyEditor },
    { field: "gmv_final", headerName: "GMV", width: 110, type: "numericColumn", hide: isMobile,
      valueFormatter: (p: any) => fmtGMV(p.value ?? 0),
      editable: (params: any) => {
        if (!canWrite) return false;
        const payTime = params.data?.pay_time;
        if (!payTime) return false;
        return new Date(payTime).getTime() < gmvCutoff;
      },
    },
    { field: "payment_seq", headerName: "Lần", width: 70, editable: canWrite, hide: isMobile,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"] },
    },
    { field: "status", headerName: "TT", width: 80,
      cellRenderer: (p: any) => <StatusBadge status={p.value} />,
      editable: false },
    { field: "bank_matched", headerName: "NH", width: 65, hide: isMobile,
      cellRenderer: (p: any) => <BoolBadge value={p.value} yes="Khớp" no="Chưa" />,
      editable: false },
    { field: "crm_activated", headerName: "CRM", width: 65, hide: isMobile,
      cellRenderer: (p: any) => <BoolBadge value={p.value} />,
      editable: false },
    { field: "note", headerName: "Note", width: 150, minWidth: 100, editable: canWrite, hide: isMobile },
  ], [canWrite, saleNames, channelNames, packageNames, gmvCutoff, isMobile, pin]);

  const defaultColDef = useMemo((): ColDef => ({
    sortable: true,
    resizable: true,
    suppressMovable: true,
  }), []);

  // Inline edit handler
  const handleCellEdit = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue } = event;
    const field = colDef.field;
    const headerName = colDef.headerName ?? "";
    const paymentId = data.payment_id;

    // Helper: apply rollback and show error
    const rollback = (errMsg: string) => {
      if (field) {
        data[field] = oldValue;
      }
      event.api.applyTransaction({ update: [data] });
      toast.show(errMsg, "danger");
    };

    // Fieldless columns (use headerName to identify)
    if (!field) {
      if (headerName === "Ngày") {
        const trimmed = String(newValue ?? "").trim();
        let parsed: Date | null = null;
        const ddmm = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmm) parsed = new Date(`${ddmm[3]}-${ddmm[2].padStart(2, "0")}-${ddmm[1].padStart(2, "0")}`);
        if (!parsed || isNaN(parsed.getTime())) {
          const asDate = new Date(trimmed);
          if (!isNaN(asDate.getTime())) parsed = asDate;
        }
        if (!parsed || isNaN(parsed.getTime())) { rollback("Ngày không hợp lệ (dd/mm/yyyy)"); return; }
        try {
          const res = await api.patch(`/api/v1/payments/${paymentId}`, { pay_time: parsed.toISOString() });
          event.api.applyTransaction({ update: [res.data] });
          toast.show("Đã cập nhật Ngày", "ok");
        } catch { rollback("Lỗi cập nhật Ngày"); }
        return;
      }
      if (headerName === "Khách") {
        const uid = data.uid;
        if (!uid) { rollback("Không tìm thấy UID"); return; }
        try {
          await api.patch(`/api/v1/payments/master/customers/${uid}`, { full_name: String(newValue ?? "").trim() });
          data.customers = { ...data.customers, full_name: newValue };
          event.api.applyTransaction({ update: [data] });
          toast.show("Đã cập nhật tên khách", "ok");
        } catch { rollback("Lỗi cập nhật tên khách"); }
        return;
      }
      if (headerName === "Sale") {
        const newSaleId = saleNameToId[newValue];
        if (!newSaleId) { rollback("Sale không hợp lệ"); return; }
        try {
          const res = await api.patch(`/api/v1/payments/${paymentId}`, { sale_id: newSaleId });
          event.api.applyTransaction({ update: [res.data] });
          toast.show("Đã cập nhật Sale", "ok");
        } catch { rollback("Lỗi cập nhật Sale"); }
        return;
      }
      if (headerName === "Kênh") {
        const newChannelId = channelNameToId[newValue];
        if (!newChannelId) { rollback("Kênh không hợp lệ"); return; }
        try {
          const res = await api.patch(`/api/v1/payments/${paymentId}`, { channel_id: newChannelId });
          event.api.applyTransaction({ update: [res.data] });
          toast.show("Đã cập nhật Kênh", "ok");
        } catch { rollback("Lỗi cập nhật Kênh"); }
        return;
      }
      if (headerName === "Gói") {
        const newPackageId = packageNameToId[newValue];
        if (!newPackageId) { rollback("Gói không hợp lệ"); return; }
        try {
          const res = await api.patch(`/api/v1/payments/${paymentId}`, { package_id: newPackageId });
          event.api.applyTransaction({ update: [res.data] });
          toast.show("Đã cập nhật Gói", "ok");
        } catch { rollback("Lỗi cập nhật Gói"); }
        return;
      }
      return;
    }

    // Field-based columns
    try {
      let patchBody: Record<string, unknown>;

      if (field === "gmv_final") {
        const num = Number(newValue);
        if (isNaN(num)) { rollback("GMV phải là số"); return; }
        patchBody = { gmv_rmb: num };
      } else if (field === "real_pay_vnd" || field === "payment_seq") {
        const num = Number(newValue);
        if (isNaN(num)) { rollback(`${headerName} phải là số`); return; }
        patchBody = { [field]: num };
      } else {
        patchBody = { [field]: newValue };
      }

      const res = await api.patch(`/api/v1/payments/${paymentId}`, patchBody);
      // Update row with server response (gmv_final may have been recalculated)
      event.api.applyTransaction({ update: [res.data] });
      toast.show(`Đã lưu ${headerName}`, "ok");
    } catch {
      rollback(`Lỗi cập nhật ${headerName}`);
    }
  }, [saleNameToId, channelNameToId, packageNameToId, toast]);

  // Detail dialog is now opened via the ▸ icon column, not row click

  // Detail dialog actions
  const handleDetailAction = useCallback(async (action: string, extra?: any) => {
    if (!detailPayment) return;
    const id = detailPayment.payment_id;
    try {
      if (action === "refund") {
        await api.post(`/api/v1/payments/${id}/refund`);
        toast.show("Đã hoàn tiền", "ok");
      } else if (action === "restore") {
        await api.post(`/api/v1/payments/${id}/restore`);
        toast.show("Đã khôi phục", "ok");
      } else if (action === "link-crm") {
        await api.post(`/api/v1/payments/${id}/link-crm`, extra);
        toast.show("Đã gán CRM", "ok");
      } else if (action === "delete") {
        await api.delete(`/api/v1/payments/${id}`);
        toast.show("Đã xóa", "ok");
      }
      setDetailPayment(null);
      fetchData();
    } catch (err: any) {
      toast.show(err?.response?.data?.detail || "Lỗi xử lý", "danger");
    }
  }, [detailPayment, fetchData, toast]);

  // Export
  const handleExport = useCallback(async () => {
    try {
      const params: Record<string, string | number> = {};
      if (teamFilter !== "Tất cả") params.team = teamFilter;
      if (search.trim()) params.search = search.trim();
      const res = await api.get("/api/v1/payments/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `doanh-thu-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.show("Đã tải Excel", "ok");
    } catch {
      toast.show("API export chưa sẵn sàng (chờ Đức deploy)", "warn");
    }
  }, [teamFilter, search, toast]);

  // Bulk delete: delete all selected rows
  const handleBulkDelete = useCallback(async () => {
    const gridApi = gridRef.current?.api;
    if (!gridApi) return;
    const selected = gridApi.getSelectedRows() as Payment[];
    if (!selected.length) return;
    setDeleting("bulk");
    const results = await Promise.allSettled(
      selected.map((row) => api.delete(`/api/v1/payments/${row.payment_id}`))
    );
    const removed: Payment[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") removed.push(selected[i]);
    });
    if (removed.length) gridApi.applyTransaction({ remove: removed });
    const ok = removed.length;
    toast.show(ok === selected.length ? `Đã xóa ${ok} dòng` : `Xóa ${ok}/${selected.length} dòng`, ok === selected.length ? "ok" : "warn");
    setDeleting(null);
  }, [toast]);

  // Context menu handler
  const handleContextMenu = useCallback((event: CellContextMenuEvent) => {
    event.event?.preventDefault();
    const mouseEvent = event.event as MouseEvent;
    const selectedCount = gridRef.current?.api?.getSelectedRows().length ?? 0;
    setContextMenu({
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
      data: event.data,
      selectedCount: Math.max(selectedCount, 1),
    });
  }, []);

  // Context menu: delete selected rows (or single row)
  const handleContextDeleteRows = useCallback(() => {
    const gridApi = gridRef.current?.api;
    const selected = gridApi?.getSelectedRows() as Payment[] | undefined;
    if (selected && selected.length > 1) {
      handleBulkDelete();
    } else {
      const row = contextMenu?.data;
      if (row?.payment_id) handleInlineDelete(row.payment_id);
    }
  }, [contextMenu, handleBulkDelete, handleInlineDelete]);

  // Clipboard copy: Ctrl+C on focused cell
  const handleCopyCell = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const cell = api.getFocusedCell();
    if (!cell) return;
    const rowNode = api.getDisplayedRowAtIndex(cell.rowIndex);
    if (!rowNode) return;
    const colDef = cell.column.getColDef();
    let value: unknown;
    if (colDef.valueGetter && typeof colDef.valueGetter === "function") {
      value = colDef.valueGetter({ data: rowNode.data, node: rowNode, column: cell.column, colDef, api } as any);
    } else if (colDef.field) {
      value = rowNode.data?.[colDef.field];
    }
    const text = value != null ? String(value) : "";
    navigator.clipboard.writeText(text).then(() => toast.show("Đã copy", "ok")).catch(() => {});
  }, [toast]);

  // Clipboard paste: Ctrl+V on focused editable cell (field-based only)
  const handlePasteCell = useCallback(async () => {
    if (!canWrite) return;
    const api = gridRef.current?.api;
    if (!api) return;
    const cell = api.getFocusedCell();
    if (!cell) return;
    const colDef = cell.column.getColDef();
    const field = colDef.field;
    // Only support field-based columns (not valueGetter like Sale/Kênh/Gói)
    if (!field) return;
    const rowNode = api.getDisplayedRowAtIndex(cell.rowIndex);
    if (!rowNode) return;
    const isEditable = typeof colDef.editable === "function"
      ? colDef.editable({ node: rowNode, data: rowNode.data, column: cell.column, colDef, api } as any)
      : colDef.editable;
    if (!isEditable) return;
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      // Use setDataValue to trigger onCellValueChanged → auto-save
      rowNode.setDataValue(field, text);
      toast.show("Đã paste", "ok");
    } catch {
      // Clipboard read permission denied
    }
  }, [canWrite, toast]);

  // Keyboard handler: Delete, Ctrl+C, Ctrl+V
  const handleCellKeyDown = useCallback((event: CellKeyDownEvent<Payment>) => {
    const nativeEvent = event.event as KeyboardEvent | null | undefined;
    if (!nativeEvent) return;
    const isCtrl = nativeEvent.ctrlKey || nativeEvent.metaKey;
    // Ctrl+C: copy
    if (isCtrl && nativeEvent.key === "c") {
      nativeEvent.preventDefault();
      handleCopyCell();
      return;
    }
    // Ctrl+V: paste
    if (isCtrl && nativeEvent.key === "v") {
      nativeEvent.preventDefault();
      handlePasteCell();
      return;
    }
    // Delete key
    if (nativeEvent.key !== "Delete") return;
    if (!canWrite) return;
    const selected = gridRef.current?.api?.getSelectedRows() as Payment[] | undefined;
    if (selected && selected.length > 1) {
      handleBulkDelete();
      return;
    }
    const paymentId = event.data?.payment_id;
    if (!paymentId) return;
    if (deletePending === paymentId) {
      handleInlineDelete(paymentId);
    } else {
      setDeletePending(paymentId);
    }
  }, [canWrite, deletePending, handleInlineDelete, handleBulkDelete, handleCopyCell, handlePasteCell]);

  // Post-add: after fetchData resolves, scroll to and flash the new row
  const handleAddSuccess = useCallback(async (newPaymentId?: string) => {
    await fetchData();
    toast.show("Đã thêm doanh thu", "ok");
    if (!newPaymentId) return;
    // Small delay to let the grid settle after data update
    setTimeout(() => {
      const api = gridRef.current?.api;
      if (!api) return;
      const rowNode = api.getRowNode(newPaymentId);
      if (!rowNode) return;
      api.ensureNodeVisible(rowNode, "middle");
      api.flashCells({ rowNodes: [rowNode], flashDuration: 800, fadeDuration: 500 });
    }, 150);
  }, [fetchData, toast]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex h-full flex-col">
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />

      {/* Summary cards */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Tổng GMV" value={summary.gmv_final != null ? fmtGMV(summary.gmv_final) : "—"} sub="sum gmv_final (active)" />
        <SummaryCard label="Doanh thu VNĐ" value={summary.real_pay_vnd != null ? fmtVND(summary.real_pay_vnd) : "—"} sub="sum real_pay_vnd" />
        <SummaryCard label="Số đơn" value={summary.count != null ? summary.count.toLocaleString("vi-VN") : "—"} sub="active + refunded" />
        <SummaryCard label="Chưa khớp NH" value={summary.unmatched_bank != null ? String(summary.unmatched_bank) : "—"} tone="warn" sub="bank_matched = false" />
        <SummaryCard label="Chưa kích hoạt CRM" value={summary.uncrm != null ? String(summary.uncrm) : "—"} tone="warn" sub="crm_activated = false" />
      </div>

      {/* Toolbar */}
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <button type="button" onClick={() => setShowImport(true)} className={cn(btnSecondary, "text-xs sm:text-sm")}>Import</button>
          )}
          <button type="button" onClick={handleExport} className={cn(btnSecondary, "text-xs sm:text-sm")}>
            <span className="hidden sm:inline">Xuất Excel</span>
            <span className="sm:hidden">Excel</span>
          </button>
          <button type="button" onClick={() => setShowFilters(!showFilters)}
            className={cn(btnSecondary, "text-xs sm:text-sm", showFilters && "bg-gmv-primary/10 text-gmv-primary")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Lọc{(filterSale || filterChannel || filterPackage || filterDateFrom || filterDateTo) ? " ●" : ""}
          </button>
          {isManager && onOpenGmvSettings && (
            <button type="button" onClick={onOpenGmvSettings}
              className="flex items-center gap-1.5 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-xs font-medium text-gmv-muted hover:bg-gmv-bg hover:text-gmv-text transition">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Tỷ giá: {gmvRule.exchange_rate.toLocaleString("vi-VN")}
            </button>
          )}
          <div className="hidden flex-1 sm:block" />
          {canWrite && (
            <button type="button" onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 rounded-gmv-md border border-dashed border-gmv-border px-2.5 py-1.5 text-xs font-medium text-gmv-muted hover:border-gmv-primary hover:text-gmv-primary transition">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Thêm dòng
            </button>
          )}
        </div>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm uid, tên, sale, kênh, gói..." className={cn(inputCls, "w-full sm:w-56")} />
      </div>

      {/* Advanced filters row */}
      {showFilters && (
        <div className="mb-2 grid grid-cols-2 items-end gap-2 rounded-gmv-lg border border-gmv-border bg-gmv-bg/50 px-3 py-2 sm:flex sm:flex-wrap">
          <div className="flex flex-col gap-0.5">
            <label className="text-[11px] font-medium text-gmv-muted">Từ ngày</label>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
              className={cn(inputCls, "w-full text-xs sm:w-36")} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[11px] font-medium text-gmv-muted">Đến ngày</label>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
              className={cn(inputCls, "w-full text-xs sm:w-36")} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[11px] font-medium text-gmv-muted">Sale</label>
            <select value={filterSale} onChange={(e) => setFilterSale(e.target.value)}
              className={cn(inputCls, "w-full text-xs sm:w-36")}>
              <option value="">Tất cả</option>
              {salesList.map((s: any) => <option key={s.id} value={s.id}>{s.short_code || s.full_name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[11px] font-medium text-gmv-muted">Kênh</label>
            <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}
              className={cn(inputCls, "w-full text-xs sm:w-36")}>
              <option value="">Tất cả</option>
              {channelsList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[11px] font-medium text-gmv-muted">Gói</label>
            <select value={filterPackage} onChange={(e) => setFilterPackage(e.target.value)}
              className={cn(inputCls, "w-full text-xs sm:w-44")}>
              <option value="">Tất cả</option>
              {packagesList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button type="button"
            onClick={() => { setFilterSale(""); setFilterChannel(""); setFilterPackage(""); setFilterDateFrom(""); setFilterDateTo(""); }}
            className="col-span-2 self-end pb-1 text-xs text-gmv-muted hover:text-gmv-text sm:col-span-1">
            Xóa lọc
          </button>
        </div>
      )}

      {/* Team filter tabs + quick filters */}
      <div className="mb-1 flex items-center gap-1 overflow-x-auto border-b border-gmv-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TEAMS.map((tab) => (
          <button key={tab} type="button" onClick={() => setTeamFilter(tab)}
            className={cn(
              "shrink-0 border-b-2 px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm",
              teamFilter === tab
                ? "border-gmv-primary text-gmv-primary"
                : "border-transparent text-gmv-muted hover:border-gmv-border hover:text-gmv-text"
            )}>
            {tab}
          </button>
        ))}
        <div className="mx-2 h-4 w-px shrink-0 bg-gmv-border" />
        {([
          { key: "unmatched_bank" as const, label: "Chưa khớp NH", count: summary.unmatched_bank },
          { key: "uncrm" as const, label: "Chưa CRM", count: summary.uncrm },
        ]).map((f) => (
          <button key={f.key} type="button"
            onClick={() => setQuickFilter(quickFilter === f.key ? "" : f.key)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition",
              quickFilter === f.key
                ? "bg-amber-100 text-amber-800"
                : "bg-gmv-bg text-gmv-muted hover:bg-gmv-border hover:text-gmv-text"
            )}>
            {f.label}{f.count != null ? ` (${f.count})` : ""}
          </button>
        ))}
      </div>

      {/* AG Grid — flex-1 fills remaining viewport */}
      {loading ? <TableSkeleton cols={10} rows={8} /> : items.length === 0 ? (
        <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-16 text-center text-sm text-gmv-muted">
          Không có dữ liệu {teamFilter !== "Tất cả" ? `cho team "${teamFilter}"` : ""}
        </div>
      ) : (
        <div className="min-h-[300px] flex-1 sm:min-h-0" onContextMenu={(e) => { if (canWrite) e.preventDefault(); }}>
          <AgGridReact
            ref={gridRef}
            theme={gridTheme}
            rowData={items}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(params) => params.data.payment_id}
            onCellValueChanged={handleCellEdit}
            onCellKeyDown={handleCellKeyDown}
            onCellContextMenu={canWrite ? handleContextMenu : undefined}
            rowSelection={canWrite ? { mode: "multiRow", checkboxes: false, headerCheckbox: false, enableClickSelection: true } : undefined}
            suppressContextMenu
            stopEditingWhenCellsLoseFocus
            singleClickEdit={true}
            undoRedoCellEditing={true}
            undoRedoCellEditingLimit={20}
            tooltipShowDelay={300}
            animateRows={false}
          />
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex shrink-0 flex-col items-center gap-1 py-1 text-sm text-gmv-muted sm:flex-row sm:justify-between">
          <span className="text-xs">{items.length} / {total.toLocaleString("vi-VN")} dòng</span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1 text-xs font-medium disabled:opacity-40">Trước</button>
            <span className="px-2 py-1 text-xs">Trang {page}/{totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1 text-xs font-medium disabled:opacity-40">Sau</button>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && canWrite && (
        <GridContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onDeleteRows={handleContextDeleteRows}
          onAddRow={() => setShowAdd(true)}
        />
      )}

      {/* Dialogs */}
      <AddPaymentDialog open={showAdd} onClose={() => setShowAdd(false)}
        onSuccess={handleAddSuccess}
        salesList={salesList} channelsList={channelsList} packagesList={packagesList} gmvRule={gmvRule} />
      <DetailDialog open={!!detailPayment} onClose={() => setDetailPayment(null)}
        payment={detailPayment} onAction={handleDetailAction} />
      <ImportDialog open={showImport} onClose={() => setShowImport(false)}
        onSuccess={() => { fetchData(); toast.show("Import thành công", "ok"); }} />
    </div>
  );
}

/* ═══════════════════════════════════════
   Sub-tab: Báo cáo
   ═══════════════════════════════════════ */
function ReportsSubTab() {
  const [activeReport, setActiveReport] = useState<ReportTab>("bctb");
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const todayStr = today.toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  const fetchReport = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/v1/reports/${activeReport}`, { params: { from: dateFrom, to: dateTo } });
      setReportData(res.data);
    } catch (err) {
      console.error(`Fetch report ${activeReport} failed:`, err);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [activeReport, dateFrom, dateTo]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleExport = async () => {
    try {
      const res = await api.get(`/api/v1/reports/${activeReport}/export`, {
        params: { from: dateFrom, to: dateTo },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${activeReport}_${dateFrom}_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="flex gap-1">
          {REPORT_TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveReport(tab.id)}
              className={cn("rounded-gmv-md px-3 py-1.5 text-sm font-medium transition",
                activeReport === tab.id ? "bg-gmv-primary text-white shadow-gmv-1" : "bg-gmv-bg text-gmv-muted hover:text-gmv-text"
              )}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="hidden flex-1 sm:block" />
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gmv-muted">Từ</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-sm text-gmv-text focus:border-gmv-primary focus:outline-none sm:w-auto" />
          <label className="text-gmv-muted">đến</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-sm text-gmv-text focus:border-gmv-primary focus:outline-none sm:w-auto" />
        </div>
        <button type="button" onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1.5 text-sm font-medium text-gmv-text-strong shadow-gmv-1 transition hover:bg-gmv-bg">
          Xuất Excel
        </button>
      </div>

      {loading ? <TableSkeleton cols={6} rows={6} /> : !reportData ? (
        <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">Không tải được báo cáo</div>
      ) : activeReport === "bctb" ? (
        <BctbTable data={reportData} />
      ) : activeReport === "team" ? (
        <TeamTable rows={reportData.rows || []} />
      ) : (
        <ChannelTable rows={reportData.rows || []} />
      )}

      <p className="text-xs text-gmv-muted">
        Dữ liệu chỉ tính đơn <span className="font-medium text-gmv-ok">active</span> · Team lấy từ <code className="rounded bg-gmv-bg px-1">sales.team</code>
      </p>
    </div>
  );
}

function BctbTable({ data }: { data: any }) {
  const dateKeys: string[] = data.date_keys || [];
  const rows: any[] = data.sorted_data || data.data || [];
  if (!rows.length) return <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">Không có dữ liệu trong khoảng ngày này</div>;
  return (
    <div className="overflow-x-auto rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
      <table className="w-full whitespace-nowrap text-sm">
        <thead>
          <tr className="bg-gmv-table-head">
            <th className="sticky left-0 z-10 bg-gmv-table-head px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Sale</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Team</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Khối</th>
            {dateKeys.map((d) => (
              <th key={d} className="px-3 py-2.5 text-right text-xs font-semibold text-gmv-muted">{d.slice(5)}</th>
            ))}
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-gmv-muted">Tổng GMV</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-gmv-muted">Số đơn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, i: number) => (
            <tr key={row.sale_id ?? i} className="border-t border-gmv-border hover:bg-gmv-bg/50">
              <td className="sticky left-0 z-10 bg-gmv-canvas px-3 py-2 font-medium">{row.crm_name ?? "—"}</td>
              <td className="px-3 py-2 text-gmv-muted">{row.team ?? "—"}</td>
              <td className="px-3 py-2 text-gmv-muted">{row.department ?? "—"}</td>
              {dateKeys.map((d) => {
                const cell = row.days?.[d];
                const val = cell?.gmv_final ?? cell?.real_pay_vnd ?? 0;
                return <td key={d} className="px-3 py-2 text-right font-mono text-xs tabular-nums">{val > 0 ? fmtGMV(val) : ""}</td>;
              })}
              <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{fmtGMV(row.total?.gmv_final ?? 0)}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{row.total?.count ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">Không có dữ liệu</div>;
  return (
    <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gmv-table-head">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Khối</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Team</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">GMV Final</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">Doanh thu VNĐ</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">GMV RMB</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">Số đơn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t border-gmv-border hover:bg-gmv-bg/50">
              <td className="px-4 py-2.5 font-medium">{r.khoi ?? "—"}</td>
              <td className="px-4 py-2.5">{r.team ?? "—"}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtGMV(r.gmv_final ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtVND(r.real_pay_vnd ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtGMV(r.gmv_rmb ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{(r.count ?? 0).toLocaleString("vi-VN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChannelTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">Không có dữ liệu</div>;
  return (
    <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gmv-table-head">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Kênh</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">GMV Final</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">Doanh thu VNĐ</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">GMV RMB</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">Số đơn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t border-gmv-border hover:bg-gmv-bg/50">
              <td className="px-4 py-2.5 font-medium">{r.channel ?? r.channel_type ?? "—"}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtGMV(r.gmv_final ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtVND(r.real_pay_vnd ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtGMV(r.gmv_rmb ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{(r.count ?? 0).toLocaleString("vi-VN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════
   Sub-tab: Đối soát
   ═══════════════════════════════════════ */
function ReconSubTab() {
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/v1/recon/internal");
        setWarnings(res.data?.warnings || res.data?.data || []);
      } catch (err) {
        console.error("Fetch recon failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const warningTypeLabel: Record<string, { label: string; tone: string }> = {
    DUPLICATE: { label: "Trùng đơn", tone: "bg-red-100 text-red-700" },
    MISSING_DATA: { label: "Thiếu trường", tone: "bg-orange-100 text-orange-700" },
    ORPHAN_DATA: { label: "Sale/kênh lạ", tone: "bg-yellow-100 text-yellow-700" },
    RATE_DEVIATION: { label: "Lệch tỷ giá", tone: "bg-blue-100 text-blue-700" },
  };

  if (loading) return <TableSkeleton cols={4} rows={6} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-base font-semibold text-gmv-text-strong">Đối soát nội bộ</h3>
        <span className="rounded-full bg-gmv-bg px-2.5 py-0.5 text-xs font-medium text-gmv-muted">
          {warnings.length} cảnh báo
        </span>
      </div>
      {warnings.length === 0 ? (
        <div className="rounded-gmv-lg border-2 border-dashed border-green-200 bg-green-50 px-6 py-12 text-center text-sm text-green-700">
          Không có cảnh báo — dữ liệu sạch
        </div>
      ) : (
        <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gmv-table-head">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Loại</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">UID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Ngày</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">VNĐ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {warnings.map((w: any, i: number) => {
                const type = w.warning_type ?? w.type ?? "UNKNOWN";
                const meta = warningTypeLabel[type] ?? { label: type, tone: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={i} className="border-t border-gmv-border hover:bg-gmv-bg/50">
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", meta.tone)}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{w.uid ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs">{w.day ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-mono">{w.real_pay_vnd != null ? Number(w.real_pay_vnd).toLocaleString("vi-VN") : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gmv-muted">
                      {w.message ?? (w.details ? JSON.stringify(w.details) : "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Sub-tab: Danh mục (AG Grid editable)
   ═══════════════════════════════════════ */
function MasterSubTab({ canWrite }: { canWrite: boolean }) {
  const toast = useToast();
  const [activeMaster, setActiveMaster] = useState<MasterTab>("sales");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const current = MASTER_TABS_META.find((t) => t.id === activeMaster)!;

  const fetchMaster = useCallback(async () => {
    setLoading(true);
    try {
      if (activeMaster === "customers") {
        setLoading(false);
        return;
      }
      const res = await api.get(current.endpoint);
      setRows(res.data || []);
    } catch (err) {
      console.error(`Fetch ${activeMaster} failed:`, err);
    } finally {
      setLoading(false);
    }
  }, [activeMaster, current.endpoint]);

  useEffect(() => {
    setSearch("");
    setRows([]);
    fetchMaster();
  }, [fetchMaster]);

  // Customer search
  useEffect(() => {
    if (activeMaster !== "customers") return;
    if (!search.trim() || search.trim().length < 2) { setRows([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get("/api/v1/customers/search", { params: { q: search.trim() } });
        setRows(res.data || []);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, activeMaster]);

  // Filtered rows for local search on non-customer tabs
  const filteredRows = useMemo(() => {
    if (activeMaster === "customers") return rows;
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, search, activeMaster]);

  // AG Grid column defs for master tables
  const masterColDefs = useMemo((): ColDef[] => {
    return current.columns.map((col) => ({
      field: col.key,
      headerName: col.label,
      flex: 1,
      minWidth: 100,
      editable: canWrite && (col.editable ?? false),
      ...(col.key === "active" || col.key === "fixed" ? {
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["true", "false"] },
        valueFormatter: (p: any) => p.value === true || p.value === "true" ? "Active" : "Inactive",
        cellRenderer: (p: any) => {
          const v = p.value === true || p.value === "true";
          return <BoolBadge value={v} yes="Active" no="Inactive" />;
        },
      } : {}),
    }));
  }, [current.columns, canWrite]);

  const masterDefaultColDef = useMemo((): ColDef => ({
    sortable: true,
    resizable: true,
    suppressMovable: true,
  }), []);

  // Inline edit for master tables
  const handleMasterEdit = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue } = event;
    const field = colDef.field!;
    const id = data.id ?? data.uid;
    const table = activeMaster;

    // For customers, use PATCH /master/customers/{uid}
    const url = table === "customers"
      ? `/api/v1/payments/master/customers/${id}`
      : `/api/v1/payments/master/${table}/${id}`;

    try {
      let patchVal: unknown = newValue;
      if (field === "active" || field === "fixed") patchVal = newValue === "true" || newValue === true;
      await api.patch(url, { [field]: patchVal });
      toast.show(`Đã lưu ${colDef.headerName}`, "ok");
    } catch {
      data[field] = oldValue;
      event.api.applyTransaction({ update: [data] });
      toast.show(`Lỗi cập nhật ${colDef.headerName}`, "danger");
    }
  }, [activeMaster, toast]);

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />

      <div className="flex gap-1">
        {MASTER_TABS_META.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveMaster(tab.id)}
            className={cn("rounded-gmv-md px-3 py-1.5 text-sm font-medium transition",
              activeMaster === tab.id ? "bg-gmv-primary text-white shadow-gmv-1" : "bg-gmv-bg text-gmv-muted hover:text-gmv-text"
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {canWrite && activeMaster !== "customers" && (
          <button type="button" onClick={() => setShowAdd(true)} className={cn(btnPrimary, "gap-1.5")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Thêm {current.label}
          </button>
        )}
        <div className="hidden flex-1 sm:block" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={activeMaster === "customers" ? "Nhập uid, tên hoặc SĐT để tìm..." : `Tìm ${current.label.toLowerCase()}...`}
          className={cn(inputCls, "w-full sm:w-64")} />
      </div>

      {loading ? <TableSkeleton cols={current.columns.length} rows={6} /> : filteredRows.length === 0 ? (
        <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">
          {activeMaster === "customers" && !search.trim() ? "Nhập ít nhất 2 ký tự để tìm khách hàng" : "Không có dữ liệu"}
        </div>
      ) : (
        <div style={{ height: "calc(100vh - 340px)", minHeight: "320px", width: "100%" }}>
          <AgGridReact
            theme={gridTheme}
            rowData={filteredRows}
            columnDefs={masterColDefs}
            defaultColDef={masterDefaultColDef}
            getRowId={(params) => String(params.data.id ?? params.data.uid ?? Math.random())}
            onCellValueChanged={handleMasterEdit}
            stopEditingWhenCellsLoseFocus
            singleClickEdit={false}
            animateRows={false}
          />
        </div>
      )}

      {!loading && filteredRows.length > 0 && (
        <p className="text-xs text-gmv-muted">{filteredRows.length.toLocaleString("vi-VN")} dòng</p>
      )}

      <AddMasterDialog open={showAdd} onClose={() => setShowAdd(false)} masterTab={activeMaster}
        onSuccess={() => { fetchMaster(); toast.show(`Đã thêm ${current.label}`, "ok"); }} />
    </div>
  );
}

/* ── GMV Settings Dialog (manager+ only) ── */
function GmvSettingsDialog({ open, onClose, gmvRule, onSaved }: {
  open: boolean; onClose: () => void; gmvRule: GmvRuleMeta; onSaved: (rule: GmvRuleMeta) => void;
}) {
  const [rate, setRate] = useState(String(gmvRule.exchange_rate));
  const [cutoff, setCutoff] = useState(gmvRule.cutoff_at.slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setRate(String(gmvRule.exchange_rate));
      setCutoff(gmvRule.cutoff_at.slice(0, 10));
      setError("");
    }
  }, [open, gmvRule]);

  const handleSave = async () => {
    const rateNum = Number(rate);
    if (!rateNum || rateNum <= 0) { setError("Tỷ giá phải > 0"); return; }
    setSaving(true);
    setError("");
    try {
      const body: { exchange_rate?: number; cutoff_at?: string } = {};
      if (rateNum !== gmvRule.exchange_rate) body.exchange_rate = rateNum;
      if (cutoff !== gmvRule.cutoff_at.slice(0, 10)) body.cutoff_at = `${cutoff}T00:00:00+00:00`;
      if (Object.keys(body).length === 0) { onClose(); return; }
      const res = await api.put("/api/v1/settings/gmv", body);
      onSaved({
        exchange_rate: Number(res.data.exchange_rate),
        cutoff_at: String(res.data.cutoff_at),
      });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Lỗi khi lưu cài đặt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Cài đặt tỷ giá GMV">
      <div className="flex flex-col gap-4">
        <FormField label="Tỷ giá (VND/RMB)" required>
          <input type="number" value={rate} onChange={(e) => setRate(e.target.value)}
            min="1" step="100" className={cn(inputCls, "w-full")} />
        </FormField>
        <FormField label="Mốc áp dụng (cutoff date)">
          <input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)}
            className={cn(inputCls, "w-full")} />
        </FormField>
        <p className="text-xs text-gmv-muted">
          Trước mốc cutoff: GMV = gmv_rmb. Từ mốc cutoff: GMV = real_pay_vnd / tỷ giá.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>Huỷ</button>
          <button type="button" onClick={handleSave} disabled={saving} className={btnPrimary}>
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ═══════════════════════════════════════
   Main PaymentsTab
   ═══════════════════════════════════════ */
export default function PaymentsTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("grid");
  const [gmvRule, setGmvRule] = useState<GmvRuleMeta>(DEFAULT_GMV_RULE);
  const { readOnly } = usePermission("payments");
  const { profile } = useMe();
  const canWrite = !readOnly;
  const isMobile = useIsMobile();
  const isManager = profile?.role === "manager" || profile?.role === "system";
  const [showGmvSettings, setShowGmvSettings] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get("/api/v1/payments/meta")
      .then((res) => {
        const rule = res.data?.gmv_rule;
        if (!alive || !rule?.exchange_rate || !rule?.cutoff_at) return;
        setGmvRule({
          exchange_rate: Number(rule.exchange_rate),
          cutoff_at: String(rule.cutoff_at),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 112px)" }}>
      <div className="mb-2 flex shrink-0 items-center gap-1 overflow-x-auto rounded-gmv-lg bg-gmv-bg p-1 sm:gap-1.5 sm:p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SUB_TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveSubTab(tab.id)}
            className={cn("shrink-0 rounded-gmv-md px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:py-2 sm:text-sm",
              activeSubTab === tab.id ? tab.activeClass : tab.inactiveClass
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {/* Grid stays mounted (hidden) to preserve state + master data across tab switches */}
        <div className={activeSubTab === "grid" ? "flex h-full flex-col" : "hidden"}>
          <GridSubTab canWrite={canWrite} gmvRule={gmvRule} isMobile={isMobile} isManager={isManager} onOpenGmvSettings={() => setShowGmvSettings(true)} />
        </div>
        {activeSubTab === "reports" && <ReportsSubTab />}
        {activeSubTab === "recon" && <ReconSubTab />}
        {activeSubTab === "master" && <MasterSubTab canWrite={canWrite} />}
      </div>

      <GmvSettingsDialog
        open={showGmvSettings}
        onClose={() => setShowGmvSettings(false)}
        gmvRule={gmvRule}
        onSaved={setGmvRule}
      />
    </div>
  );
}
