const fs = require('fs');
function fix(file, patterns) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  for (const [re, rep] of patterns) s = s.replace(re, rep);
  if (s !== before) { fs.writeFileSync(file, s, 'utf8'); console.log('fixed', file); }
}
fix('src/files1s/files1s.service.ts', [[/import \{ Logger \} from 'winston';[^\r\n]*const interval[^\r\n]*\r?\n/, "import { Logger } from 'winston';\n"]]);
fix('src/code/code-search.service.ts', [[/import \{ Gs1ParserService \} from 'src\/gs1-parser\/gs1-parser\.service';[^\r\n]*\r?\nconst isPrint[^\r\n]*\r?\n/, "import { Gs1ParserService } from 'src/gs1-parser/gs1-parser.service';\n"]]);
