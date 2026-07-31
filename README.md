# Mizuta MAP

水たまりを避けたい人も、向かいたい人も楽しめる、水たまり専用プラットフォーム。

## アプリの概要

## 主な機能

- HOME: 投稿をPOI形式で、画面中央のマップに表示。
- 投稿: 水たまりの写真、大きさ、透明度、観測日時を投稿でき、位置情報を共有していると、マップ上の現在地にPOI形式で投稿ができる。
- AR: 対応端末では WebXR hit-test で平面を検知し、`frontend/assets/fish/kajirare_fish.fbx` をぷかぷか表示する。

## 実行方法(使い方)

```sh
npm install
npm run dev
```

ブラウザで `http://127.0.0.1:3000` を開きます。

カメラとAR平面検知はHTTPS環境とブラウザ権限が必要です。GitHub PagesなどHTTPSで公開するとスマホ実機で試しやすくなります。

## 使用したデータ‧技術、ライセンス情報やライブラリ

- MapLibre GL JS
- Three.js
- WebXR hit-test
