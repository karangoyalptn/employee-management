// ZReports Factory OS — Node/Express backend
// Uses Supabase for Auth verification, Postgres tables (via PostgREST), and Storage.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CORS_ORIGINS = "*",
  PORT = 8001,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const REPORTS_BUCKET = "reports";
const PHOTOS_BUCKET = "employee-photos";
const ALLOWED_TAGS = ["Production", "Safety", "Finance", "HR", "Maintenance", "Quality", "Compliance"];
const ALLOWED_ACCESS = ["all", "management", "leadership", "admin"];
const ALLOWED_ROLES = ["admin", "leadership", "manager", "viewer"];
const FILENAME_RE = /^(\d{4}-\d{2}-\d{2})_([A-Za-z0-9][A-Za-z0-9 _\-]{1,80})\.pdf$/;

// Ensure storage buckets exist (best-effort)
(async () => {
  try {
    const { data: buckets } = await sb.storage.listBuckets();
    const names = new Set((buckets || []).map((b) => b.name));
    if (!names.has(REPORTS_BUCKET)) await sb.storage.createBucket(REPORTS_BUCKET, { public: false });
    if (!names.has(PHOTOS_BUCKET)) await sb.storage.createBucket(PHOTOS_BUCKET, { public: true });
  } catch (e) {
    console.warn("[startup] bucket bootstrap:", e.message);
  }
})();

const app = express();
app.use(cors({ origin: CORS_ORIGINS === "*" ? true : CORS_ORIGINS.split(",") }));
app.use(express.json());

const api = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ---------- helpers ----------
const httpErr = (res, status, detail) => res.status(status).json({ detail });

async function verifyToken(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return { error: { status: 401, detail: "Supabase session required" } };
  const token = h.slice(7);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { error: { status: 401, detail: "Session invalid or expired" } };
  return { user: data.user };
}

async function loadWorkspace(req) {
  const slug = req.headers["x-workspace-slug"];
  if (!slug) return { error: { status: 400, detail: "workspace_missing" } };
  const { data, error } = await sb.from("companies").select("*").eq("slug", slug).maybeSingle();
  if (error) return { error: { status: 500, detail: error.message } };
  if (!data) return { error: { status: 404, detail: "workspace_not_found" } };
  return { company: data };
}

async function currentProfile(req) {
  const t = await verifyToken(req);
  if (t.error) return t;
  const w = await loadWorkspace(req);
  if (w.error) return w;
  const { data, error } = await sb.from("user_profiles").select("*").eq("id", t.user.id).maybeSingle();
  if (error) return { error: { status: 500, detail: error.message } };
  if (!data) return { error: { status: 404, detail: "profile_not_found" } };
  if (data.company_id !== w.company.id) return { error: { status: 403, detail: "wrong_workspace" } };
  return { profile: data, company: w.company, user: t.user };
}

const requireRole = (profile, allowed) => allowed.includes(profile.role);
const canSeeSalary = (role) => role === "admin" || role === "leadership";
const accessibleLevels = (role) => {
  if (role === "admin") return ["all", "management", "leadership", "admin"];
  if (role === "leadership") return ["all", "management", "leadership"];
  if (role === "manager") return ["all", "management"];
  return ["all"];
};

const serializeEmployee = (e, role) => ({
  id: e.id,
  name: e.name,
  role: e.role,
  gender: e.gender,
  shift: e.shift,
  salary: canSeeSalary(role) && e.salary != null ? Number(e.salary) : null,
  aadhar_last4: e.aadhar_last4,
  pan_last4: e.pan_last4,
  photo_url: e.photo_url,
});

const nowIso = () => new Date().toISOString();

// ---------- Health ----------
api.get("/health", (_req, res) => res.json({ status: "ok", service: "zreports" }));

// ---------- Public workspace lookup ----------
api.get("/companies/lookup", async (req, res) => {
  const slug = req.query.slug;
  if (!slug) return httpErr(res, 400, "slug required");
  const { data, error } = await sb.from("companies").select("id,name,slug").eq("slug", slug).maybeSingle();
  if (error) return httpErr(res, 500, error.message);
  if (!data) return httpErr(res, 404, "workspace_not_found");
  res.json(data);
});

// ---------- Auth / Profile ----------
api.get("/auth/me", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  res.json({ profile: ctx.profile, company: ctx.company });
});

api.get("/auth/team", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  const { data, error } = await sb
    .from("user_profiles")
    .select("*")
    .eq("company_id", ctx.profile.company_id)
    .order("full_name", { ascending: true });
  if (error) return httpErr(res, 500, error.message);
  res.json(data);
});

api.post("/auth/team/invite", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin"])) return httpErr(res, 403, "Requires one of: admin");

  const { email, password, full_name, role } = req.body || {};
  if (!email || !password || !full_name || !role) return httpErr(res, 400, "email, password, full_name, role required");
  if (String(password).length < 8) return httpErr(res, 400, "password must be at least 8 characters");
  if (String(full_name).trim().length < 2) return httpErr(res, 400, "full_name too short");
  if (!ALLOWED_ROLES.includes(role)) return httpErr(res, 400, "invalid role");

  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr) return httpErr(res, 400, `auth_create_failed: ${cErr.message}`);

  const row = {
    id: created.user.id,
    email,
    full_name: full_name.trim(),
    role,
    company_id: ctx.profile.company_id,
    created_at: nowIso(),
  };
  const { data: prof, error: pErr } = await sb.from("user_profiles").insert(row).select().single();
  if (pErr) {
    // rollback supabase user on profile insert failure
    await sb.auth.admin.deleteUser(created.user.id).catch(() => {});
    return httpErr(res, 500, pErr.message);
  }
  res.status(201).json(prof);
});

api.patch("/auth/team/:userId/role", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin"])) return httpErr(res, 403, "Requires one of: admin");
  const { role } = req.body || {};
  if (!ALLOWED_ROLES.includes(role)) return httpErr(res, 400, "invalid role");

  const { userId } = req.params;
  const { data: target } = await sb.from("user_profiles").select("*").eq("id", userId).maybeSingle();
  if (!target || target.company_id !== ctx.profile.company_id) return httpErr(res, 404, "user not found");
  if (target.id === ctx.profile.id && role !== "admin") return httpErr(res, 400, "cannot demote yourself");

  const { data, error } = await sb.from("user_profiles").update({ role }).eq("id", userId).select().single();
  if (error) return httpErr(res, 500, error.message);
  res.json(data);
});

api.post("/auth/team/:userId/reset-password", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin"])) return httpErr(res, 403, "Requires one of: admin");
  const { password } = req.body || {};
  if (!password || String(password).length < 8) return httpErr(res, 400, "password must be at least 8 characters");
  const { userId } = req.params;
  const { data: target } = await sb.from("user_profiles").select("*").eq("id", userId).maybeSingle();
  if (!target || target.company_id !== ctx.profile.company_id) return httpErr(res, 404, "user not found");
  const { error } = await sb.auth.admin.updateUserById(userId, { password });
  if (error) return httpErr(res, 400, `reset_failed: ${error.message}`);
  res.status(204).end();
});

api.delete("/auth/team/:userId", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin"])) return httpErr(res, 403, "Requires one of: admin");
  const { userId } = req.params;
  if (userId === ctx.profile.id) return httpErr(res, 400, "cannot remove yourself");
  const { data: target } = await sb.from("user_profiles").select("*").eq("id", userId).maybeSingle();
  if (!target || target.company_id !== ctx.profile.company_id) return httpErr(res, 404, "user not found");
  await sb.auth.admin.deleteUser(userId).catch(() => {});
  await sb.from("user_profiles").delete().eq("id", userId);
  res.status(204).end();
});

// ---------- Employees ----------
api.get("/employees", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  const { search = "", shift = "" } = req.query;
  let q = sb.from("employees").select("*").eq("company_id", ctx.profile.company_id).order("name", { ascending: true });
  if (search) q = q.or(`name.ilike.%${search}%,role.ilike.%${search}%`);
  if (shift) q = q.eq("shift", shift);
  const { data, error } = await q;
  if (error) return httpErr(res, 500, error.message);
  res.json(data.map((e) => serializeEmployee(e, ctx.profile.role)));
});

api.post("/employees", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership", "manager"])) return httpErr(res, 403, "Requires one of: admin, leadership, manager");
  const b = req.body || {};
  if (!b.name || b.name.length < 2) return httpErr(res, 400, "name required");
  if (!b.gender || !b.shift) return httpErr(res, 400, "gender and shift required");
  const salaryNum = Number(b.salary);
  if (!Number.isFinite(salaryNum) || salaryNum < 0) return httpErr(res, 400, "invalid salary");
  const row = {
    id: crypto.randomUUID(),
    company_id: ctx.profile.company_id,
    name: b.name,
    role: b.role || null,
    gender: b.gender,
    shift: b.shift,
    salary: salaryNum,
    aadhar_last4: b.aadhar_last4 || null,
    pan_last4: b.pan_last4 || null,
    photo_url: b.photo_url || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const { data, error } = await sb.from("employees").insert(row).select().single();
  if (error) return httpErr(res, 500, error.message);
  res.status(201).json(serializeEmployee(data, ctx.profile.role));
});

api.patch("/employees/:id", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership", "manager"])) return httpErr(res, 403, "Requires one of: admin, leadership, manager");
  const { id } = req.params;
  const { data: existing } = await sb.from("employees").select("*").eq("id", id).maybeSingle();
  if (!existing || existing.company_id !== ctx.profile.company_id) return httpErr(res, 404, "Employee not found");
  const b = req.body || {};
  const patch = {
    name: b.name ?? existing.name,
    role: b.role ?? existing.role,
    gender: b.gender ?? existing.gender,
    shift: b.shift ?? existing.shift,
    aadhar_last4: b.aadhar_last4 ?? existing.aadhar_last4,
    pan_last4: b.pan_last4 ?? existing.pan_last4,
    photo_url: b.photo_url ?? existing.photo_url,
    updated_at: nowIso(),
  };
  if (canSeeSalary(ctx.profile.role) && b.salary != null) {
    const s = Number(b.salary);
    if (Number.isFinite(s) && s >= 0) patch.salary = s;
  }
  const { data, error } = await sb.from("employees").update(patch).eq("id", id).select().single();
  if (error) return httpErr(res, 500, error.message);
  res.json(serializeEmployee(data, ctx.profile.role));
});

api.delete("/employees/:id", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership"])) return httpErr(res, 403, "Requires one of: admin, leadership");
  const { id } = req.params;
  const { data: existing } = await sb.from("employees").select("*").eq("id", id).maybeSingle();
  if (!existing || existing.company_id !== ctx.profile.company_id) return httpErr(res, 404, "Employee not found");
  await sb.from("absences").delete().eq("employee_id", id);
  const { error } = await sb.from("employees").delete().eq("id", id);
  if (error) return httpErr(res, 500, error.message);
  res.status(204).end();
});

// ---------- Reports ----------
api.get("/reports/tags", (_req, res) => res.json({ tags: ALLOWED_TAGS, access_levels: ALLOWED_ACCESS }));

api.get("/reports", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  const levels = accessibleLevels(ctx.profile.role);
  let q = sb.from("reports").select("*")
    .eq("company_id", ctx.profile.company_id)
    .in("access", levels)
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (req.query.tag) q = q.eq("tag", req.query.tag);
  const { data, error } = await q;
  if (error) return httpErr(res, 500, error.message);
  res.json(data.map((r) => ({
    id: r.id, name: r.name, tag: r.tag, report_date: r.report_date,
    access: r.access, uploaded_by: r.uploaded_by, storage_path: r.storage_path,
  })));
});

api.post("/reports/upload", upload.single("file"), async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership"])) return httpErr(res, 403, "Requires one of: admin, leadership");

  const { tag, access = "leadership" } = req.body || {};
  if (!ALLOWED_TAGS.includes(tag)) return httpErr(res, 400, `Tag must be one of: ${ALLOWED_TAGS.join(", ")}`);
  if (!ALLOWED_ACCESS.includes(access)) return httpErr(res, 400, `Access must be one of: ${ALLOWED_ACCESS.join(", ")}`);
  if (!req.file) return httpErr(res, 400, "file required");

  const filename = req.file.originalname;
  const m = FILENAME_RE.exec(filename);
  if (!m) return httpErr(res, 400, "Filename must match YYYY-MM-DD_ReportName.pdf (letters, digits, spaces, - or _)");
  const reportDate = m[1];
  const buf = req.file.buffer;
  if (buf.slice(0, 4).toString() !== "%PDF") return httpErr(res, 400, "Only PDF files are accepted");

  const storagePath = `${ctx.profile.company_id}/${crypto.randomUUID()}_${filename}`;
  const { error: upErr } = await sb.storage.from(REPORTS_BUCKET).upload(storagePath, buf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return httpErr(res, 500, `storage: ${upErr.message}`);

  const row = {
    id: crypto.randomUUID(),
    company_id: ctx.profile.company_id,
    name: filename,
    tag,
    report_date: reportDate,
    access,
    storage_path: storagePath,
    uploaded_by: ctx.profile.full_name,
    uploaded_by_id: ctx.profile.id,
    created_at: nowIso(),
  };
  const { data, error } = await sb.from("reports").insert(row).select().single();
  if (error) return httpErr(res, 500, error.message);
  res.status(201).json({
    id: data.id, name: data.name, tag: data.tag, report_date: data.report_date,
    access: data.access, uploaded_by: data.uploaded_by, storage_path: data.storage_path,
  });
});

api.get("/reports/:id/download", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  const { data: r } = await sb.from("reports").select("*").eq("id", req.params.id).maybeSingle();
  if (!r || r.company_id !== ctx.profile.company_id) return httpErr(res, 404, "Report not found");
  if (!accessibleLevels(ctx.profile.role).includes(r.access)) return httpErr(res, 403, "You do not have access to this report");
  const { data, error } = await sb.storage.from(REPORTS_BUCKET).createSignedUrl(r.storage_path, 300);
  if (error) return httpErr(res, 500, error.message);
  res.json({ url: data.signedUrl });
});

api.delete("/reports/:id", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership"])) return httpErr(res, 403, "Requires one of: admin, leadership");
  const { data: r } = await sb.from("reports").select("*").eq("id", req.params.id).maybeSingle();
  if (!r || r.company_id !== ctx.profile.company_id) return httpErr(res, 404, "Report not found");
  await sb.storage.from(REPORTS_BUCKET).remove([r.storage_path]).catch(() => {});
  const { error } = await sb.from("reports").delete().eq("id", req.params.id);
  if (error) return httpErr(res, 500, error.message);
  res.status(204).end();
});

// multer / global error
app.use((err, _req, res, _next) => {
  if (err) return res.status(400).json({ detail: err.message });
});

app.use("/api", api);

app.listen(PORT, "0.0.0.0", () => console.log(`ZReports API listening on 0.0.0.0:${PORT}`));
