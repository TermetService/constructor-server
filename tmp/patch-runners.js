const fs = require('fs');
const stub = "      { isPalletShared: () => false, isBoxLabel: () => true } as any,\n";
for (const file of ['tmp/run-codes.ts', 'tmp/run-camera-chain.ts', 'tmp/run-layers.ts']) {
  let s = fs.readFileSync(file, 'utf8');
  // вставляем стаб только в вызов CodeService (перед numberBoxEte)
  s = s.replace(/(\n\s+cameraState,\n)(\s+numberBoxEte,)/, `$1${stub}$2`);
  fs.writeFileSync(file, s, 'utf8');
  console.log(file, 'patched');
}
