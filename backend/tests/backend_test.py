"""
Backend regression tests for ZReports Factory OS (Node/Express rewrite).
Covers: health, workspace lookup, auth guard, team, employees CRUD, absences (new), reports.
"""
import os
import io
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factory-reports-app.preview.emergentagent.com").rstrip("/")
SUPABASE_URL = "https://iufoxwjcxibiznaflbmr.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_5Jdw9AaPV7JRJmsrvR0GMA_QxReljMV"

ADMIN_EMAIL = "admin@acme-steel.test"
ADMIN_PASS = "AcmeAdmin123!"
MANAGER_EMAIL = "manager1@acme-steel.test"
MANAGER_PASS = "Manager123!"
SLUG = "acme-steel"
WRONG_SLUG = "apexforge-test-co"


def _sb_login(email, password):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


@pytest.fixture(scope="session")
def admin_token():
    tok = _sb_login(ADMIN_EMAIL, ADMIN_PASS)
    if not tok:
        pytest.skip("Admin login failed")
    return tok


@pytest.fixture(scope="session")
def manager_token():
    tok = _sb_login(MANAGER_EMAIL, MANAGER_PASS)
    return tok  # may be None if not seeded yet


def _h(token, slug=SLUG):
    h = {"Authorization": f"Bearer {token}"}
    if slug:
        h["X-Workspace-Slug"] = slug
    return h


# ---------- Health & lookup ----------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_lookup_ok():
    r = requests.get(f"{BASE_URL}/api/companies/lookup", params={"slug": SLUG}, timeout=15)
    assert r.status_code == 200
    assert r.json()["slug"] == SLUG


def test_lookup_unknown():
    r = requests.get(f"{BASE_URL}/api/companies/lookup", params={"slug": "ghost-factory"}, timeout=15)
    assert r.status_code == 404
    assert r.json()["detail"] == "workspace_not_found"


# ---------- Auth guard ----------
def test_me_no_token():
    r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 401


def test_me_no_slug(admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 400
    assert r.json()["detail"] == "workspace_missing"


def test_me_wrong_workspace(admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(admin_token, WRONG_SLUG), timeout=15)
    # apexforge exists in supabase per test_credentials note; expect 403 wrong_workspace, or 404 if slug no longer exists
    assert r.status_code in (403, 404)
    if r.status_code == 403:
        assert r.json()["detail"] == "wrong_workspace"


def test_me_ok(admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["profile"]["role"] == "admin"
    assert j["company"]["slug"] == SLUG


# ---------- Team ----------
def test_team_list_admin(admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/team", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list) and len(r.json()) >= 1


def test_team_invite_bad_role(admin_token):
    r = requests.post(
        f"{BASE_URL}/api/auth/team/invite",
        headers=_h(admin_token),
        json={"email": f"test_{uuid.uuid4().hex[:6]}@acme-steel.test", "password": "Passw0rd!", "full_name": "Test User", "role": "superuser"},
        timeout=20,
    )
    assert r.status_code == 400


def test_team_invite_short_password(admin_token):
    r = requests.post(
        f"{BASE_URL}/api/auth/team/invite",
        headers=_h(admin_token),
        json={"email": f"test_{uuid.uuid4().hex[:6]}@acme-steel.test", "password": "short", "full_name": "Test User", "role": "viewer"},
        timeout=20,
    )
    assert r.status_code == 400


def test_team_invite_flow(admin_token):
    """Full invite → patch role → reset password → delete."""
    email = f"test_{uuid.uuid4().hex[:8]}@acme-steel.test"
    r = requests.post(
        f"{BASE_URL}/api/auth/team/invite",
        headers=_h(admin_token),
        json={"email": email, "password": "Passw0rd!", "full_name": "TEST Invitee", "role": "viewer"},
        timeout=30,
    )
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    try:
        # patch role
        r2 = requests.patch(f"{BASE_URL}/api/auth/team/{uid}/role", headers=_h(admin_token), json={"role": "manager"}, timeout=20)
        assert r2.status_code == 200 and r2.json()["role"] == "manager"
        # reset password
        r3 = requests.post(f"{BASE_URL}/api/auth/team/{uid}/reset-password", headers=_h(admin_token), json={"password": "NewPass123!"}, timeout=20)
        assert r3.status_code == 204
    finally:
        rd = requests.delete(f"{BASE_URL}/api/auth/team/{uid}", headers=_h(admin_token), timeout=20)
        assert rd.status_code == 204


def test_manager_cannot_invite(manager_token):
    if not manager_token:
        pytest.skip("manager not seeded")
    r = requests.post(
        f"{BASE_URL}/api/auth/team/invite",
        headers=_h(manager_token),
        json={"email": "x@acme-steel.test", "password": "Passw0rd!", "full_name": "X", "role": "viewer"},
        timeout=20,
    )
    assert r.status_code == 403


# ---------- Employees ----------
@pytest.fixture(scope="session")
def created_employee_id(admin_token):
    payload = {"name": "TEST Employee", "role": "Operator", "gender": "male", "shift": "day", "salary": 25000}
    r = requests.post(f"{BASE_URL}/api/employees", headers=_h(admin_token), json=payload, timeout=20)
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    yield eid
    requests.delete(f"{BASE_URL}/api/employees/{eid}", headers=_h(admin_token), timeout=20)


def test_employees_list_admin_sees_salary(admin_token, created_employee_id):
    r = requests.get(f"{BASE_URL}/api/employees", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    emp = next((e for e in r.json() if e["id"] == created_employee_id), None)
    assert emp is not None
    assert emp["salary"] == 25000


def test_employees_manager_sees_null_salary(manager_token, created_employee_id):
    if not manager_token:
        pytest.skip("manager not seeded")
    r = requests.get(f"{BASE_URL}/api/employees", headers=_h(manager_token), timeout=20)
    assert r.status_code == 200
    emp = next((e for e in r.json() if e["id"] == created_employee_id), None)
    assert emp is not None
    assert emp["salary"] is None


def test_employees_search_and_shift(admin_token, created_employee_id):
    r = requests.get(f"{BASE_URL}/api/employees", headers=_h(admin_token), params={"search": "TEST Employee", "shift": "day"}, timeout=20)
    assert r.status_code == 200
    assert any(e["id"] == created_employee_id for e in r.json())


def test_employees_patch(admin_token, created_employee_id):
    r = requests.patch(f"{BASE_URL}/api/employees/{created_employee_id}", headers=_h(admin_token), json={"role": "Senior Op"}, timeout=20)
    assert r.status_code == 200 and r.json()["role"] == "Senior Op"


def test_manager_cannot_delete_employee(manager_token, created_employee_id):
    if not manager_token:
        pytest.skip("manager not seeded")
    r = requests.delete(f"{BASE_URL}/api/employees/{created_employee_id}", headers=_h(manager_token), timeout=20)
    assert r.status_code == 403


# ---------- Absences (new) ----------
def test_absences_bad_date(admin_token, created_employee_id):
    r = requests.post(
        f"{BASE_URL}/api/employees/{created_employee_id}/absences",
        headers=_h(admin_token),
        json={"absence_date": "01-01-2026"},
        timeout=20,
    )
    assert r.status_code == 400


def test_absences_crud_admin(admin_token, created_employee_id):
    # Create two absences
    r1 = requests.post(f"{BASE_URL}/api/employees/{created_employee_id}/absences", headers=_h(admin_token), json={"absence_date": "2026-01-05", "reason": "sick"}, timeout=20)
    assert r1.status_code == 201
    a1 = r1.json()["id"]
    r2 = requests.post(f"{BASE_URL}/api/employees/{created_employee_id}/absences", headers=_h(admin_token), json={"absence_date": "2026-01-10"}, timeout=20)
    assert r2.status_code == 201
    a2 = r2.json()["id"]
    # List ordered desc
    rl = requests.get(f"{BASE_URL}/api/employees/{created_employee_id}/absences", headers=_h(admin_token), timeout=20)
    assert rl.status_code == 200
    dates = [a["absence_date"] for a in rl.json()]
    assert dates[0] >= dates[-1]
    # Delete
    rd = requests.delete(f"{BASE_URL}/api/absences/{a1}", headers=_h(admin_token), timeout=20)
    assert rd.status_code == 204
    rd2 = requests.delete(f"{BASE_URL}/api/absences/{a2}", headers=_h(admin_token), timeout=20)
    assert rd2.status_code == 204


def test_absence_cross_workspace_delete_404(admin_token, created_employee_id):
    # try to delete a random UUID absence
    r = requests.delete(f"{BASE_URL}/api/absences/{uuid.uuid4()}", headers=_h(admin_token), timeout=20)
    assert r.status_code == 404


# ---------- Reports ----------
def test_reports_tags(admin_token):
    r = requests.get(f"{BASE_URL}/api/reports/tags", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert "tags" in j and "access_levels" in j
    assert "Production" in j["tags"]


def test_reports_upload_bad_filename(admin_token):
    files = {"file": ("badname.pdf", b"%PDF-1.4\n%test", "application/pdf")}
    r = requests.post(f"{BASE_URL}/api/reports/upload", headers=_h(admin_token), data={"tag": "Production", "access": "leadership"}, files=files, timeout=30)
    assert r.status_code == 400


def test_reports_upload_not_pdf(admin_token):
    files = {"file": ("2026-01-05_Report.pdf", b"NOT A PDF", "application/pdf")}
    r = requests.post(f"{BASE_URL}/api/reports/upload", headers=_h(admin_token), data={"tag": "Production", "access": "leadership"}, files=files, timeout=30)
    assert r.status_code == 400


@pytest.fixture(scope="session")
def uploaded_report_id(admin_token):
    filename = f"2026-01-05_TESTReport{uuid.uuid4().hex[:4]}.pdf"
    files = {"file": (filename, b"%PDF-1.4\n%test content\n", "application/pdf")}
    r = requests.post(f"{BASE_URL}/api/reports/upload", headers=_h(admin_token), data={"tag": "Production", "access": "leadership"}, files=files, timeout=30)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    yield rid
    requests.delete(f"{BASE_URL}/api/reports/{rid}", headers=_h(admin_token), timeout=20)


def test_reports_list_and_download(admin_token, uploaded_report_id):
    r = requests.get(f"{BASE_URL}/api/reports", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    assert any(x["id"] == uploaded_report_id for x in r.json())
    rd = requests.get(f"{BASE_URL}/api/reports/{uploaded_report_id}/download", headers=_h(admin_token), timeout=20)
    assert rd.status_code == 200
    assert "url" in rd.json() and rd.json()["url"].startswith("http")


def test_manager_cannot_upload(manager_token):
    if not manager_token:
        pytest.skip("manager not seeded")
    files = {"file": ("2026-01-05_Report.pdf", b"%PDF-1.4\n%x", "application/pdf")}
    r = requests.post(f"{BASE_URL}/api/reports/upload", headers=_h(manager_token), data={"tag": "Production", "access": "leadership"}, files=files, timeout=30)
    assert r.status_code == 403


def test_manager_reports_list_filtered(manager_token, uploaded_report_id):
    if not manager_token:
        pytest.skip("manager not seeded")
    # Manager access levels are ["all","management"], so a "leadership" access report shouldn't appear
    r = requests.get(f"{BASE_URL}/api/reports", headers=_h(manager_token), timeout=20)
    assert r.status_code == 200
    assert not any(x["id"] == uploaded_report_id for x in r.json())
