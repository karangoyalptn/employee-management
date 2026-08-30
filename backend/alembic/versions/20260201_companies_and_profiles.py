"""add companies, user profiles, and multi-tenant scoping"""
from alembic import op
import sqlalchemy as sa

revision = "20260201_companies_and_profiles"
down_revision = "20240603_factory_foundation"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "companies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False, unique=True),
        sa.Column("slug", sa.String(160), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_companies_slug", "companies", ["slug"], unique=True)

    op.create_table(
        "user_profiles",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_profiles_company_id", "user_profiles", ["company_id"])

    op.add_column("employees", sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=True))
    op.create_index("ix_employees_company_id", "employees", ["company_id"])

    op.add_column("reports", sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=True))
    op.add_column("reports", sa.Column("uploaded_by_id", sa.String(64), nullable=True))
    op.create_index("ix_reports_company_id", "reports", ["company_id"])


def downgrade():
    op.drop_index("ix_reports_company_id", table_name="reports")
    op.drop_column("reports", "uploaded_by_id")
    op.drop_column("reports", "company_id")
    op.drop_index("ix_employees_company_id", table_name="employees")
    op.drop_column("employees", "company_id")
    op.drop_index("ix_user_profiles_company_id", table_name="user_profiles")
    op.drop_table("user_profiles")
    op.drop_index("ix_companies_slug", table_name="companies")
    op.drop_table("companies")
