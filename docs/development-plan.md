# 開発計画: claude_codex_friends ユーザビリティ改善

## 現状分析

### アーキテクチャ

- DDD/クリーンアーキテクチャに基づくレイヤー分離済み
- 3つの実行モード: launcher（3ペイン）, repl（インタラクティブ）, auto（ワンショット）
- Result型によるエラーハンドリング

### 課題（優先度順）

| # | 課題 | 影響度 | 対応難易度 |
|---|------|--------|-----------|
| 1 | CLI引数バリデーション不足（NaN、負数が素通り） | 高 | 低 |
| 2 | REPL が Ctrl+C で tmux セッションを放置 | 高 | 低 |
| 3 | config の parseMode にテストがない | 中 | 低 |
| 4 | orchestrator の runLoop がエラー時に break するだけで err() を返さない | 中 | 中 |
| 5 | REPL コマンドの拡張性が乏しい（出力先指定、言語変更ができない） | 中 | 中 |
| 6 | tmux.service.ts が 300行と肥大化（関心の分離不足） | 低 | 中 |
| 7 | レビュー結果のサマリ表示がない（/last でコード全文が出るだけ） | 低 | 低 |

---

## フェーズ 1: 安定性・堅牢性の向上（基盤修正）

### 1-1. CLI引数バリデーション追加

- **対象**: `src/config/index.ts` の `parseMode()`
- **内容**:
  - `maxIterations` が NaN・0以下の場合にエラー終了
  - `timeoutMs` が NaN・0以下の場合にエラー終了
  - `pollIntervalMs` が NaN・0以下の場合にエラー終了
- **テスト**: `src/__tests__/config/parse-mode.test.ts` を新規作成
  - 正常系: 各モードの判定
  - 異常系: 不正な数値、欠落引数

### 1-2. REPL のグレースフルシャットダウン

- **対象**: `src/repl/index.ts`
- **内容**:
  - `SIGINT` / `SIGTERM` をハンドリング
  - 終了時に tmux セッション破棄の確認を出す
  - `/exit` 実行時もセッションクリーンアップを実施
- **テスト**: 手動確認（シグナルハンドリングはE2E的）

### 1-3. runLoop のエラー伝搬を改善

- **対象**: `src/orchestrator/agent-loop.ts` の `runLoop()`
- **内容**:
  - `break` 後に `err()` を返す分岐を追加
  - エラー発生イテレーションの情報を `LoopResult` に含める
- **ドメイン型変更**: `LoopResult` に `errorMessage?: string` を追加
- **テスト**: runLoop は外部依存が多いため、エラー伝搬ロジックをドメイン層に切り出してテスト

---

## フェーズ 2: REPL ユーザビリティ強化

### 2-1. REPL 設定変更コマンド追加

- **対象**: `src/repl/commands.ts`, `src/domain/repl.types.ts`, `src/repl/index.ts`
- **内容**:
  - `/set language <lang>` — セッション中の言語を変更
  - `/set max-iterations <n>` — 最大イテレーション数を変更
  - `/set output <path>` — 出力ファイルパスを設定
- **テスト**: `src/__tests__/repl/commands.test.ts` にケース追加

### 2-2. レビュー結果サマリ表示

- **対象**: `src/ui/terminal.ts`
- **内容**:
  - `/last` でコード全文ではなく、先頭10行 + "...省略..." 形式で表示
  - `/last --full` で全文表示に切り替え
  - レビューコメントの要約も表示

### 2-3. REPL のコマンド補完・入力履歴

- **対象**: `src/repl/index.ts`
- **内容**:
  - readline の `completer` オプションでコマンド補完
  - readline の `history` でセッション内のコマンド履歴を保持

---

## フェーズ 3: テスト強化・リファクタリング

### 3-1. config 層のテスト追加

- **対象**: `src/__tests__/config/parse-mode.test.ts`（新規）
- **テストケース**:
  - タスクなし → launcher モード
  - タスクあり → auto モード
  - `--repl` → repl モード
  - 各オプションのパース正常系
  - 不正引数のエラーケース

### 3-2. tmux.service.ts の分割

- **対象**: `src/services/tmux.service.ts` → 3ファイルに分割
  - `src/services/tmux-session.service.ts` — セッション管理（create/destroy/exists）
  - `src/services/tmux-pane.service.ts` — ペイン操作（capture/send/completion検知）
  - `src/services/file.service.ts` — 一時ファイル管理
- **注意**: 公開APIは変更せず、re-exportで後方互換性を維持

### 3-3. isCompletionState のテスト追加

- **対象**: `src/__tests__/services/completion.test.ts`（新規）
- **内容**: `isCompletionState` は純粋関数なのでユニットテスト可能
  - 各完了パターンの検知
  - 中間出力の誤検知防止

---

## 実装順序

```
フェーズ1-1 (config バリデーション + テスト)
    ↓
フェーズ1-2 (グレースフルシャットダウン)
    ↓
フェーズ1-3 (エラー伝搬改善)
    ↓
フェーズ2-1 (/set コマンド)
    ↓
フェーズ2-2 (サマリ表示)
    ↓
フェーズ2-3 (補完・履歴)
    ↓
フェーズ3-1 (config テスト — 1-1で一部カバー済み)
    ↓
フェーズ3-2 (tmux.service分割)
    ↓
フェーズ3-3 (completionテスト)
```

## コミット粒度ガイド

各フェーズのサブタスク（1-1, 1-2, ...）を1コミットとする。
テストとプロダクションコードは同一コミットに含める（密結合した変更のため）。
tmux.service の分割（3-2）は3コミットに分ける:

1. `refactor: tmux.serviceからセッション管理を分離`
2. `refactor: tmux.serviceからペイン操作を分離`
3. `refactor: tmux.serviceからファイル管理を分離`
