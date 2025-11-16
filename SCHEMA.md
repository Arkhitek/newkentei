# Firestore / Storage スキーマ提案

## コレクション構造
- `questionSets` : セット（級別・セット番号）メタ情報
- `questions` : 個別問題本体

## questionSets ドキュメント例
```json
{
  "gid": 1,              // Excel question_master.csv.gid
  "classNo": 5,          // classno (級: 5,4,3...)
  "setNo": 1,            // gset (セット番号)
  "setName": "5級セット１", // setname
  "createdAt": "2012-08-01T15:00:00.000Z" // createdate ISO
}
```
`docId` 例: `5-1` (classNo-gset) あるいは そのまま gid を string 化

## questions ドキュメント例
```json
{
  "questionId": "5-1-1",            // 画像ファイル名から抽出 (ex: 5-1-1-Q.png)
  "setRef": "questionSets/5-1",     // 紐付くセット
  "gid": 6,                          // Excel gid (紐付け確認用)
  "classNo": 5,                      // Excel classno
  "setNo": 1,                        // Excel gset
  "category": "構造",               // title (分類)
  "questionText": "...",            // question (改行維持\n統一)
  "choices": ["0.02ｇ/ｃ㎡","0.2ｇ/ｃ㎡","2ｇ/ｃ㎡","20ｇ/ｃ㎡"], // choice1~4
  "answerIndex": 2,                  // answer (1始まり→0始まりに変換: 3→2)
  "point": 1,                        // point (得点)
  "explanationText": "...",         // questionexplain (改行正規化)
  "companyName": "岡本構造研究室・SAM", // 会社名
  "linkHtml": "<a href=...>",       // リンクURL (必要ならプレーン化)
  "bannerUrlRaw": null,              // バナーURL (原始データ) 後で正規化
  "remarks": null,                   // 備考
  "author": "岡本",                 // 作成者
  "item": 5,                         // item (問題分類補助: Excel上に存在)
  "assets": {
    "questionImage": "questions/5-1-1/Q.png",    // Cloud Storage パス
    "answerImage": "questions/5-1-1/A.png"        // Cloud Storage パス
  },
  "randomSeed": 834271,              // ランダム取得用 precomputed hash/int
  "isCorporate": true,               // 会社名が存在 or 特定条件で判定
  "updatedAt":  "2025-11-16T00:00:00.000Z" // インポート時刻
}
```
`docId` は `questionId` をそのまま利用。

## フィールド設計詳細
| Excelヘッダ | Firestoreフィールド | 型 | 変換 | 備考 |
|-------------|---------------------|----|------|------|
| id | internalRowId | number | そのまま | 重複検証用オリジナル行ID |
| gid | gid | number | そのまま | セット紐付けID (question_master.gid) |
| title | category | string | trim | 分類 (構造/施工等) |
| image | assets.questionImage | string | ファイル名→パス | 拡張子保持 |
| question | questionText | string | 改行 \r\n → \n | 問題文 |
| choice1~4 | choices[] | string[] | 配列化 | 空白除去 |
| answer | answerIndex | number | -1 (1→0基準) | 配列インデックス化 |
| point | point | number | そのまま | 得点 |
| explainimage | assets.answerImage | string | ファイル名→パス | 説明画像 |
| questionexplain | explanationText | string | 改行正規化 | 解説文 |
| classno | classNo | number | そのまま | 級 |
| gset | setNo | number | そのまま | セット番号 |
| item | item | number | そのまま | セクション/章番号的用途 |
| 会社名 | companyName | string|null | trim | 存在で isCorporate=true |
| リンクURL | linkHtml | string|null | そのまま or HTML除去 | 必要なら別フィールド linkPlain |
| バナーURL | bannerUrlRaw | string|null | そのまま | 後処理で Storage へ再取得可 |
| 備考 | remarks | string|null | trim | |
| 作成者 | author | string|null | trim | |
| createdate (master) | createdAt (set) | ISO string | Date → toISOString | セット側のみ |
| setname (master) | setName | string | そのまま | questionSets |

## Cloud Storage パス規則
- ルート: `questions/` 直下に `questionId/` ディレクトリ。
- 命名: `<questionId>/Q.<ext>` / `<questionId>/A.<ext>`
- 例: `questions/5-1-1/Q.png`

## ランダム出題戦略
- 方法1: 全問題に `randomSeed` (0–999999) を付与し `where('randomSeed','>=',X)` + limit + wrap-around。
- 方法2: 全件キャッシュ (少量なら) クライアントでシャッフル。
- 企業問題のみ: `where('isCorporate','==',true)` を組み合わせ。

## isCorporate 判定ロジック案
- `companyName` が非null かつ 長さ>0 → true
- 追加条件: 特定社名ドメイン / バナーURL存在 など拡張可能

## 正規化/クリーニング
- 改行: `\r\n` → `\n` に統一
- HTMLアンカー: 必要なら別フィールド `linkPlain` に抽出 (正規表現 `<a [^>]*href="([^"]+)"[^>]*>`)
- 空の文字列は null に変換しクエリ簡素化

## インデックス (推奨)
- `classNo, setNo` 複合 (セット内取得)
- `isCorporate` (フィルタ)
- `randomSeed` (ランダム抽出用 range)
- `category` (分類別検索)

## バッチ書き込み計画
- 500件/バッチ。画像アップロード後 URL 取得して書き込み。
- 冪等性: 既存 docId が存在 → 差分更新 (上書き) or skip オプション。

## 次ステップ
1. JSON抽出スクリプトでこのスキーマへマッピング実装
2. 画像ファイル名パース (regex: `^(\d+-\d+-\d+)-(Q|A)\.png$`) で questionId + type
3. firebase-admin 導入しインポートツール作成
