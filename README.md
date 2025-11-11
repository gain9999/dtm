# Thailand Digital Terrain Model Viewer

Interactive, client-side Leaflet app that streams a 30 m digital elevation model (DEM) over Thailand directly from an open Cloud-Optimized GeoTIFF (COG). It lets you inspect terrain height, tune the color stretch, and compare multiple neighboring tiles without running a backend.

## Features
- Streams the GEDTM30 v1.2 DEM for Thailand from OpenGeoHub via GeoTIFF.js and renders it as a colorized raster overlay.
- Leaflet grid that highlights selectable ~0.02° cells; clicking a cell downloads only the needed pixels and keeps memory use low.
- Elevation legend with automatic min/max stats, adjustable max-value stretch slider, and opacity control for blending with the OpenStreetMap base layer.
- Flood-extent tooling: raise a water-height slider, configure the base river level and the minimum number of low cells that seed rivers, and instantly see connected flood regions tinted on the map with a live cell count.
- City/province search (including aliases and `lat,lon` queries) plus on-map sampling to inspect exact elevation values.
- Optional multi-select mode to show and compare several DEM tiles at once, with aggregated stats in the legend.
- Download progress indicator with byte-based tracking so large tiles feel responsive.

## Repository Layout
- `index.html` — single-page app shell, styles, and UI controls.
- `app.js` — all interaction logic: map wiring, DEM fetching, rendering, sampling, and UI state.
- `vendor/` — vendored Leaflet and GeoTIFF builds to keep the app self-contained.

## Getting Started
1. Use any static HTTP server (needed because browsers block `file://` fetches). Examples:
   - `python3 -m http.server 8000`
   - `npx serve .`
2. Open `http://localhost:8000` (or the port you picked) in a modern desktop browser.
3. Pan/zoom around Thailand, click a grid cell to fetch the DEM, then experiment with the sliders or multi-select toggle.

> Tip: Because the app hits `https://s3.opengeohub.org/...`, make sure your browser/network allows outbound HTTPS traffic.

## Controls At a Glance
- **Grid click**: Streams and colorizes the DEM cell; click inside the colored area to sample exact elevation via popup.
- **Max elevation slider**: Recomputes the color ramp to emphasize lower relief or remove outliers; resets when changing tiles unless multi-select is on.
- **Opacity slider**: Adjusts how strongly the raster overlay covers the OSM basemap.
- **Water height slider**: Expands connected flood regions by virtually raising the water surface; tinted pixels and the connected-cell counter update live.
- **Base river level / Min river cells**: Numeric inputs that control which low-lying components seed flood growth so you can focus on major rivers or explore smaller tributaries.
- **Multi-select toggle**: Keeps previously fetched cells on the map and aggregates stats in the legend.
- **Search**: Supports Thai province names, common aliases, or explicit `latitude,longitude` pairs.

## Data & Credits
- DEM: [Ho & Hengl (2025) Global Ensemble Digital Terrain Model 30 m (GEDTM30)](https://doi.org/10.5281/zenodo.14900181).
- Libraries: [Leaflet](https://leafletjs.com/) and [GeoTIFF.js](https://geotiffjs.github.io/).

## Customization Notes
- Update `COG_URL` in `app.js` if you want to target a different COG or geographic extent.
- `THAILAND_BOUNDS`, `GRID_STEP_DEG`, and `PROVINCE_DATA` define the selectable area and search shortcuts; tweak them to point at another country or dataset resolution.
- For more advanced usage (tiling, caching, authentication), swap the `fetch` call with your own endpoint or add service-worker caching logic.

Happy mapping!
