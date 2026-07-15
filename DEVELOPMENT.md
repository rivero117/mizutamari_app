# Mizuta MAP 開発状況

[`仕様書.md`](./仕様書.md) を基準に、フロントエンドとバックエンドを分けて開発するための構成、担当境界、現在実装済みの API をまとめています。

## 構成

- `frontend/`: 地図 UI。MapLibre GL JS を CDN から読み込みます。
- `frontend/features/home/`: HOME、検索、ピン詳細、経路連携（担当A）。
- `frontend/features/post/`: 投稿フォーム、位置情報、投稿データ変換（担当B）。
- `frontend/features/ar/`: AR 表示と魚の配置（担当C）。
- `frontend/shared/`: 各画面から利用する投稿データ変換。
- `backend/`: Node.js 標準ライブラリだけで動く API サーバーです。
- `shared/puddle-post.schema.json`: 3担当とバックエンドで共有する投稿データ契約。
- `data/mizutamari.geojson`: 既存の公式水たまりデータです。
- `mizutamari.html`: 既存の GitHub Pages 向け静的ページです。

## 初期版の決定

仕様書の「判断が必要な点」は、初期版では以下に統一します。

| 項目 | 決定 |
| --- | --- |
| 透明度 | `1`（不透明）〜 `5`（透明）の整数 |
| 大きさ | 直径 cm。データ名は `size` |
| 保存先 | GitHub Pages では `localStorage`、ローカルサーバーでは JSON ファイル |
| AR の魚 | タップ位置。未指定時は画面中央 |
| 1週間表示の基準 | `observedAt`（観測日時） |

## 共通データ契約

新規機能では以下のフィールド名を使用します。完全な定義は `shared/puddle-post.schema.json` を参照してください。

```json
{
  "id": "post-001",
  "lat": 33.9743512,
  "lng": 134.3612004,
  "size": 242,
  "transparency": 5,
  "observedAt": "2026-07-15T10:00:00+09:00",
  "image": "path-or-data-url",
  "comment": "",
  "depth": "",
  "weather": "",
  "createdAt": "2026-07-15T10:05:00+09:00"
}
```

既存画面が利用している `latitude`, `longitude`, `diameterCm`, `turbidity`, `review`, `photoDataUrl` は、移行期間中も削除しません。新規の `/api/posts` が仕様書形式を担当し、既存の `/api/puddles` は互換APIとして維持します。

## 分業ルール

- 担当Aは `frontend/features/home/` を中心に変更する。
- 担当Bは `frontend/features/post/` を中心に変更する。
- 担当Cは `frontend/features/ar/` と画面統合を中心に変更する。
- データ項目を変更するときは、先に `shared/puddle-post.schema.json` と変換テストを更新する。
- `frontend/app.js` は現在の統合画面を維持するため、複数担当が同時に大きく変更しない。
- 既存APIを削除・改名せず、新しい契約は新規ルートまたは変換関数として追加する。

## 開発サーバー

```bash
npm run dev
```

起動後、以下を開きます。

```text
http://127.0.0.1:3000
```

## GitHub Pages

公開URL:

```text
https://rivero117.github.io/mizutamari_app/
```

`main` ブランチのリポジトリ直下が公開元です。ルートの `index.html` と既存の `mizutamari.html` は、静的配信用の `frontend/` へ遷移します。

## 実装済み API

- `GET /api/health`
- `GET /api/puddles`
- `GET /api/posts`
- `GET /api/home/pins`
- `POST /api/puddles`
- `POST /api/posts`
- `GET /api/puddles/:id/directions`
- `DELETE /api/puddles/user`
- `POST /api/ar/water-detection`

### HOME

`GET /api/home/pins` はスマホアプリの HOME 画面向けのピン一覧を返します。

デフォルトでは過去 1 週間の観測データだけを返します。検索・絞り込み用に以下のクエリを使えます。

- `recentDays`: 何日前まで表示するか。デフォルトは `7`
- `turbidity`: `clear`, `cloudy`, `muddy`
- `minDiameterCm`
- `maxDiameterCm`
- `q`: レビューやメモなどの全文検索

レスポンスの各ピンには、ポップアップ表示用の `size`, `diameterCm`, `transparency`, `observedAt` と、Google Maps 経路へ遷移する `googleMapsUrl` が含まれます。

### 投稿

`POST /api/puddles` は投稿画面向けの API です。

```json
{
  "longitude": 134.361,
  "latitude": 33.974,
  "diameterCm": 120,
  "turbidity": "cloudy",
  "review": "水たまりレビュー",
  "cameraPhotoDataUrl": "data:image/png;base64,..."
}
```

投稿されたデータはマップのピンとして使える形式に正規化されます。

仕様書形式を使用する新規実装は `POST /api/posts` を利用します。

```json
{
  "lat": 33.9743512,
  "lng": 134.3612004,
  "size": 242,
  "transparency": 5,
  "observedAt": "2026-07-15T10:00:00+09:00",
  "image": "data:image/png;base64,...",
  "comment": "水たまりを観測"
}
```

### AR

`POST /api/ar/water-detection` は AR 画面向けのレスポンス契約です。現段階では端末側または将来の画像判定処理から渡された `waterDetected`, `confidence`, `boundingBox` をもとに、水たまり上に重ねる魚の配置情報を返します。

`POST /api/puddles` で追加した投稿は `data/user-puddles.json` に保存されます。このファイルはローカル開発用のデータなので Git 管理から外しています。

## 静的配信時の動き

`frontend/` は API が使えない環境では `data/mizutamari.geojson` と `localStorage` にフォールバックします。GitHub Pages などバックエンドがない環境でも表示とブラウザ内投稿は動きます。

## 仕様書 11 章対応メモ

`index.html` は `screen-home`, `screen-post`, `screen-ar` と `app-footer` の共通構造に合わせています。

- A 担当 HOME: `#screen-home`, `loadPosts()`, `renderPins(posts)`, `refreshHome()`, `openGoogleMaps(lat, lng)`
- B 担当 投稿: `#screen-post`, `savePost(post)`, `showScreen("home")`
- C 担当 AR/フッター: `#screen-ar`, `#app-footer`, `showScreen(screenName)`, `startCamera(mode)`, `stopCamera()`

投稿の共通保存キーは `mizutaPosts` です。旧キー `ameato_user_puddle_posts_v11` は初回読み込み時に `mizutaPosts` へ移行します。

HOME に表示する投稿は `observedAt` が過去 1 週間以内のものだけです。ピン詳細には大きさ、透明度、観測日時、経路ボタンだけを表示し、座標は表示しません。

ローカル API が使える場合、投稿画面は仕様書形式の `POST /api/posts` を優先します。API が使えない場合は `mizutaPosts` だけに保存します。
