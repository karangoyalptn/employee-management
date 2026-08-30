"""create factory workforce and report tables"""
from alembic import op
import sqlalchemy as sa

revision = "20240603_factory_foundation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("employees", sa.Column("id", sa.String(36), primary_key=True), sa.Column("name", sa.String(160), nullable=False), sa.Column("role", sa.String(120)), sa.Column("gender", sa.String(30), nullable=False), sa.Column("shift", sa.String(30), nullable=False), sa.Column("salary", sa.Numeric(12, 2), nullable=False), sa.Column("aadhar_last4", sa.String(4)), sa.Column("pan_last4", sa.String(4)), sa.Column("photo_url", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_employees_name", "employees", ["name"])
    op.create_index("ix_employees_shift", "employees", ["shift"])
    op.create_table("absences", sa.Column("id", sa.String(36), primary_key=True), sa.Column("employee_id", sa.String(36), nullable=False), sa.Column("absence_date", sa.String(10), nullable=False), sa.Column("reason", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_absences_employee_id", "absences", ["employee_id"])
    op.create_table("reports", sa.Column("id", sa.String(36), primary_key=True), sa.Column("name", sa.String(255), nullable=False), sa.Column("tag", sa.String(80), nullable=False), sa.Column("report_date", sa.String(10), nullable=False), sa.Column("access", sa.String(120), nullable=False), sa.Column("storage_path", sa.Text()), sa.Column("uploaded_by", sa.String(160)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_reports_name", "reports", ["name"])
    op.create_index("ix_reports_tag", "reports", ["tag"])
    op.create_index("ix_reports_report_date", "reports", ["report_date"])


def downgrade():
    op.drop_table("reports")
    op.drop_table("absences")
    op.drop_table("employees")