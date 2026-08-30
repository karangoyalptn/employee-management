"""
CLI to provision a new factory workspace + its first admin.

Usage:
    python scripts/seed_factory.py \
        --company "Factory A Industries" \
        --slug "factory-a-name" \
        --admin-email admin@factory-a.com \
        --admin-password "StrongTempPass123!" \
        --admin-name "Karan Goyal"

- Company slug must match the future subdomain (factory-a-name.manage.zreports.com).
- Admin is created in Supabase with email_confirm=True (no verification email sent).
- Safe to re-run: existing company or admin user is reused.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")

from database import SessionLocal  # noqa: E402
from models import Company, UserProfile, uid, utcnow  # noqa: E402


SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "company"


async def upsert_supabase_user(email: str, password: str) -> str:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15) as client:
        # try create first
        resp = await client.post(
            f"{url}/auth/v1/admin/users",
            headers=headers,
            json={"email": email, "password": password, "email_confirm": True},
        )
        if resp.status_code == 200:
            return resp.json()["id"]
        # if already exists, look up
        if resp.status_code in (400, 422) and "already" in resp.text.lower():
            list_resp = await client.get(
                f"{url}/auth/v1/admin/users",
                headers=headers,
                params={"email": email},
            )
            list_resp.raise_for_status()
            for u in list_resp.json().get("users", []):
                if u.get("email") == email:
                    return u["id"]
        raise RuntimeError(f"supabase_create_failed: {resp.status_code} {resp.text}")


async def main(args: argparse.Namespace) -> None:
    slug = args.slug or slugify(args.company)
    if not SLUG_RE.match(slug):
        raise SystemExit(f"invalid slug '{slug}' - use lowercase letters, digits and hyphens (3-62 chars)")

    async with SessionLocal() as db:
        existing = (await db.execute(select(Company).where(Company.slug == slug))).scalar_one_or_none()
        if existing:
            company = existing
            print(f"[=] company already exists: {company.name} ({company.slug})")
        else:
            company = Company(id=uid(), name=args.company.strip(), slug=slug, created_at=utcnow())
            db.add(company)
            await db.flush()
            print(f"[+] created company {company.name} ({company.slug})")

        user_id = await upsert_supabase_user(args.admin_email, args.admin_password)
        print(f"[+] supabase admin user id: {user_id}")

        profile = await db.get(UserProfile, user_id)
        if profile:
            if profile.company_id != company.id:
                raise SystemExit(f"[!] user already assigned to a different company ({profile.company_id})")
            profile.role = "admin"
            profile.full_name = args.admin_name.strip()
            print(f"[=] existing profile promoted to admin: {profile.email}")
        else:
            profile = UserProfile(
                id=user_id,
                email=args.admin_email,
                full_name=args.admin_name.strip(),
                role="admin",
                company_id=company.id,
                created_at=utcnow(),
            )
            db.add(profile)
            print(f"[+] created admin profile: {args.admin_email}")

        await db.commit()

    print("\nDone.")
    print(f"  Workspace URL (later): https://{slug}.manage.zreports.com")
    print(f"  Preview fallback:      ?w={slug}")
    print(f"  Login:                 {args.admin_email}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Provision a factory workspace and its first admin.")
    p.add_argument("--company", required=True, help="Display name, e.g. 'Factory A Industries'")
    p.add_argument("--slug", help="Subdomain slug (auto from company if omitted)")
    p.add_argument("--admin-email", required=True)
    p.add_argument("--admin-password", required=True)
    p.add_argument("--admin-name", required=True, help="Admin full name")
    asyncio.run(main(p.parse_args()))
