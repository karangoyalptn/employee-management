import { useCallback, useEffect, useRef, useState } from "react";
import "@/App.css";
import {
  ChevronDown, FileText, Filter, LayoutDashboard, LogOut, Menu, Pencil, Plus,
  Search, Settings, ShieldCheck, Trash2, Users, X, UploadCloud, Download, UserCog, KeyRound,
  CalendarDays, Check, Eye,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { api, getWorkspaceSlug } from "@/lib/api";

const avatarImages = [
  "https://images.unsplash.com/photo-1685475887169-9c9a84bf740f?auto=format&fit=crop&w=120&q=80",
];

const ROLE_LABEL = { admin: "Admin", leadership: "Leadership", manager: "Manager", viewer: "Viewer" };

const canManageEmployees = (r) => ["admin", "leadership", "manager"].includes(r);
const canDeleteEmployees = (r) => ["admin", "leadership"].includes(r);
const canUploadReports = (r) => ["admin", "leadership", "manager"].includes(r);
const canSeeSalary = (r) => ["admin", "leadership"].includes(r);

const initialsOf = (name) => (name || "").split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase();

// Component to display employee photo with signed URL from S3
function EmployeeAvatar({ employee, size = 36 }) {
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    if (employee?.id) {
      api.getEmployeePhotoUrl(employee.id)
        .then(({ url }) => setPhotoUrl(url))
        .catch(() => setPhotoUrl(null));
    }
  }, [employee?.id]);

  return (
    <div className="avatar" style={size ? { width: size, height: size } : {}}>
      {photoUrl ? <img src={photoUrl} alt="" /> : initialsOf(employee?.name || "")}
    </div>
  );
}

function LoginScreen({ workspace, onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setError(""); setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onSignedIn();
    } catch (e) { setError(e.message || "Sign in failed"); }
    finally { setLoading(false); }
  };
  return (
    <main className="login-shell">
      <section className="login-visual">
        <div className="visual-copy">
          <span className="eyebrow">ZREPORTS · FACTORY OS</span>
          <h1>Run the floor.<br /><em>{workspace.name}.</em></h1>
          <p>One clear view of your workforce, shifts, and the reports that keep production moving.</p>
          <div className="visual-stat"><strong>{workspace.slug}</strong><span>workspace<br /><small>secure factory access</small></span></div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-brand"><span className="brand-mark">AF</span><span>{workspace.name}</span></div>
        <div className="login-form">
          <span className="eyebrow">SECURE ACCESS</span>
          <h2>Sign in</h2>
          <p className="muted">Access <b>{workspace.name}</b> workspace.</p>
          <label>Email address
            <input data-testid="login-email-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
          </label>
          <label>Password
            <div className="password-wrap">
              <input data-testid="login-password-input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
              <span>•••</span>
            </div>
          </label>
          <p className="muted" style={{ fontSize: 11, margin: "0 0 20px" }}>
            Accounts are created by your admin. If you don't have one, ask your admin to add you from Team & roles.
          </p>
          {error && <p data-testid="login-error-message" style={{ color: "var(--red)", fontSize: 11, margin: "4px 0 16px" }}>{error}</p>}
          <button data-testid="login-submit-button" className="primary-button login-submit" onClick={submit} disabled={loading}>
            {loading ? "Signing in…" : "Enter workspace"} <span>→</span>
          </button>
          <p className="login-foot"><ShieldCheck size={14} /> Protected workspace · Supabase session security</p>
        </div>
        <div className="login-footer"><span>© 2024 ZReports</span><span>Privacy & security</span></div>
      </section>
    </main>
  );
}

function WorkspaceMissing({ slug }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center", background: "var(--surface)", border: "1px solid var(--line)", padding: 40 }} data-testid="workspace-missing">
        <span className="eyebrow">WORKSPACE</span>
        <h2 style={{ font: "800 34px 'Barlow Condensed'", margin: "12px 0 8px", letterSpacing: "-.4px" }}>Workspace not found</h2>
        <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>
          {slug ? <>The workspace <b style={{ color: "#fff" }}>{slug}</b> does not exist yet.</> : <>No workspace was specified.</>}
          <br />Ask your account owner to provision it, then use its factory URL like <code style={{ color: "#a8c0e0" }}>your-factory.manage.zreports.in</code>.
        </p>
      </div>
    </main>
  );
}

function AccessDenied({ email, onSignOut }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center", background: "var(--surface)", border: "1px solid var(--line)", padding: 40 }} data-testid="access-denied">
        <span className="eyebrow">ACCESS DENIED</span>
        <h2 style={{ font: "800 34px 'Barlow Condensed'", margin: "12px 0 8px", letterSpacing: "-.4px" }}>You don't belong here</h2>
        <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>
          Signed in as <b style={{ color: "#fff" }}>{email}</b>, but this account isn't a member of this workspace.
          Ask your admin to add you, or sign in on your own factory's URL.
        </p>
        <button data-testid="access-denied-signout" className="primary-button" style={{ marginTop: 24 }} onClick={onSignOut}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </main>
  );
}

function AbsenceHistoryModal({ employee, canEdit, onClose }) {
  const [items, setItems] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    api.listAbsences(employee.id).then(setItems).catch(() => setItems([]));
  }, [employee.id]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr("Date must be YYYY-MM-DD");
    setErr(""); setSaving(true);
    try { await api.addAbsence(employee.id, { absence_date: date, reason: reason || null }); setReason(""); await load(); }
    catch (e) { setErr(e.detail || e.message); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteAbsence(deleteConfirm.id);
      setDeleteConfirm(null);
      await load();
    }
    catch (e) {
      setErr(e.detail || e.message);
      setDeleteConfirm(null);
    }
    finally { setDeleting(false); }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" data-testid="absence-modal" style={{ width: "min(680px, 100%)" }}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">ABSENCE HISTORY</span>
            <h2>{employee.name}</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>{employee.role || "—"} · {employee.shift}</p>
          </div>
          <button data-testid="absence-close-button" className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>

        {canEdit && (
          <div className="form-grid" style={{ marginBottom: 6 }}>
            <label>Absence date *
              <input data-testid="absence-date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ colorScheme: "dark" }} />
            </label>
            <label>Reason (optional)
              <input data-testid="absence-reason-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sick leave" />
            </label>
          </div>
        )}
        {canEdit && (
          <div className="modal-actions" style={{ borderTop: 0, paddingTop: 0, justifyContent: "flex-start", marginBottom: 12 }}>
            <button data-testid="absence-add-button" className="primary-button" onClick={add} disabled={saving}>
              <Plus size={15} /> {saving ? "Saving…" : "Log absence"}
            </button>
          </div>
        )}
        {err && <p data-testid="absence-error" style={{ color: "var(--red)", fontSize: 11 }}>{err}</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Logged on</th>
                {canEdit && <th /> }
              </tr>
            </thead>
            <tbody>
              {(items || []).map((a) => (
                <tr key={a.id} data-testid={`absence-row-${a.id}`}>
                  <td className="salary">{a.absence_date}</td>
                  <td>{a.reason || "—"}</td>
                  <td>{a.created_at ? new Date(a.created_at).toLocaleDateString("en-IN") : "—"}</td>
                  {canEdit && (
                    <td>
                      <button data-testid={`absence-delete-${a.id}-button`} className="icon-button danger" onClick={() => setDeleteConfirm(a)}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {items === null && <div className="empty-state">Loading…</div>}
          {items && items.length === 0 && <div className="empty-state" data-testid="absence-empty-state">No absences logged yet.</div>}
        </div>
        {deleteConfirm && (
          <div className="modal-backdrop" style={{ zIndex: 1002 }}>
            <div className="modal" style={{ width: "min(400px, 100%)" }}>
              <div className="modal-head">
                <div>
                  <span className="eyebrow">CONFIRM DELETE</span>
                  <h2>Remove absence?</h2>
                </div>
                <button className="icon-button" onClick={() => setDeleteConfirm(null)}><X size={18} /></button>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>
                <strong>{deleteConfirm.absence_date}</strong>
              </p>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
                {deleteConfirm.reason ? `Reason: ${deleteConfirm.reason}` : "This absence will be permanently removed."}
              </p>
              <div className="modal-actions">
                <button className="outline-button" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="primary-button" style={{ background: "var(--red)" }} onClick={remove} disabled={deleting}>
                  {deleting ? "Removing…" : "Remove absence"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmployeeModal({ employee, role, onClose, onSave, onRefresh, saving }) {
  const [form, setForm] = useState(
    employee || { name: "", role: "", gender: "Male", shift: "Day shift", salary: "", aadhar_last4: "", pan_last4: "" }
  );
  const [err, setErr] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [idDocFile, setIdDocFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [hasIdDoc, setHasIdDoc] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState(false);
  const [confirmDeleteIdDoc, setConfirmDeleteIdDoc] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [deletingIdDoc, setDeletingIdDoc] = useState(false);
  const photoRef = useRef();
  const idRef = useRef();

  const update = (key, value) => setForm({ ...form, [key]: value });

  // Check for existing photo and ID doc in S3
  useEffect(() => {
    if (employee?.id && !photoFile) {
      // Check for photo
      api.getEmployeePhotoUrl(employee.id)
        .then(({ url }) => setPhotoPreview(url))
        .catch(() => setPhotoPreview(""));

      // Check for ID doc
      api.getEmployeeIdDocUrl(employee.id)
        .then(() => setHasIdDoc(true))
        .catch(() => setHasIdDoc(false));
    }
  }, [employee?.id, photoFile]);

  const pickPhoto = (f) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return setErr("Photo must be under 2 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setErr("Photo must be JPEG, PNG or WebP.");
    setErr(""); setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f));
  };
  const pickIdDoc = (f) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return setErr("ID document must be under 5 MB.");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(f.type)) return setErr("ID document must be PDF, JPEG or PNG.");
    setErr(""); setIdDocFile(f);
  };

  const submit = async () => {
    if (!form.name || form.name.length < 2) return setErr("Name is required.");
    const salaryNum = parseFloat(String(form.salary).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(salaryNum) || salaryNum < 0) return setErr("Enter a valid salary.");
    setErr("");
    const saved = await onSave({
      ...form,
      salary: salaryNum,
      role: form.role || null,
      aadhar_last4: (form.aadhar_last4 || "").slice(-4) || null,
      pan_last4: (form.pan_last4 || "").slice(-4) || null,
    });
    if (!saved?.id) return;
    // Upload files if any
    if (photoFile || idDocFile) {
      setUploadBusy(true);
      try {
        if (photoFile) await api.uploadEmployeePhoto(saved.id, photoFile);
        if (idDocFile) await api.uploadEmployeeIdDoc(saved.id, idDocFile);
        // Refresh the employee list to show the uploaded documents
        if (onRefresh) await onRefresh();
      } catch (e) { alert("Employee saved but media upload failed: " + (e.detail || e.message)); }
      finally { setUploadBusy(false); }
    }
    onClose();
  };

  const viewIdDoc = async () => {
    try { const { url } = await api.getEmployeeIdDocUrl(employee.id); if (url) window.open(url, "_blank"); }
    catch (e) { alert(e.detail || e.message); }
  };
  const removePhoto = async () => {
    if (!employee?.id) { setPhotoFile(null); setPhotoPreview(""); return; }
    setDeletingPhoto(true);
    try {
      await api.deleteEmployeePhoto(employee.id);
      setPhotoPreview("");
      setPhotoFile(null);
      setConfirmDeletePhoto(false);
      // Refresh the employee list to remove the photo
      if (onRefresh) await onRefresh();
    }
    catch (e) {
      setErr(e.detail || e.message);
      setConfirmDeletePhoto(false);
    }
    finally { setDeletingPhoto(false); }
  };
  const removeIdDoc = async () => {
    if (!employee?.id) { setIdDocFile(null); return; }
    setDeletingIdDoc(true);
    try {
      await api.deleteEmployeeIdDoc(employee.id);
      setHasIdDoc(false);
      setIdDocFile(null);
      setConfirmDeleteIdDoc(false);
      // Refresh the employee list to remove the document
      if (onRefresh) await onRefresh();
    }
    catch (e) {
      setErr(e.detail || e.message);
      setConfirmDeleteIdDoc(false);
    }
    finally { setDeletingIdDoc(false); }
  };

  const canViewIdDoc = role === "admin" || role === "leadership";

  return (
    <div className="modal-backdrop">
      <div className="modal" data-testid="employee-modal" style={{ width: "min(680px, 100%)" }}>
        <div className="modal-head">
          <div><span className="eyebrow">EMPLOYEE RECORD</span><h2>{employee?.id ? "Edit employee" : "Add employee"}</h2></div>
          <button data-testid="employee-modal-close-button" className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 18 }}>
          <div className="avatar" style={{ width: 72, height: 72 }}>
            {photoPreview ? <img src={photoPreview} alt="" /> : <span style={{ fontSize: 22 }}>{initialsOf(form.name)}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input ref={photoRef} data-testid="employee-photo-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => pickPhoto(e.target.files[0])} />
            <div style={{ display: "flex", gap: 8 }}>
              <button data-testid="employee-photo-pick-button" className="outline-button" onClick={() => photoRef.current?.click()}>
                {photoPreview ? "Change photo" : "Add photo"}
              </button>
              {photoPreview && <button data-testid="employee-photo-remove-button" className="outline-button" onClick={() => employee?.id ? setConfirmDeletePhoto(true) : removePhoto()}>Remove</button>}
            </div>
            <p className="muted" style={{ fontSize: 10, margin: 0 }}>JPEG/PNG/WebP · under 2 MB</p>
          </div>
        </div>

        <div className="form-grid">
          <label>Full name *<input data-testid="employee-name-input" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Kavita Rao" /></label>
          <label>Designation<input data-testid="employee-role-input" value={form.role || ""} onChange={(e) => update("role", e.target.value)} placeholder="e.g. Line Manager" /></label>
          <label>Gender *
            <select data-testid="employee-gender-select" value={form.gender} onChange={(e) => update("gender", e.target.value)}>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </label>
          <label>Shift *
            <select data-testid="employee-shift-select" value={form.shift} onChange={(e) => update("shift", e.target.value)}>
              <option>Day shift</option><option>Night shift</option>
            </select>
          </label>
          {canSeeSalary(role) && (
            <label>Monthly salary (₹) *<input data-testid="employee-salary-input" value={form.salary} onChange={(e) => update("salary", e.target.value)} placeholder="42000" /></label>
          )}
          <label>Aadhar last 4<input data-testid="employee-aadhar-input" value={form.aadhar_last4 || ""} maxLength={4} onChange={(e) => update("aadhar_last4", e.target.value.replace(/\D/g, ""))} placeholder="1234" /></label>
          <label>PAN last 4<input data-testid="employee-pan-input" value={form.pan_last4 || ""} maxLength={4} onChange={(e) => update("pan_last4", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="AB1C" /></label>
        </div>

        <div className="doc-upload">
          <div className="upload-icon"><UploadCloud size={19} /></div>
          <div style={{ flex: 1 }}>
            <strong>Identity document {hasIdDoc && <span style={{ color: "var(--green)" }}>· uploaded</span>}{idDocFile && <span style={{ color: "var(--blue)" }}>· {idDocFile.name}</span>}</strong>
            <p>Aadhar / PAN scan · PDF, JPG, PNG · up to 5 MB · viewable to Admin & Leadership</p>
          </div>
          <input ref={idRef} data-testid="employee-iddoc-input" type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: "none" }} onChange={(e) => pickIdDoc(e.target.files[0])} />
          <button data-testid="employee-iddoc-pick-button" className="outline-button" onClick={() => idRef.current?.click()}>Choose</button>
          {employee?.id && hasIdDoc && canViewIdDoc && <button data-testid="employee-iddoc-view-button" className="outline-button" onClick={viewIdDoc}>View</button>}
          {employee?.id && hasIdDoc && <button data-testid="employee-iddoc-remove-button" className="outline-button" onClick={() => setConfirmDeleteIdDoc(true)}>Remove</button>}
        </div>

        {err && <p data-testid="employee-form-error" style={{ color: "var(--red)", fontSize: 11 }}>{err}</p>}
        <div className="modal-actions">
          <button data-testid="employee-cancel-button" className="outline-button" onClick={onClose}>Cancel</button>
          <button data-testid="employee-save-button" className="primary-button" onClick={submit} disabled={saving || uploadBusy}>
            {(saving || uploadBusy) ? "Saving…" : "Save employee"} <span>→</span>
          </button>
        </div>
        {confirmDeletePhoto && (
          <div className="modal-backdrop" style={{ zIndex: 1002 }}>
            <div className="modal" style={{ width: "min(380px, 100%)" }}>
              <div className="modal-head">
                <div>
                  <span className="eyebrow">CONFIRM DELETE</span>
                  <h2>Remove photo?</h2>
                </div>
                <button className="icon-button" onClick={() => setConfirmDeletePhoto(false)}><X size={18} /></button>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
                The employee photo will be permanently deleted.
              </p>
              <div className="modal-actions">
                <button className="outline-button" onClick={() => setConfirmDeletePhoto(false)}>Cancel</button>
                <button className="primary-button" style={{ background: "var(--red)" }} onClick={removePhoto} disabled={deletingPhoto}>
                  {deletingPhoto ? "Removing…" : "Remove photo"}
                </button>
              </div>
            </div>
          </div>
        )}
        {confirmDeleteIdDoc && (
          <div className="modal-backdrop" style={{ zIndex: 1002 }}>
            <div className="modal" style={{ width: "min(380px, 100%)" }}>
              <div className="modal-head">
                <div>
                  <span className="eyebrow">CONFIRM DELETE</span>
                  <h2>Remove ID document?</h2>
                </div>
                <button className="icon-button" onClick={() => setConfirmDeleteIdDoc(false)}><X size={18} /></button>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
                The identity document will be permanently deleted.
              </p>
              <div className="modal-actions">
                <button className="outline-button" onClick={() => setConfirmDeleteIdDoc(false)}>Cancel</button>
                <button className="primary-button" style={{ background: "var(--red)" }} onClick={removeIdDoc} disabled={deletingIdDoc}>
                  {deletingIdDoc ? "Removing…" : "Remove document"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportUploadModal({ onClose, onSubmit, tags, uploading }) {
  const [file, setFile] = useState(null);
  const [tag, setTag] = useState(tags[0] || "");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState("");
  const inputRef = useRef();
  const submit = async () => {
    if (!file) return setErr("Please choose a PDF file.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return setErr("Report date must be in YYYY-MM-DD format");
    setErr("");
    try { await onSubmit(file, tag, reportDate); }
    catch (e) { setErr(e.detail || e.message || "Upload failed"); }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" data-testid="report-upload-modal">
        <div className="modal-head">
          <div><span className="eyebrow">DOCUMENT REPOSITORY</span><h2>Upload report</h2></div>
          <button data-testid="report-modal-close-button" className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="doc-upload" onClick={() => inputRef.current?.click()} style={{ cursor: "pointer" }}>
          <div className="upload-icon"><UploadCloud size={19} /></div>
          <div>
            <strong>{file ? file.name : "Choose PDF file"}</strong>
            <p>PDF only · Max 25 MB · Filename will be auto-generated as <b>{reportDate}.pdf</b></p>
          </div>
          <input ref={inputRef} data-testid="report-file-input" type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => setFile(e.target.files[0])} />
          <button data-testid="report-file-picker-button" className="outline-button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>Browse</button>
        </div>
        <div className="form-grid">
          <label>Report date *
            <input data-testid="report-date-input" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} style={{ colorScheme: "dark" }} />
          </label>
          <label>Tag *
            <select data-testid="report-tag-select" value={tag} onChange={(e) => setTag(e.target.value)}>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        {err && <p data-testid="report-upload-error" style={{ color: "var(--red)", fontSize: 11 }}>{err}</p>}
        <div className="modal-actions">
          <button data-testid="report-cancel-button" className="outline-button" onClick={onClose}>Cancel</button>
          <button data-testid="report-upload-submit-button" className="primary-button" onClick={submit} disabled={uploading}>{uploading ? "Uploading…" : "Upload"} <span>→</span></button>
        </div>
      </div>
    </div>
  );
}

function AddMemberModal({ onClose, onSubmit, saving }) {
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "viewer" });
  const [err, setErr] = useState("");
  const update = (k, v) => setForm({ ...form, [k]: v });
  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setErr("Enter a valid email.");
    if (form.password.length < 8) return setErr("Password must be at least 8 characters.");
    if (form.full_name.trim().length < 2) return setErr("Full name is required.");
    setErr("");
    try { await onSubmit(form); }
    catch (e) { setErr(e.detail || e.message || "Failed to add member"); }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" data-testid="add-member-modal">
        <div className="modal-head">
          <div><span className="eyebrow">TEAM & ACCESS</span><h2>Add member</h2></div>
          <button data-testid="add-member-close-button" className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="form-grid">
          <label>Full name *<input data-testid="add-member-name-input" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="e.g. Rakesh Kumar" /></label>
          <label>Email *<input data-testid="add-member-email-input" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="user@company.com" /></label>
          <label>Temporary password *<input data-testid="add-member-password-input" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="min. 8 characters" /></label>
          <label>Role *
            <select data-testid="add-member-role-select" value={form.role} onChange={(e) => update("role", e.target.value)}>
              {["admin", "leadership", "manager", "viewer"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
        </div>
        <p className="muted" style={{ fontSize: 11 }}>
          The user can log in immediately with this password. Share it securely and ask them to change it later.
        </p>
        {err && <p data-testid="add-member-error" style={{ color: "var(--red)", fontSize: 11 }}>{err}</p>}
        <div className="modal-actions">
          <button data-testid="add-member-cancel-button" className="outline-button" onClick={onClose}>Cancel</button>
          <button data-testid="add-member-submit-button" className="primary-button" onClick={submit} disabled={saving}>{saving ? "Adding…" : "Add member"} <span>→</span></button>
        </div>
      </div>
    </div>
  );
}

function TagsModal({ onClose, onChanged, role }) {
  const [tags, setTags] = useState([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const canEdit = role === "admin" || role === "leadership";
  const load = () => api.reportTags().then((d) => setTags(d.tags || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (name.trim().length < 2) return setErr("Tag name must be at least 2 characters.");
    setErr(""); setSaving(true);
    try { await api.createTag(name.trim()); setName(""); await load(); onChanged?.(); }
    catch (e) { setErr(e.detail || e.message); }
    finally { setSaving(false); }
  };
  const startRename = (tag) => {
    setRenaming(tag);
    setNewName(tag);
  };
  const doRename = async () => {
    const trimmed = newName.trim();
    if (trimmed.length < 2) return setErr("Tag name must be at least 2 characters.");
    // If name hasn't changed, just cancel edit mode
    if (trimmed === renaming) {
      setRenaming(null);
      return;
    }
    setErr(""); setSaving(true);
    try { await api.renameTag(renaming, trimmed); setRenaming(null); await load(); onChanged?.(); }
    catch (e) { setErr(e.detail || e.message); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    setDeleteErr("");
    setDeleting(true);
    try { await api.deleteTag(deleteConfirm); setDeleteConfirm(null); await load(); onChanged?.(); }
    catch (e) { setDeleteErr(e.detail || e.message); }
    finally { setDeleting(false); }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" data-testid="tags-modal" style={{ width: "min(560px, 100%)" }}>
        <div className="modal-head">
          <div><span className="eyebrow">REPORT TAGS</span><h2>Manage tags</h2></div>
          <button data-testid="tags-close-button" className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <input data-testid="tags-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" style={{ background: "#171b23", border: "1px solid #303848", color: "#fff", flex: 1, height: 42, padding: "0 13px" }} />
            <button data-testid="tags-add-button" className="primary-button" onClick={add} disabled={saving}>{saving ? "Adding…" : <><Plus size={15}/> Add tag</>}</button>
          </div>
        )}
        {err && <p data-testid="tags-error" style={{ color: "var(--red)", fontSize: 11 }}>{err}</p>}
        <div className="table-wrap">
          <table style={{ tableLayout: "fixed", width: 240 }}>
            <thead><tr><th style={{ width: 120 }}>Name</th>{canEdit && <th style={{ width: 120 }}>Actions</th>}</tr></thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag} data-testid={`tag-row-${tag}`}>
                  <td>
                    {renaming === tag ? (
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        style={{ background: "#171b23", border: "1px solid #303848", color: "#fff", padding: "6px 8px", width: "100%", boxSizing: "border-box" }}
                      />
                    ) : (
                      <span className="report-tag">{tag}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      {renaming === tag ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="icon-button" onClick={doRename} title="Save" style={{ color: "var(--green)" }}><Check size={14} /></button>
                          <button className="icon-button" onClick={() => setRenaming(null)} title="Cancel"><X size={14} /></button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button data-testid={`tag-rename-${tag}-button`} className="icon-button" onClick={() => startRename(tag)} title="Rename"><Pencil size={14} /></button>
                          <button data-testid={`tag-delete-${tag}-button`} className="icon-button danger" onClick={() => setDeleteConfirm(tag)} title="Delete"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {tags.length === 0 && <div className="empty-state">No tags yet.</div>}
        </div>
        {deleteConfirm && (
          <div className="modal-backdrop" style={{ zIndex: 1001 }}>
            <div className="modal" style={{ width: "min(400px, 100%)" }}>
              <div className="modal-head">
                <div>
                  <span className="eyebrow">CONFIRM DELETE</span>
                  <h2>Delete tag "{deleteConfirm}"?</h2>
                </div>
                <button className="icon-button" onClick={() => { setDeleteConfirm(null); setDeleteErr(""); }}><X size={18} /></button>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
                This will permanently delete the tag. The action will fail if reports exist in this tag.
              </p>
              {deleteErr && <p style={{ color: "var(--red)", fontSize: 12, background: "rgba(239, 68, 68, 0.1)", padding: "10px", borderRadius: 6, margin: "0 0 16px", lineHeight: 1.6 }}>{deleteErr}</p>}
              <div className="modal-actions">
                <button className="outline-button" onClick={() => { setDeleteConfirm(null); setDeleteErr(""); }}>Cancel</button>
                <button className="primary-button" style={{ background: "var(--red)" }} onClick={remove} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete tag"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamModal({ onClose, currentUserId }) {
  const [team, setTeam] = useState([]);
  const [saving, setSaving] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [resetPw, setResetPw] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [removing, setRemoving] = useState(false);

  const load = () => api.team().then(setTeam).catch(() => {});
  useEffect(() => { load(); }, []);

  const setRole = async (u, role) => {
    setSaving(u.id);
    try { const updated = await api.updateTeamRole(u.id, role); setTeam(team.map((t) => t.id === u.id ? updated : t)); }
    catch (e) { alert(e.detail || e.message); }
    finally { setSaving(null); }
  };
  const invite = async (form) => {
    setAddSaving(true);
    try { await api.inviteMember(form); setShowAdd(false); await load(); }
    catch (e) { throw e; }
    finally { setAddSaving(false); }
  };
  const remove = async () => {
    setRemoving(true);
    try {
      await api.removeMember(removeConfirm.id);
      setRemoveConfirm(null);
      await load();
    }
    catch (e) {
      alert(e.detail || e.message);
      setRemoveConfirm(null);
    }
    finally { setRemoving(false); }
  };
  const doReset = async () => {
    if (resetPw.length < 8) return alert("Password must be at least 8 characters.");
    try { await api.resetPassword(resetFor.id, resetPw); alert("Password updated. Share it with the user."); setResetFor(null); setResetPw(""); }
    catch (e) { alert(e.detail || e.message); }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" data-testid="team-modal" style={{ width: "min(820px, 100%)" }}>
        <div className="modal-head">
          <div><span className="eyebrow">TEAM & ACCESS</span><h2>Manage members</h2></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button data-testid="add-member-button" className="primary-button" onClick={() => setShowAdd(true)}><Plus size={15} /> Add member</button>
            <button data-testid="team-modal-close-button" className="icon-button" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Email</th><th>Role</th><th /></tr></thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.id} data-testid={`team-row-${u.id}`}>
                  <td>
                    <div className="person">
                      <div className="avatar">{initialsOf(u.full_name)}</div>
                      <div><strong>{u.full_name}</strong><span>{u.id === currentUserId ? "You" : ""}</span></div>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      data-testid={`team-role-select-${u.id}`}
                      value={u.role}
                      disabled={u.id === currentUserId || saving === u.id}
                      onChange={(e) => setRole(u, e.target.value)}
                    >
                      {["admin", "leadership", "manager", "viewer"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button data-testid={`team-reset-${u.id}-button`} className="icon-button" title="Reset password" onClick={() => setResetFor(u)}><KeyRound size={15} /></button>
                      {u.id !== currentUserId && (
                        <button data-testid={`team-remove-${u.id}-button`} className="icon-button danger" title="Remove member" onClick={() => setRemoveConfirm(u)}><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {team.length === 0 && <div className="empty-state">No team members yet.</div>}
        </div>
        {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onSubmit={invite} saving={addSaving} />}
        {resetFor && (
          <div className="modal-backdrop">
            <div className="modal" data-testid="reset-password-modal" style={{ width: "min(440px, 100%)" }}>
              <div className="modal-head">
                <div><span className="eyebrow">RESET PASSWORD</span><h2>{resetFor.full_name}</h2></div>
                <button className="icon-button" onClick={() => { setResetFor(null); setResetPw(""); }}><X size={18} /></button>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12, color: "#b1bac8", fontWeight: 600 }}>
                New temporary password
                <input data-testid="reset-password-input" value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="min. 8 characters"
                  style={{ background: "#171b23", border: "1px solid #303848", color: "#fff", height: 45, padding: "0 13px", outline: "none" }} />
              </label>
              <div className="modal-actions">
                <button className="outline-button" onClick={() => { setResetFor(null); setResetPw(""); }}>Cancel</button>
                <button data-testid="reset-password-submit-button" className="primary-button" onClick={doReset}>Update password</button>
              </div>
            </div>
          </div>
        )}
        {removeConfirm && (
          <div className="modal-backdrop" style={{ zIndex: 1002 }}>
            <div className="modal" style={{ width: "min(420px, 100%)" }}>
              <div className="modal-head">
                <div>
                  <span className="eyebrow">CONFIRM REMOVE</span>
                  <h2>Remove team member?</h2>
                </div>
                <button className="icon-button" onClick={() => setRemoveConfirm(null)}><X size={18} /></button>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>
                <strong>{removeConfirm.full_name}</strong>
              </p>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
                This will permanently remove <strong>{removeConfirm.email}</strong> from this workspace. They will lose access immediately.
              </p>
              <div className="modal-actions">
                <button className="outline-button" onClick={() => setRemoveConfirm(null)}>Cancel</button>
                <button className="primary-button" style={{ background: "var(--red)" }} onClick={remove} disabled={removing}>
                  {removing ? "Removing…" : "Remove member"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!currentPassword) return setErr("Current password is required");
    if (newPassword.length < 8) return setErr("New password must be at least 8 characters");
    if (newPassword !== confirmPassword) return setErr("New passwords do not match");

    setErr("");
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      onSuccess();
    } catch (e) {
      setErr(e.message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: "min(440px, 100%)" }}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">SECURITY</span>
            <h2>Change Password</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="form-grid">
          <label style={{ gridColumn: "1 / -1" }}>Current Password *
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              autoComplete="current-password"
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>New Password *
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>Confirm New Password *
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
          </label>
        </div>
        {err && <p style={{ color: "var(--red)", fontSize: 11, margin: "10px 0 0" }}>{err}</p>}
        <div className="modal-actions">
          <button className="outline-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={submit} disabled={saving}>
            {saving ? "Changing…" : "Change Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [slug] = useState(getWorkspaceSlug());
  const [workspace, setWorkspace] = useState(null); // {id, name, slug}
  const [wsError, setWsError] = useState(null);
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState(null);
  const [loadingMe, setLoadingMe] = useState(false);

  const [active, setActive] = useState("Overview");
  const [employees, setEmployees] = useState([]);
  const [reports, setReports] = useState([]);
  const [tagsMeta, setTagsMeta] = useState({ tags: [] });
  const [search, setSearch] = useState("");
  const [shift, setShift] = useState("All shifts");
  const [modal, setModal] = useState(null);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [teamModal, setTeamModal] = useState(false);
  const [tagsModal, setTagsModal] = useState(false);
  const [absenceFor, setAbsenceFor] = useState(null);
  const [notice, setNotice] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [activeYear, setActiveYear] = useState(new Date().getFullYear().toString());
  const [years, setYears] = useState([new Date().getFullYear().toString()]);
  const [deleteReportConfirm, setDeleteReportConfirm] = useState(null);
  const [deletingReport, setDeletingReport] = useState(false);
  const [deleteReportError, setDeleteReportError] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [deleteEmployeeConfirm, setDeleteEmployeeConfirm] = useState(null);
  const [deletingEmployee, setDeletingEmployee] = useState(false);
  const [deleteEmployeeError, setDeleteEmployeeError] = useState("");

  // Resolve workspace by slug (public)
  useEffect(() => {
    if (!slug) { setWsError("missing"); return; }
    api.lookupCompany(slug).then(setWorkspace).catch(() => setWsError("not_found"));
  }, [slug]);

  // Track supabase session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadMe = async () => {
    if (!session || !workspace) return;
    setLoadingMe(true);
    try { const data = await api.me(); setMe(data); setMeError(null); }
    catch (e) { setMeError(e.detail || "error"); setMe(null); }
    finally { setLoadingMe(false); }
  };

  useEffect(() => { if (session && workspace) loadMe(); else setMe(null); // eslint-disable-next-line
  }, [session, workspace]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 2500); };
  const role = me?.profile.role;

  const refreshEmployees = async () => {
    try { setEmployees(await api.listEmployees(search, shift === "All shifts" ? "" : shift)); }
    catch (e) { console.error(e); }
  };
  const refreshReports = async () => {
    if (!activeTag) return;
    try { setReports(await api.listReports(activeTag, activeYear)); }
    catch (e) { console.error(e); setReports([]); }
  };
  const refreshYears = async () => {
    if (!activeTag) return;
    try {
      const data = await api.getReportYears(activeTag);
      const yearsList = data.years && data.years.length > 0 ? data.years : [new Date().getFullYear().toString()];
      setYears(yearsList);
      // If current year is not in list, set to first year
      if (!yearsList.includes(activeYear)) {
        setActiveYear(yearsList[0]);
      }
    }
    catch (e) { console.error(e); setYears([new Date().getFullYear().toString()]); }
  };

  useEffect(() => { if (me) refreshEmployees(); // eslint-disable-next-line
  }, [me, search, shift]);
  useEffect(() => { if (me && activeTag) refreshReports(); // eslint-disable-next-line
  }, [me, activeTag, activeYear]);
  useEffect(() => { if (me && activeTag) refreshYears(); // eslint-disable-next-line
  }, [me, activeTag]);
  useEffect(() => {
    if (me && tagsMeta.tags.length === 0) {
      api.reportTags().then((d) => {
        setTagsMeta(d);
        // Set first tag as default if available
        if (d.tags && d.tags.length > 0 && !activeTag) {
          setActiveTag(d.tags[0]);
        }
      }).catch(() => {});
    }
  }, [me, tagsMeta.tags.length, activeTag]);

  const saveEmployee = async (payload) => {
    setSavingEmployee(true);
    try {
      let saved;
      if (payload.id) saved = await api.updateEmployee(payload.id, payload);
      else saved = await api.createEmployee(payload);
      flash("Employee record saved"); await refreshEmployees();
      // don't close if uploads are pending
      return saved;
    } catch (e) { alert(e.detail || e.message); return null; }
    finally { setSavingEmployee(false); }
  };
  const deleteEmployee = async () => {
    setDeletingEmployee(true);
    setDeleteEmployeeError("");
    try {
      await api.deleteEmployee(deleteEmployeeConfirm.id);
      flash("Employee removed");
      setDeleteEmployeeConfirm(null);
      await refreshEmployees();
    }
    catch (e) {
      setDeleteEmployeeError(e.detail || e.message);
    }
    finally { setDeletingEmployee(false); }
  };
  const uploadReport = async (file, tag, reportDate) => {
    setUploading(true);
    try {
      await api.uploadReport(file, tag, reportDate);
      setUploadModal(false);
      flash("Report uploaded");
      await refreshYears(); // Refresh years in case new year was added
      await refreshReports();
    }
    catch (e) { throw e; }
    finally { setUploading(false); }
  };
  const downloadReport = async (id) => {
    try { const { url } = await api.downloadReport(id); if (url) window.open(url, "_blank"); }
    catch (e) { alert(e.detail || e.message); }
  };
  const deleteReport = async () => {
    setDeletingReport(true);
    setDeleteReportError("");
    try {
      await api.deleteReport(deleteReportConfirm.id);
      flash("Report deleted");
      setDeleteReportConfirm(null);
      await refreshReports();
    }
    catch (e) {
      setDeleteReportError(e.detail || e.message);
    }
    finally {
      setDeletingReport(false);
    }
  };
  const logout = async () => { await supabase.auth.signOut(); setSession(null); setMe(null); };

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showProfileMenu && !e.target.closest('.top-profile') && !e.target.closest('[data-profile-menu]')) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProfileMenu]);

  // Render tree
  if (wsError) return <WorkspaceMissing slug={slug} />;
  if (!workspace) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#8d99aa" }}>Loading workspace…</div>;
  if (!session) return <LoginScreen workspace={workspace} onSignedIn={() => {}} />;
  if (loadingMe) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#8d99aa" }}>Loading workspace…</div>;
  if (meError === "profile_not_found" || meError === "wrong_workspace") return <AccessDenied email={session.user.email} onSignOut={logout} />;
  if (!me) return null;

  return (
    <div className="app-shell">
      <aside className="sidebar" style={{ position: "fixed", height: "100vh", overflowY: "auto" }}>
        <div className="side-brand"><span className="brand-mark">AF</span><span>{me.company.name}</span></div>
        <div className="side-label">OPERATIONS</div>
        <nav>
          {[["Overview", LayoutDashboard], ["Employees", Users], ["Attendance", CalendarDays], ["Reports", FileText]].map(([label, Icon]) => (
            <button data-testid={`nav-${label.toLowerCase()}-button`} key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => setActive(label)}>
              <Icon size={17} /><span>{label}</span>
              {label === "Reports" && reports.length > 0 && <small>{reports.length}</small>}
            </button>
          ))}
        </nav>
        <div className="side-label settings-label">WORKSPACE</div>
        {role === "admin" && (
          <button data-testid="nav-team-button" className="nav-item" onClick={() => setTeamModal(true)}>
            <UserCog size={17} /><span>Team & roles</span>
          </button>
        )}
        <button data-testid="nav-settings-button" className={active === "Settings" ? "nav-item active" : "nav-item"} onClick={() => setActive("Settings")}><Settings size={17} /><span>Settings</span></button>
        <div className="side-bottom">
          <div className="status-dot"><i /> Systems operational</div>
          <div className="profile">
            <img src={avatarImages[0]} alt="" />
            <div><strong data-testid="profile-name">{me.profile.full_name}</strong><span data-testid="profile-role">{ROLE_LABEL[role]}</span></div>
            <ChevronDown size={15} />
          </div>
          <button data-testid="logout-button" className="logout-button" onClick={logout}><LogOut size={15} /> Sign out</button>
        </div>
      </aside>
      <main className="main-content" style={{ marginLeft: "235px" }}>
        <header className="topbar">
          <button data-testid="mobile-menu-button" className="mobile-menu"><Menu size={20} /></button>
          <div className="breadcrumb">{me.company.name} <span>/</span> <b>{active}</b></div>
          <div className="top-actions">
            <div style={{ position: "relative" }}>
              <div className="top-profile" onClick={() => setShowProfileMenu(!showProfileMenu)} style={{ cursor: "pointer" }}>
                <span>{initialsOf(me.profile.full_name)}</span><ChevronDown size={14} />
              </div>
              {showProfileMenu && (
                <div data-profile-menu style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  background: "var(--elevated)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  minWidth: 200,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  zIndex: 1000,
                  overflow: "hidden"
                }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{me.profile.full_name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{ROLE_LABEL[role]}</div>
                  </div>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      setShowChangePassword(true);
                    }}
                    style={{
                      width: "100%",
                      background: "none",
                      border: "none",
                      padding: "12px 16px",
                      textAlign: "left",
                      color: "var(--text)",
                      fontSize: 12,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      transition: "all .2s ease"
                    }}
                    onMouseEnter={(e) => e.target.style.background = "rgba(255,255,255,0.05)"}
                    onMouseLeave={(e) => e.target.style.background = "none"}
                  >
                    <KeyRound size={15} />
                    Change Password
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                    }}
                    style={{
                      width: "100%",
                      background: "none",
                      border: "none",
                      borderTop: "1px solid var(--line)",
                      padding: "12px 16px",
                      textAlign: "left",
                      color: "var(--red)",
                      fontSize: 12,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      transition: "all .2s ease"
                    }}
                    onMouseEnter={(e) => e.target.style.background = "rgba(255,59,48,0.1)"}
                    onMouseLeave={(e) => e.target.style.background = "none"}
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {active === "Overview" && (
          <Overview me={me}
            employeesCount={employees.length}
            nightCount={employees.filter((e) => e.shift === "Night shift").length}
            reportsCount={reports.length}
            onViewEmployees={() => setActive("Employees")}
            onViewReports={() => setActive("Reports")}
            onViewAbsents={() => setActive("Attendance")}
            canAdd={canManageEmployees(role)}
            onAdd={() => setModal({})}
          />
        )}
        {active === "Employees" && (
          <Employees employees={employees}
            search={search} setSearch={setSearch}
            shift={shift} setShift={setShift}
            role={role}
            onAdd={canManageEmployees(role) ? () => setModal({}) : null}
            onEdit={canManageEmployees(role) ? setModal : null}
            onDelete={canDeleteEmployees(role) ? setDeleteEmployeeConfirm : null}
            onHistory={setAbsenceFor}
          />
        )}
        {active === "Attendance" && (
          <Attendance employees={employees}
            role={role}
            onHistory={setAbsenceFor}
          />
        )}
        {active === "Reports" && (
          <Reports reports={reports}
            tags={tagsMeta.tags}
            activeTag={activeTag} setActiveTag={setActiveTag}
            years={years}
            activeYear={activeYear} setActiveYear={setActiveYear}
            onUpload={canUploadReports(role) ? () => setUploadModal(true) : null}
            onDownload={downloadReport}
            onDelete={canDeleteEmployees(role) ? setDeleteReportConfirm : null}
            onManageTags={canUploadReports(role) ? () => setTagsModal(true) : null}
          />
        )}
        {active === "Settings" && (
          <CompanySettings
            company={me.company}
            role={role}
            onUpdate={async () => {
              const data = await api.me();
              setMe(data);
              flash("Company information updated");
            }}
          />
        )}
        {notice && <div className="toast" data-testid="success-notice">{notice}<span>✓</span></div>}
        {modal && <EmployeeModal employee={modal.id ? modal : null} role={role} onClose={() => setModal(null)} onSave={saveEmployee} onRefresh={refreshEmployees} saving={savingEmployee} />}
        {uploadModal && <ReportUploadModal onClose={() => setUploadModal(false)} onSubmit={uploadReport} tags={tagsMeta.tags} uploading={uploading} />}
        {teamModal && <TeamModal onClose={() => setTeamModal(false)} currentUserId={me.profile.id} />}
        {tagsModal && <TagsModal onClose={() => setTagsModal(false)} onChanged={async () => {
          const d = await api.reportTags().catch(() => ({ tags: [] }));
          setTagsMeta(d);
          // Reset to first tag if current tag was deleted
          if (d.tags && d.tags.length > 0 && !d.tags.includes(activeTag)) {
            setActiveTag(d.tags[0]);
          }
        }} role={role} />}
        {absenceFor && (
          <AbsenceHistoryModal
            employee={absenceFor}
            canEdit={canManageEmployees(role)}
            onClose={() => setAbsenceFor(null)}
          />
        )}
        {showChangePassword && (
          <ChangePasswordModal
            onClose={() => setShowChangePassword(false)}
            onSuccess={() => {
              setShowChangePassword(false);
              flash("Password changed successfully");
            }}
          />
        )}
        {deleteReportConfirm && (
          <div className="modal-backdrop" style={{ zIndex: 1001 }}>
            <div className="modal" style={{ width: "min(400px, 100%)" }}>
              <div className="modal-head">
                <div>
                  <span className="eyebrow">CONFIRM DELETE</span>
                  <h2>Delete report?</h2>
                </div>
                <button className="icon-button" onClick={() => setDeleteReportConfirm(null)}><X size={18} /></button>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>
                <strong>{deleteReportConfirm.name}</strong>
              </p>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
                This will permanently delete this report from S3. This action cannot be undone.
              </p>
              {deleteReportError && (
                <p style={{ color: "var(--red)", fontSize: 11, marginBottom: 16, padding: 10, background: "rgba(255,59,48,0.1)", borderRadius: 6 }}>
                  {deleteReportError}
                </p>
              )}
              <div className="modal-actions">
                <button className="outline-button" onClick={() => { setDeleteReportConfirm(null); setDeleteReportError(""); }}>Cancel</button>
                <button className="primary-button" style={{ background: "var(--red)" }} onClick={deleteReport} disabled={deletingReport}>
                  {deletingReport ? "Deleting…" : "Delete report"}
                </button>
              </div>
            </div>
          </div>
        )}
        {deleteEmployeeConfirm && (
          <div className="modal-backdrop" style={{ zIndex: 1001 }}>
            <div className="modal" style={{ width: "min(420px, 100%)" }}>
              <div className="modal-head">
                <div>
                  <span className="eyebrow">CONFIRM DELETE</span>
                  <h2>Remove employee?</h2>
                </div>
                <button className="icon-button" onClick={() => setDeleteEmployeeConfirm(null)}><X size={18} /></button>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>
                <strong>{deleteEmployeeConfirm.name}</strong>
              </p>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
                This will permanently remove <strong>{deleteEmployeeConfirm.name}</strong> from the employee directory. All associated records and absence history will remain intact.
              </p>
              {deleteEmployeeError && (
                <p style={{ color: "var(--red)", fontSize: 11, marginBottom: 16, padding: 10, background: "rgba(255,59,48,0.1)", borderRadius: 6 }}>
                  {deleteEmployeeError}
                </p>
              )}
              <div className="modal-actions">
                <button className="outline-button" onClick={() => { setDeleteEmployeeConfirm(null); setDeleteEmployeeError(""); }}>Cancel</button>
                <button className="primary-button" style={{ background: "var(--red)" }} onClick={deleteEmployee} disabled={deletingEmployee}>
                  {deletingEmployee ? "Removing…" : "Remove employee"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function PageHead({ eyebrow, title, children }) {
  return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{children}</div>;
}

function Overview({ me, employeesCount, nightCount, reportsCount, onViewEmployees, onViewReports, onViewAbsents, canAdd, onAdd }) {
  const [absenceStats, setAbsenceStats] = useState([]);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
  const nightPct = employeesCount ? Math.round((nightCount / employeesCount) * 100) : 0;

  // Fetch real absence data for last 7 days
  useEffect(() => {
    api.getAbsenceStats(7)
      .then(data => setAbsenceStats(data))
      .catch(() => setAbsenceStats([]));
  }, []);

  const absenceCounts = absenceStats.map(stat => stat.count);
  const maxAbsences = Math.max(10, ...absenceCounts);

  return (
    <div className="page">
      <PageHead eyebrow={today} title={`Good day, ${me.profile.full_name.split(" ")[0]}.`}>
        {canAdd && <button data-testid="overview-add-employee-button" className="primary-button" onClick={onAdd}><Plus size={17} /> Add employee</button>}
      </PageHead>
      <section className="hero-band">
        <div>
          <span className="eyebrow blue">LIVE OPERATIONS</span>
          <h2>Your workforce at a glance.</h2>
          <p>Everything important, in one clear view.</p>
        </div>
        <div className="hero-time">
          <strong>{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}</strong>
          <span>IST · ACTIVE OPERATIONS</span>
        </div>
      </section>
      <div className="metric-grid">
        <Metric label="Active workforce" value={String(employeesCount).padStart(2, "0")} change="Directory" note="all shifts" color="blue" />
        <Metric label="On night shift" value={String(nightCount).padStart(2, "0")} change={`${nightPct}%`} note="of workforce" color="amber" />
        <Metric label="Open reports" value={String(reportsCount).padStart(2, "0")} change="Repository" note="accessible to you" color="red" />
        <Metric label="Your role" value={ROLE_LABEL[me.profile.role]} change={me.company.name} note="workspace" color="green" />
      </div>
      <div className="overview-grid">
        <section className="data-section" style={{ cursor: "pointer" }} onClick={onViewAbsents}>
          <div className="section-head">
            <div><span className="eyebrow">WORKFORCE</span><h3>Daily absences (Last 7 days)</h3></div>
            <button data-testid="overview-view-absents-button" className="text-button" onClick={(e) => { e.stopPropagation(); onViewAbsents(); }}>View attendance <span>→</span></button>
          </div>
          <div className="attendance-chart">
            <div className="chart-y"><span>{maxAbsences}</span><span>{Math.floor(maxAbsences * 0.75)}</span><span>{Math.floor(maxAbsences * 0.5)}</span><span>{Math.floor(maxAbsences * 0.25)}</span><span>0</span></div>
            <div className="bars">
              {absenceStats.length > 0 ? absenceStats.map((stat, i) => {
                const height = maxAbsences > 0 ? (stat.count / maxAbsences) * 100 : 0;
                const date = new Date(stat.date);
                const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" })[0]; // M, T, W, etc.
                const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }); // e.g., "Sep 20"
                const isToday = i === absenceStats.length - 1;
                return (
                  <div className="bar-group" key={stat.date}>
                    <div className="tooltip">{formattedDate}: {stat.count} {stat.count === 1 ? 'absence' : 'absences'}</div>
                    <div className={`bar ${isToday ? "bright" : ""}`} style={{ height: `${height}%`, background: stat.count === 0 ? "var(--green)" : undefined }} />
                    <span>{dayLabel}</span>
                  </div>
                );
              }) : (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--muted)", padding: "20px" }}>Loading...</div>
              )}
            </div>
          </div>
        </section>
        <section className="data-section alerts">
          <div className="section-head">
            <div><span className="eyebrow">QUICK ACCESS</span><h3>Jump to</h3></div>
            <button data-testid="overview-view-reports-button" className="text-button" onClick={onViewReports}>See reports <span>→</span></button>
          </div>
          <div className="activity" data-testid="activity-item-employees"><i className="blue" /><div><strong>Employee directory</strong><span>Search, filter, add & edit records</span></div><time>{employeesCount}</time></div>
          <div className="activity" data-testid="activity-item-reports"><i className="green" /><div><strong>Report repository</strong><span>Tagged PDF uploads with access rules</span></div><time>{reportsCount}</time></div>
          <div className="activity" data-testid="activity-item-role"><i className="amber" /><div><strong>Access level</strong><span>You can see reports for {ROLE_LABEL[me.profile.role]}</span></div><time>{ROLE_LABEL[me.profile.role]}</time></div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, change, note, color }) {
  return (
    <div className="metric" data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className={`metric-icon ${color}`} />
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <div><b className={color}>{change}</b><small>{note}</small></div>
    </div>
  );
}

function Employees({ employees, search, setSearch, shift, setShift, role, onAdd, onEdit, onDelete, onHistory }) {
  const salaryVisible = canSeeSalary(role);
  return (
    <div className="page">
      <PageHead eyebrow="PEOPLE & ACCESS" title="Employee directory">
        {onAdd && <button data-testid="add-employee-button" className="primary-button" onClick={onAdd}><Plus size={17} /> Add employee</button>}
      </PageHead>
      <div className="directory-toolbar">
        <div className="search-box"><Search size={17} /><input data-testid="employee-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or designation" /></div>
        <div className="filter-select"><Filter size={15} /><select data-testid="employee-shift-filter" value={shift} onChange={(e) => setShift(e.target.value)}><option>All shifts</option><option>Day shift</option><option>Night shift</option></select></div>
        <span className="results-count" data-testid="employee-results-count">{employees.length} records</span>
      </div>
      <section className="table-section">
        <div className="table-caption">
          <div><span className="eyebrow">DIRECTORY</span><h3>All employees</h3></div>
          <span className="access-note"><ShieldCheck size={14} /> Salary visible to Admin & Leadership</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th><th>Gender</th><th>Shift</th>
                {salaryVisible && <th>Monthly salary</th>}
                <th>ID (Aadhar/PAN)</th>
                {(onEdit || onDelete) && <th><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr data-testid={`employee-row-${e.id}`} key={e.id}>
                  <td>
                    <div className="person">
                      <EmployeeAvatar employee={e} size={36} />
                      <div><strong>{e.name}</strong><span>{e.role || "—"}</span></div>
                    </div>
                  </td>
                  <td>{e.gender}</td>
                  <td><span className={`shift-pill ${e.shift === "Night shift" ? "night" : "day"}`}><i />{e.shift}</span></td>
                  {salaryVisible && <td className="salary">{e.salary != null ? `₹${Number(e.salary).toLocaleString("en-IN")}` : "—"}</td>}
                  <td>{e.aadhar_last4 ? `Aadhar •••• ${e.aadhar_last4}` : e.pan_last4 ? `PAN •••• ${e.pan_last4}` : "—"}</td>
                  {(onEdit || onDelete) && (
                    <td>
                      <div className="row-actions">
                        <button data-testid={`history-employee-${e.id}-button`} className="icon-button" title="Absence history" onClick={() => onHistory(e)}><CalendarDays size={15} /></button>
                        {onEdit && <button data-testid={`edit-employee-${e.id}-button`} className="icon-button" onClick={() => onEdit(e)}><Pencil size={15} /></button>}
                        {onDelete && <button data-testid={`delete-employee-${e.id}-button`} className="icon-button danger" onClick={() => onDelete(e)}><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {employees.length === 0 && <div className="empty-state" data-testid="employees-empty-state">No employees yet. Add your first team member.</div>}
        </div>
      </section>
    </div>
  );
}

function Attendance({ employees, onHistory }) {
  const now = new Date();
  const [viewMode, setViewMode] = useState("by-month"); // "by-month" or "by-day"
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [selectedShift, setSelectedShift] = useState("Both");
  const [selectedEmployee, setSelectedEmployee] = useState("All");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [selectedDate, setSelectedDate] = useState(now.toISOString().slice(0, 10));
  const [absencesData, setAbsencesData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAbsences = async () => {
      setLoading(true);
      try {
        const allAbsences = await Promise.all(
          employees.map(async (emp) => {
            try {
              const absences = await api.listAbsences(emp.id);
              return { employee: emp, absences };
            } catch {
              return { employee: emp, absences: [] };
            }
          })
        );
        setAbsencesData(allAbsences);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    if (employees.length > 0) fetchAbsences();
  }, [employees]);

  // Get filtered employees based on shift and search
  const getFilteredEmployees = () => {
    return employees
      .filter(e => selectedShift === "Both" || e.shift === selectedShift)
      .filter(e => e.name.toLowerCase().includes(employeeSearch.toLowerCase()));
  };

  const selectEmployee = (empId, empName) => {
    setSelectedEmployee(empId);
    if (empId === "All") {
      setEmployeeSearch("");
    } else {
      setEmployeeSearch(empName);
    }
    setShowEmployeeList(false);
  };

  const getSelectedEmployeeName = () => {
    if (selectedEmployee === "All") return "All Employees";
    const emp = employees.find(e => e.id === selectedEmployee);
    return emp ? emp.name : "All Employees";
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showEmployeeList && !e.target.closest('[data-employee-search]')) {
        setShowEmployeeList(false);
        if (!employeeSearch) {
          setEmployeeSearch("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmployeeList, employeeSearch]);

  // Filter for by-month view
  const monthFilteredData = absencesData.filter(({ employee, absences }) => {
    if (selectedShift !== "Both" && employee.shift !== selectedShift) return false;
    if (selectedEmployee !== "All" && employee.id !== selectedEmployee) return false;
    const monthAbsences = absences.filter(a => a.absence_date.startsWith(selectedMonth));
    return monthAbsences.length > 0 || selectedEmployee !== "All";
  }).map(({ employee, absences }) => ({
    employee,
    absences: absences.filter(a => a.absence_date.startsWith(selectedMonth))
  }));

  // Filter for by-day view
  const dayFilteredData = absencesData.filter(({ employee }) => {
    if (selectedShift !== "Both" && employee.shift !== selectedShift) return false;
    if (selectedEmployee !== "All" && employee.id !== selectedEmployee) return false;
    return true;
  }).filter(({ absences }) => absences.some(a => a.absence_date === selectedDate));

  const totalAbsences = viewMode === "by-month"
    ? monthFilteredData.reduce((sum, item) => sum + item.absences.length, 0)
    : dayFilteredData.length;

  // Generate calendar days for selected month
  const getDaysInMonth = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => `${selectedMonth}-${String(i + 1).padStart(2, "0")}`);
  };

  const getAbsenceDatesForEmployee = (empAbsences) => {
    return new Set(empAbsences.map(a => a.absence_date));
  };

  return (
    <div className="page">
      <PageHead eyebrow="ATTENDANCE TRACKING" title="Attendance & Absences" />

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="eyebrow" style={{ marginBottom: 0 }}>VIEW</span>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", padding: "8px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer" }}>
            <option value="by-month">By Month</option>
            <option value="by-day">By Day</option>
          </select>
        </div>

        {viewMode === "by-month" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="eyebrow" style={{ marginBottom: 0 }}>MONTH</span>
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", padding: "8px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, colorScheme: "dark" }} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="eyebrow" style={{ marginBottom: 0 }}>DATE</span>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", padding: "8px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, colorScheme: "dark" }} />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="eyebrow" style={{ marginBottom: 0 }}>SHIFT</span>
          <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)} style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", padding: "8px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer" }}>
            <option>Both</option>
            <option>Day shift</option>
            <option>Night shift</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
          <span className="eyebrow" style={{ marginBottom: 0 }}>EMPLOYEE</span>
          <div style={{ position: "relative" }} data-employee-search>
            <input
              type="text"
              value={employeeSearch || (selectedEmployee !== "All" ? getSelectedEmployeeName() : "")}
              onChange={(e) => {
                setEmployeeSearch(e.target.value);
                setShowEmployeeList(true);
              }}
              onFocus={() => setShowEmployeeList(true)}
              placeholder={selectedEmployee === "All" ? "All Employees - Type to search..." : "Type to search..."}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                color: "var(--text)",
                padding: "8px 14px",
                paddingRight: (employeeSearch || selectedEmployee !== "All") ? 32 : 14,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                minWidth: 200,
                outline: "none"
              }}
            />
            {(employeeSearch || selectedEmployee !== "All") && (
              <button
                onClick={() => {
                  setEmployeeSearch("");
                  setSelectedEmployee("All");
                  setShowEmployeeList(false);
                }}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <X size={14} />
              </button>
            )}
            {showEmployeeList && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 4,
                background: "var(--elevated)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                maxHeight: 300,
                overflowY: "auto",
                zIndex: 100,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
              }}>
                <div
                  style={{
                    padding: "10px 14px",
                    fontSize: 12,
                    cursor: "pointer",
                    borderBottom: "1px solid var(--line)",
                    color: selectedEmployee === "All" ? "var(--blue)" : "var(--text)",
                    fontWeight: 600
                  }}
                  onClick={() => selectEmployee("All", "")}
                >
                  All Employees
                </div>
                {getFilteredEmployees().map(emp => (
                  <div
                    key={emp.id}
                    style={{
                      padding: "10px 14px",
                      fontSize: 12,
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      color: selectedEmployee === emp.id ? "var(--blue)" : "var(--text)",
                      transition: "all .2s ease"
                    }}
                    onMouseEnter={(e) => e.target.style.background = "rgba(255,255,255,0.05)"}
                    onMouseLeave={(e) => e.target.style.background = "transparent"}
                    onClick={() => selectEmployee(emp.id, emp.name)}
                  >
                    <div style={{ fontWeight: 600 }}>{emp.name}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{emp.role || "—"} · {emp.shift}</div>
                  </div>
                ))}
                {getFilteredEmployees().length === 0 && employeeSearch && (
                  <div style={{ padding: "20px 14px", fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
                    No employees found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {viewMode === "by-month" && (
        <section className="table-section">
          <div className="table-caption">
            <div><span className="eyebrow">MONTHLY VIEW / {monthFilteredData.filter(d => d.absences.length > 0).length} EMPLOYEES · {totalAbsences} TOTAL ABSENCES</span><h3>Absences for {selectedMonth}</h3></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th>Absences</th>
                  <th>Calendar</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan="5" style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Loading...</td></tr>}
                {!loading && monthFilteredData.map(({ employee, absences }) => {
                  const absentDates = getAbsenceDatesForEmployee(absences);
                  const days = getDaysInMonth();
                  return (
                    <tr key={employee.id}>
                      <td>
                        <div className="person">
                          <EmployeeAvatar employee={employee} size={36} />
                          <div><strong>{employee.name}</strong><span>{employee.role || "—"}</span></div>
                        </div>
                      </td>
                      <td><span className={`shift-pill ${employee.shift === "Night shift" ? "night" : "day"}`}><i />{employee.shift}</span></td>
                      <td className="salary">{absences.length}</td>
                      <td>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 400 }}>
                          {days.map(day => {
                            const isAbsent = absentDates.has(day);
                            const dayNum = day.split("-")[2];
                            return (
                              <div key={day} style={{ width: 28, height: 28, display: "grid", placeItems: "center", background: isAbsent ? "var(--red)" : "rgba(255,255,255,0.05)", border: "1px solid " + (isAbsent ? "var(--red)" : "#303848"), borderRadius: 4, fontSize: 10, color: isAbsent ? "#fff" : "#6d7a8e", fontWeight: isAbsent ? 700 : 400 }} title={isAbsent ? `Absent on ${day}` : day}>
                                {dayNum}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" onClick={() => onHistory(employee)} title="View details"><CalendarDays size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && monthFilteredData.filter(d => d.absences.length > 0).length === 0 && <div className="empty-state">No absences for this selection.</div>}
          </div>
        </section>
      )}

      {viewMode === "by-day" && (
        <section className="table-section">
          <div className="table-caption">
            <div><span className="eyebrow">DAILY VIEW / {dayFilteredData.length} ABSENT</span><h3>Absences on {selectedDate}</h3></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan="4" style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Loading...</td></tr>}
                {!loading && dayFilteredData.map(({ employee, absences }) => {
                  const absence = absences.find(a => a.absence_date === selectedDate);
                  return (
                    <tr key={employee.id}>
                      <td>
                        <div className="person">
                          <EmployeeAvatar employee={employee} size={36} />
                          <div><strong>{employee.name}</strong><span>{employee.role || "—"}</span></div>
                        </div>
                      </td>
                      <td><span className={`shift-pill ${employee.shift === "Night shift" ? "night" : "day"}`}><i />{employee.shift}</span></td>
                      <td>{absence?.reason || "—"}</td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" onClick={() => onHistory(employee)} title="View history"><CalendarDays size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && dayFilteredData.length === 0 && <div className="empty-state">No absences on this date.</div>}
          </div>
        </section>
      )}
    </div>
  );
}

function Reports({ reports, tags, activeTag, setActiveTag, years, activeYear, setActiveYear, onUpload, onDownload, onDelete, onManageTags }) {
  return (
    <div className="page">
      <PageHead eyebrow="DOCUMENT REPOSITORY" title="Reports">
        <div style={{ display: "flex", gap: 8 }}>
          {onManageTags && <button data-testid="manage-tags-button" className="outline-button" onClick={onManageTags}>Manage tags</button>}
          {onUpload && <button data-testid="upload-report-button" className="primary-button" onClick={onUpload}><UploadCloud size={17} /> Upload report</button>}
        </div>
      </PageHead>
      <section className="report-intro">
        <div>
          <span className="eyebrow">AUTOMATED FILE NAMING</span>
          <h2>Keep every report findable.</h2>
          <p>Filenames are auto-generated as <b>Date.pdf</b> when you upload. Organized by tag and year in S3.</p>
        </div>
        <div className="report-rule"><FileText size={20} /><span>PDF only<br /><b>Max 25 MB per file</b></span></div>
      </section>
      <div style={{ display: "flex", gap: 20, marginTop: 32, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div className="tag-row" style={{ margin: 0 }}>
          <span className="eyebrow">TAG</span>
          {tags.map((tag) => (
            <button data-testid={`report-tag-${tag.toLowerCase().replace(/\s+/g, "-")}-button`} className={activeTag === tag ? "tag active" : "tag"} key={tag} onClick={() => setActiveTag(tag)}>{tag}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="eyebrow" style={{ marginBottom: 0 }}>YEAR</span>
          <select
            data-testid="report-year-select"
            value={activeYear}
            onChange={(e) => setActiveYear(e.target.value)}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              color: "var(--text)",
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              cursor: "pointer",
              minWidth: 100
            }}
          >
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>
      <section className="table-section report-table">
        <div className="table-caption">
          <div><span className="eyebrow">REPOSITORY / {String(reports.length).padStart(2, "0")} FILES</span><h3>Recent reports</h3></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Document</th><th>Tag</th><th>Date</th><th>Year</th><th>Size</th><th /></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr data-testid={`report-row-${r.id}`} key={r.id}>
                  <td>
                    <div className="document">
                      <div className="file-icon"><FileText size={17} /></div>
                      <div><strong>{r.name}</strong></div>
                    </div>
                  </td>
                  <td><span className="report-tag">{r.tag}</span></td>
                  <td>{r.report_date}</td>
                  <td>{r.year}</td>
                  <td>{r.size ? `${Math.round(r.size / 1024)} KB` : "—"}</td>
                  <td>
                    <div className="row-actions">
                      <button data-testid={`view-report-${r.id}-button`} className="icon-button" onClick={() => onDownload(r.id)} title="View"><Eye size={15} /></button>
                      <button data-testid={`download-report-${r.id}-button`} className="icon-button" onClick={() => onDownload(r.id)} title="Download"><Download size={15} /></button>
                      {onDelete && <button data-testid={`delete-report-${r.id}-button`} className="icon-button danger" onClick={() => onDelete(r)} title="Delete"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reports.length === 0 && <div className="empty-state" data-testid="reports-empty-state">No reports yet for this tag/year.</div>}
        </div>
      </section>
    </div>
  );
}

function CompanySettings({ company, role, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [companyName, setCompanyName] = useState(company.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!companyName.trim()) {
      setError("Company name cannot be empty");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.updateCompany({ name: companyName.trim() });
      setIsEditing(false);
      onUpdate();
    } catch (e) {
      setError(e.detail || e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setCompanyName(company.name);
    setError("");
    setIsEditing(false);
  };

  return (
    <div className="page">
      <PageHead eyebrow="WORKSPACE CONFIGURATION" title="Settings" />

      <section className="data-section" style={{ marginBottom: 18 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow">COMPANY INFORMATION</span>
            <h3>Workspace details</h3>
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 24,
            padding: "20px 0",
            borderBottom: "1px solid var(--line)"
          }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>Company Name</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    style={{
                      background: "var(--elevated)",
                      border: "1px solid var(--line)",
                      color: "var(--text)",
                      padding: "10px 14px",
                      fontSize: 13,
                      borderRadius: 6,
                      outline: "none",
                      flex: 1,
                      maxWidth: 400
                    }}
                    autoFocus
                  />
                  <button
                    className="primary-button"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: "10px 18px", fontSize: 12 }}
                  >
                    {saving ? "Saving..." : <><Check size={15} /> Save</>}
                  </button>
                  <button
                    className="outline-button"
                    onClick={handleCancel}
                    disabled={saving}
                    style={{ padding: "10px 18px" }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600, flex: 1 }}>
                    {company.name}
                  </div>
                  {role === "admin" && (
                    <button
                      className="icon-button"
                      onClick={() => setIsEditing(true)}
                      title="Edit company name"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {error && (
            <div style={{
              background: "rgba(255, 59, 48, 0.1)",
              border: "1px solid rgba(255, 59, 48, 0.3)",
              color: "var(--red)",
              padding: "12px 16px",
              fontSize: 12,
              borderRadius: 6,
              marginTop: 16
            }}>
              {error}
            </div>
          )}

          <div style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 24,
            padding: "20px 0",
            borderBottom: "1px solid var(--line)"
          }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>Workspace Slug</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                {company.slug}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                Used in URL: {company.slug}.manage.zreports.in
              </div>
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 24,
            padding: "20px 0"
          }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>Company ID</div>
            </div>
            <div>
              <div style={{
                fontSize: 11,
                color: "var(--muted)",
                fontFamily: "monospace",
                background: "var(--elevated)",
                padding: "8px 12px",
                borderRadius: 4,
                display: "inline-block"
              }}>
                {company.id}
              </div>
            </div>
          </div>
        </div>
      </section>

      {role !== "admin" && (
        <div style={{
          background: "rgba(10, 132, 255, 0.08)",
          border: "1px solid rgba(10, 132, 255, 0.2)",
          padding: "14px 18px",
          borderRadius: 8,
          fontSize: 11,
          color: "var(--blue)",
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <ShieldCheck size={16} />
          Only admins can edit company information. Contact your admin to make changes.
        </div>
      )}
    </div>
  );
}

export default App;
