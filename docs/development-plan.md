# Development Plan: claude_codex_friends

Generated: 2026-03-17
Based on: CLAUDE.md, PROMPT.md, docs/development-plan.md (previous), 全ソースコード, テストコード

## Executive Summary

PROMPT.md の全10項目（ハードコード集約〜CLI応答検知堅牢化）は全て完了済み。残タスクは主に「安定性向上」「REPL UX 強化」「リファクタリング」の3フェーズ。全タスクが並行実装可能で依存関係はない。ドメイン層のテストカバレッジは高い（110テスト全パス）が、config バリデーション異常系・REPL シャットダウン・tmux.service 分割が未着手。

## Analysis Summary

| Category | Not Started | Partial | Untested | Divergent | Complete |
|----------|-------------|---------|----------|-----------|----------|
| Domain   | 0           | 0       | 0        | 0         | 6        |
| Config   | 1           | 0       | 0        | 0         | 1        |
| REPL     | 2           | 1       | 0        | 0         | 1        |
| Service  | 1           | 0       | 0        | 0         | 1        |
| Tests    | 1           | 0       | 0        | 0         | 5        |

## Current State

- **TypeScript ビルド**: OK (`npm run typecheck` パス)
- **テスト**: 5ファイル / 110テスト 全パス
- **ソースファイル**: 12ファイル (domain: 5, config: 1, services: 1, orchestrator: 2, repl: 2, ui: 1)
- **テストファイル**: 5ファイル (domain: 3, config: 1, repl: 1)

---

## Phase 1: 安定性・堅牢性の向上（High Priority）

### 1-1. CLI引数バリデーション追加

- **Status**: Not Started
- **Tags**: `core-path`, `parallelizable`
- **Risk**: Low
- **Evidence**: `src/config/index.ts:59` — `parseInt` の結果が NaN/0以下でもそのまま通る。`src/__tests__/config/parseMode.test.ts` に異常系テストケースなし
- **Confidence**: High
- **Description**: `maxIterations`, `timeoutMs`, `pollIntervalMs` に NaN・0以下・負数が渡された場合のバリデーション追加。`parseMode()` の戻り値を `Result<RunMode>` に変更するか、不正値で `console.error` + `process.exit(1)` する
- **Affected Files**: `src/config/index.ts`, `src/__tests__/config/parseMode.test.ts`
- **Dependencies**: なし
- **Estimated Scope**: S (<50 lines)
- **Done Criteria**:
  - `parseMode(['task', '-m', '0'])` がエラー
  - `parseMode(['task', '-m', 'abc'])` がエラー
  - `parseMode(['task', '-m', '-3'])` がエラー
  - `-t` と `--poll-interval` でも同様に検証
  - 正常系テストが引き続きパス
- **Required Tests**: unit

### 1-2. REPL のグレースフルシャットダウン

- **Status**: Not Started
- **Tags**: `core-path`
- **Risk**: Low
- **Evidence**: `src/repl/index.ts:197-201` — `/exit` は `process.exit(0)` のみで tmux セッションクリーンアップなし。`src/index.ts:10-24` にgraceful shutdown があるが REPL 内ではシグナルハンドリングなし
- **Confidence**: High
- **Description**: REPL 実行中の Ctrl+C/SIGTERM で tmux セッション破棄の確認を出し、一時ファイルをクリーンアップする。`/exit` 実行時もセッション破棄を確認する
- **Affected Files**: `src/repl/index.ts`, `src/index.ts`
- **Dependencies**: なし
- **Estimated Scope**: S (<50 lines)
- **Done Criteria**:
  - `/exit` 時に「tmux セッションを破棄しますか？」確認あり
  - Ctrl+C で一時ファイル削除
  - ループ実行中の Ctrl+C でもクリーンアップ
- **Required Tests**: 手動確認（シグナルハンドリング）

### 1-3. runLoop のエラー伝搬改善

- **Status**: Partial（`LoopEngine` は `err()` を返すが、`EngineResult` にエラー情報フィールドがない）
- **Tags**: `core-path`
- **Risk**: Medium
- **Evidence**: `src/domain/engine.types.ts:63-70` の `EngineResult` に `errorMessage` フィールドなし。`src/orchestrator/loop-engine.ts:96-98` でエラー時に `err()` は返しているが、正常完了パスでのエラー情報が失われる
- **Confidence**: Medium
- **Description**: `EngineResult` に `errorMessage?: string` を追加し、エラー発生イテレーション情報を含める
- **Affected Files**: `src/domain/engine.types.ts`, `src/orchestrator/loop-engine.ts`
- **Dependencies**: なし
- **Estimated Scope**: S (<50 lines)
- **Done Criteria**:
  - `EngineResult.errorMessage` にエラー内容が格納される
  - 呼び出し元でエラー理由を表示できる
- **Required Tests**: unit

---

## Phase 2: REPL ユーザビリティ強化（Medium Priority）

### 2-1. REPL 設定変更コマンド追加 (`/set`)

- **Status**: Not Started
- **Tags**: `parallelizable`
- **Risk**: Low
- **Evidence**: `src/domain/repl.types.ts` — `/set` コマンド型が未定義。`src/repl/commands.ts` にも `/set` パース処理なし
- **Confidence**: High
- **Description**: `/set language <lang>`, `/set max-iterations <n>`, `/set output <path>` でセッション中の設定変更を可能にする
- **Affected Files**: `src/domain/repl.types.ts`, `src/repl/commands.ts`, `src/repl/index.ts`, `src/__tests__/repl/commands.test.ts`
- **Dependencies**: なし
- **Estimated Scope**: M (50-200 lines)
- **Done Criteria**:
  - `/set language python` で以降のタスクが Python で実行
  - `/set max-iterations 10` で最大イテレーション数変更
  - `/set output result.ts` で出力先変更
  - 不正キーにエラーメッセージ
- **Required Tests**: unit

### 2-2. レビュー結果サマリ表示改善

- **Status**: Not Started
- **Tags**: `parallelizable`
- **Risk**: Low
- **Evidence**: `src/ui/terminal.ts:138-157` — `printReplLastResult()` はコード全文表示。省略表示やレビューコメント表示なし
- **Confidence**: High
- **Description**: `/last` でコード先頭10行 + "...省略..." 形式。`/last --full` で全文表示。レビューコメントも表示する
- **Affected Files**: `src/ui/terminal.ts`, `src/repl/index.ts`, `src/domain/repl.types.ts`, `src/repl/commands.ts`
- **Dependencies**: なし
- **Estimated Scope**: S (<50 lines)
- **Done Criteria**:
  - `/last` がコード先頭10行 + 省略表示
  - `/last --full` で全文表示
  - レビューコメントが表示される
- **Required Tests**: unit

### 2-3. REPL のコマンド補完・入力履歴

- **Status**: Not Started
- **Tags**: `parallelizable`
- **Risk**: Low
- **Evidence**: `src/repl/index.ts:76-79` — `createInterface` に `completer` オプションなし
- **Confidence**: High
- **Description**: readline の `completer` でスラッシュコマンドのタブ補完追加。セッション内コマンド履歴保持
- **Affected Files**: `src/repl/index.ts`
- **Dependencies**: なし
- **Estimated Scope**: S (<50 lines)
- **Done Criteria**:
  - `/he` + Tab で `/help` に補完
  - 上矢印キーで過去コマンド呼び出し
- **Required Tests**: 手動確認

---

## Phase 3: テスト強化・リファクタリング（Low Priority）

### 3-1. isCompletionState テスト強化

- **Status**: Not Started（基本テストは `loop.rules.test.ts` に8件あり）
- **Tags**: `parallelizable`
- **Risk**: Low
- **Evidence**: `src/__tests__/domain/loop.rules.test.ts:317-369` — 基本パターンはカバー済みだが、複数パターン混在・ANSIコード複合ケース等が不足
- **Confidence**: Medium
- **Description**: エッジケースの追加: 複数行プロンプトパターン混在、ANSI + 完了パターン組み合わせ等
- **Affected Files**: `src/__tests__/domain/loop.rules.test.ts`
- **Dependencies**: なし
- **Estimated Scope**: S (<50 lines)
- **Done Criteria**: isCompletionState のテストが15ケース以上
- **Required Tests**: unit

### 3-2. tmux.service.ts の分割

- **Status**: Not Started
- **Tags**: `parallelizable`
- **Risk**: Medium
- **Evidence**: `src/services/tmux.service.ts` — 289行。セッション管理・ペイン操作・ファイル管理が混在
- **Confidence**: High
- **Description**: 3ファイルに分割し re-export で後方互換性維持
  - `src/services/tmux-session.service.ts` — セッション管理（create/destroy/exists）
  - `src/services/tmux-pane.service.ts` — ペイン操作（capture/send/completion検知）
  - `src/services/file.service.ts` — 一時ファイル管理
- **Affected Files**: `src/services/tmux.service.ts` → 3ファイル + re-export
- **Dependencies**: なし
- **Estimated Scope**: M (50-200 lines / 移動中心だが影響範囲広い)
- **Done Criteria**:
  - 各ファイルが100行以下
  - 既存 import が壊れない（re-export）
  - 全テストがパス
- **Required Tests**: unit（既存テスト通過確認）
- **Commit Strategy**: 3コミットに分割
  1. `refactor: tmux.serviceからセッション管理を分離`
  2. `refactor: tmux.serviceからペイン操作を分離`
  3. `refactor: tmux.serviceからファイル管理を分離`

---

## Dependency Graph

```
全タスクが独立 — 並行実装可能

Phase 1 (安定性)          Phase 2 (REPL UX)        Phase 3 (リファクタ)
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│ 1-1 Config検証  │    │ 2-1 /set コマンド │    │ 3-1 テスト強化       │
│ 1-2 Shutdown    │    │ 2-2 /last 改善   │    │ 3-2 tmux.service分割 │
│ 1-3 エラー伝搬  │    │ 2-3 補完・履歴   │    │                      │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

## Recommended Implementation Order

1. **1-1** CLI引数バリデーション — 最も簡単かつバグ防止。TDDで即実装
2. **1-2** グレースフルシャットダウン — ユーザー体験に直結
3. **1-3** エラー伝搬改善 — 型変更を伴うのでPhase 1で完了したい
4. **2-1** /set コマンド — REPL UX 改善の起点
5. **2-2** /last サマリ表示 — 単体完結のUI改善
6. **2-3** コマンド補完 — readline 設定変更のみ
7. **3-1** テスト強化 — いつでも可能
8. **3-2** tmux.service 分割 — 影響範囲が広いので最後が安全

## Commit Granularity

- 各サブタスク (1-1, 1-2, ...) を1コミット
- テストとプロダクションコードは同一コミット
- tmux.service 分割 (3-2) のみ3コミットに分割

## Open Questions

1. **parseMode のエラーハンドリング方式**: 現在 `parseMode()` は `RunMode` を直接返す。バリデーションエラーを `Result<RunMode>` にするか `process.exit(1)` にするか要判断
2. **REPL のセッション所有権**: launcher モードで `/exit` 時にセッション全体を破棄すべきか、orchestrator ペインだけ終了すべきか仕様が曖昧
3. **config テスト (旧3-1)**: `parseMode.test.ts` に既に14テストケースあり、フェーズ1-1でバリデーション異常系を追加すれば実質カバー済み
