(function () {
  "use strict";
  var C = window.SHOP_CONFIG, I = window.I18N, L = window.MuseLookup, t = I.t;
  var $ = function (id) { return document.getElementById(id); };
  var state = { rate: C.fallbackRate, usdt: null, rateSource: "fallback", method: "alipay", agreed: false, pending: null, productId: C.defaultProduct };
  function productById(id) {
    var list = C.products || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }
  function currentProduct() { return productById(state.productId); }
  function setProduct(id) {
    var p = productById(id);
    if (!p) return;
    state.productId = p.id;
    Array.prototype.forEach.call(document.querySelectorAll(".product"), function (btn) {
      var on = btn.getAttribute("data-product") === p.id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    render();
  }
  var RECENT_KEY = "museOrders";

  $("yr").textContent = new Date().getFullYear();
  $("addr").textContent = C.address;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------- 语言 ----------
  var views = []; // 语言切换时需要重绘的动态内容
  function onLang(fn) { views.push(fn); }
  I.onChange(function () { views.forEach(function (fn) { fn(); }); });
  $("langBtn").addEventListener("click", function () { I.set(I.lang === "zh" ? "en" : "zh"); });
  function fmtTime(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    try { return d.toLocaleString(I.lang === "zh" ? "zh-CN" : "en-US", { timeZone: "Asia/Shanghai", hour12: false }) + (I.lang === "zh" ? "（北京时间）" : " (Beijing time)"); }
    catch (e) { return d.toISOString(); }
  }

  // ---------- USDT 收款 ----------
  var qrOk = true;
  try {
    var qr = qrcode(0, "M"); qr.addData(C.address); qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch (e) { qrOk = false; }
  onLang(function () { if (!qrOk) $("qr").textContent = t("usdt.qrFail"); });

  function flash(key, ok) {
    var el = $("copyMsg"); el.textContent = t(key); el.style.color = ok ? "" : "#d64545";
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
    var tx = C.address;
    var done = function (ok) { flash(ok ? "usdt.copied" : "usdt.copyFail", ok); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(tx).then(function () { done(true); }, function () { done(fallbackCopy(tx)); });
    else done(fallbackCopy(tx));
  });

  function setMethod(method) {
    state.method = method;
    var isAlipay = method === "alipay";
    $("payAlipay").classList.toggle("hidden", !isAlipay);
    $("payUsdt").classList.toggle("hidden", isAlipay);
    $("stepsAlipay").classList.toggle("hidden", !isAlipay);
    $("stepsUsdt").classList.toggle("hidden", isAlipay);
    $("txLabel").classList.toggle("hidden", isAlipay);
    $("alipayNoteLabel").classList.toggle("hidden", !isAlipay);
    $("tx").required = !isAlipay;
    $("alipayInfo").required = isAlipay;
    Array.prototype.forEach.call(document.querySelectorAll(".method"), function (btn) {
      var on = btn.getAttribute("data-method") === method;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    msg(null);
  }
  Array.prototype.forEach.call(document.querySelectorAll(".method"), function (btn) {
    btn.addEventListener("click", function () { setMethod(btn.getAttribute("data-method")); });
  });

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]);
  }
  function getJson(url) { return withTimeout(fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }), 5000); }
  function sane(r) { return typeof r === "number" && r > 4 && r < 12; }
  var rateLoaded = false;
  function render() {
    var p = currentProduct();
    var price = p.priceCny;
    var usdt = Math.ceil((price / state.rate) * 100 - 1e-9) / 100;
    state.usdt = usdt.toFixed(2);
    $("usdt").textContent = state.usdt;
    Array.prototype.forEach.call(document.querySelectorAll(".amt-inline"), function (el) { el.textContent = state.usdt; });
    Array.prototype.forEach.call(document.querySelectorAll(".price-cny"), function (el) { el.textContent = "¥" + price; });
    Array.prototype.forEach.call(document.querySelectorAll(".product-label"), function (el) { el.textContent = p.name; });
    if ($("pickNote")) $("pickNote").textContent = t("buy.selected", { name: p.name, price: price });
    $("rateNote").textContent = rateLoaded
      ? t("rate.note", { price: price, rate: state.rate.toFixed(4), src: t("rate." + state.rateSource) })
      : t("usdt.rateLoading");
  }
  onLang(render);
  getJson("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny")
    .then(function (j) { var r = j && j.tether && j.tether.cny; if (!sane(r)) throw new Error("bad"); state.rate = r; state.rateSource = "coingecko"; })
    .catch(function () {
      return getJson("https://open.er-api.com/v6/latest/USD").then(function (j) {
        var r = j && j.rates && j.rates.CNY; if (!sane(r)) throw new Error("bad"); state.rate = r; state.rateSource = "fx";
      });
    })
    .catch(function () { state.rateSource = "fallback"; })
    .then(function () { rateLoaded = true; render(); });

  var TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  function rpc(method, params) {
    var urls = C.rpc.slice();
    function next() {
      var u = urls.shift(); if (!u) return Promise.reject(new Error("rpc unavailable"));
      return withTimeout(fetch(u, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) })
        .then(function (r) { return r.json(); }), 6000)
        .then(function (j) { if (j.error) throw new Error(j.error.message); return j.result; })
        .catch(function () { return next(); });
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
      var paid = Number(total / 10n ** 14n) / 10000;
      return { status: "found", paid: paid };
    }).catch(function () { return { status: "unknown" }; });
  }

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
    return "M" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + L.newCode(4);
  }

  // 表单提示：保存“渲染函数”，切换语言时重绘
  function msg(fn, cls) {
    var el = $("formMsg");
    msg.cur = fn ? { fn: fn, cls: cls } : null;
    el.className = "form-msg " + (fn ? cls || "" : "");
    el.innerHTML = fn ? fn() : "";
  }
  function msgKey(key, cls) { msg(function () { return esc(t(key)); }, cls); }
  onLang(function () { if (msg.cur) msg(msg.cur.fn, msg.cur.cls); });

  // ---------- 购买须知：倒计时 5 秒后才能勾选 ----------
  var waitLeft = 5, timerStarted = false;
  function renderAgree() {
    $("agreeText").textContent = waitLeft > 0 ? t("notice.wait", { n: waitLeft }) : t("notice.agree");
    $("agree").disabled = waitLeft > 0;
    $("agreeLabel").classList.toggle("locked", waitLeft > 0);
    $("submitBtn").disabled = !(state.agreed && waitLeft <= 0) || !!state.busy;
  }
  onLang(renderAgree);
  function startTimer() {
    if (timerStarted) return; timerStarted = true;
    var iv = setInterval(function () { waitLeft--; renderAgree(); if (waitLeft <= 0) clearInterval(iv); }, 1000);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (ents) { if (ents.some(function (e) { return e.isIntersecting; })) { startTimer(); io.disconnect(); } }, { threshold: 0.5 });
    io.observe($("notice"));
  } else startTimer();
  $("agree").addEventListener("change", function () { state.agreed = $("agree").checked; renderAgree(); });
  function busy(on, key) {
    state.busy = on; renderAgree();
    $("submitBtn").textContent = t(key || "f.submit");
  }

  // ---------- 确认弹窗 ----------
  function colon() { return I.lang === "zh" ? "：" : ": "; }
  function methodName(m) { return t(m === "alipay" ? "m.alipay" : "m.usdt"); }
  function chkText(o) {
    var c = o.precheck || {};
    if (c.status === "found") return c.paid + 1e-9 >= Number(o.quotedUsdt) * 0.98 ? t("chk.found", { paid: c.paid }) : t("chk.under", { paid: c.paid });
    return t("chk.pending");
  }
  function renderConfirm() {
    var o = state.pending; if (!o) return;
    var rows = [[t("cf.product"), o.productName || ""],
      [t("cf.method"), methodName(o.method)],
      [t("cf.amount"), o.method === "alipay" ? "¥" + o.priceCny : o.quotedUsdt + " USDT (≈ ¥" + o.priceCny + ")"],
      [t("cf.email"), o.email]];
    if (o.method === "alipay") rows.push([t("cf.ali"), o.alipayInfo]);
    else { rows.push([t("cf.tx"), o.tx]); rows.push([t("cf.chk"), chkText(o)]); }
    if (o.note) rows.push([t("cf.note"), o.note]);
    $("cfList").innerHTML = rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("");
  }
  onLang(renderConfirm);
  function openConfirm(o) { state.pending = o; renderConfirm(); $("confirm").classList.remove("hidden"); document.body.classList.add("noscroll"); $("cfOk").focus(); }
  function closeConfirm() { state.pending = null; $("confirm").classList.add("hidden"); document.body.classList.remove("noscroll"); }
  $("cfBack").addEventListener("click", function () { closeConfirm(); busy(false); });
  $("confirm").addEventListener("click", function (e) { if (e.target === $("confirm")) { closeConfirm(); busy(false); } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state.pending) { closeConfirm(); busy(false); } });

  // ---------- 订单凭证 & 最近订单 ----------
  function credentialText(r) {
    var zh = I.dict.zh, en = I.dict.en;
    var line = function (k, v) { return zh[k] + " " + en[k] + ": " + v; };
    return [zh["cred.title"], en["cred.title"], "",
      line("cred.id", r.id), line("cred.code", r.code),
      line("cred.product", r.productName || ""),
      line("cred.method", (r.method === "alipay" ? zh["m.alipay"] + " / " + en["m.alipay"] : "USDT (BEP20)")),
      line("cred.amount", r.method === "alipay" ? "¥" + r.priceCny : r.quotedUsdt + " USDT (≈ ¥" + r.priceCny + ")"),
      line("cred.time", new Date(r.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) + " (北京时间 Beijing time)"),
      line("cred.url", C.siteUrl + "#lookup"), "",
      zh["cred.note"], en["cred.note"], ""].join("\r\n");
  }
  function download(r) {
    try {
      var blob = new Blob(["\ufeff" + credentialText(r)], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "Muse订单凭证-" + r.id + ".txt";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (e) {}
  }
  function loadRecent() { try { var a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveRecent(a) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 20))); } catch (e) {} }
  function addRecent(r) { var a = loadRecent().filter(function (x) { return x.id !== r.id; }); a.unshift(r); saveRecent(a); renderRecent(); }
  var recentStatus = {};
  function statusLine(res) {
    if (res.kind === "found") return t("lk." + res.status) + (res.updatedAt ? " " + t("lk.updated", { t: fmtTime(res.updatedAt) }) : "");
    return t(res.kind === "notfound" ? "lk.notfound" : "lk.error");
  }
  function renderRecent() {
    var a = loadRecent(), el = $("recentList");
    if (!a.length) { el.innerHTML = '<p class="muted small">' + esc(t("lk.recentEmpty")) + "</p>"; return; }
    el.innerHTML = a.map(function (r, i) {
      var st = recentStatus[r.id];
      return '<div class="recent-item"><div class="ri-main"><b>' + esc(r.id) + '</b><span class="muted small">' + esc((r.productName ? r.productName + " · " : "") + methodName(r.method)) + " · " + esc(fmtTime(r.createdAt)) + "</span>" +
        (st ? '<span class="ri-status st-' + esc(st.kind === "found" ? st.status : st.kind) + '">' + esc(statusLine(st)) + "</span>" : "") +
        '</div><div class="ri-actions"><button type="button" class="btn small" data-act="check" data-i="' + i + '">' + esc(t("lk.check")) + '</button>' +
        '<button type="button" class="btn small ghost" data-act="dl" data-i="' + i + '" title="' + esc(t("ok.download")) + '">⬇︎</button>' +
        '<button type="button" class="btn small ghost" data-act="rm" data-i="' + i + '" title="' + esc(t("lk.remove")) + '">✕</button></div></div>';
    }).join("");
  }
  onLang(renderRecent);
  $("recentList").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    var a = loadRecent(), r = a[+b.getAttribute("data-i")]; if (!r) return;
    var act = b.getAttribute("data-act");
    if (act === "dl") return download(r);
    if (act === "rm") { if (confirm(t("lk.removeAsk"))) { saveRecent(a.filter(function (x) { return x.id !== r.id; })); delete recentStatus[r.id]; renderRecent(); } return; }
    $("lkId").value = r.id; $("lkCode").value = r.code; $("lkPaste").value = "";
    doLookup(r.id, r.code);
  });

  // ---------- 查询订单 ----------
  function lkMsg(fn, cls) { var el = $("lkMsg"); lkMsg.cur = fn ? { fn: fn, cls: cls } : null; el.className = "form-msg " + (fn ? cls || "" : ""); el.innerHTML = fn ? fn() : ""; }
  onLang(function () { if (lkMsg.cur) lkMsg(lkMsg.cur.fn, lkMsg.cur.cls); });
  function doLookup(id, code) {
    var btn = $("lkBtn"); btn.disabled = true; btn.textContent = t("lk.loading"); lkMsg(null);
    return L.fetchStatus(id, code, C.statusUrls).then(function (res) {
      recentStatus[L.normId(id)] = res; renderRecent();
      var cls = res.kind === "found" ? (res.status === "pending" ? "info" : "ok") : (res.kind === "notfound" ? "info" : "err");
      lkMsg(function () { return "<b>" + esc(L.normId(id)) + "</b><br>" + esc(statusLine(res)); }, cls);
      return res;
    }).catch(function () { lkMsg(function () { return esc(t("lk.error")); }, "err"); })
      .then(function (res) { btn.disabled = false; btn.textContent = t("lk.btn"); return res; });
  }
  $("lkPaste").addEventListener("input", function () {
    var p = L.parseCredential($("lkPaste").value);
    if (p.id) $("lkId").value = p.id;
    if (p.code) $("lkCode").value = p.code;
    if (p.id && p.code) lkMsg(function () { return esc(t("lk.parsed")); }, "info");
  });
  $("lookupForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var p = L.parseCredential($("lkPaste").value);
    var id = L.normId($("lkId").value || p.id), code = L.normCode($("lkCode").value || p.code);
    if (!id || code.length < 6) return lkMsg(function () { return esc(t("lk.need")); }, "err");
    doLookup(id, code);
  });
  (function () { var m = location.hash.match(/^#lookup[=:]([A-Za-z0-9-]+)/); if (m) $("lkId").value = L.normId(m[1]); })();

  // ---------- 提交订单 ----------
  function send(o) {
    busy(true, "f.submitting");
    return encrypt(o).then(function (body) {
      return withTimeout(fetch(C.orderEndpoint, { method: "POST", body: body }), 10000);
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      var rec = { id: o.id, code: o.queryCode, method: o.method, productId: o.productId, productName: o.productName, priceCny: o.priceCny, quotedUsdt: o.quotedUsdt, createdAt: o.createdAt };
      addRecent(rec);
      download(rec);
      $("orderForm").reset(); state.agreed = false;
      setMethod(o.method); // 会清空提示，所以放在显示成功信息之前
      var email = o.email, extra = o.method === "alipay" ? function () { return esc(t("ok.ali", { price: o.priceCny })); } : function () { return esc(chkText(o)); };
      msg(function () {
        return "<b>" + esc(t("ok.title")) + "</b>" +
          '<div class="cred"><div>' + esc(t("ok.id")) + colon() + "<b>" + esc(o.id) + "</b></div><div>" + esc(t("ok.code")) + colon() + "<b class=\"mono\">" + esc(o.queryCode) + "</b></div></div>" +
          esc(t("ok.saved")) + "<br>" + extra() + "<br>" + t("ok.ship", { email: esc(email) }) +
          '<div class="ok-actions"><button type="button" class="btn small" id="okDl">' + esc(t("ok.download")) + '</button> <a class="btn small ghost" href="#lookup" id="okLk">' + esc(t("ok.lookup")) + "</a></div>";
      }, "ok");
    });
  }
  $("formMsg").addEventListener("click", function (e) {
    if (e.target.id === "okDl") { var a = loadRecent(); if (a[0]) download(a[0]); }
    if (e.target.id === "okLk") { var b = loadRecent()[0]; if (b) { $("lkId").value = b.id; $("lkCode").value = b.code; setTimeout(function () { doLookup(b.id, b.code); }, 50); } }
  });

  $("cfOk").addEventListener("click", function () {
    var o = state.pending; if (!o) return;
    closeConfirm();
    send(o).catch(function () { msgKey("err.net", "err"); }).then(function () { busy(false); });
  });

  $("orderForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (state.busy) return;
    var email = $("email").value.trim(), note = $("note").value.trim(), method = state.method;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return msgKey("err.email", "err");
    if (!state.agreed || waitLeft > 0) return msgKey("err.agree", "err");
    var prod = currentProduct();
    var base = { id: orderId(), queryCode: L.newCode(10), email: email, note: note, productId: prod.id, productName: prod.name, priceCny: prod.priceCny, createdAt: new Date().toISOString() };

    if (method === "alipay") {
      var info = $("alipayInfo").value.trim();
      if (info.length < 2) return msgKey("err.ali", "err");
      msg(null);
      busy(true, "f.submit");
      openConfirm(Object.assign(base, { method: "alipay", alipayInfo: info, quotedUsdt: null, tx: null, rate: null, rateSource: null, precheck: { status: "manual" } }));
      return;
    }

    var tx = $("tx").value.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(tx)) return msgKey("err.tx", "err");
    busy(true, "f.checking"); msg(null);
    checkTx(tx).then(function (chk) {
      if (chk.status === "failed") throw { user: "err.txFailed" };
      if (chk.status === "mismatch") throw { user: "err.txMismatch" };
      openConfirm(Object.assign(base, { method: "usdt", tx: tx, quotedUsdt: state.usdt, rate: state.rate, rateSource: state.rateSource, precheck: chk }));
      $("submitBtn").textContent = t("f.submit");
    }).catch(function (err) {
      msgKey(err && err.user ? err.user : "err.net", "err"); busy(false);
    });
  });

  // ---------- 启动 ----------
  I.apply();
  Array.prototype.forEach.call(document.querySelectorAll(".product"), function (btn) {
    btn.addEventListener("click", function () { setProduct(btn.getAttribute("data-product")); });
  });
  setProduct(state.productId || C.defaultProduct);
  setMethod("alipay");
  render(); renderAgree(); renderRecent();
  if (!qrOk) $("qr").textContent = t("usdt.qrFail");
})();
