import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from supabase import create_client

from database import get_db
from models import Absence, Company, Employee, Report, UserProfile, utcnow
from schemas import (
    AbsenceCreate,
    CompanyOut,
    EmployeeCreate,
    EmployeeUpdate,
    InviteMember,
    MeOut,
    ProfileOut,
    ResetPassword,
    RoleChange,
)

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REPORTS_BUCKET = "reports"
PHOTOS_BUCKET = "employee-photos"
ALLOWED_TAGS = ["Production", "Safety", "Finance", "HR", "Maintenance", "Quality", "Compliance"]
ALLOWED_ACCESS = ["all", "management", "leadership", "admin"]
ALLOWED_ROLES = ["admin", "leadership", "manager", "viewer"]
FILENAME_PATTERN = re.compile(r"^(\d{4}-\d{2}-\d{2})_([A-Za-z0-9][A-Za-z0-9 _\-]{1,80})\.pdf$")


def sb_client():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        sb = sb_client()
        existing = {b.name for b in sb.storage.list_buckets()}
        if REPORTS_BUCKET not in existing:
            sb.storage.create_bucket(REPORTS_BUCKET, options={"public": False})
        if PHOTOS_BUCKET not in existing:
            sb.storage.create_bucket(PHOTOS_BUCKET, options={"public": True})
    except Exception as exc:
        print(f"[startup] bucket bootstrap warning: {exc}")
    yield


app = FastAPI(title="ApexForge Factory OS API", lifespan=lifespan)
api = APIRouter(prefix="/api")


async def _verify_token(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Supabase session required")
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": authorization},
        )
    if resp.status_code != 200:
        raise HTTPException(401, "Session invalid or expired")
    return resp.json()


async def _resolve_workspace(x_workspace_slug: str | None, db: AsyncSession) -> Company:
    if not x_workspace_slug:
        raise HTTPException(400, "workspace_missing")
    result = await db.execute(select(Company).where(Company.slug == x_workspace_slug))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(404, "workspace_not_found")
    return company


async def current_profile(
    authorization: str | None = Header(default=None),
    x_workspace_slug: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    user = await _verify_token(authorization)
    company = await _resolve_workspace(x_workspace_slug, db)
    profile = await db.get(UserProfile, user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="profile_not_found")
    if profile.company_id != company.id:
        raise HTTPException(status_code=403, detail="wrong_workspace")
    return profile


def require_role(profile: UserProfile, allowed: list[str]) -> None:
    if profile.role not in allowed:
        raise HTTPException(403, f"Requires one of: {', '.join(allowed)}")


def can_see_salary(role: str) -> bool:
    return role in ("admin", "leadership")


def accessible_report_levels(role: str) -> list[str]:
    if role == "admin":
        return ["all", "management", "leadership", "admin"]
    if role == "leadership":
        return ["all", "management", "leadership"]
    if role == "manager":
        return ["all", "management"]
    return ["all"]


def serialize_employee(emp: Employee, role: str) -> dict:
    return {
        "id": emp.id,
        "name": emp.name,
        "role": emp.role,
        "gender": emp.gender,
        "shift": emp.shift,
        "salary": float(emp.salary) if can_see_salary(role) and emp.salary is not None else None,
        "aadhar_last4": emp.aadhar_last4,
        "pan_last4": emp.pan_last4,
        "photo_url": emp.photo_url,
    }


# ---------- Health ----------
@api.get("/health")
async def health():
    return {"status": "ok", "service": "apexforge"}


# ---------- Public workspace lookup ----------
@api.get("/companies/lookup", response_model=CompanyOut)
async def lookup_company(slug: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.slug == slug))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(404, "workspace_not_found")
    return company


# ---------- Auth / Profile ----------
@api.get("/auth/me", response_model=MeOut)
async def me(profile: UserProfile = Depends(current_profile), db: AsyncSession = Depends(get_db)):
    company = await db.get(Company, profile.company_id)
    return {"profile": profile, "company": company}


@api.get("/auth/team", response_model=list[ProfileOut])
async def list_team(profile: UserProfile = Depends(current_profile), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(UserProfile).where(UserProfile.company_id == profile.company_id).order_by(UserProfile.full_name)
        )
    ).scalars().all()
    return list(rows)


@api.post("/auth/team/invite", response_model=ProfileOut, status_code=201)
async def invite_member(
    payload: InviteMember,
    profile: UserProfile = Depends(current_profile),
    db: AsyncSession = Depends(get_db),
):
    require_role(profile, ["admin"])
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(400, "invalid role")
    # create supabase auth user (auto-confirmed)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={"email": payload.email, "password": payload.password, "email_confirm": True},
        )
    if resp.status_code >= 400:
        detail = resp.json().get("msg") or resp.json().get("error_description") or resp.text
        raise HTTPException(400, f"auth_create_failed: {detail}")
    user_id = resp.json()["id"]
    new_profile = UserProfile(
        id=user_id,
        email=payload.email,
        full_name=payload.full_name.strip(),
        role=payload.role,
        company_id=profile.company_id,
        created_at=utcnow(),
    )
    db.add(new_profile)
    await db.commit()
    await db.refresh(new_profile)
    return new_profile


@api.patch("/auth/team/{user_id}/role", response_model=ProfileOut)
async def update_team_role(
    user_id: str,
    payload: RoleChange,
    profile: UserProfile = Depends(current_profile),
    db: AsyncSession = Depends(get_db),
):
    require_role(profile, ["admin"])
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(400, "invalid role")
    target = await db.get(UserProfile, user_id)
    if not target or target.company_id != profile.company_id:
        raise HTTPException(404, "user not found")
    if target.id == profile.id and payload.role != "admin":
        raise HTTPException(400, "cannot demote yourself")
    target.role = payload.role
    await db.commit()
    await db.refresh(target)
    return target


@api.post("/auth/team/{user_id}/reset-password", status_code=204)
async def reset_password(
    user_id: str,
    payload: ResetPassword,
    profile: UserProfile = Depends(current_profile),
    db: AsyncSession = Depends(get_db),
):
    require_role(profile, ["admin"])
    target = await db.get(UserProfile, user_id)
    if not target or target.company_id != profile.company_id:
        raise HTTPException(404, "user not found")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.put(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={"password": payload.password},
        )
    if resp.status_code >= 400:
        raise HTTPException(400, f"reset_failed: {resp.text[:120]}")


@api.delete("/auth/team/{user_id}", status_code=204)
async def remove_member(
    user_id: str,
    profile: UserProfile = Depends(current_profile),
    db: AsyncSession = Depends(get_db),
):
    require_role(profile, ["admin"])
    if user_id == profile.id:
        raise HTTPException(400, "cannot remove yourself")
    target = await db.get(UserProfile, user_id)
    if not target or target.company_id != profile.company_id:
        raise HTTPException(404, "user not found")
    async with httpx.AsyncClient(timeout=15) as client:
        await client.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
    await db.delete(target)
    await db.commit()


# ---------- Employees ----------
@api.get("/employees")
async def list_employees(
    search: str = Query(default=""),
    shift: str = Query(default=""),
    profile: UserProfile = Depends(current_profile),
    db: AsyncSession = Depends(get_db),
):
    query = select(Employee).where(Employee.company_id == profile.company_id).order_by(Employee.name)
    if search:
        s = f"%{search}%"
        query = query.where(or_(Employee.name.ilike(s), Employee.role.ilike(s)))
    if shift:
        query = query.where(Employee.shift == shift)
    rows = (await db.execute(query)).scalars().all()
    return [serialize_employee(e, profile.role) for e in rows]


@api.post("/employees", status_code=201)
async def create_employee(payload: EmployeeCreate, profile: UserProfile = Depends(current_profile), db: AsyncSession = Depends(get_db)):
    require_role(profile, ["admin", "leadership", "manager"])
    emp = Employee(**payload.model_dump(), company_id=profile.company_id)
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return serialize_employee(emp, profile.role)


@api.patch("/employees/{employee_id}")
async def update_employee(employee_id: str, payload: EmployeeUpdate, profile: UserProfile = Depends(current_profile), db: AsyncSession = Depends(get_db)):
    require_role(profile, ["admin", "leadership", "manager"])
    emp = await db.get(Employee, employee_id)
    if not emp or emp.company_id != profile.company_id:
        raise HTTPException(404, "Employee not found")
    data = payload.model_dump()
    if not can_see_salary(profile.role):
        data.pop("salary", None)
    for key, value in data.items():
        setattr(emp, key, value)
    await db.commit()
    await db.refresh(emp)
    return serialize_employee(emp, profile.role)


@api.delete("/employees/{employee_id}", status_code=204)
async def delete_employee(employee_id: str, profile: UserProfile = Depends(current_profile), db: AsyncSession = Depends(get_db)):
    require_role(profile, ["admin", "leadership"])
    emp = await db.get(Employee, employee_id)
    if not emp or emp.company_id != profile.company_id:
        raise HTTPException(404, "Employee not found")
    await db.execute(delete(Absence).where(Absence.employee_id == employee_id))
    await db.delete(emp)
    await db.commit()


@api.post("/employees/{employee_id}/absences", status_code=201)
async def add_absence(employee_id: str, payload: AbsenceCreate, profile: UserProfile = Depends(current_profile), db: AsyncSession = Depends(get_db)):
    require_role(profile, ["admin", "leadership", "manager"])
    emp = await db.get(Employee, employee_id)
    if not emp or emp.company_id != profile.company_id:
        raise HTTPException(404, "Employee not found")
    absence = Absence(employee_id=employee_id, **payload.model_dump())
    db.add(absence)
    await db.commit()
    return {"id": absence.id, "employee_id": employee_id, **payload.model_dump()}


# ---------- Reports ----------
@api.get("/reports/tags")
async def report_tags():
    return {"tags": ALLOWED_TAGS, "access_levels": ALLOWED_ACCESS}


@api.get("/reports")
async def list_reports(
    tag: str = Query(default=""),
    profile: UserProfile = Depends(current_profile),
    db: AsyncSession = Depends(get_db),
):
    levels = accessible_report_levels(profile.role)
    query = select(Report).where(Report.company_id == profile.company_id, Report.access.in_(levels)).order_by(Report.report_date.desc(), Report.created_at.desc())
    if tag:
        query = query.where(Report.tag == tag)
    rows = (await db.execute(query)).scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "tag": r.tag,
            "report_date": r.report_date,
            "access": r.access,
            "uploaded_by": r.uploaded_by,
            "storage_path": r.storage_path,
        }
        for r in rows
    ]


@api.post("/reports/upload", status_code=201)
async def upload_report(
    tag: str = Form(...),
    access: str = Form("leadership"),
    file: UploadFile = File(...),
    profile: UserProfile = Depends(current_profile),
    db: AsyncSession = Depends(get_db),
):
    require_role(profile, ["admin", "leadership"])
    if tag not in ALLOWED_TAGS:
        raise HTTPException(400, f"Tag must be one of: {', '.join(ALLOWED_TAGS)}")
    if access not in ALLOWED_ACCESS:
        raise HTTPException(400, f"Access must be one of: {', '.join(ALLOWED_ACCESS)}")
    if not file.filename:
        raise HTTPException(400, "Filename required")
    match = FILENAME_PATTERN.match(file.filename)
    if not match:
        raise HTTPException(400, "Filename must match YYYY-MM-DD_ReportName.pdf (letters, digits, spaces, - or _)")
    report_date = match.group(1)
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(400, "File exceeds 25 MB limit")
    if not content[:4] == b"%PDF":
        raise HTTPException(400, "Only PDF files are accepted")

    from models import uid as _uid

    storage_path = f"{profile.company_id}/{_uid()}_{file.filename}"
    sb = sb_client()
    sb.storage.from_(REPORTS_BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={"content-type": "application/pdf"},
    )
    report = Report(
        company_id=profile.company_id,
        name=file.filename,
        tag=tag,
        report_date=report_date,
        access=access,
        storage_path=storage_path,
        uploaded_by=profile.full_name,
        uploaded_by_id=profile.id,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return {
        "id": report.id,
        "name": report.name,
        "tag": report.tag,
        "report_date": report.report_date,
        "access": report.access,
        "uploaded_by": report.uploaded_by,
        "storage_path": report.storage_path,
    }


@api.get("/reports/{report_id}/download")
async def download_report(report_id: str, profile: UserProfile = Depends(current_profile), db: AsyncSession = Depends(get_db)):
    report = await db.get(Report, report_id)
    if not report or report.company_id != profile.company_id:
        raise HTTPException(404, "Report not found")
    if report.access not in accessible_report_levels(profile.role):
        raise HTTPException(403, "You do not have access to this report")
    sb = sb_client()
    signed = sb.storage.from_(REPORTS_BUCKET).create_signed_url(report.storage_path, 60 * 5)
    return {"url": signed.get("signedURL") or signed.get("signed_url") or signed.get("signedUrl")}


@api.delete("/reports/{report_id}", status_code=204)
async def delete_report(report_id: str, profile: UserProfile = Depends(current_profile), db: AsyncSession = Depends(get_db)):
    require_role(profile, ["admin", "leadership"])
    report = await db.get(Report, report_id)
    if not report or report.company_id != profile.company_id:
        raise HTTPException(404, "Report not found")
    try:
        sb_client().storage.from_(REPORTS_BUCKET).remove([report.storage_path])
    except Exception as exc:
        print(f"[reports] storage remove failed: {exc}")
    await db.delete(report)
    await db.commit()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
