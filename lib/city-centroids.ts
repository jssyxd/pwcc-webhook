/* ═══ CITY_CENTROIDS — Phase 02.7 D-08 ═══════════════════════════════════════
 * Wikipedia infobox CBD coordinates per city. The geospatial sanity check in
 * lib/weather-cities.ts (assertGeospatialSanity) measures haversine distance
 * from each STATION_REGISTRY entry's airport coordinates to the matching
 * centroid here and fails the build at module load time if any city's station
 * is more than 50km from its city center (unless distance_warning_acknowledged
 * is set on the registry entry).
 *
 * DO NOT use airport coordinates here — those ARE the station and live in
 * STATION_REGISTRY. CITY_CENTROIDS is the city center reference point.
 *
 * Source attribution: every entry carries a `source` field naming the
 * Wikipedia page title used. Replace coordinates only with another
 * authoritative source and update the attribution.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface CityCentroid {
  cityId: string
  lat: number
  lon: number
  source: string
}

/**
 * Great-circle distance between two lat/lon points in kilometers.
 * Uses the haversine formula with Earth radius 6371 km.
 */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371 // km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const CITY_CENTROIDS: Record<string, CityCentroid> = {
  nyc: { cityId: 'nyc', lat: 40.7128, lon: -74.006, source: 'wikipedia:New_York_City' },
  chicago: { cityId: 'chicago', lat: 41.8781, lon: -87.6298, source: 'wikipedia:Chicago' },
  miami: { cityId: 'miami', lat: 25.7617, lon: -80.1918, source: 'wikipedia:Miami' },
  dallas: { cityId: 'dallas', lat: 32.7767, lon: -96.797, source: 'wikipedia:Dallas' },
  atlanta: { cityId: 'atlanta', lat: 33.749, lon: -84.388, source: 'wikipedia:Atlanta' },
  seattle: { cityId: 'seattle', lat: 47.6062, lon: -122.3321, source: 'wikipedia:Seattle' },
  london: { cityId: 'london', lat: 51.5074, lon: -0.1278, source: 'wikipedia:London' },
  paris: { cityId: 'paris', lat: 48.8566, lon: 2.3522, source: 'wikipedia:Paris' },
  ankara: { cityId: 'ankara', lat: 39.9334, lon: 32.8597, source: 'wikipedia:Ankara' },
  'buenos-aires': {
    cityId: 'buenos-aires',
    lat: -34.6037,
    lon: -58.3816,
    source: 'wikipedia:Buenos_Aires',
  },
  'sao-paulo': {
    cityId: 'sao-paulo',
    lat: -23.5505,
    lon: -46.6333,
    source: 'wikipedia:São_Paulo',
  },
  seoul: { cityId: 'seoul', lat: 37.5665, lon: 126.978, source: 'wikipedia:Seoul' },
  toronto: { cityId: 'toronto', lat: 43.6532, lon: -79.3832, source: 'wikipedia:Toronto' },
  wellington: {
    cityId: 'wellington',
    lat: -41.2866,
    lon: 174.7756,
    source: 'wikipedia:Wellington',
  },
  tokyo: { cityId: 'tokyo', lat: 35.6762, lon: 139.6503, source: 'wikipedia:Tokyo' },
  taipei: { cityId: 'taipei', lat: 25.033, lon: 121.5654, source: 'wikipedia:Taipei' },
  shanghai: { cityId: 'shanghai', lat: 31.2304, lon: 121.4737, source: 'wikipedia:Shanghai' },
  shenzhen: { cityId: 'shenzhen', lat: 22.5431, lon: 114.0579, source: 'wikipedia:Shenzhen' },
  'hong-kong': {
    cityId: 'hong-kong',
    lat: 22.3193,
    lon: 114.1694,
    source: 'wikipedia:Hong_Kong',
  },
  chongqing: { cityId: 'chongqing', lat: 29.4316, lon: 106.9123, source: 'wikipedia:Chongqing' },
  beijing: { cityId: 'beijing', lat: 39.9042, lon: 116.4074, source: 'wikipedia:Beijing' },
  singapore: { cityId: 'singapore', lat: 1.3521, lon: 103.8198, source: 'wikipedia:Singapore' },
  chengdu: { cityId: 'chengdu', lat: 30.5728, lon: 104.0668, source: 'wikipedia:Chengdu' },
  madrid: { cityId: 'madrid', lat: 40.4168, lon: -3.7038, source: 'wikipedia:Madrid' },
  wuhan: { cityId: 'wuhan', lat: 30.5928, lon: 114.3055, source: 'wikipedia:Wuhan' },
  'mexico-city': {
    cityId: 'mexico-city',
    lat: 19.4326,
    lon: -99.1332,
    source: 'wikipedia:Mexico_City',
  },
  denver: { cityId: 'denver', lat: 39.7392, lon: -104.9903, source: 'wikipedia:Denver' },
  'los-angeles': {
    cityId: 'los-angeles',
    lat: 34.0522,
    lon: -118.2437,
    source: 'wikipedia:Los_Angeles',
  },
  milan: { cityId: 'milan', lat: 45.4642, lon: 9.19, source: 'wikipedia:Milan' },
  jakarta: { cityId: 'jakarta', lat: -6.2088, lon: 106.8456, source: 'wikipedia:Jakarta' },
  'kuala-lumpur': {
    cityId: 'kuala-lumpur',
    lat: 3.139,
    lon: 101.6869,
    source: 'wikipedia:Kuala_Lumpur',
  },
  munich: { cityId: 'munich', lat: 48.1351, lon: 11.582, source: 'wikipedia:Munich' },
  austin: { cityId: 'austin', lat: 30.2672, lon: -97.7431, source: 'wikipedia:Austin,_Texas' },
  busan: { cityId: 'busan', lat: 35.1796, lon: 129.0756, source: 'wikipedia:Busan' },
  lucknow: { cityId: 'lucknow', lat: 26.8467, lon: 80.9462, source: 'wikipedia:Lucknow' },
  amsterdam: { cityId: 'amsterdam', lat: 52.3676, lon: 4.9041, source: 'wikipedia:Amsterdam' },
  warsaw: { cityId: 'warsaw', lat: 52.2297, lon: 21.0122, source: 'wikipedia:Warsaw' },
  houston: { cityId: 'houston', lat: 29.7604, lon: -95.3698, source: 'wikipedia:Houston' },
  helsinki: { cityId: 'helsinki', lat: 60.1699, lon: 24.9384, source: 'wikipedia:Helsinki' },
  'san-francisco': {
    cityId: 'san-francisco',
    lat: 37.7749,
    lon: -122.4194,
    source: 'wikipedia:San_Francisco',
  },
  'panama-city': {
    cityId: 'panama-city',
    lat: 8.9824,
    lon: -79.5199,
    source: 'wikipedia:Panama_City',
  },
}
