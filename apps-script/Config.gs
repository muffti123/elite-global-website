/**
 * Elite Global lead system — configuration shared by every file.
 * LISTS and COUNTRIES must match public/assets/js/lists.js exactly (run: node tools/check-lists.js).
 */

const CONFIG = {
  // Expected owner account is per environment: Script Properties key OWNER_EMAIL
  // (set it with setOwnerEmail). See docs/ENVIRONMENTS.md.
  COMPANY: 'Elite Global World Travel & Tours Ltd.',
  FOLDER_NAME: 'Elite Global – Lead Generation System', // root Drive folder (name kept for existing installs)

  // Lead types: tracker category + Lead ID prefix (EG-VO-00001 …)
  FORMS: {
    VISA: { category: 'Visa Only', idPrefix: 'VO' },
    CUSTOM: { category: 'Customised Experience', idPrefix: 'CE' },
    CONTACT: { category: 'General Enquiry', idPrefix: 'GE' },
  },

  TRACKER_NAME: 'Elite Global – Central Lead Tracker',
  TRACKER_TAB: 'Lead Tracker',
  INFO_TAB: 'System Info',
  TRACKER_ROWS: 2000, // pre-formatted rows; grows automatically when full
  VISA_FOLDER_NAME: 'Visa Applications',

  HEADERS: [
    'Lead ID', 'Date Received', 'Customer Name', 'Phone Number', 'Lead Category',
    'Adults', 'Children', 'Infants', 'Total Travellers', 'Travel Date',
    'Budget', 'Lead Status', 'Assigned Agent', 'Follow-up Notes', 'Drive Folder',
    // v3 (round 1): appended after Drive Folder so existing rows never move.
    'Email', 'Country', 'Departure', 'Passengers', 'Lead Source', 'Application Status',
  ],
  // Columns 1–15 keep their fixed positions; the v3 columns are found by header name.
  NOTES_COL: 14,      // Follow-up Notes: staff only (the web app no longer writes here)
  FOLDER_COL: 15,
  V3_COLS: {
    'Email': { width: 210, format: '@' },
    'Country': { width: 140 },
    'Departure': { width: 260 },
    'Passengers': { width: 95, format: '0', align: 'center' },
    'Lead Source': { width: 120 },
    'Application Status': { width: 190, auto: true },
  },
  // Application Status values written by the web app
  STATUS: {
    RECEIVED: 'Received',
    EXPIRED: 'Expired',
    uploading: function (done, total) { return 'Uploading ' + done + '/' + total; },
    complete: function (n) { return 'Complete: ' + n + (n === 1 ? ' passenger' : ' passengers'); },
  },

  // Detail tabs in the Central Lead Tracker (one row per lead / passenger)
  TABS: {
    // One row per visa application, one column per answer
    VISA: {
      name: 'Visa Applications',
      headers: ['Lead ID', 'Date Received', 'Full Name', 'Phone / WhatsApp', 'Email', 'Country',
        'Travel Date', 'Departure Airport', 'Confirmed Flight Ticket', 'Travelled to Saudi Arabia Before',
        'UK/US/Schengen Visa', 'Passengers', 'Adults', 'Children', 'Infants', 'Shared Flight Ticket',
        'Shared Hotel Booking', 'Additional Information', 'How They Heard', 'Drive Folder'],
      widths: [120, 140, 190, 150, 210, 130, 110, 260, 110, 130, 110, 90, 70, 75, 70, 150, 150, 320, 120, 150],
      textCols: [4],
      dateCols: [2, 7],
      folderCol: 20,
    },
    PASSENGERS: {
      name: 'Visa Passengers',
      headers: ['Lead ID', 'No.', 'Full Name (as on passport)', 'Category', 'Photo (KB)',
        'Passport File', 'Photo File', 'Uploaded At'],
      widths: [120, 50, 240, 140, 90, 140, 140, 150],
      textCols: [],
      dateCols: [8],
    },
    CUSTOM: {
      name: 'Custom Requests',
      headers: ['Lead ID', 'Date Received', 'Full Name', 'Phone / WhatsApp', 'Email', 'Country',
        'Adults', 'Children', 'Infants', 'Departure Airport', 'Travel Date', 'Confirmed Flight Ticket',
        'Arrival City', 'Nights in Madinah', 'Nights in Makkah', 'Hotel Category',
        'Distance from Haram', 'Preferred Hotel', 'Services Required', 'Visa Assistance',
        'Budget per Person', 'Travel Experience', 'Preferred Hotel or Airline',
        'Special Requests', 'How They Heard'],
      widths: [120, 140, 190, 150, 200, 130, 70, 75, 70, 130, 110, 110, 120, 90, 90, 130, 150,
        160, 320, 140, 190, 170, 170, 320, 120],
      textCols: [4],
      dateCols: [2, 11],
    },
    CONTACT: {
      name: 'Contact Enquiries',
      headers: ['Lead ID', 'Date Received', 'Full Name', 'Phone / WhatsApp', 'Enquiry Type',
        'Preferred Travel Date', 'Number of Travellers', 'Additional Details'],
      widths: [120, 140, 190, 150, 210, 130, 110, 420],
      textCols: [4],
      dateCols: [2, 6],
    },
  },

  // Web app limits (bytes unless stated). Client limits in public/assets/js are the same.
  LIMITS: {
    MAX_PASSENGERS: 50,
    PDF_MAX: 5 * 1024 * 1024,
    PASSPORT_IMG_MAX: Math.round(1.6 * 1024 * 1024),
    PHOTO_MIN: 24 * 1024,    // 25 KB on the website, 1 KB slack for rounding
    PHOTO_MAX: 51 * 1024,    // 50 KB on the website, 1 KB slack
    BODY_MAX: 12 * 1024 * 1024,
    RATE_MAX: 10,            // create/submit calls …
    RATE_WINDOW_S: 600,      // … per 10 minutes, per email (contact form: per phone)
    UPLOAD_TTL_MS: 24 * 60 * 60 * 1000,
    NAME_MAX: 100,
    TEXT_MAX: 2000,
  },
  LEAD_CATEGORIES: ['Visa Only', 'Customised Experience', 'General Enquiry'],
  LEAD_STATUSES: [
    'New Lead', 'Contacted', 'Awaiting Response', 'Quotation Sent',
    'Payment Pending', 'Converted', 'Lost',
  ],

  NAVY: '#071b50',
  GOLD: '#f5ae00',
};

// Question title used to find test rows in the retired Google Forms (cleanupTestData).
const Q = {
  NAME: 'Full Name',
};

const LISTS = {
  HEARD: ['Website', 'Instagram', 'Facebook', 'WhatsApp', 'Referral', 'Travel Agent', 'Other'],
  YES_NO: ['Yes', 'No'],
  ARRIVAL: ['Madinah', 'Jeddah', 'No preference'],
  HOTEL_CAT: ['3-star', '4-star', '5-star', 'Luxury / Premium', 'No preference'],
  HARAM_DIST: ['Walking distance', 'Close / short walk', 'Shuttle service', 'No preference'],
  SERVICES: [
    'Umrah Visa Processing', 'International Flight Ticket', 'Hotel Accommodation in Makkah',
    'Hotel Accommodation in Madinah', 'Airport Transfers', 'Makkah–Madinah Transportation',
    'Ziyarah / Religious Tours', 'Complete Umrah Package',
  ], // "Other" is added via showOtherOption so respondents can type it
  VISA_ASSIST: ['Yes', 'No', 'I already have my visa'],
  BUDGET: [
    'Below ₦1,000,000',
    '₦1,000,000 – ₦2,000,000',
    '₦2,000,000 – ₦3,000,000',
    '₦3,000,000 – ₦5,000,000',
    'Above ₦5,000,000',
    'I need guidance on the budget',
  ],
  EXPERIENCE: ['Economy / Budget-friendly', 'Standard / Comfortable', 'Premium', 'Luxury', 'No preference'],
  // Must match the <select> options on the website exactly
  ENQUIRY_TYPES: [
    'Request Umrah Visa Only', 'Customize My Umrah Experience', 'Hotel Accommodation',
    'Ground Transportation', 'Other Travel Enquiry',
  ],
  // Visa application passenger cards. Order matters: index 0 = adult, 1 = child, 2 = infant.
  PASSENGER_CATEGORIES: ['Adult (18+)', 'Child (2–17)', 'Infant (under 2)'],
  // Departure airports for Nigeria (approved by the operator, in this order). Other countries: Airports.gs.
  // [IATA, airport, city]. The website sends the IATA code, or "OTHER" + typed text.
  AIRPORTS_NG: [
    ['LOS', 'Murtala Muhammed International Airport', 'Lagos'],
    ['ABV', 'Nnamdi Azikiwe International Airport', 'Abuja'],
    ['KAN', 'Mallam Aminu Kano International Airport', 'Kano'],
    ['DKA', "Umaru Musa Yar'Adua International Airport", 'Katsina'],
    ['PHC', 'Port Harcourt International Airport', 'Port Harcourt'],
    ['ENU', 'Akanu Ibiam International Airport', 'Enugu'],
    ['SKO', 'Sadiq Abubakar III International Airport', 'Sokoto'],
    ['KAD', 'Kaduna International Airport', 'Kaduna'],
    ['MIU', 'Maiduguri International Airport', 'Maiduguri'],
    ['YOL', 'Yola Airport', 'Yola'],
    ['ILR', 'General Tunde Idiagbon International Airport', 'Ilorin'],
    ['BCU', 'Sir Abubakar Tafawa Balewa International Airport', 'Bauchi'],
    ['ABB', 'Asaba International Airport', 'Asaba'],
    ['CBQ', 'Margaret Ekpo International Airport', 'Calabar'],
    ['QUO', 'Akwa Ibom International Airport', 'Uyo'],
    ['QOW', 'Sam Mbakwe International Cargo Airport', 'Owerri'],
    ['GMO', 'Gombe Lawanti International Airport', 'Gombe'],
  ],
};

// Nigeria first (main market), then all other countries A–Z, then Other.
const COUNTRIES = ['Nigeria'].concat((
  'Afghanistan|Albania|Algeria|Andorra|Angola|Antigua and Barbuda|Argentina|Armenia|Australia|Austria|' +
  'Azerbaijan|Bahamas|Bahrain|Bangladesh|Barbados|Belarus|Belgium|Belize|Benin|Bhutan|Bolivia|' +
  'Bosnia and Herzegovina|Botswana|Brazil|Brunei|Bulgaria|Burkina Faso|Burundi|Cabo Verde|Cambodia|' +
  'Cameroon|Canada|Central African Republic|Chad|Chile|China|Colombia|Comoros|Congo (Republic)|' +
  'Congo (Democratic Republic)|Costa Rica|Côte d\'Ivoire|Croatia|Cuba|Cyprus|Czech Republic|Denmark|' +
  'Djibouti|Dominica|Dominican Republic|Ecuador|Egypt|El Salvador|Equatorial Guinea|Eritrea|Estonia|' +
  'Eswatini|Ethiopia|Fiji|Finland|France|Gabon|Gambia|Georgia|Germany|Ghana|Greece|Grenada|Guatemala|' +
  'Guinea|Guinea-Bissau|Guyana|Haiti|Honduras|Hungary|Iceland|India|Indonesia|Iran|Iraq|Ireland|' +
  'Israel|Italy|Jamaica|Japan|Jordan|Kazakhstan|Kenya|Kiribati|Kosovo|Kuwait|Kyrgyzstan|Laos|Latvia|' +
  'Lebanon|Lesotho|Liberia|Libya|Liechtenstein|Lithuania|Luxembourg|Madagascar|Malawi|Malaysia|' +
  'Maldives|Mali|Malta|Marshall Islands|Mauritania|Mauritius|Mexico|Micronesia|Moldova|Monaco|' +
  'Mongolia|Montenegro|Morocco|Mozambique|Myanmar|Namibia|Nauru|Nepal|Netherlands|New Zealand|' +
  'Nicaragua|Niger|North Korea|North Macedonia|Norway|Oman|Pakistan|Palau|Palestine|Panama|' +
  'Papua New Guinea|Paraguay|Peru|Philippines|Poland|Portugal|Qatar|Romania|Russia|Rwanda|' +
  'Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Samoa|San Marino|' +
  'São Tomé and Príncipe|Saudi Arabia|Senegal|Serbia|Seychelles|Sierra Leone|Singapore|Slovakia|' +
  'Slovenia|Solomon Islands|Somalia|South Africa|South Korea|South Sudan|Spain|Sri Lanka|Sudan|' +
  'Suriname|Sweden|Switzerland|Syria|Taiwan|Tajikistan|Tanzania|Thailand|Timor-Leste|Togo|Tonga|' +
  'Trinidad and Tobago|Tunisia|Turkey|Turkmenistan|Tuvalu|Uganda|Ukraine|United Arab Emirates|' +
  'United Kingdom|United States|Uruguay|Uzbekistan|Vanuatu|Vatican City|Venezuela|Vietnam|Yemen|' +
  'Zambia|Zimbabwe'
).split('|')).concat(['Other']);

const TEXT = {
  FORM_MOVED: 'This form has moved. Please apply on our website.',
};
