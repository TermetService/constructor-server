require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  const r = await c.query('select count(*)::int c from number_box_ete');
  console.log('number_box_ete rows:', r.rows[0].c);
  const rows = await c.query('select * from number_box_ete order by id desc limit 5');
  console.table(rows.rows);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
