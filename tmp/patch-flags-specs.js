const fs = require('fs');

// parse-layer spec: расширить заглушку флагов
let p = 'src/code/code.service.parse-layer.spec.ts';
let ps = fs.readFileSync(p, 'utf8');
ps = ps.replace("{ isPalletShared: () => false, isBoxLabel: () => true } as any, // RuntimeFlagsService",
  "{ isPalletShared: () => false, isBoxLabel: () => true, isValidationEnabled: () => true } as any, // RuntimeFlagsService");
fs.writeFileSync(p, ps, 'utf8');

// runners: та же заглушка
for (const f of ['tmp/run-codes.ts', 'tmp/run-camera-chain.ts', 'tmp/run-layers.ts']) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace("{ isPalletShared: () => false, isBoxLabel: () => true } as any,",
    "{ isPalletShared: () => false, isBoxLabel: () => true, isValidationEnabled: () => true } as any,");
  fs.writeFileSync(f, s, 'utf8');
}

// box-label spec: добавить flags перед globalMonVar
let b = 'src/code/bind/box-label-check.service.spec.ts';
let bs = fs.readFileSync(b, 'utf8');
bs = bs.replace(`    service = new BoxLabelCheckService(
      repository,
      gs1ParserService,
      { tableName: TABLE } as IMonitoringVariables,`,
`    service = new BoxLabelCheckService(
      repository,
      gs1ParserService,
      { isValidationEnabled: () => true } as any,
      { tableName: TABLE } as IMonitoringVariables,`);
fs.writeFileSync(b, bs, 'utf8');
console.log('patched specs and runners');
