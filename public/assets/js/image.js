/*
 * Elite Global — in-browser file checks and image compression for the visa application.
 * Limits match apps-script/Config.gs (CONFIG.LIMITS). Nothing here leaves the device.
 */
window.EG = window.EG || {};
(function () {
  'use strict';
  var KB = 1024, MB = 1024 * 1024;
  var L = window.EG.FILE_LIMITS = {
    PHOTO_MIN: 25 * KB,
    PHOTO_MAX: 50 * KB,
    PASSPORT_IMG_KEEP: Math.round(1.5 * MB), // images above this are re-encoded …
    PASSPORT_IMG_TARGET: 1 * MB,             // … to about this size
    PASSPORT_PDF_MAX: 5 * MB,
    PASSPORT_MAX_SIDE: 2400,
  };

  function userError(msg) { var e = new Error(msg); e.userFacing = true; return e; }

  /** 'pdf' | 'jpg' | 'png' | null, from the first bytes (not the file name). */
  function sniff(blob) {
    return blob.slice(0, 8).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D) return 'pdf';
      if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return 'png';
      return null;
    });
  }

  var MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' };

  /** Decodes an image (EXIF orientation applied), optionally downscaled while decoding. */
  function decode(file, resizeWidth) {
    if (window.createImageBitmap) {
      var opts = { imageOrientation: 'from-image' };
      if (resizeWidth) { opts.resizeWidth = resizeWidth; opts.resizeQuality = 'medium'; }
      return createImageBitmap(file, opts).catch(function () { return decodeWithImg(file); });
    }
    return decodeWithImg(file);
  }

  function decodeWithImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(userError('This image could not be opened. Please choose another file.')); };
      img.src = url;
    });
  }

  function release(src) { if (src && src.close) src.close(); }

  function encode(src, w, h, quality) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // transparent PNG → white, not black
    ctx.drawImage(src, 0, 0, w, h);
    return new Promise(function (resolve) {
      c.toBlob(function (blob) { c.width = c.height = 0; resolve(blob); }, 'image/jpeg', quality);
    });
  }

  /**
   * Re-encodes as JPEG so the result is ≤ maxBytes (and ≥ minBytes when given): binary-searches
   * JPEG quality 0.92→0.4, then shrinks the dimensions by 15% and repeats.
   */
  function compressTo(file, maxBytes, minBytes, maxSide) {
    return decode(file).then(function (src) {
      var w0 = src.width, h0 = src.height;
      var scale = Math.min(1, maxSide / Math.max(w0, h0));
      var best = null;

      function tryScale(attempt) {
        var w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
        var lo = 0.4, hi = 0.92, fit = null, i = 0;
        function step() {
          if (i++ >= 7) return Promise.resolve(fit);
          var q = i === 1 ? hi : (lo + hi) / 2;
          return encode(src, w, h, q).then(function (blob) {
            if (blob.size <= maxBytes) { fit = { blob: blob, q: q }; if (i === 1) return fit; lo = q; }
            else hi = q;
            return step();
          });
        }
        return step().then(function (r) {
          if (r) return r.blob;
          if (attempt >= 14) return null;
          scale *= 0.85;
          return tryScale(attempt + 1);
        });
      }

      return tryScale(0).then(function (blob) {
        release(src);
        if (!blob) throw userError('This image could not be made small enough. Please choose another file.');
        if (minBytes && blob.size < minBytes) {
          throw userError('This photo has too little detail (under 25 KB even at full quality). Please choose a clearer, larger photo.');
        }
        best = blob;
        return best;
      });
    });
  }

  /**
   * Passport photograph: 25–50 KB. Rejects < 25 KB; keeps 25–50 KB as-is (JPG/PNG);
   * compresses anything larger into range. Resolves {blob, type, kb, compressed, originalKb}.
   */
  window.EG.processPhoto = function (file) {
    return sniff(file).then(function (type) {
      if (type !== 'jpg' && type !== 'png') throw userError('The photo must be a real JPG or PNG image.');
      var kb = file.size / KB;
      if (file.size < L.PHOTO_MIN) {
        throw userError('This photo is only ' + kb.toFixed(1) + ' KB. Photos must be at least 25 KB, so please choose a clearer photo.');
      }
      if (file.size <= L.PHOTO_MAX) {
        return { blob: file, type: type, kb: Math.round(kb * 10) / 10, compressed: false, originalKb: kb };
      }
      return compressTo(file, L.PHOTO_MAX, L.PHOTO_MIN, 1200).then(function (blob) {
        return { blob: blob, type: 'jpg', kb: Math.round(blob.size / KB * 10) / 10, compressed: true, originalKb: kb };
      });
    });
  };

  /** Quick check when a passport file is chosen: real type and PDF size. Resolves {type}. */
  window.EG.checkPassport = function (file) {
    return sniff(file).then(function (type) {
      if (!type) throw userError('This file is not a real PDF, JPG or PNG. Please choose the passport scan or photo again.');
      if (type === 'pdf' && file.size > L.PASSPORT_PDF_MAX) {
        throw userError('This PDF is ' + (file.size / MB).toFixed(1) + ' MB. Passport PDFs must be 5 MB or smaller.');
      }
      return { type: type };
    });
  };

  /** Passport file ready to upload: PDFs unchanged; images > 1.5 MB re-encoded to ~1 MB JPEG. */
  window.EG.preparePassport = function (file, type) {
    if (type === 'pdf' || file.size <= L.PASSPORT_IMG_KEEP) return Promise.resolve({ blob: file, type: type });
    return compressTo(file, L.PASSPORT_IMG_TARGET, 0, L.PASSPORT_MAX_SIDE).then(function (blob) {
      return { blob: blob, type: 'jpg' };
    });
  };

  /**
   * Optional flight ticket / hotel booking: real PDF, JPG or PNG; PDF ≤ 5 MB. Resolves {type, large}
   * where large = over the recommended 2 MB (images are compressed when sent, PDFs are not).
   */
  L.DOC_RECOMMENDED = 2 * MB;
  window.EG.checkDocument = function (file) {
    return sniff(file).then(function (type) {
      if (!type) throw userError('This file is not a real PDF, JPG or PNG. Please choose the ticket or booking again.');
      if (type === 'pdf' && file.size > L.PASSPORT_PDF_MAX) {
        throw userError('This PDF is ' + (file.size / MB).toFixed(1) + ' MB. PDFs must be 5 MB or smaller.');
      }
      return { type: type, large: file.size > L.DOC_RECOMMENDED };
    });
  };
  /** Same rules as the passport: PDFs unchanged, images > 1.5 MB re-encoded to ~1 MB JPEG. */
  window.EG.prepareDocument = function (file, type) { return window.EG.preparePassport(file, type); };

  /** Small preview blob (≈160 px wide) so 50 cards don't keep 50 full-size images decoded. */
  window.EG.makeThumb = function (file) {
    return decode(file, 160).then(function (src) {
      var w = src.width, h = src.height;
      if (w > 160) { h = Math.round(h * 160 / w); w = 160; }
      return encode(src, w, h, 0.7).then(function (blob) { release(src); return blob; });
    });
  };

  /** Base64 (no data: prefix) of a blob. */
  window.EG.toBase64 = function (blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).replace(/^data:[^,]*,/, '')); };
      r.onerror = function () { reject(userError('A file could not be read. Please choose it again.')); };
      r.readAsDataURL(blob);
    });
  };

  window.EG.MIME = MIME;
  window.EG.sniff = sniff;
  window.EG.fmtSize = function (bytes) {
    return bytes >= MB ? (bytes / MB).toFixed(1) + ' MB' : (bytes / KB).toFixed(1) + ' KB';
  };
})();
