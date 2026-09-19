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
    // Handle 401 - session expired/invalid
    if (res.status === 401) {
      await supabase.auth.signOut();
      window.location.reload();
    }
    const err = new Error(data?.detail || res.statusText);
    err.status = res.status;
    err.detail = data?.detail;
    throw err;
  }
  return data;
}

async function uploadFile(path, file, extraFields = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const slug = getWorkspaceSlug();
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  const headers = { Authorization: `Bearer ${token}` };
  if (slug) headers["X-Workspace-Slug"] = slug;
  const res = await fetch(`${BASE}/api${path}`, { method: "POST", headers, body: form });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // Handle 401 - session expired/invalid
    if (res.status === 401) {
      await supabase.auth.signOut();
      window.location.reload();
    }
    const err = new Error(body?.detail || res.statusText);
    err.status = res.status; err.detail = body?.detail;
    throw err;
  }
  return body;
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

  // Reports - S3 based
  listReports: (tag, year) => {
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (year) params.set("year", year);
    return request(`/reports${params.toString() ? `?${params.toString()}` : ""}`);
  },
  getReportYears: (tag) => request(`/reports/years?tag=${encodeURIComponent(tag)}`),
  uploadReport: async (file, tag, reportDate) => uploadFile("/reports/upload", file, { tag, report_date: reportDate }),
  downloadReport: (id) => request(`/reports/${encodeURIComponent(id)}/download`),
  deleteReport: (id) => request(`/reports/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Report Tags - S3 based
  reportTags: () => request("/reports/tags"),
  createTag: (name) => request("/reports/tags", { method: "POST", body: JSON.stringify({ name }) }),
  renameTag: (oldName, newName) => request(`/reports/tags/${encodeURIComponent(oldName)}`, { method: "PUT", body: JSON.stringify({ name: newName }) }),
  deleteTag: (name) => request(`/reports/tags/${encodeURIComponent(name)}`, { method: "DELETE" }),

  uploadEmployeePhoto: async (id, file) => uploadFile(`/employees/${id}/photo`, file),
  getEmployeePhotoUrl: (id) => request(`/employees/${id}/photo-url`),
  deleteEmployeePhoto: (id) => request(`/employees/${id}/photo`, { method: "DELETE" }),
  uploadEmployeeIdDoc: async (id, file) => uploadFile(`/employees/${id}/id-doc`, file),
  getEmployeeIdDocUrl: (id) => request(`/employees/${id}/id-doc`),
  deleteEmployeeIdDoc: (id) => request(`/employees/${id}/id-doc`, { method: "DELETE" }),
};
