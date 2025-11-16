/*
 * Firestore & Storage import script.
 * Usage:
 *   node scripts/import_to_firestore.js --project=<projectId> [--limit=100] [--dry-run]
 * Credentials:
 *   - Place serviceAccountKey.json at project root OR set GOOGLE_APPLICATION_CREDENTIALS env var.
 */
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const admin = require('firebase-admin');

program
  .option('--project <projectId>', 'Firebase project ID')
  .option('--limit <n>', 'Limit number of questions imported', v => parseInt(v, 10))
  .option('--dry-run', 'Do not write to Firestore/Storage, only simulate')
  .parse(process.argv);

const opts = program.opts();
const rootDir = path.resolve(__dirname, '..');

function loadCredentials() {
  const explicit = path.join(rootDir, 'serviceAccountKey.json');
  if (fs.existsSync(explicit)) {
    return require(explicit);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  console.error('No credentials found: place serviceAccountKey.json or set GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}

function initFirebase() {
  const cred = loadCredentials();
  admin.initializeApp({
    credential: admin.credential.cert(cred),
    storageBucket: `${cred.project_id}.appspot.com`
  });
  return { db: admin.firestore(), bucket: admin.storage().bucket() };
}

function loadData() {
  const questionsPath = path.join(rootDir, 'data', 'questions.json');
  const setsPath = path.join(rootDir, 'data', 'questionSets.json');
  if (!fs.existsSync(questionsPath) || !fs.existsSync(setsPath)) {
    console.error('Missing data JSON files. Run extract scripts first.');
    process.exit(1);
  }
  return {
    questions: JSON.parse(fs.readFileSync(questionsPath, 'utf-8')),
    sets: JSON.parse(fs.readFileSync(setsPath, 'utf-8'))
  };
}

async function importSets(db, sets, dryRun=false) {
  console.log(`Importing ${sets.length} sets`);
  let count = 0;
  for (const s of sets) {
    const docRef = db.collection('questionSets').doc(`${s.classNo}-${s.setNo}`);
    const data = {
      gid: s.gid,
      classNo: s.classNo,
      setNo: s.setNo,
      setName: s.setName,
      createdAt: s.createdAt
    };
    if (!dryRun) await docRef.set(data, { merge: true });
    count++;
  }
  console.log(`Sets processed: ${count}`);
}

function computeStoragePath(questionId, type, ext) {
  return `questions/${questionId}/${type}.${ext}`;
}

async function uploadImage(bucket, localPath, destPath, dryRun=false) {
  if (dryRun) return { publicUrl: `dry-run://${destPath}` };
  await bucket.upload(localPath, { destination: destPath, resumable: false });
  // Make public (optional) - adjust if you prefer token-based access
  await bucket.file(destPath).makePublic();
  return { publicUrl: `https://storage.googleapis.com/${bucket.name}/${destPath}` };
}

async function importQuestions(db, bucket, questions, imageMap, limit, dryRun=false) {
  const col = db.collection('questions');
  let processed = 0;
  const batchSize = 500;
  let batch = db.batch();
  for (const q of questions) {
    if (limit && processed >= limit) break;
    const docRef = col.doc(q.questionId);
    const mapEntry = imageMap[q.questionId];
    let questionImageUrl = null;
    let answerImageUrl = null;

    if (mapEntry && mapEntry.Q) {
      const ext = path.extname(mapEntry.Q).replace('.', '') || 'png';
      const storagePath = computeStoragePath(q.questionId, 'Q', ext);
      const localPath = path.join(rootDir, '160803 画像データ', mapEntry.Q);
      if (fs.existsSync(localPath)) {
        const { publicUrl } = await uploadImage(bucket, localPath, storagePath, dryRun);
        questionImageUrl = publicUrl;
      }
    }
    if (mapEntry && mapEntry.A) {
      const ext = path.extname(mapEntry.A).replace('.', '') || 'png';
      const storagePath = computeStoragePath(q.questionId, 'A', ext);
      const localPath = path.join(rootDir, '160803 画像データ', mapEntry.A);
      if (fs.existsSync(localPath)) {
        const { publicUrl } = await uploadImage(bucket, localPath, storagePath, dryRun);
        answerImageUrl = publicUrl;
      }
    }

    const docData = {
      questionId: q.questionId,
      gid: q.gid,
      classNo: q.classNo,
      setNo: q.setNo,
      category: q.category,
      questionText: q.questionText,
      choices: q.choices,
      answerIndex: q.answerIndex,
      point: q.point,
      explanationText: q.explanationText,
      item: q.item,
      companyName: q.companyName,
      linkHtml: q.linkHtml,
      linkPlain: q.linkPlain,
      bannerUrlRaw: q.bannerUrlRaw,
      remarks: q.remarks,
      author: q.author,
      randomSeed: q.randomSeed,
      isCorporate: q.isCorporate,
      assets: {
        questionImage: questionImageUrl,
        answerImage: answerImageUrl
      },
      updatedAt: new Date().toISOString()
    };

    batch.set(docRef, docData, { merge: true });
    processed++;
    if (processed % batchSize === 0) {
      if (!dryRun) await batch.commit();
      batch = db.batch();
      console.log(`Committed batch at ${processed}`);
    }
  }
  if (processed % batchSize !== 0) {
    if (!dryRun) await batch.commit();
    console.log('Final batch committed.');
  }
  console.log(`Questions processed: ${processed}`);
}

async function main() {
  const dryRun = !!opts.dryRun;
  const limit = opts.limit;
  console.log('Starting import', { dryRun, limit });
  const { questions, sets } = loadData();
  const imageMapPath = path.join(rootDir, 'data', 'imageMap.json');
  if (!fs.existsSync(imageMapPath)) {
    console.error('imageMap.json not found. Run map_images.js first.');
    process.exit(1);
  }
  const imageMap = JSON.parse(fs.readFileSync(imageMapPath, 'utf-8'));

  const { db, bucket } = initFirebase();
  await importSets(db, sets, dryRun);
  await importQuestions(db, bucket, questions, imageMap, limit, dryRun);

  console.log('Import completed.');
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
