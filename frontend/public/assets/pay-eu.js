/* Wikigai — European pay in euros (official).
   Source: Eurostat, Structure of Earnings Survey 2022, dataset earn_ses22_49
   "Mean annual earnings by sex, occupation and economic activity".
   Filters: sex = Total, indicator = gross earnings (ERN), unit = EUR,
   NACE B–S excl. O (industry, construction and services, excl. public admin),
   enterprises with 10+ employees (GE10 — the only size class every country reports).
   Values = mean gross annual earnings per employee, in euros, by ISCO-08 major group.
   Fetched 2026-10-15 (7 countries) and 2026-10-24 (all EU-27 + NO, CH) from the Eurostat dissemination API.
   Countries with a missing group fall back to the EU-27 figure for that group (marked in the UI). Refresh when SES 2026 is published.

   Each profession maps to its ISCO-08 major group, so the figure is the typical
   pay of that occupation group in the country — not an exact salary for the job. */
window.PAY_EU = {
  source: {
    name: 'Eurostat — Structure of Earnings Survey 2022 (earn_ses22_49)',
    url: 'https://ec.europa.eu/eurostat/cache/metadata/EN/earn_ses2022_esms.htm',
    api: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/earn_ses22_49?sex=T&nace_r2=B-S_X_O&unit=EUR&indic_se=ERN&sizeclas=GE10',
    year: 2022,
    fetched: '2026-10-24',
  },
  // mean gross annual earnings (EUR) — TOTAL and ISCO-08 major groups (OC6 skilled agriculture omitted: not reported in most countries)
  countries: {
    EU: { TOTAL: 39058, OC1: 74626, OC2: 51477, OC3: 43974, OC4: 35388, OC5: 28155, OC7: 31598, OC8: 29469, OC9: 24121 },
    AT: { TOTAL: 52526, OC1: 112755, OC2: 70309, OC3: 58268, OC4: 48160, OC5: 36196, OC7: 44146, OC8: 43748, OC9: 32851 },
    BE: { TOTAL: 53642, OC1: 107936, OC2: 70347, OC3: 57206, OC4: 48973, OC9: 38840 },
    BG: { TOTAL: 12592, OC1: 29382, OC2: 18757, OC3: 14083, OC4: 9451, OC5: 7138, OC7: 9707, OC8: 8841, OC9: 6584 },
    CH: { TOTAL: 95698, OC1: 157756, OC2: 120651, OC3: 99695, OC4: 81682, OC5: 67212, OC7: 77374, OC8: 73686, OC9: 62833 },
    CY: { TOTAL: 30042, OC1: 73564, OC2: 41771, OC3: 33063, OC9: 15989 },
    CZ: { TOTAL: 22285, OC1: 48401, OC2: 31297, OC3: 24243, OC4: 18163, OC5: 15328, OC7: 18902, OC8: 17501, OC9: 12591 },
    DE: { TOTAL: 51042, OC1: 118311, OC2: 73798, OC3: 55742, OC4: 45568, OC5: 35383, OC7: 44245, OC8: 40934, OC9: 30331 },
    DK: { TOTAL: 65622, OC1: 119943, OC2: 76864, OC3: 72722, OC4: 57871, OC5: 45786, OC7: 61190, OC8: 59910, OC9: 47311 },
    EE: { TOTAL: 22763, OC1: 37342, OC2: 29883, OC3: 25418, OC4: 19492, OC5: 14187, OC8: 18345, OC9: 13121 },
    EL: { TOTAL: 24513, OC1: 58807, OC2: 30221, OC3: 27170, OC4: 24048, OC5: 19153, OC7: 23912, OC8: 23208, OC9: 18094 },
    ES: { TOTAL: 31186, OC1: 63626, OC2: 44075, OC3: 35163, OC4: 27214, OC5: 21897, OC7: 26914, OC8: 27901, OC9: 20562 },
    FI: { TOTAL: 49426, OC1: 111005, OC2: 61980, OC3: 49112, OC4: 38643, OC5: 35446, OC7: 45907, OC8: 45612, OC9: 32189 },
    FR: { TOTAL: 40679, OC1: 75695, OC2: 52408, OC3: 39272, OC4: 29339, OC5: 29217, OC7: 30292, OC8: 31224, OC9: 25126 },
    HR: { TOTAL: 16802, OC1: 31781, OC2: 24616, OC3: 18411, OC4: 16208, OC5: 12660, OC7: 13162, OC8: 13998, OC9: 10652 },
    HU: { TOTAL: 16563, OC1: 32519, OC2: 24144, OC3: 17686, OC4: 14467, OC5: 10902, OC7: 14289, OC8: 14305, OC9: 8950 },
    IE: { TOTAL: 53862, OC1: 90521, OC2: 70522, OC3: 59734, OC4: 41067, OC5: 43936, OC8: 44092, OC9: 33613 },
    IT: { TOTAL: 36715, OC1: 129937, OC2: 44773, OC3: 42419, OC4: 34349, OC5: 27782, OC7: 30259, OC8: 31577, OC9: 25128 },
    LT: { TOTAL: 23174, OC1: 38595, OC2: 30515, OC3: 23336, OC4: 19287, OC5: 14780, OC7: 18511, OC9: 12442 },
    LU: { TOTAL: 74542, OC2: 96440, OC3: 76729, OC4: 59079, OC7: 46410, OC9: 38365 },
    LV: { TOTAL: 19486, OC1: 33628, OC2: 27211, OC3: 21241, OC4: 16288, OC5: 11775, OC7: 16165, OC8: 15809, OC9: 10838 },
    MT: { TOTAL: 30710, OC1: 55437, OC7: 25876, OC8: 22339 },
    NL: { TOTAL: 50942, OC1: 96396, OC2: 67760, OC3: 54712, OC4: 43684, OC5: 36772, OC7: 42931, OC8: 43822, OC9: 28828 },
    NO: { TOTAL: 64980, OC1: 98187, OC2: 73485, OC3: 74866, OC4: 55268, OC5: 48307, OC7: 57290, OC9: 46626 },
    PL: { TOTAL: 17388, OC1: 31557, OC2: 20939, OC3: 17387, OC4: 13635, OC5: 11066, OC7: 13650, OC8: 14783, OC9: 10829 },
    PT: { TOTAL: 23112, OC1: 60587, OC2: 36066, OC3: 27633, OC4: 18255, OC5: 15780, OC7: 16292, OC8: 17329, OC9: 14007 },
    RO: { TOTAL: 16592, OC1: 30499, OC2: 25620, OC3: 17168, OC4: 13013, OC5: 10133, OC7: 12661, OC8: 12160, OC9: 9414 },
    SE: { TOTAL: 46956, OC1: 80005, OC2: 53504, OC3: 47781, OC4: 37273, OC5: 39663, OC7: 39684, OC9: 32153 },
    SI: { TOTAL: 30082, OC1: 58023, OC2: 39084, OC3: 32669, OC4: 26748, OC5: 22589, OC7: 25189, OC8: 24842, OC9: 20638 },
    SK: { TOTAL: 19501, OC1: 38121, OC2: 24639, OC3: 20797, OC4: 15870, OC5: 13861, OC7: 16757, OC8: 15853, OC9: 11693 },
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
  /* lowest → highest country (EU-27 + NO, CH) for the profession's occupation group */
  range(career) {
    const g = this.groupOf(career);
    let min = null, max = null, n = 0;
    Object.keys(this.countries).forEach((cc) => {
      if (cc === 'EU') return;
      const v = this.countries[cc][g];
      if (v == null) return;
      n += 1;
      if (!min || v < min.eur) min = { cc, eur: v };
      if (!max || v > max.eur) max = { cc, eur: v };
    });
    return { group: g, min, max, n, eu: this.countries.EU[g] };
  },
  // EUR value for a profession in a country (falls back to the EU average when a country/group is not reported)
  value(career, cc) {
    const g = this.groupOf(career);
    const row = this.countries[cc] || this.countries.EU;
    if (row[g] != null) return { eur: row[g], group: g, cc: this.countries[cc] ? cc : 'EU' };
    return { eur: this.countries.EU[g], group: g, cc: 'EU' };
  },
};
