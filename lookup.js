// 订单查询：订单号 + 查询口令 → sha256 → 公开状态文件 status/<hash>.json（只含 status 和 updatedAt）。
(function (root) {
  "use strict";
  var ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function normId(s) { return String(s || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, ""); }
  function normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function newCode(n) {
    n = n || 10; var r = root.crypto.getRandomValues(new Uint8Array(n)), s = "";
    for (var i = 0; i < n; i++) s += ALPHA[r[i] % ALPHA.length];
    return s;
  }
  function hex(buf) { var b = new Uint8Array(buf), s = ""; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16); return s; }
  function hash(id, code) {
    return root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normId(id) + ":" + normCode(code))).then(hex);
  }
  // 从订单凭证全文中识别订单号与查询口令
  function parseCredential(text) {
    text = String(text || "");
    var id = (text.match(/(?:订单号|Order\s*ID)[^:：\n]*[:：]\s*([A-Za-z0-9-]{6,40})/i) || [])[1];
    var code = (text.match(/(?:查询口令|Query\s*code)[^:：\n]*[:：]\s*([A-Za-z0-9 -]{6,40})/i) || [])[1];
    if (!id) id = (text.match(/\bM(?:\d{8}|TEST)-[0-9A-Z]+\b/i) || [])[0];
    return { id: id ? normId(id) : "", code: code ? normCode(code) : "" };
  }
  function timeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]);
  }
  // 返回 {kind:"found", status, updatedAt, url} | {kind:"notfound"} | {kind:"error"}
  function fetchStatus(id, code, bases, opts) {
    opts = opts || {};
    var f = opts.fetch || root.fetch.bind(root);
    return hash(id, code).then(function (h) {
      var list = bases.slice(), saw404 = false;
      function next() {
        var base = list.shift();
        if (!base) return saw404 ? { kind: "notfound", hash: h } : { kind: "error", hash: h };
        var url = base + h + ".json";
        return timeout(f(url + "?t=" + Date.now(), { cache: "no-store" }), opts.timeoutMs || 8000).then(function (r) {
          if (r.status === 404) { saw404 = true; return next(); }
          if (!r.ok) return next();
          return r.json().then(function (j) {
            if (!j || ["pending", "paid", "shipped"].indexOf(j.status) < 0) return next();
            return { kind: "found", status: j.status, updatedAt: j.updatedAt || null, url: url, hash: h };
          });
        }, function () { return next(); });
      }
      return next();
    });
  }
  var api = { normId: normId, normCode: normCode, newCode: newCode, hash: hash, parseCredential: parseCredential, fetchStatus: fetchStatus };
  root.MuseLookup = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
