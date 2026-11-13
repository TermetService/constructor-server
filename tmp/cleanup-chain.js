require("dotenv").config();
const fs = require("fs");
const { Client } = require("pg");
const GTIN = "04810272003892";
function normalize(raw) {
  const clean = raw.replace(/\s+/g, "");
  if (clean.includes("\x1D")) return clean;
  const head = clean.slice(0, 24), mid = clean.slice(24, 30), rest = clean.slice(30);
  if (mid !== "91FFD0" || !rest.startsWith("92")) return null;
  return `${head}\x1D${mid}\x1D${rest}`;
}
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  const codes = fs.readFileSync("tmp/codes-raw.txt", "utf8").split(/\r?\n/).map(l => normalize(l.trim())).filter(Boolean).slice(0, 20);
  const tables = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name like 'camera-chain-%'`);
  for (const row of tables.rows) {
    await c.query(`DROP TABLE IF EXISTS "${row.table_name}" CASCADE`);
    console.log("dropped", row.table_name);
  }
  const del = await c.query(`DELETE FROM code_entity WHERE code = ANY($1::text[])`, [codes]);
  const ete = await c.query(`DELETE FROM number_box_ete WHERE gtin = $1`, [GTIN]);
  console.log(`удалено кодов: ${del.rowCount}, ETE-строк: ${ete.rowCount}, таблиц: ${tables.rowCount}`);
  await c.end();
})();
