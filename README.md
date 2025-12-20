# Digital Terrain Model Viewer

Interactive, client-side Leaflet app that streams a 30 m digital elevation model (DEM) directly from an open Cloud-Optimized GeoTIFF (COG). It lets you inspect terrain height, tune the color stretch, and compare multiple neighboring tiles without running a backend.

## Features
- Streams the GEDTM30 v1.2 DEM from OpenGeoHub via GeoTIFF.js and renders it as a colorized raster overlay.
- Leaflet grid that highlights selectable ~0.02° cells; clicking a cell downloads only the needed pixels and keeps memory use low.
- Elevation legend with automatic min/max stats, adjustable max-value stretch slider, and opacity control for blending with the OpenStreetMap base layer.
- Flood-extent tooling: raise a water-height slider, configure the base river level and the minimum number of low cells that seed rivers, and instantly see connected flood regions tinted on the map with a live cell count.
- Flood depth palette with fixed bands (0.5–1, 1–2, 2–3, 3–4, 4–5, >5 m) and a compact legend in the top-right that only appears when flooded cells exist.
- City/province search (including aliases and `lat,lon` queries) with an on-demand global lookup sourced from `worldcities.csv`, plus on-map sampling to inspect exact elevation values.
- Optional locate button that requests browser geolocation on click and flies to your current position (zoom 14) without preemptive permission prompts.
- Multi-select is always on so you can compare several DEM tiles at once, with aggregated stats in the legend.
- Download progress indicator with byte-based tracking so large tiles feel responsive.
- Optional Global Building Atlas overlay (off by default) that you can toggle from the layer control; when enabled, clicking a building shows height and ground elevation, and the flood summary lists affected buildings that intersect the current flood mask.
- 3D view overlay (deck.gl) that extrudes buildings and flood depths, with rotate-left/right buttons that appear when 3D is enabled.
- Base layer switcher (OSM streets vs Esri world imagery) in the Leaflet layer control.
- Share button copies a URL with map center/zoom, opacity, water/base levels, min river cells, max-stretch slider, selected tiles, base layer, and overlay state.
- Separate Thai water level station explorer with search, status legend, geolocation, and deep links into the DTM viewer.

## Repository Layout
- `index.html` — single-page app shell, styles, and UI controls.
- `app.js` — all interaction logic: map wiring, DEM fetching, rendering, sampling, and UI state.
- `waterlevel.html` — Thai water level station map and launcher into the DTM viewer.
- `worldcities.csv` — lookup dataset for global city search.
- `vendor/` — vendored Leaflet, GeoTIFF, and deck.gl builds to keep the app self-contained.

## Getting Started
1. Use any static HTTP server (needed because browsers block `file://` fetches). Examples:
   - `python3 -m http.server 8000`
   - `npx serve .`
2. Open `http://localhost:8000/index.html` (or the port you picked) in a modern desktop browser.
3. Pan/zoom, click a grid cell to fetch the DEM, then experiment with the sliders.
4. Optional: open `http://localhost:8000/waterlevel.html` for the Thai water level station explorer.

> Tip: The app fetches live data from OpenGeoHub, OpenStreetMap, Esri, Global Building Atlas WFS, and ThaiWater APIs, so ensure outbound HTTPS access is allowed.

## Controls At a Glance
- **Grid click**: Streams and colorizes the DEM cell; click inside the colored area to sample exact elevation via popup.
- **Max elevation slider**: Recomputes the color ramp to emphasize lower relief or remove outliers; resets when changing tiles unless multi-select is on.
- **Opacity slider**: Adjusts how strongly the raster overlay covers the OSM basemap.
- **Water height slider**: Expands connected flood regions by virtually raising the water surface; tinted pixels and the connected-cell counter update live.
- **Base river level / Min river cells**: Numeric inputs that control which low-lying components seed flood growth, plus a dynamic water-height slider that can sit 12 m above that base.
- **Search**: Supports province names, world cities (via the CSV fallback), common aliases, or explicit `latitude,longitude` pairs.
- **Locate**: Click the GPS button (bottom-right) to request geolocation and center the map on the detected coordinates.
- **Layer control**: Toggle Global Building Atlas, enable 3D view, and switch the base layer (streets vs satellite).
- **Share**: Copies a link that restores view state, overlays, water settings, and selected tiles.

## Sharing State via URL
- Query params are read on load and updated when you click the share button: `lat`, `lon`, `z`, `opacity`, `water`, `base`, `seed`, `max`, `tiles`, `gba`, `baselayer`.
- `tiles` is a pipe-separated list of bounds keys (`south,west,north,east` with 5 decimals) so selected tiles re-download on load.
- Example: `?lat=12.5&lon=99.9&z=11.5&water=4&base=2&seed=40&opacity=60&max=500&gba=1&tiles=13.74000,100.52000,13.76000,100.54000|13.76000,100.54000,13.78000,100.56000` restores view, controls, overlay state, and the listed tiles.

## Water Level Explorer (Thailand)
- Loads live station data from `api-v3.thaiwater.net` and colors markers by storage percentage.
- Search supports Thai station/tambon/amphoe/province names; matching stations stay opaque while others fade.
- Clicking a station opens a popup with water level, bank level, ground level, data source, and updated time.
- "ดูแผนที่น้ำท่วมด้วยระดับน้ำล่าสุด" deep-links into `index.html` with the station's tile bounds and water level prefilled.
- Optional forecast links appear for allowlisted HII/RID stations (shown with a dot badge).

## Data & Credits
- DEM: [Ho & Hengl (2025) Global Ensemble Digital Terrain Model 30 m (GEDTM30)](https://doi.org/10.5281/zenodo.14900181).
- Buildings: [GlobalBuildingAtlas](https://github.com/zhu-xlab/GlobalBuildingAtlas) (MIT with Commons Clause — no commercial use; see license link below). Citation:  
  Zhu, X. X., Chen, S., Zhang, F., Shi, Y., & Wang, Y. (2025). *GlobalBuildingAtlas: An Open Global and Complete Dataset of Building Polygons, Heights and LoD1 3D Models*. arXiv:2506.04106. https://arxiv.org/abs/2506.04106
- Libraries: [Leaflet](https://leafletjs.com/), [GeoTIFF.js](https://geotiffjs.github.io/), and [deck.gl](https://deck.gl/).

## Licensing Notes
- App code: Apache 2.0 (see `LICENSE`).
- GlobalBuildingAtlas data: MIT with Commons Clause (no commercial use). License text: https://github.com/zhu-xlab/GlobalBuildingAtlas/blob/main/LICENSE

## Customization Notes
- Update `COG_URL` in `app.js` if you want to target a different COG or geographic extent.
- `GRID_STEP_DEG` and `PROVINCE_DATA` define the selectable area/resolution and available search shortcuts; tweak them to point at another region or dataset resolution.
- For more advanced usage (tiling, caching, authentication), swap the `fetch` call with your own endpoint or add service-worker caching logic.

Happy mapping!
