# claude-plugins

No.4 の Claude Code プラグイン置き場（マーケットプレイス名: `no4-plugins`）です。

## 使い方

Claude Code の中でマーケットプレイスを追加し、使いたいプラグインをインストールします。

    /plugin marketplace add no4-co-jp/claude-plugins
    /plugin install <プラグイン名>@no4-plugins

## 更新

このマーケットプレイスは、既定では自動更新されません。どちらかの方法で更新してください。

- **自動更新を有効にする（おすすめ）**: `/plugin` →「Marketplaces」→ `no4-plugins` →
  「Enable auto-update」。以降はセッション開始後に自動で更新され、通知が出たら
  `/reload-plugins` で反映されます
- **手動で更新する**: `/plugin` →「Installed」から更新するか、ターミナルで以下を実行して
  Claude Code を再起動します（開いているセッションで `/reload-plugins` を実行しても反映されます）

      claude plugin update <プラグイン名>@no4-plugins

## 収録プラグイン

| プラグイン | 説明 |
| --- | --- |
| [usage-archive](plugins/usage-archive/README.md) | Claude Code / Codex の利用量を ccusage で集計し、月別 JSON としてローカルに保存します |

各プラグインの詳細は、それぞれの README を参照してください。

## プラグインの追加方法

1. `plugins/<プラグイン名>/` を作り、以下を置く

       plugins/<プラグイン名>/
       ├── .claude-plugin/plugin.json   # name / description / author など
       ├── README.md                    # そのプラグインの説明
       └── skills/ commands/ agents/ hooks/ など必要なもの

2. `.claude-plugin/marketplace.json` の `plugins` に追記する

       {
         "name": "<プラグイン名>",
         "source": "./plugins/<プラグイン名>",
         "description": "..."
       }

3. 上の「収録プラグイン」の表に1行追加する

`plugin.json` には `version` を書きません。Git のコミットがバージョン代わりになり、
`main` に push した内容は、利用者が次に更新したときに届きます（上の「更新」を参照）。
