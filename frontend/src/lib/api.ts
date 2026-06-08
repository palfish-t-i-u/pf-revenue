import axios from "axios";
import { resolveApiBaseUrl } from "./apiBaseUrl";
import { supabase } from "./supabase";

export const API_BASE_URL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const endpoints = {
  me: {
    get: () => api.get("/me"),
    patch: (body: {
      displayName?: string;
      phone?: string;
      crmName?: string;
    }) => api.patch("/me", body),
  },
  admin: {
    sales: (params?: { team?: string; role?: string; q?: string }) =>
      api.get("/admin/sales", { params }),
    patchSale: (
      crmName: string,
      body: {
        email?: string;
        role?: string;
        team?: string;
        subTeam?: string;
        managerEmail?: string;
        leaderEmail?: string;
        isActive?: boolean;
        displayName?: string;
        phone?: string;
      }
    ) => api.patch(`/admin/sales/${encodeURIComponent(crmName)}`, body),
    syncSales: () => api.post("/admin/sales/sync"),
    authUsers: () => api.get("/admin/auth-users"),
    patchAuthUser: (
      userId: string,
      body: {
        banned?: boolean;
        role?: string;
        crmName?: string;
        is_activated?: boolean;
        full_name?: string;
        phone?: string;
        department?: string;
        team?: string;
        sub_team?: string;
      }
    ) => api.patch(`/admin/auth-users/${userId}`, body),
    createAuthUser: (body: {
      email: string;
      password: string;
      full_name?: string;
      phone?: string;
      department?: string;
      team?: string;
      crmName?: string;
      role?: string;
      is_activated?: boolean;
    }) => api.post("/admin/auth-users", body),
    bulkDeleteAuthUsers: (userIds: string[]) =>
      api.post<{
        ok: boolean;
        deleted: number;
        deletedIds: string[];
        errors: { userId: string; email: string | null; error: string }[];
      }>("/admin/auth-users/bulk-delete", { user_ids: userIds }),
    permissions: () => api.get("/admin/permissions"),
    seedPermissions: () => api.post("/admin/permissions/seed"),
    patchPermission: (body: {
      department: string;
      module_key: string;
      access_level: string;
      min_role?: string;
    }) => api.patch("/admin/permissions", body),
    permissionOverrides: () => api.get("/admin/permission-overrides"),
    createPermissionOverride: (body: {
      email: string;
      module_key: string;
      access_level: string;
    }) => api.post("/admin/permission-overrides", body),
    deletePermissionOverride: (email: string, moduleKey: string) =>
      api.delete("/admin/permission-overrides", { params: { email, module_key: moduleKey } }),
    bulkOverride: (body: {
      email: string;
      overrides: Record<string, string>;
    }) => api.put("/admin/permission-overrides/bulk", body),
  },
};
