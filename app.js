const COG_URL =
  "https://s3.opengeohub.org/global/dtm/v1.2/gedtm_rf_m_30m_s_20060101_20151231_go_epsg.4326.3855_v1.2.tif";

const THAILAND_BOUNDS = [
  [4.5, 96.8], // southwest corner (lat, lon)
  [21.5, 106.5], // northeast corner
];
const GRID_STEP_DEG = 0.02;
const ROW_CHUNK_SIZE = 256;

const statusEl = document.getElementById("status");
const legendNoteEl = document.getElementById("legend-note");
const legendMinEl = document.getElementById("legend-min");
const legendMaxEl = document.getElementById("legend-max");
const colorbarEl = document.querySelector(".colorbar");
const maxSliderEl = document.getElementById("max-slider");
const sliderValueEl = document.getElementById("slider-value");
const opacitySliderEl = document.getElementById("opacity-slider");
const opacityValueEl = document.getElementById("opacity-value");
const riverSliderEl = document.getElementById("river-slider");
const riverSliderValueEl = document.getElementById("river-slider-value");
const floodCellCountEl = document.getElementById("flood-cell-count");
const riverBaseInputEl = document.getElementById("river-base-input");
const riverSeedInputEl = document.getElementById("river-seed-input");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const progressEl = document.getElementById("progress-indicator");
const progressValueEl = document.getElementById("progress-value");
const multiSelectToggle = document.getElementById("multi-select-toggle");
const legendEl = document.querySelector(".legend");
const legendToggleEl = document.getElementById("legend-toggle");

const originalFetch = window.fetch.bind(window);
let activeDownloadTracker = null;

const isCogRequest = (url) =>
  typeof url === "string" && url.includes(COG_URL);

window.fetch = async (input, init = {}) => {
  const requestUrl = typeof input === "string" ? input : input?.url;
  const response = await originalFetch(input, init);
  if (
    !activeDownloadTracker ||
    !requestUrl ||
    !isCogRequest(requestUrl) ||
    !response.body
  ) {
    return response;
  }

  const headers = new Headers();
  response.headers.forEach((value, key) => headers.append(key, value));
  const contentLengthHeader =
    headers.get("content-length") || headers.get("Content-Length");
  const contentLength = contentLengthHeader
    ? parseInt(contentLengthHeader, 10)
    : null;
  if (contentLength && !Number.isNaN(contentLength)) {
    activeDownloadTracker.total += contentLength;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    activeDownloadTracker.loaded += value.byteLength;
    const totalBytes = Math.max(
      activeDownloadTracker.total,
      activeDownloadTracker.loaded
    );
    const percent = totalBytes
      ? Math.min(
          99,
          Math.max(
            1,
            Math.round((activeDownloadTracker.loaded / totalBytes) * 100)
          )
        )
      : 0;
    updateProgress(percent);
  }

  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Response(combined.buffer, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const normalizeText = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const createProvince = (name, lat, lon, extraAliases = []) => ({
  name,
  lat,
  lon,
  tokens: [
    normalizeText(name),
    ...extraAliases.map((alias) => normalizeText(alias)),
  ],
});

const PROVINCE_DATA = [
  ["Amnat Charoen", 15.858, 104.628, ["amnatcharoen"]],
  ["Ang Thong", 14.588, 100.455],
  ["Bangkok", 13.7563, 100.5018, ["krungthep", "bkk"]],
  ["Bueng Kan", 18.363, 103.649, ["buangkan"]],
  ["Buri Ram", 15.0, 103.118, ["buriram"]],
  ["Chachoengsao", 13.69, 101.077, ["paetriu"]],
  ["Chai Nat", 15.186, 100.125, ["chainat"]],
  ["Chaiyaphum", 15.806, 102.031],
  ["Chanthaburi", 12.611, 102.103],
  ["Chiang Mai", 18.7883, 98.9853],
  ["Chiang Rai", 19.91, 99.84],
  ["Chonburi", 13.361, 100.983, ["chon buri", "pattaya"]],
  ["Chumphon", 10.493, 99.18],
  ["Kalasin", 16.441, 103.507],
  ["Kamphaeng Phet", 16.482, 99.522],
  ["Kanchanaburi", 14.022, 99.532],
  ["Khon Kaen", 16.442, 102.835],
  ["Krabi", 8.086, 98.906],
  ["Lampang", 18.288, 99.492],
  ["Lamphun", 18.58, 99.009],
  ["Loei", 17.491, 101.723],
  ["Lopburi", 14.799, 100.653, ["lop buri"]],
  ["Mae Hong Son", 19.3, 97.969],
  ["Maha Sarakham", 16.184, 103.302],
  ["Mukdahan", 16.545, 104.719],
  ["Nakhon Nayok", 14.203, 101.213],
  ["Nakhon Pathom", 13.819, 100.062],
  ["Nakhon Phanom", 17.413, 104.778],
  ["Nakhon Ratchasima", 14.979, 102.097, ["korat"]],
  ["Nakhon Sawan", 15.693, 100.122],
  ["Nakhon Si Thammarat", 8.43, 99.963, ["nst"]],
  ["Nan", 18.775, 100.773],
  ["Narathiwat", 6.429, 101.821],
  ["Nong Bua Lam Phu", 17.204, 102.439, ["nongbualamphu"]],
  ["Nong Khai", 17.877, 102.744],
  ["Nonthaburi", 13.862, 100.513],
  ["Pathum Thani", 14.021, 100.525],
  ["Pattani", 6.868, 101.25],
  ["Phang Nga", 8.451, 98.534, ["phangnga"]],
  ["Phatthalung", 7.617, 100.077],
  ["Phayao", 19.169, 99.901],
  ["Phetchabun", 16.41, 101.16],
  ["Phetchaburi", 13.111, 99.944],
  ["Phichit", 16.441, 100.345],
  ["Phitsanulok", 16.821, 100.264],
  ["Phra Nakhon Si Ayutthaya", 14.353, 100.568, ["ayutthaya", "ayudhaya"]],
  ["Phrae", 18.144, 100.141],
  ["Phuket", 7.88, 98.392],
  ["Prachinburi", 14.049, 101.37],
  ["Prachuap Khiri Khan", 11.802, 99.796, ["prachuap"]],
  ["Ranong", 9.965, 98.638],
  ["Ratchaburi", 13.545, 99.818],
  ["Rayong", 12.678, 101.256],
  ["Roi Et", 16.051, 103.652],
  ["Sa Kaeo", 13.824, 102.064, ["sakaeo"]],
  ["Sakon Nakhon", 17.168, 104.148],
  ["Samut Prakan", 13.599, 100.598],
  ["Samut Sakhon", 13.547, 100.274],
  ["Samut Songkhram", 13.409, 100.0],
  ["Saraburi", 14.528, 100.913],
  ["Satun", 6.623, 100.067],
  ["Sing Buri", 14.887, 100.404, ["singburi"]],
  ["Sisaket", 15.115, 104.329, ["si sa ket"]],
  ["Songkhla", 7.199, 100.595],
  ["Sukhothai", 17.007, 99.823],
  ["Suphan Buri", 14.474, 100.117],
  ["Surat Thani", 9.138, 99.333],
  ["Surin", 14.882, 103.493],
  ["Tak", 16.883, 99.125],
  ["Trang", 7.556, 99.611],
  ["Trat", 12.242, 102.517],
  ["Ubon Ratchathani", 15.24, 104.848, ["ubon"]],
  ["Udon Thani", 17.413, 102.789, ["udon"]],
  ["Uthai Thani", 15.379, 100.023],
  ["Uttaradit", 17.612, 100.103],
  ["Yala", 6.542, 101.282],
  ["Yasothon", 15.792, 104.147],
];

const PROVINCE_CENTROIDS = PROVINCE_DATA.map(([name, lat, lon, aliases = []]) =>
  createProvince(name, lat, lon, aliases)
);

const map = L.map("map", {
  minZoom: 4,
  zoomControl: false,
  maxBounds: THAILAND_BOUNDS,
  maxBoundsViscosity: 1.0,
  worldCopyJump: true,
}).setView([13.7563, 100.5018], 12);

const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

L.control
  .scale({
    position: "bottomright",
    imperial: false,
  })
  .addTo(map);

const gridLayer = L.layerGroup().addTo(map);
const overlayLayer = L.layerGroup().addTo(map);
const selectionLayer = L.layerGroup().addTo(map);
const popup = L.popup({
  closeButton: false,
  autoPanPadding: [32, 32],
});

const overlays = [];
let currentOverlayEntry = null;
let selectionBounds = null;
let currentTileData = null;
let sliderOverride = null;
let currentOpacity = 0.7;
const DEFAULT_BASE_RIVER_LEVEL = 3;
const MIN_BASE_RIVER_LEVEL = 0;
const MAX_BASE_RIVER_LEVEL = 20;
const DEFAULT_MIN_RIVER_SEED_CELLS = 30;
const MAX_RIVER_SEED_CELLS = 5000;
const FLOOD_TINT = [79, 196, 255];
const FLOOD_TINT_WEIGHT = 0.65;
let baseRiverLevel = DEFAULT_BASE_RIVER_LEVEL;
let riverLevel = DEFAULT_BASE_RIVER_LEVEL;
let minRiverSeedCells = DEFAULT_MIN_RIVER_SEED_CELLS;
let imagePromise = null;
let imageMetadata = null;
let pendingRequestId = 0;
let multiSelectEnabled = false;

const setStatus = (text, { persistent = false } = {}) => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.remove("hidden");
  if (!persistent) {
    clearTimeout(setStatus._timer);
    setStatus._timer = setTimeout(() => {
      statusEl.classList.add("hidden");
    }, 2600);
  }
};

const showProgress = (percent = 0) => {
  if (!progressEl) return;
  progressEl.classList.remove("hidden");
  if (progressValueEl) progressValueEl.textContent = `${percent}%`;
};

const updateProgress = (percent) => {
  if (!progressEl || !progressValueEl) return;
  progressValueEl.textContent = `${percent}%`;
};

const hideProgress = () => {
  if (!progressEl) return;
  progressEl.classList.add("hidden");
};

const startDownloadTracker = () => {
  activeDownloadTracker = { total: 0, loaded: 0 };
};

const stopDownloadTracker = () => {
  activeDownloadTracker = null;
};

const getAggregatedStats = () => {
  if (overlays.length === 0) return null;
  const min = overlays.reduce(
    (acc, entry) => Math.min(acc, entry.tileData.min),
    Number.POSITIVE_INFINITY
  );
  const max = overlays.reduce(
    (acc, entry) => Math.max(acc, entry.tileData.max),
    Number.NEGATIVE_INFINITY
  );
  return { min, max };
};

const configureSlider = () => {
  if (!maxSliderEl) return;
  const stats = overlays.length > 0 ? getAggregatedStats() : null;
  if (!stats) {
    disableSlider();
    return;
  }
  maxSliderEl.disabled = false;
  const minValue = Math.floor(stats.min);
  const maxValue = Math.ceil(stats.max);
  maxSliderEl.min = minValue;
  maxSliderEl.max = maxValue;
  const targetValue = sliderOverride !== null ? sliderOverride : maxValue;
  const minBound = Math.min(stats.min + 0.1, stats.max);
  const clampedValue = clamp(targetValue, minBound, stats.max);
  maxSliderEl.value = clampedValue;
  if (sliderValueEl) {
    sliderValueEl.textContent = formatElevation(clampedValue);
  }
};

const createOverlayEntry = (tileData) => {
  const { url, max, floodCellCount } = generateOverlayDataUrl(
    tileData,
    sliderOverride,
    riverLevel
  );
  const layer = L.imageOverlay(url, tileData.bounds, {
    opacity: currentOpacity,
    interactive: false,
    pane: "overlayPane",
  }).addTo(overlayLayer);
  const imageEl = layer.getElement();
  if (imageEl) {
    imageEl.style.imageRendering = "pixelated";
  }
  return {
    layer,
    tileData,
    effectiveMax: max,
    isOverride: sliderOverride !== null,
    floodCellCount,
  };
};

const reRenderOverlays = () => {
  overlays.forEach((entry, idx) => {
    overlayLayer.removeLayer(entry.layer);
    const newEntry = createOverlayEntry(entry.tileData);
    overlays[idx] = newEntry;
    if (entry === currentOverlayEntry) {
      currentOverlayEntry = newEntry;
    }
  });
  configureSlider();
  updateLegendFromOverlays();
};

const updateLegendFromOverlays = () => {
  if (overlays.length === 0) {
    updateLegend(-50, 4000, "Click a grid cell to stream DEM data.");
    updateFloodSummary();
    return;
  }
  const aggregatedMin = overlays.reduce(
    (acc, entry) => Math.min(acc, entry.tileData.min),
    Number.POSITIVE_INFINITY
  );
  const aggregatedMax =
    sliderOverride !== null
      ? sliderOverride
      : overlays.reduce(
          (acc, entry) => Math.max(acc, entry.effectiveMax),
          Number.NEGATIVE_INFINITY
        );
  let note = DEFAULT_CELL_NOTE;
  if (sliderOverride !== null) {
    note = !multiSelectEnabled || overlays.length === 1
      ? sliderNote(sliderOverride)
      : `Combined stats (max slider: ${formatElevation(sliderOverride)})`;
  } else if (!multiSelectEnabled || overlays.length === 1) {
    const entry = currentOverlayEntry ?? overlays[overlays.length - 1];
    note = entry?.isOverride
      ? sliderNote(entry.effectiveMax)
      : DEFAULT_CELL_NOTE;
  } else {
    note = "Combined stats for selected cells.";
  }
  updateLegend(aggregatedMin, aggregatedMax, note);
  updateFloodSummary();
};

const clearOverlays = () => {
  overlays.forEach(({ layer }) => overlayLayer.removeLayer(layer));
  overlays.length = 0;
  currentOverlayEntry = null;
  sliderOverride = null;
  configureSlider();
  updateLegendFromOverlays();
};

const formatElevation = (value) =>
  Number.isFinite(value) ? `${Math.round(value).toLocaleString()} m` : "n/a";
const formatElevationPrecise = (value) =>
  Number.isFinite(value)
    ? `${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} m`
    : "n/a";

const formatWaterLevel = (value) =>
  Number.isFinite(value) ? `${value.toFixed(1)} m` : "n/a";

const rgbToCss = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

const buildGradient = (min, max) => {
  const stops = [];
  const segments = 5;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const value = min + t * (max - min);
    const color = valueToColor(value, min, max);
    stops.push(`${rgbToCss(color)} ${t * 100}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
};

const blendColors = (base, tint, tintWeight = FLOOD_TINT_WEIGHT) => {
  const clampedWeight = Math.max(0, Math.min(1, tintWeight));
  const baseWeight = 1 - clampedWeight;
  return [
    Math.round(base[0] * baseWeight + tint[0] * clampedWeight),
    Math.round(base[1] * baseWeight + tint[1] * clampedWeight),
    Math.round(base[2] * baseWeight + tint[2] * clampedWeight),
  ];
};

const computeConnectedFloodMask = (
  tileData,
  waterLevel,
  baseThreshold = baseRiverLevel
) => {
  const { width, height, values, noData } = tileData;
  const totalCells = width * height;
  const mask = new Uint8Array(totalCells);
  if (!Number.isFinite(waterLevel) || totalCells === 0) {
    return { mask, count: 0 };
  }
  const effectiveWaterLevel = Math.max(waterLevel, baseThreshold);
  const queue = [];
  const visited = new Uint8Array(totalCells);
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const neighbors = (idx) => {
    const row = Math.floor(idx / width);
    const col = idx % width;
    return directions
      .map(([dr, dc]) => [row + dr, col + dc])
      .filter(
        ([r, c]) => r >= 0 && r < height && c >= 0 && c < width
      )
      .map(([r, c]) => r * width + c);
  };

  for (let idx = 0; idx < totalCells; idx += 1) {
    if (visited[idx]) continue;
    const elevation = values[idx];
    if (!Number.isFinite(elevation) || elevation === noData) {
      visited[idx] = 1;
      continue;
    }
    if (elevation > baseThreshold) {
      visited[idx] = 1;
      continue;
    }
    const component = [];
    const stack = [idx];
    visited[idx] = 1;
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const neighborIdx of neighbors(current)) {
        if (visited[neighborIdx]) continue;
        const neighborElevation = values[neighborIdx];
        visited[neighborIdx] = 1;
        if (
          !Number.isFinite(neighborElevation) ||
          neighborElevation === noData ||
          neighborElevation > baseThreshold
        ) {
          continue;
        }
        stack.push(neighborIdx);
      }
    }
    if (component.length >= minRiverSeedCells) {
      for (const cellIdx of component) {
        mask[cellIdx] = 1;
        queue.push(cellIdx);
      }
    }
  }
  let count = queue.length;
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const row = Math.floor(current / width);
    const col = current % width;
    const adjacent = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];
    for (const [r, c] of adjacent) {
      if (r < 0 || r >= height || c < 0 || c >= width) continue;
      const idx = r * width + c;
      if (mask[idx] === 1) continue;
      const elevation = values[idx];
      if (!Number.isFinite(elevation) || elevation === noData) continue;
      if (elevation <= effectiveWaterLevel) {
        mask[idx] = 1;
        queue.push(idx);
        count += 1;
      }
    }
  }
  return { mask, count };
};

const updateLegend = (min, max, note) => {
  if (legendNoteEl) legendNoteEl.textContent = note;
  if (legendMinEl) legendMinEl.textContent = formatElevation(min);
  if (legendMaxEl) legendMaxEl.textContent = formatElevation(max);
  if (colorbarEl) {
    colorbarEl.style.background = buildGradient(min, max);
  }
};

const updateFloodSummary = () => {
  if (!floodCellCountEl) return;
  const totalFloodCells = overlays.reduce(
    (sum, entry) => sum + (entry.floodCellCount ?? 0),
    0
  );
  floodCellCountEl.textContent = totalFloodCells.toLocaleString();
};

const syncLegendToggleState = () => {
  if (!legendToggleEl || !legendEl) return;
  const collapsed = legendEl.classList.contains("collapsed");
  legendToggleEl.textContent = "X";
  legendToggleEl.setAttribute("aria-expanded", collapsed ? "false" : "true");
  legendToggleEl.setAttribute(
    "aria-label",
    collapsed ? "Expand legend panel" : "Collapse legend panel"
  );
};

const toggleLegend = () => {
  if (!legendEl) return;
  legendEl.classList.toggle("collapsed");
  syncLegendToggleState();
};

if (legendToggleEl && legendEl) {
  legendToggleEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleLegend();
  });
  legendToggleEl.addEventListener(
    "touchend",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleLegend();
    },
    { passive: false }
  );
  syncLegendToggleState();
}

const disableSlider = () => {
  if (maxSliderEl) {
    maxSliderEl.disabled = true;
    sliderValueEl && (sliderValueEl.textContent = "…");
  }
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizeBaseRiverLevel = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BASE_RIVER_LEVEL;
  }
  return clamp(parsed, MIN_BASE_RIVER_LEVEL, MAX_BASE_RIVER_LEVEL);
};
const applyBaseRiverLevel = (value, { silent = false } = {}) => {
  const normalized = normalizeBaseRiverLevel(value);
  baseRiverLevel = normalized;
  if (riverBaseInputEl) {
    riverBaseInputEl.value = normalized.toFixed(1);
  }
  if (riverLevel < baseRiverLevel) {
    riverLevel = baseRiverLevel;
    if (riverSliderEl) {
      riverSliderEl.value = riverLevel;
    }
    updateRiverSliderDisplay();
  }
  if (overlays.length > 0) {
    reRenderOverlays();
  } else {
    updateFloodSummary();
  }
  if (!silent) {
    setStatus(`Base river level set to ${formatWaterLevel(baseRiverLevel)}`);
  }
  return normalized;
};
const handleRiverBaseInput = () => {
  if (!riverBaseInputEl) return;
  applyBaseRiverLevel(riverBaseInputEl.value);
};
const normalizeRiverSeedValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MIN_RIVER_SEED_CELLS;
  }
  return clamp(Math.round(parsed), 1, MAX_RIVER_SEED_CELLS);
};
const applyMinRiverSeedCells = (value, { silent = false } = {}) => {
  const normalized = normalizeRiverSeedValue(value);
  minRiverSeedCells = normalized;
  if (riverSeedInputEl) {
    riverSeedInputEl.value = String(normalized);
  }
  if (overlays.length > 0) {
    reRenderOverlays();
  } else {
    updateFloodSummary();
  }
  if (!silent) {
    setStatus(`Min river cells set to ${normalized.toLocaleString()}`);
  }
  return normalized;
};
const handleRiverSeedInput = () => {
  if (!riverSeedInputEl) return;
  applyMinRiverSeedCells(riverSeedInputEl.value);
};
const clampLatLon = ([lat, lon]) => {
  const latClamped = clamp(lat, THAILAND_BOUNDS[0][0], THAILAND_BOUNDS[1][0]);
  const lonClamped = clamp(lon, THAILAND_BOUNDS[0][1], THAILAND_BOUNDS[1][1]);
  return [latClamped, lonClamped];
};

const hslToRgb = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (0 <= hPrime && hPrime < 1) {
    r = c;
    g = x;
  } else if (1 <= hPrime && hPrime < 2) {
    r = x;
    g = c;
  } else if (2 <= hPrime && hPrime < 3) {
    g = c;
    b = x;
  } else if (3 <= hPrime && hPrime < 4) {
    g = x;
    b = c;
  } else if (4 <= hPrime && hPrime < 5) {
    r = x;
    b = c;
  } else if (5 <= hPrime && hPrime < 6) {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
};

const valueToColor = (value, min, max) => {
  const range = Math.max(1e-6, max - min);
  const t = clamp((value - min) / range, 0, 1);
  const hue = 210 - t * 210;
  const saturation = 0.75;
  const lightness = 0.25 + t * 0.5;
  return hslToRgb(hue, saturation, lightness);
};

const DEFAULT_CELL_NOTE =
  "Stats for selected cell (~0.02°). Drag sliders to tweak max or opacity.";
const sliderNote = (value) =>
  `Stats for selected cell (~0.02°). Slider max: ${formatElevation(value)}.`;

const generateOverlayDataUrl = (
  tileData,
  maxValue,
  waterLevel = baseRiverLevel
) => {
  const { values, width, height, min, max, noData } = tileData;
  const effectiveMax = clamp(
    maxValue ?? max,
    min + 1e-3,
    max
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;
  const { mask, count: floodCellCount } = computeConnectedFloodMask(
    tileData,
    waterLevel
  );

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const offset = i * 4;
    if (!Number.isFinite(value) || value === noData) {
      out[offset + 3] = 0;
      continue;
    }
    const [r, g, b] = valueToColor(value, min, effectiveMax);
    const color = mask[i] === 1 ? blendColors([r, g, b], FLOOD_TINT) : [r, g, b];
    out[offset] = color[0];
    out[offset + 1] = color[1];
    out[offset + 2] = color[2];
    out[offset + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return {
    url: canvas.toDataURL("image/png"),
    max: effectiveMax,
    floodCellCount,
  };
};

const applyOverlayFromTile = (tileData) => {
  if (!tileData) return;
  if (!multiSelectEnabled) {
    clearOverlays();
  }
  const entry = createOverlayEntry(tileData);
  overlays.push(entry);
  currentOverlayEntry = entry;
  configureSlider();
  updateLegendFromOverlays();
};

const handleSliderInput = () => {
  if (!maxSliderEl) return;
  const stats = overlays.length > 0 ? getAggregatedStats() : null;
  if (!stats) return;
  const rawValue = Number(maxSliderEl.value);
  const minBound = Math.min(stats.min + 0.1, stats.max);
  const adjusted = clamp(rawValue, minBound, stats.max);
  sliderOverride = adjusted;
  if (sliderValueEl) {
    sliderValueEl.textContent = formatElevation(adjusted);
  }
  reRenderOverlays();
  setStatus(`Max slider set to ${formatElevation(adjusted)}`);
};

if (maxSliderEl) {
  maxSliderEl.addEventListener("input", handleSliderInput);
}

const handleOpacityInput = () => {
  if (!opacitySliderEl) return;
  const percentage = clamp(Number(opacitySliderEl.value), 10, 100);
  currentOpacity = percentage / 100;
  if (opacityValueEl) {
    opacityValueEl.textContent = `${percentage}%`;
  }
  overlays.forEach(({ layer }) => layer.setOpacity(currentOpacity));
};

if (opacitySliderEl) {
  opacitySliderEl.addEventListener("input", handleOpacityInput);
  handleOpacityInput();
}

const updateRiverSliderDisplay = () => {
  if (riverSliderValueEl) {
    riverSliderValueEl.textContent = formatWaterLevel(riverLevel);
  }
};

const handleRiverSliderInput = () => {
  if (!riverSliderEl) return;
  const nextValue = Number(riverSliderEl.value);
  riverLevel = Number.isFinite(nextValue)
    ? Math.max(baseRiverLevel, nextValue)
    : baseRiverLevel;
  riverSliderEl.value = riverLevel;
  updateRiverSliderDisplay();
  if (overlays.length > 0) {
    reRenderOverlays();
  } else {
    updateFloodSummary();
  }
  setStatus(`Water height set to ${formatWaterLevel(riverLevel)}`);
};

if (riverBaseInputEl) {
  applyBaseRiverLevel(riverBaseInputEl.value, { silent: true });
  riverBaseInputEl.addEventListener("change", handleRiverBaseInput);
  riverBaseInputEl.addEventListener("blur", handleRiverBaseInput);
  riverBaseInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleRiverBaseInput();
    }
  });
} else {
  applyBaseRiverLevel(DEFAULT_BASE_RIVER_LEVEL, { silent: true });
}

if (riverSliderEl) {
  const initialValue = Number(riverSliderEl.value);
  riverLevel = Number.isFinite(initialValue)
    ? Math.max(baseRiverLevel, initialValue)
    : baseRiverLevel;
  riverSliderEl.value = riverLevel;
  updateRiverSliderDisplay();
  riverSliderEl.addEventListener("input", handleRiverSliderInput);
} else {
  updateRiverSliderDisplay();
}

if (riverSeedInputEl) {
  applyMinRiverSeedCells(riverSeedInputEl.value, { silent: true });
  riverSeedInputEl.addEventListener("change", handleRiverSeedInput);
  riverSeedInputEl.addEventListener("blur", handleRiverSeedInput);
  riverSeedInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleRiverSeedInput();
    }
  });
} else {
  applyMinRiverSeedCells(DEFAULT_MIN_RIVER_SEED_CELLS, { silent: true });
}

async function getImage() {
  if (!imagePromise) {
    imagePromise = GeoTIFF.fromUrl(COG_URL).then((tiff) => tiff.getImage());
  }
  return imagePromise;
}

async function ensureMetadata() {
  if (imageMetadata) return imageMetadata;
  const image = await getImage();
  const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
  const resolution = image.getResolution();
  imageMetadata = {
    image,
    width: image.getWidth(),
    height: image.getHeight(),
    minX: bbox[0],
    minY: bbox[1],
    maxX: bbox[2],
    maxY: bbox[3],
    pixelWidth: resolution[0],
    pixelHeight: Math.abs(resolution[1]),
    noData: image.getGDALNoData(),
  };
  return imageMetadata;
}

const lonToCol = (lon, meta) =>
  clamp(Math.floor((lon - meta.minX) / meta.pixelWidth), 0, meta.width);

const latToRow = (lat, meta) =>
  clamp(Math.floor((meta.maxY - lat) / meta.pixelHeight), 0, meta.height);

const clampToBounds = (value, [min, max]) => clamp(value, min, max);

const updateSelectionHighlight = () => {
  selectionLayer.clearLayers();
  if (!selectionBounds) return;
  L.rectangle(selectionBounds, {
    color: "#4da3ff",
    weight: 2,
    fillOpacity: 0.1,
  }).addTo(selectionLayer);
};

const alignToGrid = (value) =>
  Math.floor(value / GRID_STEP_DEG) * GRID_STEP_DEG;

function updateGrid() {
  gridLayer.clearLayers();
  const bounds = map.getBounds();
  const [south, west] = THAILAND_BOUNDS[0];
  const [north, east] = THAILAND_BOUNDS[1];
  const viewSouth = clampToBounds(bounds.getSouth(), [south, north]);
  const viewNorth = clampToBounds(bounds.getNorth(), [south, north]);
  const viewWest = clampToBounds(bounds.getWest(), [west, east]);
  const viewEast = clampToBounds(bounds.getEast(), [west, east]);

  const latStart = alignToGrid(viewSouth - GRID_STEP_DEG);
  const latEnd = alignToGrid(viewNorth + GRID_STEP_DEG);
  const lonStart = alignToGrid(viewWest - GRID_STEP_DEG);
  const lonEnd = alignToGrid(viewEast + GRID_STEP_DEG);

  for (let lat = latStart; lat < latEnd; lat += GRID_STEP_DEG) {
    const clampedLat = clamp(lat, south, north);
    const nextLat = clamp(lat + GRID_STEP_DEG, south, north);
    for (let lon = lonStart; lon < lonEnd; lon += GRID_STEP_DEG) {
      const clampedLon = clamp(lon, west, east);
      const nextLon = clamp(lon + GRID_STEP_DEG, west, east);
      const cellBounds = [
        [clampedLat, clampedLon],
        [nextLat, nextLon],
      ];
      const rect = L.rectangle(cellBounds, {
        color: "#000",
        weight: 1,
        fillOpacity: 0,
      }).addTo(gridLayer);
      rect.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        handleCellSelection(cellBounds);
      });
    }
  }
  updateSelectionHighlight();
}

async function handleCellSelection(bounds) {
  selectionBounds = bounds;
  updateSelectionHighlight();
  popup.remove();
  await renderCell(bounds);
}

async function renderCell(bounds) {
  const requestId = ++pendingRequestId;
  setStatus("Fetching DEM for selected cell…", { persistent: true });
  startDownloadTracker();
  showProgress(0);

  try {
    const meta = await ensureMetadata();
    if (requestId !== pendingRequestId) {
      hideProgress();
      stopDownloadTracker();
      return;
    }

    const north = bounds[1][0];
    const south = bounds[0][0];
    const west = bounds[0][1];
    const east = bounds[1][1];

    const colStart = lonToCol(west, meta);
    const colEnd = lonToCol(east, meta);
    const rowStart = latToRow(north, meta);
    const rowEnd = latToRow(south, meta);

    const windowWidth = Math.max(1, colEnd - colStart);
    const windowHeight = Math.max(1, rowEnd - rowStart);
    const readWidth = windowWidth;
    const readHeight = windowHeight;

    const totalPixels = readWidth * readHeight;
    const totalBytes = totalPixels * 4;
    let bytesRead = 0;
    const values = new Float32Array(totalPixels);
    let rowsFilled = 0;
    const minChunk = Math.max(1, Math.floor(readHeight / 8));
    while (rowsFilled < readHeight) {
      const chunkHeight = Math.min(
        ROW_CHUNK_SIZE,
        readHeight - rowsFilled,
        Math.max(1, minChunk)
      );
      const chunkStart = rowStart + rowsFilled;
      const chunkEnd = chunkStart + chunkHeight;
      const chunk = await meta.image.readRasters({
        window: [colStart, chunkStart, colEnd, chunkEnd],
        width: readWidth,
        height: chunkHeight,
        samples: [0],
      });
      if (requestId !== pendingRequestId) {
        hideProgress();
        stopDownloadTracker();
        return;
      }
      const chunkValues = chunk[0];
      values.set(chunkValues, rowsFilled * readWidth);
      rowsFilled += chunkHeight;
      bytesRead += chunkHeight * readWidth * 4;
      const percent = Math.max(
        1,
        Math.min(100, Math.round((bytesRead / totalBytes) * 100))
      );
      updateProgress(percent);
    }

    const { noData } = meta;

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (!Number.isFinite(value) || value === noData) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setStatus("No data in this cell.", { persistent: true });
      hideProgress();
      stopDownloadTracker();
      if (overlays.length === 0) {
        disableSlider();
      } else {
        configureSlider();
      }
      return;
    }

    currentTileData = {
      values,
      width: readWidth,
      height: readHeight,
      min,
      max,
      bounds,
      noData,
    };
    if (!multiSelectEnabled) {
      sliderOverride = null;
    }
    applyOverlayFromTile(currentTileData);
    setStatus("DEM tile ready.");
    hideProgress();
    stopDownloadTracker();
  } catch (error) {
    console.error("Failed to render cell", error);
    setStatus("Failed to render DEM tile (see console).", { persistent: true });
    hideProgress();
    stopDownloadTracker();
  }
}

const sampleValueAtLatLng = (latlng) => {
  if (!currentTileData) return null;
  const [[south, west], [north, east]] = currentTileData.bounds;
  const { width, height, values, noData } = currentTileData;
  const { lat, lng } = latlng;
  if (lat < south || lat > north || lng < west || lng > east) return null;
  const latRatio = (north - lat) / Math.max(1e-6, north - south);
  const lonRatio = (lng - west) / Math.max(1e-6, east - west);
  const row = clamp(Math.floor(latRatio * height), 0, height - 1);
  const col = clamp(Math.floor(lonRatio * width), 0, width - 1);
  const value = values[row * width + col];
  if (!Number.isFinite(value) || value === noData) return null;
  return value;
};

map.on("click", (event) => {
  const { latlng } = event;
  if (!latlng) return;
  const value = sampleValueAtLatLng(latlng);
  if (value == null) {
    popup.remove();
    if (currentTileData) {
      setStatus("Click inside highlighted cell to sample.", { persistent: false });
    }
    return;
  }
  popup
    .setLatLng(latlng)
    .setContent(
      `Elevation<br><strong>${formatElevationPrecise(value)}</strong>`
    )
    .openOn(map);
});

const tryParseLatLon = (query) => {
  const match = query
    .trim()
    .match(
      /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/
    );
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
};

const findProvinceLocation = (query) => {
  const norm = normalizeText(query);
  if (!norm) return null;
  for (const province of PROVINCE_CENTROIDS) {
    if (
      province.tokens.some(
        (token) => norm.includes(token) || token.includes(norm)
      )
    ) {
      return province;
    }
  }
  return null;
};

const handleSearch = (query) => {
  if (!query) return;
  let coords = null;
  let label = null;
  const latLon = tryParseLatLon(query);
  if (latLon) {
    coords = latLon;
    label = `${latLon[0].toFixed(3)}, ${latLon[1].toFixed(3)}`;
  } else {
    const match = findProvinceLocation(query);
    if (match) {
      coords = [match.lat, match.lon];
      label = match.name;
    }
  }
  if (!coords) {
    setStatus("Location not found. Try 'lat,lon' or known Thai cities.", {
      persistent: false,
    });
    return;
  }
  const [lat, lon] = clampLatLon(coords);
  map.flyTo([lat, lon], Math.max(map.getZoom(), 11), {
    duration: 1.2,
  });
  setStatus(
    label
      ? `Centered on ${label}`
      : `Centered on ${lat.toFixed(3)}, ${lon.toFixed(3)}`
  );
};

if (searchForm && searchInput) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSearch(searchInput.value);
  });
}

if (multiSelectToggle) {
  multiSelectToggle.addEventListener("change", (event) => {
    multiSelectEnabled = event.target.checked;
    if (!multiSelectEnabled) {
      clearOverlays();
      selectionBounds = null;
      updateSelectionHighlight();
    }
    setStatus(
      multiSelectEnabled
        ? "Multi-select enabled. Click multiple cells to compare."
        : "Multi-select disabled. Previous overlays cleared."
    );
    configureSlider();
    updateLegendFromOverlays();
  });
}

disableSlider();
updateLegend(-50, 4000, "Click a grid cell to stream DEM data.");
updateGrid();
map.on("moveend", updateGrid);
map.on("zoomend", updateGrid);
setStatus("Click a grid cell to stream DEM data.", { persistent: true });
