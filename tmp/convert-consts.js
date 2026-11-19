const fs = require('fs');
function edit(file, fn) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  s = fn(s);
  if (s !== before) { fs.writeFileSync(file, s, 'utf8'); console.log('edited', file); }
}

edit('src/monitoring/monitoring.service.ts', (s) => {
  s = s.replace(/const isPrint = config\.IS_PRINT === 'true';\r?\n/, '');
  s = s.replace(/const isPrintZero = config\.IS_PRINT_ZERO === 'true';\r?\n/, '');
  s = s.replace(/const isDeleteTask = config\.IS_DELETE_TASK === 'true';\r?\n/, '');
  s = s.replace(/const reportType = config\.REPORT_TYPE;\r?\n/, '');
  s = s.replace(/const isFTP = config\.IS_FTP === 'true';\r?\n/, '');
  s = s.replace(/\bisPrintZero\b/g, "(config.IS_PRINT_ZERO === 'true')");
  s = s.replace(/\breportType\b/g, 'config.REPORT_TYPE');
  s = s.replace(/\bisFTP\b/g, "(config.IS_FTP === 'true')");
  s = s.replace(/\bisDeleteTask\b/g, "(config.IS_DELETE_TASK === 'true')");
  return s;
});

edit('src/printers/printer.utils.ts', (s) => {
  s = s.replace(/const printer1DecodeType = config\.PRINTER1_DECODE_TYPE \|\| '';\r?\n/, '');
  s = s.replace(/const printer1EncodeType = config\.PRINTER1_ENCODE_TYPE \|\| '';\r?\n/, '');
  s = s.replace(/const printer2DecodeType = config\.PRINTER2_DECODE_TYPE \|\| '';\r?\n/, '');
  s = s.replace(/const printer2EncodeType = config\.PRINTER2_ENCODE_TYPE \|\| '';\r?\n/, '');
  s = s.replace(/const PCName = config\.PC_NAME \|\| '';\r?\n/, '');
  s = s.replace(/\bprinter1DecodeType\b/g, "(config.PRINTER1_DECODE_TYPE || '')");
  s = s.replace(/\bprinter1EncodeType\b/g, "(config.PRINTER1_ENCODE_TYPE || '')");
  s = s.replace(/\bprinter2DecodeType\b/g, "(config.PRINTER2_DECODE_TYPE || '')");
  s = s.replace(/\bprinter2EncodeType\b/g, "(config.PRINTER2_ENCODE_TYPE || '')");
  s = s.replace(/\bPCName\b/g, "(config.PC_NAME || '')");
  return s;
});

edit('src/path.util.ts', (s) => s.replace(/\.env file/g, 'config.json'));
edit('src/code/helpers/code-remote.service.ts', (s) => s.replace(/в \.env —/g, 'в config.json —'));
