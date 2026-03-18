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

CLI オプション: `-l/--language`, `-o/--output`, `-m/--max-iterations`, `-t/--timeout`, `--poll-interval`, `--keep-session`, `--log <path>`

## アーキテクチャ

DDD/クリーンアーキテクチャに基づくレイヤー分離。

```
src/
├── domain/              # ドメイン層（純粋関数・型定義、外部依存なし）
│   ├── types.ts         # Result<T,E> 型、ok()/err() ヘルパー
│   ├── loop.types.ts    # LoopState, LoopConfig, IterationResult, LoopResult
│   ├── loop.rules.ts    # プロンプト構築、ループ継続判定、コード抽出
│   ├── engine.types.ts  # EngineState, EngineResult, EngineEvent
│   ├── engine.rules.ts  # ステートマシン判定ルール
│   ├── repl.types.ts    # ReplCommand 型定義
│   ├── repl.rules.ts    # /set バリデーション
│   ├── config.rules.ts  # 数値オプションバリデーション
│   └── errors.ts        # エラー定義（日本語メッセージ）
├── services/            # インフラ層（tmux操作、ファイルI/O）
│   ├── tmux.service.ts  # barrel re-export（後方互換）
│   ├── tmux-core.ts     # tmux(), sleep()
│   ├── tmux-pane.service.ts    # sendPrompt, capturePane, waitForCompletion
│   ├── tmux-session.service.ts # createSession, destroySession, startClaude/Codex
│   └── file.service.ts  # saveCodeToTempFile, cleanupTempFiles
├── orchestrator/        # ループ実行エンジン
│   ├── agent-loop.ts    # 自動ループ実行（セッション管理含む）
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

### 処理フロー

#### ランチャーモード（デフォルト: `ccf`）
1. 3ペイン tmux セッション作成（上=REPL, 下左=Claude, 下右=Codex）
2. 各ペインで Claude/Codex CLI を起動
3. REPL ペインで `--repl` モードを自己呼び出し
4. tmux セッションにアタッチ

#### REPL モード（`ccf --repl`）
1. CLI起動完了を待機（ポーリング）
2. ユーザー入力待ち（タスク入力 or スラッシュコマンド）
3. タスク入力 → LoopEngine でイテレーションサイクル実行
4. ループ一時停止時 → `/continue`, `/accept`, `/reject` で判断

#### 自動モード（`ccf "タスク"`）
1. CLI引数パース → `LoopConfig` 生成
2. tmux セッション作成（2ペイン: 左=Claude, 右=Codex）
3. 両CLIの起動完了を待機
4. LoopEngine でループ実行（APPROVED or 最大イテレーション到達まで）
5. 結果出力、`--keep-session` でセッション残存

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
