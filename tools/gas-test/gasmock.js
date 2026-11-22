// Minimal in-memory mock of the Apps Script services used by apps-script/*.gs (tools/gas-test/test.js).
// Mail: g.mail.outbox / g.mail.quota; UrlFetchApp: g.fetch.responses (codes, or 'throw'), g.fetch.calls;
// triggers: g.triggers; time: g.clock.offset (ms added to Date.now()).
// Usage: const g = require('./gasmock')(projectDir); then call g.ctx.<function>().
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function (dir) {
  const logs = [];
  let sheetIds = 0;
  function Sheet(name, rows, cols) {
    this.id = ++sheetIds; this.name = name; this.rows = rows || 1000; this.cols = cols || 26; this.cells = {}; this.formulas = {}; this.filter = null;
  }
  Sheet.prototype = {
    key(r, c) { return r + ',' + c; },
    get(r, c) { const v = this.cells[this.key(r, c)]; return v === undefined ? '' : v; },
    set(r, c, v) {
      if (r > this.rows || c > this.cols) throw new Error(`write outside grid ${this.name} ${r},${c} (grid ${this.rows}x${this.cols})`);
      if (typeof v === 'string' && v.startsWith('=')) { this.formulas[this.key(r, c)] = v; this.cells[this.key(r, c)] = v; }
      else { delete this.formulas[this.key(r, c)]; this.cells[this.key(r, c)] = v; }
    },
    getName() { return this.name; }, setName(n) { this.name = n; return this; }, getSheetId() { return this.id; },
    deleteRows(r, n) { for (let i = 0; i < n; i++) this.deleteRow(r); },
    getConditionalFormatRules() { return this.cfRules || []; },
    getMaxRows() { return this.rows; }, getMaxColumns() { return this.cols; },
    getLastRow() { let m = 0; for (const k in this.cells) if (this.cells[k] !== '') m = Math.max(m, +k.split(',')[0]); return m; },
    getLastColumn() { let m = 0; for (const k in this.cells) if (this.cells[k] !== '') m = Math.max(m, +k.split(',')[1]); return m; },
    insertRowsAfter(a, n) { this.rows += n; },
    // like Sheets: inserted columns copy the data validation of the column they are inserted after
    insertColumnsAfter(a, n) {
      this.cols += n; this.validation = this.validation || {};
      const shifted = {};
      Object.keys(this.validation).forEach((c) => { shifted[+c > a ? +c + n : c] = this.validation[c]; });
      for (let i = 1; i <= n; i++) if (shifted[a]) shifted[a + i] = shifted[a];
      this.validation = shifted;
    },
    checkValid(c, v) {
      const rule = (this.validation || {})[c];
      if (rule && rule.list && v !== '' && v !== null && v !== undefined && rule.list.indexOf(v) === -1) throw new Error(rule.help || 'Invalid value (data validation)');
    },
    deleteColumns(a, n) { this.cols -= n; },
    deleteRow(r) {
      const shift = (obj) => { const next = {}; for (const k in obj) { const [rr, cc] = k.split(',').map(Number); if (rr < r) next[k] = obj[k]; else if (rr > r) next[(rr - 1) + ',' + cc] = obj[k]; } return next; };
      this.cells = shift(this.cells); this.formulas = shift(this.formulas); if (this.notes) this.notes = shift(this.notes); this.rows--;
    },
    hideSheet() { this.hidden = true; return this; }, hideColumns(c) { this.hiddenCols = (this.hiddenCols || []).concat([c]); return this; },
    appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, i) => this.set(r, i + 1, v)); },
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); },
    setFrozenRows() {}, setFrozenColumns() {}, setColumnWidth() {}, setRowHeight() {},
    setConditionalFormatRules(r) { this.cfRules = r; }, getFilter() { return this.filter; },
    protect() { return protection; }, clear() { this.cells = {}; },
  };
  const protection = { setDescription() { return this; }, setWarningOnly() { return this; } };
  function Range(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  const chain = function () { return this; };
  Range.prototype = {
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); o.push(row); } return o; },
    getValue() { return this.sh.get(this.r, this.c); },
    getFormula() { return this.sh.formulas[this.sh.key(this.r, this.c)] || ''; },
    getFormulas() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.formulas[this.sh.key(this.r + i, this.c + j)] || ''); o.push(row); } return o; },
    clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, ''); return this; },
    setValues(v) { if (v.length !== this.nr || v[0].length !== this.nc) throw new Error('setValues size mismatch'); v.forEach((row, i) => row.forEach((x, j) => this.r + i > 1 && this.sh.checkValid(this.c + j, x))); v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this; },
    setValue(v) { if (this.r > 1) this.sh.checkValid(this.c, v); this.sh.set(this.r, this.c, v); return this; },
    setFormula(f) { this.sh.set(this.r, this.c, f); return this; },
    setFormulaR1C1() { return this; },
    getRow() { return this.r; }, getColumn() { return this.c; }, getNumRows() { return this.nr; }, getSheet() { return this.sh; },
    getNumColumns() { return this.nc; },
    // Ctrl+↑ (UP only): from an empty cell → the nearest filled cell above (row 1 if none); from a filled cell → top of its block
    getNextDataCell(dir) {
      if (dir !== 'UP') throw new Error('mock: getNextDataCell UP only');
      const filled = (x) => this.sh.get(x, this.c) !== '';
      let r = this.r;
      if (filled(r)) { while (r > 1 && filled(r - 1)) r--; } else { r--; while (r > 1 && !filled(r)) r--; }
      this.sh.nextDataCalls = (this.sh.nextDataCalls || 0) + 1;
      return new Range(this.sh, Math.max(r, 1), this.c, 1, 1);
    },
    createFilter() { this.sh.filter = { getRange: () => this, remove: () => { this.sh.filter = null; } }; return this.sh.filter; },
    protect() { return protection; },
    createTextFinder(t) {
      const hits = [];
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (String(this.sh.get(this.r + i, this.c + j)) === t) hits.push(new Range(this.sh, this.r + i, this.c + j, 1, 1));
      return { matchEntireCell() { return this; }, findNext: () => hits[0] || null, findAll: () => hits };
    },
    setNumberFormat: chain, setBackground: chain, setFontColor: chain, setFontWeight: chain, setVerticalAlignment: chain,
    setHorizontalAlignment: chain, setWrap: chain,
    setDataValidation(rule) { this.sh.validation = this.sh.validation || {}; for (let j = 0; j < this.nc; j++) this.sh.validation[this.c + j] = rule; return this; },
    clearDataValidations() { return this.setDataValidation(null); },
    getNote() { return ((this.sh.notes || {})[this.r + ',' + this.c]) || ''; },
    setNote(n) { this.sh.notes = this.sh.notes || {}; this.sh.notes[this.r + ',' + this.c] = n; return this; },
  };
  function Spreadsheet(id, name) { this.id = id; this.name = name; this.sheets = []; }
  Spreadsheet.prototype = { getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; },
    getSheets() { return this.sheets; }, insertSheet(n, pos) { const s = new Sheet(n, 1000, 26); this.sheets.splice(pos === undefined ? this.sheets.length : pos, 0, s); return s; },
    getId() { return this.id; }, getUrl() { return 'https://sheet/' + this.id; }, getName() { return this.name; } };
  const ss = new Spreadsheet('SSID', 'tracker');
  const books = { SSID: ss };
  const mail = { outbox: [], quota: 100 };
  const fetch = { responses: [], calls: [] };
  const triggers = [];
  const clock = { offset: 0 };
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + clock.offset); }
    static now() { return RealDate.now() + clock.offset; }
    static [Symbol.hasInstance](x) { return x instanceof RealDate; }
  }
  const triggerBuilder = (handler) => {
    const t = { handler, getHandlerFunction: () => handler };
    const b = new Proxy({}, { get: (o, k) => (k === 'create' ? () => { triggers.push(t); return t; } : () => b) });
    return b;
  };
  const props = {};
  const lockState = { held: false, busy: false }; // busy: tryLock fails (lock timeout)
  const cache = {};
  const folders = [];
  const allFiles = [];
  function Folder(name) { this.name = name; this.id = 'F' + folders.length; this.files = []; this.subs = []; folders.push(this); }
  // Drive file: id, rename, move between folders (moveTo), bin (setTrashed)
  function DFile(blob, parent) { Object.assign(this, { name: blob.name, bytes: blob.bytes, mime: blob.mime, id: 'D' + allFiles.length, parent, created: new MockDate() }); allFiles.push(this); }
  // bytes: signed byte array (base64Decode) or an ASCII string (newBlob of a string); size: fake size override
  const toSigned = (b) => (typeof b === 'string' ? Array.from(Buffer.from(b, 'latin1')).map((x) => (x > 127 ? x - 256 : x)) : b);
  function Blob(bytes, mime, name) { Object.assign(this, { bytes, mime, name }); }
  Blob.prototype = { getBytes() { return toSigned(this.bytes); }, getName() { return this.name; }, setName(n) { this.name = n; return this; },
    getContentType() { return this.mime; } };
  DFile.prototype = {
    getId() { return this.id; }, getName() { return this.name; }, setName(n) { this.name = n; return this; },
    getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; }, setTrashed(t) { this.trashed = t; }, isTrashed() { return !!this.trashed; },
    getSize() { return this.size !== undefined ? this.size : this.bytes.length; }, getMimeType() { return this.mime; },
    getDateCreated() { return this.created; }, getBlob() { return new Blob(this.bytes, this.mime, this.name); },
    moveTo(folder) { this.parent.files.splice(this.parent.files.indexOf(this), 1); folder.files.push(this); this.parent = folder; return this; },
  };
  Folder.prototype = {
    getId() { return this.id; }, getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }, getName() { return this.name; }, setName(n) { this.name = n; },
    createFolder(n) { const f = new Folder(n); this.subs.push(f); return f; },
    getFolders() { let i = 0; const a = this.subs.filter((f) => !f.trashed); return { hasNext: () => i < a.length, next: () => a[i++] }; },
    getFoldersByName(n) { let i = 0; const a = this.subs.filter((f) => !f.trashed && f.name === n); return { hasNext: () => i < a.length, next: () => a[i++] }; },
    createFile(blob) { const f = new DFile(blob, this); this.files.push(f); return f; },
    getFiles() { let i = 0; const a = this.files.filter((f) => !f.trashed); return { hasNext: () => i < a.length, next: () => a[i++] }; },
    setTrashed(t) { this.trashed = t; }, isTrashed() { return !!this.trashed; },
  };
  const ctx = {
    console: { log: (m) => logs.push(m), error: (m) => logs.push('ERR ' + m) },
    Logger: { log: (m) => logs.push(m) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; }, getProperties: () => Object.assign({}, props), setProperties: (o) => Object.assign(props, o),
    }) },
    SpreadsheetApp: { Direction: { UP: 'UP', DOWN: 'DOWN' }, flush() {}, openById: (id) => { if (!books[id]) throw new Error('no spreadsheet ' + id); return books[id]; },
      create: (name) => { const id = 'SS' + Object.keys(books).length; const b = new Spreadsheet(id, name); b.sheets = [new Sheet('Sheet1', 1000, 26)]; books[id] = b; return b; },
      newDataValidation: () => {
        const b = { requireValueInList(l) { b.list = l; return b; }, requireNumberGreaterThanOrEqualTo() { return b; }, requireCheckbox() { b.checkbox = true; return b; },
          setAllowInvalid() { return b; }, setHelpText(h) { b.help = h; return b; }, build() { return b.checkbox ? { checkbox: true } : { list: b.list, help: b.help }; } };
        return b;
      },
      // every builder method returns the builder; build() returns a rule object
      newConditionalFormatRule: () => { const b = new Proxy({}, { get: (o, k) => (k === 'build' ? () => ({}) : () => b) }); return b; } },
    LockService: { getScriptLock: () => ({ tryLock: () => !lockState.busy && (lockState.held = true), releaseLock() { lockState.held = false; }, hasLock: () => lockState.held }) },
    // one shared script cache (like Apps Script), so rate limits persist between calls
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    DriveApp: { getFolderById: (id) => folders.find((f) => f.id === id), createFolder: (n) => new Folder(n), getFileById: (id) => { const f = allFiles.find((x) => x.id === id); if (f) return f; return { moveTo() {} }; } },
    Utilities: {
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b)),
      newBlob: (bytes, mime, name) => new Blob(bytes, mime, name),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64'),
      formatDate: (d, tz, pattern) => (/^d MMM/.test(pattern)
        ? d.toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }, /yyyy/.test(pattern) ? { year: 'numeric' } : {})).replace('Sept', 'Sep') +
          (/HH:mm/.test(pattern) ? ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' }) : '')
        : /^yyyy-MM-dd$/.test(pattern) ? d.toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }) : d.toISOString().slice(0, 10)),
      computeDigest: (alg, v) => Array.from(require('crypto').createHash('sha256').update(String(v)).digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64url'),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeHmacSha256Signature: (v, key) => Array.from(require('crypto').createHmac('sha256', String(key)).update(String(v)).digest()).map((b) => (b > 127 ? b - 256 : b)),
      sleep: () => {},
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'test@example.com' }) },
    ScriptApp: { getProjectTriggers: () => triggers.slice(), newTrigger: (h) => triggerBuilder(h), deleteTrigger: (t) => { triggers.splice(triggers.indexOf(t), 1); },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }) },
    MailApp: {
      getRemainingDailyQuota: () => mail.quota,
      sendEmail(o) { if (mail.quota <= 0) throw new Error('Service invoked too many times for one day: email.'); mail.quota--; mail.outbox.push(o); },
    },
    UrlFetchApp: { fetch(url, o) {
      fetch.calls.push({ url, o }); const r = fetch.responses.length ? fetch.responses.shift() : 201;
      if (r === 'throw') throw new Error('Address unavailable'); return { getResponseCode: () => r, getContentText: () => '{}' };
    } },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: {} },
    Math, Date: MockDate, JSON, Object, Array, String, Number, RegExp, Error, Buffer,
  };
  vm.createContext(ctx);
  const files = fs.readdirSync(path.join(dir, 'apps-script')).filter((f) => f.endsWith('.gs'));
  // top-level const declarations must share one scope, so concatenate like Apps Script does
  const src = files.map((f) => fs.readFileSync(path.join(dir, 'apps-script', f), 'utf8')).join('\n;\n') +
    '\n;this.__exports = {' + 'CONFIG, LISTS, COUNTRIES' + '};';
  vm.runInContext(src, ctx, { filename: 'apps-script.gs' });
  return { ctx, ss, books, props, folders, allFiles, logs, Sheet, Folder, cache, mail, fetch, triggers, clock, lockState };
};
