require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  for (const q of [
    `select count(*)::int c from code_entity`,
    `select count(*)::int c from code_entity where code like '0104810272003892%'`,
    `select count(*)::int c from code_entity where position(chr(29) in code) > 0`,
    `select code, count(*)::int c from code_entity group by code having count(*) > 1 limit 5`,
    `select count(*)::int c from "test-2026_11_11_09_46_31"`,
    `select count(*)::int c from "test-2026_11_11_09_46_31" t join code_entity e using (code)`,
  ]) { const r = await c.query(q); console.log(q.slice(0,70), '=>', JSON.stringify(r.rows)); }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
