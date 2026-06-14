/* ── Telegram Web App init ── */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

/* ── Parse URL params ── */
const params = new URLSearchParams(window.location.search);

const fromLat  = parseFloat(params.get('from_lat')  || '0');
const fromLon  = parseFloat(params.get('from_lon')  || '0');
const toLat    = parseFloat(params.get('to_lat')    || '0');
const toLon    = parseFloat(params.get('to_lon')    || '0');
const fromAddr = decodeURIComponent(params.get('from_addr') || 'Відправлення');
const toAddr   = decodeURIComponent(params.get('to_addr')   || 'Призначення');
const time     = params.get('time')   || '';
const price    = params.get('price')  || '';
const seats    = params.get('seats')  || '';
const role     = params.get('role')   || '';

/* ── Populate info panel ── */
document.getElementById('from-label').textContent = fromAddr.split(',').slice(0, 2).join(',').trim();
document.getElementById('to-label').textContent   = toAddr.split(',').slice(0, 2).join(',').trim();

if (time)  document.getElementById('detail-time').textContent  = time;
if (price) {
  const priceLabel = role === 'passenger' ? `до ${price} грн` : `${price} грн`;
  document.getElementById('detail-price').textContent = priceLabel;
}
if (seats) {
  const seatsLabel = role === 'driver'
    ? `${seats} місць`
    : `${seats} пас.`;
  document.getElementById('detail-seats').textContent = seatsLabel;
}
if (role) {
  document.getElementById('detail-role').textContent = role === 'driver' ? '🚗 Водій' : '🙋 Пасажир';
}

/* ── Init map ── */
const map = L.map('map', {
  zoomControl: true,
  attributionControl: true,
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

/* ── Custom marker icon factory ── */
function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `
      <svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 24 14 24S28 23.33 28 14C28 6.27 21.73 0 14 0z"
              fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="14" cy="14" r="6" fill="white"/>
      </svg>`,
    iconSize:   [28, 38],
    iconAnchor: [14, 38],
    popupAnchor:[0, -38],
  });
}

const greenIcon = makeIcon('#34c759');
const redIcon   = makeIcon('#ff3b30');

/* ── Place markers ── */
const startMarker = L.marker([fromLat, fromLon], { icon: greenIcon })
  .addTo(map)
  .bindPopup(`<b>Відправлення</b><br>${fromAddr}`);

const endMarker = L.marker([toLat, toLon], { icon: redIcon })
  .addTo(map)
  .bindPopup(`<b>Призначення</b><br>${toAddr}`);

/* ── Draw route via OSRM ── */
async function drawRoute() {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromLon},${fromLat};${toLon},${toLat}` +
      `?overview=full&geometries=geojson`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error('OSRM error');

    const data = await resp.json();
    const coords = data.routes[0].geometry;
    const distKm = (data.routes[0].distance / 1000).toFixed(1);
    const durMin = Math.round(data.routes[0].duration / 60);

    // Draw polyline
    L.geoJSON(coords, {
      style: {
        color: getComputedStyle(document.documentElement)
          .getPropertyValue('--tg-button').trim() || '#2481cc',
        weight: 5,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
      },
    }).addTo(map);

    // Fit map to route
    const bounds = L.geoJSON(coords).getBounds();
    map.fitBounds(bounds, { padding: [60, 60] });

    // Show distance badge
    const badge = document.getElementById('distance-badge');
    document.getElementById('distance-text').textContent =
      `📏 ${distKm} км · ⏱ ~${durMin} хв`;
    badge.style.display = 'block';

  } catch {
    // Fallback: draw straight dashed line + fit bounds
    drawFallback();
  }
}

function drawFallback() {
  L.polyline([[fromLat, fromLon], [toLat, toLon]], {
    color: '#2481cc',
    weight: 3,
    dashArray: '8 6',
    opacity: 0.7,
  }).addTo(map);

  const bounds = L.latLngBounds(
    [fromLat, fromLon],
    [toLat, toLon]
  );
  map.fitBounds(bounds, { padding: [60, 60] });

  // Show straight-line distance
  const R = 6371;
  const dLat = (toLat - fromLat) * Math.PI / 180;
  const dLon = (toLon - fromLon) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2
    + Math.cos(fromLat * Math.PI/180) * Math.cos(toLat * Math.PI/180)
    * Math.sin(dLon/2)**2;
  const distKm = (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);

  const badge = document.getElementById('distance-badge');
  document.getElementById('distance-text').textContent = `📏 ~${distKm} км (пряма)`;
  badge.style.display = 'block';
}

/* ── Validate coords and start ── */
if (fromLat && fromLon && toLat && toLon) {
  drawRoute();
} else {
  // No coords: show Ukraine center
  map.setView([49.0, 31.5], 6);
  document.getElementById('from-label').textContent = 'Координати не вказано';
}

/* ── Theme sync ── */
if (tg?.colorScheme === 'dark') {
  // For dark mode Telegram users: swap to dark tile layer
  map.eachLayer(l => { if (l._url) map.removeLayer(l); });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 19,
  }).addTo(map);
}

/* ── Expose popups on marker tap ── */
startMarker.on('click', () => startMarker.openPopup());
endMarker.on('click',   () => endMarker.openPopup());
