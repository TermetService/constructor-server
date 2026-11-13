require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  const keep = new Set(['test-2026_11_11_11_11_41', 'test-2026_11_11_11_11_41_task']);
  const t = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name like 'test-%'`);
  for (const r of t.rows) if (!keep.has(r.table_name)) await c.query(`drop table if exists "${r.table_name}"`);
  const left = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name like 'test-%' order by 1`);
  console.log('осталось:', left.rows.map(x => x.table_name).join(', '));
  console.log('number_box_ete rows:', (await c.query('select count(*)::int c from number_box_ete')).rows[0].c);
  console.log('code_entity rows:', (await c.query('select count(*)::int c from code_entity')).rows[0].c);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
