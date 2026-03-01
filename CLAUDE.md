# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Claude Code と OpenAI Codex CLI を tmux 上で連携させ、「コード生成 → レビュー → 修正」のループを自動実行するオーケストレーションツール。Claude がコードを生成し、Codex がレビューする対話サイクルを、承認（APPROVED）または最大イテレーション到達まで繰り返す。

## コマンド

```bash
npm install              # 依存関係インストール
npm run dev              # CLI実行 (tsx src/index.ts)
npm run build            # TypeScript ビルド (tsc)
npm run typecheck        # 型チェックのみ (tsc --noEmit)
npm test                 # テスト実行 (vitest run)
npm run test:watch       # テスト監視モード (vitest)
```

### CLI 実行例

```bash
npx tsx src/index.ts "FizzBuzzを実装して" -l typescript -o fizzbuzz.ts
npx tsx src/index.ts "Quick sort in Python" -m 3 -o sort.py
```

CLI オプション: `-l/--language`, `-o/--output`, `-m/--max-iterations`, `-t/--timeout`, `--poll-interval`

## アーキテクチャ

DDD/クリーンアーキテクチャに基づくレイヤー分離。

```
src/
├── domain/           # ドメイン層（純粋関数・型定義、外部依存なし）
│   ├── types.ts      # Result<T,E> 型、ok()/err() ヘルパー
│   ├── loop.types.ts # LoopState, LoopConfig, IterationResult, LoopResult
│   ├── loop.rules.ts # プロンプト構築、ループ継続判定、コード抽出（ビジネスルール）
│   └── errors.ts     # エラー定義（日本語メッセージ）
├── services/
│   └── tmux.service.ts  # tmux 操作（セッション管理、ペイン操作、CLI起動、応答待機）
├── orchestrator/
│   └── agent-loop.ts    # メインループ実行（Claude生成→Codex レビュー→修正サイクル）
├── config/
│   └── index.ts         # CLI 引数パース → LoopConfig 構築
├── ui/
│   └── terminal.ts      # ターミナル出力（バナー、進捗表示、色付き出力）
├── __tests__/
│   └── domain/          # ドメインロジックのテスト
└── index.ts             # エントリーポイント
```

### 処理フロー

1. CLI引数パース → `LoopConfig` 生成
2. tmux セッション作成（2ペイン: 左=Claude, 右=Codex）
3. 両CLIの起動完了を待機（`waitForCompletion` でポーリング）
4. ループ開始:
   - Claude にプロンプト送信 → 応答からコード抽出 → 一時ファイル保存
   - Codex にレビュープロンプト送信 → 応答から APPROVED 判定
   - 未承認なら修正プロンプトで再ループ
5. 結果出力、tmux セッションは残存（ユーザーが確認可能）

### 設計上の重要ポイント

- **ドメイン層の純粋性**: `loop.rules.ts` の関数は副作用なし。テスト容易性のため外部依存を持たない
- **Result 型によるエラーハンドリング**: ドメイン層では例外を投げず `ok()`/`err()` で返す
- **CLI応答検知**: tmux の `capture-pane` でペイン出力を取得し、完了プロンプト（`❯`, `›`）のパターンマッチ + 出力安定性（2回連続同一）で応答完了を判定
- **長文プロンプト対策**: TUI のバッファ制限回避のため 200文字チャンクに分割送信

## テスト

テストファイルは `src/__tests__/` 配下に配置。vitest を使用し、`vite-tsconfig-paths` でパスエイリアス (`@/`) を解決。テスト対象は主にドメイン層の純粋関数。

## 前提条件

- Node.js >= 18
- tmux がインストール済み (`brew install tmux`)
- `claude` CLI（Claude Code）と `codex` CLI（OpenAI Codex CLI）がPATH上に存在
