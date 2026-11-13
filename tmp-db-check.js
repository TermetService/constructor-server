require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, connectionTimeoutMillis: 5000,
  });
  try {
    await c.connect();
    console.log('CONNECTED', process.env.DB_HOST + ':' + process.env.DB_PORT, process.env.DB_DATABASE);
    const r = await c.query(`select table_name from information_schema.tables where table_schema='public' order by table_name`);
    console.log('TABLES(' + r.rowCount + '):');
    console.log(r.rows.map(x => x.table_name).join('\n'));
    const ce = await c.query(`select count(*)::int c from code_entity`).catch(e => ({ rows: [{ c: 'ERR ' + e.message }] }));
    console.log('code_entity rows:', ce.rows[0].c);
  } catch (e) {
    console.log('CONNECT FAILED:', e.message);
  } finally { await c.end().catch(() => {}); }
})();
