const fs = require('fs');
const { Client } = require('pg');
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
(async () => {
  const c = new Client({ host: cfg.DB_HOST, port: +cfg.DB_PORT, user: cfg.DB_USERNAME, password: cfg.DB_PASSWORD, database: cfg.DB_DATABASE });
  await c.connect();
  const map = {
    'Агрегация': 'aggregation',
    'Привязка коробки': 'box_binding',
    'Добавление в паллету': 'pallet_adding',
    'Сериализация': 'serialization',
  };
  for (const [ru, en] of Object.entries(map)) {
    const r = await c.query('UPDATE camera_config SET type = $1 WHERE type = $2', [en, ru]);
    if (r.rowCount) console.log(`${ru} -> ${en}: ${r.rowCount}`);
  }
  const rows = await c.query('SELECT id, name, type FROM camera_config ORDER BY id');
  console.table(rows.rows);
  await c.end();
})();
