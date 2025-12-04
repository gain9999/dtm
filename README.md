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
- Stateful URLs: map center/zoom, opacity, water/base levels, min river cells, max-stretch slider, selected tiles, and overlay state sync into query parameters for sharing via the share button.

## Repository Layout
- `index.html` — single-page app shell, styles, and UI controls.
- `app.js` — all interaction logic: map wiring, DEM fetching, rendering, sampling, and UI state.
- `vendor/` — vendored Leaflet and GeoTIFF builds to keep the app self-contained.

## Getting Started
1. Use any static HTTP server (needed because browsers block `file://` fetches). Examples:
   - `python3 -m http.server 8000`
   - `npx serve .`
2. Open `http://localhost:8000` (or the port you picked) in a modern desktop browser.
3. Pan/zoom, click a grid cell to fetch the DEM, then experiment with the sliders or multi-select toggle.

> Tip: Because the app hits `https://s3.opengeohub.org/...`, make sure your browser/network allows outbound HTTPS traffic.

## Controls At a Glance
- **Grid click**: Streams and colorizes the DEM cell; click inside the colored area to sample exact elevation via popup.
- **Max elevation slider**: Recomputes the color ramp to emphasize lower relief or remove outliers; resets when changing tiles unless multi-select is on.
- **Opacity slider**: Adjusts how strongly the raster overlay covers the OSM basemap.
- **Water height slider**: Expands connected flood regions by virtually raising the water surface; tinted pixels and the connected-cell counter update live.
- **Base river level / Min river cells**: Numeric inputs that control which low-lying components seed flood growth, plus a dynamic water-height slider that can sit 12 m above that base.
- **Multi-select toggle**: Keeps previously fetched cells on the map and aggregates stats in the legend.
- **Search**: Supports province names, world cities (via the CSV fallback), common aliases, or explicit `latitude,longitude` pairs.
- **Locate**: Click the GPS button (bottom-right) to request geolocation and center the map on the detected coordinates.

## Sharing State via URL
- Query params are read on load and updated when you click the share button: `lat`, `lon`, `z`, `opacity`, `water`, `base`, `seed`, `max`, `tiles`, `gba`.
- `tiles` is a pipe-separated list of bounds keys (`south,west,north,east` with 5 decimals) so selected tiles re-download on load.
- Example: `?lat=12.5&lon=99.9&z=11.5&water=4&base=2&seed=40&opacity=60&max=500&gba=1&tiles=13.74000,100.52000,13.76000,100.54000|13.76000,100.54000,13.78000,100.56000` restores view, controls, overlay state, and the listed tiles.

## Data & Credits
- DEM: [Ho & Hengl (2025) Global Ensemble Digital Terrain Model 30 m (GEDTM30)](https://doi.org/10.5281/zenodo.14900181).
- Buildings: [GlobalBuildingAtlas](https://github.com/zhu-xlab/GlobalBuildingAtlas) (MIT with Commons Clause — no commercial use; see license link below). Citation:  
  Zhu, X. X., Chen, S., Zhang, F., Shi, Y., & Wang, Y. (2025). *GlobalBuildingAtlas: An Open Global and Complete Dataset of Building Polygons, Heights and LoD1 3D Models*. arXiv:2506.04106. https://arxiv.org/abs/2506.04106
- Libraries: [Leaflet](https://leafletjs.com/) and [GeoTIFF.js](https://geotiffjs.github.io/).

## Licensing Notes
- App code: Apache 2.0 (see `LICENSE`).
- GlobalBuildingAtlas data: MIT with Commons Clause (no commercial use). License text: https://github.com/zhu-xlab/GlobalBuildingAtlas/blob/main/LICENSE

## Customization Notes
- Update `COG_URL` in `app.js` if you want to target a different COG or geographic extent.
- `GRID_STEP_DEG` and `PROVINCE_DATA` define the selectable area/resolution and available search shortcuts; tweak them to point at another region or dataset resolution.
- For more advanced usage (tiling, caching, authentication), swap the `fetch` call with your own endpoint or add service-worker caching logic.

Happy mapping!
