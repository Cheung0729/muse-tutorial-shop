// 公开配置（不含任何密钥）。订单内容在浏览器端用公钥加密后发送，只有店主的私有仓库能解密。
window.SHOP_CONFIG = {
  priceCny: 9.99,
  fallbackRate: 6.67,          // 1 USDT ≈ ? CNY，实时汇率获取失败时使用
  address: "0x7009219ea689a101aaf6a8e8284f83d5a688d0c8",
  usdtContract: "0x55d398326f99059fF775485246999027B3197955", // BSC-USD (BEP20), 18 decimals
  rpc: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
  orderEndpoint: "https://ntfy.sh/mo-e494690a65922dbf3067b347a6ed5331",
  orderPublicKey: {"kty":"RSA","n":"14vxTpl6L3JGprTT4_VkGs2bpxMUxsN0ak4qU-T70-EIOtbLhxoK3o-kNyinUyAxqcql5PTFgz591zX-qTVv-52CFvg0V4xtKXaLToTVgCsX-0YMrB64lgyX68pwrcGYcUXt2cXKzKFf4vEV5QHBQ1xJs_HNf8vqpKzrZp8kzchbOq-R5R1LAOV96xYatqPlenhtjWhqDhuy8MSeA6rN76CWGPcQvPexw7FDVcVrVjIwe6vDoPHhqqHshQvasH8BBYoOLk8ot7omLxzwOBCWcdiSrh0n6Ngvsy5puO4I3IsD5IT4whrry1ESiTcllsDxoUzEX5EHQu1N5JvuDd2fYw","e":"AQAB"}
};
