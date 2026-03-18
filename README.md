# Claude x Codex Friends (ccf)

Claude Code と OpenAI Codex CLI を tmux 上で連携させ、「コード生成 → レビュー → 修正」のループを自動実行するオーケストレーションツール。

Claude がコードを生成し、Codex がレビューする対話サイクルを、承認（APPROVED）または最大イテレーション到達まで繰り返します。

## 前提条件

| 依存 | インストール |
|---|---|
| Node.js >= 18 | [nodejs.org](https://nodejs.org/) |
| tmux | `brew install tmux` |
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` |
| OpenAI Codex CLI | `npm install -g @openai/codex` |

すべてがインストール済みか確認:

```bash
node -v && tmux -V && which claude && which codex
```

## インストール

```bash
git clone <repository-url>
cd claude_codex_friends
npm install
npm run build
npm link     # ccf コマンドをグローバルに登録
```

## 使い方

### インタラクティブモード (推奨)

```bash
ccf
```

3ペインの tmux セッションが起動します:
- **上段**: REPL (操作パネル)
- **下左**: Claude Code
- **下右**: Codex CLI

REPL でタスクを入力すると、自動レビューループが開始されます。

### 自動モード

```bash
ccf "FizzBuzzを実装して" -l typescript -o fizzbuzz.ts
ccf "Quick sort in Python" -m 3 -o sort.py
```

バックグラウンドで tmux セッションを作成し、ループ完了後に結果を出力します。

### CLI オプション

| オプション | 説明 | デフォルト |
|---|---|---|
| `-l, --language <lang>` | プログラミング言語 | - |
| `-o, --output <path>` | 出力ファイルパス | - |
| `-m, --max-iterations <n>` | 最大イテレーション数 | 5 |
| `-t, --timeout <seconds>` | タイムアウト秒数 | 300 |
| `--poll-interval <ms>` | ポーリング間隔 (ms) | 3000 |
| `--keep-session` | 終了後も tmux セッションを残す | false |
| `--log <path>` | 履歴を JSON に保存 | - |

### REPL コマンド

| コマンド | 説明 |
|---|---|
| `<テキスト>` | タスクとして自動ループを開始 |
| `@claude <msg>` | Claude ペインに直接送信 |
| `@codex <msg>` | Codex ペインに直接送信 |
| `/continue [n]` | ループを n 回追加して継続 |
| `/accept` | 現在のコードを承認して終了 |
| `/reject` | コードを破棄して終了 |
| `/set [key] [value]` | 設定の表示・変更 |
| `/save [path]` | 前回の結果をファイルに保存 |
| `/export [path]` | 全履歴を JSON にエクスポート |
| `/status` | 両ペインの現在状態を表示 |
| `/history` | 実行履歴を表示 |
| `/last [--full]` | 前回の実行結果を表示 |
| `/help` | コマンド一覧を表示 |
| `/exit` | セッション終了 |

#### `/set` で変更可能な設定

| キー | 説明 | 例 |
|---|---|---|
| `language` | 言語 | `/set language python` |
| `max-iterations` | 最大イテレーション数 | `/set max-iterations 10` |
| `output` | 出力ファイルパス | `/set output ./result.ts` |
| `prompt-initial` | 初回プロンプトテンプレート | `/set prompt-initial "{{task}} in {{language}}"` |
| `prompt-review` | レビュープロンプトテンプレート | `/set prompt-review "Review: {{task}}"` |
| `prompt-fix` | 修正プロンプトテンプレート | `/set prompt-fix "Fix issues for {{task}}"` |

プロンプトテンプレートでは `{{task}}` と `{{language}}` がプレースホルダとして展開されます。

## トラブルシューティング

### `tmux がインストールされていません`

```bash
brew install tmux
```

### `claude` / `codex` コマンドが見つからない

PATH にコマンドが存在するか確認:

```bash
which claude   # パスが表示されればOK
which codex    # パスが表示されればOK
```

表示されない場合はインストールしてください:

```bash
npm install -g @anthropic-ai/claude-code   # Claude Code
npm install -g @openai/codex               # Codex CLI
```

### tmux セッションが残ってしまった

```bash
tmux kill-session -t ccf
```

### CLI が起動タイムアウトする

ネットワーク環境や認証状態を確認してください。タイムアウトを延長することもできます:

```bash
ccf "タスク" -t 600    # 10分に延長
```

## 開発

```bash
npm install              # 依存関係インストール
npm run dev              # CLI実行 (tsx src/index.ts)
npm run build            # TypeScript ビルド
npm run typecheck        # 型チェックのみ
npm test                 # テスト実行 (vitest)
npm run test:watch       # テスト監視モード
```

## アーキテクチャ

DDD/クリーンアーキテクチャに基づくレイヤー分離:

- **domain/**: 純粋関数・型定義 (外部依存なし)
- **services/**: インフラ層 (tmux 操作、ファイル I/O)
- **orchestrator/**: ループ実行エンジン (ステートマシン)
- **repl/**: REPL インターフェース
- **config/**: CLI 引数パース・デフォルト値
- **ui/**: ターミナル出力・色付き表示

## ライセンス

Private
