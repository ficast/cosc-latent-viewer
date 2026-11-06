// Linked views: 2-D projection of pixel embeddings <-> map with the DGT OrtoSat 2023.
// Data: data.json exported by notebook 47 of the thesis workspace.
"use strict";

const state = { model: null, method: null, seed: null, hidden: new Set(), hover: -1, selected: -1 };
let D, N, screenXY, grid, ctx, canvas, map, hoverSquare, selectSquare, markers = [];

const fmt = (v, d = 2) => v.toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d });

fetch("data.json").then(r => r.json()).then(init).catch(err => {
  document.querySelector(".views").insertAdjacentHTML("beforebegin", `<p class="lede">Não foi possível carregar os dados: ${err}</p>`);
});

function init(data) {
  D = data;
  N = D.pixels.cls.length;
  state.model = D.models[0];
  state.method = D.methods[0];
  state.seed = D.seeds[0];
  document.getElementById("k-value").textContent = D.k;
  buildSeg("models", D.models, "model");
  buildSeg("methods", D.methods, "method");
  buildSeg("seeds", D.seeds, "seed");
  buildChips();
  buildMetrics();
  canvas = document.getElementById("scatter");
  ctx = canvas.getContext("2d");
  new ResizeObserver(() => { resizeCanvas(); draw(); }).observe(document.getElementById("canvas-wrap"));
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseleave", () => setHover(-1));
  canvas.addEventListener("click", () => { if (state.hover >= 0) select(state.hover, true); });
  initMap();
  resizeCanvas();
  draw();
}

// ---------- controls ----------
function buildSeg(id, values, key) {
  const el = document.getElementById(id);
  el.innerHTML = "";
  values.forEach(v => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = v;
    b.setAttribute("aria-pressed", String(v === state[key]));
    b.addEventListener("click", () => {
      state[key] = v;
      [...el.children].forEach(c => c.setAttribute("aria-pressed", String(c === b)));
      resizeCanvas();
      draw();
    });
    el.appendChild(b);
  });
}

function buildChips() {
  const el = document.getElementById("classes");
  const counts = D.classes.map((_, i) => D.pixels.cls.filter(c => c === i).length);
  D.classes.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("aria-pressed", "true");
    b.innerHTML = `<span class="sw" style="background:${c.color}"></span>${c.name} <span class="small">(${counts[i]})</span>`;
    b.title = "Mostrar/esconder a classe";
    b.addEventListener("click", () => {
      if (state.hidden.has(i)) state.hidden.delete(i); else state.hidden.add(i);
      b.setAttribute("aria-pressed", String(!state.hidden.has(i)));
      resizeCanvas();
      draw();
      updateMarkers();
    });
    el.appendChild(b);
  });
}

// ---------- scatter ----------
function resizeCanvas() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 10, w = r.width - 2 * pad, h = r.height - 2 * pad;
  const p = D.projections[`${state.model}|${state.method}|${state.seed}`];
  screenXY = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) {
    screenXY[2 * i] = pad + (p[2 * i] / 1000) * w;
    screenXY[2 * i + 1] = pad + (1 - p[2 * i + 1] / 1000) * h;
  }
  // bucket grid for hover hit-testing
  const cell = 12;
  grid = { cell, cols: Math.ceil(r.width / cell) + 1, map: new Map() };
  for (let i = 0; i < N; i++) {
    if (state.hidden.has(D.pixels.cls[i])) continue;
    const key = Math.floor(screenXY[2 * i] / cell) + grid.cols * Math.floor(screenXY[2 * i + 1] / cell);
    if (!grid.map.has(key)) grid.map.set(key, []);
    grid.map.get(key).push(i);
  }
  document.getElementById("scatter-title").textContent = `${state.model} · ${state.method} · semente ${state.seed}`;
}

function draw() {
  if (!screenXY) return;
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  const order = drawOrder();
  const dim = state.selected >= 0;
  for (const i of order) {
    const c = D.pixels.cls[i];
    if (state.hidden.has(c)) continue;
    ctx.globalAlpha = dim ? 0.35 : 0.75;
    ctx.fillStyle = D.classes[c].color;
    ctx.beginPath();
    ctx.arc(screenXY[2 * i], screenXY[2 * i + 1], 2.2, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const [i, ring] of [[state.selected, 7], [state.hover, 6]]) {
    if (i < 0 || state.hidden.has(D.pixels.cls[i])) continue;
    const x = screenXY[2 * i], y = screenXY[2 * i + 1];
    ctx.lineWidth = 4; ctx.strokeStyle = "#fcfcfb";
    ctx.beginPath(); ctx.arc(x, y, ring, 0, 2 * Math.PI); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = "#0b0b0b";
    ctx.beginPath(); ctx.arc(x, y, ring, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = D.classes[D.pixels.cls[i]].color;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.fill();
  }
}

let _order = null;
function drawOrder() {
  // fixed random order, so no class is always drawn on top
  if (!_order) {
    _order = Array.from({ length: N }, (_, i) => i);
    let s = 7;
    for (let i = N - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [_order[i], _order[j]] = [_order[j], _order[i]]; }
  }
  return _order;
}

function nearest(x, y, maxDist = 10) {
  let best = -1, bestD = maxDist * maxDist;
  const cx = Math.floor(x / grid.cell), cy = Math.floor(y / grid.cell);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const list = grid.map.get(cx + dx + grid.cols * (cy + dy));
    if (!list) continue;
    for (const i of list) {
      const d = (screenXY[2 * i] - x) ** 2 + (screenXY[2 * i + 1] - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
}

function onMove(e) {
  const r = canvas.getBoundingClientRect();
  setHover(nearest(e.clientX - r.left, e.clientY - r.top));
}

function setHover(i) {
  if (i === state.hover) return;
  state.hover = i;
  draw();
  const tip = document.getElementById("tooltip");
  if (i < 0) { tip.hidden = true; showSquare(hoverSquare, -1); return; }
  const c = D.classes[D.pixels.cls[i]];
  tip.innerHTML = `<span class="sw" style="background:${c.color}"></span><strong>${c.name}</strong><br>píxel linha ${D.pixels.row[i]}, coluna ${D.pixels.col[i]}<br><span class="small">clique para aproximar no mapa</span>`;
  tip.hidden = false;
  const x = screenXY[2 * i], y = screenXY[2 * i + 1];
  const w = canvas.getBoundingClientRect().width;
  tip.style.left = `${x + (x > w * 0.6 ? -tip.offsetWidth - 12 : 12)}px`;
  tip.style.top = `${y + 12}px`;
  showSquare(hoverSquare, i);
  const ll = L.latLng(D.pixels.lat[i], D.pixels.lon[i]);
  if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll, { animate: true, duration: 0.3 });
}

// ---------- map ----------
function pixelBounds(i) {
  // 10 m Sentinel-2 pixel around its centre (the UTM grid is ~0.2 m off north here; ignored)
  const lat = D.pixels.lat[i], lon = D.pixels.lon[i];
  const dLat = 5 / 111320, dLon = 5 / (111320 * Math.cos(lat * Math.PI / 180));
  return [[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]];
}

function showSquare(layer, i) {
  if (i < 0) { layer.setStyle({ opacity: 0, fillOpacity: 0 }); return; }
  layer.setBounds(pixelBounds(i));
  layer.setStyle({ opacity: 1, fillOpacity: 0.12 });
  layer.bringToFront();
}

function initMap() {
  map = L.map("map", { preferCanvas: true, zoomSnap: 0.5 });
  const ortho = L.tileLayer.wms("https://ortos.dgterritorio.gov.pt/wms/ortosat2023", {
    layers: "ortoSat2023-CorVerdadeira", format: "image/jpeg", transparent: false, version: "1.3.0",
    maxZoom: 20, attribution: "OrtoSat 2023 © DGT",
  });
  const s2 = L.tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg", {
    maxNativeZoom: 15, maxZoom: 20,
    attribution: 'Sentinel-2 cloudless 2023 by <a href="https://s2maps.eu">EOX</a> (Copernicus Sentinel data 2023)',
  });
  ortho.addTo(map);
  L.control.layers({ "OrtoSat 2023 (DGT, ~0,3 m)": ortho, "Sentinel-2 2023 (EOX, 10 m)": s2 }, null, { collapsed: false }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  map.on("baselayerchange", e => { document.getElementById("map-title").textContent = `Mapa — ${e.name}`; });

  const renderer = L.canvas({ padding: 0.3 });
  for (let i = 0; i < N; i++) {
    const m = L.circleMarker([D.pixels.lat[i], D.pixels.lon[i]], {
      renderer, radius: 3.5, weight: 1, color: "#fcfcfb", fillColor: D.classes[D.pixels.cls[i]].color, fillOpacity: 0.9,
    });
    m.on("click", () => select(i, false));
    m.addTo(map);
    markers.push(m);
  }
  hoverSquare = L.rectangle([[0, 0], [0, 0]], { color: "#ffffff", weight: 2, opacity: 0, fillOpacity: 0, interactive: false }).addTo(map);
  selectSquare = L.rectangle([[0, 0], [0, 0]], { color: "#ffd400", weight: 3, opacity: 0, fillOpacity: 0, interactive: false }).addTo(map);
  map.fitBounds(L.latLngBounds(D.pixels.lat.map((la, i) => [la, D.pixels.lon[i]])), { padding: [10, 10] });
  map.on("zoomend", styleMarkers);
  styleMarkers();
}

function styleMarkers() {
  // far: small dots; mid: dots with a light ring; close: coloured outline only, so the
  // image of the pixel stays visible
  const z = map.getZoom();
  markers.forEach((m, i) => {
    const color = D.classes[D.pixels.cls[i]].color;
    if (z >= 16) m.setStyle({ radius: 7, weight: 2, color, fillOpacity: 0 });
    else if (z >= 13) m.setStyle({ radius: 3.5, weight: 1, color: "#fcfcfb", fillColor: color, fillOpacity: 0.9 });
    else m.setStyle({ radius: 1.8, weight: 0, fillColor: color, fillOpacity: 0.9 });
  });
}

function updateMarkers() {
  markers.forEach((m, i) => {
    const hide = state.hidden.has(D.pixels.cls[i]);
    if (hide && map.hasLayer(m)) map.removeLayer(m);
    if (!hide && !map.hasLayer(m)) m.addTo(map);
  });
}

function select(i, zoom) {
  state.selected = i;
  draw();
  showSquare(selectSquare, i);
  const c = D.classes[D.pixels.cls[i]];
  document.getElementById("pixel-info").innerHTML =
    `Selecionado: <strong>${c.name}</strong> — píxel linha ${D.pixels.row[i]}, coluna ${D.pixels.col[i]} ` +
    `(${fmt(D.pixels.lat[i], 5)}, ${fmt(D.pixels.lon[i], 5)}). Quadrado amarelo = 10 × 10 m.`;
  if (zoom) map.flyTo([D.pixels.lat[i], D.pixels.lon[i]], 18, { duration: 0.8 });
}

// ---------- metrics ----------
function buildMetrics() {
  const names = D.classes.map(c => c.name);
  const t = document.getElementById("purity");
  const best = names.map(n => Math.max(...D.models.map(m => D.purity[m][n])));
  const mean = m => names.reduce((s, n) => s + D.purity[m][n], 0) / names.length;
  const bestMean = Math.max(...D.models.map(mean));
  t.innerHTML =
    `<thead><tr><th>Classe</th>${D.models.map(m => `<th>${m}</th>`).join("")}</tr></thead><tbody>` +
    names.map((n, j) => `<tr><td><span class="sw-inline" style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:${D.classes[j].color}"></span>${n}</td>` +
      D.models.map(m => `<td class="${D.purity[m][n] === best[j] ? "best" : ""}">${fmt(D.purity[m][n])}</td>`).join("") + "</tr>").join("") +
    `<tr><td><strong>Média</strong></td>${D.models.map(m => `<td class="${mean(m) === bestMean ? "best" : ""}">${fmt(mean(m))}</td>`).join("")}</tr></tbody>`;

  const box = document.getElementById("confusion");
  box.innerHTML = D.models.map(m => {
    const M = D.confusion[m];
    const head = `<tr><th></th>${names.map(n => `<th class="col">${n}</th>`).join("")}</tr>`;
    const rows = names.map((n, a) => `<tr><th>${n}</th>${M[a].map(v => {
      const bg = `rgba(42,120,214,${(0.08 + 0.92 * v).toFixed(2)})`;
      return `<td class="cell" style="background:${bg};color:${v > 0.55 ? "#fff" : "#0b0b0b"}">${Math.round(100 * v)}</td>`;
    }).join("")}</tr>`).join("");
    return `<div class="conf"><h4>${m}</h4><table>${head}${rows}</table></div>`;
  }).join("");
}
