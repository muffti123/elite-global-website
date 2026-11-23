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
    address: 'No. 335, Suite 3, Opposite Fidelity Bank, Zoo Road, Kano, Nigeria',
    phone: '+234 706 215 2046',
    whatsapp: '2347062152046',
    email: 'info@elitetravelng.com',
    instagram: 'https://www.instagram.com/elite_global_travels/'
  },

  // Apps Script web app that receives every website form (Deploy → Manage deployments → Web app URL).
  // Must end in /exec. Staging vs production: see docs/ENVIRONMENTS.md.
  webAppUrl: 'https://script.google.com/macros/s/AKfycbzSBOiav81YF7eKJvqLaXJM1p2S6oRXeKVVhsGKgCtMfkdKZUrXr7cC0UQ-bRZ6kjtqXQ/exec',

  // Management team — section stays hidden until at least one person is added.
  // photo: put the image in the assets/team/ folder, e.g. 'assets/team/ceo.jpg' (portrait 4:5, 800x1000+)
  team: [
    { name: 'Alh. Hamza Baba Yakubu', role: 'Chief Executive Officer (CEO)', bio: 'Professional travel consultant leading Elite Global World Travel & Tours Ltd.', photo: 'assets/team/01-hamza-baba-yakubu.jpg' },
    { name: 'Mustapha Adinoyi, MBA', role: 'Director, Strategy and Operations', bio: 'Product manager with an MBA, overseeing strategy and day-to-day operations so every client journey is well planned and smoothly delivered.', photo: 'assets/team/02-mustapha-adinoyi.jpg' },
    { name: 'Abdulmumin Sani', role: 'Operations Lead', bio: 'Travel manager and AI-native software engineer who builds the digital systems behind Elite Global and keeps every booking on track.', photo: 'assets/team/03-abdulmumin-sani.jpg' },
    { name: 'Abdulrahman Musa Maishanu', role: 'Operations Lead', bio: 'Travel consultant dedicated to giving every pilgrim clear guidance and a well-organised journey.', photo: 'assets/team/04-abdulrahman-musa-maishanu.jpg' },
  ]
};
