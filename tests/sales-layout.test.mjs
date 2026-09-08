import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync('index.html', 'utf8');
const form = html.slice(html.indexOf('    <!-- STEP 1 -->'), html.indexOf('  <!-- Preview Panel -->'));

test('five hearing pages have the agreed ownership, one input per saved field and one page note each', () => {
  const pages = new Map([...form.matchAll(/id="step([1-5])">([\s\S]*?)(?=    <!-- STEP|$)/g)].map(([, n, body]) => [Number(n), body]));
  const expected = [
    [1, ['customer_name', 'desired_delivery', 'delivery_pref', 'industry', 'step_notes1']],
    [2, ['wastewater_type', 'daily_volume', 'working_days', 'metals', 'water_components', 'water-analysis-fields', 'step_notes2']],
    [3, ['tank_capacity', 'chemicals', 'powder_feeder', 'option_tanks', 'option_dehydrator', 'operating_hours', 'step_notes3']],
    [4, ['option_ph_tanks', 'level_sensors', 'extra-pump-table', 'quote-equipment-fields', 'step_notes4']],
    [5, ['raw_tank', 'power_status', 'space_area', 'pipe_distance', 'notes']]
  ];
  assert.equal(pages.size, 5);
  for (const [n, ids] of expected) {
    for (const id of ids) assert.ok(pages.get(n).includes(`id="${id}"`), `${id} belongs to page ${n}`);
    assert.equal([...pages.get(n).matchAll(/<textarea[^>]*id="(?:step_notes[1-4]|notes)"/g)].length, 1);
  }
  const ids = [...form.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(ids.length, new Set(ids).size, 'no duplicate inputs or stale page copies');
});
