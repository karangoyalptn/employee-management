import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, Numeric, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def uid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(160), index=True)
    role: Mapped[str | None] = mapped_column(String(120), nullable=True)
    gender: Mapped[str] = mapped_column(String(30))
    shift: Mapped[str] = mapped_column(String(30), index=True)
    salary: Mapped[float] = mapped_column(Numeric(12, 2))
    aadhar_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    pan_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Absence(Base):
    __tablename__ = "absences"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    employee_id: Mapped[str] = mapped_column(String(36), index=True)
    absence_date: Mapped[str] = mapped_column(String(10))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(255), index=True)
    tag: Mapped[str] = mapped_column(String(80), default="Report", index=True)
    report_date: Mapped[str] = mapped_column(String(10), index=True)
    access: Mapped[str] = mapped_column(String(120), default="Leadership")
    storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)