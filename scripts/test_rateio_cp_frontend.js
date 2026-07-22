const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PERCENT_SCALE = 1_000_000;
const HUNDRED_PERCENT = 100 * PERCENT_SCALE;

function distributeEqually(totalCents, count) {
  assert.ok(Number.isInteger(totalCents) && totalCents >= 0);
  assert.ok(Number.isInteger(count) && count >= 2 && count <= 20);

  const percentBase = Math.floor(HUNDRED_PERCENT / count);
  const percentRemainder = HUNDRED_PERCENT - percentBase * count;
  const valueBase = Math.floor(totalCents / count);
  const valueRemainder = totalCents - valueBase * count;

  return Array.from({ length: count }, (_, index) => ({
    percentual: percentBase + (index < percentRemainder ? 1 : 0),
    valor: valueBase + (index < valueRemainder ? 1 : 0),
  }));
}

function valuesFromPercentages(totalCents, percentages) {
  const values = percentages.map((percentage) =>
    Math.round(totalCents * (percentage / HUNDRED_PERCENT)),
  );
  if (percentages.reduce((sum, value) => sum + value, 0) === HUNDRED_PERCENT) {
    values[values.length - 1] += totalCents - values.reduce((sum, value) => sum + value, 0);
  }
  return values;
}

function percentagesFromValues(totalCents, values) {
  const percentages = values.map((value) =>
    Math.round((value / totalCents) * HUNDRED_PERCENT),
  );
  if (values.reduce((sum, value) => sum + value, 0) === totalCents) {
    percentages[percentages.length - 1] += HUNDRED_PERCENT - percentages.reduce((sum, value) => sum + value, 0);
  }
  return percentages;
}

for (const scenario of [
  { total: 10000, count: 3 },
  { total: 1, count: 2 },
  { total: 987654321098, count: 20 },
]) {
  const result = distributeEqually(scenario.total, scenario.count);
  assert.equal(result.reduce((sum, item) => sum + item.valor, 0), scenario.total);
  assert.equal(result.reduce((sum, item) => sum + item.percentual, 0), HUNDRED_PERCENT);
}

const percentages = [25 * PERCENT_SCALE, 75 * PERCENT_SCALE];
assert.deepEqual(valuesFromPercentages(12345, percentages), [3086, 9259]);
assert.equal(valuesFromPercentages(12345, percentages).reduce((sum, value) => sum + value, 0), 12345);

const values = [3086, 9259];
const recalculatedPercentages = percentagesFromValues(12345, values);
assert.equal(recalculatedPercentages.reduce((sum, value) => sum + value, 0), HUNDRED_PERCENT);

const sourcePath = path.resolve(__dirname, '../src/app/(dashboard)/financeiro/pagar/page.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
assert.match(source, /if \(!editingId && fRateioAtivo\) \{/);
assert.match(source, /payload\.rateios = rateios\.map/);
assert.doesNotMatch(source, /rateios:\s*fRateioAtivo/);
assert.match(source, /if \(l\.rateio_id\) \{/);

console.log('Rateio CP frontend: cálculos e proteções estáticas OK.');
