from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    role: str | None = None
    gender: str
    shift: str
    salary: Decimal = Field(ge=0)
    aadhar_last4: str | None = None
    pan_last4: str | None = None
    photo_url: str | None = None


class EmployeeUpdate(EmployeeCreate):
    pass


class EmployeeOut(EmployeeCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str


class AbsenceCreate(BaseModel):
    absence_date: str
    reason: str | None = None


class ReportCreate(BaseModel):
    name: str = Field(min_length=5, max_length=255)
    tag: str = "Report"
    report_date: str
    access: str = "Leadership"
    storage_path: str | None = None


class ReportOut(ReportCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str