/* Vista pública del Reporte Operativo de Stock v2.
   Lee el último Excel publicado desde /api/data y se refresca solo cada 5 minutos. */
(function () {
  "use strict";

  var DATA_URL = "/api/data";
  var REFRESH_MS = 5 * 60 * 1000;

  // ---------- observaciones ----------
  function norm(s) {
    s = (s === null || s === undefined ? "" : String(s)).trim().toUpperCase();
    return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s;
  }
  // tono de color + prioridad de orden para cada observación del Excel
  function obsInfo(o) {
    var n = norm(o);
    if (!n) return { tone: "gray", rank: 9, label: "SIN DATO" };
    if (n.indexOf("STOCK OUT") === 0) return { tone: "red", rank: 0 };
    if (n.indexOf("STOCK MIN") === 0) return { tone: "amber", rank: 1 };
    if (n === "OK") return { tone: "green", rank: 2 };
    if (n.indexOf("STOCK OVER") === 0) return { tone: "blue", rank: 3 };
    if (n.indexOf("SIN PRONOSTICO") === 0) return { tone: "gray", rank: 4 };
    if (n.indexOf("SIN DEMANDA") === 0) return { tone: "slate", rank: 5 };
    if (n.indexOf("SIN COBERTURA") === 0) return { tone: "gray", rank: 6 };
    return { tone: "gray", rank: 8 };
  }
  function obsLabel(o) { return (o && String(o).trim()) || "SIN DATO"; }
  function adhTone(a) {
    var n = norm(a);
    if (n === "OK" || n === "SEGURO") return "green";
    if (n === "RIESGO") return "red";
    if (n === "SOBRE STOCK" || n === "EXCESO") return "blue";
    return "gray";
  }

  // ---------- formato ----------
  var fmtInt = function (n) { return Math.round(n || 0).toLocaleString("en-US"); };
  var fmtDec = function (n) { return (typeof n === "number" ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
  var fmtFactor = function (n) { return (n || 0) % 1 === 0 ? fmtInt(n) : fmtDec(n); };

  // Etiqueta amarilla "NUEVO" en las secciones agregadas en la v2 de "Ver detalle".
  // Cuando los vendedores ya se acostumbren, cambiar a false.
  var SHOW_NEW_BADGE = true;
  var NEW = SHOW_NEW_BADGE ? ' <span class="new">NUEVO</span>' : "";
  function esc(s) {
    return (s === undefined || s === null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    try {
      return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" }) + ", " +
        d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
    } catch (e) { return d.toLocaleString(); }
  }
  function fmtISODate(s) { if (!s) return "—"; var p = s.split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s; }

  // ---------- estado ----------
  var DATA = null, RECORDS = [];
  var state = { marca: "TODOS", obs: "TODOS", q: "", includeZero: false, view: "cards" };
  try { var v = localStorage.getItem("stockv2.view"); if (v === "table" || v === "cards") state.view = v; } catch (e) {}

  function setData(d) {
    DATA = d;
    RECORDS = (d.rows || []).map(function (r) {
      var info = obsInfo(r.obs);
      r._tone = info.tone; r._rank = info.rank; r._obsKey = obsLabel(r.obs);
      r._hay = (String(r.codigo) + " " + r.desc + " " + (r.marca || "") + " " + (r.cat || "")).toLowerCase();
      return r;
    });
  }

  function visibleBase() {
    return RECORDS.filter(function (r) { return state.includeZero || r.stot > 0; });
  }

  // ---------- KPIs de cabecera ----------
  function renderKpis() {
    var m = (DATA && DATA.meta) || {};
    var base = visibleBase();
    var out = base.filter(function (r) { return r._rank === 0; }).length;
    var min = base.filter(function (r) { return r._rank === 1; }).length;
    var html = "";
    html += kpi("Semana", m.semana != null ? m.semana : "—", "Proyección " + fmtISODate(m.fecha));
    if (m.capacidad && m.actual != null) {
      var pct = Math.min(100, Math.round(m.actual / m.capacidad * 100));
      html += '<div class="kpi"><div class="l">Ocupación almacén</div><div class="n">' + pct + '%</div>' +
        '<div class="s">' + fmtInt(m.actual) + " / " + fmtInt(m.capacidad) + ' cajas</div>' +
        '<div class="meter"><i style="width:' + pct + '%"></i></div></div>';
    } else {
      html += kpi("Stock en piso", fmtInt(sum(RECORDS, "stot")), "cajas");
    }
    html += kpi("Productos con stock", fmtInt(RECORDS.filter(function (r) { return r.stot > 0; }).length), "de " + fmtInt(RECORDS.length) + " códigos");
    html += '<div class="kpi"><div class="l">Alertas</div><div class="n" style="color:var(--red)">' + out +
      ' <span style="font-size:12px;font-weight:700;">stock out</span></div><div class="s" style="color:var(--amber)">' + min + ' en stock mínimo</div></div>';
    document.getElementById("kpis").innerHTML = html;
  }
  function kpi(l, n, s) { return '<div class="kpi"><div class="l">' + esc(l) + '</div><div class="n">' + esc(n) + '</div><div class="s">' + esc(s || "") + '</div></div>'; }
  function sum(list, k) { return list.reduce(function (a, r) { return a + (r[k] || 0); }, 0); }

  // ---------- filtros ----------
  function buildFilterRows() {
    var marcaRow = document.getElementById("marcaRow"), obsRow = document.getElementById("obsRow");
    marcaRow.innerHTML = ""; obsRow.innerHTML = "";

    var base = visibleBase();
    var mset = {};
    base.forEach(function (r) { if (r.marca) mset[r.marca] = (mset[r.marca] || 0) + 1; });
    var marcas = Object.keys(mset).sort(function (a, b) { return a.localeCompare(b, "es"); });
    if (state.marca !== "TODOS" && !mset[state.marca]) state.marca = "TODOS";
    ["TODOS"].concat(marcas).forEach(function (m) {
      var b = document.createElement("button");
      b.className = "pill" + (m === state.marca ? " active" : "");
      b.type = "button";
      b.innerHTML = esc(m) + (m === "TODOS" ? "" : '<span class="ct">' + mset[m] + "</span>");
      b.addEventListener("click", function () { state.marca = m; refresh(); });
      marcaRow.appendChild(b);
    });

    // observaciones presentes (según marca elegida), en orden de criticidad
    var oset = {};
    base.forEach(function (r) {
      if (state.marca !== "TODOS" && r.marca !== state.marca) return;
      if (!oset[r._obsKey]) oset[r._obsKey] = { n: 0, rank: r._rank, tone: r._tone };
      oset[r._obsKey].n++;
    });
    var obsKeys = Object.keys(oset).sort(function (a, b) { return oset[a].rank - oset[b].rank || a.localeCompare(b); });
    if (state.obs !== "TODOS" && !oset[state.obs]) state.obs = "TODOS";
    var all = document.createElement("button");
    all.className = "pill pill-obs" + (state.obs === "TODOS" ? " active" : "");
    all.type = "button"; all.textContent = "TODOS";
    all.addEventListener("click", function () { state.obs = "TODOS"; refresh(); });
    obsRow.appendChild(all);
    obsKeys.forEach(function (k) {
      var b = document.createElement("button");
      b.className = "pill pill-obs t-" + oset[k].tone + (state.obs === k ? " active" : "");
      b.type = "button";
      b.innerHTML = esc(k) + '<span class="ct">' + oset[k].n + "</span>";
      b.addEventListener("click", function () { state.obs = k; refresh(); });
      obsRow.appendChild(b);
    });
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return visibleBase().filter(function (r) {
      if (state.marca !== "TODOS" && r.marca !== state.marca) return false;
      if (state.obs !== "TODOS" && r._obsKey !== state.obs) return false;
      if (q && r._hay.indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) {
      if (a._rank !== b._rank) return a._rank - b._rank;
      if ((a.marca || "") !== (b.marca || "")) return (a.marca || "").localeCompare(b.marca || "", "es");
      return String(a.desc).localeCompare(String(b.desc), "es");
    });
  }

  // ---------- tarjetas ----------
  function kv(label, value) { return '<div class="kv"><span>' + esc(label) + "</span><span>" + value + "</span></div>"; }
  function stat(n, l) { return '<div class="stat"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; }
  function tag(text) { return '<span class="tag t-' + adhTone(text) + '">' + esc(text || "—") + "</span>"; }

  function detailHtml(r) {
    var html = '<div class="detail">';
    // Lo que ya existía en la v1
    html += '<div class="dsec"><h4>Movimiento</h4>' +
      kv("Tránsito hoy", fmtInt(r.thoy)) +
      kv("Tránsito D1", fmtInt(r.td1)) +
      kv("Reparto cajas", fmtInt(r.rcaj)) +
      kv("Reparto HL", fmtDec(r.rhl)) +
      "</div>";
    html += '<div class="dsec"><h4>Cobertura' + NEW + '</h4>' +
      kv("Cobertura piso", fmtDec(r.cpiso)) +
      kv("Cobertura BEES", fmtDec(r.cbees)) +
      kv("Cobertura KKAA", fmtDec(r.ckkaa)) +
      "</div>";
    html += '<div class="dsec"><h4>Política de inventario' + NEW + '</h4>' +
      '<table class="ip-table"><thead><tr><th>Nivel</th><th>IP</th><th>Adherencia</th></tr></thead><tbody>' +
      "<tr><td>Seguridad (SS)</td><td>" + fmtDec(r.ipss) + "</td><td>" + tag(r.adss) + "</td></tr>" +
      "<tr><td>Operativo (OP)</td><td>" + fmtDec(r.ipop) + "</td><td>" + tag(r.adop) + "</td></tr>" +
      "<tr><td>Máximo (MAX)</td><td>" + fmtDec(r.ipmax) + "</td><td>" + tag(r.admax) + "</td></tr>" +
      "</tbody></table></div>";
    html += '<div class="dsec"><h4>Stock en otros almacenes' + NEW + '</h4>' +
      kv("BK35 · Cono Norte", fmtInt(r.bk35)) +
      kv("BK36 · Cono Sur", fmtInt(r.bk36)) +
      kv("BK37 · Rímac", fmtInt(r.bk37)) +
      kv("BK01 · Pta Ate", fmtInt(r.bk01)) +
      "</div>";
    if (r.coment) html += '<div class="dsec"><h4>Comentarios' + NEW + '</h4><div class="comment">' + esc(r.coment) + "</div></div>";
    return html + "</div>";
  }

  function renderCards(list) {
    var wrap = document.getElementById("cardlist");
    var html = list.map(function (r) {
      var sub = [r.marca, r.cat, r.env].filter(Boolean).map(esc).join(" · ");
      return '<div class="card">' +
        '<div class="card-top"><div>' +
          '<div class="card-code">' + esc(r.codigo) + "</div>" +
          '<div class="card-desc">' + esc(r.desc) + "</div>" +
          '<div class="card-sub">' + sub + "</div></div>" +
          '<span class="badge t-' + r._tone + '">' + esc(r._obsKey) + "</span>" +
        "</div>" +
        '<div class="card-stats">' +
          stat(fmtInt(r.pronost), "Pronóst. aprob.") +
          stat(fmtInt(r.stot), "Stock piso total") +
          stat(fmtInt(r.rkkaa), "Stock res. KKAA 98") +
          stat(fmtInt(r.r24), "Stock reserva 24") +
          stat(fmtInt(r.bees), "Stock BEES 01") +
          stat(fmtDec(r.cpiso), "Cobert. total") +
        "</div>" +
        (r.coment ? '<div class="card-comment">💬 ' + esc(r.coment) + "</div>" : "") +
        '<details class="card-more"><summary></summary>' + detailHtml(r) + "</details>" +
        "</div>";
    }).join("");
    wrap.innerHTML = html;
  }

  // ---------- tabla ----------
  // [encabezado, función de celda, clase]
  var COLS = [
    ["Código", function (r) { return esc(r.codigo); }, "l sticky1"],
    ["Descripción", function (r) { return esc(r.desc); }, "l sticky2"],
    ["Marca", function (r) { return esc(r.marca); }, "l"],
    ["Categoría", function (r) { return esc(r.cat); }, "l"],
    ["Envase", function (r) { return esc(r.env); }, "l"],
    ["Factor", function (r) { return fmtFactor(r.factor); }, ""],
    ["Pronóst. aprob.", function (r) { return fmtInt(r.pronost); }, "sep"],
    ["Venta prom. acum.", function (r) { return fmtDec(r.vprom); }, ""],
    ["Tránsito hoy", function (r) { return fmtInt(r.thoy); }, ""],
    ["Tránsito D1", function (r) { return fmtInt(r.td1); }, ""],
    ["Reparto cajas", function (r) { return fmtInt(r.rcaj); }, ""],
    ["Reparto HL", function (r) { return fmtDec(r.rhl); }, ""],
    ["Stock res. KKAA 98", function (r) { return fmtInt(r.rkkaa); }, "sep"],
    ["Stock reserva 24", function (r) { return fmtInt(r.r24); }, ""],
    ["Stock BEES 01", function (r) { return fmtInt(r.bees); }, ""],
    ["Stock en piso total", function (r) { return "<b>" + fmtInt(r.stot) + "</b>"; }, ""],
    ["Observaciones", function (r) { return '<span class="tag t-' + r._tone + '">' + esc(r._obsKey) + "</span>"; }, "c"],
    ["Cobert. piso", function (r) { return fmtDec(r.cpiso); }, "sep"],
    ["Cobert. BEES", function (r) { return fmtDec(r.cbees); }, ""],
    ["Cobert. KKAA", function (r) { return fmtDec(r.ckkaa); }, ""],
    ["FCT PJ", function (r) { return fmtFactor(r.fct); }, ""],
    ["IP SS", function (r) { return fmtDec(r.ipss); }, "sep"],
    ["IP OP", function (r) { return fmtDec(r.ipop); }, ""],
    ["IP MAX", function (r) { return fmtDec(r.ipmax); }, ""],
    ["Adher. SS", function (r) { return tag(r.adss); }, "c"],
    ["Adher. OP", function (r) { return tag(r.adop); }, "c"],
    ["Adher. MAX", function (r) { return tag(r.admax); }, "c"],
    ["BK35 Cono Norte", function (r) { return fmtInt(r.bk35); }, "sep"],
    ["BK36 Cono Sur", function (r) { return fmtInt(r.bk36); }, ""],
    ["BK37 Rímac", function (r) { return fmtInt(r.bk37); }, ""],
    ["BK01 Pta Ate", function (r) { return fmtInt(r.bk01); }, ""],
    ["Comentarios", function (r) { return esc(r.coment); }, "l sep"]
  ];
  function renderTableHead() {
    document.getElementById("tablehead").innerHTML = COLS.map(function (c) { return '<th class="' + c[2] + '">' + c[0] + "</th>"; }).join("");
  }
  function renderTable(list) {
    document.getElementById("tablebody").innerHTML = list.map(function (r) {
      return "<tr>" + COLS.map(function (c) { return '<td class="' + c[2] + '">' + c[1](r) + "</td>"; }).join("") + "</tr>";
    }).join("");
  }

  // ---------- refresco de pantalla ----------
  function refresh() {
    renderKpis();
    buildFilterRows();
    var list = filtered();
    document.getElementById("countShown").textContent = list.length.toLocaleString("en-US");
    document.getElementById("countTotal").textContent = visibleBase().length.toLocaleString("en-US");
    document.getElementById("emptystate").style.display = list.length ? "none" : "block";
    document.getElementById("cardlist").style.display = state.view === "cards" && list.length ? "flex" : "none";
    document.getElementById("tablewrap").style.display = state.view === "table" && list.length ? "block" : "none";
    document.querySelectorAll("#viewSwitch button").forEach(function (b) { b.classList.toggle("active", b.dataset.view === state.view); });
    if (state.view === "cards") renderCards(list); else renderTable(list);
  }

  function showHeader() {
    document.getElementById("lastupdate").textContent = fmtDateTime(DATA.updated_at);
    var m = DATA.meta || {};
    if (m.semana != null) document.getElementById("subtitleline").textContent = "Disponibilidad de producto en piso · Semana " + m.semana;
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.style.display = "block";
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = "none"; }, 4000);
  }

  function load(silent) {
    return fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (d) {
        document.getElementById("loading").style.display = "none";
        if (!d || !d.rows) {
          if (!DATA) document.getElementById("nodata").style.display = "block";
          return;
        }
        if (DATA && DATA.updated_at === d.updated_at) return;
        var first = !DATA;
        setData(d);
        document.getElementById("nodata").style.display = "none";
        document.getElementById("app").style.display = "block";
        showHeader();
        refresh();
        if (!first) toast("Stock actualizado: " + fmtDateTime(d.updated_at));
      })
      .catch(function (err) {
        console.error(err);
        document.getElementById("loading").style.display = "none";
        if (!DATA && !silent) {
          var nd = document.getElementById("nodata");
          nd.innerHTML = "<b>No se pudo cargar el stock</b>Revisa tu conexión y vuelve a abrir el link.";
          nd.style.display = "block";
        }
      });
  }

  // ---------- eventos ----------
  document.getElementById("searchbox").addEventListener("input", function (e) { state.q = e.target.value; refresh(); });
  document.getElementById("includeZero").addEventListener("change", function (e) { state.includeZero = e.target.checked; refresh(); });
  document.querySelectorAll("#viewSwitch button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.view = btn.dataset.view;
      try { localStorage.setItem("stockv2.view", state.view); } catch (e) {}
      refresh();
    });
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(true); });

  renderTableHead();
  load(false);
  setInterval(function () { load(true); }, REFRESH_MS);

  // permite que el panel admin pida recargar la vista embebida
  window.addEventListener("message", function (e) {
    if (e.origin === window.location.origin && e.data === "stock:reload") load(true);
  });
})();
