require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  const t = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name like 'test-%' order by 1`);
  const extra = t.rows.map(r => r.table_name).filter(n => n !== 'test-2026_11_11_09_46_31' && n !== 'test-2026_11_11_09_46_31_task');
  for (const n of extra) await c.query(`drop table if exists "${n}"`);
  await c.query(`delete from number_box_ete where gtin = '04810272003892'`);
  console.log('удалены тестовые таблицы:', extra.join(', ') || '(нет)');
  const left = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name like 'test-%' order by 1`);
  console.log('осталось:', left.rows.map(r => r.table_name).join(', '));
  const ete = await c.query('select count(*)::int c from number_box_ete');
  console.log('number_box_ete rows:', ete.rows[0].c);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
