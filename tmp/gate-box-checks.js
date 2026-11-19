const fs = require('fs');
const file = 'src/code/bind/box-label-check.service.ts';
let s = fs.readFileSync(file, 'utf8');
const pairs = [
  // 1 CodesRecognized
  [`        BoxLabelCheck.CodesRecognized,
        unknownCodes.length === 0,`, `        BoxLabelCheck.CodesRecognized,
        unknownCodes.length === 0 || !enabled(ValidationFlag.BoxCodesRecognized),`],
  [`    if (unknownCodes.length) {`, `    if (enabled(ValidationFlag.BoxCodesRecognized) && unknownCodes.length) {`],
  // 2 HasProductCodes
  [`        BoxLabelCheck.HasProductCodes,
        productCodes.length >= 1,`, `        BoxLabelCheck.HasProductCodes,
        productCodes.length >= 1 || !enabled(ValidationFlag.BoxHasProductCodes),`],
  [`    if (productCodes.length < 1) {`, `    if (enabled(ValidationFlag.BoxHasProductCodes) && productCodes.length < 1) {`],
  // 3 SingleBoxLabel
  [`        BoxLabelCheck.SingleBoxLabel,
        boxCodes.length === 1,`, `        BoxLabelCheck.SingleBoxLabel,
        boxCodes.length === 1 || !enabled(ValidationFlag.BoxSingleLabel),`],
  [`    if (boxCodes.length !== 1) {`, `    if (enabled(ValidationFlag.BoxSingleLabel) && boxCodes.length !== 1) {`],
  // 4 BoxLabelValid
  [`        isDevelop || boxCodes[0].isValid !== false,`, `        isDevelop || boxCodes[0].isValid !== false || !enabled(ValidationFlag.BoxLabelValid),`],
  [`    if (!isDevelop && boxCodes[0].isValid === false) {`, `    if (enabled(ValidationFlag.BoxLabelValid) && !isDevelop && boxCodes[0].isValid === false) {`],
  // 5 TableExists
  [`        BoxLabelCheck.TableExists,
        tableExists,`, `        BoxLabelCheck.TableExists,
        tableExists || !enabled(ValidationFlag.BoxTableExists),`],
  [`    if (!tableExists) {`, `    if (enabled(ValidationFlag.BoxTableExists) && !tableExists) {`],
  // 6 LabelNotUsed
  [`        BoxLabelCheck.LabelNotUsed,
        !labelUsed,`, `        BoxLabelCheck.LabelNotUsed,
        !labelUsed || !enabled(ValidationFlag.BoxLabelNotUsed),`],
  [`    if (labelUsed) {`, `    if (enabled(ValidationFlag.BoxLabelNotUsed) && labelUsed) {`],
  // 7 ProductsExist
  [`        BoxLabelCheck.ProductsExist,
        missingCodes.length === 0,`, `        BoxLabelCheck.ProductsExist,
        missingCodes.length === 0 || !enabled(ValidationFlag.BoxProductsExist),`],
  [`    if (missingCodes.length) {`, `    if (enabled(ValidationFlag.BoxProductsExist) && missingCodes.length) {`],
  // 8 SameBox
  [`        BoxLabelCheck.SameBox,
        boxNumbers.length === 1,`, `        BoxLabelCheck.SameBox,
        boxNumbers.length === 1 || !enabled(ValidationFlag.BoxSameBox),`],
  [`    if (boxNumbers.length !== 1) {`, `    if (enabled(ValidationFlag.BoxSameBox) && boxNumbers.length !== 1) {`],
  // 9 BoxNumberDefined
  [`        BoxLabelCheck.BoxNumberDefined,
        boxNumberDefined,`, `        BoxLabelCheck.BoxNumberDefined,
        boxNumberDefined || !enabled(ValidationFlag.BoxNumberDefined),`],
  [`    if (!boxNumberDefined) {`, `    if (enabled(ValidationFlag.BoxNumberDefined) && !boxNumberDefined) {`],
  // 10 LabelNotForBox
  [`        BoxLabelCheck.LabelNotForBox,
        labelForBox.length === 0,`, `        BoxLabelCheck.LabelNotForBox,
        labelForBox.length === 0 || !enabled(ValidationFlag.BoxLabelNotForBox),`],
  [`    if (labelForBox.length > 0) {`, `    if (enabled(ValidationFlag.BoxLabelNotForBox) && labelForBox.length > 0) {`],
];
for (const [from, to] of pairs) {
  if (!s.includes(from)) { console.log('NOT FOUND:', from.split('\n')[0]); continue; }
  s = s.split(from).join(to);
}
fs.writeFileSync(file, s, 'utf8');
console.log('done');
