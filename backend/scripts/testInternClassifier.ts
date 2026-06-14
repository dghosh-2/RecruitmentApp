/**
 * Deterministic unit test for the internship classifier (no network / no DB).
 * Usage: npx tsx scripts/testInternClassifier.ts
 *
 * Covers the "interns go by many names" requirement: intern, co-op, summer
 * analyst/associate, placements, apprenticeships — while NOT misfiring on
 * permanent roles whose titles merely contain intern-like substrings.
 */
import { looksLikeInternship } from '../src/scraping/internship.js';
import { normalizeListings } from '../src/scraping/normalize.js';
import type { RawListing } from '../src/scraping/types.js';

const SHOULD_MATCH = [
  'Software Engineering Intern',
  'Summer 2026 Intern - Data Science',
  'Interns - Product Design',
  'Internship Program',
  'Co-op Software Developer',
  'Coop - Mechanical Engineering',
  'Summer Analyst',
  '2026 Summer Analyst, Investment Banking',
  'Summer Associate (Sales & Trading)',
  'Winter Analyst Program',
  'Spring Week - Markets',
  'Spring Insight Programme',
  'Insight Day: Technology',
  'Industrial Placement - Chemistry',
  'Placement Year Student, Finance',
  'Year in Industry - Software',
  'Apprentice Electrician',
  'Software Apprenticeship',
  'Vacation Scheme 2026',
];

const SHOULD_NOT_MATCH = [
  'Senior Software Engineer',
  'Internal Auditor',
  'International Sales Manager',
  'Cooperative Strategy Lead',
  'Data Analyst',
  'Associate Product Manager',
  'Summer Camp Coordinator',
  'Marketing Manager, Summer Campaigns',
  'Director of Operations',
  'Staff Accountant',
];

let failures = 0;

for (const title of SHOULD_MATCH) {
  if (!looksLikeInternship(title)) {
    console.error(`FAIL (expected internship): "${title}"`);
    failures += 1;
  }
}

for (const title of SHOULD_NOT_MATCH) {
  if (looksLikeInternship(title)) {
    console.error(`FAIL (expected NOT internship): "${title}"`);
    failures += 1;
  }
}

const total = SHOULD_MATCH.length + SHOULD_NOT_MATCH.length;
if (failures === 0) {
  console.log(`PASS: ${total}/${total} internship classification cases`);
} else {
  console.error(`\n${failures}/${total} cases failed`);
  process.exit(1);
}

// Mirror the pipeline's internship-only selection: normalize a mixed batch
// (including an ATS feed that mislabels a "Summer Analyst" as full_time), then
// keep only employmentType === 'internship'.
const mixedRaw: RawListing[] = [
  { title: 'Software Engineer', url: 'https://x.test/1', location: 'NYC', employmentType: 'full_time' },
  { title: 'Software Engineering Intern', url: 'https://x.test/2', location: 'NYC', employmentType: 'unknown' },
  { title: '2026 Summer Analyst', url: 'https://x.test/3', location: 'NYC', employmentType: 'full_time' },
  { title: 'Co-op, Hardware', url: 'https://x.test/4', location: 'Boston', employmentType: null },
  { title: 'Senior Product Manager', url: 'https://x.test/5', location: 'SF', employmentType: 'full_time' },
];

const interns = normalizeListings(mixedRaw, 'https://x.test')
  .filter((l) => l.employmentType === 'internship')
  .map((l) => l.title)
  .sort();

const expectedInterns = ['2026 Summer Analyst', 'Co-op, Hardware', 'Software Engineering Intern'].sort();
const internsOk = JSON.stringify(interns) === JSON.stringify(expectedInterns);

if (internsOk) {
  console.log(`PASS: intern-only filter kept ${interns.length}/5 (incl. mislabeled "Summer Analyst")`);
} else {
  console.error('FAIL: intern-only filter mismatch');
  console.error('  expected:', expectedInterns);
  console.error('  got:     ', interns);
  process.exit(1);
}
