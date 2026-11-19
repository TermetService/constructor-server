const fs = require('fs');
const { Client } = require('pg');
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
(async () => {
  const c = new Client({ host: cfg.DB_HOST, port: +cfg.DB_PORT, user: cfg.DB_USERNAME, password: cfg.DB_PASSWORD, database: cfg.DB_DATABASE });
  await c.connect();
  const tables = await c.query(`select table_name from information_schema.tables where table_schema='public' and (table_name like '%config%' or table_name like '%camera%' or table_name like '%printer%' or table_name like '%modbus%') order by 1`);
  console.log('таблицы:', tables.rows.map(r => r.table_name));
  for (const t of tables.rows.map(r => r.table_name)) {
    try {
      const rows = await c.query(`select * from "${t}" limit 10`);
      console.log(`\n== ${t} (${rows.rowCount}) ==`);
      console.table(rows.rows);
    } catch (e) { console.log(t, 'ERR', e.message); }
  }
  await c.end();
})();
