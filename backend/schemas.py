from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    slug: str


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    full_name: str
    role: str
    company_id: str


class MeOut(BaseModel):
    profile: ProfileOut
    company: CompanyOut


class RoleChange(BaseModel):
    role: str  # admin|leadership|manager|viewer


class InviteMember(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=100)
    full_name: str = Field(min_length=2, max_length=160)
    role: str  # admin|leadership|manager|viewer


class ResetPassword(BaseModel):
    password: str = Field(min_length=8, max_length=100)


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


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    role: str | None = None
    gender: str
    shift: str
    salary: Decimal | None = None
    aadhar_last4: str | None = None
    pan_last4: str | None = None
    photo_url: str | None = None


class AbsenceCreate(BaseModel):
    absence_date: str
    reason: str | None = None


class ReportCreate(BaseModel):
    name: str = Field(min_length=5, max_length=255)
    tag: str = "Report"
    report_date: str
    access: str = "leadership"


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    tag: str
    report_date: str
    access: str
    uploaded_by: str | None = None
    storage_path: str | None = None
