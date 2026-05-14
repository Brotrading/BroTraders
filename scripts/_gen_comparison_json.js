// Run: node _gen_comparison_json.js
// Extracts allRows data from comparison.html and writes data/comparison-rows.json
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'comparison.html'), 'utf8');

// Extract data block: line "const allRows = [];" through "allRows.forEach(r => { r.showcase..."
const startMarker = '// COMPLETE DATASET';
const endMarker   = 'const firms = allRows.slice();';
const start = html.indexOf(startMarker);
const end   = html.indexOf(endMarker);
if (start === -1 || end === -1) { console.error('Markers not found'); process.exit(1); }

const dataBlock = html.slice(start, end).trim();

// Also extract OFAC_RESTRICTED and countryVals from the rendering section
const ofacStart  = html.indexOf('const OFAC_RESTRICTED = [');
const ofacEnd    = html.indexOf('];', ofacStart) + 2;
const ofacBlock  = html.slice(ofacStart, ofacEnd);

const cvStart = html.indexOf('const countryVals = [');
const cvEnd   = html.indexOf('];', cvStart) + 2;
const cvBlock = html.slice(cvStart, cvEnd);

// Execute in a sandboxed function
const allRows = [];
const fn = new Function('allRows', `
  ${dataBlock}
`);
fn(allRows);

let ofacRestricted, countryVals;
eval(ofacBlock + '\n' + cvBlock + '\n ofacRestricted = OFAC_RESTRICTED; countryVals = countryVals;');

// Build per-firm restrictedCountries map
const restrictedCountries = {};
for (const r of allRows) {
  if (!restrictedCountries[r.firm] && Array.isArray(r.restrictedCountries)) {
    restrictedCountries[r.firm] = r.restrictedCountries;
  }
  delete r.restrictedCountries; // remove from rows (stored in top-level map)
}

const output = {
  ofacRestricted,
  countryVals,
  restrictedCountries,
  rows: allRows
};

const outPath = path.join(__dirname, '..', 'data', 'comparison-rows.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`Written ${allRows.length} rows to ${outPath}`);
