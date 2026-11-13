require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  await c.query('drop table if exists "test-2026_11_11_09_48_07", "test-2026_11_11_09_48_07_task"');
  const r = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name like 'test-%' order by 1`);
  console.log(r.rows.map(x => x.table_name).join('\n'));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
