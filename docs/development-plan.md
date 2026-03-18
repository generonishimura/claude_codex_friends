# Development Plan: claude_codex_friends

Updated: 2026-03-18
Based on: CLAUDE.md, PROMPT.md, 全ソースコード, テストコード

## Executive Summary

PROMPT.md の全10項目 + 開発プラン全8タスクが **全て完了**。3フェーズ（安定性向上・REPL UX強化・リファクタリング）の全タスクが実装・レビュー・マージ済み。テスト数は 110 → **175件** に増加。

## Analysis Summary

| Category | Not Started | Partial | Untested | Divergent | Complete |
|----------|-------------|---------|----------|-----------|----------|
| Domain   | 0           | 0       | 0        | 0         | 8        |
| Config   | 0           | 0       | 0        | 0         | 2        |
| REPL     | 0           | 0       | 0        | 0         | 4        |
| Service  | 0           | 0       | 0        | 0         | 2        |
| Tests    | 0           | 0       | 0        | 0         | 10       |

## Current State

- **TypeScript ビルド**: OK (`npm run typecheck` パス)
- **テスト**: 10ファイル / 175テスト 全パス
- **ソースファイル**: 18ファイル (domain: 7, config: 1, services: 5, orchestrator: 2, repl: 3, ui: 1)
- **テストファイル**: 10ファイル (domain: 5, config: 1, repl: 2, ui: 1, orchestrator: 1)

---

## Phase 1: 安定性・堅牢性の向上 — Complete

### 1-1. CLI引数バリデーション追加

- **Status**: Complete (PR #7, merged 2026-03-18)
- **Implementation**:
  - `src/domain/config.rules.ts` に `validateNumericOptions()` 純粋関数を追加
  - `Number.isInteger(value) && value >= 1` で整数バリデーション
  - `parseMode()` の戻り値を `Result<RunMode, DomainError>` に変更
  - `src/index.ts` でバリデーションエラー時に `process.exit(1)`
- **Tests Added**: 15件 (config.rules: 13, parseMode: 2追加)
- **New Files**: `src/domain/config.rules.ts`, `src/__tests__/domain/config.rules.test.ts`

### 1-2. REPL のグレースフルシャットダウン

- **Status**: Complete (PR #13, merged 2026-03-18)
- **Implementation**:
  - `src/index.ts` のクリーンアップロジックを `cleanup()` 関数に抽出
  - REPL `/exit` で `cleanupTempFiles()` を呼び出してから終了
  - SIGINT は既存の `setupGracefulShutdown` でカバー
- **Design Decision**: REPL は tmux セッション内で動作するため、セッション破棄はせず一時ファイル削除のみ

### 1-3. runLoop のエラー伝搬改善

- **Status**: Complete (PR #8, merged 2026-03-18)
- **Implementation**:
  - `EngineResult` に `errorMessage?: string` フィールドを追加
  - `EngineState` に `lastError: string | null` を追加
  - エラー時も `state.lastError` をセットしつつ従来通り `err()` を返す
  - `finalize()` でエラー時のコード保存を抑制
- **Tests Added**: 4件 (engine.types.test.ts)
- **New Files**: `src/__tests__/domain/engine.types.test.ts`

---

## Phase 2: REPL ユーザビリティ強化 — Complete

### 2-1. REPL 設定変更コマンド追加 (`/set`)

- **Status**: Complete (PR #11, merged 2026-03-18)
- **Implementation**:
  - `ReplCommand` 型に `set` バリアントを追加
  - `src/domain/repl.rules.ts` に `validateSetCommand()` 関数（有効キー・数値検証）
  - `/set language|max-iterations|output` でランタイム設定変更
  - `/set` のみで現在設定表示
  - 単語境界チェック (`/set` vs `/settings` の誤マッチ防止)
  - `outputPath` を LoopEngine に伝搬
- **Tests Added**: 13件 (commands: 6, repl.rules: 7)
- **New Files**: `src/domain/repl.rules.ts`, `src/__tests__/domain/repl.rules.test.ts`

### 2-2. レビュー結果サマリ表示改善

- **Status**: Complete (PR #12, merged 2026-03-18)
- **Implementation**:
  - `/last` でコード先頭10行 + 省略表示（残り行数付き）
  - `/last --full` で全文表示
  - `truncateCode()` ヘルパー関数を追加
  - `ReplCommand` の `last` に `payload: 'full' | undefined` を追加（型一貫性）
  - 単語境界チェック (`/last` vs `/lastly` の誤マッチ防止)
- **Tests Added**: 5件 (commands: 2, terminal: 3)
- **New Files**: `src/__tests__/ui/terminal.test.ts`

### 2-3. REPL のコマンド補完

- **Status**: Complete (PR #10, merged 2026-03-18)
- **Implementation**:
  - `src/repl/completer.ts` に readline 用 `completer` 関数を追加
  - スラッシュコマンド9種と `@` コマンド2種をタブ補完
  - `createInterface` に `completer` オプション設定
- **Tests Added**: 10件 (completer.test.ts)
- **New Files**: `src/repl/completer.ts`, `src/__tests__/repl/completer.test.ts`

---

## Phase 3: テスト強化・リファクタリング — Complete

### 3-1. isCompletionState テスト強化

- **Status**: Complete (PR #9, merged 2026-03-18)
- **Implementation**:
  - 9件のエッジケーステストを追加（既存9件 → 計18件）
  - カバー: 複数パターン混在、ANSI囲み、100行超出力、last-5-lines境界、\r\n改行、タブ文字、空行
- **Tests Added**: 9件

### 3-2. tmux.service.ts の分割

- **Status**: Complete (PR #14, merged 2026-03-18)
- **Implementation**:
  - `tmux.service.ts` (289行) を4ファイルに分割:
    - `src/services/file.service.ts` — ファイル管理
    - `src/services/tmux-core.ts` — 共有ユーティリティ (tmux(), sleep())
    - `src/services/tmux-pane.service.ts` — ペイン操作
    - `src/services/tmux-session.service.ts` — セッション管理
  - `tmux.service.ts` を barrel re-export ファイルに変換（後方互換性維持）
- **Commit Strategy**: 3コミットで段階的分離
- **New Files**: `src/services/file.service.ts`, `src/services/tmux-core.ts`, `src/services/tmux-pane.service.ts`, `src/services/tmux-session.service.ts`

---

## Resolved Questions

1. **parseMode のエラーハンドリング方式**: `Result<RunMode, DomainError>` を採用。ドメイン層の `validateNumericOptions()` で整数チェック、`index.ts` で `process.exit(1)`
2. **REPL のセッション所有権**: launcher が tmux セッションを管理。REPL `/exit` は一時ファイル削除のみ、セッション破棄はしない
3. **config テスト**: `parseMode.test.ts` (18件) + `config.rules.test.ts` (13件) で十分なカバレッジ

## Architecture (Post-Refactoring)

```
src/
├── domain/              # ドメイン層（純粋関数・型定義）
│   ├── types.ts         # Result<T,E>, ok(), err()
│   ├── loop.types.ts    # LoopState, LoopConfig, IterationResult
│   ├── loop.rules.ts    # プロンプト構築、ループ判定、コード抽出
│   ├── engine.types.ts  # EngineState, EngineResult, EngineEvent
│   ├── engine.rules.ts  # ステートマシン判定ルール
│   ├── repl.types.ts    # ReplCommand 型定義
│   ├── repl.rules.ts    # /set バリデーション
│   ├── config.rules.ts  # 数値オプションバリデーション
│   └── errors.ts        # エラー定義
├── services/            # インフラ層（tmux操作、ファイルI/O）
│   ├── tmux.service.ts  # barrel re-export（後方互換）
│   ├── tmux-core.ts     # tmux(), sleep()
│   ├── tmux-pane.service.ts    # sendPrompt, capturePane, waitForCompletion
│   ├── tmux-session.service.ts # createSession, destroySession, startClaude/Codex
│   └── file.service.ts  # saveCodeToTempFile, cleanupTempFiles
├── orchestrator/        # ループ実行エンジン
│   ├── agent-loop.ts    # 自動ループ実行
│   └── loop-engine.ts   # LoopEngine ステートマシン
├── repl/                # REPL インターフェース
│   ├── index.ts         # startRepl()
│   ├── commands.ts      # parseCommand()
│   └── completer.ts     # タブ補完
├── config/
│   └── index.ts         # parseMode(), DEFAULTS
├── ui/
│   └── terminal.ts      # ターミナル出力・色付き表示
├── launcher.ts          # 3ペイン tmux 起動
└── index.ts             # エントリーポイント
```
