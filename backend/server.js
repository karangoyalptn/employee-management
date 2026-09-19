// ZReports Factory OS — Node/Express backend
// Uses Supabase for Auth verification, Postgres tables (via PostgREST), and S3 for reports.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, CopyObjectCommand, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CORS_ORIGINS = "*",
  PORT = 8001,
  AWS_REGION = "us-east-1",
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  S3_REPORTS_BUCKET = "zreports-documents",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error("Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY in env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const ALLOWED_ROLES = ["admin", "leadership", "manager", "viewer"];
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_ID_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

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

const serializeEmployee = (e, role) => ({
  id: e.id,
  name: e.name,
  role: e.role,
  gender: e.gender,
  shift: e.shift,
  salary: canSeeSalary(role) && e.salary != null ? Number(e.salary) : null,
  aadhar_last4: e.aadhar_last4,
  pan_last4: e.pan_last4,
  has_id_doc: !!e.id_doc_path,
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

  // Delete all S3 files for this employee (photo and ID doc)
  try {
    const prefix = `${existing.company_id}/employees/${id}/`;
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
    });
    const s3Files = await s3Client.send(listCommand);

    if (s3Files.Contents && s3Files.Contents.length > 0) {
      for (const file of s3Files.Contents) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_REPORTS_BUCKET,
          Key: file.Key,
        })).catch(() => {});
      }
    }
  } catch (e) {
    console.warn("Failed to delete S3 files for employee:", e.message);
  }

  // Delete absences and employee record
  await sb.from("absences").delete().eq("employee_id", id);
  const { error } = await sb.from("employees").delete().eq("id", id);
  if (error) return httpErr(res, 500, error.message);
  res.status(204).end();
});

// ---------- Employee photo & ID doc ----------
const uploadPhoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const uploadIdDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function loadEmployeeInWorkspace(id, companyId) {
  const { data } = await sb.from("employees").select("*").eq("id", id).maybeSingle();
  if (!data || data.company_id !== companyId) return null;
  return data;
}

api.post("/employees/:id/photo", uploadPhoto.single("file"), async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership", "manager"])) return httpErr(res, 403, "Requires one of: admin, leadership, manager");
  if (!req.file) return httpErr(res, 400, "file required");
  if (!ALLOWED_IMAGE_MIME.has(req.file.mimetype)) return httpErr(res, 400, "photo must be JPEG, PNG or WebP");
  const emp = await loadEmployeeInWorkspace(req.params.id, ctx.profile.company_id);
  if (!emp) return httpErr(res, 404, "Employee not found");

  const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const s3Path = `${ctx.profile.company_id}/employees/${emp.id}/photo.${ext}`;

  try {
    // Delete old photos with different extensions (best-effort)
    const prefix = `${ctx.profile.company_id}/employees/${emp.id}/photo.`;
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
    });
    const existingFiles = await s3Client.send(listCommand);
    if (existingFiles.Contents) {
      for (const file of existingFiles.Contents) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_REPORTS_BUCKET,
          Key: file.Key,
        })).catch(() => {});
      }
    }

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_REPORTS_BUCKET,
      Key: s3Path,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        employee_id: emp.id,
        company_id: ctx.profile.company_id,
        uploaded_by: ctx.profile.full_name,
        uploaded_at: new Date().toISOString(),
      },
    }));

    res.status(201).json({ success: true });
  } catch (error) {
    return httpErr(res, 500, `S3 upload: ${error.message}`);
  }
});

api.delete("/employees/:id/photo", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership", "manager"])) return httpErr(res, 403, "Requires one of: admin, leadership, manager");
  const emp = await loadEmployeeInWorkspace(req.params.id, ctx.profile.company_id);
  if (!emp) return httpErr(res, 404, "Employee not found");

  try {
    // List and delete all photo files for this employee
    const prefix = `${ctx.profile.company_id}/employees/${emp.id}/photo.`;
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
    });
    const existingFiles = await s3Client.send(listCommand);

    if (existingFiles.Contents && existingFiles.Contents.length > 0) {
      for (const file of existingFiles.Contents) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_REPORTS_BUCKET,
          Key: file.Key,
        })).catch(() => {});
      }
    }

    res.status(204).end();
  } catch (error) {
    return httpErr(res, 500, `S3 delete: ${error.message}`);
  }
});

// Get signed URL for photo
api.get("/employees/:id/photo-url", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  const emp = await loadEmployeeInWorkspace(req.params.id, ctx.profile.company_id);
  if (!emp) return httpErr(res, 404, "Employee not found");

  try {
    // List objects with photo prefix to find the file
    const prefix = `${ctx.profile.company_id}/employees/${emp.id}/photo.`;
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
      MaxKeys: 1,
    });
    const result = await s3Client.send(listCommand);

    if (!result.Contents || result.Contents.length === 0) {
      return httpErr(res, 404, "Photo not found");
    }

    const photoKey = result.Contents[0].Key;
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: S3_REPORTS_BUCKET,
        Key: photoKey,
      }),
      { expiresIn: 3600 } // 1 hour
    );
    res.json({ url: signedUrl });
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

api.post("/employees/:id/id-doc", uploadIdDoc.single("file"), async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership", "manager"])) return httpErr(res, 403, "Requires one of: admin, leadership, manager");
  if (!req.file) return httpErr(res, 400, "file required");
  if (!ALLOWED_ID_MIME.has(req.file.mimetype)) return httpErr(res, 400, "ID doc must be PDF, JPEG or PNG");
  const emp = await loadEmployeeInWorkspace(req.params.id, ctx.profile.company_id);
  if (!emp) return httpErr(res, 404, "Employee not found");

  const ext = (req.file.originalname.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const s3Path = `${ctx.profile.company_id}/employees/${emp.id}/id-doc.${ext}`;

  try {
    // Delete old ID docs with different extensions (best-effort)
    const prefix = `${ctx.profile.company_id}/employees/${emp.id}/id-doc.`;
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
    });
    const existingFiles = await s3Client.send(listCommand);
    if (existingFiles.Contents) {
      for (const file of existingFiles.Contents) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_REPORTS_BUCKET,
          Key: file.Key,
        })).catch(() => {});
      }
    }

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_REPORTS_BUCKET,
      Key: s3Path,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        employee_id: emp.id,
        company_id: ctx.profile.company_id,
        uploaded_by: ctx.profile.full_name,
        uploaded_at: new Date().toISOString(),
      },
    }));

    res.status(201).json({ success: true });
  } catch (error) {
    return httpErr(res, 500, `S3 upload: ${error.message}`);
  }
});

api.get("/employees/:id/id-doc", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership"])) return httpErr(res, 403, "ID docs viewable only by Admin/Leadership");
  const emp = await loadEmployeeInWorkspace(req.params.id, ctx.profile.company_id);
  if (!emp) return httpErr(res, 404, "Employee not found");

  try {
    // List objects with id-doc prefix to find the file
    const prefix = `${ctx.profile.company_id}/employees/${emp.id}/id-doc.`;
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
      MaxKeys: 1,
    });
    const result = await s3Client.send(listCommand);

    if (!result.Contents || result.Contents.length === 0) {
      return httpErr(res, 404, "Document not found");
    }

    const docKey = result.Contents[0].Key;
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: S3_REPORTS_BUCKET,
        Key: docKey,
      }),
      { expiresIn: 3600 } // 1 hour
    );
    res.json({ url: signedUrl });
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

api.delete("/employees/:id/id-doc", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership", "manager"])) return httpErr(res, 403, "Requires one of: admin, leadership, manager");
  const emp = await loadEmployeeInWorkspace(req.params.id, ctx.profile.company_id);
  if (!emp) return httpErr(res, 404, "Employee not found");

  try {
    // List and delete all ID doc files for this employee
    const prefix = `${ctx.profile.company_id}/employees/${emp.id}/id-doc.`;
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
    });
    const existingFiles = await s3Client.send(listCommand);

    if (existingFiles.Contents && existingFiles.Contents.length > 0) {
      for (const file of existingFiles.Contents) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_REPORTS_BUCKET,
          Key: file.Key,
        })).catch(() => {});
      }
    }

    res.status(204).end();
  } catch (error) {
    return httpErr(res, 500, `S3 delete: ${error.message}`);
  }
});

// ---------- Absences ----------
api.get("/employees/:id/absences", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  const { id } = req.params;
  const { data: emp } = await sb.from("employees").select("id,company_id").eq("id", id).maybeSingle();
  if (!emp || emp.company_id !== ctx.profile.company_id) return httpErr(res, 404, "Employee not found");
  const { data, error } = await sb
    .from("absences")
    .select("*")
    .eq("employee_id", id)
    .order("absence_date", { ascending: false });
  if (error) return httpErr(res, 500, error.message);
  res.json(data);
});

api.post("/employees/:id/absences", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership", "manager"])) return httpErr(res, 403, "Requires one of: admin, leadership, manager");
  const { id } = req.params;
  const { data: emp } = await sb.from("employees").select("id,company_id").eq("id", id).maybeSingle();
  if (!emp || emp.company_id !== ctx.profile.company_id) return httpErr(res, 404, "Employee not found");
  const { absence_date, reason } = req.body || {};
  if (!absence_date || !/^\d{4}-\d{2}-\d{2}$/.test(absence_date)) return httpErr(res, 400, "absence_date must be YYYY-MM-DD");
  const row = {
    id: crypto.randomUUID(),
    employee_id: id,
    absence_date,
    reason: reason ? String(reason).slice(0, 500) : null,
    created_at: nowIso(),
  };
  const { data, error } = await sb.from("absences").insert(row).select().single();
  if (error) return httpErr(res, 500, error.message);
  res.status(201).json(data);
});

api.delete("/absences/:absenceId", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership", "manager"])) return httpErr(res, 403, "Requires one of: admin, leadership, manager");
  const { absenceId } = req.params;
  const { data: abs } = await sb.from("absences").select("id,employee_id").eq("id", absenceId).maybeSingle();
  if (!abs) return httpErr(res, 404, "Absence not found");
  const { data: emp } = await sb.from("employees").select("company_id").eq("id", abs.employee_id).maybeSingle();
  if (!emp || emp.company_id !== ctx.profile.company_id) return httpErr(res, 404, "Absence not found");
  const { error } = await sb.from("absences").delete().eq("id", absenceId);
  if (error) return httpErr(res, 500, error.message);
  res.status(204).end();
});

// ---------- Report Tags (S3-based) ----------
api.get("/reports/tags", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);

  try {
    const command = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: `${ctx.profile.company_id}/`,
      Delimiter: "/",
    });
    const response = await s3Client.send(command);

    const tags = (response.CommonPrefixes || [])
      .map((prefix) => {
        const parts = prefix.Prefix.split("/");
        return parts[1];
      })
      .filter(Boolean)
      .sort();

    res.json({ tags });
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

api.post("/reports/tags", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership"])) return httpErr(res, 403, "Requires one of: admin, leadership");

  const name = String(req.body?.name || "").trim();
  if (name.length < 2 || name.length > 60) return httpErr(res, 400, "name must be 2-60 characters");
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return httpErr(res, 400, "tag must contain only letters, numbers, hyphens, underscores");

  try {
    // Check if tag already exists
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: `${ctx.profile.company_id}/${name}/`,
      MaxKeys: 1,
    });
    const existing = await s3Client.send(listCommand);

    if (existing.KeyCount > 0) {
      return httpErr(res, 409, "Tag already exists");
    }

    // Create the folder by uploading a placeholder file
    const placeholderKey = `${ctx.profile.company_id}/${name}/.placeholder`;
    const putCommand = new PutObjectCommand({
      Bucket: S3_REPORTS_BUCKET,
      Key: placeholderKey,
      Body: "",
    });
    await s3Client.send(putCommand);

    res.status(201).json({ name });
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

api.put("/reports/tags/:tagName", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership"])) return httpErr(res, 403, "Requires one of: admin, leadership");

  const oldName = req.params.tagName;
  const newName = String(req.body?.name || "").trim();

  if (newName.length < 2 || newName.length > 60) return httpErr(res, 400, "name must be 2-60 characters");
  if (!/^[a-zA-Z0-9_-]+$/.test(newName)) return httpErr(res, 400, "tag must contain only letters, numbers, hyphens, underscores");

  // If names are the same, nothing to do
  if (oldName === newName) {
    return res.json({ name: newName });
  }

  try {
    const oldPrefix = `${ctx.profile.company_id}/${oldName}/`;
    const newPrefix = `${ctx.profile.company_id}/${newName}/`;

    // List all objects under old tag
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: oldPrefix,
    });
    const response = await s3Client.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      return httpErr(res, 404, "Tag not found");
    }

    // Copy all files to new location
    for (const obj of response.Contents) {
      const oldKey = obj.Key;
      const relativePath = oldKey.substring(oldPrefix.length);
      const newKey = newPrefix + relativePath;

      const copyCommand = new CopyObjectCommand({
        Bucket: S3_REPORTS_BUCKET,
        CopySource: `${S3_REPORTS_BUCKET}/${oldKey}`,
        Key: newKey,
      });
      await s3Client.send(copyCommand);
    }

    // Delete old files
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: S3_REPORTS_BUCKET,
      Delete: {
        Objects: response.Contents.map((obj) => ({ Key: obj.Key })),
      },
    });
    await s3Client.send(deleteCommand);

    res.json({ name: newName });
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

api.delete("/reports/tags/:tagName", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership"])) return httpErr(res, 403, "Requires one of: admin, leadership");

  const tagName = req.params.tagName;

  try {
    const prefix = `${ctx.profile.company_id}/${tagName}/`;

    // List all objects under this tag
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
    });
    const response = await s3Client.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      return httpErr(res, 404, "Tag not found");
    }

    // Check if there are any PDF files (not just placeholder)
    const hasFiles = response.Contents.some((obj) => obj.Key.endsWith(".pdf"));
    if (hasFiles) {
      return httpErr(res, 409, "Cannot delete tag with existing reports");
    }

    // Delete placeholder file
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: S3_REPORTS_BUCKET,
      Delete: {
        Objects: response.Contents.map((obj) => ({ Key: obj.Key })),
      },
    });
    await s3Client.send(deleteCommand);

    res.status(204).end();
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

// ---------- Reports (S3-based) ----------

api.get("/reports", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);

  const { tag, year } = req.query;
  if (!tag) return httpErr(res, 400, "tag parameter required");

  try {
    let prefix = `${ctx.profile.company_id}/${tag}/`;
    if (year) {
      prefix += `${year}/`;
    }

    const command = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
    });
    const response = await s3Client.send(command);

    const reports = (response.Contents || [])
      .filter((obj) => obj.Key.endsWith(".pdf"))
      .map((obj) => {
        const parts = obj.Key.split("/");
        const filename = parts[parts.length - 1];
        const fileYear = parts[2];
        const reportDate = filename.replace(".pdf", "");

        return {
          id: obj.Key,
          name: filename,
          tag,
          report_date: reportDate,
          year: fileYear,
          storage_path: obj.Key,
          size: obj.Size,
          last_modified: obj.LastModified,
        };
      })
      .sort((a, b) => b.report_date.localeCompare(a.report_date));

    res.json(reports);
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

api.get("/reports/years", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);

  const { tag } = req.query;
  if (!tag) return httpErr(res, 400, "tag parameter required");

  try {
    const prefix = `${ctx.profile.company_id}/${tag}/`;

    const command = new ListObjectsV2Command({
      Bucket: S3_REPORTS_BUCKET,
      Prefix: prefix,
      Delimiter: "/",
    });
    const response = await s3Client.send(command);

    const years = (response.CommonPrefixes || [])
      .map((prefix) => {
        const parts = prefix.Prefix.split("/");
        return parts[2];
      })
      .filter(Boolean)
      .sort()
      .reverse();

    res.json({ years });
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

api.post("/reports/upload", upload.single("file"), async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership"])) return httpErr(res, 403, "Requires one of: admin, leadership");

  const { tag, report_date } = req.body || {};
  if (!tag) return httpErr(res, 400, "tag required");
  if (!report_date || !/^\d{4}-\d{2}-\d{2}$/.test(report_date)) return httpErr(res, 400, "report_date required (YYYY-MM-DD)");
  if (!req.file) return httpErr(res, 400, "file required");

  const buf = req.file.buffer;
  if (buf.slice(0, 4).toString() !== "%PDF") return httpErr(res, 400, "Only PDF files are accepted");

  // Filename is just the date
  const filename = `${report_date}.pdf`;
  const year = report_date.split("-")[0];
  const storagePath = `${ctx.profile.company_id}/${tag}/${year}/${filename}`;

  try {
    const putCommand = new PutObjectCommand({
      Bucket: S3_REPORTS_BUCKET,
      Key: storagePath,
      Body: buf,
      ContentType: "application/pdf",
      Metadata: {
        uploaded_by: ctx.profile.full_name,
        uploaded_by_id: ctx.profile.id,
        company_id: ctx.profile.company_id,
      },
    });
    await s3Client.send(putCommand);

    res.status(201).json({
      id: storagePath,
      name: filename,
      tag,
      report_date,
      year,
      storage_path: storagePath,
    });
  } catch (error) {
    return httpErr(res, 500, `S3 upload: ${error.message}`);
  }
});

api.get("/reports/*/download", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);

  const s3Key = decodeURIComponent(req.params[0]);

  // Verify belongs to this company
  if (!s3Key.startsWith(`${ctx.profile.company_id}/`)) {
    return httpErr(res, 403, "Access denied");
  }

  try {
    const command = new GetObjectCommand({
      Bucket: S3_REPORTS_BUCKET,
      Key: s3Key,
    });
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    res.json({ url: signedUrl });
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

api.delete("/reports/*", async (req, res) => {
  const ctx = await currentProfile(req);
  if (ctx.error) return httpErr(res, ctx.error.status, ctx.error.detail);
  if (!requireRole(ctx.profile, ["admin", "leadership"])) return httpErr(res, 403, "Requires one of: admin, leadership");

  const s3Key = decodeURIComponent(req.params[0]);

  // Verify belongs to this company
  if (!s3Key.startsWith(`${ctx.profile.company_id}/`)) {
    return httpErr(res, 403, "Access denied");
  }

  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: S3_REPORTS_BUCKET,
      Key: s3Key,
    });
    await s3Client.send(deleteCommand);

    res.status(204).end();
  } catch (error) {
    return httpErr(res, 500, `S3 error: ${error.message}`);
  }
});

// multer / global error
app.use((err, _req, res, _next) => {
  if (err) return res.status(400).json({ detail: err.message });
});

app.use("/api", api);

app.listen(PORT, "0.0.0.0", () => console.log(`ZReports API listening on 0.0.0.0:${PORT}`));
