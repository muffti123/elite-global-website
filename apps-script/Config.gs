/**
 * Elite Global lead system — configuration shared by every file.
 * LISTS and COUNTRIES must match public/assets/js/lists.js exactly (run: node tools/check-lists.js).
 */

const CONFIG = {
  // Expected owner account is per environment: Script Properties key OWNER_EMAIL
  // (set it with setOwnerEmail). See docs/ENVIRONMENTS.md.
  COMPANY: 'Elite Global World Travel & Tours Ltd.',
  FOLDER_NAME: 'Elite Global – Lead Generation System',

  FORMS: {
    VISA: {
      title: 'Elite Global – Request Umrah Visa Only',
      sheetName: 'Elite Global – Visa Only Enquiries',
      category: 'Visa Only',
      idPrefix: 'VO',
    },
    CUSTOM: {
      title: 'Elite Global – Customize My Umrah Experience',
      sheetName: 'Elite Global – Custom Experience Enquiries',
      category: 'Customised Experience',
      idPrefix: 'CE',
    },
    CONTACT: {
      title: 'Elite Global – General Contact Enquiries',
      sheetName: 'Elite Global – General Contact Enquiries (Responses)',
      category: 'General Enquiry',
      idPrefix: 'GE',
    },
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
  ],
  NOTES_COL: 14,
  FOLDER_COL: 15,

  // Detail tabs in the Central Lead Tracker (one row per lead / passenger)
  TABS: {
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
        'Adults', 'Children', 'Infants', 'Departure City', 'Travel Date', 'Confirmed Flight Ticket',
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

// Question titles — the sync script matches answers by these exact titles.
// If you rename a question in the Form editor, update it here too.
const Q = {
  NAME: 'Full Name',
  PHONE: 'Phone Number / WhatsApp Number',
  EMAIL: 'Email Address',
  COUNTRY: 'Country of Residence',
  ADULTS: 'Number of Adults (18 years and above)',
  CHILDREN: 'Number of Children (2–17 years)',
  INFANTS: 'Number of Infants (below 2 years)',
  TRAVEL_DATE: 'Preferred Travel Date',
  DEPARTURE_CITY: 'Departure City',
  PREF_DEPARTURE_CITY: 'Preferred Departure City',
  FLIGHT: 'Do you have a confirmed flight ticket?',
  PRIOR_KSA: 'Have you previously travelled to Saudi Arabia?',
  WESTERN_VISA: 'Do you currently hold a valid UK, US or Schengen visa?',
  EXTRA_INFO: 'Additional Information / Special Requests',
  HEARD: 'How did you hear about Elite Global?',
  ARRIVAL_CITY: 'Preferred Arrival City in Saudi Arabia',
  NIGHTS_MADINAH: 'Preferred Duration in Madinah (nights)',
  NIGHTS_MAKKAH: 'Preferred Duration in Makkah (nights)',
  HOTEL_CAT: 'Preferred Hotel Category',
  HARAM_DIST: 'Preferred Distance from Haram',
  PREF_HOTEL: 'Preferred Hotel',
  SERVICES: 'Which services do you require?',
  VISA_ASSIST: 'Do you require Umrah visa assistance?',
  BUDGET: 'What is your estimated budget per person?',
  EXPERIENCE: 'Preferred Travel Experience',
  HOTEL_OR_AIRLINE: 'Preferred Hotel or Airline',
  SPECIAL: 'Special Requests / Additional Information',
  // Contact form (matches the website enquiry form)
  C_PHONE: 'Phone / WhatsApp Number',
  C_TYPE: 'Enquiry Type',
  C_TRAVELLERS: 'Number of Travellers',
  C_DETAILS: 'Additional Details',
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
  VISA_DESC:
    'Welcome to Elite Global World Travel & Tours Ltd. Planning your Umrah journey? ' +
    'Complete this short form to request Umrah visa assistance. Our team will review your ' +
    'enquiry and contact you with the next steps.',
  VISA_CONFIRM:
    'Thank you for choosing Elite Global World Travel & Tours Ltd.\n' +
    'Your Umrah visa enquiry has been received. Our team will contact you shortly to guide ' +
    'you through the next steps.',
  CUSTOM_DESC:
    'Every Umrah journey is unique. Tell us about your travel preferences, accommodation ' +
    'requirements and additional services you may need. Our team will use the information ' +
    'provided to prepare a customised Umrah travel proposal for you.',
  CUSTOM_CONFIRM:
    'Thank you for choosing Elite Global World Travel & Tours Ltd.\n' +
    'Your customised Umrah enquiry has been successfully received.\n' +
    'Our travel consultants will review your preferences and contact you to discuss the best ' +
    'arrangements for your journey.\n' +
    'We look forward to being part of your Umrah experience.',
  CONTACT_DESC:
    'Have a question about Umrah visas, packages, hotel accommodation or ground transport? ' +
    'Send us your enquiry and a member of the Elite Global team will get back to you.',
  CONTACT_CONFIRM:
    'Thank you for contacting Elite Global World Travel & Tours Ltd.\n' +
    'Your enquiry has been received. A member of our team will contact you shortly.',
  PASSPORT_SECTION:
    'If available, upload a clear passport biodata page for each applicant. You may submit ' +
    'your enquiry first and provide passports later. Passport documents will be required ' +
    'before visa processing.\n\n' +
    'Accepted formats: PDF, JPG, JPEG or PNG (up to 10 files). Uploading is optional.\n' +
    'Please note: Google Forms asks you to sign in to a Google account to upload files. ' +
    'If you prefer not to sign in, skip this step and our team will collect passports from ' +
    'you later via WhatsApp or email.\n' +
    'Your documents are stored privately and are only accessible to authorised Elite Global staff.',
  PASSPORT_SECTION_CUSTOM:
    'If available, upload a clear passport biodata page for each traveller. You may submit ' +
    'your enquiry first and provide passports later. Passport documents will be required ' +
    'before visa processing.\n\n' +
    'Accepted formats: PDF, JPG, JPEG or PNG (up to 10 files). Uploading is optional.\n' +
    'Please note: Google Forms asks you to sign in to a Google account to upload files. ' +
    'If you prefer not to sign in, skip this step and our team will collect passports from ' +
    'you later via WhatsApp or email.\n' +
    'Your documents are stored privately and are only accessible to authorised Elite Global staff.',
};
