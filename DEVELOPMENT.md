# Mizuta MAP 開発状況

フロントエンドとバックエンドを分けて開発するための構成と、現在実装済みのバックエンド API をまとめています。

## 構成

- `frontend/`: 地図 UI。MapLibre GL JS を CDN から読み込みます。
- `backend/`: Node.js 標準ライブラリだけで動く API サーバーです。
- `data/mizutamari.geojson`: 既存の公式水たまりデータです。
- `mizutamari.html`: 既存の GitHub Pages 向け静的ページです。

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
- `GET /api/home/pins`
- `POST /api/puddles`
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

### AR

`POST /api/ar/water-detection` は AR 画面向けのレスポンス契約です。現段階では端末側または将来の画像判定処理から渡された `waterDetected`, `confidence`, `boundingBox` をもとに、水たまり上に重ねる魚の配置情報を返します。

`POST /api/puddles` で追加した投稿は `data/user-puddles.json` に保存されます。このファイルはローカル開発用のデータなので Git 管理から外しています。

## 静的配信時の動き

`frontend/` は API が使えない環境では `data/mizutamari.geojson` と `localStorage` にフォールバックします。GitHub Pages などバックエンドがない環境でも表示とブラウザ内投稿は動きます。
