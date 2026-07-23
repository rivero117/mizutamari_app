# Mizuta_MAP

水たまりマップを、フロントエンドとバックエンドを分けて開発できる形に整理した構成です。

## アプリの概要

## 主な機能

- HOME: 水たまり投稿をマップに表示
- 投稿: 写真、透明度、大きさ、観測日時を保存
- AR: 対応端末では WebXR hit-test で平面を検知し、`frontend/assets/fish/kajirare_fish.fbx` をぷかぷか表示
- AR非対応端末: カメラ映像の上でタップ位置に魚を仮配置

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
