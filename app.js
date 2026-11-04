(function () {
  "use strict";
  var C = window.SHOP_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var state = { rate: C.fallbackRate, usdt: null, rateSource: "fallback" };

  $("yr").textContent = new Date().getFullYear();
  $("addr").textContent = C.address;

  // ---------- QR ----------
  try {
    var qr = qrcode(0, "M");
    qr.addData(C.address);
    qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch (e) { $("qr").textContent = "二维码生成失败，请直接复制地址"; }

  // ---------- Copy ----------
  function flash(msg, ok) {
    var el = $("copyMsg"); el.textContent = msg; el.style.color = ok ? "" : "#d64545";
    clearTimeout(flash.t); flash.t = setTimeout(function () { el.textContent = ""; }, 2500);
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta); return ok;
  }
  $("copyBtn").addEventListener("click", function () {
    var t = C.address;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(t).then(function () { flash("✓ 地址已复制", true); },
        function () { var ok = fallbackCopy(t); flash(ok ? "✓ 地址已复制" : "复制失败，请长按地址手动复制", ok); });
    } else {
      var ok = fallbackCopy(t); flash(ok ? "✓ 地址已复制" : "复制失败，请长按地址手动复制", ok);
    }
  });

  // ---------- Rate ----------
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]);
  }
  function getJson(url) { return withTimeout(fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }), 5000); }
  function sane(r) { return typeof r === "number" && r > 4 && r < 12; }
  function render() {
    var usdt = Math.ceil((C.priceCny / state.rate) * 100 - 1e-9) / 100;
    state.usdt = usdt.toFixed(2);
    $("usdt").textContent = state.usdt;
    Array.prototype.forEach.call(document.querySelectorAll(".amt-inline"), function (el) { el.textContent = state.usdt; });
    var src = { coingecko: "CoinGecko 实时汇率", fx: "美元汇率（USDT≈USD）", fallback: "参考汇率（实时汇率暂不可用）" }[state.rateSource];
    $("rateNote").textContent = "¥" + C.priceCny + " ÷ " + state.rate.toFixed(4) + "（" + src + "），向上取整";
  }
  render();
  getJson("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny")
    .then(function (j) { var r = j && j.tether && j.tether.cny; if (!sane(r)) throw new Error("bad"); state.rate = r; state.rateSource = "coingecko"; })
    .catch(function () {
      return getJson("https://open.er-api.com/v6/latest/USD").then(function (j) {
        var r = j && j.rates && j.rates.CNY; if (!sane(r)) throw new Error("bad"); state.rate = r; state.rateSource = "fx";
      });
    })
    .catch(function () { state.rateSource = "fallback"; })
    .then(render);

  // ---------- On-chain pre-check ----------
  var TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  function rpc(method, params) {
    var urls = C.rpc.slice();
    function next() {
      var u = urls.shift(); if (!u) return Promise.reject(new Error("rpc unavailable"));
      return withTimeout(fetch(u, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) })
        .then(function (r) { return r.json(); }), 6000)
        .then(function (j) { if (j.error) throw new Error(j.error.message); return j.result; })
        .catch(next);
    }
    return next();
  }
  function checkTx(hash) {
    return rpc("eth_getTransactionReceipt", [hash]).then(function (rc) {
      if (!rc) return { status: "pending" };
      if (rc.status !== "0x1") return { status: "failed" };
      var to = "0x" + C.address.slice(2).toLowerCase().padStart(64, "0");
      var total = 0n;
      (rc.logs || []).forEach(function (l) {
        if (l.address.toLowerCase() === C.usdtContract.toLowerCase() && l.topics[0] === TRANSFER && l.topics[2] && l.topics[2].toLowerCase() === to)
          total += BigInt(l.data);
      });
      if (total === 0n) return { status: "mismatch" };
      var paid = Number(total / 10n ** 14n) / 10000; // 18 decimals -> 4 dp
      return { status: "found", paid: paid };
    }).catch(function () { return { status: "unknown" }; });
  }

  // ---------- Encrypt & submit ----------
  function b64(buf) { var s = "", b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function encrypt(obj) {
    var enc = new TextEncoder().encode(JSON.stringify(obj));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return Promise.all([
      crypto.subtle.importKey("jwk", C.orderPublicKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]),
      crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"])
    ]).then(function (k) {
      return Promise.all([
        crypto.subtle.exportKey("raw", k[1]).then(function (raw) { return crypto.subtle.encrypt({ name: "RSA-OAEP" }, k[0], raw); }),
        crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k[1], enc)
      ]);
    }).then(function (r) { return JSON.stringify({ v: 1, k: b64(r[0]), iv: b64(iv), c: b64(r[1]) }); });
  }
  function orderId() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    var a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(4)), s = "";
    for (var i = 0; i < 4; i++) s += a[r[i] % a.length];
    return "M" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + s;
  }
  function msg(html, cls) { var el = $("formMsg"); el.className = "form-msg " + (cls || ""); el.innerHTML = html; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  $("orderForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("email").value.trim(), tx = $("tx").value.trim().toLowerCase(), note = $("note").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return msg("请填写正确的邮箱地址。", "err");
    if (!/^0x[0-9a-f]{64}$/.test(tx)) return msg("交易哈希格式不对：应为 0x 开头、共 66 位的字符串。", "err");
    var btn = $("submitBtn"); btn.disabled = true; btn.textContent = "正在核对交易…"; msg("");
    checkTx(tx).then(function (chk) {
      if (chk.status === "failed") throw { user: "这笔交易在链上显示失败，请确认转账成功后再提交。" };
      if (chk.status === "mismatch") throw { user: "这笔交易里没有找到转入本店地址的 USDT（BEP20）。请检查网络、币种和交易哈希是否正确。" };
      btn.textContent = "正在提交…";
      var id = orderId();
      var order = { id: id, email: email, tx: tx, note: note, priceCny: C.priceCny, quotedUsdt: state.usdt,
        rate: state.rate, rateSource: state.rateSource, precheck: chk, createdAt: new Date().toISOString() };
      return encrypt(order).then(function (body) {
        return withTimeout(fetch(C.orderEndpoint, { method: "POST", body: body }), 10000);
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        var extra = chk.status === "found"
          ? (chk.paid + 1e-9 >= Number(state.usdt) * 0.98 ? "链上已查到你的转账（" + chk.paid + " USDT）。" : "链上查到转账 " + chk.paid + " USDT，少于应付金额，可能需要补差额。")
          : "交易暂未在链上查到，可能仍在确认中，我们会再次核对。";
        msg("<b>✓ 订单已提交</b><br>订单号：<b>" + esc(id) + "</b>（请截图保存）<br>" + esc(extra) + "<br>确认到账后，教程会发送到 <b>" + esc(email) + "</b>，一般 24 小时内。", "ok");
        $("orderForm").reset();
      });
    }).catch(function (err) {
      msg(err && err.user ? esc(err.user) : "提交失败，请检查网络后重试。", "err");
    }).then(function () { btn.disabled = false; btn.textContent = "提交订单"; });
  });
})();
