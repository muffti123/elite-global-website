/*
  =====================================================================
   SITE SETTINGS — the ONLY place you need to edit. Used by every page.
   Leave a value as '' (empty) and that part of the page hides itself.
   Values come from the client and from the "System Info" tab of the
   Central Lead Tracker. See README.md for the step-by-step guide.
  =====================================================================
*/
window.SITE_CONFIG = {
  company: {
    name: 'Elite Global World Travel & Tours Ltd.',
    rc: '7787410',
    address: '',        // e.g. '12 Example Street, Ikeja, Lagos, Nigeria'
    phone: '',          // as displayed, e.g. '+234 803 000 0000'
    whatsapp: '',       // digits only with country code, e.g. '2348030000000'
    email: ''           // e.g. 'info@eliteglobaltravels.com'
  },

  // Public RESPONDENT links (end in /viewform) — never the /edit links
  forms: {
    visaOnlyUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeSxTcKMLAguBCEBbIJRlmUvoLHqKTm_6UtMrxA0mUawB61oQ/viewform',        // Form 1 — Request Umrah Visa Only
    customUmrahUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSf6By61NsbF6fR2sNb6bS8tl0frlsc_PMsXfqs4eIb2rClkQQ/viewform'      // Form 2 — Customize My Umrah Experience
  },

  // Apps Script web app that receives every website form (Deploy → Manage deployments → Web app URL).
  // Must end in /exec. Staging vs production: see docs/ENVIRONMENTS.md.
  webAppUrl: 'https://script.google.com/macros/s/AKfycbzSBOiav81YF7eKJvqLaXJM1p2S6oRXeKVVhsGKgCtMfkdKZUrXr7cC0UQ-bRZ6kjtqXQ/exec',

  // Management team — section stays hidden until at least one person is added.
  // photo: put the image in the assets/team/ folder, e.g. 'assets/team/ceo.jpg' (square, 600x600+)
  team: [
    // { name: 'Full Name', role: 'Managing Director / CEO', bio: 'Short professional profile.', photo: 'assets/team/ceo.jpg' },
  ]
};
