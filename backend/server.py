import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Absence, Employee, Report
from schemas import AbsenceCreate, EmployeeCreate, EmployeeOut, EmployeeUpdate, ReportCreate, ReportOut

load_dotenv(Path(__file__).parent / ".env")
app = FastAPI(title="ApexForge Factory OS API")
api = APIRouter(prefix="/api")


async def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "A valid Supabase session is required")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(f"{os.environ['SUPABASE_URL']}/auth/v1/user", headers={"apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": authorization})
    if response.status_code != 200:
        raise HTTPException(401, "Supabase session is invalid or expired")
    return response.json()


@api.get("/health")
async def health():
    return {"status": "ok", "service": "apexforge"}


@api.get("/employees", response_model=list[EmployeeOut])
async def list_employees(search: str = Query(default=""), shift: str = Query(default=""), db: AsyncSession = Depends(get_db), _: dict = Depends(current_user)):
    query = select(Employee).order_by(Employee.name)
    if search:
        query = query.where(or_(Employee.name.ilike(f"%{search}%"), Employee.role.ilike(f"%{search}%")))
    if shift:
        query = query.where(Employee.shift == shift)
    return list((await db.execute(query)).scalars().all())


@api.post("/employees", response_model=EmployeeOut, status_code=201)
async def create_employee(payload: EmployeeCreate, db: AsyncSession = Depends(get_db), _: dict = Depends(current_user)):
    employee = Employee(**payload.model_dump())
    db.add(employee)
    await db.commit()
    await db.refresh(employee)
    return employee


@api.patch("/employees/{employee_id}", response_model=EmployeeOut)
async def update_employee(employee_id: str, payload: EmployeeUpdate, db: AsyncSession = Depends(get_db), _: dict = Depends(current_user)):
    employee = await db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(404, "Employee not found")
    for key, value in payload.model_dump().items():
        setattr(employee, key, value)
    await db.commit()
    await db.refresh(employee)
    return employee


@api.delete("/employees/{employee_id}", status_code=204)
async def delete_employee(employee_id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(current_user)):
    await db.execute(delete(Absence).where(Absence.employee_id == employee_id))
    employee = await db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(404, "Employee not found")
    await db.delete(employee)
    await db.commit()


@api.post("/employees/{employee_id}/absences", status_code=201)
async def add_absence(employee_id: str, payload: AbsenceCreate, db: AsyncSession = Depends(get_db), _: dict = Depends(current_user)):
    if not await db.get(Employee, employee_id):
        raise HTTPException(404, "Employee not found")
    absence = Absence(employee_id=employee_id, **payload.model_dump())
    db.add(absence)
    await db.commit()
    return {"id": absence.id, "employee_id": employee_id, **payload.model_dump()}


@api.get("/reports", response_model=list[ReportOut])
async def list_reports(tag: str = Query(default=""), db: AsyncSession = Depends(get_db), _: dict = Depends(current_user)):
    query = select(Report).order_by(Report.report_date.desc())
    if tag:
        query = query.where(Report.tag == tag)
    return list((await db.execute(query)).scalars().all())


@api.post("/reports", response_model=ReportOut, status_code=201)
async def create_report(payload: ReportCreate, db: AsyncSession = Depends(get_db), user: dict = Depends(current_user)):
    report = Report(**payload.model_dump(), uploaded_by=user.get("email"))
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])