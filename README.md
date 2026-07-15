# Mizuta　MAP

水たまりマップを、フロントエンドとバックエンドを分けて開発できる形に整理した構成です。

## アプリの概要

## 主な機能

## 実行方法(使い方)

## 使用したデータ‧技術、ライセンス情報やライブラリ



-----------------------------------------------------------------------------------------------------------------------------------------
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

## API

- `GET /api/health`
- `GET /api/puddles`
- `POST /api/puddles`
- `DELETE /api/puddles/user`

`POST /api/puddles` で追加した投稿は `data/user-puddles.json` に保存されます。このファイルはローカル開発用のデータなので Git 管理から外しています。

## 静的配信時の動き

`frontend/` は API が使えない環境では `data/mizutamari.geojson` と `localStorage` にフォールバックします。GitHub Pages などバックエンドがない環境でも表示とブラウザ内投稿は動きます。
