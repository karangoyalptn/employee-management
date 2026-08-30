import { supabase } from "@/lib/supabase";

const BASE = process.env.REACT_APP_BACKEND_URL;

/**
 * Resolve the current workspace slug from the URL.
 * - Production: <slug>.manage.zreports.com  → subdomain
 * - Preview / dev fallback: ?w=<slug>       → query param (persisted to localStorage)
 * Returns null if none found.
 */
export function getWorkspaceSlug() {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("w");
    if (q) { localStorage.setItem("apex_workspace", q); return q; }

    const host = window.location.hostname;
    // <slug>.manage.<root>
    const m = host.match(/^([a-z0-9][a-z0-9-]{1,60}[a-z0-9])\.manage\./i);
    if (m) return m[1].toLowerCase();

    return localStorage.getItem("apex_workspace");
  } catch { return null; }
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const slug = getWorkspaceSlug();
  if (slug) headers["X-Workspace-Slug"] = slug;
  return headers;
}

async function request(path, options = {}) {
  const headers = { ...(await authHeaders()), ...(options.headers || {}) };
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.detail || res.statusText);
    err.status = res.status;
    err.detail = data?.detail;
    throw err;
  }
  return data;
}

export const api = {
  lookupCompany: (slug) => request(`/companies/lookup?slug=${encodeURIComponent(slug)}`),

  me: () => request("/auth/me"),

  team: () => request("/auth/team"),
  inviteMember: (payload) => request("/auth/team/invite", { method: "POST", body: JSON.stringify(payload) }),
  updateTeamRole: (id, role) => request(`/auth/team/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  resetPassword: (id, password) => request(`/auth/team/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  removeMember: (id) => request(`/auth/team/${id}`, { method: "DELETE" }),

  listEmployees: (search, shift) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (shift) params.set("shift", shift);
    return request(`/employees${params.toString() ? `?${params.toString()}` : ""}`);
  },
  createEmployee: (payload) => request("/employees", { method: "POST", body: JSON.stringify(payload) }),
  updateEmployee: (id, payload) => request(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteEmployee: (id) => request(`/employees/${id}`, { method: "DELETE" }),

  listAbsences: (employeeId) => request(`/employees/${employeeId}/absences`),
  addAbsence: (employeeId, payload) => request(`/employees/${employeeId}/absences`, { method: "POST", body: JSON.stringify(payload) }),
  deleteAbsence: (absenceId) => request(`/absences/${absenceId}`, { method: "DELETE" }),

  listReports: (tag) => request(`/reports${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`),
  reportTags: () => request("/reports/tags"),
  uploadReport: async (file, tag, access) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const slug = getWorkspaceSlug();
    const form = new FormData();
    form.append("file", file);
    form.append("tag", tag);
    form.append("access", access);
    const headers = { Authorization: `Bearer ${token}` };
    if (slug) headers["X-Workspace-Slug"] = slug;
    const res = await fetch(`${BASE}/api/reports/upload`, { method: "POST", headers, body: form });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(body?.detail || res.statusText);
      err.status = res.status; err.detail = body?.detail;
      throw err;
    }
    return body;
  },
  downloadReport: (id) => request(`/reports/${id}/download`),
  deleteReport: (id) => request(`/reports/${id}`, { method: "DELETE" }),
};
