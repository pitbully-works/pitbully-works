# 資産形成 総合ライフプラン

NISA積立・老後資産・年金・健康費用・生命保険・相続などを統合したライフプランシミュレーターです。

## 公開手順（GitHub + Vercel）

### 1. GitHubにアップロード
1. https://github.com にログイン（アカウントがなければ新規作成）
2. 右上の「+」→「New repository」
3. リポジトリ名を入力（例：`nisa-lifeplan`）→「Create repository」
4. リポジトリ画面で「uploading an existing file」（または Code ボタン横の「...」→「Upload file」）をタップ
5. このフォルダの中身を**すべて一度に**選択してアップロード（フォルダ分けは不要、全ファイルが同じ階層にあります）
   - `node_modules` フォルダは含めないでください（通常は含まれていません）
6. 「Commit changes」をタップ

### 2. Vercelでデプロイ
1. https://vercel.com にアクセスし、「Continue with GitHub」でログイン
2. 「Add New...」→「Project」
3. 先ほど作成したリポジトリを選択 →「Import」
4. Framework Preset が自動的に「Vite」と認識されるはずです（されない場合は手動で選択）
5. そのまま「Deploy」をクリック
6. 数十秒〜数分でビルドが完了し、`https://プロジェクト名.vercel.app` のようなURLが発行されます

### 3. 更新する場合
GitHub上のファイルを更新すると、Vercelが自動的に再ビルド・再公開します（都度の手動操作は不要です）。

## ローカルで動作確認したい場合
Node.js（18以上推奨）がインストールされた環境で：

```bash
npm install
npm run dev
```

## 注意事項
- データはブラウザの localStorage に保存されます（ユーザーごと・端末ごとに保存されるため、他の人とは共有されません）
- 本ツールは概算シミュレーションであり、投資・税務・保険に関する助言ではありません
- 複数人が使う本格公開を考える場合は、免責事項やプライバシーポリシーの整備を別途ご検討ください
