/* One-off: apply a SQL migration against the Supabase Postgres
 * instance using a direct connection. The connection string
 * comes from the SUPABASE_DB_URL env var (or is built from the
 * service_role key in .env.local).
 *
 * Usage: node scripts/apply-migration.js supabase/migrations/xxx.sql
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Usage: node scripts/apply-migration.js <path-to-sql>');
  process.exit(2);
}

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const ref = 'lewowwpsuxgbhaiwrbfl';
const password = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!password) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(2);
}

const region = process.env.SUPABASE_REGION || 'us-east-1';
const usePooler = process.env.SUPABASE_USE_POOLER !== '0';

const c = new Client(
  usePooler
    ? {
        host: `aws-0-${region}.pooler.supabase.com`,
        port: 6543,
        database: 'postgres',
        user: `postgres.${ref}`,
        password,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: `db.${ref}.supabase.co`,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password,
        ssl: { rejectUnauthorized: false },
      },
);

(async () => {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await c.connect();
  try {
    await c.query(sql);
    console.log('OK applied:', sqlPath);
  } catch (e) {
    console.error('ERR:', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
