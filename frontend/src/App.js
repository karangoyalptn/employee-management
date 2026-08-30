import { useEffect, useMemo, useRef, useState } from "react";
import "@/App.css";
import {
  Bell, ChevronDown, FileText, Filter, LayoutDashboard, LogOut, Menu, Pencil, Plus,
  Search, Settings, ShieldCheck, Trash2, Users, X, UploadCloud, Download, UserCog, KeyRound,
  CalendarDays,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { api, getWorkspaceSlug } from "@/lib/api";

const avatarImages = [
  "https://images.unsplash.com/photo-1685475887169-9c9a84bf740f?auto=format&fit=crop&w=120&q=80",
];

const ROLE_LABEL = { admin: "Admin", leadership: "Leadership", manager: "Manager", viewer: "Viewer" };
const ACCESS_LABEL = { all: "All employees", management: "Managers+", leadership: "Leadership+", admin: "Admin only" };

const canManageEmployees = (r) => ["admin", "leadership", "manager"].includes(r);
const canDeleteEmployees = (r) => ["admin", "leadership"].includes(r);
const canUploadReports = (r) => ["admin", "leadership"].includes(r);
const canSeeSalary = (r) => ["admin", "leadership"].includes(r);

const initialsOf = (name) => (name || "").split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase();

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
          <br />Ask your account owner to provision it, then use its factory URL like <code style={{ color: "#a8c0e0" }}>your-factory.manage.zreports.com</code>.
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

  const load = () => api.listAbsences(employee.id).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [employee.id]);

  const add = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr("Date must be YYYY-MM-DD");
    setErr(""); setSaving(true);
    try { await api.addAbsence(employee.id, { absence_date: date, reason: reason || null }); setReason(""); await load(); }
    catch (e) { setErr(e.detail || e.message); }
    finally { setSaving(false); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Remove absence on ${a.absence_date}?`)) return;
    try { await api.deleteAbsence(a.id); await load(); }
    catch (e) { alert(e.detail || e.message); }
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
              <input data-testid="absence-date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                      <button data-testid={`absence-delete-${a.id}-button`} className="icon-button danger" onClick={() => remove(a)}>
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
      </div>
    </div>
  );
}

function EmployeeModal({ employee, role, onClose, onSave, saving }) {
  const [form, setForm] = useState(
    employee || { name: "", role: "", gender: "Male", shift: "Day shift", salary: "", aadhar_last4: "", pan_last4: "", photo_url: "" }
  );
  const [err, setErr] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [idDocFile, setIdDocFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(employee?.photo_url || "");
  const [hasIdDoc, setHasIdDoc] = useState(!!employee?.has_id_doc);
  const [uploadBusy, setUploadBusy] = useState(false);
  const photoRef = useRef();
  const idRef = useRef();

  const update = (key, value) => setForm({ ...form, [key]: value });

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
      photo_url: form.photo_url || null,
    });
    if (!saved?.id) return;
    // Upload files if any
    if (photoFile || idDocFile) {
      setUploadBusy(true);
      try {
        if (photoFile) await api.uploadEmployeePhoto(saved.id, photoFile);
        if (idDocFile) await api.uploadEmployeeIdDoc(saved.id, idDocFile);
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
    if (!window.confirm("Remove photo?")) return;
    try { await api.deleteEmployeePhoto(employee.id); setPhotoPreview(""); setPhotoFile(null); }
    catch (e) { alert(e.detail || e.message); }
  };
  const removeIdDoc = async () => {
    if (!employee?.id) { setIdDocFile(null); return; }
    if (!window.confirm("Remove ID document?")) return;
    try { await api.deleteEmployeeIdDoc(employee.id); setHasIdDoc(false); setIdDocFile(null); }
    catch (e) { alert(e.detail || e.message); }
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
              {photoPreview && <button data-testid="employee-photo-remove-button" className="outline-button" onClick={removePhoto}>Remove</button>}
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
          {employee?.id && hasIdDoc && <button data-testid="employee-iddoc-remove-button" className="outline-button" onClick={removeIdDoc}>Remove</button>}
        </div>

        {err && <p data-testid="employee-form-error" style={{ color: "var(--red)", fontSize: 11 }}>{err}</p>}
        <div className="modal-actions">
          <button data-testid="employee-cancel-button" className="outline-button" onClick={onClose}>Cancel</button>
          <button data-testid="employee-save-button" className="primary-button" onClick={submit} disabled={saving || uploadBusy}>
            {(saving || uploadBusy) ? "Saving…" : "Save employee"} <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportUploadModal({ onClose, onSubmit, tags, accessLevels, uploading }) {
  const [file, setFile] = useState(null);
  const [tag, setTag] = useState(tags[0] || "");
  const [access, setAccess] = useState("leadership");
  const [err, setErr] = useState("");
  const inputRef = useRef();
  const submit = async () => {
    if (!file) return setErr("Please choose a PDF file.");
    if (!/^\d{4}-\d{2}-\d{2}_[A-Za-z0-9][A-Za-z0-9 _\-]{1,80}\.pdf$/.test(file.name))
      return setErr("Filename must be YYYY-MM-DD_ReportName.pdf");
    setErr("");
    try { await onSubmit(file, tag, access); }
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
            <p>Filename must be <b>YYYY-MM-DD_ReportName.pdf</b> · Max 25 MB</p>
          </div>
          <input ref={inputRef} data-testid="report-file-input" type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => setFile(e.target.files[0])} />
          <button data-testid="report-file-picker-button" className="outline-button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>Browse</button>
        </div>
        <div className="form-grid">
          <label>Tag *
            <select data-testid="report-tag-select" value={tag} onChange={(e) => setTag(e.target.value)}>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Access level *
            <select data-testid="report-access-select" value={access} onChange={(e) => setAccess(e.target.value)}>
              {accessLevels.map((a) => <option key={a} value={a}>{ACCESS_LABEL[a] || a}</option>)}
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
  const canEdit = role === "admin" || role === "leadership";
  const load = () => api.reportTags().then((d) => setTags(d.tag_rows || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (name.trim().length < 2) return setErr("Tag name must be at least 2 characters.");
    setErr(""); setSaving(true);
    try { await api.createTag(name.trim()); setName(""); await load(); onChanged?.(); }
    catch (e) { setErr(e.detail || e.message); }
    finally { setSaving(false); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Remove tag "${t.name}"?`)) return;
    try { await api.deleteTag(t.id); await load(); onChanged?.(); }
    catch (e) { alert(e.detail || e.message); }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" data-testid="tags-modal" style={{ width: "min(520px, 100%)" }}>
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
          <table>
            <thead><tr><th>Name</th>{canEdit && <th /> }</tr></thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id} data-testid={`tag-row-${t.id}`}>
                  <td><span className="report-tag">{t.name}</span></td>
                  {canEdit && <td><button data-testid={`tag-delete-${t.id}-button`} className="icon-button danger" onClick={() => remove(t)}><Trash2 size={15} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {tags.length === 0 && <div className="empty-state">No tags yet.</div>}
        </div>
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
  const remove = async (u) => {
    if (!window.confirm(`Remove ${u.full_name} from this workspace?`)) return;
    try { await api.removeMember(u.id); await load(); }
    catch (e) { alert(e.detail || e.message); }
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
                        <button data-testid={`team-remove-${u.id}-button`} className="icon-button danger" title="Remove member" onClick={() => remove(u)}><Trash2 size={15} /></button>
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
  const [tagsMeta, setTagsMeta] = useState({ tags: [], access_levels: [] });
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
  const [activeTag, setActiveTag] = useState("All reports");

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
    try { setReports(await api.listReports(activeTag === "All reports" ? "" : activeTag)); }
    catch (e) { console.error(e); }
  };
  useEffect(() => { if (me) refreshEmployees(); // eslint-disable-next-line
  }, [me, search, shift]);
  useEffect(() => { if (me) refreshReports(); // eslint-disable-next-line
  }, [me, activeTag]);
  useEffect(() => { if (me && tagsMeta.tags.length === 0) api.reportTags().then(setTagsMeta).catch(() => {}); }, [me, tagsMeta.tags.length]);

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
  const deleteEmployee = async (id) => {
    if (!window.confirm("Remove this employee?")) return;
    try { await api.deleteEmployee(id); flash("Employee removed"); await refreshEmployees(); }
    catch (e) { alert(e.detail || e.message); }
  };
  const uploadReport = async (file, tag, access) => {
    setUploading(true);
    try { await api.uploadReport(file, tag, access); setUploadModal(false); flash("Report uploaded"); await refreshReports(); }
    catch (e) { throw e; }
    finally { setUploading(false); }
  };
  const downloadReport = async (id) => {
    try { const { url } = await api.downloadReport(id); if (url) window.open(url, "_blank"); }
    catch (e) { alert(e.detail || e.message); }
  };
  const deleteReport = async (id) => {
    if (!window.confirm("Delete this report?")) return;
    try { await api.deleteReport(id); flash("Report deleted"); await refreshReports(); }
    catch (e) { alert(e.detail || e.message); }
  };
  const logout = async () => { await supabase.auth.signOut(); setSession(null); setMe(null); };

  // Render tree
  if (wsError) return <WorkspaceMissing slug={slug} />;
  if (!workspace) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#8d99aa" }}>Loading workspace…</div>;
  if (!session) return <LoginScreen workspace={workspace} onSignedIn={() => {}} />;
  if (loadingMe) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#8d99aa" }}>Loading workspace…</div>;
  if (meError === "profile_not_found" || meError === "wrong_workspace") return <AccessDenied email={session.user.email} onSignOut={logout} />;
  if (!me) return null;

  const availableAccess = role === "admin" ? ["all", "management", "leadership", "admin"] : ["all", "management", "leadership"];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand"><span className="brand-mark">AF</span><span>{me.company.name}</span></div>
        <div className="side-label">OPERATIONS</div>
        <nav>
          {[["Overview", LayoutDashboard], ["Employees", Users], ["Reports", FileText]].map(([label, Icon]) => (
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
        <button data-testid="nav-settings-button" className="nav-item"><Settings size={17} /><span>Settings</span></button>
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
      <main className="main-content">
        <header className="topbar">
          <button data-testid="mobile-menu-button" className="mobile-menu"><Menu size={20} /></button>
          <div className="breadcrumb">{me.company.name} <span>/</span> <b>{active}</b></div>
          <div className="top-actions">
            <button data-testid="notifications-button" className="icon-button notification"><Bell size={18} /><i /></button>
            <div className="top-profile"><span>{initialsOf(me.profile.full_name)}</span><ChevronDown size={14} /></div>
          </div>
        </header>
        {active === "Overview" && (
          <Overview me={me}
            employeesCount={employees.length}
            nightCount={employees.filter((e) => e.shift === "Night shift").length}
            reportsCount={reports.length}
            onViewEmployees={() => setActive("Employees")}
            onViewReports={() => setActive("Reports")}
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
            onDelete={canDeleteEmployees(role) ? deleteEmployee : null}
            onHistory={setAbsenceFor}
          />
        )}
        {active === "Reports" && (
          <Reports reports={reports}
            tags={tagsMeta.tags}
            activeTag={activeTag} setActiveTag={setActiveTag}
            onUpload={canUploadReports(role) ? () => setUploadModal(true) : null}
            onDownload={downloadReport}
            onDelete={canDeleteEmployees(role) ? deleteReport : null}
            onManageTags={canUploadReports(role) ? () => setTagsModal(true) : null}
          />
        )}
        {notice && <div className="toast" data-testid="success-notice">{notice}<span>✓</span></div>}
        {modal && <EmployeeModal employee={modal.id ? modal : null} role={role} onClose={() => setModal(null)} onSave={saveEmployee} saving={savingEmployee} />}
        {uploadModal && <ReportUploadModal onClose={() => setUploadModal(false)} onSubmit={uploadReport} tags={tagsMeta.tags} accessLevels={availableAccess} uploading={uploading} />}
        {teamModal && <TeamModal onClose={() => setTeamModal(false)} currentUserId={me.profile.id} />}
        {tagsModal && <TagsModal onClose={() => setTagsModal(false)} onChanged={() => api.reportTags().then(setTagsMeta).catch(() => {})} role={role} />}
        {absenceFor && (
          <AbsenceHistoryModal
            employee={absenceFor}
            canEdit={canManageEmployees(role)}
            onClose={() => setAbsenceFor(null)}
          />
        )}
      </main>
    </div>
  );
}

function PageHead({ eyebrow, title, children }) {
  return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{children}</div>;
}

function Overview({ me, employeesCount, nightCount, reportsCount, onViewEmployees, onViewReports, canAdd, onAdd }) {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
  const nightPct = employeesCount ? Math.round((nightCount / employeesCount) * 100) : 0;
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
        <section className="data-section">
          <div className="section-head">
            <div><span className="eyebrow">WORKFORCE</span><h3>Weekly attendance signal</h3></div>
            <button data-testid="overview-view-employees-button" className="text-button" onClick={onViewEmployees}>View directory <span>→</span></button>
          </div>
          <div className="attendance-chart">
            <div className="chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
            <div className="bars">
              {[68, 78, 73, 88, 76, 94, 84, 92, 81, 97, 86, 90].map((height, i) => (
                <div className="bar-group" key={i}>
                  <div className={`bar ${i > 8 ? "bright" : ""}`} style={{ height: `${height}%` }} title={`${height}%`} />
                  <span>{["M", "T", "W", "T", "F", "S"][i % 6]}</span>
                </div>
              ))}
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
                      <div className="avatar">{e.photo_url ? <img src={e.photo_url} alt="" /> : initialsOf(e.name)}</div>
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
                        {onDelete && <button data-testid={`delete-employee-${e.id}-button`} className="icon-button danger" onClick={() => onDelete(e.id)}><Trash2 size={15} /></button>}
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

function Reports({ reports, tags, activeTag, setActiveTag, onUpload, onDownload, onDelete, onManageTags }) {
  const filterTags = ["All reports", ...tags];
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
          <span className="eyebrow">FILE NAMING STANDARD</span>
          <h2>Keep every report findable.</h2>
          <p>Use <b>YYYY-MM-DD_ReportName.pdf</b> when uploading. Tag & access rules are saved with every document.</p>
        </div>
        <div className="report-rule"><FileText size={20} /><span>PDF only<br /><b>Max 25 MB per file</b></span></div>
      </section>
      <div className="tag-row">
        <span className="eyebrow">FILTER BY TAG</span>
        {filterTags.map((tag) => (
          <button data-testid={`report-tag-${tag.toLowerCase().replace(/\s+/g, "-")}-button`} className={activeTag === tag ? "tag active" : "tag"} key={tag} onClick={() => setActiveTag(tag)}>{tag}</button>
        ))}
      </div>
      <section className="table-section report-table">
        <div className="table-caption">
          <div><span className="eyebrow">REPOSITORY / {String(reports.length).padStart(2, "0")} FILES</span><h3>Recent reports</h3></div>
          <span className="access-note"><ShieldCheck size={14} /> Role-based access enabled</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Document</th><th>Tag</th><th>Date</th><th>Access</th><th /></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr data-testid={`report-row-${r.id}`} key={r.id}>
                  <td>
                    <div className="document">
                      <div className="file-icon"><FileText size={17} /></div>
                      <div><strong>{r.name}</strong><span>Uploaded by {r.uploaded_by || "—"}</span></div>
                    </div>
                  </td>
                  <td><span className="report-tag">{r.tag}</span></td>
                  <td>{r.report_date}</td>
                  <td>{ACCESS_LABEL[r.access] || r.access}</td>
                  <td>
                    <div className="row-actions">
                      <button data-testid={`download-report-${r.id}-button`} className="icon-button" onClick={() => onDownload(r.id)} title="Download"><Download size={15} /></button>
                      {onDelete && <button data-testid={`delete-report-${r.id}-button`} className="icon-button danger" onClick={() => onDelete(r.id)} title="Delete"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reports.length === 0 && <div className="empty-state" data-testid="reports-empty-state">No reports yet.</div>}
        </div>
      </section>
    </div>
  );
}

export default App;
