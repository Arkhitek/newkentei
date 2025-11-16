# Firestore 接続トラブルシューティング

## 実装した改善策（2025-11-16）

### 1. 診断強化
- **リトライ回数増加**: 3回 → 5回に拡大
- **待機時間延長**: [1s, 2s, 3s] → [1s, 2s, 4s, 8s, 15s] に変更（最大30秒待機）
- **外部ネットワーク疎通確認**: 初回失敗時に `google.com/favicon.ico` へ ping して真の接続性判定
- **タイムスタンプログ追加**: 各試行の正確な時刻を記録

### 2. オフライン永続化無効化オプション
**問題**: IndexedDB ベースの永続化が企業プロキシやブラウザ設定で干渉する可能性
**対処**: URL パラメータ `?nopersist=true` でオフライン永続化を無効化
- 3回目のリトライ失敗後、自動的に `?nopersist=true` を追加してリロード

### 3. 詳細ログ強化
- Firestore 初期化設定を明示的に出力
- 各試行で `navigator.onLine` と ISO タイムスタンプを記録
- ネットワーク診断結果（外部疎通テスト）を表示

### 4. エラーバナー改善
接続失敗時のバナーに以下を追加:
- (1) ページリロード推奨
- (2) ネットワーク確認
- (3) 別モード (`?lp=true&nopersist=true`) リンク
- (4) Firebase Console 確認リンク

## 使用方法

### 通常モード（自動判定）
```
https://your-domain.com/
```
- `experimentalAutoDetectLongPolling: true`
- WebChannel が失敗したら自動で長時間ポーリングへフォールバック

### 長時間ポーリング強制モード
```
https://your-domain.com/?lp=true
```
- `experimentalForceLongPolling: true`
- WebSocket/WebChannel を使わず最初から長時間ポーリング

### 永続化無効モード
```
https://your-domain.com/?lp=true&nopersist=true
```
- 長時間ポーリング + IndexedDB 永続化なし
- 企業プロキシやブラウザ設定での干渉回避に有効

### デバッグモード
```
https://your-domain.com/?debug=true
```
- 画面右下にデバッグパネル表示
- Firestore 診断・強制再取得・バナー制御ボタン

## トラブルシューティング手順

### ケース1: "unavailable" エラーが連続
1. ブラウザのコンソールを開く（F12）
2. 外部ネットワーク疎通テストの結果を確認:
   - ✅ "External network reachable" → Firebase 固有の問題
   - ⚠️ "External network unreachable" → ローカルネットワーク問題

**Firebase 固有の問題の場合**:
```
?lp=true&nopersist=true
```
を URL に追加してリロード

**ローカルネットワーク問題の場合**:
- Wi-Fi 再接続
- VPN 切断/再接続
- プロキシ設定確認

### ケース2: IndexedDB エラー
```
Failed to execute 'transaction' on 'IDBDatabase'
```
**原因**: ブラウザのプライベートモードまたはストレージ制限
**対処**: `?nopersist=true` で永続化を無効化

### ケース3: CORS エラー
```
Access to fetch at 'https://firestore.googleapis.com/...' has been blocked by CORS
```
**原因**: 企業ファイアウォール/プロキシが Firestore API をブロック
**対処**: 
1. IT 部門に `*.googleapis.com` のホワイトリスト追加を依頼
2. 一時的に別ネットワーク（モバイルテザリングなど）でテスト

### ケース4: 初回読み込みは成功するが2回目以降失敗
**原因**: キャッシュされた接続設定の不一致
**対処**: ハードリロード（Ctrl+Shift+R / Cmd+Shift+R）

## Firebase Console での確認項目

### 1. Firestore Database の有効化
Console → Firestore Database → 「データベースを作成」が完了しているか

### 2. セキュリティルール
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 認証済みユーザーのみ読み書き可能
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /questions/{questionId} {
      allow read: if request.auth != null;
    }
    match /questionSets/{setId} {
      allow read: if request.auth != null;
    }
    match /scores/{scoreId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 3. ネットワークアクセス制限
Console → Firestore Database → 使用状況 → エラー数を確認
- 大量の `permission-denied` → ルール問題
- 大量の `unavailable` → ネットワーク/DNS 問題

## 開発者向けノート

### Firestore 初期化オプション比較

| オプション | WebSocket | 長時間ポーリング | IndexedDB | 用途 |
|----------|----------|--------------|-----------|------|
| `getFirestore()` | ✅ デフォルト | ❌ | ✅ | 標準（最速） |
| `experimentalAutoDetectLongPolling: true` | ✅ 自動切替 | ✅ フォールバック | ✅ | 推奨（安定） |
| `experimentalForceLongPolling: true` | ❌ | ✅ 強制 | ✅ | 企業プロキシ環境 |
| `useFetchStreams: false` | ❌ | ✅ 強制 | ✅ | Safari/古いブラウザ |
| `nopersist=true` | — | — | ❌ 無効 | トラブルシューティング |

### リトライロジック
```javascript
maxRetries = 5
delays = [1000, 2000, 4000, 8000, 15000] // 合計30秒
attempt 0: 即座
attempt 1: +1s (累計1s)
attempt 2: +2s (累計3s)
attempt 3: +4s (累計7s)
attempt 4: +8s (累計15s)
attempt 5: +15s (累計30s) ← 最終試行
```

## 既知の制限

1. **企業ファイアウォール**: `*.googleapis.com` がブロックされている場合は根本的に接続不可
2. **ブラウザ拡張機能**: 広告ブロッカーや Privacy Badger が WebSocket を遮断する可能性
3. **プライベートモード**: IndexedDB 永続化が無効化されるため `?nopersist=true` と同等の動作

## 参考リンク
- [Firebase Firestore Web SDK](https://firebase.google.com/docs/firestore/quickstart)
- [Firestore Persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Long Polling vs WebSocket](https://firebase.google.com/docs/firestore/rtdb-vs-firestore#real-time_updates)
