/**
 * =====================================================================
 *  ELITE GLOBAL WORLD TRAVEL & TOURS LTD. (RC: 7787410)
 *  Lead Generation System — Google Forms + Sheets + Central Lead Tracker
 * =====================================================================
 *
 *  HOW TO USE (full instructions in the chat / README):
 *   1. Sign in to script.google.com as eliteglobaltravelsng@gmail.com
 *   2. New project → paste this whole file into Code.gs → Save
 *   3. Select  setupEliteGlobal  → Run → approve permissions
 *   4. Read the Execution log (or the "System Info" tab of the tracker)
 *
 *  FUNCTIONS YOU CAN RUN:
 *   setupEliteGlobal()   – builds everything (run ONCE)
 *   cleanupTestData()    – removes any lead whose name starts with "TEST"
 *   reinstallTriggers()  – re-creates the auto-sync triggers if needed
 *   showSystemInfo()     – prints all URLs again in the log
 *
 *  WHAT APPS SCRIPT CANNOT DO (manual steps, ~5 minutes):
 *   • Add the "File upload" passport questions (Google gives no API for it)
 *   • Set the form theme colours / header image
 * =====================================================================
 */

// ---------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------
const CONFIG = {
  EXPECTED_OWNER: 'eliteglobaltravelsng@gmail.com',
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

  HEADERS: [
    'Lead ID', 'Date Received', 'Customer Name', 'Phone Number', 'Lead Category',
    'Adults', 'Children', 'Infants', 'Total Travellers', 'Travel Date',
    'Budget', 'Lead Status', 'Assigned Agent', 'Follow-up Notes',
  ],
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

// ---------------------------------------------------------------------
// MAIN SETUP — run once
// ---------------------------------------------------------------------
function setupEliteGlobal() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_DONE') === 'yes') {
    throw new Error(
      'Setup has already been completed. Run showSystemInfo() to see the URLs. ' +
      'To rebuild from scratch, delete the "' + CONFIG.FOLDER_NAME + '" folder in Drive, ' +
      'then run resetSetupFlag() and run setupEliteGlobal() again.');
  }
  checkOwner_();

  Logger.log('Creating Drive folder…');
  const folder = DriveApp.createFolder(CONFIG.FOLDER_NAME);

  Logger.log('Building Form 1 (Visa Only)…');
  const visaForm = buildVisaForm_();
  const visaSS = linkResponseSheet_(visaForm, CONFIG.FORMS.VISA.sheetName);

  Logger.log('Building Form 2 (Custom Experience)…');
  const customForm = buildCustomForm_();
  const customSS = linkResponseSheet_(customForm, CONFIG.FORMS.CUSTOM.sheetName);

  Logger.log('Building Form 3 (General Contact)…');
  const contactForm = buildContactForm_();
  const contactSS = linkResponseSheet_(contactForm, CONFIG.FORMS.CONTACT.sheetName);

  Logger.log('Building Central Lead Tracker…');
  const tracker = buildTracker_();

  // Keep everything together and private in one folder
  [visaForm.getId(), visaSS.getId(), customForm.getId(), customSS.getId(),
    contactForm.getId(), contactSS.getId(), tracker.getId()]
    .forEach(function (id) { DriveApp.getFileById(id).moveTo(folder); });

  props.setProperties({
    FORM_VISA_ID: visaForm.getId(),
    FORM_CUSTOM_ID: customForm.getId(),
    FORM_CONTACT_ID: contactForm.getId(),
    SS_VISA_ID: visaSS.getId(),
    SS_CUSTOM_ID: customSS.getId(),
    SS_CONTACT_ID: contactSS.getId(),
    TRACKER_ID: tracker.getId(),
    FOLDER_ID: folder.getId(),
    LEAD_SEQ: '0',
  });

  reinstallTriggers();
  writeSystemInfo_();
  props.setProperty('SETUP_DONE', 'yes');

  Logger.log('✅ SETUP COMPLETE');
  showSystemInfo();
}

// ---------------------------------------------------------------------
// FORM 1 — Request Umrah Visa Only
// ---------------------------------------------------------------------
function buildVisaForm_() {
  const form = FormApp.create(CONFIG.FORMS.VISA.title);
  configureForm_(form, TEXT.VISA_DESC, TEXT.VISA_CONFIRM);

  // Section 1 — Personal Information
  form.addSectionHeaderItem().setTitle('Personal Information');
  addPersonalInfo_(form);

  // Section 2 — Applicant Information
  form.addPageBreakItem().setTitle('Applicant Information')
    .setHelpText('Enter the number of people in each age group. Enter 0 if none.');
  addTravellerCounts_(form);

  // Section 3 — Travel Information
  form.addPageBreakItem().setTitle('Travel Information');
  form.addDateItem().setTitle(Q.TRAVEL_DATE).setRequired(true).setIncludesYear(true);
  addShortText_(form, Q.DEPARTURE_CITY, true, 'e.g. Lagos, Abuja, Kano');
  addChoice_(form, Q.FLIGHT, LISTS.YES_NO, true);
  addChoice_(form, Q.PRIOR_KSA, LISTS.YES_NO, true);
  addChoice_(form, Q.WESTERN_VISA, LISTS.YES_NO, false);

  // Section 4 — Passport Documents (file-upload question is added manually — see instructions)
  form.addPageBreakItem().setTitle('Passport Documents').setHelpText(TEXT.PASSPORT_SECTION);

  // Section 5 — Additional Information
  form.addPageBreakItem().setTitle('Additional Information');
  form.addParagraphTextItem().setTitle(Q.EXTRA_INFO).setRequired(false);
  addDropdown_(form, Q.HEARD, LISTS.HEARD, false);

  publish_(form);
  return form;
}

// ---------------------------------------------------------------------
// FORM 2 — Customize My Umrah Experience
// ---------------------------------------------------------------------
function buildCustomForm_() {
  const form = FormApp.create(CONFIG.FORMS.CUSTOM.title);
  configureForm_(form, TEXT.CUSTOM_DESC, TEXT.CUSTOM_CONFIRM);

  // Section 1 — Personal Information
  form.addSectionHeaderItem().setTitle('Personal Information');
  addPersonalInfo_(form);

  // Section 2 — Traveller and Travel Information
  form.addPageBreakItem().setTitle('Traveller and Travel Information')
    .setHelpText('Enter the number of people in each age group. Enter 0 if none.');
  addTravellerCounts_(form);
  addShortText_(form, Q.PREF_DEPARTURE_CITY, true, 'e.g. Lagos, Abuja, Kano');
  form.addDateItem().setTitle(Q.TRAVEL_DATE).setRequired(true).setIncludesYear(true);
  addChoice_(form, Q.FLIGHT, LISTS.YES_NO, true);
  addChoice_(form, Q.ARRIVAL_CITY, LISTS.ARRIVAL, true);

  // Section 3 — Accommodation Preferences
  form.addPageBreakItem().setTitle('Accommodation Preferences');
  addNumber_(form, Q.NIGHTS_MADINAH, true, 0, 'Number of nights you would like to spend in Madinah. Enter 0 if none.');
  addNumber_(form, Q.NIGHTS_MAKKAH, true, 0, 'Number of nights you would like to spend in Makkah. Enter 0 if none.');
  addDropdown_(form, Q.HOTEL_CAT, LISTS.HOTEL_CAT, true);
  addDropdown_(form, Q.HARAM_DIST, LISTS.HARAM_DIST, true);
  addShortText_(form, Q.PREF_HOTEL, false, 'Optional — name of a specific hotel, if any');

  // Section 4 — Additional Services Required
  form.addPageBreakItem().setTitle('Additional Services Required')
    .setHelpText('Select all the services you would like us to arrange.');
  form.addCheckboxItem().setTitle(Q.SERVICES)
    .setChoiceValues(LISTS.SERVICES).showOtherOption(true).setRequired(false);

  // Section 5 — Visa and Budget Preferences
  form.addPageBreakItem().setTitle('Visa and Budget Preferences');
  addChoice_(form, Q.VISA_ASSIST, LISTS.VISA_ASSIST, true);
  addDropdown_(form, Q.BUDGET, LISTS.BUDGET, true);

  // Section 6 — Travel Experience and Special Requests
  form.addPageBreakItem().setTitle('Travel Experience and Special Requests');
  addDropdown_(form, Q.EXPERIENCE, LISTS.EXPERIENCE, false);
  addShortText_(form, Q.HOTEL_OR_AIRLINE, false, 'Optional');
  form.addParagraphTextItem().setTitle(Q.SPECIAL).setRequired(false);

  // Section 7 — Passport Documents (file-upload question is added manually)
  form.addPageBreakItem().setTitle('Passport Documents').setHelpText(TEXT.PASSPORT_SECTION_CUSTOM);

  // Section 8 — Lead Source
  form.addPageBreakItem().setTitle('Lead Source');
  addDropdown_(form, Q.HEARD, LISTS.HEARD, false);

  publish_(form);
  return form;
}

// ---------------------------------------------------------------------
// FORM 3 — General Contact Enquiries (mirrors the website enquiry form)
// NOTE: The website posts directly into this form, so it deliberately has
// no regex validation — Google silently rejects submissions that fail
// validation. Validation is done in the website's JavaScript instead.
// ---------------------------------------------------------------------
function buildContactForm_() {
  const form = FormApp.create(CONFIG.FORMS.CONTACT.title);
  configureForm_(form, TEXT.CONTACT_DESC, TEXT.CONTACT_CONFIRM);

  form.addTextItem().setTitle(Q.NAME).setRequired(true);
  form.addTextItem().setTitle(Q.C_PHONE).setRequired(true)
    .setHelpText('Include your country code, e.g. +234 803 000 0000');
  addDropdown_(form, Q.C_TYPE, LISTS.ENQUIRY_TYPES, true);
  form.addDateItem().setTitle(Q.TRAVEL_DATE).setRequired(false).setIncludesYear(true);
  form.addTextItem().setTitle(Q.C_TRAVELLERS).setRequired(false).setHelpText('e.g. 2');
  form.addParagraphTextItem().setTitle(Q.C_DETAILS).setRequired(false)
    .setHelpText('Tell us a little about your travel plans');

  publish_(form);
  return form;
}

// ---------------------------------------------------------------------
// FORM HELPERS
// ---------------------------------------------------------------------
function configureForm_(form, description, confirmation) {
  form.setDescription(description)
    .setConfirmationMessage(confirmation)
    .setProgressBar(true)
    .setShuffleQuestions(false)
    .setAllowResponseEdits(false)
    .setLimitOneResponsePerUser(false) // true would force every respondent to sign in
    .setPublishingSummary(false)       // respondents must never see other people's answers
    .setShowLinkToRespondAgain(true)
    .setCollectEmail(false);           // we ask for email as a normal, validated question
  try { form.setRequireLogin(false); } catch (e) { /* Workspace-only setting; ignored on gmail.com */ }
}

function publish_(form) {
  try { form.setPublished(true); } catch (e) { /* older forms are published by default */ }
  form.setAcceptingResponses(true);
}

function addPersonalInfo_(form) {
  form.addTextItem().setTitle(Q.NAME).setRequired(true);
  form.addTextItem().setTitle(Q.PHONE).setRequired(true)
    .setHelpText('Include your country code, e.g. +234 803 000 0000')
    .setValidation(FormApp.createTextValidation()
      .setHelpText('Please enter a valid phone number (digits, spaces, +, - or brackets only).')
      .requireTextMatchesPattern('^\\s*\\+?[0-9][0-9 ()\\-]{6,19}\\s*$')
      .build());
  form.addTextItem().setTitle(Q.EMAIL).setRequired(true)
    .setValidation(FormApp.createTextValidation()
      .setHelpText('Please enter a valid email address, e.g. name@example.com')
      .requireTextIsEmail()
      .build());
  addDropdown_(form, Q.COUNTRY, COUNTRIES, true);
}

function addTravellerCounts_(form) {
  addNumber_(form, Q.ADULTS, true, 0, 'Enter a whole number (0 or more).');
  addNumber_(form, Q.CHILDREN, true, 0, 'Enter a whole number (0 or more).');
  addNumber_(form, Q.INFANTS, true, 0, 'Enter a whole number (0 or more).');
}

/** Short-answer question that only accepts whole numbers >= min (0 or 1). */
function addNumber_(form, title, required, min, helpText) {
  const pattern = min >= 1 ? '^\\s*[1-9][0-9]{0,2}\\s*$' : '^\\s*[0-9]{1,3}\\s*$';
  const msg = min >= 1
    ? 'Please enter a whole number of 1 or more (e.g. 1, 2, 3).'
    : 'Please enter a whole number of 0 or more (e.g. 0, 1, 2). No decimals or minus signs.';
  return form.addTextItem().setTitle(title).setRequired(required).setHelpText(helpText || '')
    .setValidation(FormApp.createTextValidation().setHelpText(msg)
      .requireTextMatchesPattern(pattern).build());
}

function addShortText_(form, title, required, helpText) {
  return form.addTextItem().setTitle(title).setRequired(required).setHelpText(helpText || '');
}

function addChoice_(form, title, choices, required) {
  return form.addMultipleChoiceItem().setTitle(title).setChoiceValues(choices).setRequired(required);
}

function addDropdown_(form, title, choices, required) {
  return form.addListItem().setTitle(title).setChoiceValues(choices).setRequired(required);
}

/** Creates a response spreadsheet, links it to the form, and tidies it up. */
function linkResponseSheet_(form, name) {
  const created = SpreadsheetApp.create(name);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, created.getId());
  SpreadsheetApp.flush();
  Utilities.sleep(2000);

  const ss = SpreadsheetApp.openById(created.getId());
  const sheets = ss.getSheets();
  const linked = sheets.filter(function (s) { return s.getFormUrl(); })[0] || sheets[sheets.length - 1];

  // Remove the default empty "Sheet1"
  sheets.forEach(function (s) {
    if (s.getSheetId() !== linked.getSheetId() && s.getLastRow() === 0) {
      try { ss.deleteSheet(s); } catch (e) { /* keep if it can't be deleted */ }
    }
  });

  // Style header + keep phone numbers as text (stops Sheets dropping the leading 0)
  const lastCol = Math.max(linked.getLastColumn(), 1);
  const header = linked.getRange(1, 1, 1, lastCol);
  header.setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
  linked.setFrozenRows(1);
  header.getValues()[0].forEach(function (h, i) {
    if (String(h).indexOf('Phone') !== -1) linked.getRange(2, i + 1, linked.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  return ss;
}

// ---------------------------------------------------------------------
// CENTRAL LEAD TRACKER
// ---------------------------------------------------------------------
function buildTracker_() {
  const ss = SpreadsheetApp.create(CONFIG.TRACKER_NAME);
  const sh = ss.getSheets()[0].setName(CONFIG.TRACKER_TAB);
  const H = CONFIG.HEADERS;
  const rows = CONFIG.TRACKER_ROWS;

  // Grid size
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() > H.length) sh.deleteColumns(H.length + 1, sh.getMaxColumns() - H.length);

  // Header
  sh.getRange(1, 1, 1, H.length).setValues([H])
    .setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold')
    .setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true);
  sh.getRange(1, 12).setBackground(CONFIG.GOLD).setFontColor(CONFIG.NAVY); // Lead Status stands out
  sh.setRowHeight(1, 40);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);

  applyRowRules_(sh, 2, rows - 1);

  // Column widths: A..N
  [120, 140, 190, 150, 170, 70, 75, 70, 95, 110, 190, 150, 140, 380]
    .forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange(2, 14, rows - 1, 1).setWrap(true);

  // Colour-coded Lead Status
  const statusRange = sh.getRange(2, 12, rows - 1, 1);
  const colours = {
    'New Lead': ['#fff4d6', '#8a5a00'],
    'Contacted': ['#e3ecff', '#102d70'],
    'Awaiting Response': ['#eef0f4', '#3d4660'],
    'Quotation Sent': ['#e8e3ff', '#4b2fa0'],
    'Payment Pending': ['#ffe9d6', '#a04a00'],
    'Converted': ['#dff3e6', '#176b38'],
    'Lost': ['#fde2e2', '#a01818'],
  };
  sh.setConditionalFormatRules(Object.keys(colours).map(function (status) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(status)
      .setBackground(colours[status][0]).setFontColor(colours[status][1])
      .setRanges([statusRange]).build();
  }));

  // Filter for the sales team
  sh.getRange(1, 1, rows, H.length).createFilter();

  // Warn (not block) anyone editing auto-generated columns
  [[1, 'Lead ID'], [2, 'Date Received'], [9, 'Total Travellers']].forEach(function (c) {
    sh.getRange(2, c[0], rows - 1, 1).protect()
      .setDescription(c[1] + ' is generated automatically').setWarningOnly(true);
  });

  ss.insertSheet(CONFIG.INFO_TAB);
  return ss;
}

/** Formats, dropdowns and the Total Travellers formula for a block of rows. */
function applyRowRules_(sh, startRow, numRows) {
  sh.getRange(startRow, 2, numRows, 1).setNumberFormat('dd mmm yyyy, hh:mm');
  sh.getRange(startRow, 4, numRows, 1).setNumberFormat('@');
  sh.getRange(startRow, 6, numRows, 4).setNumberFormat('0').setHorizontalAlignment('center');
  sh.getRange(startRow, 10, numRows, 1).setNumberFormat('dd mmm yyyy');

  sh.getRange(startRow, 5, numRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.LEAD_CATEGORIES, true)
      .setAllowInvalid(false).setHelpText('Choose a lead category from the list.').build());
  sh.getRange(startRow, 12, numRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.LEAD_STATUSES, true)
      .setAllowInvalid(false).setHelpText('Choose a lead status from the list.').build());
  sh.getRange(startRow, 6, numRows, 3).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0)
      .setAllowInvalid(false).setHelpText('Enter a whole number, 0 or more.').build());

  // Total Travellers = Adults + Children + Infants (blank until a count is entered)
  sh.getRange(startRow, 9, numRows, 1)
    .setFormulaR1C1('=IF(COUNT(RC[-3]:RC[-1])=0,"",RC[-3]+RC[-2]+RC[-1])');
}

// ---------------------------------------------------------------------
// AUTO-SYNC: form submission → Central Lead Tracker
// ---------------------------------------------------------------------
function reinstallTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onLeadFormSubmit') ScriptApp.deleteTrigger(t);
  });
  const p = PropertiesService.getScriptProperties();
  ['FORM_VISA_ID', 'FORM_CUSTOM_ID', 'FORM_CONTACT_ID'].forEach(function (key) {
    ScriptApp.newTrigger('onLeadFormSubmit')
      .forForm(FormApp.openById(p.getProperty(key))).onFormSubmit().create();
  });
  Logger.log('Auto-sync triggers installed on all 3 forms.');
}

/** Installable trigger — runs on every submission of any of the 3 forms. */
function onLeadFormSubmit(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const p = PropertiesService.getScriptProperties();
    const formId = e.source.getId();
    const kind =
      formId === p.getProperty('FORM_VISA_ID') ? 'VISA' :
      formId === p.getProperty('FORM_CUSTOM_ID') ? 'CUSTOM' :
      formId === p.getProperty('FORM_CONTACT_ID') ? 'CONTACT' : null;
    if (!kind) return;

    const a = {};
    e.response.getItemResponses().forEach(function (ir) {
      a[ir.getItem().getTitle().trim()] = ir.getResponse();
    });
    appendLead_(kind, a, e.response.getTimestamp());
  } catch (err) {
    notifyError_(err, e);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function appendLead_(kind, a, timestamp) {
  const p = PropertiesService.getScriptProperties();
  const sh = SpreadsheetApp.openById(p.getProperty('TRACKER_ID')).getSheetByName(CONFIG.TRACKER_TAB);
  const cfg = CONFIG.FORMS[kind];

  const seq = Number(p.getProperty('LEAD_SEQ') || 0) + 1;
  p.setProperty('LEAD_SEQ', String(seq));
  const leadId = 'EG-' + cfg.idPrefix + '-' + ('00000' + seq).slice(-5);

  let adults = toInt_(a[Q.ADULTS]);
  const children = toInt_(a[Q.CHILDREN]);
  const infants = toInt_(a[Q.INFANTS]);
  let budget = '';
  let notes = [];

  if (kind === 'VISA') {
    budget = 'N/A (visa only)';
    notes = [
      'Email: ' + v_(a[Q.EMAIL]),
      'Country: ' + v_(a[Q.COUNTRY]),
      'Departure: ' + v_(a[Q.DEPARTURE_CITY]),
      'Flight ticket: ' + v_(a[Q.FLIGHT]),
      'Been to KSA: ' + v_(a[Q.PRIOR_KSA]),
      'UK/US/Schengen visa: ' + v_(a[Q.WESTERN_VISA]),
      a[Q.EXTRA_INFO] ? 'Requests: ' + a[Q.EXTRA_INFO] : '',
      a[Q.HEARD] ? 'Source: ' + a[Q.HEARD] : '',
    ];
  } else if (kind === 'CUSTOM') {
    budget = v_(a[Q.BUDGET], '');
    notes = [
      'Email: ' + v_(a[Q.EMAIL]),
      'Country: ' + v_(a[Q.COUNTRY]),
      'Departure: ' + v_(a[Q.PREF_DEPARTURE_CITY]),
      'Arrive: ' + v_(a[Q.ARRIVAL_CITY]),
      'Nights Madinah/Makkah: ' + v_(a[Q.NIGHTS_MADINAH]) + '/' + v_(a[Q.NIGHTS_MAKKAH]),
      'Hotel: ' + v_(a[Q.HOTEL_CAT]) + ', ' + v_(a[Q.HARAM_DIST]) +
        (a[Q.PREF_HOTEL] ? ' (' + a[Q.PREF_HOTEL] + ')' : ''),
      'Visa help: ' + v_(a[Q.VISA_ASSIST]),
      'Flight ticket: ' + v_(a[Q.FLIGHT]),
      a[Q.SERVICES] ? 'Services: ' + [].concat(a[Q.SERVICES]).join(', ') : '',
      a[Q.EXPERIENCE] ? 'Experience: ' + a[Q.EXPERIENCE] : '',
      a[Q.HOTEL_OR_AIRLINE] ? 'Pref. hotel/airline: ' + a[Q.HOTEL_OR_AIRLINE] : '',
      a[Q.SPECIAL] ? 'Requests: ' + a[Q.SPECIAL] : '',
      a[Q.HEARD] ? 'Source: ' + a[Q.HEARD] : '',
    ];
  } else { // CONTACT — website only collects a total, so it goes in Adults and is flagged
    const total = toInt_(a[Q.C_TRAVELLERS]);
    adults = total;
    notes = [
      'Enquiry: ' + v_(a[Q.C_TYPE]),
      total !== '' ? 'Travellers: ' + total + ' (age split not given — counted under Adults)' : '',
      a[Q.C_DETAILS] ? 'Details: ' + a[Q.C_DETAILS] : '',
    ];
  }

  const row = nextEmptyRow_(sh);
  sh.getRange(row, 1, 1, CONFIG.HEADERS.length).setValues([[
    leadId,
    timestamp,
    v_(a[Q.NAME], ''),
    String(v_(a[Q.PHONE] || a[Q.C_PHONE], '')),
    cfg.category,
    adults,
    children,
    infants,
    '=IF(COUNT(F' + row + ':H' + row + ')=0,"",F' + row + '+G' + row + '+H' + row + ')',
    parseDate_(a[Q.TRAVEL_DATE]),
    budget,
    'New Lead',
    '',
    '[Auto] ' + notes.filter(String).join(' | '),
  ]]);
}

/** First empty row, judged by the Lead ID column. Adds more rows when full. */
function nextEmptyRow_(sh) {
  const max = sh.getMaxRows();
  const ids = sh.getRange(2, 1, max - 1, 1).getValues();
  let last = 0;
  for (let i = ids.length - 1; i >= 0; i--) { if (ids[i][0] !== '') { last = i + 1; break; } }
  const row = last + 2;
  if (row > max) {
    sh.insertRowsAfter(max, 500);
    applyRowRules_(sh, max + 1, 500);
  }
  return row;
}

function toInt_(v) {
  if (v === undefined || v === null || String(v).trim() === '') return '';
  const n = parseInt(String(v).trim(), 10);
  return isNaN(n) ? '' : n;
}

function v_(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback === undefined ? '—' : fallback;
  return val;
}

function parseDate_(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : s;
}

function notifyError_(err, e) {
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      '⚠️ Elite Global lead sync failed',
      'A form submission could not be copied to the Central Lead Tracker.\n' +
      'The response is still safe in the form\'s own response spreadsheet — please copy it manually.\n\n' +
      'Error: ' + err + '\n\nStack: ' + (err && err.stack));
  } catch (ignore) { /* mail quota reached — error is still in Executions log */ }
}

// ---------------------------------------------------------------------
// TEST DATA CLEAN-UP
// Submit your test enquiries with a Full Name starting with "TEST",
// then run this to remove them from forms, response sheets and tracker.
// ---------------------------------------------------------------------
function cleanupTestData() {
  const p = PropertiesService.getScriptProperties();
  const isTest = function (name) { return /^\s*TEST/i.test(String(name || '')); };
  let removed = 0;

  // 1. Central tracker
  const tr = SpreadsheetApp.openById(p.getProperty('TRACKER_ID')).getSheetByName(CONFIG.TRACKER_TAB);
  const tv = tr.getRange(2, 3, tr.getMaxRows() - 1, 1).getValues();
  for (let i = tv.length - 1; i >= 0; i--) {
    if (isTest(tv[i][0])) { tr.deleteRow(i + 2); removed++; }
  }
  // keep the grid at full size so formulas/dropdowns remain on every row
  if (tr.getMaxRows() < CONFIG.TRACKER_ROWS) {
    const add = CONFIG.TRACKER_ROWS - tr.getMaxRows();
    const start = tr.getMaxRows() + 1;
    tr.insertRowsAfter(tr.getMaxRows(), add);
    applyRowRules_(tr, start, add);
  }

  // 2. Response spreadsheets + 3. Form responses
  [['SS_VISA_ID', 'FORM_VISA_ID'], ['SS_CUSTOM_ID', 'FORM_CUSTOM_ID'], ['SS_CONTACT_ID', 'FORM_CONTACT_ID']]
    .forEach(function (pair) {
      const ss = SpreadsheetApp.openById(p.getProperty(pair[0]));
      ss.getSheets().forEach(function (sh) {
        if (sh.getLastRow() < 2) return;
        const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
        const col = head.indexOf(Q.NAME) + 1;
        if (!col) return;
        const vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
        for (let i = vals.length - 1; i >= 0; i--) {
          if (isTest(vals[i][0])) { sh.deleteRow(i + 2); removed++; }
        }
      });
      const form = FormApp.openById(p.getProperty(pair[1]));
      form.getResponses().forEach(function (r) {
        const nameResp = r.getItemResponses().filter(function (ir) {
          return ir.getItem().getTitle().trim() === Q.NAME;
        })[0];
        if (nameResp && isTest(nameResp.getResponse())) { form.deleteResponse(r.getId()); removed++; }
      });
    });

  // Restart Lead IDs at 00001 if the tracker is now empty
  if (tr.getRange(2, 1).getValue() === '') p.setProperty('LEAD_SEQ', '0');

  Logger.log('Removed ' + removed + ' test records. ' +
    'Delete any test passport files manually from the forms\' upload folders in Drive.');
}

// ---------------------------------------------------------------------
// INFO / UTILITIES
// ---------------------------------------------------------------------
function collectInfo_() {
  const p = PropertiesService.getScriptProperties();
  const visa = FormApp.openById(p.getProperty('FORM_VISA_ID'));
  const custom = FormApp.openById(p.getProperty('FORM_CUSTOM_ID'));
  const contact = FormApp.openById(p.getProperty('FORM_CONTACT_ID'));
  const ssUrl = function (key) { return SpreadsheetApp.openById(p.getProperty(key)).getUrl(); };

  return [
    ['Google account owner', Session.getEffectiveUser().getEmail()],
    ['Drive folder', DriveApp.getFolderById(p.getProperty('FOLDER_ID')).getUrl()],
    ['', ''],
    ['FORM 1 — Visa Only: PUBLIC respondent URL (website button)', visa.getPublishedUrl()],
    ['Form 1 — editing URL (staff only)', visa.getEditUrl()],
    ['Form 1 — response spreadsheet', ssUrl('SS_VISA_ID')],
    ['', ''],
    ['FORM 2 — Custom Experience: PUBLIC respondent URL (website button)', custom.getPublishedUrl()],
    ['Form 2 — editing URL (staff only)', custom.getEditUrl()],
    ['Form 2 — response spreadsheet', ssUrl('SS_CUSTOM_ID')],
    ['', ''],
    ['FORM 3 — General Contact: PUBLIC respondent URL', contact.getPublishedUrl()],
    ['Form 3 — editing URL (staff only)', contact.getEditUrl()],
    ['Form 3 — response spreadsheet', ssUrl('SS_CONTACT_ID')],
    ['Form 3 — website POST endpoint', contact.getPublishedUrl().replace(/\/viewform.*$/, '/formResponse')],
    ['Form 3 — field entry IDs (for website)', JSON.stringify(contactEntryIds_(contact))],
    ['Form 3 — pre-filled test URL', contactPrefillUrl_(contact)],
    ['', ''],
    ['Central Lead Tracker', ssUrl('TRACKER_ID')],
  ];
}

/** Builds a pre-filled URL (never submitted) to discover Form 3's entry.XXXX IDs. */
function contactPrefillUrl_(form) {
  const r = form.createResponse();
  form.getItems().forEach(function (item) {
    const t = item.getTitle();
    switch (item.getType()) {
      case FormApp.ItemType.TEXT:
        r.withItemResponse(item.asTextItem().createResponse(t === Q.C_TRAVELLERS ? '2' : 'X_' + t.replace(/\W+/g, '_')));
        break;
      case FormApp.ItemType.PARAGRAPH_TEXT:
        r.withItemResponse(item.asParagraphTextItem().createResponse('X_' + t.replace(/\W+/g, '_')));
        break;
      case FormApp.ItemType.LIST:
        r.withItemResponse(item.asListItem().createResponse(item.asListItem().getChoices()[0].getValue()));
        break;
      case FormApp.ItemType.DATE:
        r.withItemResponse(item.asDateItem().createResponse(new Date(2027, 0, 15)));
        break;
    }
  });
  return r.toPrefilledUrl();
}

function contactEntryIds_(form) {
  const url = contactPrefillUrl_(form);
  const query = url.split('?')[1] || '';
  const entries = query.split('&').filter(function (kv) { return kv.indexOf('entry.') === 0; })
    .map(function (kv) { return kv.split('=')[0]; });
  // Pre-filled params come out in item order
  const titles = form.getItems().filter(function (i) {
    return [FormApp.ItemType.TEXT, FormApp.ItemType.PARAGRAPH_TEXT,
      FormApp.ItemType.LIST, FormApp.ItemType.DATE].indexOf(i.getType()) !== -1;
  }).map(function (i) { return i.getTitle(); });
  const map = {};
  titles.forEach(function (t, i) { map[t] = entries[i]; });
  return map;
}

function writeSystemInfo_() {
  const p = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(p.getProperty('TRACKER_ID'));
  const sh = ss.getSheetByName(CONFIG.INFO_TAB) || ss.insertSheet(CONFIG.INFO_TAB);
  const rows = [['Item', 'URL / Value']].concat(collectInfo_());
  sh.clear();
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange(1, 1, 1, 2).setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold');
  sh.setColumnWidth(1, 430); sh.setColumnWidth(2, 700);
  sh.getRange(2, 2, rows.length - 1, 1).setWrap(true);
  sh.protect().setDescription('System info — generated by setup script').setWarningOnly(true);
}

function showSystemInfo() {
  const lines = collectInfo_().map(function (r) { return r[0] ? r[0] + ':\n   ' + r[1] : ''; });
  Logger.log('\n' + lines.join('\n'));
}

function checkOwner_() {
  const me = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (me && me !== CONFIG.EXPECTED_OWNER) {
    throw new Error('You are signed in as ' + me + '. Please run this script while signed in as ' +
      CONFIG.EXPECTED_OWNER + ' so every file is owned by the company account.');
  }
}

/** Only use if you deleted the generated folder and want to rebuild everything. */
function resetSetupFlag() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Setup flag, stored IDs and triggers cleared. You can run setupEliteGlobal() again.');
}
