"""End-to-end backend tests against the deployed FastAPI + Supabase stack."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factory-reports-app.preview.emergentagent.com").rstrip("/")
SUPABASE_URL = "https://iufoxwjcxibiznaflbmr.supabase.co"
SUPABASE_ANON = "sb_publishable_5Jdw9AaPV7JRJmsrvR0GMA_QxReljMV"

ADMIN_EMAIL = "admin@apexforge.test"
VIEWER_EMAIL = "viewer@apexforge.test"
PASSWORD = "TestPass123!"


def _signin(email, password):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"Supabase signin failed {r.status_code}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    return _signin(ADMIN_EMAIL, PASSWORD)


@pytest.fixture(scope="session")
def viewer_token():
    return _signin(VIEWER_EMAIL, PASSWORD)


@pytest.fixture
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture
def viewer_client(viewer_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {viewer_token}", "Content-Type": "application/json"})
    return s


# ---------- Health ----------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_unauth_me_rejected():
    r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
    assert r.status_code == 401


# ---------- Auth / Bootstrap ----------
def test_admin_me(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/auth/me")
    # If admin not onboarded, bootstrap first
    if r.status_code == 404:
        r2 = admin_client.post(
            f"{BASE_URL}/api/auth/bootstrap",
            json={"full_name": "Priya Nair", "company_name": "ApexForge Test Co"},
        )
        assert r2.status_code in (200, 201), r2.text
        r = admin_client.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["profile"]["role"] == "admin"
    assert body["company"]["name"] == "ApexForge Test Co"


def test_viewer_bootstrap_as_viewer(viewer_client):
    # Ensure viewer is onboarded; joining existing company should assign viewer
    me = viewer_client.get(f"{BASE_URL}/api/auth/me")
    if me.status_code == 404:
        r = viewer_client.post(
            f"{BASE_URL}/api/auth/bootstrap",
            json={"full_name": "Rakesh Kumar", "company_name": "ApexForge Test Co"},
        )
        assert r.status_code in (200, 201), r.text
        me = viewer_client.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["profile"]["role"] == "viewer"
    assert body["company"]["name"] == "ApexForge Test Co"


# ---------- Employees CRUD ----------
def test_employee_crud_flow(admin_client):
    payload = {
        "name": f"TEST_Employee_{uuid.uuid4().hex[:6]}",
        "role": "Line Manager",
        "gender": "Female",
        "shift": "Day shift",
        "salary": 42000,
        "aadhar_last4": "1234",
    }
    r = admin_client.post(f"{BASE_URL}/api/employees", json=payload)
    assert r.status_code == 201, r.text
    emp = r.json()
    eid = emp["id"]
    assert emp["name"] == payload["name"]
    assert emp["salary"] == 42000  # admin sees salary

    # search filter
    lst = admin_client.get(f"{BASE_URL}/api/employees", params={"search": payload["name"][:14]}).json()
    assert any(e["id"] == eid for e in lst)

    # shift filter
    lst2 = admin_client.get(f"{BASE_URL}/api/employees", params={"shift": "Day shift"}).json()
    assert any(e["id"] == eid for e in lst2)

    # update salary
    up = admin_client.patch(f"{BASE_URL}/api/employees/{eid}", json={**payload, "salary": 55000})
    assert up.status_code == 200, up.text
    assert float(up.json()["salary"]) == 55000

    # delete
    d = admin_client.delete(f"{BASE_URL}/api/employees/{eid}")
    assert d.status_code == 204


def test_viewer_cannot_create_employee(viewer_client):
    r = viewer_client.post(
        f"{BASE_URL}/api/employees",
        json={"name": "TEST_X", "gender": "Male", "shift": "Day shift", "salary": 1},
    )
    assert r.status_code == 403


def test_viewer_salary_hidden(admin_client, viewer_client):
    # Seed one employee as admin
    payload = {"name": f"TEST_Vis_{uuid.uuid4().hex[:6]}", "gender": "Male", "shift": "Day shift", "salary": 99000}
    created = admin_client.post(f"{BASE_URL}/api/employees", json=payload).json()
    try:
        rows = viewer_client.get(f"{BASE_URL}/api/employees").json()
        match = [e for e in rows if e["id"] == created["id"]]
        assert match, "Viewer should see the employee row"
        assert match[0]["salary"] is None, "Viewer must NOT see salary"
    finally:
        admin_client.delete(f"{BASE_URL}/api/employees/{created['id']}")


# ---------- Reports ----------
def test_report_tags(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/reports/tags")
    assert r.status_code == 200
    body = r.json()
    assert "Quality" in body["tags"]
    assert "leadership" in body["access_levels"]


def _pdf_bytes():
    return b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def test_report_upload_invalid_filename(admin_token):
    files = {"file": ("test.pdf", _pdf_bytes(), "application/pdf")}
    data = {"tag": "Quality", "access": "leadership"}
    r = requests.post(
        f"{BASE_URL}/api/reports/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files=files,
        data=data,
        timeout=20,
    )
    assert r.status_code == 400
    assert "YYYY-MM-DD" in r.text


def test_report_upload_and_list_and_download(admin_token):
    fname = f"2026-02-01_QualityCheck-{uuid.uuid4().hex[:4]}.pdf"
    files = {"file": (fname, _pdf_bytes(), "application/pdf")}
    data = {"tag": "Quality", "access": "leadership"}
    r = requests.post(
        f"{BASE_URL}/api/reports/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files=files,
        data=data,
        timeout=30,
    )
    assert r.status_code == 201, r.text
    rep = r.json()
    rid = rep["id"]
    assert rep["tag"] == "Quality"
    assert rep["access"] == "leadership"
    assert rep["report_date"] == "2026-02-01"

    # list with tag filter
    lst = requests.get(
        f"{BASE_URL}/api/reports?tag=Quality",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert lst.status_code == 200
    assert any(r_["id"] == rid for r_ in lst.json())

    # signed URL
    dl = requests.get(
        f"{BASE_URL}/api/reports/{rid}/download",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert dl.status_code == 200
    assert dl.json().get("url", "").startswith("http")

    # cleanup
    requests.delete(
        f"{BASE_URL}/api/reports/{rid}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )


def test_viewer_cannot_see_leadership_report(admin_token, viewer_token):
    fname = f"2026-02-02_LeadOnly-{uuid.uuid4().hex[:4]}.pdf"
    r = requests.post(
        f"{BASE_URL}/api/reports/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": (fname, _pdf_bytes(), "application/pdf")},
        data={"tag": "Quality", "access": "leadership"},
        timeout=30,
    )
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    try:
        lst = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {viewer_token}"},
            timeout=15,
        ).json()
        assert not any(x["id"] == rid for x in lst), "Viewer must not see leadership-level report"
        # And direct download must be denied
        dl = requests.get(
            f"{BASE_URL}/api/reports/{rid}/download",
            headers={"Authorization": f"Bearer {viewer_token}"},
            timeout=15,
        )
        assert dl.status_code == 403
    finally:
        requests.delete(
            f"{BASE_URL}/api/reports/{rid}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )


# ---------- Team & role update ----------
def test_admin_can_list_and_update_team(admin_client, viewer_client):
    # ensure viewer bootstrapped
    if viewer_client.get(f"{BASE_URL}/api/auth/me").status_code == 404:
        viewer_client.post(
            f"{BASE_URL}/api/auth/bootstrap",
            json={"full_name": "Rakesh Kumar", "company_name": "ApexForge Test Co"},
        )
    team = admin_client.get(f"{BASE_URL}/api/auth/team")
    assert team.status_code == 200
    members = team.json()
    viewer = next((m for m in members if m["email"] == VIEWER_EMAIL), None)
    assert viewer is not None, "Viewer should appear in team list"

    # Promote to manager
    r = admin_client.patch(
        f"{BASE_URL}/api/auth/team/{viewer['id']}/role", json={"role": "manager"}
    )
    assert r.status_code == 200
    assert r.json()["role"] == "manager"

    # Revert to viewer for other tests
    admin_client.patch(
        f"{BASE_URL}/api/auth/team/{viewer['id']}/role", json={"role": "viewer"}
    )
