/* ═══ Weather City Configuration — STATION_REGISTRY ═══════════════════════
 * Phase 02.7 (project law 2026-04-07) — canonical source of truth for
 * city → station resolution. Every other config in the codebase
 * (CITIES, NWS_STATIONS, METAR_RELIABILITY, etc.) derives from this file.
 *
 * The 2026-04-07 wrong-station incident proved that drift between hand-typed
 * station codes in route.ts and the actual Polymarket resolution station
 * costs real money. STATION_REGISTRY exists so there is exactly one place to
 * look up "what station does the city X market resolve from" and a CI test
 * (station-registry-duplication.test.ts) that fails the build on any literal
 * ICAO appearing outside this file.
 *
 * Each entry has:
 *   - name: human-readable city name (legacy field — kept for back compat)
 *   - displayName: UI label (currently == name; explicit field so UI can diverge)
 *   - station: ICAO (4 letters for METAR cities; "VHHH" for hong-kong even
 *              though Polymarket actually resolves from HKO Observatory — the
 *              station field still names the airport for live METAR fetches)
 *   - slug: Polymarket city slug fragment
 *   - unit: 'C' or 'F' — display unit on Polymarket
 *   - lat, lon: AIRPORT coordinates (decimal degrees, WGS84). NOT city centroid.
 *   - resolutionSourceType: 'METAR' for the 40 ASOS-backed cities;
 *     'OBSERVATORY' for hong-kong (HKO).
 *   - polymarketSlugTemplate: e.g. "highest-temperature-in-{slug}-on-{month}-{day}-{year}"
 *   - wuHistoryUrlTemplate: the URL Polymarket links inside its market description.
 *     For Hong Kong this points to the HKO climate page, NOT a wunderground URL.
 *   - distance_warning_acknowledged: optional escape hatch for the geospatial
 *     sanity check. Defaults to undefined; set to `true` only with a comment
 *     explaining why a station > 50km from city centroid is intentional.
 *
 * Use `assertGeospatialSanity({ strict: true })` at module-load time in any
 * file that needs to fail-closed on a drifted registry. The trading API does
 * exactly this near its other top-level imports.
 * ════════════════════════════════════════════════════════════════════════════ */

import { CITY_CENTROIDS, haversineKm } from './city-centroids'
import type { GroundTruthModelKey } from './schemas/win-rates'

export type ResolutionSourceType = 'METAR' | 'OBSERVATORY'

/**
 * Phase 02.9 trading-policy data quality flag. NOT a geospatial drift signal —
 * `distance_warning_acknowledged` covers that. This flag governs whether the
 * trading code is allowed to size positions on a city given how trustworthy
 * the underlying win rate data is.
 *
 *   verified              The default. Ground truth exists in
 *                         `data/weather/polymarket_asos_ground_truth_v1.json`
 *                         and the per-cell sample size is >= MIN_ATTEMPTS_FOR_TRUST.
 *                         Phase 02.11 backfilled Hong Kong (HKO Observatory)
 *                         into this same JSON, so hong-kong is now also verified.
 *   insufficient_sample   Ground truth exists but the canonical asos_exact cell
 *                         has fewer than MIN_ATTEMPTS_FOR_TRUST attempts. Trading
 *                         code MAY display the rate but MUST NOT size against it.
 *   unverified            No ground truth data exists for this city at all.
 *                         (Currently no cities carry this status — Hong Kong
 *                         was moved to `verified` in Phase 02.11 after the HKO
 *                         Observatory backfill.)
 *
 * Phase 02.12 (v3.60.0): `fake_value_quarantine` was REMOVED. The Phase 02.9
 * ground truth regeneration already wrote the correct rates into the JSON. The
 * quarantine was a temporary trust gate between Phase 02.9 and Phase 02.11 so
 * the dashboard wouldn't display rates that had just been corrected from
 * materially wrong values. Phase 02.11 and 02.12 verified the corrected rates
 * end-to-end (hand-derivation anchors + IIFE schema validation + ASOS strategy
 * overlay regeneration), so the quarantine paranoia is no longer load-bearing.
 * Traders see real rates directly now.
 */
export type DataQualityStatus = 'verified' | 'insufficient_sample' | 'unverified'

export interface StationRegistryEntry {
  name: string
  displayName: string
  station: string
  slug: string
  unit: 'C' | 'F'
  lat: number
  lon: number
  resolutionSourceType: ResolutionSourceType
  polymarketSlugTemplate: string
  wuHistoryUrlTemplate: string
  /** Set to true only with an explanatory comment to allow station > 50km from city centroid. */
  distance_warning_acknowledged?: boolean
  /**
   * Phase 02.9 (v3.57.0). Default `verified` when omitted. See
   * {@link DataQualityStatus} for the trading-policy semantics. Use
   * `getDataQualityStatus(cityId)` instead of reading this field directly so
   * the omit-defaults-to-verified contract is enforced in one place.
   */
  dataQualityStatus?: DataQualityStatus
  /**
   * @deprecated Phase 02.12 (v3.60.0). The quarantine paranoia was removed —
   * dashboard now shows the verified ground truth rates directly. Field kept
   * in the interface only as an optional no-op for backward type compatibility
   * with any external consumers. Do NOT set this on new entries; it is ignored
   * by `isModelQuarantined()` which always returns false.
   */
  modelQuarantines?: readonly GroundTruthModelKey[]
  /**
   * v3.79.0 FOUNDATION — optional per-city high-resolution regional NWP
   * models available on Open-Meteo. When set, these raw Open-Meteo model
   * keys are appended to the global `FORECAST_MODELS` list in the cron
   * query for THIS city only. Cities without regional coverage omit the
   * field entirely.
   *
   * Only European cities have regional high-res coverage as of v3.79.0:
   *   - meteofrance_arome_france / arome_france_hd / arpege_europe (France 1.3km)
   *   - ukmo_uk_deterministic_2km (UK 2km)
   *   - icon_d2 / icon_eu (DWD central Europe 2km/7km)
   *   - knmi_harmonie_arome_netherlands / knmi_harmonie_arome_europe (Netherlands)
   *   - metno_nordic (Scandinavian 2.5km)
   *
   * Regional values write to `forecast_current` under their raw OM key as
   * short name (no OM_TO_SHORT rewrite). They do NOT enter the verified
   * ground truth file or the strategy overlay in PR1 — that happens in
   * PR3 (ground truth recompute) and PR5 (overlay regen).
   *
   * Coverage is best-effort: if a regional model has no data for a specific
   * city, Open-Meteo simply omits the key from the response and the cron
   * null-skips it without raising an error.
   */
  regional_models?: readonly string[]
}

const POLYMARKET_SLUG_TEMPLATE = 'highest-temperature-in-{slug}-on-{month}-{day}-{year}'

/**
 * Canonical, ordered list of city IDs. CityKey is derived from this so that
 * `STATION_REGISTRY` can be typed as `Record<CityKey, StationRegistryEntry>`
 * without `as const` over-narrowing field types (which would erase the
 * optional `distance_warning_acknowledged` field and make the geospatial
 * sanity check unable to read it).
 */
export const CITY_IDS = [
  'nyc',
  'chicago',
  'miami',
  'dallas',
  'atlanta',
  'seattle',
  'london',
  'paris',
  'ankara',
  'buenos-aires',
  'sao-paulo',
  'seoul',
  'toronto',
  'wellington',
  'tokyo',
  'taipei',
  'shanghai',
  'shenzhen',
  'hong-kong',
  'chongqing',
  'beijing',
  'singapore',
  'chengdu',
  'madrid',
  'wuhan',
  'mexico-city',
  'denver',
  'los-angeles',
  'milan',
  'jakarta',
  'kuala-lumpur',
  'munich',
  'austin',
  'busan',
  'lucknow',
  'amsterdam',
  'warsaw',
  'houston',
  'helsinki',
  'san-francisco',
  'panama-city',
] as const

export type CityKey = (typeof CITY_IDS)[number]

/* ─── STATION_REGISTRY — 41 cities ──────────────────────────────────────────
 * Phase 02.6.2 hotfix 2026-04-07: 4 stations corrected against the literal
 * Polymarket market descriptions:
 *   - jakarta:     WIII (Soekarno-Hatta) → WIHH (Halim Perdanakusuma)
 *   - houston:     KIAH (Bush Intercontinental) → KHOU (William P. Hobby)
 *   - denver:      KDEN (Denver Intl) → KBKF (Buckley Space Force Base)
 *   - panama-city: MPTO (Tocumen Intl) → MPMG (Marcos A. Gelabert / Albrook)
 *
 * Airport lat/lon are pulled from aviationweather.gov authoritative airport
 * metadata. Each station's haversine distance to its city centroid (in
 * lib/city-centroids.ts) is verified < 50km by assertGeospatialSanity().
 * ──────────────────────────────────────────────────────────────────────────── */
export const STATION_REGISTRY = {
  nyc: {
    name: 'New York',
    displayName: 'New York',
    station: 'KLGA',
    slug: 'nyc',
    unit: 'F',
    lat: 40.7772,
    lon: -73.8726,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/ny/new-york/KLGA',
  },
  chicago: {
    name: 'Chicago',
    displayName: 'Chicago',
    station: 'KORD',
    slug: 'chicago',
    unit: 'F',
    lat: 41.9742,
    lon: -87.9073,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/il/chicago/KORD',
  },
  miami: {
    name: 'Miami',
    displayName: 'Miami',
    station: 'KMIA',
    slug: 'miami',
    unit: 'F',
    lat: 25.7932,
    lon: -80.2906,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/fl/miami/KMIA',
    // Phase 02.9 flagged KMA (dashboard 15.3% / real 6.63%). Phase 02.12
    // removed the quarantine — real rate is now shown directly; KMA is nowhere
    // near top of Miami's verified ranking so pick is unaffected.
  },
  dallas: {
    name: 'Dallas',
    displayName: 'Dallas',
    station: 'KDAL',
    slug: 'dallas',
    unit: 'F',
    lat: 32.8471,
    lon: -96.8518,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/tx/dallas/KDAL',
  },
  atlanta: {
    name: 'Atlanta',
    displayName: 'Atlanta',
    station: 'KATL',
    slug: 'atlanta',
    unit: 'F',
    lat: 33.6407,
    lon: -84.4277,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/ga/atlanta/KATL',
  },
  seattle: {
    name: 'Seattle',
    displayName: 'Seattle',
    station: 'KSEA',
    slug: 'seattle',
    unit: 'F',
    lat: 47.4502,
    lon: -122.3088,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/wa/seattle/KSEA',
  },
  london: {
    name: 'London',
    displayName: 'London',
    station: 'EGLC',
    slug: 'london',
    unit: 'C',
    lat: 51.5053,
    lon: 0.0553,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/gb/london/EGLC',
    // Phase 02.9 flagged ECMWF (dashboard 35.6% / real 16.01%) and KMA
    // (dashboard 41.1% / real 13.55%) as the two most-overstated London cells
    // (likely WU contamination — see asos_wu_all_cities_verify.json London
    // EGLL 47.7% exact match, 6°C worst-day gap). Phase 02.12 removed the
    // quarantine — traders now see the real 13.55%/16.01% directly; UKMO is
    // the verified top for London.
    // v3.79.0: UK Met Office 2km deterministic regional model (verified live
    // 2026-04-15 — returns data for London in multi-model queries).
    regional_models: ['ukmo_uk_deterministic_2km'],
  },
  paris: {
    name: 'Paris',
    displayName: 'Paris',
    // v3.99.52 (project law 2026-04-19, ~9:45 AM AST): STATION CORRECTED
    // LFPG → LFPB. Polymarket Paris temperature markets resolve to Paris-Le
    // Bourget (LFPB), NOT Charles de Gaulle (LFPG). Verified via Gamma API
    // event description + direct Polymarket.com page scrape on 2026-04-19.
    // Resolution URL: https://www.wunderground.com/history/daily/fr/bonneuil-en-france/LFPB
    // Downstream data (ASOS CSVs, residuals, ground truth) was all keyed to
    // LFPG — scheduled to be rebuilt against LFPB in a follow-up PR per
    // scorched-earth-bad-data.md. Until then, WARN banner on the UI says
    // "station recently changed — derived numbers catching up".
    station: 'LFPB',
    slug: 'paris',
    unit: 'C',
    lat: 48.9694,
    lon: 2.4414,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/fr/bonneuil-en-france/LFPB',
    // Phase 02.9 flagged KMA (dashboard 42.1% / real 16.01%). Phase 02.12
    // removed the quarantine — real rate is now shown directly.
    // v3.79.0: Meteo France AROME 1.3km + AROME-HD + ARPEGE-EU regionals
    // (verified live 2026-04-15 — all three return data for Paris).
    regional_models: ['meteofrance_arome_france', 'meteofrance_arome_france_hd', 'meteofrance_arpege_europe'],
  },
  ankara: {
    name: 'Ankara',
    displayName: 'Ankara',
    station: 'LTAC',
    slug: 'ankara',
    unit: 'C',
    lat: 40.1281,
    lon: 32.9951,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/tr/ankara/LTAC',
  },
  'buenos-aires': {
    name: 'Buenos Aires',
    displayName: 'Buenos Aires',
    station: 'SAEZ',
    slug: 'buenos-aires',
    unit: 'C',
    lat: -34.8222,
    lon: -58.5358,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/ar/buenos-aires/SAEZ',
    // Phase 02.9 flagged KMA (dashboard 27.8% / real 12.78%). Phase 02.12
    // removed the quarantine — real rate is now shown directly.
  },
  'sao-paulo': {
    name: 'São Paulo',
    displayName: 'São Paulo',
    station: 'SBGR',
    slug: 'sao-paulo',
    unit: 'C',
    lat: -23.4356,
    lon: -46.4731,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/br/sao-paulo/SBGR',
  },
  seoul: {
    name: 'Seoul',
    displayName: 'Seoul',
    station: 'RKSI',
    slug: 'seoul',
    unit: 'C',
    lat: 37.4602,
    lon: 126.4407,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/kr/seoul/RKSI',
    // Phase 02.9 flagged KMA (dashboard 28.3% / real 15.76%). Phase 02.12
    // removed the quarantine — real rate is now shown directly.
  },
  toronto: {
    name: 'Toronto',
    displayName: 'Toronto',
    station: 'CYYZ',
    slug: 'toronto',
    unit: 'C',
    lat: 43.6777,
    lon: -79.6248,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/ca/toronto/CYYZ',
    // Phase 02.9 flagged KMA (dashboard 26.3% / real 13.76%). Phase 02.12
    // removed the quarantine — real rate is now shown directly.
  },
  wellington: {
    name: 'Wellington',
    displayName: 'Wellington',
    station: 'NZWN',
    slug: 'wellington',
    unit: 'C',
    lat: -41.3272,
    lon: 174.8053,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/nz/wellington/NZWN',
    // Phase 02.9 flagged KMA (dashboard 35.8% / real 20.94%). Phase 02.12
    // removed the quarantine — real rate is now shown directly.
  },
  tokyo: {
    name: 'Tokyo',
    displayName: 'Tokyo',
    station: 'RJTT',
    slug: 'tokyo',
    unit: 'C',
    lat: 35.5523,
    lon: 139.7798,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/jp/tokyo/RJTT',
  },
  taipei: {
    name: 'Taipei',
    displayName: 'Taipei',
    station: 'RCSS',
    slug: 'taipei',
    unit: 'C',
    lat: 25.0697,
    lon: 121.5522,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/tw/taipei/RCSS',
    // Phase 02.9 flagged KMA (dashboard 24.8% / real 14.78%). Phase 02.12
    // removed the quarantine — real rate is now shown directly.
  },
  shanghai: {
    name: 'Shanghai',
    displayName: 'Shanghai',
    station: 'ZSPD',
    slug: 'shanghai',
    unit: 'C',
    lat: 31.1434,
    lon: 121.8052,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/cn/shanghai/ZSPD',
    // Phase 02.9 flagged KMA (dashboard 38.6% / real 26.35%). Phase 02.12
    // removed the quarantine — real rate is now shown directly.
  },
  shenzhen: {
    name: 'Shenzhen',
    displayName: 'Shenzhen',
    station: 'ZGSZ',
    slug: 'shenzhen',
    unit: 'C',
    lat: 22.6393,
    lon: 113.8108,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/cn/shenzhen/ZGSZ',
  },
  'hong-kong': {
    name: 'Hong Kong',
    displayName: 'Hong Kong',
    station: 'VHHH',
    slug: 'hong-kong',
    unit: 'C',
    lat: 22.308,
    lon: 113.9185,
    resolutionSourceType: 'OBSERVATORY',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    // HKO Observatory climate page — Polymarket resolves Hong Kong from HKO,
    // not the VHHH METAR. The station field above still names VHHH because
    // that's where the live METAR feed comes from (with HKO bias correction
    // applied downstream). resolutionSourceType=OBSERVATORY tells consumers
    // to route through the HKO provider for the authoritative observed peak.
    wuHistoryUrlTemplate: 'https://www.weather.gov.hk/en/cis/climat.htm',
    // Phase 02.11 cycle 1 (2026-04-08): FLIPPED from 'unverified' → 'verified'.
    // scripts/fetch_hko_historical.py backfilled 724 days of HKO Observatory
    // daily max temps (2024-04-08 → 2026-04-07) into
    // data/api-results/hko-historical/. scripts/polymarket_asos_backtest.py
    // was updated to merge HKO peaks into asos_peaks, so
    // polymarket_asos_ground_truth_v1.json now contains a full hong-kong cell
    // with 448-724 ASOS attempts per model (rates 21-27%). Polymarket pm_bucket
    // cell remains empty until Phase 02.11 cycle 2 re-fetches the parquet
    // markets (early-2025 snapshot had no HK markets), but asos_exact /
    // asos_within1 are authoritative and sufficient to unblock trading.
    dataQualityStatus: 'verified',
  },
  chongqing: {
    name: 'Chongqing',
    displayName: 'Chongqing',
    station: 'ZUCK',
    slug: 'chongqing',
    unit: 'C',
    lat: 29.7192,
    lon: 106.6417,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/cn/chongqing/ZUCK',
  },
  beijing: {
    name: 'Beijing',
    displayName: 'Beijing',
    station: 'ZBAA',
    slug: 'beijing',
    unit: 'C',
    lat: 40.0799,
    lon: 116.6031,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/cn/beijing/ZBAA',
  },
  singapore: {
    name: 'Singapore',
    displayName: 'Singapore',
    station: 'WSSS',
    slug: 'singapore',
    unit: 'C',
    lat: 1.3644,
    lon: 103.9915,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/sg/singapore/WSSS',
  },
  chengdu: {
    name: 'Chengdu',
    displayName: 'Chengdu',
    station: 'ZUUU',
    slug: 'chengdu',
    unit: 'C',
    lat: 30.5785,
    lon: 103.9471,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/cn/chengdu/ZUUU',
  },
  madrid: {
    name: 'Madrid',
    displayName: 'Madrid',
    station: 'LEMD',
    slug: 'madrid',
    unit: 'C',
    lat: 40.4719,
    lon: -3.5626,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/es/madrid/LEMD',
    // v3.79.0: Meteo France ARPEGE-EU covers Spain; DWD ICON-EU also covers
    // Iberia. Both are ~7km resolution regional blends.
    regional_models: ['meteofrance_arpege_europe', 'icon_eu'],
  },
  wuhan: {
    name: 'Wuhan',
    displayName: 'Wuhan',
    station: 'ZHHH',
    slug: 'wuhan',
    unit: 'C',
    lat: 30.7838,
    lon: 114.2081,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/cn/wuhan/ZHHH',
  },
  'mexico-city': {
    name: 'Mexico City',
    displayName: 'Mexico City',
    station: 'MMMX',
    slug: 'mexico-city',
    unit: 'C',
    lat: 19.4361,
    lon: -99.0719,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/mx/mexico-city/MMMX',
  },
  // ─── 15 new cities (41-city expansion 2026-04-06) ───────────────────────
  // Phase 02.6.2 hotfix 2026-04-07: 4 stations corrected.
  denver: {
    name: 'Denver',
    displayName: 'Denver',
    // v3.99.52 (project law 2026-04-19, ~9:45 AM AST): STATION REVERTED
    // KDEN → KBKF. Phase 02.15 "corrected" from KBKF to KDEN based on the
    // WU default — but the WU default is not what Polymarket resolves
    // against. Polymarket Denver temperature markets explicitly resolve to
    // Buckley Space Force Base (KBKF, Aurora CO). Verified via Gamma API
    // market description + Polymarket.com page scrape on 2026-04-19.
    // Resolution URL: https://www.wunderground.com/history/daily/us/co/aurora/KBKF
    station: 'KBKF',
    slug: 'denver',
    unit: 'F',
    lat: 39.7017,
    lon: -104.7517,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/co/aurora/KBKF',
  },
  'los-angeles': {
    name: 'Los Angeles',
    displayName: 'Los Angeles',
    station: 'KLAX',
    slug: 'los-angeles',
    unit: 'F',
    lat: 33.9416,
    lon: -118.4085,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/ca/los-angeles/KLAX',
  },
  milan: {
    name: 'Milan',
    displayName: 'Milan',
    station: 'LIMC',
    slug: 'milan',
    unit: 'C',
    lat: 45.6306,
    lon: 8.7281,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/it/milan/LIMC',
    // v3.79.0: ICON-EU covers N Italy (7km); AROME France reaches into NW
    // Italy. Northern Italy is at the overlap of DWD + MF coverage.
    regional_models: ['icon_eu', 'meteofrance_arome_france'],
  },
  jakarta: {
    name: 'Jakarta',
    displayName: 'Jakarta',
    station: 'WIHH',
    slug: 'jakarta',
    unit: 'C',
    lat: -6.2668,
    lon: 106.8909,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    // Polymarket-verified URL for the resolution station (Halim Perdanakusuma).
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/id/jakarta/WIHH',
  },
  'kuala-lumpur': {
    name: 'Kuala Lumpur',
    displayName: 'Kuala Lumpur',
    station: 'WMKK',
    slug: 'kuala-lumpur',
    unit: 'C',
    lat: 2.7456,
    lon: 101.7099,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/my/kuala-lumpur/WMKK',
  },
  munich: {
    name: 'Munich',
    displayName: 'Munich',
    station: 'EDDM',
    slug: 'munich',
    unit: 'C',
    lat: 48.3538,
    lon: 11.7861,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/de/munich/EDDM',
    // v3.79.0: DWD ICON-D2 (2km nowcast, Germany focus) + ICON-EU (7km).
    // Verified live 2026-04-15 — both return data for Munich coordinates.
    regional_models: ['icon_d2', 'icon_eu'],
  },
  austin: {
    name: 'Austin',
    displayName: 'Austin',
    station: 'KAUS',
    slug: 'austin',
    unit: 'F',
    lat: 30.1945,
    lon: -97.6699,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/tx/austin/KAUS',
  },
  busan: {
    name: 'Busan',
    displayName: 'Busan',
    station: 'RKPK',
    slug: 'busan',
    unit: 'C',
    lat: 35.1796,
    lon: 128.9385,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/kr/busan/RKPK',
  },
  lucknow: {
    name: 'Lucknow',
    displayName: 'Lucknow',
    station: 'VILK',
    slug: 'lucknow',
    unit: 'C',
    lat: 26.7606,
    lon: 80.8893,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/in/lucknow/VILK',
  },
  amsterdam: {
    name: 'Amsterdam',
    displayName: 'Amsterdam',
    station: 'EHAM',
    slug: 'amsterdam',
    unit: 'C',
    lat: 52.3105,
    lon: 4.7683,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/nl/amsterdam/EHAM',
    // v3.79.0: KNMI HARMONIE-AROME (Netherlands native 2.5km) + European
    // extension. Official Dutch forecasting model at resolution.
    regional_models: ['knmi_harmonie_arome_netherlands', 'knmi_harmonie_arome_europe'],
  },
  warsaw: {
    name: 'Warsaw',
    displayName: 'Warsaw',
    station: 'EPWA',
    slug: 'warsaw',
    unit: 'C',
    lat: 52.1657,
    lon: 20.9671,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/pl/warsaw/EPWA',
    // v3.79.0: DWD ICON-EU (7km) covers Poland.
    regional_models: ['icon_eu'],
  },
  houston: {
    name: 'Houston',
    displayName: 'Houston',
    // v3.99.52 (project law 2026-04-19, ~9:45 AM AST): STATION REVERTED
    // KIAH → KHOU. Phase 02.15 "corrected" from KHOU (Hobby) to KIAH
    // (Intercontinental) based on the WU default — but WU default ≠
    // Polymarket resolution source. Polymarket Houston temperature markets
    // explicitly resolve to William P. Hobby (KHOU, central-south Houston).
    // Verified via Gamma API + Polymarket.com page scrape on 2026-04-19.
    // Resolution URL: https://www.wunderground.com/history/daily/us/tx/houston/KHOU
    station: 'KHOU',
    slug: 'houston',
    unit: 'F',
    lat: 29.6454,
    lon: -95.2789,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/tx/houston/KHOU',
  },
  helsinki: {
    name: 'Helsinki',
    displayName: 'Helsinki',
    station: 'EFHK',
    slug: 'helsinki',
    unit: 'C',
    lat: 60.3172,
    lon: 24.9633,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/fi/helsinki/EFHK',
    // v3.79.0: MET Norway Nordic (2.5km Scandinavian regional).
    regional_models: ['metno_nordic'],
  },
  'san-francisco': {
    name: 'San Francisco',
    displayName: 'San Francisco',
    station: 'KSFO',
    slug: 'san-francisco',
    unit: 'F',
    lat: 37.6213,
    lon: -122.379,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/us/ca/san-francisco/KSFO',
  },
  'panama-city': {
    name: 'Panama City',
    displayName: 'Panama City',
    station: 'MPMG',
    slug: 'panama-city',
    unit: 'C',
    lat: 8.9756,
    lon: -79.5558,
    resolutionSourceType: 'METAR',
    polymarketSlugTemplate: POLYMARKET_SLUG_TEMPLATE,
    // Polymarket-verified URL (Marcos A. Gelabert / Albrook).
    wuHistoryUrlTemplate: 'https://www.wunderground.com/history/daily/pa/panama-city/MPMG',
  },
} as const satisfies Record<CityKey, StationRegistryEntry>

export type WeatherCity = StationRegistryEntry

/**
 * Get a registry entry as the canonical `StationRegistryEntry` interface.
 * Use this when you need to read optional fields like
 * `distance_warning_acknowledged` — the raw `STATION_REGISTRY[city]` access
 * preserves narrow literal types (good for compile-time correctness on
 * `station` / `resolutionSourceType` / etc.) but `satisfies` strips optional
 * fields that no entry currently has, so direct field access on those
 * fails type-checking. This widening accessor restores them.
 *
 * Codex review fix 2026-04-07.
 */
export function getRegistryEntry(cityId: CityKey): StationRegistryEntry {
  return STATION_REGISTRY[cityId] as StationRegistryEntry
}

/**
 * Iterate the registry as a list of `[cityId, StationRegistryEntry]` tuples
 * where each entry is widened to the canonical interface (so optional fields
 * are visible). Mirrors `Object.entries(STATION_REGISTRY)` semantics.
 */
export function listRegistryEntries(): Array<[CityKey, StationRegistryEntry]> {
  return Object.entries(STATION_REGISTRY).map(
    ([cityId, entry]) => [cityId as CityKey, entry as StationRegistryEntry] as const,
  )
}

/**
 * Backward-compat alias. Older code imports `WEATHER_CITIES` — this re-export
 * keeps it compiling. Remove the alias only after every call site has been
 * migrated to `STATION_REGISTRY` (out of scope for Phase 02.7).
 */
export const WEATHER_CITIES: Record<CityKey, StationRegistryEntry> = STATION_REGISTRY

/**
 * Phase 02.7 PLAN-08 — structured violation record returned by
 * `assertGeospatialSanity`. Used by tests, the daily drift cron, and any
 * downstream diagnostic tooling that wants to format the data itself rather
 * than parse a flattened error message.
 */
export interface GeospatialViolation {
  cityId: string
  station: string
  distance: number
  centroidLat: number
  centroidLon: number
  /** True when the centroid was missing from CITY_CENTROIDS for this city. */
  missingCentroid?: boolean
}

export interface GeospatialSanityResult {
  violations: GeospatialViolation[]
  totalCities: number
  withinLimit: number
}

/**
 * Helper for callers (tests, dashboards, drift cron) that just want the
 * haversine distance between a city's registry station and its centroid.
 * Returns null when either side is missing — never throws.
 *
 * Phase 02.7 PLAN-08.
 */
export function getStationCentroidDistance(cityId: string): number | null {
  const entry = (STATION_REGISTRY as Record<string, StationRegistryEntry | undefined>)[cityId]
  const centroid = CITY_CENTROIDS[cityId]
  if (!entry || !centroid) return null
  return haversineKm({ lat: entry.lat, lon: entry.lon }, { lat: centroid.lat, lon: centroid.lon })
}

/**
 * Pure helper that checks a single (entry, centroid) pair against the 50km
 * threshold. Exposed so tests can verify the throw path without having to
 * mutate the canonical STATION_REGISTRY. Returns the violation record (or
 * null if the entry is within the limit / acknowledged) instead of throwing.
 *
 * Phase 02.7 PLAN-08.
 */
export function checkEntryDistance(
  cityId: string,
  entry: Pick<StationRegistryEntry, 'station' | 'lat' | 'lon' | 'distance_warning_acknowledged'>,
  centroid: { lat: number; lon: number } | undefined,
): GeospatialViolation | null {
  if (!centroid) {
    return {
      cityId,
      station: entry.station,
      distance: NaN,
      centroidLat: NaN,
      centroidLon: NaN,
      missingCentroid: true,
    }
  }
  const dist = haversineKm({ lat: entry.lat, lon: entry.lon }, { lat: centroid.lat, lon: centroid.lon })
  if (dist <= 50 || entry.distance_warning_acknowledged === true) return null
  return {
    cityId,
    station: entry.station,
    distance: dist,
    centroidLat: centroid.lat,
    centroidLon: centroid.lon,
  }
}

/**
 * Walk every entry in STATION_REGISTRY and assert each station is within
 * 50km of its city centroid (per D-08).
 *
 * Mode selection (in order of precedence):
 *   1. opts.strict explicitly passed → use that
 *   2. GSD_REGISTRY_STRICT === '1'   → strict (throws on violation)
 *   3. NODE_ENV === 'test'           → strict (CI gate)
 *   4. NODE_ENV === 'production'     → SILENT NO-OP — production must never
 *      crash a Vercel cold start because of a registry validator. The CI
 *      tests already gate the same invariant before any commit ships.
 *   5. otherwise (development)       → warn-only via console.warn
 *
 * An entry can opt out by setting `distance_warning_acknowledged: true`,
 * which must be accompanied by an inline comment justifying why the station
 * is intentionally far from the city center.
 *
 * Phase 02.7 PLAN-08 refinement: now accepts an optional `registry` override
 * (so tests can probe the function with synthetic violations) and returns a
 * structured `{ violations, totalCities, withinLimit }` result instead of
 * void. Callers that ignore the return value still get the original
 * throw-or-warn semantics.
 *
 * Codex review feedback 2026-04-07: original implementation called
 * console.warn unconditionally in production, which is harmless but adds
 * cold-start log noise. The production no-op below removes that noise and
 * eliminates any non-zero risk that a future change to this function could
 * crash a Vercel cold start. CI is the canonical gate.
 */
export function assertGeospatialSanity(
  opts: {
    strict?: boolean
    registry?: Record<string, Pick<StationRegistryEntry, 'station' | 'lat' | 'lon' | 'distance_warning_acknowledged'>>
    centroids?: Record<string, { lat: number; lon: number } | undefined>
  } = {},
): GeospatialSanityResult {
  const isExplicit = typeof opts.strict === 'boolean'
  const isProduction = process.env.NODE_ENV === 'production'
  // Production no-op only applies when scanning the canonical registry. Tests
  // that pass an explicit registry override always run, regardless of NODE_ENV.
  if (!isExplicit && !opts.registry && isProduction) {
    return { violations: [], totalCities: 0, withinLimit: 0 }
  }
  const strict = opts.strict ?? (process.env.GSD_REGISTRY_STRICT === '1' || process.env.NODE_ENV === 'test')
  const registry =
    opts.registry ??
    (Object.fromEntries(listRegistryEntries()) as Record<
      string,
      Pick<StationRegistryEntry, 'station' | 'lat' | 'lon' | 'distance_warning_acknowledged'>
    >)
  const centroids = opts.centroids ?? CITY_CENTROIDS

  const violations: GeospatialViolation[] = []
  let withinLimit = 0
  const cityIds = Object.keys(registry)

  for (const cityId of cityIds) {
    const entry = registry[cityId]
    if (!entry) continue
    const centroid = centroids[cityId]
    const violation = checkEntryDistance(cityId, entry, centroid)
    if (violation === null) {
      withinLimit++
    } else {
      violations.push(violation)
    }
  }

  if (violations.length === 0) {
    return { violations, totalCities: cityIds.length, withinLimit }
  }
  const message =
    `[station-registry] ${violations.length} city(ies) failed geospatial sanity:\n` +
    violations
      .map((v) =>
        v.missingCentroid
          ? `  - ${v.cityId}: no centroid in CITY_CENTROIDS`
          : `  - ${v.cityId} ${v.station}: ${v.distance.toFixed(1)}km from centroid (> 50km limit)`,
      )
      .join('\n')
  if (strict) {
    throw new Error(message)
  }
  console.warn(message)
  return { violations, totalCities: cityIds.length, withinLimit }
}

/**
 * Phase 02.9 (v3.57.0) — single-source-of-truth getters for the data quality
 * trading-policy fields. Use these instead of reading
 * `STATION_REGISTRY[city].dataQualityStatus` directly so the omit-defaults-to-
 * verified contract is enforced in one place.
 */
export function getDataQualityStatus(cityId: CityKey): DataQualityStatus {
  return getRegistryEntry(cityId).dataQualityStatus ?? 'verified'
}

/**
 * @deprecated Phase 02.12 (v3.60.0) — always returns false. The quarantine
 * paranoia introduced in Phase 02.9 has been retired now that the corrected
 * ground truth rates are verified end-to-end. Kept as a no-op export so
 * external consumers still type-check while we migrate call sites. Remove
 * after v3.61.x once all imports are deleted.
 */
export function isModelQuarantined(_cityId: CityKey, _model: GroundTruthModelKey): boolean {
  return false
}

/**
 * True when trading code MUST refuse to size ANY position on this city. Returns
 * true only for `unverified` (no ground truth at all). Phase 02.11 backfilled
 * Hong Kong to `verified`, so at the time of writing no cities return true.
 */
export function shouldBlockAllTradesForCity(cityId: CityKey): boolean {
  return getDataQualityStatus(cityId) === 'unverified'
}

export const CITY_DISPLAY_COLORS: Record<string, string> = {
  'New York': '#3b82f6',
  Chicago: '#f59e0b',
  Miami: '#10b981',
  Dallas: '#ef4444',
  Atlanta: '#ec4899',
  Seattle: '#06b6d4',
  London: '#8b5cf6',
  Paris: '#f97316',
  Ankara: '#d946ef',
  'Buenos Aires': '#6366f1',
  'São Paulo': '#84cc16',
  Seoul: '#a855f7',
  Toronto: '#14b8a6',
  Wellington: '#0ea5e9',
  Tokyo: '#e11d48',
  Taipei: '#059669',
  Shanghai: '#7c3aed',
  Shenzhen: '#ca8a04',
  'Hong Kong': '#dc2626',
  Chongqing: '#2563eb',
  Beijing: '#c026d3',
  Singapore: '#16a34a',
  Chengdu: '#ea580c',
  Madrid: '#4f46e5',
  Wuhan: '#0d9488',
  'Mexico City': '#9333ea',
  // 15 new cities (41-city expansion -- 2026-04-06)
  Denver: '#7dd3fc',
  'Los Angeles': '#fbbf24',
  Milan: '#34d399',
  Jakarta: '#f87171',
  'Kuala Lumpur': '#c084fc',
  Munich: '#fb923c',
  Austin: '#a3e635',
  Busan: '#22d3ee',
  Lucknow: '#e879f9',
  Amsterdam: '#60a5fa',
  Warsaw: '#4ade80',
  Houston: '#f472b6',
  Helsinki: '#818cf8',
  'San Francisco': '#fcd34d',
  'Panama City': '#2dd4bf',
}
