#!/usr/bin/env node
/**
 * One-shot idempotent DB migration.
 * Adds:
 *   - report_tags table (per-workspace, unique per company_id)
 *   - employees.id_doc_path column
 * Seeds default tags for every existing company (if it has none yet).
 *
 * Run: node scripts/migrate.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "backend", ".env") });
const { Client } = require("pg");

const DEFAULT_TAGS = ["Production", "Safety", "Finance", "HR", "Maintenance", "Quality", "Compliance"];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS report_tags (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(60) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, name)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_report_tags_company_id ON report_tags(company_id);`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS id_doc_path TEXT;`);
    console.log("[+] schema up to date");

    const { rows: companies } = await client.query(`SELECT id, name FROM companies;`);
    for (const c of companies) {
      const { rows: existing } = await client.query(`SELECT COUNT(*)::int AS n FROM report_tags WHERE company_id = $1;`, [c.id]);
      if (existing[0].n > 0) { console.log(`[=] ${c.name} already has ${existing[0].n} tags`); continue; }
      for (const t of DEFAULT_TAGS) {
        await client.query(
          `INSERT INTO report_tags (id, company_id, name) VALUES (gen_random_uuid()::text, $1, $2) ON CONFLICT DO NOTHING;`,
          [c.id, t],
        );
      }
      console.log(`[+] seeded ${DEFAULT_TAGS.length} default tags for ${c.name}`);
    }
  } finally {
    await client.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
