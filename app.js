const form = document.getElementById('search-form');
const statusBox = document.getElementById('status');
const mapCard = document.getElementById('map-card');
const nearbyCard = document.getElementById('nearby-card');
const providersCard = document.getElementById('providers-card');
const providersContainer = document.getElementById('providers');

const providers = [
  { name: 'ImmoScout24', makeUrl: buildImmoScoutUrl },
  { name: 'Immowelt', makeUrl: buildImmoweltUrl },
  { name: 'Immonet', makeUrl: buildImmonetUrl },
  { name: 'Kleinanzeigen Immobilien', makeUrl: buildKleinanzeigenUrl },
  { name: 'WG-Gesucht', makeUrl: buildWgGesuchtUrl }
];

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = getQuery();

  setStatus(`Searching location for "${query.location}"...`);
  providersCard.classList.add('hidden');
  mapCard.classList.add('hidden');
  nearbyCard.classList.add('hidden');

  try {
    const geocoded = await geocodeGermany(query.location);
    setStatus(`Found ${geocoded.displayName}. Building map and provider search links...`);

    renderMap(geocoded, query);
    renderProviders(query, geocoded);

    const nearby = await fetchNearby(geocoded, query.areaType, query.radiusKm);
    renderNearby(nearby, query.areaType, query.radiusKm);

    setStatus('Done. Open provider links to see current listings with your filters.');
  } catch (error) {
    setStatus(error.message || 'Search failed. Please try again with a different German location.', true);
  }
});

function getQuery() {
  return {
    location: document.getElementById('location').value.trim(),
    rentMax: Number(document.getElementById('rentMax').value) || null,
    roomsMin: Number(document.getElementById('roomsMin').value) || null,
    areaType: document.getElementById('areaType').value,
    radiusKm: Number(document.getElementById('radiusKm').value) || 10
  };
}

function setStatus(text, isError = false) {
  statusBox.textContent = text;
  statusBox.classList.remove('hidden');
  statusBox.style.borderLeft = `4px solid ${isError ? '#dc2626' : '#2563eb'}`;
}

async function geocodeGermany(location) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', `${location}, Germany`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!response.ok) throw new Error('Geocoding service unavailable at the moment.');

  const data = await response.json();
  if (!data.length) throw new Error('No German location found. Try another city or district.');

  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
    displayName: data[0].display_name
  };
}

function renderMap(geo, query) {
  const gmaps = new URL('https://www.google.com/maps/search/');
  gmaps.searchParams.set('api', '1');
  gmaps.searchParams.set('query', `${geo.lat},${geo.lon}`);

  mapCard.innerHTML = `
    <h2>Google Maps check</h2>
    <p><strong>Resolved location:</strong> ${geo.displayName}</p>
    <p><a href="${gmaps.toString()}" target="_blank" rel="noreferrer">Open this area in Google Maps</a></p>
    <p>Preference: <strong>${query.areaType}</strong> within <strong>${query.radiusKm} km</strong>.</p>
  `;
  mapCard.classList.remove('hidden');
}

async function fetchNearby(geo, areaType, radiusKm) {
  const meters = Math.max(1000, Math.round(radiusKm * 1000));
  let selector = 'node["railway"="station"]';
  if (areaType === 'village') selector = 'node["place"="village"]';
  if (areaType === 'city') selector = 'node["place"~"city|town"]';

  const overpassQuery = `
[out:json][timeout:25];
(
  ${selector}(around:${meters},${geo.lat},${geo.lon});
);
out body 10;
`.trim();

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: overpassQuery,
    headers: { 'Content-Type': 'text/plain' }
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return (data.elements || []).map((el) => ({
    name: el.tags?.name || 'Unnamed',
    lat: el.lat,
    lon: el.lon
  }));
}

function renderNearby(items, type, radiusKm) {
  const label = type === 'station' ? 'Stations' : type === 'village' ? 'Villages' : 'Cities / towns';
  const list = items.length
    ? `<ul>${items.slice(0, 8).map((item) => `<li>${item.name} (<a target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}">map</a>)</li>`).join('')}</ul>`
    : '<p>No nearby results found from OpenStreetMap data.</p>';

  nearbyCard.innerHTML = `<h2>Nearby ${label} (within ${radiusKm} km)</h2>${list}`;
  nearbyCard.classList.remove('hidden');
}

function renderProviders(query, geo) {
  providersContainer.innerHTML = providers.map((provider) => {
    const url = provider.makeUrl(query, geo);
    return `
      <article class="provider">
        <h3>${provider.name}</h3>
        <p><a href="${url}" target="_blank" rel="noreferrer">Open filtered search</a></p>
      </article>
    `;
  }).join('');

  providersCard.classList.remove('hidden');
}

function buildImmoScoutUrl(query) {
  const url = new URL('https://www.immobilienscout24.de/Suche/deutschland/wohnung-mieten');
  url.searchParams.set('enteredFrom', 'result_list');
  url.searchParams.set('geocoordinates', query.location);
  if (query.rentMax) url.searchParams.set('price', `-${Math.round(query.rentMax)}`);
  if (query.roomsMin) url.searchParams.set('numberofrooms', `${query.roomsMin}-`);
  return url.toString();
}

function buildImmoweltUrl(query) {
  const url = new URL('https://www.immowelt.de/liste/deutschland/wohnungen/mieten');
  url.searchParams.set('ort', query.location);
  if (query.rentMax) url.searchParams.set('ma', String(Math.round(query.rentMax)));
  if (query.roomsMin) url.searchParams.set('zi', `${query.roomsMin}`);
  return url.toString();
}

function buildImmonetUrl(query) {
  const url = new URL('https://www.immonet.de/classified-search');
  url.searchParams.set('distributionTypes', 'Rent');
  url.searchParams.set('estateTypes', 'Apartment');
  url.searchParams.set('locations', query.location);
  if (query.rentMax) url.searchParams.set('priceMax', String(Math.round(query.rentMax)));
  if (query.roomsMin) url.searchParams.set('numberOfRoomsMin', String(query.roomsMin));
  return url.toString();
}

function buildKleinanzeigenUrl(query) {
  const encoded = encodeURIComponent(`${query.location} wohnung miete ${query.rentMax ? query.rentMax + ' euro' : ''}`);
  return `https://www.kleinanzeigen.de/s-wohnung-mieten/${encoded}/k0c203`;
}

function buildWgGesuchtUrl(query) {
  const url = new URL('https://www.wg-gesucht.de/wg-zimmer-und-1-zimmer-wohnungen-in-Deutschland.0.0.1.0.html');
  url.searchParams.set('city_name', query.location);
  if (query.rentMax) url.searchParams.set('rent_types', `0-${Math.round(query.rentMax)}`);
  return url.toString();
}
