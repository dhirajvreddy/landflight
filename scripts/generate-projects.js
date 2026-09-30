/**
 * LandFlight — Synthetic land-acquisition project generator (SIH26017).
 *
 * Writes data/projects.json (~1,500 records). Zero database.
 * Seeded PRNG so the file is reproducible.
 *
 * Delay is generated from the problem-statement drivers so that:
 *   more disputes  → longer delay
 *   low compensation % → longer delay
 *   more affected families → longer delay
 *
 * Run: node scripts/generate-projects.js
 */

const fs = require('fs');
const path = require('path');

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(26017);
function pick(arr) {
  return arr[Math.floor(random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return min + random() * (max - min);
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
function pad(n, width) {
  return String(n).padStart(width, '0');
}

const STAGES = [
  'SIA',
  'Notification',
  'Hearing',
  'Declaration',
  'Award & Compensation',
  'R&R',
  'Possession',
];

const PROJECT_TYPES = ['Highway', 'Rail', 'Irrigation', 'Solar', 'Industrial Corridor'];

const TYPE_PROFILE = {
  Highway: { plannedMin: 24, plannedMax: 42, baseDelay: 8, bodies: ['NHAI', 'MoRTH', 'State PWD'] },
  Rail: { plannedMin: 30, plannedMax: 48, baseDelay: 10, bodies: ['RVNL', 'IRCON', 'Ministry of Railways'] },
  Irrigation: { plannedMin: 36, plannedMax: 60, baseDelay: 12, bodies: ['State Irrigation Department', 'CWC'] },
  Solar: { plannedMin: 14, plannedMax: 28, baseDelay: 3, bodies: ['SECI', 'State Solar Park', 'NTPC REL'] },
  'Industrial Corridor': {
    plannedMin: 40,
    plannedMax: 72,
    baseDelay: 14,
    bodies: ['NICDC', 'DMICDC', 'State Industrial Development Corp.'],
  },
};

const DELAY_EVENT_REASONS = [
  'Pending approval',
  'Compensation hold',
  'Litigation',
  'Missing documents',
];

const STATES = [
  {
    name: 'Maharashtra',
    code: 'MH',
    districts: ['Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Solapur', 'Thane'],
  },
  {
    name: 'Uttar Pradesh',
    code: 'UP',
    districts: ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj', 'Ghaziabad'],
  },
  {
    name: 'Gujarat',
    code: 'GJ',
    districts: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bharuch', 'Kutch'],
  },
  {
    name: 'Karnataka',
    code: 'KA',
    districts: ['Bengaluru Rural', 'Mysuru', 'Belagavi', 'Tumakuru', 'Ballari', 'Dharwad'],
  },
  {
    name: 'Rajasthan',
    code: 'RJ',
    districts: ['Jaipur', 'Jodhpur', 'Kota', 'Ajmer', 'Udaipur', 'Bikaner'],
  },
  {
    name: 'Tamil Nadu',
    code: 'TN',
    districts: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli'],
  },
  {
    name: 'Telangana',
    code: 'TG',
    districts: ['Hyderabad', 'Rangareddy', 'Medchal', 'Warangal', 'Nizamabad', 'Karimnagar'],
  },
  {
    name: 'Madhya Pradesh',
    code: 'MP',
    districts: ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Rewa', 'Sagar'],
  },
  {
    name: 'Odisha',
    code: 'OD',
    districts: ['Khordha', 'Cuttack', 'Sundargarh', 'Ganjam', 'Angul', 'Keonjhar'],
  },
  {
    name: 'West Bengal',
    code: 'WB',
    districts: ['Howrah', 'Hooghly', 'Paschim Bardhaman', 'Purba Medinipur', 'Nadia', 'Jalpaiguri'],
  },
  {
    name: 'Andhra Pradesh',
    code: 'AP',
    districts: ['Visakhapatnam', 'Guntur', 'Krishna', 'East Godavari', 'Chittoor', 'Anantapur'],
  },
  {
    name: 'Punjab',
    code: 'PB',
    districts: ['Ludhiana', 'Amritsar', 'Patiala', 'Jalandhar', 'Bathinda', 'Mohali'],
  },
];

const PROJECT_NAME_PREFIX = {
  Highway: ['NH Expansion', 'Bypass Corridor', 'Expressway Link', 'Ring Road'],
  Rail: ['Dedicated Freight', 'Doubling Project', 'New BG Line', 'Station Access'],
  Irrigation: ['Canal Modernisation', 'Lift Irrigation', 'Reservoir Command', 'Distributary'],
  Solar: ['Solar Park', 'Ultra Mega Solar', 'Hybrid Park', 'Floating Solar'],
  'Industrial Corridor': ['Node Development', 'Logistics Hub', 'Industrial Park', 'Multimodal Hub'],
};

function isoDate(d) {
  return d.toISOString().split('T')[0];
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function weightedDisputes() {
  const r = random();
  if (r < 0.38) return 0;
  if (r < 0.62) return 1;
  if (r < 0.78) return 2;
  if (r < 0.90) return 3;
  if (r < 0.97) return 4;
  return randInt(5, 8);
}

function computeDelayMonths({
  projectType,
  legalDisputes,
  compensationPct,
  affectedFamilies,
  approvalGaps,
  rrProgressPct,
  stakeholderScore,
  districtPerformance,
}) {
  const typeBase = TYPE_PROFILE[projectType].baseDelay;

  const disputePenalty = legalDisputes * 5.8;
  const compensationPenalty = ((100 - compensationPct) / 100) * 16;
  const familyPenalty = Math.min(18, affectedFamilies / 55);
  const approvalPenalty = approvalGaps * 2.4;
  const rrLagPenalty = ((100 - rrProgressPct) / 100) * 5;
  const stakeholderPenalty = ((100 - stakeholderScore) / 100) * 3.5;
  const districtPenalty = ((100 - districtPerformance) / 100) * 4;

  const raw =
    typeBase +
    disputePenalty +
    compensationPenalty +
    familyPenalty +
    approvalPenalty +
    rrLagPenalty +
    stakeholderPenalty +
    districtPenalty;

  const noise = randFloat(-1.4, 1.4);
  return round1(clamp(raw + noise, 0.5, 72));
}

function makeDelayEvents(count, startDate, currentStageIdx) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const progress = count === 1 ? 0.4 : i / (count - 1);
    const monthsAlong = Math.round(progress * Math.max(3, currentStageIdx * 4 + 2));
    const stageIdx = Math.min(currentStageIdx, Math.floor(progress * (currentStageIdx + 1)));
    events.push({
      date: isoDate(addMonths(startDate, Math.max(1, monthsAlong))),
      reason: pick(DELAY_EVENT_REASONS),
      stage_at_time: STAGES[stageIdx],
    });
  }
  return events;
}

const TARGET = 1500;
const projects = [];
const usedIds = new Set();
let seq = 1;

for (let i = 0; i < TARGET; i++) {
  const projectType = pick(PROJECT_TYPES);
  const profile = TYPE_PROFILE[projectType];
  const state = pick(STATES);
  const district = pick(state.districts);

  const year = randInt(2018, 2025);
  let id = `LA-${state.code}-${year}-${pad(seq, 4)}`;
  while (usedIds.has(id)) {
    seq += 1;
    id = `LA-${state.code}-${year}-${pad(seq, 4)}`;
  }
  usedIds.add(id);
  seq += 1;

  const landAreaHa = round1(randFloat(8, 420));
  const familiesPerHa = randFloat(0.6, 3.4);
  const affectedFamilies = Math.max(4, Math.round(landAreaHa * familiesPerHa));

  const legalDisputes = weightedDisputes();

  // Compensation tends to stall when disputes are high.
  let compensationPct = randInt(18, 98);
  if (legalDisputes >= 3) compensationPct = randInt(12, 55);
  else if (legalDisputes === 0) compensationPct = randInt(55, 98);

  const approvalGaps = clamp(randInt(0, 3) + Math.floor(legalDisputes / 2), 0, 8);

  const isCompleted = random() < 0.42;
  let currentStageIdx;
  if (isCompleted) {
    currentStageIdx = STAGES.length - 1;
  } else {
    currentStageIdx = randInt(0, STAGES.length - 2);
  }
  const currentStage = STAGES[currentStageIdx];

  const stageFrac = currentStageIdx / (STAGES.length - 1);
  const possessionPct = isCompleted
    ? 100
    : clamp(Math.round(stageFrac * 70 + randInt(-8, 12)), 0, 92);
  const rrProgressPct = isCompleted
    ? clamp(randInt(82, 100), 0, 100)
    : clamp(Math.round(stageFrac * 75 + randInt(-10, 10) - legalDisputes * 4), 2, 95);

  const districtPerformance = randInt(38, 92);
  const stakeholderScore = clamp(
    randInt(35, 95) - legalDisputes * 4 + Math.round(compensationPct / 20),
    15,
    98
  );

  const plannedDurationMonths = randInt(profile.plannedMin, profile.plannedMax);
  const delayMonths = computeDelayMonths({
    projectType,
    legalDisputes,
    compensationPct,
    affectedFamilies,
    approvalGaps,
    rrProgressPct,
    stakeholderScore,
    districtPerformance,
  });

  const startMonth = randInt(0, 11);
  const startDay = randInt(1, 28);
  const startDate = new Date(Date.UTC(year, startMonth, startDay));

  let possessionDate = null;
  let actualDurationMonths;
  let daysElapsed;
  const refDate = new Date(Date.UTC(2026, 8, 30));

  if (isCompleted) {
    actualDurationMonths = round1(plannedDurationMonths + delayMonths);
    possessionDate = isoDate(addMonths(startDate, Math.round(actualDurationMonths)));
    daysElapsed = Math.round(actualDurationMonths * 30.44);
  } else {
    const elapsedFrac = Math.max(0.12, stageFrac * 0.85 + randFloat(0, 0.12));
    actualDurationMonths = round1(plannedDurationMonths * elapsedFrac);
    daysElapsed = Math.max(
      30,
      Math.round((refDate - startDate) / (24 * 3600 * 1000))
    );
    if (daysElapsed > plannedDurationMonths * 30.44 * 1.8) {
      daysElapsed = Math.round(plannedDurationMonths * 30.44 * elapsedFrac);
    }
  }

  const eventCount = clamp(
    Math.round(legalDisputes + approvalGaps * 0.6 + (compensationPct < 40 ? 2 : 0)),
    0,
    12
  );

  const namePrefix = pick(PROJECT_NAME_PREFIX[projectType]);
  const projectName = `${namePrefix} — ${district}`;

  projects.push({
    id,
    project_name: projectName,
    project_type: projectType,
    requiring_body: pick(profile.bodies),
    state: state.name,
    state_code: state.code,
    district,
    land_area_ha: landAreaHa,
    affected_families: affectedFamilies,
    compensation_disbursed_pct: compensationPct,
    approval_timeline_gaps: approvalGaps,
    legal_disputes: legalDisputes,
    possession_pct: possessionPct,
    rr_progress_pct: rrProgressPct,
    stakeholder_responsiveness: stakeholderScore,
    district_performance: districtPerformance,
    current_stage: currentStage,
    planned_duration_months: plannedDurationMonths,
    actual_duration_months: actualDurationMonths,
    delay_months: delayMonths,
    start_date: isoDate(startDate),
    possession_date: possessionDate,
    days_elapsed: daysElapsed,
    delay_events: makeDelayEvents(eventCount, startDate, currentStageIdx),
  });
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function delayOf(subset) {
  return mean(subset.map((p) => p.delay_months));
}

const zeroDisputes = projects.filter((p) => p.legal_disputes === 0);
const threePlusDisputes = projects.filter((p) => p.legal_disputes >= 3);
const lowComp = projects.filter((p) => p.compensation_disbursed_pct < 40);
const highComp = projects.filter((p) => p.compensation_disbursed_pct > 80);

const avgZero = delayOf(zeroDisputes);
const avgThreePlus = delayOf(threePlusDisputes);
const avgLowComp = delayOf(lowComp);
const avgHighComp = delayOf(highComp);

console.log(`Generated ${projects.length} projects`);
console.log(
  `Completed (possession date set): ${projects.filter((p) => p.possession_date).length}`
);
console.log(
  `Ongoing: ${projects.filter((p) => !p.possession_date).length}`
);
console.log('');
console.log('SANITY CHECK — average delay_months');
console.log('─'.repeat(62));
console.log(
  `  (a) 0 disputes     n=${zeroDisputes.length}  avg=${avgZero.toFixed(1)} mo`
);
console.log(
  `      3+ disputes    n=${threePlusDisputes.length}  avg=${avgThreePlus.toFixed(1)} mo`
);
console.log(
  `  (b) compensation <40%  n=${lowComp.length}  avg=${avgLowComp.toFixed(1)} mo`
);
console.log(
  `      compensation >80%  n=${highComp.length}  avg=${avgHighComp.toFixed(1)} mo`
);
console.log('  (c) by project type:');
for (const type of PROJECT_TYPES) {
  const ofType = projects.filter((p) => p.project_type === type);
  console.log(
    `      ${type.padEnd(22)} n=${String(ofType.length).padStart(4)}  avg=${delayOf(ofType).toFixed(1)} mo`
  );
}
console.log('');

const failures = [];
if (zeroDisputes.length < 50 || threePlusDisputes.length < 50) {
  failures.push('Not enough samples in dispute buckets');
}
if (lowComp.length < 40 || highComp.length < 40) {
  failures.push('Not enough samples in compensation buckets');
}
if (!(avgThreePlus > avgZero + 8)) {
  failures.push(
    `Disputes must raise delay by >8 mo (got ${avgThreePlus.toFixed(1)} vs ${avgZero.toFixed(1)})`
  );
}
if (!(avgLowComp > avgHighComp + 6)) {
  failures.push(
    `Low compensation must raise delay by >6 mo (got ${avgLowComp.toFixed(1)} vs ${avgHighComp.toFixed(1)})`
  );
}

if (failures.length) {
  console.error('SANITY CHECK FAILED:');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

console.log('SANITY CHECK PASSED: delay rises with disputes and with low compensation.');

const outputDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'projects.json');
fs.writeFileSync(outputPath, JSON.stringify(projects, null, 2));
console.log(`\nWritten ${projects.length} projects to ${outputPath}`);
