const fs = require('fs');
const path = require('path');

const imageDir = path.resolve(__dirname, '..', '160803 画像データ');
const questionsJsonPath = path.resolve(__dirname, '..', 'data', 'questions.json');
if (!fs.existsSync(imageDir)) {
  console.error('Image directory not found:', imageDir);
  process.exit(1);
}
if (!fs.existsSync(questionsJsonPath)) {
  console.error('questions.json not found. Run extract_questions.js first.');
  process.exit(1);
}

const questions = JSON.parse(fs.readFileSync(questionsJsonPath, 'utf-8'));

// Map of questionId => {Q: filename, A: filename}
const map = {};
const files = fs.readdirSync(imageDir).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));

for (const f of files) {
  const m = /^(.*)-(Q|A)\.(png|jpg|jpeg|gif|webp)$/i.exec(f);
  if (!m) continue;
  const id = m[1];
  const type = m[2].toUpperCase();
  if (!map[id]) map[id] = { Q: null, A: null };
  map[id][type] = f;
}

// Validation: which questions missing images
const missingQuestionImage = [];
const missingAnswerImage = [];
for (const q of questions) {
  const entry = map[q.questionId];
  if (!entry || !entry.Q) missingQuestionImage.push(q.questionId);
  if (!entry || !entry.A) missingAnswerImage.push(q.questionId);
}

const report = {
  totalImages: files.length,
  mappedIds: Object.keys(map).length,
  missingQuestionImage,
  missingAnswerImage,
  sample: Object.entries(map).slice(0, 5).map(([id, v]) => ({ id, ...v }))
};

const outDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
fs.writeFileSync(path.join(outDir, 'imageMap.json'), JSON.stringify(map, null, 2), 'utf-8');
fs.writeFileSync(path.join(outDir, 'imageReport.json'), JSON.stringify(report, null, 2), 'utf-8');

console.log('Image mapping complete.');
console.log('Missing question images:', missingQuestionImage.length);
console.log('Missing answer images:', missingAnswerImage.length);
console.log('Report written to data/imageReport.json');
