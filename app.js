/* ── Telegram Web App init ── */
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

/* ── Parse URL params ── */
const p = new URLSearchParams(window.location.search);

const mode      = p.get('mode') || 'single';   // 'single' | 'match'
const role      = p.get('role') || '';          // 'driver' | 'passenger'

// Single-route params (my_trips view)
const fromLat   = parseFloat(p.get('from_lat')  || '0');
const fromLon   = parseFloat(p.get('from_lon')  || '0');
const toLat     = parseFloat(p.get('to_lat')    || '0');
const toLon     = parseFloat(p.get('to_lon')    || '0');
const fromAddr  = decodeURIComponent(p.get('from_addr') || 'Відправлення');
const toAddr    = decodeURIComponent(p.get('to_addr')   || 'Призначення');
const time      = p.get('time')  || '';
const price     = p.get('price') || '';
const seats     = p.get('seats') || '';

// Match-mode params (driver's route + passenger pickup)
const dFromLat  = parseFloat(p.get('d_from_lat') || '0');
const dFromLon  = parseFloat(p.get('d_from_lon') || '0');
const dToLat    = parseFloat(p.get('d_to_lat')   || '0');
const dToLon    = parseFloat(p.get('d_to_lon')   || '0');
const pFromLat  = parseFloat(p.get('p_from_lat') || '0');
const pFromLon  = parseFloat(p.get('p_from_lon') || '0');
const pToLat    = parseFloat(p.get('p_to_lat')   || '0');
const pToLon    = parseFloat(p.get('p_to_lon')   || '0');

const dFromAddr = decodeURIComponent(p.get('d_from_addr') || '');
const dToAddr   = decodeURIComponent(p.get('d_to_addr')   || '');
const pFromAddr = decodeURIComponent(p.get('p_from_addr') || '');
const pToAddr   = decodeURIComponent(p.get('p_to_addr')   || '');
const dPrice    = p.get('d_price') || '';
const dTime     = p.get('d_time')  || '';
const dSeats    = p.get('d_seats') || '';
const dRating   = p.get('d_rating') || '';

/* ── Populate info panel ── */
const infoPanel   = document.getElementById('info-panel');
const routeHeader = document.getElementById('route-header');
const tripDetails = document.getElementById('trip-details');

if (mode === 'match') {
  // Show driver route info
  document.getElementById('from-label').textContent =
    (dFromAddr || fromAddr).split(',').slice(0, 2).join(',').trim();
  document.getElementById('to-label').textContent =
    (dToAddr || toAddr).split(',').slice(0, 2).join(',').trim();

  // Build detail chips for match mode
  tripDetails.innerHTML = '';
  if (dTime)   tripDetails.innerHTML += chip('🕒', dTime);
  if (dPrice)  tripDetails.innerHTML += chip('💰', `${dPrice} грн`);
  if (dSeats)  tripDetails.innerHTML += chip('💺', `${dSeats} місць`);
  if (dRating) tripDetails.innerHTML += chip('⭐', dRating);

  // Legend
  const legend = document.createElement('div');
  legend.id = 'legend';
  if (role === 'driver') {
    legend.innerHTML = `
      <span class="leg-item"><span class="leg-line leg-blue"></span> Ваш маршрут</span>
      <span class="leg-item"><span class="leg-line leg-orange"></span> Маршрут з попутником</span>`;
  } else {
    legend.innerHTML = `
      <span class="leg-item"><span class="leg-line leg-blue"></span> Маршрут водія</span>
      <span class="leg-item"><span class="leg-dot leg-orange-dot"></span> Ваша зупинка</span>`;
  }
  infoPanel.appendChild(legend);

} else {
  // Single mode
  document.getElementById('from-label').textContent = fromAddr.split(',').slice(0, 2).join(',').trim();
  document.getElementById('to-label').textContent   = toAddr.split(',').slice(0, 2).join(',').trim();
  if (time)  setChip('detail-time',  time);
  if (price) setChip('detail-price', role === 'passenger' ? `до ${price} грн` : `${price} грн`);
  if (seats) setChip('detail-seats', role === 'driver' ? `${seats} місць` : `${seats} пас.`);
  if (role)  setChip('detail-role',  role === 'driver' ? '🚗 Водій' : '🙋 Пасажир');
}

function chip(icon, text) {
  return `<div class="detail-chip"><span class="chip-icon">${icon}</span><span>${text}</span></div>`;
}
function setChip(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ── Init map ── */
const isDark = tg?.colorScheme === 'dark';
const map = L.map('map', { zoomControl: true, attributionControl: true });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

/* ── Marker icon factory ── */
function pinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 24 14 24S28 23.33 28 14C28 6.27 21.73 0 14 0z"
            fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="6" fill="white"/>
    </svg>`,
    iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -38],
  });
}

function circleIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="9" fill="${color}" stroke="white" stroke-width="2.5"/>
    </svg>`,
    iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12],
  });
}

const GREEN  = '#34c759';
const RED    = '#ff3b30';
const BLUE   = '#2481cc';
const ORANGE = '#ff9500';

/* ── OSRM fetch helper ── */
async function fetchRoute(waypoints) {
  // waypoints: [[lon,lat], [lon,lat], ...]
  const coords = waypoints.map(([ln, lt]) => `${ln},${lt}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error('OSRM error');
  const data = await resp.json();
  return {
    geojson: data.routes[0].geometry,
    distKm:  (data.routes[0].distance / 1000).toFixed(1),
    durMin:  Math.round(data.routes[0].duration / 60),
  };
}

function straightLine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
}

/* ── Main rendering ── */
async function render() {
  if (mode === 'match') {
    await renderMatch();
  } else {
    await renderSingle();
  }
}

/* ── Single route (my trips) ── */
async function renderSingle() {
  if (!fromLat || !toLat) {
    map.setView([49.0, 31.5], 6);
    return;
  }

  L.marker([fromLat, fromLon], { icon: pinIcon(GREEN) })
    .addTo(map).bindPopup(`<b>Відправлення</b><br>${fromAddr}`);
  L.marker([toLat, toLon], { icon: pinIcon(RED) })
    .addTo(map).bindPopup(`<b>Призначення</b><br>${toAddr}`);

  try {
    const r = await fetchRoute([[fromLon, fromLat], [toLon, toLat]]);
    drawPolyline(r.geojson, BLUE, 5, false).addTo(map);
    map.fitBounds(L.geoJSON(r.geojson).getBounds(), { padding: [60, 60] });
    showBadge(`📏 ${r.distKm} км · ⏱ ~${r.durMin} хв`);
  } catch {
    L.polyline([[fromLat, fromLon], [toLat, toLon]], { color: BLUE, weight: 3, dashArray: '8 6' }).addTo(map);
    map.fitBounds([[fromLat, fromLon], [toLat, toLon]], { padding: [60, 60] });
    showBadge(`📏 ~${straightLine(fromLat, fromLon, toLat, toLon)} км (пряма)`);
  }
}

/* ── Match mode (two routes) ── */
async function renderMatch() {
  if (!dFromLat || !dToLat) {
    map.setView([49.0, 31.5], 6);
    return;
  }

  // Place driver markers
  const mDriverStart = L.marker([dFromLat, dFromLon], { icon: pinIcon(GREEN) })
    .addTo(map).bindPopup(`<b>🚗 Старт водія</b><br>${dFromAddr}`);
  const mDriverEnd = L.marker([dToLat, dToLon], { icon: pinIcon(BLUE) })
    .addTo(map).bindPopup(`<b>🏁 Фінал водія</b><br>${dToAddr}`);

  // Place passenger markers (pickup / dropoff)
  let mPassFrom, mPassTo;
  if (pFromLat && pFromLon) {
    mPassFrom = L.marker([pFromLat, pFromLon], { icon: circleIcon(ORANGE) })
      .addTo(map).bindPopup(`<b>🙋 Посадка пасажира</b><br>${pFromAddr}`);
  }
  if (pToLat && pToLon) {
    mPassTo = L.marker([pToLat, pToLon], { icon: circleIcon(RED) })
      .addTo(map).bindPopup(`<b>🏁 Висадка пасажира</b><br>${pToAddr}`);
  }

  const allBounds = [];

  // Fetch routes first, then draw in correct z-order (orange below, blue on top)
  try {
    const r1 = await fetchRoute([[dFromLon, dFromLat], [dToLon, dToLat]]);
    allBounds.push(...L.geoJSON(r1.geojson).getBounds().toBBoxString().split(',').map(Number));

    if (role === 'driver' && pFromLat && pFromLon) {
      // Route 2: Detour via passenger (orange solid) — draw FIRST so blue renders on top
      try {
        const waypoints = [[dFromLon, dFromLat], [pFromLon, pFromLat]];
        if (pToLat && pToLon) waypoints.push([pToLon, pToLat]);
        waypoints.push([dToLon, dToLat]);

        const r2 = await fetchRoute(waypoints);

        // Orange detour (bottom layer)
        drawPolyline(r2.geojson, ORANGE, 6, false).addTo(map);

        // Blue direct — white casing + dashed blue on top so it's always visible
        drawPolyline(r1.geojson, '#ffffff', 9, false).addTo(map);
        drawPolyline(r1.geojson, BLUE, 5, true).addTo(map);

        const extra = r2.durMin - r1.durMin;
        showBadge(`🚗 ${r1.distKm} км · ⏱ ${r1.durMin} хв · +${extra > 0 ? extra : 0} хв з попутником`);
      } catch {
        // Fallback detour
        const pts = [[dFromLat, dFromLon]];
        if (pFromLat) pts.push([pFromLat, pFromLon]);
        if (pToLat)   pts.push([pToLat,   pToLon]);
        pts.push([dToLat, dToLon]);
        L.polyline(pts, { color: ORANGE, weight: 5, dashArray: '10 5' }).addTo(map);
        drawPolyline(r1.geojson, '#ffffff', 9, false).addTo(map);
        drawPolyline(r1.geojson, BLUE, 5, true).addTo(map);
        showBadge(`📏 Маршрут водія: ~${r1.distKm} км`);
      }
    } else {
      // Passenger view: just driver route
      drawPolyline(r1.geojson, BLUE, 5, false).addTo(map);
      showBadge(`🚗 Маршрут водія: ${r1.distKm} км · ⏱ ~${r1.durMin} хв`);
    }
  } catch {
    // Full fallback
    L.polyline([[dFromLat, dFromLon], [dToLat, dToLon]], { color: ORANGE, weight: 5 }).addTo(map);
    if (pFromLat) {
      L.polyline([[dFromLat, dFromLon], [pFromLat, pFromLon], [dToLat, dToLon]],
        { color: '#ffffff', weight: 9 }).addTo(map);
      L.polyline([[dFromLat, dFromLon], [pFromLat, pFromLon], [dToLat, dToLon]],
        { color: BLUE, weight: 5, dashArray: '8 6' }).addTo(map);
    }
    showBadge(`📏 ~${straightLine(dFromLat, dFromLon, dToLat, dToLon)} км (пряма)`);
  }

  // Fit all markers in view
  const latLngs = [[dFromLat, dFromLon], [dToLat, dToLon]];
  if (pFromLat) latLngs.push([pFromLat, pFromLon]);
  if (pToLat)   latLngs.push([pToLat, pToLon]);
  map.fitBounds(latLngs, { padding: [70, 70] });
}

/* ── Helpers ── */
function drawPolyline(geojson, color, weight, dashed) {
  return L.geoJSON(geojson, {
    style: {
      color,
      weight,
      opacity: 0.85,
      dashArray: dashed ? '10 8' : null,
      lineJoin: 'round',
      lineCap:  'round',
    },
  });
}

function showBadge(text) {
  const badge = document.getElementById('distance-badge');
  document.getElementById('distance-text').textContent = text;
  badge.style.display = 'block';
}

render();
