const fs = require('fs');
const GTIN = '04810272003892';
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const raw = fs.readFileSync('tmp/codes-raw.txt', 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const uniq = [...new Set(raw)];

const rnd = (n) => Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
while (uniq.length < 214) {
  const code = `01${GTIN}21${rnd(6)}91FFD0` + `92${rnd(43)}=`;
  if (!uniq.includes(code)) uniq.push(code);
}
const unique = uniq.slice(0, 214);

const dupSources = [3, 25, 60, 95, 130, 170];
const dupPositions = [12, 60, 110, 160, 200, 215];

const out = [];
let u = 0, d = 0;
for (let i = 0; i < 220; i++) {
  if (d < dupPositions.length && i === dupPositions[d]) { out.push(unique[dupSources[d]]); d++; }
  else out.push(unique[u++]);
}

fs.writeFileSync('tmp/codes-220.txt', out.join('\n'), 'utf8');
console.log('строк:', out.length, 'уникальных:', new Set(out).size, 'дублей:', out.length - new Set(out).size);
console.log('позиции дублей (1-based):', dupPositions.map(p => p + 1).join(', '));
console.log('длины:', [...new Set(out.map(c => c.length))].join(', '));
