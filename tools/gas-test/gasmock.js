// Minimal in-memory mock of the Apps Script services used by apps-script/*.gs (tools/gas-test/test.js).
// Usage: const g = require('./gasmock')(projectDir); then call g.ctx.<function>().
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function (dir) {
  const logs = [];
  function Sheet(name, rows, cols) {
    this.name = name; this.rows = rows || 1000; this.cols = cols || 26; this.cells = {}; this.formulas = {}; this.filter = null;
  }
  Sheet.prototype = {
    key(r, c) { return r + ',' + c; },
    get(r, c) { const v = this.cells[this.key(r, c)]; return v === undefined ? '' : v; },
    set(r, c, v) {
      if (r > this.rows || c > this.cols) throw new Error(`write outside grid ${this.name} ${r},${c} (grid ${this.rows}x${this.cols})`);
      if (typeof v === 'string' && v.startsWith('=')) { this.formulas[this.key(r, c)] = v; this.cells[this.key(r, c)] = v; }
      else { delete this.formulas[this.key(r, c)]; this.cells[this.key(r, c)] = v; }
    },
    getName() { return this.name; }, setName(n) { this.name = n; return this; },
    getMaxRows() { return this.rows; }, getMaxColumns() { return this.cols; },
    getLastRow() { let m = 0; for (const k in this.cells) if (this.cells[k] !== '') m = Math.max(m, +k.split(',')[0]); return m; },
    getLastColumn() { let m = 0; for (const k in this.cells) if (this.cells[k] !== '') m = Math.max(m, +k.split(',')[1]); return m; },
    insertRowsAfter(a, n) { this.rows += n; }, insertColumnsAfter(a, n) { this.cols += n; },
    deleteColumns(a, n) { this.cols -= n; },
    deleteRow(r) {
      const next = {};
      for (const k in this.cells) { const [rr, cc] = k.split(',').map(Number); if (rr < r) next[k] = this.cells[k]; else if (rr > r) next[(rr - 1) + ',' + cc] = this.cells[k]; }
      this.cells = next; this.rows--;
    },
    appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, i) => this.set(r, i + 1, v)); },
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); },
    setFrozenRows() {}, setFrozenColumns() {}, setColumnWidth() {}, setRowHeight() {},
    setConditionalFormatRules() {}, getFilter() { return this.filter; },
    protect() { return protection; }, clear() { this.cells = {}; },
  };
  const protection = { setDescription() { return this; }, setWarningOnly() { return this; } };
  function Range(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  const chain = function () { return this; };
  Range.prototype = {
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); o.push(row); } return o; },
    getValue() { return this.sh.get(this.r, this.c); },
    setValues(v) { if (v.length !== this.nr || v[0].length !== this.nc) throw new Error('setValues size mismatch'); v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this; },
    setValue(v) { this.sh.set(this.r, this.c, v); return this; },
    setFormula(f) { this.sh.set(this.r, this.c, f); return this; },
    setFormulaR1C1() { return this; },
    getRow() { return this.r; },
    getNumColumns() { return this.nc; },
    createFilter() { this.sh.filter = { getRange: () => this, remove: () => { this.sh.filter = null; } }; return this.sh.filter; },
    protect() { return protection; },
    createTextFinder(t) {
      const hits = [];
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (String(this.sh.get(this.r + i, this.c + j)) === t) hits.push(new Range(this.sh, this.r + i, this.c + j, 1, 1));
      return { matchEntireCell() { return this; }, findNext: () => hits[0] || null, findAll: () => hits };
    },
    setNumberFormat: chain, setBackground: chain, setFontColor: chain, setFontWeight: chain, setVerticalAlignment: chain,
    setHorizontalAlignment: chain, setWrap: chain, setDataValidation: chain,
    setNote(n) { this.sh.notes = this.sh.notes || {}; this.sh.notes[this.r + ',' + this.c] = n; return this; },
  };
  const ss = { sheets: [], getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; },
    getSheets() { return this.sheets; }, insertSheet(n, pos) { const s = new Sheet(n, 1000, 26); this.sheets.splice(pos === undefined ? this.sheets.length : pos, 0, s); return s; },
    getId() { return 'SSID' }, getUrl() { return 'https://sheet' } };
  const props = {};
  const cache = {};
  const folders = [];
  function Folder(name) { this.name = name; this.id = 'F' + folders.length; this.files = []; this.subs = []; folders.push(this); }
  Folder.prototype = {
    getId() { return this.id; }, getUrl() { return 'https://drive/' + this.id; }, getName() { return this.name; }, setName(n) { this.name = n; },
    createFolder(n) { const f = new Folder(n); this.subs.push(f); return f; },
    getFolders() { let i = 0; const a = this.subs.filter((f) => !f.trashed); return { hasNext: () => i < a.length, next: () => a[i++] }; },
    getFoldersByName(n) { return this.getFolders(); },
    createFile(blob) { const f = { name: blob.name, bytes: blob.bytes, getUrl: () => 'https://file/' + blob.name, setTrashed(t) { this.trashed = t; }, getName: () => blob.name }; this.files.push(f); return f; },
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
    SpreadsheetApp: { openById: () => ss, create: () => { ss.sheets = [new Sheet('Sheet1', 1000, 26)]; return ss; },
      newDataValidation: () => new Proxy({}, { get: (t, k) => (k === 'build' ? () => ({}) : () => t.__p || (t.__p = new Proxy({}, { get: (a, b) => (b === 'build' ? () => ({}) : () => a.__self || (a.__self = new Proxy({}, { get: () => () => ({ build: () => ({}) }) })) ) }))) }),
      newConditionalFormatRule: () => ({}) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    // one shared script cache (like Apps Script), so rate limits persist between calls
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) },
    DriveApp: { getFolderById: (id) => folders.find((f) => f.id === id), createFolder: (n) => new Folder(n), getFileById: () => ({ moveTo() {} }) },
    Utilities: {
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b)),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: (d, tz, pattern) => (pattern === 'd MMM yyyy' ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).replace('Sept', 'Sep') : d.toISOString().slice(0, 10)),
      computeDigest: (alg, v) => Array.from(require('crypto').createHash('sha256').update(String(v)).digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64url'),
      DigestAlgorithm: { SHA_256: 'sha256' },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'test@example.com' }) },
    ScriptApp: { getProjectTriggers: () => [], getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }) },
    MailApp: { sendEmail() {} },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: {} },
    Math, Date, JSON, Object, Array, String, Number, RegExp, Error, Buffer,
  };
  vm.createContext(ctx);
  const files = fs.readdirSync(path.join(dir, 'apps-script')).filter((f) => f.endsWith('.gs'));
  // top-level const declarations must share one scope, so concatenate like Apps Script does
  const src = files.map((f) => fs.readFileSync(path.join(dir, 'apps-script', f), 'utf8')).join('\n;\n') +
    '\n;this.__exports = {' + 'CONFIG, LISTS, COUNTRIES' + '};';
  vm.runInContext(src, ctx, { filename: 'apps-script.gs' });
  return { ctx, ss, props, folders, logs, Sheet, Folder, cache };
};
