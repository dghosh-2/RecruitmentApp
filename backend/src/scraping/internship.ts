/**
 * Single source of truth for "is this title an internship?".
 *
 * Internships hide behind many names: classic "Intern"/"Co-op", finance
 * "Summer Analyst"/"Summer Associate", UK "Industrial Placement"/"Vacation
 * Scheme", and "Apprenticeship" programs. This matcher is intentionally precise
 * (high precision over recall) so the internship-only scrape never surfaces
 * permanent roles — false positives are worse than a missed edge case here.
 *
 * Used by both the ATS adapters (structured JSON titles) and the AI extractor
 * path (normalize.ts), so the two extraction routes classify identically.
 */
const INTERNSHIP_PATTERNS: RegExp[] = [
  /\bintern(ship)?s?\b/i,
  /\bco[\s-]?ops?\b/i,
  // Finance/consulting season-prefixed early-career titles.
  /\b(summer|fall|autumn|winter|spring)\s+(analyst|associate|intern|interns|internship|scholar|fellow|fellowship|trainee|placement|programme|program)\b/i,
  // Insight / spring-week pipelines (banking, law).
  /\b(spring|summer|winter)\s+(insight|week)\b/i,
  /\binsight\s+(programme|program|day|week)\b/i,
  // UK / EU placement years.
  /\bindustrial\s+placement\b/i,
  /\bplacement\s+(student|year|programme|program)\b/i,
  /\byear\s+in\s+industry\b/i,
  // Apprenticeships and vacation schemes.
  /\bapprentice(ship)?s?\b/i,
  /\bvacation\s+(scheme|schemes|programme|program)\b/i,
];

export function looksLikeInternship(text: string | null | undefined): boolean {
  if (!text) return false;
  return INTERNSHIP_PATTERNS.some((re) => re.test(text));
}
