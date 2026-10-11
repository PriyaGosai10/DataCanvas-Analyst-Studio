const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const { buildDashboardBlueprint } = require('../dist/engine/pipeline');
const { parseNumeric, sanitizeRows } = require('../dist/engine/sanitizer');

function run(name, fn) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}: ${error.stack || error}\n`); process.exitCode = 1; }
}

const { applyPreparation, previewPreparation } = require('../dist/services/dataPreparationService');
const { evaluateFormula, applyCalculatedColumns, validateRelationshipCardinality, collectSourceRows, evaluateMeasure, loadRelatedRows } = require('../dist/services/semanticModelService');

run('preparation preview does not mutate source rows and exposes before/after samples', () => {
  const rows = [{ name: '  Ada  ', group: ' North ', value: '12' }, { name: 'Bob', group: 'South', value: 'bad' }];
  const before = JSON.stringify(rows);
  const preview = previewPreparation(rows, { type: 'trim_text' }, [], 'Sheet1');
  assert.equal(JSON.stringify(rows), before);
  assert.equal(preview.sampleAfter[0].name, 'Ada');
  assert.equal(preview.affected, 2);
});

run('approved preparation operations can be deactivated and remain worksheet-scoped', () => {
  const rows = [{ region: ' North ' }, { region: 'South'}];
  const history = [{ id: 'a', operation: { type: 'normalize_category', column: 'region', mode: 'lowercase' }, active: true, createdAt: new Date().toISOString(), summary: 'normalize', sheetName: 'Sheet1' }];
  assert.equal(applyPreparation(rows, history, 'Sheet1').rows[0].region, 'north');
  assert.equal(applyPreparation(rows, history, 'Sheet2').rows[0].region, ' North ');
  history[0].active = false;
  assert.equal(applyPreparation(rows, history, 'Sheet1').rows[0].region, ' North ');
});

run('numeric conversion preserves unparseable values as null instead of zero', () => {
  const rows = [{ amount: '1,200' }, { amount: 'not available' }, { amount: '' }];
  const result = applyPreparation(rows, [{ id: 'a', operation: { type: 'convert_numeric', column: 'amount' }, active: true, createdAt: new Date().toISOString(), summary: 'convert', sheetName: 'Sheet1' }], 'Sheet1');
  assert.equal(result.rows[0].amount, 1200);
  assert.equal(result.rows[1].amount, null);
  assert.equal(result.rows[2].amount, '');
});


run('date conversion flags invalid date values instead of silently retaining them', () => {
  const rows = [{ date: '2026-01-01' }, { date: 'not a date' }];
  const result = applyPreparation(rows, [{ id: 'date', operation: { type: 'convert_date', column: 'date' }, active: true, createdAt: new Date().toISOString(), summary: 'date conversion', sheetName: 'Sheet1' }], 'Sheet1');
  assert.ok(result.rows[0].date instanceof Date);
  assert.equal(result.rows[1].date, null);
});

run('duplicate-row removal only affects prepared output and preserves the original input', () => {
  const rows = [{ id: 1, value: 'x' }, { id: 1, value: 'x' }, { id: 2, value: 'y' }];
  const result = applyPreparation(rows, [{ id: 'a', operation: { type: 'drop_duplicate_rows' }, active: true, createdAt: new Date().toISOString(), summary: 'deduplicate', sheetName: 'Sheet1' }], 'Sheet1');
  assert.equal(result.rows.length, 2);
  assert.equal(rows.length, 3);
});

run('normalizes mixed currency strings and null sentinels', () => {
  const rows = [
    { order_id: 1001, transaction_date: '2026-01-01', revenue: '$1,200.00', rating: 5, region: 'West' },
    { order_id: 1002, transaction_date: '2026-01-02', revenue: 'N/A', rating: 4, region: 'East' },
    { order_id: 1003, transaction_date: '2026-01-05', revenue: '₹800', rating: 3, region: 'West' }
  ];
  const { blueprint, sanitized } = buildDashboardBlueprint(rows, 'test-dashboard');
  assert.equal(sanitized.rowCount, 3);
  assert.equal(sanitized.rows[1].revenue, null);
  assert.equal(blueprint.schemaContext.columns.revenue.inferredType, 'currency');
  assert.equal(blueprint.schemaContext.columns.order_id.inferredType, 'identifier');
  assert.equal(blueprint.schemaContext.columns.rating.recommendedAggregation, 'count');
  assert.ok(blueprint.visualManifest.visuals.length <= 7);
});


run('recognizes common slash-formatted spreadsheet dates', () => {
  const rows = [
    { order_date: '8/13/2013', revenue: 120 },
    { order_date: '9/13/2013', revenue: 150 },
    { order_date: '10/13/2013', revenue: 180 }
  ];
  const { blueprint } = buildDashboardBlueprint(rows, 'slash-date-dashboard');
  assert.equal(blueprint.schemaContext.columns.order_date.inferredType, 'date');
  assert.equal(blueprint.schemaContext.dateTopology[0].observedPeriods, 3);
  assert.ok(blueprint.visualManifest.visuals.some(v => v.type === 'line'));
});

run('does not generate dashboards from empty data', () => {
  assert.throws(() => buildDashboardBlueprint([], 'empty-dashboard'), /No usable rows/);
});

run('renames duplicate headers and warns', () => {
  const { sanitized } = buildDashboardBlueprint([{ Value: 10, 'Value ': 20, region: 'North' }, { Value: 30, 'Value ': 40, region: 'South' }, { Value: 50, 'Value ': 60, region: 'West' }], 'duplicate-dashboard');
  assert.equal(new Set(sanitized.headers).size, sanitized.headers.length);
  assert.ok(sanitized.warnings.some(w => w.code === 'DUPLICATE_HEADER'));
});

run('uses responsive grid contracts and caps visuals at seven', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, revenue: i * 10 + 1, cost: i * 3 + 1, region: ['East', 'West', 'North', 'South'][i % 4], channel: ['Web', 'Store'][i % 2] }));
  const { blueprint } = buildDashboardBlueprint(rows, 'grid-dashboard');
  assert.ok(blueprint.visualManifest.visuals.length <= 7);
  assert.equal(blueprint.gridLayout.columns, 12);
  assert.ok(blueprint.gridLayout.sm.every(item => item.w === 12));
  assert.ok(blueprint.gridLayout.md.every(item => item.w <= 12));
});


run('supports localized semantic aliases for Gujarati business headers', () => {
  const rows = [{ 'આવક': '₹100', region: 'East' }, { 'આવક': '₹200', region: 'West' }, { 'આવક': '₹150', region: 'East' }];
  const { blueprint } = buildDashboardBlueprint(rows, 'localized-dashboard');
  const revenue = blueprint.schemaContext.columns['આવક'];
  assert.equal(revenue.semanticRole, 'revenue');
  assert.equal(revenue.inferredType, 'currency');
  assert.ok(blueprint.metricRegistry.metrics.some(m => m.dependencies.includes('આવક') && m.safe));
});

run('does not treat narrow ratings or sequential IDs as additive metrics', () => {
  const rows = [
    { record_id: 1001, rating: 1, revenue: 100 },
    { record_id: 1002, rating: 2, revenue: 200 },
    { record_id: 1003, rating: 5, revenue: 300 },
    { record_id: 1004, rating: 3, revenue: 400 }
  ];
  const { blueprint } = buildDashboardBlueprint(rows, 'guard-dashboard');
  const idProfile = blueprint.schemaContext.columns.record_id;
  const ratingProfile = blueprint.schemaContext.columns.rating;
  assert.equal(idProfile.inferredType, 'identifier');
  assert.equal(ratingProfile.recommendedAggregation, 'count');
  assert.ok(!blueprint.metricRegistry.metrics.some(m => m.dependencies.includes('record_id')));
  assert.ok(!blueprint.metricRegistry.metrics.some(m => m.dependencies.includes('rating')));
});

run('detects business-day date topology without treating weekends as business gaps', () => {
  const rows = [
    { transaction_date: '2026-01-05', revenue: 100, region: 'East' },
    { transaction_date: '2026-01-06', revenue: 120, region: 'East' },
    { transaction_date: '2026-01-07', revenue: 130, region: 'West' },
    { transaction_date: '2026-01-08', revenue: 140, region: 'West' },
    { transaction_date: '2026-01-09', revenue: 150, region: 'East' },
    { transaction_date: '2026-01-12', revenue: 160, region: 'West' }
  ];
  const { blueprint } = buildDashboardBlueprint(rows, 'date-topology-dashboard');
  const topology = blueprint.schemaContext.dateTopology[0];
  assert.ok(['daily', 'business_daily'].includes(topology.frequency));
  assert.equal(topology.observedPeriods, 6);
  assert.ok(topology.businessDayContinuity >= 0.9);
});

run('does not treat budget as a safe additive measure without grain metadata', () => {
  const rows = [{ monthly_budget: 5000, revenue: 1200, department: 'Sales' }, { monthly_budget: 5000, revenue: 1800, department: 'Sales' }, { monthly_budget: 5000, revenue: 900, department: 'Support' }];
  const { blueprint } = buildDashboardBlueprint(rows, 'budget-dashboard');
  const budget = blueprint.metricRegistry.metrics.find(m => m.dependencies.includes('monthly_budget'));
  assert.equal(budget.safe, false);
  assert.ok(blueprint.generationNotes.some(note => note.includes('grain/additivity is unknown')));
});

run('creates deterministic seed for same dataset and options', () => {
  const rows = [{ revenue: 10, region: 'East' }, { revenue: 20, region: 'West' }];
  const a = buildDashboardBlueprint(rows, 'stable-id', { theme: 'dark' }).blueprint;
  const b = buildDashboardBlueprint(rows, 'stable-id', { theme: 'dark' }).blueprint;
  assert.equal(a.meta.seed, b.meta.seed);
});

run('uses distinct information architecture for executive, exploration, and insights dashboards', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    campaign_date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    revenue: 100 + i * 20,
    ad_spend: 10 + i * 3,
    campaign: ['Search', 'Social', 'Email'][i % 3],
    region: ['North', 'South'][i % 2]
  }));
  const executive = buildDashboardBlueprint(rows, 'purpose-test', { purpose: 'executive', generationKey: 'stable' }).blueprint.visualManifest.visuals;
  const exploration = buildDashboardBlueprint(rows, 'purpose-test', { purpose: 'exploration', generationKey: 'stable' }).blueprint.visualManifest.visuals;
  const insights = buildDashboardBlueprint(rows, 'purpose-test', { purpose: 'insights', generationKey: 'stable' }).blueprint.visualManifest.visuals;
  assert.notDeepEqual(executive.map(v => v.intent), exploration.map(v => v.intent));
  assert.notDeepEqual(executive.map(v => v.intent), insights.map(v => v.intent));
  assert.ok(exploration.some(v => v.intent.includes('exploration') || v.intent === 'relationship_exploration'));
  assert.ok(insights.some(v => v.intent.includes('risk') || v.intent.includes('concentration')));
});

run('does not use ordinary numeric measures as chart categories', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    revenue: 100 + i * 5,
    clicks: 10 + i,
    impressions: 1000 + i * 30,
    campaign: ['Search', 'Social', 'Email', 'Display'][i % 4]
  }));
  const { blueprint } = buildDashboardBlueprint(rows, 'numeric-category-guard');
  for (const visual of blueprint.visualManifest.visuals) {
    if (visual.type === 'bar' || visual.type === 'donut' || visual.type === 'pie') {
      const x = visual.encodings.x;
      assert.notEqual(x, 'revenue');
      assert.notEqual(x, 'clicks');
      assert.notEqual(x, 'impressions');
    }
  }
});

run('generates the same selected fields for repeated runs with the same purpose', () => {
  const rows = [
    { date: '2026-01-01', revenue: 100, cost: 30, region: 'North' },
    { date: '2026-01-02', revenue: 120, cost: 40, region: 'South' },
    { date: '2026-01-03', revenue: 90, cost: 20, region: 'North' }
  ];
  const a = buildDashboardBlueprint(rows, 'repeatable-purpose', { purpose: 'executive', generationKey: 'repeatable' }).blueprint.visualManifest.visuals;
  const b = buildDashboardBlueprint(rows, 'repeatable-purpose', { purpose: 'executive', generationKey: 'repeatable' }).blueprint.visualManifest.visuals;
  assert.deepEqual(a.map(v => ({ type: v.type, title: v.title, x: v.encodings.x, y: v.datasetField })), b.map(v => ({ type: v.type, title: v.title, x: v.encodings.x, y: v.datasetField })));
});

run('does not auto-average percentage and ratio fields as standalone KPIs', () => {
  const rows = [
    { clicks: 10, impressions: 100, ctr: 10, revenue: 200, ad_spend: 20 },
    { clicks: 90, impressions: 900, ctr: 10, revenue: 1800, ad_spend: 180 },
    { clicks: 5, impressions: 200, ctr: 2.5, revenue: 100, ad_spend: 50 }
  ];
  const { blueprint } = buildDashboardBlueprint(rows, 'rate-aggregation-guard');
  assert.equal(blueprint.schemaContext.columns.ctr.semanticRole, 'percentage');
  assert.ok(!blueprint.metricRegistry.metrics.some(m => m.dependencies.includes('ctr')));
  assert.ok(!blueprint.visualManifest.visuals.some(v => v.datasetField === 'ctr'));
});


run('safely evaluates CTR from aggregate sums without averaging row-level rates', () => {
  const rows = [{ clicks: 10, impressions: 100 }, { clicks: 90, impressions: 900 }, { clicks: 5, impressions: 200 }];
  const ctr = evaluateFormula('SUM([clicks]) / SUM([impressions]) * 100', {}, rows, true);
  assert.ok(Math.abs(ctr - (105 / 1200 * 100)) < 1e-9);
  assert.equal(evaluateFormula('SUM([clicks]) / SUM([missing]) * 100', {}, rows, true), null);
});

run('calculated columns evaluate row-level arithmetic and keep division-by-zero as null', () => {
  const rows = [{ revenue: 120, cost: 50 }, { revenue: 20, cost: 25 }, { revenue: 10, cost: 0 }];
  applyCalculatedColumns(rows, [{ id: 'profit', name: 'Gross Profit', formula: '[revenue] - [cost]', active: true }], 'Sales');
  assert.deepEqual(rows.map(r => r['Gross Profit']), [70, -5, 10]);
  assert.equal(evaluateFormula('[revenue] / [cost]', { revenue: 10, cost: 0 }), null);
});

run('formula parser rejects executable code and unsupported functions', () => {
  assert.throws(() => evaluateFormula('process.exit(1)', {}, [], true), /Unsupported formula character|Function PROCESS is not allowed/);
  assert.throws(() => evaluateFormula('POWER([revenue], 2)', {}, [{ revenue: 3 }], true), /Unsupported formula character|Function POWER is not allowed/);
});


run('relationship cardinality rejects duplicate keys on a declared one-side', () => {
  const left = [{ id: 1 }, { id: 2 }];
  const right = [{ customerId: 1 }, { customerId: 1 }];
  assert.throws(() => validateRelationshipCardinality(left, right, { leftSheet: 'Orders', leftKey: 'id', rightSheet: 'Customers', rightKey: 'customerId', cardinality: 'many-to-one' }), /right key is not unique/);
  assert.deepEqual(validateRelationshipCardinality([{ id: 1 }, { id: 2 }], [{ customerId: 1 }, { customerId: 2 }], { leftSheet: 'Orders', leftKey: 'id', rightSheet: 'Customers', rightKey: 'customerId', cardinality: 'many-to-one' }), { cardinality: 'many-to-one', leftKeyUnique: true, rightKeyUnique: true });
});

run('saved measures remain reusable aggregate formulas', () => {
  const rows = [{ clicks: 20, impressions: 200 }, { clicks: 10, impressions: 100 }];
  const ctr = evaluateFormula('SUM([clicks]) / SUM([impressions]) * 100', {}, rows, true);
  assert.equal(ctr, 10);
});

run('lineage metadata does not change duplicate-row detection', () => {
  const rows = [{ id: 1, __sourceRows: [{ worksheet: 'Sales', rowNumber: 2 }] }, { id: 1, __sourceRows: [{ worksheet: 'Sales', rowNumber: 3 }] }];
  const result = applyPreparation(rows, [{ id: 'dedupe', operation: { type: 'drop_duplicate_rows' }, active: true, createdAt: new Date().toISOString(), summary: 'dedupe', sheetName: 'Sales' }], 'Sales');
  assert.equal(result.rows.length, 1);
  assert.deepEqual(rows[1].__sourceRows, [{ worksheet: 'Sales', rowNumber: 3 }]);
});

run('calculated columns resolve dependencies regardless of saved definition order', () => {
  const rows = [{ revenue: 120, cost: 70 }];
  const defs = [
    { id: 'profit-margin', name: 'margin', formula: '[profit] / [revenue] * 100', active: true, sheetName: 'Sales' },
    { id: 'profit', name: 'profit', formula: '[revenue] - [cost]', active: true, sheetName: 'Sales' }
  ];
  applyCalculatedColumns(rows, defs, 'Sales');
  assert.equal(rows[0].profit, 50);
  assert.equal(rows[0].margin, 41.66666666666667);
});

run('accounting-style parenthesized numeric values are parsed as negative', () => {
  assert.equal(evaluateFormula('[Amount]', { Amount: '(1,200)' }), -1200);
});

run('source lineage is deduplicated by worksheet and row number after one-to-many joins', () => {
  const refs = collectSourceRows([
    { __sourceRows: [{ worksheet: 'Sales', rowNumber: 2 }, { worksheet: 'Products', rowNumber: 8 }] },
    { __sourceRows: [{ worksheet: 'Sales', rowNumber: 2 }, { worksheet: 'Products', rowNumber: 9 }] }
  ]);
  assert.equal(refs.length, 3);
  assert.deepEqual(refs.map(x => `${x.worksheet}:${x.rowNumber}`).sort(), ['Products:8', 'Products:9', 'Sales:2']);
});

run('saved aggregate measures can evaluate fields qualified by worksheet name', () => {
  const rows = [{ 'Campaigns.Clicks': 10, 'Campaigns.Impressions': 100 }, { 'Campaigns.Clicks': 20, 'Campaigns.Impressions': 200 }];
  const value = evaluateMeasure(rows, { name: 'CTR', formula: 'SUM([Campaigns.Clicks]) / SUM([Campaigns.Impressions]) * 100', active: true });
  assert.equal(value, 10);
});

run('reverse-direction multi-hop worksheet joins preserve the selected worksheet and related calculated columns', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['orderId','customerId','qty','unitPrice'],[1,10,2,5],[2,11,3,7],[3,99,1,4]]), 'Orders');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['customerId','customerName','regionId'],[10,'Ada',100],[11,'Ben',101]]), 'Customers');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['regionId','regionName'],[100,'North'],[101,'South'],[102,'West']]), 'Regions');
  const filePath = path.join(os.tmpdir(), `datacanvas-semantic-${process.pid}.xlsx`);
  XLSX.writeFile(workbook, filePath);
  try {
    const relationships = [
      { id:'oc', leftSheet:'Orders', leftKey:'customerId', rightSheet:'Customers', rightKey:'customerId', joinType:'left', cardinality:'many-to-one', active:true },
      { id:'cr', leftSheet:'Customers', leftKey:'regionId', rightSheet:'Regions', rightKey:'regionId', joinType:'left', cardinality:'many-to-one', active:true }
    ];
    const columns = [{ id:'gross', name:'gross', formula:'[qty] * [unitPrice]', sheetName:'Orders', active:true }];
    const result = loadRelatedRows(filePath, 'Regions', [], relationships, columns);
    assert.equal(result.rows.length, 3);
    assert.deepEqual(new Set(result.joinedSheets), new Set(['Customers','Orders']));
    assert.equal(result.rows.find(row => row.regionName === 'North')['Orders.gross'], 10);
    assert.equal(result.rows.find(row => row.regionName === 'South')['Orders.gross'], 21);
    assert.equal(result.rows.find(row => row.regionName === 'West')['Orders.gross'], null);
    assert.equal(result.sourceRowReferences.length, 7);
  } finally { fs.rmSync(filePath, { force: true }); }
});

run('ambiguous relationship cycles are rejected instead of silently skipping a join', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['orderId','customerId'],[1,10]]), 'Orders');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['customerId','regionId'],[10,100]]), 'Customers');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['regionId'],[100]]), 'Regions');
  const filePath = path.join(os.tmpdir(), `datacanvas-semantic-cycle-${process.pid}.xlsx`);
  XLSX.writeFile(workbook, filePath);
  const relationships = [
    { id:'oc', leftSheet:'Orders', leftKey:'customerId', rightSheet:'Customers', rightKey:'customerId', joinType:'left', cardinality:'many-to-one', active:true },
    { id:'cr', leftSheet:'Customers', leftKey:'regionId', rightSheet:'Regions', rightKey:'regionId', joinType:'left', cardinality:'many-to-one', active:true },
    { id:'or', leftSheet:'Orders', leftKey:'orderId', rightSheet:'Regions', rightKey:'regionId', joinType:'left', cardinality:'many-to-many', active:true }
  ];
  try { assert.throws(() => loadRelatedRows(filePath, 'Regions', [], relationships), /Ambiguous relationship cycle/); }
  finally { fs.rmSync(filePath, { force: true }); }
});

run('saved measures fail clearly when a referenced field is unavailable in the active semantic model', () => {
  assert.throws(() => evaluateMeasure([{ Revenue: 100 }], { id:'m', name:'ROAS', formula:'SUM([Revenue]) / SUM([Campaigns.Spend])', active:true }), /unavailable field/);
});


run('parses common international spreadsheet numeric formats consistently', () => {
  assert.equal(parseNumeric('$1,234.56'), 1234.56);
  assert.equal(parseNumeric('€1.234,56'), 1234.56);
  assert.equal(parseNumeric('₹ 1,23,456.78'), 123456.78);
  assert.equal(parseNumeric('(1,200.00)'), -1200);
  assert.equal(parseNumeric('1,25'), 1.25);
  assert.equal(parseNumeric('12.5%'), 0.125);
  assert.equal(parseNumeric('not available'), null);
});

run('flags mixed numeric values and high missingness during automatic cleaning', () => {
  const rows = [
    { amount: '100', region: 'East' }, { amount: '200', region: 'East' },
    { amount: 'bad', region: '' }, { amount: '400', region: 'West' },
    { amount: 'unknown', region: '' }, { amount: '600', region: 'West' }
  ];
  const result = sanitizeRows(rows);
  assert.ok(result.warnings.some(w => w.code === 'MIXED_NUMERIC_FORMAT' && w.column === 'amount'));
  assert.ok(result.warnings.some(w => w.code === 'HIGH_MISSINGNESS' && w.column === 'region'));
});

run('generates a usable count dashboard for category-only data', () => {
  const rows = [
    { department: 'Sales', employee: 'A' }, { department: 'Sales', employee: 'B' },
    { department: 'Support', employee: 'C' }, { department: 'Finance', employee: 'D' }
  ];
  const { blueprint } = buildDashboardBlueprint(rows, 'category-only-data');
  assert.ok(blueprint.visualManifest.visuals.some(v => v.type === 'bar' && v.aggregation === 'count'));
});

run('adapts visual field choices to marketing data instead of assuming sales columns', () => {
  const rows = Array.from({ length: 24 }, (_, i) => ({
    campaign_date: `2026-${String(Math.floor(i / 4) + 1).padStart(2, '0')}-${String((i % 4) + 1).padStart(2, '0')}`,
    campaign: ['Search', 'Social', 'Email'][i % 3],
    clicks: 10 + i,
    impressions: 500 + i * 10,
    ad_spend: 20 + i * 2,
    conversions: i % 5
  }));
  const { blueprint } = buildDashboardBlueprint(rows, 'marketing-shape');
  const visuals = blueprint.visualManifest.visuals;
  assert.ok(visuals.some(v => v.encodings.x === 'campaign_date'));
  assert.ok(visuals.some(v => v.encodings.x === 'campaign'));
  assert.ok(!visuals.some(v => v.encodings.x === 'clicks' || v.encodings.x === 'impressions'));
});


run('does not misclassify low-range business counts such as conversions as rating dimensions', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ campaign: ['Search', 'Social', 'Email'][i % 3], conversions: i % 5, spend: 20 + i }));
  const { blueprint } = buildDashboardBlueprint(rows, 'conversion-count-role');
  assert.notEqual(blueprint.schemaContext.columns.conversions.semanticRole, 'rating');
  assert.ok(!blueprint.visualManifest.visuals.some(v => (v.type === 'donut' || v.type === 'pie') && v.encodings.x === 'conversions'));
});
