# usage-archive

Claude Code / Codex の利用量を、ローカルに1.5年分残すためのプラグインです。

Claude Code のセッションログは既定で30日後に削除されるため、消える前に ccusage で
集計して月別 JSON に落としておきます。会話本文やツール出力は保存しません。

## 導入

Claude Code の中で以下を実行してください。

    /plugin marketplace add no4-co-jp/claude-plugins
    /plugin install usage-archive@no4-plugins

設定ファイルの編集は不要で、Windows / macOS / Linux で同じ手順です。
Node.js 22.11.0 以上が必要です（ccusage 20 の動作条件）。

## 何が起きるか

- セッション開始時にフックが走り、前回実行から1日以上経っていれば
  バックグラウンドで ccusage を実行します（フック自体は数十msで返ります）
- 集計結果は `~/usage-archive/YYYY-MM.json` に保存されます（環境変数 `USAGE_ARCHIVE_DIR` で変更可）
- 20ヶ月より古いファイルは自動的に削除されます
- 実行記録は `~/usage-archive/run.log` に残ります

初回は `npx` が ccusage を取得するため少し時間がかかります。

## 保存形式

月ごとに1ファイルで、各行は「日×エージェント」単位です。

```json
{
  "month": "2026-08",
  "capturedAt": "2026-09-14T03:56:26.235Z",
  "rows": [
    { "period": "2026-08-01", "agent": "claude", "totalTokens": 12391088, "totalCost": 12.83, "modelBreakdowns": [...] },
    { "period": "2026-08-01", "agent": "codex", "totalTokens": 103078305, "totalCost": 54.96, "modelBreakdowns": [...] }
  ]
}
```

日ごとの合計は、同じ `period` の行を足し合わせて求めてください。

ccusage から見えなくなった日（ログが削除された日）の行はそのまま残ります。
同じ日・同じエージェントの行は、トークン数が多い方で更新されます。

## 確認

    cat ~/usage-archive/run.log
    ls ~/usage-archive

## 手動実行

    node <plugin>/scripts/archive-usage.mjs

## Codex しか使わない場合

Codex のセッションログは自動削除されないので、このプラグインは必須ではありません。
それでも残したい場合は `~/.codex/config.toml` に以下を追加してください。

    notify = ["node", "/absolute/path/to/archive-usage.mjs", "--hook"]

引数の `--hook` は必ず入れてください（Codex が最後の引数に JSON を追加するため）。
