require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  const t = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name like 'test-%' order by 1`);
  console.log(t.rows.map(x => x.table_name).join('\n') || '(нет)');
  console.log('code_entity:', (await c.query('select count(*)::int c from code_entity')).rows[0].c);
  console.log('number_box_ete:', (await c.query('select count(*)::int c from number_box_ete')).rows[0].c);
  await c.end();
})();
