/* Wikigai — European pay in euros (official).
   Source: Eurostat, Structure of Earnings Survey 2022, dataset earn_ses22_49
   "Mean annual earnings by sex, occupation and economic activity".
   Filters: sex = Total, indicator = gross earnings (ERN), unit = EUR,
   NACE B–S excl. O (industry, construction and services, excl. public admin),
   enterprises with 10+ employees (GE10 — the only size class every country reports).
   Values = mean gross annual earnings per employee, in euros, by ISCO-08 major group.
   Fetched 2026-10-15 from the Eurostat dissemination API. Refresh when SES 2026 is published.

   Each profession maps to its ISCO-08 major group, so the figure is the typical
   pay of that occupation group in the country — not an exact salary for the job. */
window.PAY_EU = {
  source: {
    name: 'Eurostat — Structure of Earnings Survey 2022 (earn_ses22_49)',
    url: 'https://ec.europa.eu/eurostat/cache/metadata/EN/earn_ses2022_esms.htm',
    api: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/earn_ses22_49?sex=T&nace_r2=B-S_X_O&unit=EUR&indic_se=ERN&sizeclas=GE10',
    year: 2022,
    fetched: '2026-10-15',
  },
  // mean gross annual earnings (EUR) — TOTAL and ISCO-08 major groups (OC6 skilled agriculture omitted: not reported in most countries)
  countries: {
    EU: { TOTAL: 39058, OC1: 74626, OC2: 51477, OC3: 43974, OC4: 35388, OC5: 28155, OC7: 31598, OC8: 29469, OC9: 24121 },
    ES: { TOTAL: 31186, OC1: 63626, OC2: 44075, OC3: 35163, OC4: 27214, OC5: 21897, OC7: 26914, OC8: 27901, OC9: 20562 },
    FR: { TOTAL: 40679, OC1: 75695, OC2: 52408, OC3: 39272, OC4: 29339, OC5: 29217, OC7: 30292, OC8: 31224, OC9: 25126 },
    DE: { TOTAL: 51042, OC1: 118311, OC2: 73798, OC3: 55742, OC4: 45568, OC5: 35383, OC7: 44245, OC8: 40934, OC9: 30331 },
    IT: { TOTAL: 36715, OC1: 129937, OC2: 44773, OC3: 42419, OC4: 34349, OC5: 27782, OC7: 30259, OC8: 31577, OC9: 25128 },
    PT: { TOTAL: 23112, OC1: 60587, OC2: 36066, OC3: 27633, OC4: 18255, OC5: 15780, OC7: 16292, OC8: 17329, OC9: 14007 },
    NL: { TOTAL: 50942, OC1: 96396, OC2: 67760, OC3: 54712, OC4: 43684, OC5: 36772, OC7: 42931, OC8: 43822, OC9: 28828 },
    IE: { TOTAL: 53862, OC1: 90521, OC2: 70522, OC3: 59734, OC4: 41067, OC5: 43936, OC8: 44092, OC9: 33613 },
  },
  // profession → ISCO-08 major group. Anything not listed is OC2 (Professionals).
  isco: {
    'Marketing Manager': 'OC1', 'Operations Manager': 'OC1', 'Logistics Manager': 'OC1', 'Procurement Manager': 'OC1',
    'Brand Manager': 'OC1', 'Construction Project Manager': 'OC1', 'Headteacher': 'OC1', 'Charity CEO': 'OC1',
    'NGO Programme Manager': 'OC1', 'Learning & Development Lead': 'OC1', 'Startup Founder': 'OC1',
    'Venture Builder': 'OC1', 'Social Entrepreneur': 'OC1',
    'Paramedic': 'OC3', 'Radiographer': 'OC3', 'Paralegal': 'OC3', 'Veterinary Nurse': 'OC3',
    'Architectural Technologist': 'OC3', 'Aquaculture Officer': 'OC3', 'Park Ranger': 'OC3', 'Police Detective': 'OC3',
    'Family Support Worker': 'OC3', 'Community Organiser': 'OC3', 'Site Manager': 'OC3', 'Building Surveyor': 'OC3',
    'Interior Designer': 'OC3', 'Lighting Designer': 'OC3',
    'Prison Officer': 'OC5',
  },
  groupOf(career) { return this.isco[career] || 'OC2'; },
  // EUR value for a profession in a country (falls back to the EU average when a country/group is not reported)
  value(career, cc) {
    const g = this.groupOf(career);
    const row = this.countries[cc] || this.countries.EU;
    if (row[g] != null) return { eur: row[g], group: g, cc: this.countries[cc] ? cc : 'EU' };
    return { eur: this.countries.EU[g], group: g, cc: 'EU' };
  },
};
