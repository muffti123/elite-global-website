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
    // v4 (round 2): written by staff, shown to the customer on track.html
    'Message to Customer',
    // v5 (round 2.2): visa review workflow — staff set Review Status, the web app stamps the rest
    'Review Status', 'Review Updated', 'Last Customer Email',
    // v6 (round 2.3): staff choose what the customer should correct (highlighted on the correction page)
    'Correction For',
    // v7 (round 2.4): number of valid files in the lead's "Approved Visa" folder (web app)
    'Visa Files',
    // v8 (round 2.4): staff tick it to recount + send the current status email at once (onTrackerEdit)
    'Send Now',
    // v9 (round 2.5): when the row last changed (archive age) and which emails this lead already got
    'Last Change', 'Emails Sent',
  ],
  // Columns 1–15 keep their fixed positions; columns added later are found by header name.
  NOTES_COL: 14,      // Follow-up Notes: staff only (the web app no longer writes here)
  FOLDER_COL: 15,
  EXTRA_COLS: {
    'Email': { width: 210, format: '@' },
    'Country': { width: 140 },
    'Departure': { width: 260 },
    'Passengers': { width: 95, format: '0', align: 'center' },
    'Lead Source': { width: 120 },
    'Application Status': { width: 190, auto: true },
    'Message to Customer': { width: 320, wrap: true, max: 300,
      note: 'Visible to the customer on the Track page — keep it short and professional' },
    'Review Status': { width: 180, list: 'REVIEW_STATUSES',
      note: 'Visa applications: the customer is emailed once the status has stayed the same for 5 minutes ' +
        '(change it back within 5 minutes to cancel). Correction Needed is only sent once Message to Customer is filled in.' },
    'Review Updated': { width: 150, auto: true, format: 'dd mmm yyyy, hh:mm' },
    'Last Customer Email': { width: 250, auto: true, wrap: true },
    'Correction For': { width: 170, list: 'CORRECTION_FOR', help: 'Choose what the customer should correct.',
      note: 'With Review Status Correction Needed: the part of the application highlighted for the customer on the ' +
        'correction page (Track page → Make the correction). The customer can still change everything else.' },
    'Visa Files': { width: 95, auto: true, format: '0', align: 'center',
      note: 'Valid visa files (PDF, JPG or PNG, max 5 MB each) in the lead\'s "Approved Visa" Drive folder. Updated ' +
        'automatically. With Review Status Visa Approved the customer email waits until this is 1 or more.' },
    'Send Now': { width: 95, checkbox: true, align: 'center',
      note: 'Visa applications: tick to recount Visa Files and send the current Review Status email at once, without the ' +
        '5-minute wait. Every other rule still applies: each status is emailed once, Correction Needed needs a Message ' +
        'to Customer, Visa Approved needs a visa file in Approved Visa, TEST leads are not emailed, and the email is ' +
        'queued when the daily quota is used up. The box unticks itself and its note shows the result. Several rows: ' +
        'select their Send Now cells and press Space.' },
    'Last Change': { width: 150, auto: true, format: 'dd mmm yyyy, hh:mm',
      note: 'When this row last changed (staff edits and the website). Finished leads move to the archive 90 days after this.' },
    'Emails Sent': { width: 220, auto: true, hidden: true,
      note: 'Which emails this lead already got (the system uses it so nothing is sent twice). Do not edit.' },
  },
  SCHEMA_VERSION: '9',

  // Archive (Archive.gs): finished leads move to "Elite Global – Archive <YYYY>-Q<n>" (by Date Received)
  ARCHIVE: {
    AGE_DAYS: 90,              // days since Last Change
    FOLDER: 'Archive',         // in the root Drive folder
    NAME: 'Elite Global – Archive ',
    INDEX_TAB: 'Archive Index',
    BATCH: 200,                // leads per lock hold (copy → verify → index → delete; contiguous rows)
    BUDGET_MS: 270000,         // stop and resume next run after 4.5 minutes
    LEAD_FINAL: ['Converted', 'Lost'],
    REVIEW_FINAL: ['Visa Approved', 'Not Approved / Closed'],
    STALE_DAYS: 365,           // unfinished and unchanged this long → "please close" in the daily summary
    MIN_ROWS: 2000,            // the Lead Tracker keeps at least this many pre-formatted rows
  },
  DUE_TAB: 'Due',              // hidden tab: status emails waiting (Lead ID, due time, reason)

  // Google limits the code stays inside (PRD §6.4). Script Property TRIGGER_LIMIT_MIN overrides the trigger limit.
  LIMITS_GOOGLE: {
    TRIGGER_MIN_CONSUMER: 90,  // total trigger runtime per day, gmail.com
    TRIGGER_MIN_WORKSPACE: 360,
    MAIL_CONSUMER: 100,        // MailApp recipients per day, gmail.com
    MAIL_WORKSPACE: 1500,
    CELLS: 10000000,           // cells per spreadsheet (whole grids)
    WARN: 0.7,                 // ⚠️ in the daily summary at 70 % of a limit
    LOCK_WAIT_MS: 20000,       // web app: wait up to 20 s for the script lock, then answer busy (website retries ~97 s)
    SID_TTL_S: 21600,          // submission key replies kept 6 h (CacheService maximum)
    DUE_MAX: 2000,             // Due rows handled per run (the rest next run)
  },

  // Visa review workflow (Review Status column). Lead Status stays the sales pipeline.
  REVIEW_STATUSES: [
    'Under Review', 'Correction Needed', 'Correction Received', 'Verified',
    'Visa Processing', 'Visa Approved', 'Not Approved / Closed',
  ],
  REVIEW_FINAL: ['Visa Approved', 'Not Approved / Closed'],
  // Correction For (staff) → section highlighted on correct-visa.html (approved list, round 2.3)
  CORRECTION_FOR: ['Passport photo', 'Passport data page', 'Personal details', 'Travel details', 'Flight ticket',
    'Hotel booking', 'Other (see message)'],

  // Self-service corrections (Correction.gs): Track → email code to the stored address → correction page
  CORRECTION: {
    TOKEN_MIN: 60,         // a correction token is valid for 60 minutes and used once (at submit)
    PENDING_FOLDER: 'Correction (pending)', // replacements wait here until submit; binned when the token expires
  },

  // Visa delivery (VisaDelivery.gs): staff put the approved visa in "Approved Visa"; the customer downloads it
  // from the Track page after an email code (and, with Script Property ATTACH_VISA=on, gets it attached).
  VISA_DELIVERY: {
    FOLDER: 'Approved Visa',
    FILE_MAX: 5 * 1024 * 1024,     // per file (count, download, attachments); bigger files are ignored
    ATTACH_MAX: 15 * 1024 * 1024,  // all files together, for the email attachment
    TOKEN_MIN: 30,                 // download token: 30 minutes, several downloads
    DOWNLOADS_PER_HOUR: 20,        // per Lead ID
    TYPES: { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' },
    NEXT_STEP: 'Download your visa with the button below. Our team will also contact you about the next steps.',
  },

  // FORMS_PAUSED = on (pauseForms): the reply to a new request. The website adds the WhatsApp / phone / email links.
  PAUSED_MESSAGE: 'We\'re updating our online system for a short while, so we can\'t take new requests online right now. ' +
    'Please try again later.',

  // Company details used in every email. Must equal public/assets/js/config.js company (check-lists.js).
  COMPANY_INFO: {
    name: 'Elite Global World Travel & Tours Ltd.',
    rc: '7787410',
    address: 'No. 335, Suite 3, Opposite Fidelity Bank, Zoo Road, Kano, Nigeria',
    phone: '+234 706 215 2046',
    whatsapp: '2347062152046',
    email: 'info@elitetravelng.com',
    instagram: 'https://www.instagram.com/elite_global_travels/',
  },

  // Emails (Email.gs, Notify.gs). Settings that differ per environment live in Script Properties.
  EMAIL: {
    SENDER_NAME: 'Elite Global World Travel & Tours',
    DEFAULT_SITE_URL: 'https://elite-global-staging.netlify.app',
    BREVO_URL: 'https://api.brevo.com/v3/smtp/email',
    LOG_NAME: 'Elite Global – Email Log', // separate spreadsheet in the root Drive folder
    LOG_TAB: 'Email Log',
    QUEUE_TAB: 'Email Queue',
    LOG_DAYS: 90,          // Email Log rows older than this are removed by the daily summary
    UNDO_MIN: 5,           // a Review Status change is emailed after staying unchanged this long
    QUOTA_RESERVE: 20,     // MailApp quota kept free for verification codes
    QUEUE_MAX_ATTEMPTS: 10,
    WAIT_DAYS: 3,          // daily summary: "waiting" after this many days without a change
    SUMMARY_HOUR: 8,       // daily summary around 08:00 Africa/Lagos
    JOB_BUDGET_MS: 240000, // runEmailJobs stops sending after 4 minutes
  },

  // Email verification codes (Verify.gs)
  OTP: {
    TTL_S: 1800,           // a code is valid for 30 minutes
    RESEND_S: 60,          // a new code can be requested after 60 s …
    HOURLY_MAX: 5,         // … up to 5 per hour per email
    GLOBAL_HOURLY: 300,    // all emails together, per hour (protects the quota from abuse)
    ATTEMPTS: 5,           // wrong codes before a new one must be requested
    TOKEN_H: 24,           // verified-email token lifetime
    TEST_CODE: '246810',   // only with Script Property TEST_OTP_BYPASS=on, TEST names, @example.com
  },

  // track.html (trackApplication): what the customer sees. Approved by the operator (round 2).
  TRACK: {
    NOT_FOUND: 'We couldn\'t find an application with those details. Please check your reference number and the email or phone number you used.',
    ID_MAX: 5,          // lookups per Lead ID …
    CONTACT_MAX: 20,    // … and per email/phone value …
    WINDOW_S: 600,      // … per 10 minutes
    // Session after a successful lookup (refresh / reopen in the same tab): sliding idle limit + hard cap
    SESSION_IDLE_MIN: 60,
    SESSION_MAX_H: 8,
    SESSION_MAX: 30,    // lookups with a session token per Lead ID per 10 minutes (own counter)
    MESSAGE_MAX: 300,   // Message to Customer is cut to this length
    SERVICE: {
      'Visa Only': 'Visa only',
      'Customised Experience': 'Customised Umrah',
      'General Enquiry': 'General enquiry',
    },
    // Lead Status (staff) → customer stage. Blank/unknown counts as New Lead.
    STAGES: {
      'New Lead': ['Received', 'We have received your request and it is in our queue.',
        'A member of our team will contact you shortly by phone or WhatsApp.'],
      'Contacted': ['In progress', 'Our team has been in touch with you about this request.',
        'Reply to our message, or contact us if you have any questions.'],
      'Awaiting Response': ['Waiting for your reply', 'We are waiting for information or a reply from you.',
        'Please reply to our last message, or contact us on WhatsApp or by phone.'],
      'Quotation Sent': ['Quotation sent', 'We have sent you a quotation for your request.',
        'Please review it and let us know if you would like to go ahead.'],
      'Payment Pending': ['Awaiting payment', 'Your arrangements are ready to continue once payment is received.',
        'Please complete payment as agreed with our team. Contact us if you need the details again.'],
      'Converted': ['Confirmed', 'Your request is confirmed. Thank you for choosing Elite Global.',
        'Our team will keep you updated on the next steps of your journey.'],
      'Lost': ['Closed', 'This request is closed.', 'Contact us if you have questions.'],
    },
    // Visa leads with a Review Status: it decides the stage (approved wording, round 2.2)
    REVIEW: {
      'Under Review': ['Under review', 'We have received all your documents and our team is checking them.',
        'No action needed for now. We will email you if anything needs correcting.'],
      'Correction Needed': ['Action needed', 'We need a correction or more information to continue your application.',
        'Please read the message below, then use “Make the correction”, or contact us on WhatsApp.'],
      'Correction Received': ['Correction received', 'Thank you — we have received your correction and are checking it.',
        'No action needed for now. We will update you soon.'],
      'Verified': ['Documents verified', 'Your documents have been checked and are ready for submission.',
        'We will submit your visa application and keep you updated.'],
      'Visa Processing': ['Visa in processing', 'Your visa application has been submitted and is being processed.',
        'Processing times vary. We will email you as soon as there is a decision.'],
      'Visa Approved': ['Visa approved', 'Good news — your visa has been approved.',
        'Our team will contact you with your visa and the next steps.'],
      'Not Approved / Closed': ['Closed', 'This application is closed.',
        'Please contact us if you have any questions.'],
    },
    // Visa application whose upload expired (Application Status "Expired"), unless Lost
    EXPIRED: ['Upload not finished', 'Upload not finished — please contact us or apply again.',
      'Contact us on WhatsApp or by phone, or start a new application.'],
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
      sharedCols: { t: 16, h: 17 }, // Shared Flight Ticket, Shared Hotel Booking
    },
    PASSENGERS: {
      name: 'Visa Passengers',
      headers: ['Lead ID', 'No.', 'Full Name (as on passport)', 'Category', 'Photo (KB)',
        'Passport File', 'Photo File', 'Uploaded At', 'Flight Ticket', 'Hotel Booking'],
      widths: [120, 50, 240, 140, 90, 140, 140, 150, 200, 200],
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
    DOC_PDF_MAX: 5 * 1024 * 1024,                // flight ticket / hotel booking PDF
    DOC_IMG_MAX: Math.round(1.6 * 1024 * 1024),  // … images (the website compresses them to ~1 MB)
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

  // Optional visa documents: code used in upload state → Drive file name / label
  DOCS: {
    t: { kind: 'ticket', file: 'flight-ticket', label: 'the flight ticket', col: 'Flight Ticket' },
    h: { kind: 'hotel', file: 'hotel-booking', label: 'the hotel booking', col: 'Hotel Booking' },
  },

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
