/**
 * Per-city cold-advection sectors — compass directions FROM which cooler
 * air mass typically arrives for each Polymarket weather city.
 *
 * When METAR wind direction crosses into this sector and stays for 2+
 * observations, the day's peak is physically locked even if the thermometer
 * keeps rising for 5-15 min from leftover heat. The slope-regression engine
 * catches this 5-15 min LATER than the wind shift signals it.
 *
 * Building rule: northern hemisphere mid-latitude cities get cold air from
 * the north (Canadian for NA, Arctic/Maritime for EU, Mongolian for Asia).
 * Coastal cities get cool air from the ocean direction. Subtropical cities
 * (Miami, Singapore, KL) get cool air from the prevailing ocean breeze.
 *
 * Sectors are cardinal-string sets matching the windDirection field from
 * the API (16-point compass: N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW,
 * WSW, W, WNW, NW, NNW).
 *
 * Sources: NWS climate reports for each station, supplemented by national
 * met office prevailing-wind data. Confidence varies by city — sectors are
 * a heuristic, not a proven signal. Treat as ADVISORY, not auto-trade.
 */

const NORTHERN_HEMISPHERE_NORTHERN_SECTOR = ['N', 'NNE', 'NE', 'NNW', 'NW', 'WNW'] as const
const NORTH_AMERICA_CANADIAN_AIR = ['N', 'NNE', 'NNW', 'NW', 'WNW'] as const
const EUROPE_MARITIME_COOL = ['N', 'NNE', 'NE', 'NNW', 'NW'] as const
const MIAMI_OCEAN_NE = ['NE', 'ENE', 'NNE', 'E'] as const
const ASIA_CONTINENTAL_COOL = ['N', 'NNE', 'NNW', 'NW', 'WNW', 'W'] as const
const SOUTHERN_HEMISPHERE_SOUTHERN_SECTOR = ['S', 'SSE', 'SE', 'SSW', 'SW', 'WSW'] as const

export const COLD_ADVECTION_SECTORS: Record<string, readonly string[]> = {
  // North America (Canadian / cold fronts from NW)
  nyc: [...NORTH_AMERICA_CANADIAN_AIR],
  chicago: [...NORTH_AMERICA_CANADIAN_AIR],
  toronto: [...NORTH_AMERICA_CANADIAN_AIR],
  atlanta: ['N', 'NW', 'NNW', 'NNE', 'WNW'],
  dallas: ['N', 'NW', 'NNW', 'NNE'],
  denver: ['N', 'NW', 'NNW', 'NNE', 'W', 'WNW'], // mountain cool from W too
  'los-angeles': ['W', 'WNW', 'NW', 'WSW'], // ocean cool from W
  'san-francisco': ['W', 'WNW', 'NW', 'WSW'], // ocean cool from W
  seattle: ['W', 'WNW', 'NW', 'WSW', 'SW'], // Pacific marine
  austin: ['N', 'NW', 'NNW', 'NNE'],
  houston: ['N', 'NW', 'NNW', 'NNE'],
  miami: [...MIAMI_OCEAN_NE], // tropical, NE trade wind brings cool ocean air
  'mexico-city': ['N', 'NNE', 'NNW', 'NE'],
  'panama-city': ['N', 'NNE', 'NE'],

  // South America (Antarctic cool from south)
  'buenos-aires': [...SOUTHERN_HEMISPHERE_SOUTHERN_SECTOR],
  'sao-paulo': [...SOUTHERN_HEMISPHERE_SOUTHERN_SECTOR],

  // Europe (Arctic / North Sea cool)
  london: [...EUROPE_MARITIME_COOL, 'NE'],
  paris: [...EUROPE_MARITIME_COOL],
  madrid: ['N', 'NNW', 'NW', 'NNE'], // Pyrenees/Atlantic
  milan: ['N', 'NNW', 'NW', 'NNE'], // Alpine
  munich: ['N', 'NNW', 'NW', 'NNE'], // Alpine
  amsterdam: [...EUROPE_MARITIME_COOL],
  warsaw: ['N', 'NNE', 'NE', 'NNW', 'NW'],
  helsinki: ['N', 'NNE', 'NE', 'NNW', 'NW'],

  // Asia (Mongolian / Siberian / Pacific cool)
  beijing: [...ASIA_CONTINENTAL_COOL],
  shanghai: ['N', 'NNW', 'NW', 'NNE'],
  shenzhen: ['N', 'NNE', 'NE'],
  chengdu: ['N', 'NNW', 'NW', 'NNE'],
  chongqing: ['N', 'NNW', 'NW', 'NNE'],
  wuhan: [...ASIA_CONTINENTAL_COOL],
  'hong-kong': ['N', 'NNE', 'NE', 'NNW'],
  taipei: ['N', 'NNE', 'NE', 'NNW'],
  tokyo: [...ASIA_CONTINENTAL_COOL],
  seoul: [...ASIA_CONTINENTAL_COOL],
  busan: ['N', 'NNW', 'NW', 'NNE'],
  jakarta: ['N', 'NNE', 'NE'], // tropical, sea breeze
  'kuala-lumpur': ['N', 'NNE', 'NE'], // tropical
  singapore: ['N', 'NNE', 'NE', 'NW'],
  lucknow: [...ASIA_CONTINENTAL_COOL],

  // Other
  ankara: [...NORTHERN_HEMISPHERE_NORTHERN_SECTOR],
  istanbul: [...NORTHERN_HEMISPHERE_NORTHERN_SECTOR],
  wellington: [...SOUTHERN_HEMISPHERE_SOUTHERN_SECTOR],
  auckland: [...SOUTHERN_HEMISPHERE_SOUTHERN_SECTOR],
  boston: [...NORTH_AMERICA_CANADIAN_AIR],
  minneapolis: [...NORTH_AMERICA_CANADIAN_AIR],
}

/**
 * Returns true if the given cardinal wind direction is in the city's
 * cold-advection sector. Returns false if either input is null or city is
 * not in the registry (defensive — unknown city = no signal).
 */
export function isInColdSector(citySlug: string | null | undefined, windCardinal: string | null | undefined): boolean {
  if (!citySlug || !windCardinal) return false
  const sectors = COLD_ADVECTION_SECTORS[citySlug.toLowerCase()]
  if (!sectors) return false
  return sectors.includes(windCardinal.toUpperCase())
}

/**
 * Human-readable label for the city's cold sector (e.g. "NW–N–NE"). Used
 * in the chip tooltip so the user understands which compass directions
 * count as "cold" for THIS city.
 */
export function describeColdSector(citySlug: string | null | undefined): string {
  if (!citySlug) return 'unknown'
  const sectors = COLD_ADVECTION_SECTORS[citySlug.toLowerCase()]
  if (!sectors) return 'no sector defined for this city'
  return sectors.join(', ')
}
