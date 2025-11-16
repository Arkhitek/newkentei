const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

const excelPath = path.resolve(__dirname, '..', '160803 質問入力シート（完成版2）企業問題追加＆ランダム配置.xlsx');
if (!fs.existsSync(excelPath)) {
  console.error('Excel file not found:', excelPath);
  process.exit(1);
}

const wb = xlsx.readFile(excelPath, { cellDates: true });
const sheets = wb.SheetNames;
console.log('--- Excel Sheet Summary ---');
console.log('Total sheets:', sheets.length);

function sheetPreview(sheetName) {
  const ws = wb.Sheets[sheetName];
  const json = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  const headerRow = json[0] || [];
  // Find first 5 data rows (skip empty)
  const dataRows = json.slice(1).filter(r => r.some(c => c !== null && c !== '')) .slice(0, 5);
  return { headerRow, dataSample: dataRows };
}

const result = {};
for (const sheet of sheets) {
  const preview = sheetPreview(sheet);
  result[sheet] = preview;
}

console.log(JSON.stringify(result, null, 2));

// Derive tentative schema fields from headers
const allHeaders = new Set();
for (const sheet of sheets) {
  const { headerRow } = result[sheet];
  headerRow.forEach(h => { if (h && typeof h === 'string') allHeaders.add(h.trim()); });
}

console.log('\n--- Aggregated Headers ---');
console.log(Array.from(allHeaders));

console.log('\nSuggestion: Map headers to Firestore fields in a follow-up step.');
