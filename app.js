const COG_URL =
  "https://s3.opengeohub.org/global/dtm/v1.2/gedtm_rf_m_30m_s_20060101_20151231_go_epsg.4326.3855_v1.2.tif";

const GRID_STEP_DEG = 0.02;
const GRID_VISIBILITY_ZOOM = 10;
const ROW_CHUNK_SIZE = 256;
const GBA_WFS_ENDPOINT = "https://tubvsig-so2sat-vm1.srv.mwn.de/geoserver/ows?";
const GBA_LAYER_NAME = "global3D:lod1_global";
const GBA_SRS = "EPSG:4326";
const GBA_PAGE_SIZE = 500;
const GBA_SORT_FIELD = "ogc_fid";
const TERRAIN_TEXTURE_SIZE = 1024;
const TERRAIN_MAX_ENCODED_HEIGHT = 16777215;
const TERRAIN_MESH_MAX_ERROR = 1;
const TERRAIN_VERTICAL_EXAGGERATION = 1;

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
const floodLegendEl = document.getElementById("flood-legend");
const riverBaseInputEl = document.getElementById("river-base-input");
const riverSeedInputEl = document.getElementById("river-seed-input");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const shareButtonEl = document.getElementById("share-button");
let locateButtonEl = null;
let rotateLeftBtn = null;
let rotateRightBtn = null;
let currentViewState = null;
const progressEl = document.getElementById("progress-indicator");
const progressLabelEl = document.getElementById("progress-label");
const progressValueEl = document.getElementById("progress-value");
const legendEl = document.querySelector(".legend");
const legendToggleEl = document.getElementById("legend-toggle");
const affectedBuildingRowEl = document.getElementById("affected-building-row");
const affectedBuildingCountEl = document.getElementById("affected-building-count");
const searchControlEl = document.querySelector(".search-control");
const FLOOD_LEGEND_SPACING_PX = 12;
let affectedBuildingsDebounce = null;
let affectedBuildingsJob = null;
let cachedAffectedBuildings = 0;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parseNumberParam = (params, key) => {
  const raw = params.get(key);
  const parsed = raw == null ? null : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBooleanParam = (params, key, defaultValue = false) => {
  const raw = params.get(key);
  if (raw == null) return defaultValue;
  return raw === "1" || raw.toLowerCase() === "true";
};

const INITIAL_VIEW = (() => {
  const params = new URLSearchParams(window.location.search);
  const lat = parseNumberParam(params, "lat");
  const lon = parseNumberParam(params, "lon");
  const zoom = parseNumberParam(params, "z");
  const defaultCenter = [13.7563, 100.5018];
  const center = [
    clamp(lat ?? defaultCenter[0], -90, 90),
    clamp(lon ?? defaultCenter[1], -180, 180),
  ];
  const zoomLevel = Number.isFinite(zoom) ? clamp(zoom, 1, 20) : 14;
  return { center, zoom: zoomLevel };
})();

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
  maxZoom: 20,
  zoomControl: false,
  worldCopyJump: true,
}).setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);

const buildingPaneName = "gbaPane";
map.createPane(buildingPaneName);
map.getPane(buildingPaneName).style.zIndex = 650;
map.getPane(buildingPaneName).style.pointerEvents = "auto";

const openStreetMapLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 20,
  }
);

const esriWorldImageryLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution:
      "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    maxZoom: 20,
  }
);

const BASE_LAYERS = {
  streets: openStreetMapLayer,
  satellite: esriWorldImageryLayer,
};
let currentBaseLayerId = "streets";

const setBaseLayer = (layerId) => {
  const targetId = BASE_LAYERS[layerId] ? layerId : "streets";
  Object.entries(BASE_LAYERS).forEach(([id, layer]) => {
    if (map.hasLayer(layer) && id !== targetId) {
      map.removeLayer(layer);
    }
  });
  const targetLayer = BASE_LAYERS[targetId];
  if (targetLayer && !map.hasLayer(targetLayer)) {
    targetLayer.addTo(map);
  }
  currentBaseLayerId = targetId;
};

setBaseLayer(currentBaseLayerId);

L.control
  .scale({
    position: "bottomright",
    imperial: false,
  })
  .addTo(map);

const locateControl = L.control({ position: "bottomright" });
locateControl.onAdd = () => {
  const container = L.DomUtil.create("div", "leaflet-control-locate");
  
  const createRotateBtn = (dir) => {
    const btn = L.DomUtil.create("button", "rotate-button hidden", container);
    btn.type = "button";
    btn.title = dir === "left" ? "Rotate left" : "Rotate right";
    btn.innerHTML = dir === "left" 
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`;
    
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.on(btn, "click", (e) => {
      e.preventDefault();
      if (deckgl && currentViewState) {
        const delta = dir === "left" ? -45 : 45;
        currentViewState = {
            ...currentViewState,
            bearing: currentViewState.bearing + delta,
            transitionDuration: 300,
            transitionInterpolator: new deck.LinearInterpolator(['bearing'])
        };
        deckgl.setProps({ viewState: currentViewState });
      }
    });
    return btn;
  };

  rotateLeftBtn = createRotateBtn("left");
  rotateRightBtn = createRotateBtn("right");

  const button = L.DomUtil.create("button", "locate-button", container);
  button.type = "button";
  button.title = "Go to my location";
  button.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3V21" stroke="#f7f7f8" stroke-width="2" stroke-linecap="round"/>
    <path d="M21 12H3" stroke="#f7f7f8" stroke-width="2" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="3" stroke="#f7f7f8" stroke-width="2"/>
  </svg>`;
  L.DomEvent.disableClickPropagation(button);
  L.DomEvent.on(button, "click", (event) => {
    event.preventDefault();
    handleLocateClick();
  });
  locateButtonEl = button;
  if (!navigator.geolocation) {
    button.disabled = true;
  }
  return container;
};
locateControl.addTo(map);

const gridLayer = L.layerGroup().addTo(map);
const overlayLayer = L.layerGroup().addTo(map);
const selectionLayer = L.layerGroup().addTo(map);
const buildingLayerGroup = L.layerGroup();
const threeDRenderLayer = L.layerGroup();
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
let buildingLayerEnabled = false;
const buildingLayerCache = new Map();
const buildingRequestCache = new Map();
const buildingRequestControllers = new Map();
const DEFAULT_BASE_RIVER_LEVEL = 3;
const MIN_BASE_RIVER_LEVEL = 0;
const WATER_LEVEL_MARGIN = 12;
const DEFAULT_MIN_RIVER_SEED_CELLS = 30;
const MAX_RIVER_SEED_CELLS = 10000;
const FLOOD_DEPTH_COLORS = [
  { min: 0.5, max: 1, color: [148, 197, 233] },
  { min: 1, max: 2, color: [99, 157, 223] },
  { min: 2, max: 3, color: [55, 127, 228] },
  { min: 3, max: 4, color: [46, 70, 198] },
  { min: 4, max: 5, color: [7, 38, 59] },
  { min: 5, max: Number.POSITIVE_INFINITY, color: [110, 0, 0] },
];
let baseRiverLevel = DEFAULT_BASE_RIVER_LEVEL;
let riverLevel = DEFAULT_BASE_RIVER_LEVEL;
let minRiverSeedCells = DEFAULT_MIN_RIVER_SEED_CELLS;
let imagePromise = null;
let imageMetadata = null;
let pendingRequestId = 0;
let multiSelectEnabled = true;
let worldCitiesData = null;
let worldCitiesPromise = null;
let locateInFlight = false;
let isInitializing = true;
const pendingTilesFromUrl = [];
let shareUrlCache = window.location.pathname;
let deckgl = null;
let deckGLLayer = null;
let is3DViewActive = false;

const layerControl = L.control
  .layers(
    {
      Streets: openStreetMapLayer,
      Satellite: esriWorldImageryLayer,
    },
    {
      "Global Building Atlas": buildingLayerGroup,
      "3D View": threeDRenderLayer,
    },
    { position: "topright" }
  )
  .addTo(map);
const layerControlEl = layerControl.getContainer();

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

let progressOwner = null;

const showProgress = (
  percent = 0,
  owner = "dem",
  label = "Downloading DEM…"
) => {
  progressOwner = owner;
  if (!progressEl) return;
  progressEl.classList.remove("hidden");
  if (progressLabelEl) progressLabelEl.textContent = label;
  if (progressValueEl) progressValueEl.textContent = `${percent}%`;
};

const updateProgress = (percent, owner = null) => {
  if (owner && progressOwner && owner !== progressOwner) return;
  if (!progressEl || !progressValueEl) return;
  progressValueEl.textContent = `${percent}%`;
};

const hideProgress = (owner = null) => {
  if (owner && progressOwner && owner !== progressOwner) return;
  progressOwner = null;
  if (!progressEl) return;
  progressEl.classList.add("hidden");
};

const startDownloadTracker = () => {
  activeDownloadTracker = { total: 0, loaded: 0 };
};

const stopDownloadTracker = () => {
  activeDownloadTracker = null;
};

let buildingProgressActive = false;
const startBuildingProgress = () => {
  buildingProgressActive = true;
  showProgress(0, "building", "Downloading buildings…");
};
const updateBuildingProgress = (percent) => {
  if (!buildingProgressActive) return;
  const clamped = clamp(Math.round(percent), 1, 100);
  updateProgress(clamped, "building");
};
const stopBuildingProgress = () => {
  if (!buildingProgressActive) return;
  hideProgress("building");
  buildingProgressActive = false;
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

const boundsKey = (bounds) => {
  const [[south, west], [north, east]] = bounds;
  return [
    south.toFixed(5),
    west.toFixed(5),
    north.toFixed(5),
    east.toFixed(5),
  ].join(",");
};

const findOverlayByKey = (key) =>
  overlays.find((entry) => entry.key === key) ?? null;

const createOverlayEntry = (
  tileData,
  floodMaskData,
  key = boundsKey(tileData.bounds),
  colorScaleMin = tileData.min,
  colorScaleMax = tileData.max
) => {
  const { url, max, floodCellCount, floodMaskData: appliedFloodMask } = generateOverlayDataUrl(
    tileData,
    sliderOverride,
    riverLevel,
    floodMaskData,
    colorScaleMin,
    colorScaleMax
  );
  const layer = L.imageOverlay(url, tileData.bounds, {
    opacity: currentOpacity,
    interactive: false,
    pane: "overlayPane",
  }).addTo(overlayLayer);
  const imageEl = layer.getElement();
  if (imageEl) {
    imageEl.style.imageRendering = "pixelated";
    imageEl.style.pointerEvents = "none";
  }
  return {
    layer,
    tileData,
    key,
    effectiveMax: max,
    isOverride: sliderOverride !== null,
    floodCellCount,
    floodMaskData: appliedFloodMask,
  };
};

const reRenderOverlays = () => {
  const tileDatas = overlays.map((entry) => entry.tileData);
  const sharedMin =
    multiSelectEnabled && tileDatas.length > 0
      ? computeColorScaleMin(tileDatas)
      : null;
  const sharedMax =
    multiSelectEnabled && tileDatas.length > 0 && sliderOverride == null
      ? computeColorScaleMax(tileDatas)
      : sliderOverride;
  const floodMaskMap = buildFloodMaskMap(tileDatas, riverLevel);
  overlays.forEach((entry, idx) => {
    overlayLayer.removeLayer(entry.layer);
    const maskData = floodMaskMap.get(entry.tileData);
    const newEntry = createOverlayEntry(
      entry.tileData,
      maskData,
      entry.key,
      sharedMin ?? entry.tileData.min,
      sharedMax ?? entry.tileData.max
    );
    overlays[idx] = newEntry;
    if (entry === currentOverlayEntry) {
      currentOverlayEntry = newEntry;
    }
  });
  configureSlider();
  updateLegendFromOverlays();
  updateDeckGL();
  syncUrlFromState();
};

const updateLegendFromOverlays = () => {
  if (overlays.length === 0) {
    updateLegend(-50, 4000, "");
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
  updateLegend(aggregatedMin, aggregatedMax, "");
  updateFloodSummary();
};

const computeColorScaleMin = (tileDatas) => {
  const mins = tileDatas
    .map((tile) => tile?.min)
    .filter((value) => Number.isFinite(value));
  if (mins.length === 0) return null;
  return mins.reduce((acc, value) => Math.min(acc, value), mins[0]);
};

const computeColorScaleMax = (tileDatas) => {
  const maxes = tileDatas
    .map((tile) => tile?.max)
    .filter((value) => Number.isFinite(value));
  if (maxes.length === 0) return null;
  return maxes.reduce((acc, value) => Math.max(acc, value), maxes[0]);
};

const ensureBuildingLayerVisibility = () => {
  if (buildingLayerEnabled) {
    if (!map.hasLayer(buildingLayerGroup)) {
      buildingLayerGroup.addTo(map);
    }
  } else if (map.hasLayer(buildingLayerGroup)) {
    map.removeLayer(buildingLayerGroup);
  }
};

const clearBuildingRequests = () => {
  buildingRequestControllers.forEach((controller) => controller.abort());
  buildingRequestControllers.clear();
  buildingRequestCache.clear();
};

const clearBuildingLayers = (resetCache = false) => {
  clearBuildingRequests();
  buildingLayerGroup.clearLayers();
  if (resetCache) {
    buildingLayerCache.clear();
  }
};

const buildGbaRequestUrl = (
  bounds,
  startIndex = 0,
  count = GBA_PAGE_SIZE
) => {
  const [[south, west], [north, east]] = bounds;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: GBA_LAYER_NAME,
    outputFormat: "application/json",
    srsName: GBA_SRS,
    bbox: `${west},${south},${east},${north},${GBA_SRS}`,
  });
  if (GBA_SORT_FIELD) {
    params.set("sortBy", GBA_SORT_FIELD);
  }
  if (count != null) {
    params.set("count", count);
  }
  if (startIndex > 0) {
    params.set("startIndex", startIndex);
  }
  return `${GBA_WFS_ENDPOINT}${params.toString()}`;
};

const fetchBuildingsForBounds = async (bounds, cacheKey) => {
  if (buildingRequestCache.has(cacheKey)) {
    return buildingRequestCache.get(cacheKey);
  }
  const controller = new AbortController();
  buildingRequestControllers.set(cacheKey, controller);
  const promise = (async () => {
    const fetchPage = async (startIndex, pageSize) => {
      const url = buildGbaRequestUrl(bounds, startIndex, pageSize);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const message = body ? `${response.status}: ${body.slice(0, 200)}` : `${response.status}`;
        throw new Error(`Failed to fetch Global Building Atlas page @${startIndex} (${message})`);
      }
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (parseError) {
        throw new Error(
          `Failed to parse Global Building Atlas page @${startIndex}: ${parseError?.message || parseError}`
        );
      }
    };

    const fetchPageWithRetry = async (startIndex, pageSize, attempts = 3) => {
      let lastError = null;
      for (let i = 0; i < attempts; i += 1) {
        try {
          return await fetchPage(startIndex, pageSize);
        } catch (error) {
          lastError = error;
          if (i < attempts - 1) {
            // Brief backoff to give the WFS a chance to recover.
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
      }
      throw lastError;
    };

    const pageSizes = Array.from(
      new Set([GBA_PAGE_SIZE, 200, 100].filter((size) => Number.isFinite(size) && size > 0))
    );
    let lastError = null;

    for (const pageSize of pageSizes) {
      const features = [];
      let template = null;
      let startIndex = 0;
      let total = null;
      try {
        startBuildingProgress();
        updateBuildingProgress(1);
        while (true) {
          const data = await fetchPageWithRetry(startIndex, pageSize);
          const pageFeatures = Array.isArray(data?.features) ? data.features : [];
          if (!template) {
            template = data;
          }
          features.push(...pageFeatures);
          const loaded = features.length;
          if (pageFeatures.length < pageSize) {
            total = startIndex + pageFeatures.length;
          }
          const percent = total
            ? (loaded / Math.max(total, 1)) * 100
            : Math.min(90, (loaded / Math.max(loaded + pageSize, 1)) * 100);
          updateBuildingProgress(percent);

          if (!Number.isFinite(pageSize) || pageFeatures.length < pageSize) {
            break;
          }
          startIndex += pageSize;
        }
        updateBuildingProgress(100);
        const collection = { ...(template || {}), features };
        collection.features = features;
        return collection;
      } catch (error) {
        lastError = error;
      } finally {
        stopBuildingProgress();
      }
    }
    throw lastError;
  })();
  buildingRequestCache.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    buildingRequestControllers.delete(cacheKey);
    buildingRequestCache.delete(cacheKey);
  }
};

const buildBuildingPopupContent = (feature, latlng) => {
  const height = Number(feature?.properties?.height);
  const { elevation, depth } = getFloodDepthAtLatLng(latlng);
  const heightText = Number.isFinite(height)
    ? `${height.toFixed(1)} m`
    : "n/a";
  const elevationText =
    elevation != null ? formatElevationPrecise(elevation) : "n/a";
  const depthText = formatWaterLevel(depth);
  return `
    <div>
      <div><strong>Building height:</strong> ${heightText}</div>
      <div><strong>Ground elevation (MSL):</strong> ${elevationText}</div>
      <div><strong>Flood depth:</strong> ${depthText}</div>
    </div>
  `;
};

const getCachedBuildingEntry = (cacheKey) => buildingLayerCache.get(cacheKey) || null;

const featureCentroid = (feature) => {
  const geom = feature?.geometry;
  if (!geom || !geom.coordinates) return null;
  const coords = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  coords.forEach((poly) => {
    poly.forEach((ring) => {
      ring.forEach(([x, y]) => {
        sumX += x;
        sumY += y;
        count += 1;
      });
    });
  });
  if (count === 0) return null;
  return [sumY / count, sumX / count];
};

const featureTouchesFlood = (feature, tileData, maskData) => {
  if (!maskData?.mask || !tileData?.bounds) return false;
  const centroid = featureCentroid(feature);
  if (!centroid) return false;
  const [lat, lng] = centroid;
  const [[south, west], [north, east]] = tileData.bounds;
  if (lat < south || lat > north || lng < west || lng > east) return false;
  const { width, height, mask } = { width: tileData.width, height: tileData.height, mask: maskData.mask };
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  const latRatio = (north - lat) / Math.max(1e-6, north - south);
  const lonRatio = (lng - west) / Math.max(1e-6, east - west);
  const row = clamp(Math.floor(latRatio * height), 0, height - 1);
  const col = clamp(Math.floor(lonRatio * width), 0, width - 1);
  return mask[row * width + col] === 1;
};

const updateAffectedBuildingsDisplay = () => {
  if (affectedBuildingCountEl) {
    affectedBuildingCountEl.textContent = cachedAffectedBuildings.toLocaleString();
  }
  if (affectedBuildingRowEl) {
    affectedBuildingRowEl.style.display = buildingLayerEnabled ? "inline" : "none";
  }
};

const scheduleAffectedBuildingsJob = () => {
  if (affectedBuildingsJob) {
    clearTimeout(affectedBuildingsJob);
    affectedBuildingsJob = null;
  }
  if (!buildingLayerEnabled || overlays.length === 0) {
    cachedAffectedBuildings = 0;
    updateAffectedBuildingsDisplay();
    return;
  }
  const tileDatas = overlays.map((entry) => entry.tileData);
  const maskMap = buildFloodMaskMap(tileDatas, riverLevel);
  const workQueue = [];
  tileDatas.forEach((tileData) => {
    const cacheKey = boundsKey(tileData.bounds);
    const buildingEntry = getCachedBuildingEntry(cacheKey);
    const maskData = maskMap.get(tileData);
    if (buildingEntry?.features && maskData) {
      workQueue.push({ features: buildingEntry.features, tileData, maskData, idx: 0 });
    }
  });
  if (workQueue.length === 0) {
    cachedAffectedBuildings = 0;
    updateAffectedBuildingsDisplay();
    return;
  }

  const processChunk = () => {
    const start = performance.now();
    const budgetMs = 12;
    while (workQueue.length > 0) {
      const current = workQueue[0];
      for (; current.idx < current.features.length; current.idx += 1) {
        const feature = current.features[current.idx];
        if (featureTouchesFlood(feature, current.tileData, current.maskData)) {
          cachedAffectedBuildings += 1;
        }
        if (performance.now() - start > budgetMs) {
          affectedBuildingsJob = setTimeout(processChunk, 0);
          return;
        }
      }
      workQueue.shift();
    }
    affectedBuildingsJob = null;
    updateAffectedBuildingsDisplay();
  };

  // Reset count before starting.
  cachedAffectedBuildings = 0;
  affectedBuildingsJob = setTimeout(processChunk, 0);
};

const updateAffectedBuildingsDebounced = () => {
  if (affectedBuildingsDebounce) {
    clearTimeout(affectedBuildingsDebounce);
  }
  affectedBuildingsDebounce = setTimeout(() => {
    scheduleAffectedBuildingsJob();
  }, 120);
};

const refreshBuildingLayers = () => {
  clearBuildingLayers(false);
  ensureBuildingLayerVisibility();
  if (!buildingLayerEnabled) return;
  overlays.forEach((entry) => {
    if (entry?.tileData?.bounds && entry.key) {
      addBuildingsForTile(entry.tileData.bounds, entry.key);
    }
  });
  updateDeckGL();
};

const addBuildingsForTile = async (bounds, cacheKey = boundsKey(bounds)) => {
  if (!buildingLayerEnabled) return;
  ensureBuildingLayerVisibility();
  const cached = buildingLayerCache.get(cacheKey);
  if (cached?.layer) {
    if (!buildingLayerGroup.hasLayer(cached.layer)) {
      cached.layer.addTo(buildingLayerGroup);
    }
    updateFloodSummary();
    updateAffectedBuildingsDebounced();
    updateDeckGL();
    return;
  }
  try {
    setStatus("Loading Global Building Atlas for this tile…");
    const data = await fetchBuildingsForBounds(bounds, cacheKey);
    if (!buildingLayerEnabled) return;
    if (!findOverlayByKey(cacheKey)) return;
    const layer = L.geoJSON(data, {
      pane: buildingPaneName,
      style: () => ({
        color: "#000",
        weight: 1,
        opacity: 0.5,
        fillOpacity: 0.05,
      }),
      interactive: true,
      onEachFeature: (feature, featureLayer) => {
        featureLayer.options.bubblingMouseEvents = false;
        featureLayer.on("click", (event) => {
          L.DomEvent.stop(event);
          if (event?.originalEvent) {
            event.originalEvent.preventDefault();
            event.originalEvent.stopPropagation();
          }
          const content = buildBuildingPopupContent(feature, event.latlng);
          L.popup({
            autoPanPadding: [32, 32],
          })
            .setLatLng(event.latlng)
            .setContent(content)
            .openOn(map);
        });
      },
    });
    buildingLayerCache.set(cacheKey, {
      layer,
      features: Array.isArray(data?.features) ? data.features : [],
    });
    layer.addTo(buildingLayerGroup);
    updateFloodSummary();
    updateAffectedBuildingsDebounced();
    updateDeckGL();
    setStatus("Global Building Atlas loaded for tile.");
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error("Failed to load Global Building Atlas", error);
    setStatus("Failed to load Global Building Atlas for this tile.", {
      persistent: false,
    });
  }
};

const clearOverlays = () => {
  overlays.forEach(({ layer }) => overlayLayer.removeLayer(layer));
  overlays.length = 0;
  currentOverlayEntry = null;
  clearBuildingLayers(true);
  sliderOverride = null;
  configureSlider();
  updateLegendFromOverlays();
  syncUrlFromState();
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

const formatWaterLevel = (value, digits = 1) =>
  Number.isFinite(value) ? `${value.toFixed(digits)} m` : "n/a";

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

const computeMultiTileFloodMasks = (tileDatas, waterLevel) => {
  if (tileDatas.length === 0) {
    return new Map();
  }
  const minRow = tileDatas.reduce(
    (acc, tile) => Math.min(acc, tile.originRow ?? 0),
    Number.POSITIVE_INFINITY
  );
  const minCol = tileDatas.reduce(
    (acc, tile) => Math.min(acc, tile.originCol ?? 0),
    Number.POSITIVE_INFINITY
  );
  const maxRow = tileDatas.reduce(
    (acc, tile) =>
      Math.max(acc, (tile.originRow ?? 0) + (tile.height ?? 0)),
    Number.NEGATIVE_INFINITY
  );
  const maxCol = tileDatas.reduce(
    (acc, tile) =>
      Math.max(acc, (tile.originCol ?? 0) + (tile.width ?? 0)),
    Number.NEGATIVE_INFINITY
  );
  const globalWidth = Math.max(1, maxCol - minCol);
  const globalHeight = Math.max(1, maxRow - minRow);
  const globalValues = new Float32Array(globalWidth * globalHeight);
  globalValues.fill(Number.NaN);
  const offsetMap = new Map();
  for (const tile of tileDatas) {
    const rowOffset = (tile.originRow ?? 0) - minRow;
    const colOffset = (tile.originCol ?? 0) - minCol;
    offsetMap.set(tile, { rowOffset, colOffset });
    for (let row = 0; row < tile.height; row += 1) {
      const sourceStart = row * tile.width;
      const targetStart =
        (rowOffset + row) * globalWidth + colOffset;
      for (let col = 0; col < tile.width; col += 1) {
        globalValues[targetStart + col] =
          tile.values[sourceStart + col];
      }
    }
  }
  const globalTile = {
    width: globalWidth,
    height: globalHeight,
    values: globalValues,
    noData: Number.NaN,
  };
  const globalFlood = computeConnectedFloodMask(globalTile, waterLevel);
  const maskMap = new Map();
  for (const tile of tileDatas) {
    const offsets = offsetMap.get(tile);
    if (!offsets) continue;
    const { rowOffset, colOffset } = offsets;
    const tileMask = new Uint8Array(tile.width * tile.height);
    let count = 0;
    for (let row = 0; row < tile.height; row += 1) {
      const globalRow = rowOffset + row;
      const globalStart = globalRow * globalWidth + colOffset;
      for (let col = 0; col < tile.width; col += 1) {
        const maskValue =
          globalFlood.mask[globalStart + col] ?? 0;
        tileMask[row * tile.width + col] = maskValue;
        if (maskValue === 1) {
          count += 1;
        }
      }
    }
    maskMap.set(tile, { mask: tileMask, count });
  }
  return maskMap;
};

const buildFloodMaskMap = (tileDatas, waterLevel) => {
  const maskMap = new Map();
  if (tileDatas.length === 0) return maskMap;
  const shouldCombine = multiSelectEnabled && tileDatas.length > 1;
  if (shouldCombine) {
    return computeMultiTileFloodMasks(tileDatas, waterLevel);
  }
  tileDatas.forEach((tile) => {
    maskMap.set(tile, computeConnectedFloodMask(tile, waterLevel));
  });
  return maskMap;
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
  const totalFloodCells = overlays.reduce(
    (sum, entry) => sum + (entry.floodCellCount ?? 0),
    0
  );
  if (floodCellCountEl) {
    floodCellCountEl.textContent = totalFloodCells.toLocaleString();
  }
  if (buildingLayerEnabled && overlays.length > 0) {
    scheduleAffectedBuildingsJob();
  } else {
    cachedAffectedBuildings = 0;
    updateAffectedBuildingsDisplay();
  }
  if (floodLegendEl) {
    floodLegendEl.classList.toggle("hidden", totalFloodCells === 0);
  }
};

const syncLegendToggleState = () => {
  if (!legendToggleEl || !legendEl) return;
  const collapsed = legendEl.classList.contains("collapsed");
  legendToggleEl.textContent = collapsed ? "▲" : "X";
  legendToggleEl.setAttribute("aria-expanded", collapsed ? "false" : "true");
  legendToggleEl.setAttribute(
    "aria-label",
    collapsed ? "Expand legend panel" : "Collapse legend panel"
  );
};

const updateFloodLegendPosition = () => {
  if (!floodLegendEl || !layerControlEl) return;
  const expanded = layerControlEl.classList.contains(
    "leaflet-control-layers-expanded"
  );
  if (searchControlEl) {
    const shouldHideSearch = expanded && window.innerWidth <= 768;
    searchControlEl.style.visibility = shouldHideSearch ? "hidden" : "";
  }
  if (expanded) {
    const rect = layerControlEl.getBoundingClientRect();
    const targetTop = rect.bottom + FLOOD_LEGEND_SPACING_PX;
    floodLegendEl.style.top = `${targetTop}px`;
  } else {
    floodLegendEl.style.top = "";
  }
};

const observeLayerControl = () => {
  if (!layerControlEl) return;
  const observer = new MutationObserver(updateFloodLegendPosition);
  observer.observe(layerControlEl, { attributes: true, attributeFilter: ["class"] });
  layerControlEl.addEventListener("click", () => {
    window.requestAnimationFrame(updateFloodLegendPosition);
  });
  window.addEventListener("resize", updateFloodLegendPosition);
  updateFloodLegendPosition();
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

const getCurrentMaxSliderValue = () => {
  if (sliderOverride !== null) return sliderOverride;
  if (maxSliderEl && !maxSliderEl.disabled) {
    const parsed = Number(maxSliderEl.value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const syncUrlFromState = () => {
  if (!map) return;
  const params = new URLSearchParams();
  const center = map.getCenter();
  params.set("lat", center.lat.toFixed(5));
  params.set("lon", center.lng.toFixed(5));
  params.set("z", map.getZoom().toFixed(2));
  params.set("water", riverLevel.toFixed(1));
  params.set("base", baseRiverLevel.toFixed(2));
  params.set("seed", String(minRiverSeedCells));
  params.set("opacity", String(Math.round(currentOpacity * 100)));
  params.set("gba", buildingLayerEnabled ? "1" : "0");
  params.set("baselayer", currentBaseLayerId);
  const maxValue = getCurrentMaxSliderValue();
  if (Number.isFinite(maxValue)) {
    params.set("max", String(maxValue));
  }
  if (overlays.length > 0) {
    const tilesParam = overlays
      .map((entry) => entry.key)
      .filter(Boolean)
      .join("|");
    if (tilesParam) {
      params.set("tiles", tilesParam);
    }
  }
  const query = params.toString();
  shareUrlCache =
    query.length > 0
      ? `${window.location.pathname}?${query}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
};

const applySettingsFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  const lat = parseNumberParam(params, "lat");
  const lon = parseNumberParam(params, "lon");
  const zoom = parseNumberParam(params, "z");
  if (lat !== null && lon !== null) {
    const [targetLat, targetLon] = clampLatLon([lat, lon]);
    map.setView([targetLat, targetLon], Number.isFinite(zoom) ? zoom : map.getZoom());
  } else if (zoom !== null) {
    map.setZoom(zoom);
  }

  const baseParam = parseNumberParam(params, "base");
  if (baseParam !== null) {
    applyBaseRiverLevel(baseParam, { silent: true });
  }
  const seedParam = parseNumberParam(params, "seed");
  if (seedParam !== null) {
    applyMinRiverSeedCells(seedParam, { silent: true });
  }
  const waterParam = parseNumberParam(params, "water");
  if (waterParam !== null) {
    const maxWaterLevel = baseRiverLevel + WATER_LEVEL_MARGIN;
    riverLevel = clamp(waterParam, baseRiverLevel, maxWaterLevel);
    if (riverSliderEl) {
      riverSliderEl.value = riverLevel;
    }
    updateRiverSliderDisplay();
    if (overlays.length > 0) {
      reRenderOverlays();
    } else {
      updateFloodSummary();
    }
  }

  const opacityParam = parseNumberParam(params, "opacity");
  if (opacityParam !== null) {
    const clampedOpacity = clamp(opacityParam, 10, 100);
    currentOpacity = clampedOpacity / 100;
    if (opacitySliderEl) {
      opacitySliderEl.value = clampedOpacity;
    }
    handleOpacityInput();
  }

  const baseLayerParam = params.get("baselayer");
  if (baseLayerParam && BASE_LAYERS[baseLayerParam]) {
    setBaseLayer(baseLayerParam);
  }

  const gbaParam = parseBooleanParam(params, "gba", buildingLayerEnabled);
  buildingLayerEnabled = gbaParam;
  ensureBuildingLayerVisibility();

  const maxParam = parseNumberParam(params, "max");
  if (maxParam !== null) {
    sliderOverride = maxParam;
    if (maxSliderEl) {
      maxSliderEl.value = maxParam;
    }
    if (sliderValueEl) {
      sliderValueEl.textContent = formatElevation(maxParam);
    }
  }

  const tilesParam = params.get("tiles");
  if (tilesParam && tilesParam.includes(",")) {
    const tiles = tilesParam
      .split("|")
      .map((token) => token.trim())
      .filter(Boolean);
    pendingTilesFromUrl.push(...tiles);
  }
};

const applyTilesFromUrl = async () => {
  if (pendingTilesFromUrl.length === 0) return;
  // Process sequentially to avoid race conditions clobbering slider/selection state.
  for (const key of pendingTilesFromUrl) {
    const parts = key.split(",").map((v) => Number(v));
    if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) continue;
    const bounds = [
      [parts[0], parts[1]],
      [parts[2], parts[3]],
    ];
    // Trigger the same path as clicking a grid cell.
    // eslint-disable-next-line no-await-in-loop
    await renderCell(bounds);
  }
  pendingTilesFromUrl.length = 0;
};

const copyShareUrl = async () => {
  syncUrlFromState();
  const textToCopy = `${window.location.origin}${shareUrlCache}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(textToCopy);
      setStatus("Share link copied.");
      return;
    }
  } catch (error) {
    console.warn("Clipboard write failed, falling back to prompt.", error);
  }
  window.prompt("Copy this link", textToCopy); // eslint-disable-line no-alert
};

const normalizeBaseRiverLevel = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BASE_RIVER_LEVEL;
  }
  const clamped = Math.max(MIN_BASE_RIVER_LEVEL, parsed);
  return Math.round(clamped * 100) / 100;
};

const syncRiverSliderBounds = () => {
  if (!riverSliderEl) return;
  const maxWaterLevel = baseRiverLevel + WATER_LEVEL_MARGIN;
  riverSliderEl.min = String(baseRiverLevel);
  riverSliderEl.max = String(maxWaterLevel);
  riverSliderEl.step = "0.2";
  riverLevel = clamp(riverLevel, baseRiverLevel, maxWaterLevel);
  riverSliderEl.value = riverLevel;
};

const applyBaseRiverLevel = (value, { silent = false } = {}) => {
  const normalized = normalizeBaseRiverLevel(value);
  baseRiverLevel = normalized;
  riverLevel = baseRiverLevel;
  if (riverBaseInputEl) {
    riverBaseInputEl.value = normalized.toFixed(2);
  }
  syncRiverSliderBounds();
  updateRiverSliderDisplay();
  if (overlays.length > 0) {
    reRenderOverlays();
  } else {
    updateFloodSummary();
  }
  if (!silent) {
    setStatus(`Base river level set to ${formatWaterLevel(baseRiverLevel, 2)}`);
  }
  updateDeckGL();
  syncUrlFromState();
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
  updateDeckGL();
  syncUrlFromState();
  return normalized;
};
const handleRiverSeedInput = () => {
  if (!riverSeedInputEl) return;
  applyMinRiverSeedCells(riverSeedInputEl.value);
};
const clampLatLon = ([lat, lon]) => {
  const latClamped = clamp(lat, -90, 90);
  const lonClamped = clamp(lon, -180, 180);
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

const depthToFloodColor = (depth) => {
  if (!Number.isFinite(depth)) {
    return FLOOD_DEPTH_COLORS[0].color;
  }
  if (depth < FLOOD_DEPTH_COLORS[0].min) {
    return FLOOD_DEPTH_COLORS[0].color;
  }
  for (const band of FLOOD_DEPTH_COLORS) {
    if (depth >= band.min && depth < band.max) {
      return band.color;
    }
  }
  return FLOOD_DEPTH_COLORS[FLOOD_DEPTH_COLORS.length - 1].color;
};

const DEFAULT_CELL_NOTE = "";
const sliderNote = () => "";

const generateOverlayDataUrl = (
  tileData,
  maxValue,
  waterLevel = baseRiverLevel,
  floodMaskData,
  colorScaleMin = tileData.min,
  colorScaleMax = tileData.max
) => {
  const { values, width, height, min, max, noData } = tileData;
  const effectiveMin = Number.isFinite(colorScaleMin) ? colorScaleMin : min;
  const targetMax = Number.isFinite(colorScaleMax) ? colorScaleMax : max;
  const maxBound = Number.isFinite(maxValue) ? maxValue : targetMax;
  const effectiveMax = clamp(maxBound, effectiveMin + 1e-3, targetMax);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;
  const maskData = floodMaskData ?? computeConnectedFloodMask(tileData, waterLevel);
  const { mask, count: floodCellCount } = maskData;

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const offset = i * 4;
    if (!Number.isFinite(value) || value === noData) {
      out[offset + 3] = 0;
      continue;
    }
    const [r, g, b] = valueToColor(value, effectiveMin, effectiveMax);
    const color =
      mask[i] === 1
        ? depthToFloodColor(Math.max(0, waterLevel - value))
        : [r, g, b];
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
    floodMaskData: maskData,
  };
};

const buildSatelliteExportUrl = (bounds, size = TERRAIN_TEXTURE_SIZE) => {
  const [[south, west], [north, east]] = bounds;
  const params = new URLSearchParams({
    bbox: [west, south, east, north].join(","),
    bboxSR: "4326",
    imageSR: "4326",
    size: `${size},${size}`,
    format: "png",
    transparent: "false",
    f: "image",
  });
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${params.toString()}`;
};

const projectTerrainBounds = (bounds) => {
  const [[south, west], [north, east]] = bounds;
  return [west, south, east, north];
};

const canMergeTerrainTiles = (tileData) =>
  Number.isFinite(tileData?.originRow) &&
  Number.isFinite(tileData?.originCol) &&
  Number.isFinite(tileData?.width) &&
  Number.isFinite(tileData?.height) &&
  Number.isFinite(tileData?.pixelWidth) &&
  Number.isFinite(tileData?.pixelHeight) &&
  Number.isFinite(tileData?.rasterMinX) &&
  Number.isFinite(tileData?.rasterMaxY);

const terrainTilesTouch = (a, b) => {
  if (!canMergeTerrainTiles(a) || !canMergeTerrainTiles(b)) return false;
  const aWest = a.originCol;
  const aEast = a.originCol + a.width;
  const aNorth = a.originRow;
  const aSouth = a.originRow + a.height;
  const bWest = b.originCol;
  const bEast = b.originCol + b.width;
  const bNorth = b.originRow;
  const bSouth = b.originRow + b.height;
  return (
    aWest <= bEast &&
    aEast >= bWest &&
    aNorth <= bSouth &&
    aSouth >= bNorth
  );
};

const groupTerrainTiles = (tileDatas) => {
  const groups = [];
  const ungrouped = [...tileDatas];

  while (ungrouped.length > 0) {
    const group = [ungrouped.shift()];
    for (let i = 0; i < group.length; i += 1) {
      for (let j = ungrouped.length - 1; j >= 0; j -= 1) {
        if (terrainTilesTouch(group[i], ungrouped[j])) {
          group.push(ungrouped.splice(j, 1)[0]);
        }
      }
    }
    groups.push(group);
  }

  return groups;
};

const createMergedTerrainTile = (tileGroup) => {
  if (
    tileGroup.length === 1 ||
    tileGroup.some((tile) => !canMergeTerrainTiles(tile))
  ) {
    return tileGroup[0];
  }

  const minRow = tileGroup.reduce(
    (acc, tile) => Math.min(acc, tile.originRow),
    Infinity
  );
  const minCol = tileGroup.reduce(
    (acc, tile) => Math.min(acc, tile.originCol),
    Infinity
  );
  const maxRow = tileGroup.reduce(
    (acc, tile) => Math.max(acc, tile.originRow + tile.height),
    -Infinity
  );
  const maxCol = tileGroup.reduce(
    (acc, tile) => Math.max(acc, tile.originCol + tile.width),
    -Infinity
  );
  const width = maxCol - minCol;
  const height = maxRow - minRow;
  const values = new Float32Array(width * height);
  values.fill(Number.NaN);

  let min = Infinity;
  let max = -Infinity;
  for (const tile of tileGroup) {
    const rowOffset = tile.originRow - minRow;
    const colOffset = tile.originCol - minCol;
    for (let row = 0; row < tile.height; row += 1) {
      const sourceStart = row * tile.width;
      const targetStart = (rowOffset + row) * width + colOffset;
      values.set(
        tile.values.subarray(sourceStart, sourceStart + tile.width),
        targetStart
      );
    }
    min = Math.min(min, tile.min);
    max = Math.max(max, tile.max);
  }

  const reference = tileGroup[0];
  const west = reference.rasterMinX + minCol * reference.pixelWidth;
  const east = reference.rasterMinX + maxCol * reference.pixelWidth;
  const north = reference.rasterMaxY - minRow * reference.pixelHeight;
  const south = reference.rasterMaxY - maxRow * reference.pixelHeight;

  return {
    values,
    width,
    height,
    min,
    max,
    bounds: [
      [south, west],
      [north, east],
    ],
    noData: Number.NaN,
  };
};

const createTerrainElevationData = (tileData) => {
  if (tileData.terrainElevationData) return tileData.terrainElevationData;

  const { values, width, height, min, max, noData } = tileData;
  const range = Math.max(1e-6, max - min);
  const encodeScale = TERRAIN_MAX_ENCODED_HEIGHT / range;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const safeValue =
      Number.isFinite(value) && value !== noData ? value : min;
    const encoded = clamp(
      Math.round((safeValue - min) * encodeScale),
      0,
      TERRAIN_MAX_ENCODED_HEIGHT
    );
    const offset = i * 4;
    out[offset] = (encoded >> 16) & 255;
    out[offset + 1] = (encoded >> 8) & 255;
    out[offset + 2] = encoded & 255;
    out[offset + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  tileData.terrainElevationData = {
    url: canvas.toDataURL("image/png"),
    decoder: {
      rScaler: (65536 / encodeScale) * TERRAIN_VERTICAL_EXAGGERATION,
      gScaler: (256 / encodeScale) * TERRAIN_VERTICAL_EXAGGERATION,
      bScaler: (1 / encodeScale) * TERRAIN_VERTICAL_EXAGGERATION,
      offset: min,
    },
  };
  return tileData.terrainElevationData;
};

const applyOverlayFromTile = (tileData, cacheKey = boundsKey(tileData.bounds)) => {
  if (!tileData) return;
  const existing = findOverlayByKey(cacheKey);
  const ensureBuildings = () => {
    if (buildingLayerEnabled) {
      addBuildingsForTile(tileData.bounds, cacheKey);
    }
  };
  if (existing && multiSelectEnabled) {
    currentOverlayEntry = existing;
    currentTileData = existing.tileData;
    configureSlider();
    updateLegendFromOverlays();
    selectionBounds = null;
    updateSelectionHighlight();
    ensureBuildings();
    return;
  }
  if (!multiSelectEnabled) {
    clearOverlays();
  }
  const existingTiles = overlays.map((entry) => entry.tileData);
  const tilesForScale = multiSelectEnabled
    ? [...existingTiles, tileData]
    : [tileData];
  const sharedMin = multiSelectEnabled
    ? computeColorScaleMin(tilesForScale)
    : null;
  const sharedMax =
    multiSelectEnabled && sliderOverride == null
      ? computeColorScaleMax(tilesForScale)
      : sliderOverride;
  const entry = createOverlayEntry(
    tileData,
    undefined,
    cacheKey,
    sharedMin ?? tileData.min,
    sharedMax ?? tileData.max
  );
  overlays.push(entry);
  currentOverlayEntry = entry;
  currentTileData = tileData;
  selectionBounds = null;
  updateSelectionHighlight();
  ensureBuildings();
  if (multiSelectEnabled) {
    reRenderOverlays();
  } else {
    configureSlider();
    updateLegendFromOverlays();
  }
  updateDeckGL();
  syncUrlFromState();
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
  syncUrlFromState();
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
  syncUrlFromState();
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
  const maxWaterLevel = baseRiverLevel + WATER_LEVEL_MARGIN;
  riverLevel = Number.isFinite(nextValue)
    ? clamp(nextValue, baseRiverLevel, maxWaterLevel)
    : baseRiverLevel;
  riverSliderEl.value = riverLevel;
  updateRiverSliderDisplay();
  if (overlays.length > 0) {
    reRenderOverlays();
  } else {
    updateFloodSummary();
  }
  setStatus(`Water height set to ${formatWaterLevel(riverLevel)}`);
  updateDeckGL();
  syncUrlFromState();
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
    ? initialValue
    : baseRiverLevel;
  syncRiverSliderBounds();
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

const updateSelectionHighlight = () => {
  selectionLayer.clearLayers();
  if (!selectionBounds || multiSelectEnabled) return;
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
  if (map.getZoom() < GRID_VISIBILITY_ZOOM) {
    setStatus("Zoom in and click on a tile to see DEM data.", { persistent: true });
    return;
  }
  const bounds = map.getBounds();
  const viewSouth = bounds.getSouth();
  const viewNorth = bounds.getNorth();
  const viewWest = bounds.getWest();
  const viewEast = bounds.getEast();

  const latStart = alignToGrid(viewSouth - GRID_STEP_DEG);
  const latEnd = alignToGrid(viewNorth + GRID_STEP_DEG);
  const lonStart = alignToGrid(viewWest - GRID_STEP_DEG);
  const lonEnd = alignToGrid(viewEast + GRID_STEP_DEG);

  for (let lat = latStart; lat < latEnd; lat += GRID_STEP_DEG) {
    for (let lon = lonStart; lon < lonEnd; lon += GRID_STEP_DEG) {
      const latSouth = Math.min(lat, lat + GRID_STEP_DEG);
      const latNorth = Math.max(lat, lat + GRID_STEP_DEG);
      const lonWest = Math.min(lon, lon + GRID_STEP_DEG);
      const lonEast = Math.max(lon, lon + GRID_STEP_DEG);
      const cellBounds = [
        [latSouth, lonWest],
        [latNorth, lonEast],
      ];
      const rect = L.rectangle(cellBounds, {
        color: "#000",
        weight: 1,
        fillOpacity: 0,
      }).addTo(gridLayer);
      rect.on("click", () => {
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

function initializeDeckGL() {
  if (deckgl) return;

  const mapContainer = document.getElementById("map");
  const deckContainer = document.createElement("div");
  deckContainer.id = "deckgl-container";
  deckContainer.style.position = "absolute";
  deckContainer.style.top = "0";
  deckContainer.style.left = "0";
  deckContainer.style.width = "100%";
  deckContainer.style.height = "100%";
  deckContainer.style.zIndex = "800"; // Above map tiles but below controls
  mapContainer.appendChild(deckContainer);

  currentViewState = {
    longitude: map.getCenter().lng,
    latitude: map.getCenter().lat,
    zoom: map.getZoom(),
    pitch: 45,
    bearing: 0
  };

  deckgl = new deck.DeckGL({
    container: deckContainer,
    viewState: currentViewState,
    views: new deck.MapView({
      clear: true,
      clearColor: [0, 0, 0, 255],
    }),
    controller: {
      minPitch: 0,
      maxPitch: 85,
    },
    layers: [],
    onViewStateChange: ({ viewState }) => {
       currentViewState = viewState;
       deckgl.setProps({ viewState: currentViewState });
    }
  });

  if (rotateLeftBtn) rotateLeftBtn.classList.remove("hidden");
  if (rotateRightBtn) rotateRightBtn.classList.remove("hidden");

  updateDeckGL();
}

function destroyDeckGL() {
  if (deckgl) {
    deckgl.finalize();
    deckgl = null;
  }
  const deckContainer = document.getElementById("deckgl-container");
  if (deckContainer) {
    deckContainer.remove();
  }
  if (rotateLeftBtn) rotateLeftBtn.classList.add("hidden");
  if (rotateRightBtn) rotateRightBtn.classList.add("hidden");
  currentViewState = null;
}

function updateDeckGL() {
  if (!deckgl || !is3DViewActive) return;

  const layers = [];

  const basemapUrl = currentBaseLayerId === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png';

  // Basemap
  layers.push(
    new deck.TileLayer({
      id: 'basemap',
      data: basemapUrl,
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: props => {
        const {
          bbox: {west, south, east, north}
        } = props.tile;

        return new deck.BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north]
        });
      }
    })
  );

  const buildingFeatures = [];
  buildingLayerCache.forEach(entry => {
    if (entry.features) {
      buildingFeatures.push(...entry.features);
    }
  });

  const allTileDatas = overlays.map(entry => entry.tileData);
  if (allTileDatas.length === 0 && currentTileData) {
    allTileDatas.push(currentTileData);
  }

  if (allTileDatas.length > 0) {
    if (currentBaseLayerId === "satellite" && deck.TerrainLayer) {
      const terrainTiles = groupTerrainTiles(allTileDatas).map(
        createMergedTerrainTile
      );
      for (const terrainTile of terrainTiles) {
        const terrainData = createTerrainElevationData(terrainTile);
        layers.push(
          new deck.TerrainLayer({
            id: `satellite-terrain-${boundsKey(terrainTile.bounds)}`,
            operation: "terrain+draw",
            elevationData: terrainData.url,
            texture: buildSatelliteExportUrl(terrainTile.bounds),
            bounds: projectTerrainBounds(terrainTile.bounds),
            elevationDecoder: terrainData.decoder,
            meshMaxError: TERRAIN_MESH_MAX_ERROR,
            material: {
              ambient: 0.55,
              diffuse: 0.45,
              shininess: 8,
              specularColor: [40, 40, 40],
            },
          })
        );
      }
    }

    const floodPolygons = [];
    const floodMaskMap = buildFloodMaskMap(allTileDatas, riverLevel);

    for (const tileData of allTileDatas) {
      const { values, width, height, bounds } = tileData;
      const [[south, west], [north, east]] = bounds;
      const floodMaskData = floodMaskMap.get(tileData);

      if (floodMaskData) {
        const { mask } = floodMaskData;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (mask[i] === 1) {
              const lon = west + (x / width) * (east - west);
              const lat = north - (y / height) * (north - south);
              const lonNext = west + ((x + 1) / width) * (east - west);
              const latNext = north - ((y + 1) / height) * (north - south);
              const depth = Math.max(0, riverLevel - values[i]);
              floodPolygons.push({
                polygon: [
                  [lon, lat],
                  [lon, latNext],
                  [lonNext, latNext],
                  [lonNext, lat],
                  [lon, lat]
                ],
                depth,
                color: [...depthToFloodColor(depth), 200]
              });
            }
          }
        }
      }
    }
    
    if (floodPolygons.length > 0) {
      const floodLayer = new deck.PolygonLayer({
        id: 'flood-layer',
        data: floodPolygons,
        getPolygon: d => d.polygon,
        getFillColor: d => d.color,
        extruded: true,
        getElevation: d => d.depth,
        extensions: [new deck._TerrainExtension()],
      });
      layers.push(floodLayer);
    }
  }

  if (buildingLayerEnabled && buildingFeatures.length > 0) {
    const buildingLayer = new deck.GeoJsonLayer({
      id: 'buildings',
      data: buildingFeatures,
      extruded: true,
      getElevation: f => Number(f.properties.height) || 0,
      getFillColor: [200, 200, 200],
      getLineColor: [100, 100, 100],
      lineWidthMinPixels: 1,
      extensions: [new deck._TerrainExtension()],
    });
    layers.push(buildingLayer);
  }

  deckgl.setProps({ layers });
}

async function renderCell(bounds) {
  const cacheKey = boundsKey(bounds);
  const existingOverlay = findOverlayByKey(cacheKey);
  if (existingOverlay) {
    currentOverlayEntry = existingOverlay;
    currentTileData = existingOverlay.tileData;
    selectionBounds = null;
    updateSelectionHighlight();
    configureSlider();
    updateLegendFromOverlays();
    if (buildingLayerEnabled) {
      addBuildingsForTile(bounds, cacheKey);
    }
    return;
  }
  const requestId = ++pendingRequestId;
  setStatus("Preparing tile…", { persistent: true });
  startDownloadTracker();
  showProgress(0, "dem");

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
      updateProgress(percent, "dem");
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
      hideProgress("dem");
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
      originRow: rowStart,
      originCol: colStart,
      pixelWidth: meta.pixelWidth,
      pixelHeight: meta.pixelHeight,
      rasterMinX: meta.minX,
      rasterMaxY: meta.maxY,
    };
    if (!multiSelectEnabled) {
      sliderOverride = null;
    }
    applyOverlayFromTile(currentTileData, cacheKey);
    if (buildingLayerEnabled) {
      setStatus("DEM tile ready. Loading Global Building Atlas…");
    } else {
      setStatus("DEM tile ready.");
    }
      hideProgress("dem");
    stopDownloadTracker();
  } catch (error) {
    console.error("Failed to render cell", error);
    setStatus("Failed to render DEM tile (see console).", { persistent: true });
    hideProgress();
    stopDownloadTracker();
  }
}

const sampleElevationAtLatLng = (latlng) => {
  const candidateTiles = [];
  if (currentOverlayEntry?.tileData) {
    candidateTiles.push(currentOverlayEntry.tileData);
  }
  for (let i = overlays.length - 1; i >= 0; i -= 1) {
    const tile = overlays[i]?.tileData;
    if (tile && !candidateTiles.includes(tile)) {
      candidateTiles.push(tile);
    }
  }
  if (currentTileData && !candidateTiles.includes(currentTileData)) {
    candidateTiles.push(currentTileData);
  }
  for (const tileData of candidateTiles) {
    const [[south, west], [north, east]] = tileData.bounds;
    const { width, height, values, noData } = tileData;
    const { lat, lng } = latlng;
    if (lat < south || lat > north || lng < west || lng > east) continue;
    const latRatio = (north - lat) / Math.max(1e-6, north - south);
    const lonRatio = (lng - west) / Math.max(1e-6, east - west);
    const row = clamp(Math.floor(latRatio * height), 0, height - 1);
    const col = clamp(Math.floor(lonRatio * width), 0, width - 1);
    const value = values[row * width + col];
    if (!Number.isFinite(value) || value === noData) continue;
    currentTileData = tileData;
    return {
      elevation: value,
      tileData,
      row,
      col,
    };
  }
  return {
    elevation: null,
    tileData: null,
    row: null,
    col: null,
  };
};

const sampleValueAtLatLng = (latlng) => {
  const { elevation } = sampleElevationAtLatLng(latlng);
  return elevation;
};

const getFloodDepthAtLatLng = (latlng) => {
  const { elevation, tileData, row, col } = sampleElevationAtLatLng(latlng);
  if (elevation == null || !tileData) {
    return { depth: null, flooded: false, elevation: null };
  }
  let depth = Math.max(0, riverLevel - elevation);
  let flooded = depth > 0;
  const overlayEntry =
    overlays.find((entry) => entry.tileData === tileData) ?? null;
  const mask = overlayEntry?.floodMaskData?.mask;
  if (mask && Number.isInteger(row) && Number.isInteger(col)) {
    const idx = row * tileData.width + col;
    if (idx >= 0 && idx < mask.length) {
      const maskValue = mask[idx];
      if (maskValue === 1) {
        flooded = true;
      } else if (maskValue === 0) {
        flooded = false;
        depth = 0;
      }
    }
  }
  return { depth, flooded, elevation };
};

map.on("click", (event) => {
  const { latlng } = event;
  if (!latlng) return;
  const { elevation, depth } = getFloodDepthAtLatLng(latlng);
  if (elevation == null) {
    popup.remove();
    if (currentTileData) {
      setStatus("Click inside a loaded DEM tile to see grid elevation.", {
        persistent: false,
      });
    }
    return;
  }
  popup
    .setLatLng(latlng)
    .setContent(
      `<div>
        <div><strong>Elevation (MSL):</strong> ${formatElevationPrecise(elevation)}</div>
        <div><strong>Flood depth:</strong> ${formatWaterLevel(depth)}</div>
      </div>`
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

function flyToLocation(lat, lon, label = null, targetZoom = 11) {
  const [clampedLat, clampedLon] = clampLatLon([lat, lon]);
  map.flyTo([clampedLat, clampedLon], Math.max(map.getZoom(), targetZoom), {
    duration: 1.2,
  });
  setStatus(
    label
      ? `Centered on ${label}`
      : `Centered on ${clampedLat.toFixed(3)}, ${clampedLon.toFixed(3)}`
  );
};

function handleLocateClick() {
  if (!navigator.geolocation || locateInFlight) return;
  locateInFlight = true;
  if (locateButtonEl) locateButtonEl.disabled = true;
  const finishLocate = () => {
    locateInFlight = false;
    if (locateButtonEl) locateButtonEl.disabled = false;
  };
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      flyToLocation(latitude, longitude, "your location", 14);
      finishLocate();
    },
    (error) => {
      console.error("Geolocation failed:", error);
      setStatus("Unable to fetch your location.", { persistent: false });
      finishLocate();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}

const parseCsvLine = (line) => {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

const parseWorldCitiesCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines.shift());
  const getIndex = (key) => header.findIndex((col) => col === key);
  const idxCity = getIndex("city");
  const idxAscii = getIndex("city_ascii");
  const idxLat = getIndex("lat");
  const idxLon = getIndex("lng");
  const idxCountry = getIndex("country");
  const idxAdmin = getIndex("admin_name");
  return lines
    .map((line) => parseCsvLine(line))
    .map((values) => ({
      city: values[idxCity] ?? "",
      ascii: values[idxAscii] ?? "",
      lat: Number(values[idxLat]),
      lon: Number(values[idxLon]),
      country: values[idxCountry] ?? "",
      admin: values[idxAdmin] ?? "",
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.lat) &&
        Number.isFinite(entry.lon) &&
        (entry.city || entry.ascii)
    )
    .map((entry) => {
      const labelParts = [entry.city || entry.ascii, entry.admin, entry.country]
        .filter(Boolean)
        .map((part) => part.trim())
        .filter(Boolean);
      const tokens = [entry.city, entry.ascii, entry.admin, entry.country]
        .filter(Boolean)
        .map((value) => normalizeText(value))
        .filter(Boolean);
      return {
        name: entry.city || entry.ascii,
        lat: entry.lat,
        lon: entry.lon,
        label: labelParts.join(", "),
        tokens,
      };
    });
};

const loadWorldCitiesData = async () => {
  if (worldCitiesData) return worldCitiesData;
  if (!worldCitiesPromise) {
    worldCitiesPromise = fetch("./worldcities.csv")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load worldcities.csv (${response.status})`);
        }
        return response.text();
      })
      .then((text) => {
        worldCitiesData = parseWorldCitiesCsv(text);
        return worldCitiesData;
      })
      .catch((error) => {
        console.error("World cities lookup failed:", error);
        worldCitiesPromise = null;
        return null;
      });
  }
  return worldCitiesPromise;
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

const findWorldCityLocation = async (query) => {
  const norm = normalizeText(query);
  if (!norm) return null;
  const cities = await loadWorldCitiesData();
  if (!cities) return null;
  for (const city of cities) {
    if (
      city.tokens.some(
        (token) => norm.includes(token) || token.includes(norm)
      )
    ) {
      return city;
    }
  }
  return null;
};

const handleSearch = async (query) => {
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
    } else {
      const cityMatch = await findWorldCityLocation(query);
      if (cityMatch) {
        coords = [cityMatch.lat, cityMatch.lon];
        label = cityMatch.label || cityMatch.name;
      }
    }
  }
  if (!coords) {
    setStatus("Location not found. Try 'lat,lon' or a known city.", {
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
  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSearch(searchInput.value);
  });
}

map.on("baselayerchange", (event) => {
  const matched = Object.entries(BASE_LAYERS).find(
    ([, layer]) => layer === event.layer
  );
  if (matched) {
    currentBaseLayerId = matched[0];
    syncUrlFromState();
    updateDeckGL();
  }
});

map.on("overlayadd", (event) => {
  if (event.layer === buildingLayerGroup) {
    buildingLayerEnabled = true;
    ensureBuildingLayerVisibility();
    refreshBuildingLayers();
    syncUrlFromState();
    updateFloodLegendPosition();
    updateFloodSummary();
    updateAffectedBuildingsDebounced();
  }
  if (event.layer === threeDRenderLayer) {
    is3DViewActive = true;
    initializeDeckGL();
    updateDeckGL();
  }
});

map.on("overlayremove", (event) => {
  if (event.layer === buildingLayerGroup) {
    buildingLayerEnabled = false;
    clearBuildingLayers(false);
    syncUrlFromState();
    updateFloodLegendPosition();
    updateFloodSummary();
    updateAffectedBuildingsDebounced();
    updateDeckGL();
  }
  if (event.layer === threeDRenderLayer) {
    is3DViewActive = false;
    destroyDeckGL();
  }
});

if (shareButtonEl) {
  shareButtonEl.addEventListener("click", async (event) => {
    event.preventDefault();
    await copyShareUrl();
  });
}

disableSlider();
observeLayerControl();
updateLegend(-50, 4000, "Click a tile grid to stream DTM data.");
applySettingsFromQuery();
applyTilesFromUrl();
isInitializing = false;
syncUrlFromState();
updateGrid();
map.on("moveend", () => {
  updateGrid();
  syncUrlFromState();
});
map.on("zoomend", () => {
  updateGrid();
  syncUrlFromState();
});
setStatus(
  map.getZoom() < GRID_VISIBILITY_ZOOM
    ? "Zoom in and click on a tile to see DEM data."
    : "Click a tile grid to stream DTM data.",
  { persistent: true }
);
