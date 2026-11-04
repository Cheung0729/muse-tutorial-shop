# Muse 注册教程

静态店铺页面（GitHub Pages）。本仓库不含任何密钥：订单在浏览器端用公钥加密后提交。

- `status/<sha256(订单号:查询口令)>.json`：订单公开状态（只有 pending / paid / shipped 和更新时间，无任何个人信息），由私有订单仓库的工作流自动发布。
- 改了 index.html / app.js / style.css 等之后运行 `python3 build-all-in-one.py` 重新生成单文件版。
