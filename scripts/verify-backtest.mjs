#!/usr/bin/env node
// Recompute the README's verified-bets table from the shipped artifact.
// Usage: node scripts/verify-backtest.mjs
import { readFileSync } from 'fs'

const data = JSON.parse(readFileSync(new URL('../data/backtest/polymarket_asos_ground_truth_v1.json', import.meta.url)))

function wilson(hits, n, z = 1.96) {
  const p = hits / n
  const den = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return { lo: (center - half) * 100, hi: (center + half) * 100 }
}

const rows = []
for (const [city, models] of Object.entries(data.per_city_model)) {
  for (const [model, entry] of Object.entries(models)) {
    const pb = entry.pm_bucket
    if (!pb || pb.attempts < 300) continue
    const ci = wilson(pb.hits, pb.attempts)
    if (ci.lo > 49) rows.push({ city, model, rate: pb.rate, n: pb.attempts, lo: ci.lo, hi: ci.hi })
  }
}
rows.sort((a, b) => b.rate - a.rate)

console.log('Bets passing the gate (n >= 300 resolved markets AND 95% Wilson CI lower bound > 49%):\n')
for (const r of rows) {
  console.log(
    `${r.city}/${r.model}: ${r.rate.toFixed(2)}%  n=${r.n.toLocaleString('en-US')}  CI [${r.lo.toFixed(2)}%, ${r.hi.toFixed(2)}%]`,
  )
}
console.log('\nCompare with the table in README.md — it should match exactly.')
