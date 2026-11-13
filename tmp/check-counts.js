require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  const t = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name like 'test-%' and table_name not like '%_task' order by 1 desc limit 1`);
  if (!t.rowCount) { console.log('тестовых таблиц нет'); await c.end(); return; }
  const T = t.rows[0].table_name;
  const r = await c.query(`select count(*)::int all_products,
     count(distinct box_number)::int boxes,
     count(distinct pallet_number)::int pallets,
     max(box_number) last_box, max(pallet_number) last_pallet,
     count(*) filter (where pallet_number is null)::int null_pallets
     from "${T}"`);
  console.log('таблица:', T);
  console.table(r.rows);
  await c.end();
})();
