/*
 * Lector del libro "Proyección de Stock Cd Callao" → hoja "Stock Refer TOTAL".
 * Corre en el navegador (panel admin). Convierte la hoja en un JSON compacto
 * que se guarda en Netlify y que la vista pública lee.
 *
 * Las columnas se ubican por NOMBRE de encabezado (no por posición), así que
 * si en el Excel se mueven o agregan columnas, sigue funcionando.
 */
(function (root) {
  "use strict";

  var SHEET_NAME = "Stock Refer TOTAL";

  // [clave en el JSON, encabezado en el Excel (normalizado), tipo]
  // tipos: s = texto, i = entero, d = 1 decimal, raw = tal cual
  var FIELDS = [
    ["marca",   "MARCA",                  "s"],
    ["cat",     "CATEGORIA",              "s"],
    ["env",     "ENVASES",                "s"],
    ["codigo",  "CODIGO",                 "raw"],
    ["desc",    "DESCRIPCION",            "s"],
    ["factor",  "FACTOR",                 "d"],
    ["pronost", "PRONOST APROB",          "i"],
    ["vprom",   "VENTA PROM ACUM",        "d"],
    ["thoy",    "TRANSITO HOY",           "i"],
    ["td1",     "TRANSITO D1",            "i"],
    ["rcaj",    "REPARTO CAJAS",          "i"],
    ["rhl",     "REPARTO HL",             "d"],
    ["rkkaa",   "STOCK RESERVA KKAA 98",  "i"],
    ["r24",     "STOCK RESERVA 24",       "i"],
    ["bees",    "STOCK BEES 01",          "i"],
    ["stot",    "STOCK EN PISO",          "i"],
    ["obs",     "OBSERVACIONES",          "s"],
    ["cpiso",   "PISO",                   "d"],
    ["cbees",   "BEES",                   "d"],
    ["ckkaa",   "KKAA",                   "d"],
    ["fct",     "FCT PJ",                 "d"],
    ["ipss",    "IP SS",                  "d"],
    ["ipop",    "IP OP",                  "d"],
    ["ipmax",   "IP MAX",                 "d"],
    ["adss",    "ADHERENCIA SS",          "s"],
    ["adop",    "ADHERENCIA OP",          "s"],
    ["admax",   "ADHERENCIA MAX",         "s"],
    ["bk35",    "BK35*",                  "i"],
    ["bk36",    "BK36*",                  "i"],
    ["bk37",    "BK37*",                  "i"],
    ["bk01",    "BK01*",                  "i"],
    ["coment",  "COMENTARIOS",            "s"]
  ];

  function normHeader(v) {
    if (v === null || v === undefined) return "";
    var s = String(v).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s;
  }

  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : 0;
    var n = parseFloat(x);
    return isNaN(n) ? 0 : n;
  }

  function convert(v, type) {
    if (type === "raw") return v;
    if (type === "i") return Math.round(num(v));
    if (type === "d") return Math.round(num(v) * 10) / 10;
    // texto: los BUSCARV fallidos del Excel devuelven 0 → se tratan como vacío
    if (v === null || v === undefined || v === 0 || v === "0") return "";
    return String(v).trim();
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toISODate(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate());
    }
    if (typeof v === "number" && v > 30000 && v < 80000) {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
    }
    return null;
  }

  function findHeaderRow(aoa) {
    for (var i = 0; i < Math.min(aoa.length, 30); i++) {
      var row = aoa[i];
      if (!row) continue;
      var n = row.map(normHeader);
      if (n.indexOf("CODIGO") !== -1 && n.indexOf("DESCRIPCION") !== -1) return i;
    }
    return -1;
  }

  function buildColumnMap(headerRow) {
    var normed = headerRow.map(normHeader);
    var map = {}, missing = [];
    FIELDS.forEach(function (f) {
      var key = f[0], target = f[1], idx = -1;
      if (target.charAt(target.length - 1) === "*") {
        var pre = target.slice(0, -1);
        for (var j = 0; j < normed.length; j++) if (normed[j].indexOf(pre) === 0) { idx = j; break; }
      } else {
        idx = normed.indexOf(target);
      }
      map[key] = idx;
      if (idx === -1) missing.push(target.replace("*", ""));
    });
    return { map: map, missing: missing };
  }

  // Datos de cabecera de la hoja: semana, fecha de proyección, capacidad y stock actual.
  function readMeta(aoa, headerIdx) {
    var meta = { semana: null, fecha: null, capacidad: null, actual: null };
    for (var i = 0; i < headerIdx; i++) {
      var row = aoa[i] || [];
      for (var j = 0; j < row.length; j++) {
        var v = row[j];
        if (meta.fecha === null) { var dt = toISODate(v); if (dt && v instanceof Date) meta.fecha = dt; }
        var h = normHeader(v);
        if (h === "SEM." || h === "SEM" || h === "SEMANA") {
          var below = (aoa[i + 1] || [])[j];
          if (typeof below === "number") meta.semana = below;
        } else if (h === "CAPACIDAD" && typeof row[j + 1] === "number") {
          meta.capacidad = Math.round(row[j + 1]);
        } else if (h === "ACTUAL" && typeof row[j + 1] === "number") {
          meta.actual = Math.round(row[j + 1]);
        }
      }
    }
    return meta;
  }

  /**
   * @param XLSX  la librería SheetJS
   * @param data  ArrayBuffer del .xlsx
   * @param fileName nombre del archivo (solo informativo)
   * @returns {version, updated_at, file, meta, rows, warnings}
   */
  function parseWorkbook(XLSX, data, fileName) {
    var names = XLSX.read(data, { type: "array", bookSheets: true }).SheetNames;
    var sheetName = names.filter(function (n) { return n.trim() === SHEET_NAME; })[0];
    if (!sheetName) throw new Error('No se encontró la hoja "' + SHEET_NAME + '" en el libro.');

    var wb = XLSX.read(data, { type: "array", cellDates: true, sheets: [sheetName] });
    var ws = wb.Sheets[sheetName];
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

    var headerIdx = findHeaderRow(aoa);
    if (headerIdx === -1) throw new Error('No se encontraron los encabezados "CODIGO" y "DESCRIPCION" en la hoja.');
    var cm = buildColumnMap(aoa[headerIdx]);
    if (cm.map.codigo === -1 || cm.map.desc === -1) throw new Error('No se pudo ubicar la columna "CODIGO" o "DESCRIPCION".');

    var rows = [];
    for (var i = headerIdx + 1; i < aoa.length; i++) {
      var r = aoa[i];
      if (!r) continue;
      var codigo = r[cm.map.codigo], desc = r[cm.map.desc];
      if (codigo === null || codigo === undefined || codigo === "" || desc === null || desc === undefined || String(desc).trim() === "") continue;
      var o = {};
      FIELDS.forEach(function (f) {
        var idx = cm.map[f[0]];
        o[f[0]] = convert(idx === -1 ? null : r[idx], f[2]);
      });
      rows.push(o);
    }
    if (!rows.length) throw new Error("No se encontraron productos en la hoja.");

    var warnings = cm.missing.length ? ["Columnas no encontradas (se mostrarán en 0 / vacío): " + cm.missing.join(", ")] : [];
    return {
      version: 2,
      updated_at: new Date().toISOString(),
      file: fileName || null,
      meta: readMeta(aoa, headerIdx),
      rows: rows,
      warnings: warnings
    };
  }

  var api = { parseWorkbook: parseWorkbook, SHEET_NAME: SHEET_NAME, FIELDS: FIELDS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StockParser = api;
})(typeof window !== "undefined" ? window : this);
