require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  await c.query(`delete from number_box_ete where gtin='04810272003892'`);
  console.log('ETE row deleted, count =', (await c.query('select count(*)::int c from number_box_ete')).rows[0].c);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
