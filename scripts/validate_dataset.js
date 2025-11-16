const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const qPath = path.join(root,'data','questions.json');
const mapPath = path.join(root,'data','imageMap.json');
if(!fs.existsSync(qPath) || !fs.existsSync(mapPath)) { console.error('Required files missing'); process.exit(1); }
const questions = JSON.parse(fs.readFileSync(qPath,'utf-8'));
const imageMap = JSON.parse(fs.readFileSync(mapPath,'utf-8'));

const duplicates = new Set();
const seen = new Set();
for(const q of questions){
  if(seen.has(q.questionId)) duplicates.add(q.questionId); else seen.add(q.questionId);
}

const missingQImage = [];
const missingAImage = [];
for(const q of questions){
  const entry = imageMap[q.questionId];
  if(!entry || !entry.Q) missingQImage.push(q.questionId);
  if(!entry || !entry.A) missingAImage.push(q.questionId);
}

const report = {
  totalQuestions: questions.length,
  duplicateCount: duplicates.size,
  duplicates: Array.from(duplicates),
  missingQuestionImages: missingQImage.length,
  missingAnswerImages: missingAImage.length,
  sampleMissing: missingQImage.slice(0,10)
};

const outDir = path.join(root,'data');
fs.writeFileSync(path.join(outDir,'validationReport.json'), JSON.stringify(report,null,2),'utf-8');
console.log('Validation complete:', report);
