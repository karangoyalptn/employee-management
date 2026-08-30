#!/usr/bin/env node
/**
 * CLI to provision a new factory workspace + its first admin.
 *
 * Usage:
 *   node scripts/seed_factory.js \
 *     --company "Factory A Industries" \
 *     --slug factory-a-name \
 *     --admin-email admin@factory-a.com \
 *     --admin-password "StrongTempPass123!" \
 *     --admin-name "Karan Goyal"
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "backend", ".env") });
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i].replace(/^--/, "").replace(/-/g, "_");
  args[k] = process.argv[i + 1];
}
const required = ["company", "admin_email", "admin_password", "admin_name"];
for (const r of required) {
  if (!args[r]) { console.error(`missing --${r.replace(/_/g, "-")}`); process.exit(1); }
}

const slugify = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "company";
const slug = args.slug || slugify(args.company);
if (!/^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$/.test(slug)) {
  console.error(`invalid slug '${slug}' — use lowercase letters, digits and hyphens (3-62 chars)`);
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  // upsert company
  let { data: company } = await sb.from("companies").select("*").eq("slug", slug).maybeSingle();
  if (company) {
    console.log(`[=] company already exists: ${company.name} (${company.slug})`);
  } else {
    const row = { id: crypto.randomUUID(), name: args.company.trim(), slug, created_at: new Date().toISOString() };
    const { data, error } = await sb.from("companies").insert(row).select().single();
    if (error) { console.error(error); process.exit(1); }
    company = data;
    console.log(`[+] created company ${company.name} (${company.slug})`);
  }

  // upsert supabase user
  let userId;
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email: args.admin_email, password: args.admin_password, email_confirm: true,
  });
  if (cErr) {
    if (/already/i.test(cErr.message)) {
      const { data: list } = await sb.auth.admin.listUsers();
      const found = list?.users?.find((u) => u.email === args.admin_email);
      if (!found) { console.error("user exists but not found via listUsers"); process.exit(1); }
      userId = found.id;
      console.log(`[=] supabase user exists: ${userId}`);
    } else { console.error(cErr); process.exit(1); }
  } else {
    userId = created.user.id;
    console.log(`[+] supabase admin user id: ${userId}`);
  }

  // upsert profile
  const { data: existing } = await sb.from("user_profiles").select("*").eq("id", userId).maybeSingle();
  if (existing) {
    if (existing.company_id !== company.id) {
      console.error(`[!] user already assigned to a different company (${existing.company_id})`);
      process.exit(1);
    }
    await sb.from("user_profiles").update({ role: "admin", full_name: args.admin_name.trim() }).eq("id", userId);
    console.log(`[=] existing profile promoted to admin: ${existing.email}`);
  } else {
    const row = {
      id: userId, email: args.admin_email, full_name: args.admin_name.trim(),
      role: "admin", company_id: company.id, created_at: new Date().toISOString(),
    };
    const { error } = await sb.from("user_profiles").insert(row);
    if (error) { console.error(error); process.exit(1); }
    console.log(`[+] created admin profile: ${args.admin_email}`);
  }

  console.log(`\nDone.`);
  console.log(`  Workspace URL (later): https://${slug}.manage.zreports.com`);
  console.log(`  Preview fallback:      ?w=${slug}`);
  console.log(`  Login:                 ${args.admin_email}`);
})().catch((e) => { console.error(e); process.exit(1); });
