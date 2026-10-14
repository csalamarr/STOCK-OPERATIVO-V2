/* Panel de carga (solo administrador). */
(function () {
  "use strict";

  var KEY_STORE = "stockv2.adminKey";
  var adminKey = null;

  function $(id) { return document.getElementById(id); }
  function ssGet() { try { return sessionStorage.getItem(KEY_STORE); } catch (e) { return null; } }
  function ssSet(v) { try { v ? sessionStorage.setItem(KEY_STORE, v) : sessionStorage.removeItem(KEY_STORE); } catch (e) {} }
  function esc(s) {
    return (s === undefined || s === null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    try {
      return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" }) + ", " +
        d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
    } catch (e) { return d.toLocaleString(); }
  }
  function fmtISODate(s) { if (!s) return "—"; var p = s.split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s; }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.style.display = "block";
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = "none"; }, 3500);
  }

  function api(body) {
    return fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey || "" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) { var e = new Error(j.error || ("Error del servidor (" + res.status + ")")); e.status = res.status; throw e; }
        return j;
      });
    });
  }

  // ---------- login ----------
  function showApp() {
    $("loginView").style.display = "none";
    $("topActions").style.display = "block";
    $("tabs").style.display = "flex";
    $("topbar").classList.add("withtabs");
    showTab("carga");
    loadCurrent();
  }
  function showLogin(msg) {
    adminKey = null; ssSet(null);
    $("loginView").style.display = "block";
    $("topActions").style.display = "none";
    $("tabs").style.display = "none";
    $("topbar").classList.remove("withtabs");
    $("tab-carga").style.display = "none";
    $("tab-vista").style.display = "none";
    $("loginErr").textContent = msg || "";
    $("pwd").value = "";
    $("pwd").focus();
  }

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var pwd = $("pwd").value;
    if (!pwd) return;
    $("btnLogin").disabled = true; $("loginErr").textContent = "";
    adminKey = pwd;
    api({ check: true }).then(function () {
      ssSet(pwd); showApp();
    }).catch(function (err) {
      adminKey = null;
      $("loginErr").textContent = err.status === 401 ? "Clave incorrecta." : err.message;
    }).then(function () { $("btnLogin").disabled = false; });
  });
  $("btnLogout").addEventListener("click", function () { showLogin(); });

  // ---------- pestañas ----------
  function showTab(name) {
    document.querySelectorAll("#tabs button").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    $("tab-carga").style.display = name === "carga" ? "block" : "none";
    $("tab-vista").style.display = name === "vista" ? "block" : "none";
    var f = $("viewFrame");
    if (name === "vista") {
      if (!f.getAttribute("src")) f.setAttribute("src", "/");
      else try { f.contentWindow.postMessage("stock:reload", window.location.origin); } catch (e) {}
    }
  }
  document.querySelectorAll("#tabs button").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.tab); });
  });

  // ---------- link público ----------
  var publicUrl = window.location.origin + "/";
  $("publicLink").value = publicUrl;
  $("btnOpen").href = publicUrl;
  $("btnCopy").addEventListener("click", function () {
    var done = function () { toast("Link copiado"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(publicUrl).then(done, function () { $("publicLink").select(); document.execCommand("copy"); done(); });
    } else { $("publicLink").select(); document.execCommand("copy"); done(); }
  });

  // ---------- estado publicado ----------
  function obsCounts(rows) {
    var c = {};
    rows.forEach(function (r) { if (r.stot > 0) { var k = (r.obs || "SIN DATO"); c[k] = (c[k] || 0) + 1; } });
    return c;
  }
  function tone(o) {
    var n = String(o || "").toUpperCase();
    if (n.indexOf("STOCK OUT") === 0) return "red";
    if (n.indexOf("STOCK MIN") === 0) return "amber";
    if (n === "OK") return "green";
    if (n.indexOf("STOCK OVER") === 0) return "blue";
    if (n.indexOf("SIN DEMANDA") === 0) return "slate";
    return "gray";
  }
  function summaryHtml(d) {
    var m = d.meta || {};
    var withStock = d.rows.filter(function (r) { return r.stot > 0; }).length;
    var c = obsCounts(d.rows);
    var chips = Object.keys(c).map(function (k) { return '<span class="tag t-' + tone(k) + '">' + esc(k) + " · " + c[k] + "</span>"; }).join("");
    return '<div class="kv"><span>Publicado</span><span>' + fmtDateTime(d.updated_at) + "</span></div>" +
      (d.file ? '<div class="kv"><span>Archivo</span><span style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(d.file) + "</span></div>" : "") +
      '<div class="kv"><span>Semana / fecha del Excel</span><span>' + (m.semana != null ? m.semana : "—") + " · " + fmtISODate(m.fecha) + "</span></div>" +
      '<div class="kv"><span>Productos</span><span>' + d.rows.length + " (" + withStock + " con stock)</span></div>" +
      '<div class="obschips">' + chips + "</div>";
  }
  function loadCurrent() {
    fetch("/api/data?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) {
      $("currentInfo").innerHTML = d && d.rows ? summaryHtml(d) : '<div style="font-size:13px;color:var(--ink-dim)">Todavía no se ha publicado ningún Excel.</div>';
    }).catch(function () {
      $("currentInfo").innerHTML = '<div style="font-size:13px;color:var(--red)">No se pudo consultar.</div>';
    });
  }

  // ---------- carga del Excel ----------
  function setStatus(msg, kind) { var s = $("status"); s.textContent = msg; s.className = "status " + (kind || "info"); }

  function handleFile(file) {
    if (!file) return;
    if (!/\.xls[xm]$/i.test(file.name)) { setStatus("El archivo debe ser .xlsx", "err"); return; }
    $("summary").style.display = "none";
    setStatus("Leyendo " + file.name + "…");
    var t0 = Date.now();
    file.arrayBuffer().then(function (buf) {
      // deja que el navegador pinte el estado antes del trabajo pesado
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        return StockParser.parseWorkbook(XLSX, new Uint8Array(buf), file.name);
      });
    }).then(function (data) {
      setStatus("Publicando " + data.rows.length + " productos…");
      return api({ data: data }).then(function () { return data; });
    }).then(function (data) {
      var secs = ((Date.now() - t0) / 1000).toFixed(1);
      var warn = data.warnings && data.warnings.length ? " Aviso: " + data.warnings.join(" ") : "";
      setStatus("✓ Publicado en " + secs + " s. Los vendedores ya ven la información nueva." + warn, "ok");
      $("summaryBody").innerHTML = summaryHtml(data);
      $("summary").style.display = "block";
      loadCurrent();
      var f = $("viewFrame");
      if (f.getAttribute("src")) try { f.contentWindow.postMessage("stock:reload", window.location.origin); } catch (e) {}
    }).catch(function (err) {
      console.error(err);
      if (err.status === 401) { showLogin("La sesión expiró o la clave cambió. Vuelve a ingresar."); return; }
      setStatus("Error: " + (err && err.message ? err.message : "no se pudo procesar el archivo."), "err");
    });
  }

  var drop = $("drop"), input = $("fileInput");
  drop.addEventListener("click", function () { input.value = ""; input.click(); });
  input.addEventListener("change", function () { handleFile(input.files && input.files[0]); });
  ["dragenter", "dragover"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (e) { handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); });
  // evita que soltar el archivo fuera del recuadro lo abra en el navegador
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); });

  // ---------- inicio ----------
  var saved = ssGet();
  if (saved) {
    adminKey = saved;
    api({ check: true }).then(showApp).catch(function () { showLogin(); });
  } else {
    showLogin();
  }
})();
