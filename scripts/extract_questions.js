const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

const excelPath = path.resolve(__dirname, '..', '160803 質問入力シート（完成版2）企業問題追加＆ランダム配置.xlsx');
if (!fs.existsSync(excelPath)) {
  console.error('Excel file not found:', excelPath);
  process.exit(1);
}

function loadWorkbook() {
  return xlsx.readFile(excelPath, { cellDates: true });
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h >>> 0; // unsigned
}

function normalizeNewlines(text) {
  if (text == null) return null;
  return String(text).replace(/\r\n?/g, '\n').trim();
}

function nullIfEmpty(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function deriveQuestionId(imageName) {
  if (!imageName) return null;
  const m = /^(.*)-(Q|A)\.(png|jpg|jpeg|gif|webp)$/i.exec(imageName.trim());
  if (!m) return null;
  return m[1];
}

function buildSets(ws) {
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null });
  return rows.map(r => {
    return {
      docId: `${r.classno}-${r.gset}`,
      gid: r.gid,
      classNo: r.classno,
      setNo: r.gset,
      setName: nullIfEmpty(r.setname),
      createdAt: r.createdate instanceof Date ? r.createdate.toISOString() : null
    };
  });
}

function buildQuestions(ws) {
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null });
  return rows.map(r => {
    const questionId = deriveQuestionId(r.image) || `${r.classno}-${r.gset}-${r.id}`;
    const choices = [r.choice1, r.choice2, r.choice3, r.choice4].map(c => nullIfEmpty(c));
    const filteredChoices = choices.filter(c => c != null);
    const answerIndex = typeof r.answer === 'number' ? r.answer - 1 : null;
    const isCorporate = !!nullIfEmpty(r['会社名']);
    const linkHtml = nullIfEmpty(r['リンクURL']);
    let linkPlain = null;
    if (linkHtml) {
      const m = /href="([^"]+)"/i.exec(linkHtml);
      if (m) linkPlain = m[1];
    }
    const questionText = normalizeNewlines(r.question);
    const explanationText = normalizeNewlines(r.questionexplain);
    const companyName = nullIfEmpty(r['会社名']);
    const bannerUrlRaw = nullIfEmpty(r['バナーURL']);
    const remarks = nullIfEmpty(r['備考']);
    const author = nullIfEmpty(r['作成者']);

    return {
      questionId,
      internalRowId: r.id,
      gid: r.gid,
      classNo: r.classno,
      setNo: r.gset,
      category: nullIfEmpty(r.title),
      questionText,
      choices: filteredChoices,
      answerIndex,
      point: r.point,
      explanationText,
      item: r.item,
      companyName,
      linkHtml,
      linkPlain,
      bannerUrlRaw,
      remarks,
      author,
      assets: {
        questionImageFile: nullIfEmpty(r.image),
        answerImageFile: nullIfEmpty(r.explainimage)
      },
      randomSeed: hash(questionId) % 1000000,
      isCorporate,
      updatedAt: new Date().toISOString()
    };
  });
}

function main() {
  const wb = loadWorkbook();
  const setSheet = wb.Sheets['question_master.csv'];
  const detailSheet = wb.Sheets['question_detail.csv'];
  if (!setSheet || !detailSheet) {
    console.error('Expected sheets question_master.csv and question_detail.csv not found');
    process.exit(1);
  }
  const questionSets = buildSets(setSheet);
  const questions = buildQuestions(detailSheet);

  // Output directory
  const outDir = path.resolve(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  fs.writeFileSync(path.join(outDir, 'questionSets.json'), JSON.stringify(questionSets, null, 2), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'questions.json'), JSON.stringify(questions, null, 2), 'utf-8');

  console.log('Sets:', questionSets.length, 'Questions:', questions.length);
  console.log('Sample question:', questions[0]);
  console.log('Output written to data/questionSets.json & data/questions.json');
}

main();
