// 조합ONE(조합원) © 2026 이상호. 모든 권리 보유.
// PM업무관리 웹판 연결부 — 화면(업무관리.html)이 PC 실행기에 보내던 요청(/api/...)과 함께 쓰기 서버 요청을
// 이 브라우저 안에서 대신 받아 줌. 화면 파일은 고치지 않고 이 파일만 맨 위에 넣음.
// 저장: 기본은 이 기기(IndexedDB). 조합ONE 서버(정비업체 칸)는 db/schema-pm.sql 적용 후 PM_SERVER = true.
(function () {
  'use strict';
  var DEMO = /[?&]demo=1(&|$)/.test(location.search); // 체험판: 예시 자료, 이 기기의 체험 칸(pmw_demo)에만 저장
  var PM_SERVER = !DEMO && !!(window.JOHAPONE_CONFIG && window.JOHAPONE_CONFIG.pmServer); // config.js 의 pmServer (db/schema-pm.sql 적용 뒤 true)
  var SUBS = ['01_계약서', '02_공문·인허가', '03_총회·회의', '04_도면·설계', '05_사업수지·분담금', '06_명부·동의서', '07_사진·기타', '08_보고서'];
  var BOX = '문서함/';
  var SORT = [
    ['08_보고서', /보고(서)?[_ .(]|보고$|검토보고|결과보고/],
    ['01_계약서', /계약|협약|용역|근로|위임장/],
    ['03_총회·회의', /총회|회의|회의록|결의|투표|개표|안건|시나리오|대의원|이사회/],
    ['05_사업수지·분담금', /사업수지|분담금|비례율|종전자산|사정조서|감정|예산|재무|결산|공사비/],
    ['06_명부·동의서', /명부|동의서|동의율|동의현황|토지조서|소유자|신분증|등기/],
    ['04_도면·설계', /도면|설계|배치도|지적도|건축개요|조감도|\.dwg$/i],
    ['02_공문·인허가', /공문|고시|인가|승인|허가|신청|구청|시청|군청|통보|회신|사업자등록/],
    ['07_사진·기타', /./]
  ];
  var BAD_EXT = /\.(exe|bat|cmd|com|scr|js|jse|vbs|vbe|ps1|psm1|msi|msp|lnk|url|jar|hta|wsf|wsh|reg|dll|cpl|pif|sys|appx|msix)$/i;
  var p2 = function (x) { return String(x).padStart(2, '0'); };
  var ymdD = function (d) { d = d || new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  var ymd6 = function () { var d = new Date(); return String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate()); };
  var safe = function (s) { return String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^[\s.]+/, '').trim(); };
  var uuid = function () { return crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2); };
  var VENDOR = DEMO ? 'demo' : (function () { try { return localStorage.getItem('pmw_vendor') || 'local'; } catch (e) { return 'local'; } })();

  /* ───────── 저장소: 이 기기 (IndexedDB) ───────── */
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (ok, no) {
      var r = indexedDB.open('pmw_' + VENDOR, 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore('kv'); d.createObjectStore('files'); d.createObjectStore('blobs'); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
    });
    return dbP;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, no) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        var r = fn(s); if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { ok(out); }; t.onerror = function () { no(t.error); };
      });
    });
  }
  var Local = {
    get: function (k) { return tx('kv', 'readonly', function (s) { return s.get(k); }); },
    set: function (k, v) { return tx('kv', 'readwrite', function (s) { return s.put(v, k); }); },
    del: function (k) { return tx('kv', 'readwrite', function (s) { return s.delete(k); }); },
    keys: function (pre) { return tx('kv', 'readonly', function (s) { return s.getAllKeys(); }).then(function (L) { return (L || []).filter(function (k) { return String(k).indexOf(pre) === 0; }); }); },
    files: function () { return tx('files', 'readonly', function (s) { return s.getAll(); }).then(function (L) { return (L || []).filter(function (f) { return !f.del; }); }); },
    fmeta: function (path) { return tx('files', 'readonly', function (s) { return s.get(path); }); },
    fput: function (meta, blob) { return tx('blobs', 'readwrite', function (s) { return s.put(blob, meta.bid); }).then(function () { return tx('files', 'readwrite', function (s) { return s.put(meta, meta.file); }); }); },
    fset: function (meta) { return tx('files', 'readwrite', function (s) { return s.put(meta, meta.file); }); },
    frm: function (path) { return tx('files', 'readwrite', function (s) { return s.delete(path); }); },
    blob: function (bid) { return tx('blobs', 'readonly', function (s) { return s.get(bid); }); }
  };

  /* ───────── 저장소: 조합ONE 서버 (정비업체 칸) — db/schema-pm.sql 적용 뒤 ───────── */
  var Server = (function () {
    var C = null, V = null;
    function client() {
      if (C) return Promise.resolve(C);
      var cfg = window.JOHAPONE_CONFIG || {};
      return loadJs('https://cdnjs.cloudflare.com/ajax/libs/supabase-js/2.45.4/supabase.min.js', 'supabase').then(function () {
        C = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); return C;
      });
    }
    function vendor() {
      if (V) return Promise.resolve(V);
      return client().then(function (c) { return c.auth.getSession(); }).then(function (r) {
        if (!r.data.session) throw new Error('조합ONE에 로그인한 뒤 열어 주세요');
        return C.rpc('pm_my_vendor');
      }).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        if (r.data) { V = r.data; return V; }
        // 처음: 초대 코드로 합류하거나 업체 칸 만들기
        var code = window.prompt('정비업체판 처음 쓰기\n\n직원이면 대표에게 받은 초대 코드를 넣어 주세요.\n대표(업체 칸을 새로 만들 분)는 비워 두고 「확인」을 누르세요.', '');
        if (code === null) throw new Error('업체 칸이 아직 없습니다');
        var p = code.trim() ? C.rpc('pm_join', { p_code: code.trim() }) : (function () {
          var nm = window.prompt('업체 이름을 넣어 주세요 (예: OO정비)', '');
          if (!nm || !nm.trim()) throw new Error('업체 이름이 없어 만들지 않았습니다');
          return C.rpc('pm_create_vendor', { p_name: nm.trim() }).then(function (x) { if (x.error) throw new Error(x.error.message); throw new Error('업체 칸 신청을 받았습니다. 운영자 확인 뒤 열립니다 — 승인되면 다시 열어 주세요.'); });
        })();
        return p.then(function (x) { if (x.error) throw new Error(x.error.message); V = x.data; return V; });
      });
    }
    function q(fn) { return vendor().then(function (v) { return fn(C, v); }); }
    function chk(r) { if (r.error) throw new Error(r.error.message); return r.data; }
    return {
      pilog: function (who, what) { return q(function (c, v) { return c.from('pm_pilog').insert({ vendor_id: v, who: who, what: what }).then(chk); }); },
      get: function (k) { return q(function (c, v) { return c.from('pm_kv').select('v').eq('vendor_id', v).eq('k', k).maybeSingle().then(chk).then(function (d) { return d ? d.v : undefined; }); }); },
      set: function (k, val) { return q(function (c, v) { return c.from('pm_kv').upsert({ vendor_id: v, k: k, v: val, updated_at: new Date().toISOString() }).then(chk); }); },
      del: function (k) { return q(function (c, v) { return c.from('pm_kv').delete().eq('vendor_id', v).eq('k', k).then(chk); }); },
      keys: function (pre) { return q(function (c, v) { return c.from('pm_kv').select('k').eq('vendor_id', v).like('k', pre.replace(/[%_]/g, '\\$&') + '%').then(chk).then(function (L) { return L.map(function (x) { return x.k; }); }); }); },
      files: function () { return q(function (c, v) { return c.from('pm_files').select('meta').eq('vendor_id', v).then(chk).then(function (L) { return L.map(function (x) { return x.meta; }).filter(function (f) { return !f.del; }); }); }); },
      fmeta: function (path) { return q(function (c, v) { return c.from('pm_files').select('meta').eq('vendor_id', v).eq('path', path).maybeSingle().then(chk).then(function (d) { return d ? d.meta : undefined; }); }); },
      fput: function (meta, blob) { return q(function (c, v) { return c.storage.from('pmfiles').upload(v + '/' + meta.bid, blob, { contentType: blob.type || 'application/octet-stream' }).then(chk).then(function () { return c.from('pm_files').upsert({ vendor_id: v, path: meta.file, meta: meta }).then(chk); }); }); },
      fset: function (meta) { return q(function (c, v) { return c.from('pm_files').upsert({ vendor_id: v, path: meta.file, meta: meta }).then(chk); }); },
      frm: function (path) { return q(function (c, v) { return c.from('pm_files').delete().eq('vendor_id', v).eq('path', path).then(chk); }); },
      invite: function () { return q(function (c) { return c.rpc('pm_make_invite').then(chk); }); },
      blob: function (bid) { return q(function (c, v) { return c.storage.from('pmfiles').download(v + '/' + bid).then(chk); }); }
    };
  })();
  var S = PM_SERVER ? Server : Local;

  /* ───────── 도구 불러오기 ───────── */
  var jsP = {};
  function loadJs(src, glob) {
    if (glob && window[glob]) return Promise.resolve();
    if (jsP[src]) return jsP[src];
    jsP[src] = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { delete jsP[src]; no(new Error('도구를 불러오지 못했습니다 (인터넷 연결 확인)')); }; document.head.appendChild(s); });
    return jsP[src];
  }
  var XL = function () { return loadJs('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX').then(function () { return window.XLSX; }); };
  var ZIP = function () { return loadJs('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip').then(function () { return window.JSZip; }); };
  var PDF = function () { return loadJs('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib').then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; return window.pdfjsLib; }); };

  /* ───────── 문서함 ───────── */
  function norm(f) { f = String(f || '').replace(/\\/g, '/'); var i = f.indexOf(BOX); return i >= 0 ? f.slice(i) : f; }
  function siteOf(path) { return norm(path).slice(BOX.length).split('/')[0]; }
  function mkPath(site, sub, dir, name) { return BOX + safe(site) + '/' + (sub && sub !== '(바로 넣은 파일)' ? sub + '/' : '') + (dir ? dir + '/' : '') + name; }
  function siteFiles(site) {
    return S.files().then(function (L) {
      return L.filter(function (f) { return f.site === site; }).map(pub).sort(function (a, b) { return a.sub.localeCompare(b.sub) || b.date.localeCompare(a.date); });
    });
  }
  function pub(f) { return { sub: f.sub, dir: f.dir || '', name: f.name, file: f.file, date: f.date, size: f.size }; }
  function freeName(site, sub, dir, name, taken) {
    var ext = (name.match(/\.[^.]+$/) || [''])[0], base = name.slice(0, name.length - ext.length), out = name;
    for (var i = 2; taken[mkPath(site, sub, dir, out)]; i++) out = base + ' (' + i + ')' + ext;
    return out;
  }
  function putFile(site, sub, dir, name, blob, opt) {
    opt = opt || {};
    name = safe(name).slice(0, 150); site = safe(site);
    if (!site) return Promise.resolve({ ok: false, msg: '현장 이름이 없습니다' });
    if (!name) return Promise.resolve({ ok: false, msg: '파일 이름이 없습니다' });
    if (BAD_EXT.test(name)) return Promise.resolve({ ok: false, msg: '실행 파일은 넣지 않습니다' });
    if (sub && sub !== '(바로 넣은 파일)' && /[\\/:*?"<>|]|^\.|\.\./.test(sub)) return Promise.resolve({ ok: false, msg: '칸 이름이 잘못되었습니다' });
    return S.files().then(function (L) {
      var taken = {}; L.forEach(function (f) { taken[f.file] = 1; });
      if (opt.noOverwrite && taken[mkPath(site, sub, dir, name)]) return { ok: false, exists: true, file: mkPath(site, sub, dir, name) };
      var nm = freeName(site, sub, dir, name, taken), meta = { file: mkPath(site, sub, dir, nm), site: site, sub: sub || '(바로 넣은 파일)', dir: dir || '', name: nm, date: ymdD(), size: blob.size, type: blob.type || '', bid: uuid() };
      return S.fput(meta, blob).then(function () { return { ok: true, file: meta.file, name: nm, size: blob.size }; });
    });
  }
  function getBlob(path) { return S.fmeta(norm(path)).then(function (m) { if (!m || m.del) throw new Error('파일이 없습니다'); return S.blob(m.bid).then(function (b) { return { meta: m, blob: b }; }); }); }
  function openBlob(name, blob) {
    var u = URL.createObjectURL(blob);
    if (/\.(pdf|png|jpe?g|gif|webp|txt|html?|csv|json)$/i.test(name)) { var w = window.open(u, '_blank'); if (!w) dl(u, name); }
    else dl(u, name);
    setTimeout(function () { URL.revokeObjectURL(u); }, 120000);
  }
  function dl(u, name) { var a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function blobOf(x, type) { return x instanceof Blob ? x : new Blob([x == null ? '' : x], { type: type || 'text/plain' }); }
  function textOf(b) { return b instanceof Blob ? b.text() : Promise.resolve(String(b || '')); }

  /* ───────── 명부 집계 (명부집계.py 옮김) ───────── */
  var s_ = function (v) { return v == null ? '' : String(v).trim(); };
  function readRows(blob) {
    return XL().then(function (X) {
      return blob.arrayBuffer().then(function (ab) {
        var wb = X.read(new Uint8Array(ab), { type: 'array', cellDates: true }), best = null, bn = -1;
        wb.SheetNames.forEach(function (n) { var ws = wb.Sheets[n]; if (!ws['!ref']) return; var r = X.utils.decode_range(ws['!ref']); if (r.e.r > bn) { bn = r.e.r; best = n; } });
        var ws = wb.Sheets[best], rg = X.utils.decode_range(ws['!ref']); rg.s.r = 0; rg.s.c = 0;
        return { wb: wb, sheet: best, rows: X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null, blankrows: true, range: rg }) };
      });
    });
  }
  function findCols(rows) {
    var c = { no: 1, name: 9, birth: 10, land: 21, unit: 23, bld: 24, agree: 45, dong: 4, jibun: 5, bname: 6, tel: 17 };
    rows.slice(0, 6).forEach(function (r) { (r || []).forEach(function (v, i) {
      var t = s_(v).replace(/\s/g, '');
      if (t === '조합원번호') c.no = i; else if (t === '성명' || t === '소유자') c.name = i; else if (t === '주민번호' || t === '생년월일') c.birth = i;
      else if (t === '동의서') c.agree = i; else if (/^(토지면적|편입면적|소유면적|지분면적|대지권면적|소유토지면적)(\(㎡\))?$/.test(t)) c.area = i; else if (t === '행정동') c.dong = i; else if (t === '지번') c.jibun = i; else if (t === '건물명') c.bname = i; else if (t === '연락처1') c.tel = i;
    }); });
    return c;
  }
  function pad60(r) { r = (r || []).slice(); while (r.length < 60) r.push(null); return r; }
  function startRow(rows) { for (var i = 0; i < rows.length; i++) if (/^\d+$/.test(s_((rows[i] || [])[0]))) return i; return 4; }
  function tally(rows, path) {
    var C = findCols(rows), start = startRow(rows), groups = {}, order = [], cur = null, skipped = [], noBirth = [], oddMark = [];
    for (var i = start; i < rows.length; i++) {
      var r = pad60(rows[i]);
      if (!s_(r[0]) && !s_(r[C.name])) continue;
      var no = s_(r[C.no]); if (no) cur = no; if (cur == null) continue;
      var line = r.slice(0, 60).map(s_).join(' ');
      if (line.indexOf('소유권대지권') >= 0) { skipped.push({ row: i + 1, no: cur, name: s_(r[C.name]) }); continue; }
      if (!groups[cur]) { groups[cur] = []; order.push(cur); }
      var nm0 = s_(r[C.name]), bt0 = s_(r[C.birth]), mk0 = s_(r[C.agree]);
      if (nm0 && !bt0) noBirth.push({ row: i + 1, no: cur, name: nm0 });
      if (!nm0) noBirth.push({ row: i + 1, no: cur, name: '(이름 없음)' });
      if (mk0 && /미|철회|반대|불|[xX×]|취소|보류/.test(mk0)) oddMark.push({ row: i + 1, no: cur, name: nm0, v: mk0.slice(0, 20) });
      var dong = s_(r[C.dong]), jb = s_(r[C.jibun]), bn = s_(r[C.bname]);
      groups[cur].push({ row: i + 1, ar: C.area != null ? (+String(s_(r[C.area])).replace(/[^\d.]/g, '') || 0) : 0, name: nm0, birth: bt0.slice(0, 6), land: !!s_(r[C.land]) || !!s_(r[C.unit]), bld: !!s_(r[C.bld]), ok: !!mk0,
        addr: [dong, jb, bn].filter(Boolean).join(' '), tel: s_(r[C.tel]), place: bn || [dong, jb].filter(Boolean).join(' ') });
    }
    var tot = 0, agree = 0, arT = 0, arA = 0, kind = { '토지+건물': [0, 0], '토지만': [0, 0], '건물만': [0, 0] }, mixed = [], who = {}, nag = [], pplAll = {}, by = {};
    order.forEach(function (no) {
      var g = groups[no]; if (!g.length) return; tot++;
      var ppl = {}; g.forEach(function (x) { var k = x.name + '|' + x.birth; ppl[k] = (ppl[k] || false) || x.ok; });
      var pk = Object.keys(ppl), ok = pk.every(function (k) { return ppl[k]; }); if (ok) agree++;
      var ga = 0; g.forEach(function (x) { ga += x.ar || 0; }); arT += ga; if (ok) arA += ga;
      var pl = (g.filter(function (x) { return x.place; })[0] || {}).place || '(소재지 없음)'; by[pl] = by[pl] || { t: 0, a: 0, na: [] }; by[pl].t++; if (ok) by[pl].a++; else by[pl].na.push(no);
      pk.forEach(function (k) { pplAll[k] = { no: no, ok: ppl[k] }; });
      if (!ok) nag.push({ no: no, names: uniqSort(pk.filter(function (k) { return !ppl[k]; }).map(function (k) { return k.split('|')[0]; })), all: pk.length,
        addr: (g.filter(function (x) { return x.addr; })[0] || {}).addr || '', tel: (g.filter(function (x) { return x.tel; })[0] || {}).tel || '' });
      var L = g.some(function (x) { return x.land; }), B = g.some(function (x) { return x.bld; }), k2 = L && B ? '토지+건물' : (B ? '건물만' : '토지만');
      kind[k2][0]++; if (ok) kind[k2][1]++;
      if (!ok && pk.some(function (k) { return ppl[k]; })) mixed.push({ no: no, names: uniqSort(pk.filter(function (k) { return !ppl[k]; }).map(function (k) { return k.split('|')[0]; })) });
      uniqSort(g.filter(function (x) { return x.name; }).map(function (x) { return x.name + '|' + x.birth; })).forEach(function (p) { (who[p] = who[p] || []).push(no); });
    });
    var dup = Object.keys(who).filter(function (p) { var b = p.split('|')[1]; return who[p].length > 1 && b && b !== '*'; }).map(function (p) { return { name: p.split('|')[0], birth: p.split('|')[1], nos: who[p] }; });
    var sig = {}; order.forEach(function (no) { var ppl = uniqSort(groups[no].filter(function (x) { return x.name; }).map(function (x) { return x.name + '|' + x.birth; })); if (ppl.length > 1) (sig[ppl.join('§')] = sig[ppl.join('§')] || []).push(no); });
    var sameSet = Object.keys(sig).filter(function (k) { return sig[k].length > 1; }).map(function (k) { return { names: k.split('§').map(function (p) { return p.split('|')[0]; }), nos: sig[k] }; });
    var nums = order.filter(function (n) { return /^\d+$/.test(n); }).map(Number).sort(function (a, b) { return a - b; }), set = {}; nums.forEach(function (n) { set[n] = 1; });
    var gaps = []; if (nums.length) for (var n = 1; n <= nums[nums.length - 1]; n++) if (!set[n]) gaps.push(n);
    var byA = Object.keys(by).map(function (k) { return { k: k, t: by[k].t, a: by[k].a, na: by[k].na }; }).sort(function (a, b) { return (b.na.length - a.na.length) || (b.t - a.t); }).slice(0, 300);
    return { file: path, total: tot, agree: agree, areaT: C.area != null ? Math.round(arT * 10) / 10 : null, areaA: C.area != null ? Math.round(arA * 10) / 10 : null, rate: tot ? Math.round(agree * 10000 / tot) / 100 : 0, kind: kind, lastNo: nums.length ? nums[nums.length - 1] : 0, gaps: gaps.slice(0, 50), gapCount: gaps.length,
      skipped: skipped, mixed: mixed.slice(0, 80), dupPerson: dup.slice(0, 80), sameSet: sameSet.slice(0, 80), notAgree: nag, people: pplAll, noBirth: noBirth.slice(0, 100), oddMark: oddMark.slice(0, 100), byAddr: byA };
  }
  function uniqSort(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }).sort(); }
  function isXl(p) { return /\.xls[xm]?$/i.test(p); }
  function countFile(path) { return getBlob(path).then(function (g) { return readRows(g.blob).then(function (R) { return tally(R.rows, norm(path)); }); }); }
  function xlBlob(X, wb, type) { return new Blob([X.write(wb, { bookType: type || 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); }
  function dirOf(path) { var p = norm(path).slice(BOX.length).split('/'); return { site: p[0], sub: p.length > 2 ? p[1] : '(바로 넣은 파일)', dir: p.length > 3 ? p.slice(2, -1).join('/') : '', name: p[p.length - 1] }; }

  /* ───────── 기초자료 읽기 (기초자료읽기.py 옮김) ───────── */
  function scanText(name, blob) {
    var x = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (/\.(xlsx|xlsm|xls|csv)$/.test(x)) return XL().then(function (X) { return blob.arrayBuffer().then(function (ab) {
      var wb = X.read(new Uint8Array(ab), { type: 'array' }), out = [];
      wb.SheetNames.slice(0, 15).forEach(function (n) { X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).slice(0, 3000).forEach(function (r) { var v = r.map(String).filter(function (c) { return c.trim(); }); if (v.length) out.push(v.join(' | ')); }); });
      return out.join('\n'); }); });
    if (x === '.pdf') return PDF().then(function (P) { return blob.arrayBuffer().then(function (ab) { return P.getDocument({ data: ab }).promise; }).then(function (doc) {
      var L = [], n = Math.min(doc.numPages, 60), ch = Promise.resolve();
      for (var i = 1; i <= n; i++) (function (i) { ch = ch.then(function () { return doc.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { L.push(tc.items.map(function (t) { return t.str; }).join(' ')); }); }); })(i);
      return ch.then(function () { return L.join('\n'); }); }); });
    if (x === '.hwpx') return ZIP().then(function (Z) { return Z.loadAsync(blob); }).then(function (z) {
      var ns = Object.keys(z.files).filter(function (n) { return /^Contents\/section\d+\.xml$/.test(n); }).sort();
      return Promise.all(ns.map(function (n) { return z.file(n).async('string'); })).then(function (L) { return L.map(function (t) { return t.replace(/<\/hp:p>/g, '\n').replace(/<[^>]+>/g, ' '); }).join('\n'); }); });
    if (x === '.hwp') return Promise.resolve(null);
    return blob.arrayBuffer().then(function (ab) { try { return new TextDecoder('utf-8', { fatal: true }).decode(ab); } catch (e) { try { return new TextDecoder('euc-kr').decode(ab); } catch (e2) { return new TextDecoder().decode(ab); } } });
  }
  function scan(name, blob) {
    return scanText(name, blob).then(function (t) {
      if (t == null) return { ok: false, msg: '예전 한글(.hwp)은 읽을 수 없습니다 — 한글에서 hwpx로 저장해서 올려 주세요' };
      t = t.replace(/[ \t　]+/g, ' ');
      var R = {}, why = {}, num = function (v) { var n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; };
      var first = function (pats, conv) {
        for (var i = 0; i < pats.length; i++) { var re = new RegExp(pats[i].source, 'g'), m; while ((m = re.exec(t))) { var v = conv(m); if (v) { return [v, t.slice(Math.max(0, m.index - 15), Math.min(t.length, m.index + m[0].length + 10)).replace(/\s+/g, ' ').trim()]; } if (m[0] === '') re.lastIndex++; } }
        return [null, ''];
      };
      var r = first([/(정비\s*구역\s*면적|구역\s*면적|사업\s*면적|편입\s*면적|대지\s*면적)[^\d\n]{0,25}([\d,]+\.?\d*)\s*(㎡|m2|㎥|평)/], function (m) { var v = num(m[2]); if (!v) return null; if (m[3] === '평') v *= 3.3058; return v >= 1000 && v <= 3000000 ? Math.round(v * 10) / 10 : null; });
      if (r[0]) { R.area = r[0]; why.area = r[1]; }
      r = first([/(총\s*세대\s*수?|계획\s*세대\s*수?|건립\s*세대\s*수?|공급\s*세대\s*수?|세대\s*수)[^\d\n]{0,20}([\d,]+)\s*세대?/, /(규모|총)[^\d\n]{0,25}([\d,]+)\s*세대/], function (m) { var v = num(m[2]); return v && v >= 20 && v <= 20000 ? Math.floor(v) : null; });
      if (r[0]) { R.units = r[0]; why.units = r[1]; }
      r = first([/(토지\s*등\s*소유자|조합원)(\s*수|\s*총수)?[^\d\n]{0,20}([\d,]+)\s*(명|인)/], function (m) { var v = num(m[3]); return v && v >= 5 && v <= 20000 ? Math.floor(v) : null; });
      if (r[0]) { R.owners = r[0]; why.owners = r[1]; }
      r = first([/종전\s*자산[^\d\n]{0,30}?([\d,]+\.?\d*)\s*(억원|억|백만원|천원|원)/], function (m) { var v = num(m[1]); var k = { '억': 1, '억원': 1, '백만원': 0.01, '천원': 0.00001, '원': 1e-8 }[m[2]]; if (!v || k == null) return null; v *= k; return v >= 5 && v <= 500000 ? Math.round(v * 10) / 10 : null; });
      if (r[0]) { R.old = r[0]; why.old = r[1]; }
      var m = /(대지\s*위치|사업\s*위치|구역\s*위치|소재지|위\s*치)\s*[:：|]?\s*([가-힣][^\n|]{3,40})/.exec(t);
      if (m) { var a = m[2].split(/\s{2,}|[,(]|일원|일대/)[0].trim(); if (/(시|도|구|군)/.test(a)) { R.addr = a; why.addr = m[0].replace(/\s+/g, ' ').slice(0, 60); } }
      var A = (t.match(/재건축/g) || []).length, B = (t.match(/재개발/g) || []).length; if (A || B) R.kind = A > B ? '재건축' : '재개발';
      return { ok: true, chars: t.length, found: R, why: why };
    });
  }

  /* ───────── 한글 파일 (비례율한글.py · 회의록한글.py 옮김) ───────── */
  var W = 42520, NID = 1000000001;
  var nid = function () { return String(++NID); };
  var xe = function (t) { return String(t == null ? '' : t).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/\r/g, '').replace(/\t/g, ' ').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var TC_SUB = '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="%V" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">';
  function tblWrap(pb, rowsXml, nRows, nCols, height, repeat, inM) {
    return '<hp:p id="' + nid() + '" paraPrIDRef="0" styleIDRef="0" pageBreak="' + (pb ? 1 : 0) + '" columnBreak="0" merged="0"><hp:run charPrIDRef="0">' +
      '<hp:tbl id="' + nid() + '" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="' + repeat + '" rowCnt="' + nRows + '" colCnt="' + nCols + '" cellSpacing="0" borderFillIDRef="3" noAdjust="0">' +
      '<hp:sz width="' + W + '" widthRelTo="ABSOLUTE" height="' + height + '" heightRelTo="ABSOLUTE" protect="0"/>' +
      '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
      '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="340" right="340" top="' + inM + '" bottom="' + inM + '"/>' + rowsXml + '</hp:tbl></hp:run><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p>';
  }
  // 회의록
  function mRuns(parts) { var o = parts.map(function (p) { var t = xe(p[0]); return '<hp:run charPrIDRef="' + p[1] + '">' + (t ? '<hp:t>' + t + '</hp:t>' : '<hp:t/>') + '</hp:run>'; }).join(''); return o || '<hp:run charPrIDRef="0"><hp:t/></hp:run>'; }
  function mPara(parts, pp) { if (typeof parts === 'string') parts = [[parts, 0]]; return '<hp:p id="' + nid() + '" paraPrIDRef="' + (pp || 0) + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' + mRuns(parts) + '</hp:p>'; }
  function mCell(c, col, row, w, h, hdr) {
    var lines = xeRaw(c.t).split('\n'), ch = c.s ? 11 : (c.b ? 9 : 0), pp = c.c ? 21 : 22;
    var ps = lines.map(function (ln) { return '<hp:p id="' + nid() + '" paraPrIDRef="' + pp + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' + mRuns([[ln, ch]]) + '</hp:p>'; }).join('');
    return '<hp:tc name="" header="' + (hdr ? 1 : 0) + '" hasMargin="1" protect="0" editable="0" dirty="1" borderFillIDRef="' + (c.sh ? 4 : 3) + '">' + TC_SUB.replace('%V', c.top ? 'TOP' : 'CENTER') + ps + '</hp:subList>' +
      '<hp:cellAddr colAddr="' + col + '" rowAddr="' + row + '"/><hp:cellSpan colSpan="' + (c.cs || 1) + '" rowSpan="1"/><hp:cellSz width="' + w + '" height="' + h + '"/><hp:cellMargin left="340" right="340" top="100" bottom="100"/></hp:tc>';
  }
  function xeRaw(t) { return String(t == null ? '' : t); }
  function mTable(rows, widths, head) {
    var trs = '', tot = 0;
    rows.forEach(function (rw, ri) { var ci = 0, tcs = ''; rw[1].forEach(function (c) { var cs = c.cs || 1, w = widths.slice(ci, ci + cs).reduce(function (a, b) { return a + b; }, 0); tcs += mCell(c, ci, ri, w, rw[0], head && ri === 0); ci += cs; }); trs += '<hp:tr>' + tcs + '</hp:tr>'; tot += rw[0]; });
    return tblWrap(false, trs, rows.length, widths.length, tot, head ? 1 : 0, 100);
  }
  function mSec(t, sub) { return mPara([[t, 13]].concat(sub ? [['   ' + sub, 11]] : []), 27); }
  function mH() { return [].slice.call(arguments).map(function (x) { return { t: x, b: 1, c: 1, sh: 1 }; }); }
  function mtgBody(d) {
    var out = [], n = 1, blank = !!d.blank, rep = function (a, k) { var o = []; for (var i = 0; i < k; i++) o.push(a); return o; };
    out.push(mPara([[d.org || '                         구역  정비사업', 13]], 20));
    out.push(mPara([[(d.title || '제      차                      회의록') + ' (약식)', 7]], 20));
    var who = d.who || [], past = d.past, wl = who.length ? who.map(function (w) { return (past ? '· ' : '□ ') + w; }).join('   ') + (past ? '' : '   □ ______________') : rep('□ ______________', 6).join('   ');
    out.push(mTable([
      [1500, [{ t: '일  시', b: 1, c: 1, sh: 1 }, { t: d.when || '' }, { t: '장  소', b: 1, c: 1, sh: 1 }, { t: d.place || '' }]],
      [1500, [{ t: '참  석', b: 1, c: 1, sh: 1 }, { t: wl, s: 1, cs: 3 }]],
      [1500, [{ t: '작  성', b: 1, c: 1, sh: 1 }, { t: '' }, { t: '확  인', b: 1, c: 1, sh: 1 }, { t: '' }]]
    ], [5200, 16060, 5200, 16060]));
    var pv = d.prev;
    if (pv || blank) {
      var L = (pv || {}).todo || [];
      out.push(mSec(n + '. 지난 회의 할 일 확인', pv && pv.label ? '— ' + pv.label : ''));
      var rows = [[1200, mH('번호', '할 일', '담당', '기한', '결과')]];
      (L.length ? L : rep(['', '', ''], 3)).forEach(function (r, i) { rows.push([1200, [{ t: String(i + 1), c: 1, s: 1 }, { t: r[0], s: 1 }, { t: r[1], s: 1, c: 1 }, { t: r[2], s: 1, c: 1 }, { t: '' }]]); });
      out.push(mTable(rows, [2200, 24800, 6120, 5000, 4400], true)); n++;
    }
    var ag = d.agenda || [], talk = d.talk || [];
    out.push(mSec(n + '. 안건 및 논의 내용')); n++;
    if (talk.length) {
      if (ag.length) out.push(mPara([['안건  ', 9], [ag.map(function (a, i) { return (i + 1) + ') ' + a; }).join('   '), 0]], 0));
      talk.forEach(function (ln) { if (ln.indexOf('■') === 0) out.push(mPara([[ln.replace(/^■+/, '').trim(), 9]], 0)); else out.push(mPara([['· ' + ln.replace(/^[-·•]+/, '').trim(), 0]], 24)); });
    } else {
      var rw = [[1300, mH('번호', '안건', '논의 내용 (적는 칸)')]], A = ag.length ? ag : rep('', 4);
      A.forEach(function (a, i) { rw.push([2400, [{ t: String(i + 1), c: 1 }, { t: a }, { t: '', top: 1 }]]); });
      rw.push([1700, [{ t: String(A.length + 1), c: 1 }, { t: '기타' }, { t: '', top: 1 }]]);
      out.push(mTable(rw, [2200, 17000, 23320], true));
    }
    var dc = d.decide || [];
    out.push(mSec(n + '. 결정 사항 · 남은 문제')); n++;
    out.push(mTable(dc.length ? dc.map(function (x, i) { return [1300, [{ t: String(i + 1), c: 1 }, { t: x }]]; }) : [0, 1, 2].map(function (i) { return [1500, [{ t: String(i + 1), c: 1 }, { t: '' }]]; }), [2200, 40320]));
    var td = d.todo || [];
    out.push(mSec(n + '. 할 일 (다음 회의까지)')); n++;
    var tr = [[1300, mH('번호', '할 일', '담당', '기한')]];
    td.forEach(function (r, i) { tr.push([1300, [{ t: String(i + 1), c: 1 }, { t: r[0] }, { t: r[1], c: 1 }, { t: r[2], c: 1 }]]); });
    for (var i = td.length; i < (td.length ? td.length : 4); i++) tr.push([1500, [{ t: String(i + 1), c: 1 }, { t: '' }, { t: '' }, { t: '' }]]);
    out.push(mTable(tr, [2200, 26720, 7600, 6000], true));
    out.push(mSec(n + '. 다음 회의'));
    out.push(mPara([[d.next || '일시:                              장소:                              주요 안건:', 0]], 0));
    out.push(mPara([['※ 약식 회의록입니다. 결정 사항과 할 일은 참석자 확인을 받아 보관합니다.' + (d.made ? '    만든 날 ' + d.made : ''), 11]], 0));
    return out.join('');
  }
  // 비례율 인쇄 화면(html) → 한글
  function rtBody(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html'), blocks = [], newpage = false, secs = 0;
    function runsOf(el, base) { var out = []; (function walk(n, b, m) { n.childNodes.forEach(function (c) {
      if (c.nodeType === 3) { var t = c.nodeValue.replace(/[ \t\r\n]+/g, ' '); if (t) out.push([t, b, m]); return; }
      if (c.nodeType !== 1) return; var tg = c.tagName.toLowerCase(); if (/^(button|style|script|title)$/.test(tg)) return;
      if (tg === 'br') { out.push(['\n', 0, 0]); return; }
      walk(c, b || tg === 'b' || tg === 'strong', m || tg === 'small');
    }); })(el, false, false); return out; }
    function visit(n) {
      n.childNodes.forEach(function (c) {
        if (c.nodeType !== 1) return; var tg = c.tagName.toLowerCase(), cls = c.getAttribute('class') || '';
        if (/^(button|style|script|title)$/.test(tg)) return;
        if (tg === 'section') { if (secs) newpage = true; secs++; visit(c); return; }
        if (tg === 'table') {
          var rows = [].map.call(c.querySelectorAll('tr'), function (tr) { return [].map.call(tr.children, function (td) { return { h: td.tagName === 'TH', r: /(^|\s)r(\s|$)/.test(td.getAttribute('class') || ''), cs: +(td.getAttribute('colspan') || 1), runs: runsOf(td) }; }); }).filter(function (r) { return r.length; });
          if (rows.length) { blocks.push({ k: 'tbl', rows: rows, cls: cls, pb: newpage }); newpage = false; } return;
        }
        if (/^(h1|h2|h3|p|div)$/.test(tg)) {
          if (tg === 'div' && c.querySelector('table,h1,h2,h3,p,div,section')) { visit(c); return; }
          var R = runsOf(c);
          if (tg === 'div') { var cur = []; R.forEach(function (r) { if (r[0] === '\n') { pushB(tg, cls, cur); cur = []; } else cur.push(r); }); pushB(tg, cls, cur); }
          else pushB(tg, cls, R.filter(function (r) { return r[0] !== '\n'; }));
          return;
        }
        visit(c);
      });
    }
    function pushB(k, cls, runs) { if (runs.some(function (r) { return r[0].trim(); }) || k === 'h1') { blocks.push({ k: k, cls: cls, runs: runs, pb: newpage }); newpage = false; } }
    visit(doc.body);
    function rx(runs, base, boldc, smallc) {
      boldc = boldc == null ? 9 : boldc; smallc = smallc == null ? 11 : smallc; var out = [], buf = null;
      runs.forEach(function (r) { var c = r[2] ? smallc : (r[1] ? boldc : base); if (buf && buf[0] === c) buf[1] += r[0]; else { if (buf) out.push(buf); buf = [c, r[0]]; } });
      if (buf) out.push(buf);
      if (!out.length) return '<hp:run charPrIDRef="' + base + '"><hp:t/></hp:run>';
      out[0][1] = out[0][1].replace(/^\s+/, ''); out[out.length - 1][1] = out[out.length - 1][1].replace(/\s+$/, '');
      return out.map(function (o) { return '<hp:run charPrIDRef="' + o[0] + '"><hp:t>' + xe(o[1]) + '</hp:t></hp:run>'; }).join('');
    }
    function para(runs, pp, base, pb, boldc) { return '<hp:p id="' + nid() + '" paraPrIDRef="' + pp + '" styleIDRef="0" pageBreak="' + (pb ? 1 : 0) + '" columnBreak="0" merged="0">' + rx(runs, base, boldc) + '</hp:p>'; }
    function table(t) {
      var rows = t.rows, nc = Math.max.apply(null, rows.map(function (r) { return r.reduce(function (a, c) { return a + c.cs; }, 0); })), big = /(^|\s)big(\s|$)/.test(t.cls);
      var cw = []; for (var i = 0; i < nc; i++) cw.push(Math.floor(W / nc)); cw[nc - 1] = W - cw.slice(0, -1).reduce(function (a, b) { return a + b; }, 0); var rh = big ? 2600 : 1500, trs = '';
      rows.forEach(function (r, ri) {
        var tcs = '', ci = 0;
        r.forEach(function (c) {
          var cs = Math.min(c.cs, nc - ci), w = cw.slice(ci, ci + cs).reduce(function (a, b) { return a + b; }, 0), lines = [[]];
          c.runs.forEach(function (x) { if (x[0] === '\n') lines.push([]); else lines[lines.length - 1].push(x); });
          var ps = lines.map(function (l) { return '<hp:p id="' + nid() + '" paraPrIDRef="' + (c.r ? 23 : 21) + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' + rx(l, c.h ? 9 : 0) + '</hp:p>'; }).join('');
          tcs += '<hp:tc name="" header="' + (c.h ? 1 : 0) + '" hasMargin="1" protect="0" editable="0" dirty="1" borderFillIDRef="' + (c.h ? 4 : 3) + '">' + TC_SUB.replace('%V', 'CENTER') + ps + '</hp:subList><hp:cellAddr colAddr="' + ci + '" rowAddr="' + ri + '"/><hp:cellSpan colSpan="' + cs + '" rowSpan="1"/><hp:cellSz width="' + w + '" height="' + rh + '"/><hp:cellMargin left="340" right="340" top="140" bottom="140"/></hp:tc>';
          ci += cs;
        });
        while (ci < nc) { tcs += '<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="1" borderFillIDRef="3">' + TC_SUB.replace('%V', 'CENTER') + '<hp:p id="' + nid() + '" paraPrIDRef="21" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="' + ci + '" rowAddr="' + ri + '"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="' + cw[ci] + '" height="' + rh + '"/><hp:cellMargin left="340" right="340" top="140" bottom="140"/></hp:tc>'; ci++; }
        trs += '<hp:tr>' + tcs + '</hp:tr>';
      });
      return tblWrap(t.pb, trs, rows.length, nc, rh * rows.length, 1, 140);
    }
    return blocks.map(function (b) {
      if (b.k === 'tbl') return table(b);
      var c = b.cls.split(/\s+/), has = function (x) { return c.indexOf(x) >= 0; };
      if (b.k === 'h1') return para(b.runs, 20, 7, b.pb, 7);
      if (b.k === 'h2') return para([['', 0, 0]], 0, 0, b.pb) + para(b.runs, 0, 13, false, 13);
      if (b.k === 'h3') return para(b.runs, 0, 9, b.pb, 9);
      if (b.k === 'div' && has('rbox')) return para(b.runs, 20, 12, b.pb, 12);
      if (b.k === 'p' && has('sub')) return para(b.runs, 20, 0, b.pb);
      if (b.k === 'p' && has('org')) return para(b.runs, 23, 0, b.pb);
      if (b.k === 'p' && has('nt')) return para(b.runs, 0, 11, b.pb, 11);
      return para(b.runs, 0, 0, b.pb);
    }).join('');
  }
  var TPL = null;
  function hwpx(body, mtg) {
    return ZIP().then(function (Z) {
      return (TPL ? Promise.resolve(TPL) : fetch(new URL('report.hwpx', document.baseURI)).then(function (r) { if (!r.ok) throw new Error('한글 틀을 불러오지 못했습니다'); return r.arrayBuffer(); }).then(function (b) { TPL = b; return b; }))
        .then(function (b) { return Z.loadAsync(b); }).then(function (z) {
          return z.file('Contents/section0.xml').async('string').then(function (s0) {
            if (mtg) s0 = s0.replace(/<hp:margin [^>]*\/>/, '<hp:margin header="2834" footer="2834" gutter="0" left="8504" right="8504" top="4252" bottom="4252"/>');
            var i = s0.indexOf('</hp:p>') + 7, j = s0.lastIndexOf('</hs:sec>');
            z.file('Contents/section0.xml', s0.slice(0, i) + body + s0.slice(j));
            z.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
            return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/hwp+zip' });
          });
        });
    });
  }

  /* ───────── 요청 처리 ───────── */
  var LASTSORT = {};
  function J(o) { return Promise.resolve(o); }
  function handle(path, method, body) {
    var u = new URL(path, location.href), P = u.searchParams, n = u.pathname.replace(/^.*\/api\//, ''), post = method === 'POST';
    switch (n) {
      case 'ping': return J({ ok: true });
      case 'state':
        if (!post) return S.get('state').then(function (v) { return v || {}; });
        return textOf(body).then(function (t) { var o = JSON.parse(t); var day = 'state_bak:' + ymdD(); return S.get(day).then(function (b) { return b ? 0 : S.get('state').then(function (old) { if (old) return S.set(day, old); }); }).then(function () { return S.set('state', o); }).then(function () { return { ok: true }; }); });
      case 'key': return S.get('bdkey').then(function (k) {
        if (k) return k; var r = crypto.getRandomValues(new Uint8Array(32)), s = ''; r.forEach(function (x) { s += String.fromCharCode(x); }); k = btoa(s); return S.set('bdkey', k).then(function () { return k; });
      }).then(function (k) { return { url: 'pmb:', anon: 'pmb', key: k }; });
      case 'publish': case 'sync': return J({ ok: true, msg: '웹판은 저장하면 바로 반영됩니다 — 폰에서도 같은 주소로 열면 됩니다' });
      case 'open': {
        var f = P.get('f') || '';
        if (P.get('mode') === 'folder' || !/\.[A-Za-z0-9]{1,6}$/.test(f)) return J({ ok: false, msg: '웹판에서는 폴더 대신 「문서함」 화면에서 봅니다' });
        return getBlob(f).then(function (g) { openBlob(g.meta.name, g.blob); return { ok: true }; }).catch(function (e) { return { ok: false, msg: e.message }; });
      }
      case 'box': { var site = P.get('site') || '공통'; return siteFiles(site).then(function (L) { return { ok: true, dir: BOX + site, files: L }; }); }
      case 'trash': return S.fmeta(norm(P.get('f'))).then(function (m) { if (!m) return { ok: false, msg: '문서함 안의 파일만 지울 수 있습니다' }; m.del = ymdD(); return S.fset(m).then(function () { return { ok: true }; }); });
      case 'count': { var cf = norm(P.get('f')); if (!isXl(cf)) return J({ error: '문서함 안의 엑셀 명부만 집계할 수 있습니다' }); return countFile(cf).then(function (r) { delete r.people; return r; }).catch(function (e) { return { error: '집계하지 못했습니다: ' + e.message }; }); }
      case 'cmp': {
        var a = norm(P.get('a')), b = norm(P.get('b'));
        if (!isXl(a) || !isXl(b)) return J({ error: '문서함 안의 엑셀 명부만 비교할 수 있습니다' });
        return Promise.all([countFile(a), countFile(b)]).then(function (AB) {
          var A = AB[0], B = AB[1], pa = A.people, pb = B.people, nm = function (k) { return k.split('|')[0]; };
          var out = { old: { total: A.total, agree: A.agree, rate: A.rate }, new: { total: B.total, agree: B.agree, rate: B.rate }, newAgree: [], lost: [], added: [], removed: [] };
          Object.keys(pb).forEach(function (k) { var v = pb[k]; if (!pa[k]) out.added.push({ name: nm(k), no: v.no }); else if (v.ok && !pa[k].ok) out.newAgree.push({ name: nm(k), no: v.no }); else if (pa[k].ok && !v.ok) out.lost.push({ name: nm(k), no: v.no }); });
          out.removed = Object.keys(pa).filter(function (k) { return !pb[k]; }).map(function (k) { return { name: nm(k), no: pa[k].no }; });
          return out;
        }).catch(function (e) { return { error: '비교하지 못했습니다: ' + e.message }; });
      }
      case 'nacsv': { var nf = norm(P.get('f')); if (!isXl(nf)) return J({ error: '문서함 안의 엑셀 명부만 됩니다' });
        return countFile(nf).then(function (r) {
          var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
          var csv = '﻿' + [['조합원번호', '미동의 소유자', '공유 인원', '소재지', '연락처', '받은 날짜', '메모']].concat(r.notAgree.map(function (x) { return [x.no, x.names.join(', '), x.all, x.addr, x.tel, '', '']; })).map(function (row) { return row.map(q).join(','); }).join('\r\n');
          var d = dirOf(nf); return putFile(d.site, d.sub, d.dir, d.name.replace(/\.xls[xm]?$/i, '') + '_미동의자명단_' + ymd6() + '.csv', new Blob([csv], { type: 'text/csv' })).then(function (o) { o.count = r.notAgree.length; return o; });
        }).catch(function (e) { return { error: '저장하지 못했습니다: ' + e.message }; }); }
      case 'mark': { var mf = norm(P.get('f')), nos = String(P.get('nos') || '').replace(/[^0-9,\-]/g, '').split(',').filter(Boolean), day = ymdD();
        if (!isXl(mf) || !nos.length) return J({ error: '명부나 번호가 없습니다' });
        return getBlob(mf).then(function (g) { return readRows(g.blob).then(function (R) {
          var X = window.XLSX, ws = R.wb.Sheets[R.sheet], C = findCols(R.rows), start = startRow(R.rows), G = {}, cur = null;
          for (var i = start; i < R.rows.length; i++) { var r = pad60(R.rows[i]); if (!s_(r[0]) && !s_(r[C.name])) continue; var no = s_(r[C.no]); if (no) cur = no; if (cur == null || r.slice(0, 60).map(s_).join(' ').indexOf('소유권대지권') >= 0) continue; (G[cur] = G[cur] || []).push(i); }
          var done = [], cells = 0;
          nos.forEach(function (no) { if (!G[no]) return; G[no].forEach(function (i) { var ad = X.utils.encode_cell({ r: i, c: C.agree }); if (!ws[ad] || !s_(ws[ad].v)) { ws[ad] = { t: 's', v: day }; cells++; } }); done.push(no); });
          var rg = X.utils.decode_range(ws['!ref']); if (rg.e.c < C.agree) { rg.e.c = C.agree; ws['!ref'] = X.utils.encode_range(rg); }
          var d = dirOf(mf), base = d.name.replace(/\.xls[xm]?$/i, '').replace(/_받음반영_\d{6}$/, '');
          return putFile(d.site, d.sub, d.dir, base + '_받음반영_' + ymd6() + '.xlsx', xlBlob(X, R.wb)).then(function (o) { o.nos = done.length; o.cells = cells; o.missing = nos.filter(function (n) { return !G[n]; }); return o; });
        }); }).catch(function (e) { return { error: '만들지 못했습니다: ' + e.message }; }); }
      case 'rep': { var rf = norm(P.get('f')); if (!isXl(rf)) return J({ error: '문서함 안의 엑셀 명부만 됩니다' });
        return countFile(rf).then(function (r) {
          var X = window.XLSX, wb = X.utils.book_new(), site = siteOf(rf), sh = function (head, rows, w) { var a = [head].concat(rows), ws = X.utils.aoa_to_sheet(a); ws['!cols'] = w.map(function (x) { return { wch: x }; }); return ws; };
          var sum = [[site + ' 명부 집계 보고'], ['명부 파일', rf.split('/').pop()], ['만든 날', ymdD()], [], ['구분', '인원', '동의', '동의율(%)'], ['전체', r.total, r.agree, r.rate]];
          Object.keys(r.kind).forEach(function (k) { var v = r.kind[k]; if (v[0]) sum.push([k, v[0], v[1], Math.round(v[1] * 10000 / v[0]) / 100]); });
          sum.push([]); sum.push(['기준: 같은 조합원번호 = 1명 · 공유자는 전원 동의해야 동의 · 「소유권대지권」 줄은 뺌']);
          var w0 = X.utils.aoa_to_sheet(sum); w0['!cols'] = [18, 40, 10, 12].map(function (x) { return { wch: x }; }); X.utils.book_append_sheet(wb, w0, '요약');
          X.utils.book_append_sheet(wb, sh(['조합원번호', '미동의 소유자', '공유 인원', '소재지', '연락처', '받은 날짜', '메모'], r.notAgree.map(function (x) { return [x.no, x.names.join(', '), x.all, x.addr, x.tel, '', '']; }), [11, 30, 9, 30, 16, 12, 20]), '미동의자');
          X.utils.book_append_sheet(wb, sh(['소재지', '인원', '동의', '미동의', '동의율(%)', '미동의 번호'], r.byAddr.map(function (x) { return [x.k, x.t, x.a, x.na.length, Math.round(x.a * 1000 / x.t) / 10, x.na.join(', ')]; }), [24, 8, 8, 8, 10, 60]), '소재지별');
          var chk = r.gapCount ? [['빠진 번호', r.gaps.join(', ')]] : [];
          r.mixed.forEach(function (x) { chk.push(['공유자 일부만 동의', x.no + '번 ' + x.names.join(', ')]); });
          r.sameSet.forEach(function (x) { chk.push(['같은 공유자 묶음', x.nos.join('·') + '번 ' + x.names.slice(0, 4).join(', ')]); });
          r.oddMark.forEach(function (x) { chk.push(['동의서 칸 확인', x.row + '행 ' + x.no + '번 ' + x.name + ' — 「' + x.v + '」']); });
          r.noBirth.forEach(function (x) { chk.push(['생년월일·이름 빈 칸', x.row + '행 ' + x.no + '번 ' + x.name]); });
          X.utils.book_append_sheet(wb, sh(['종류', '내용'], chk, [20, 80]), '확인할 곳');
          return putFile(site, '08_보고서', '', site + '_명부집계보고_' + ymd6() + '.xlsx', xlBlob(X, wb));
        }).catch(function (e) { return { error: '만들지 못했습니다: ' + e.message }; }); }
      case 'search': { var q = String(P.get('q') || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        return S.files().then(function (L) { var out = q.length ? L.filter(function (f) { var t = (f.name + ' ' + f.site).toLowerCase(); return q.every(function (w) { return t.indexOf(w) >= 0; }); }).map(function (f) { var o = pub(f); o.site = f.site; return o; }) : []; return { ok: true, files: out.slice(0, 200), more: out.length > 200 }; }); }
      case 'dups': { var ds = P.get('site') || '';
        return S.files().then(function (L) {
          L = L.filter(function (f) { return f.site === ds; }); var by = {};
          L.forEach(function (f) { var o = pub(f), k1 = 'n:' + f.name.toLowerCase(), k2 = 's:' + f.size + (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase(); o.bid = f.bid; (by[k1] = by[k1] || []).push(o); if (f.size > 1024) (by[k2] = by[k2] || []).push(o); });
          var H = function (o) { return S.blob(o.bid).then(function (b) { return b.arrayBuffer(); }).then(function (ab) { return crypto.subtle.digest('SHA-256', ab); }).then(function (h) { return Array.from(new Uint8Array(h)).join(','); }); };
          var seen = {}, groups = [], ch = Promise.resolve();
          Object.keys(by).forEach(function (k) { var g = by[k]; if (g.length < 2) return; ch = ch.then(function () {
            return (k[0] === 's' ? Promise.all(g.map(H)).then(function (hs) { return g.filter(function (x, i) { return hs[i] === hs[0]; }); }) : Promise.resolve(g)).then(function (g2) {
              if (g2.length < 2) return; var id = g2.map(function (x) { return x.file; }).sort().join('|'); if (seen[id]) return; seen[id] = 1;
              groups.push({ why: k[0] === 'n' ? '이름 같음' : '내용이 똑같음', files: g2.map(function (x) { var o = Object.assign({}, x); delete o.bid; return o; }) });
            }); }); });
          return ch.then(function () { return { ok: true, groups: groups.slice(0, 100) }; });
        }); }
      case 'rt': { var rs = String(P.get('site') || '').trim(); if (!rs || rs.length > 60) return J({ ok: false, msg: '현장 이름이 없습니다' });
        if (!post) return S.get('rt:' + rs).then(function (v) { return v || {}; });
        return textOf(body).then(function (t) { var o = JSON.parse(t); return S.set('rt:' + rs, o).then(function () { return { ok: true, file: BOX + rs + '/05_사업수지·분담금/비례율계산_' + safe(rs) + '.json' }; }); }); }
      case 'rtscan': return scan(P.get('name') || '', blobOf(body)).catch(function (e) { return { ok: false, msg: '파일을 읽지 못했습니다: ' + e.message }; });
      case 'rgeo': { var la = +P.get('lat'), lo = +P.get('lng'); if (!isFinite(la) || !isFinite(lo)) return J({ ok: false });
        return fetch0('https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&accept-language=ko&lat=' + la + '&lon=' + lo).then(function (r) { return r.json(); }).then(function (j) {
          var a = (j && j.address) || {}, top = a.province || a.state || a.city;
          var t = [top, a.city !== top ? a.city : '', a.borough || a.county || a.city_district, a.quarter || a.suburb || a.neighbourhood || a.village || a.town].filter(function (x, i, A) { return x && A.indexOf(x) === i; }).join(' ');
          return t ? { ok: true, addr: t } : { ok: false };
        }).catch(function () { return { ok: false }; }); }
      case 'geo': { var q0 = String(P.get('q') || '').replace(/[—–].*$/, '').replace(/일원|일대|외\s*\d+\s*필지/g, '').trim().slice(0, 100); if (!q0) return J({ ok: false });
        var tries = [q0, q0.replace(/\s*(산\s*)?\d+(-\d+)?\s*(번지)?\s*$/, ''), q0.replace(/\s*(산\s*)?\d+(-\d+)?.*$/, '')].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        var tryAt = function (i) { if (i >= tries.length) return { ok: false, msg: '주소를 찾지 못했습니다' };
          return fetch0('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=kr&accept-language=ko&q=' + encodeURIComponent(tries[i])).then(function (r) { return r.json(); }).then(function (j) {
            if (j && j[0]) { var nn = ((q0.match(/\d+(-\d+)?\s*(번지)?\s*$/) || [''])[0]).replace(/번지|\s/g, ''); return { ok: true, lat: +j[0].lat, lng: +j[0].lon, name: j[0].display_name, used: tries[i], exact: !!nn && String(j[0].display_name).indexOf(nn) >= 0 }; }
            return tryAt(i + 1);
          }); };
        return Promise.resolve(tryAt(0)).catch(function () { return { ok: false, msg: '인터넷 연결을 확인해 주세요' }; }); }
      case 'rtxlsx': { var xs = String(P.get('site') || '').trim(), xn = safe(P.get('name') || '비례율').slice(0, 120); if (!xs) return J({ ok: false, msg: '현장 이름이 없습니다' });
        return Promise.all([textOf(body), XL()]).then(function (a) {
          var d = JSON.parse(a[0]), X = a[1], rows = [[d.title || ''], [d.sub || ''], []].concat(d.rows || []), ws = X.utils.aoa_to_sheet(rows);
          ws['!cols'] = [8, 26, 22, 22, 28].map(function (x) { return { wch: x }; });
          Object.keys(ws).forEach(function (k) { if (k[0] === '!') return; var c = ws[k], ad = X.utils.decode_cell(k); if (c.t === 'n' && ad.r >= 4) c.z = (rows[ad.r] && rows[ad.r][1] === '추정 비례율(%)') ? '#,##0.00' : '#,##0'; });
          var wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '비례율 산출');
          return putFile(xs, '05_사업수지·분담금', '', xn + '.xlsx', xlBlob(X, wb));
        }).catch(function (e) { return { ok: false, error: '만들지 못했습니다: ' + e.message }; }); }
      case 'mtghwp': { var ms = String(P.get('site') || '').trim(), mn = safe(P.get('name') || '회의록(약식)').slice(0, 120); if (!ms || !mn) return J({ ok: false, msg: '현장 이름이 없습니다' });
        return textOf(body).then(function (t) { var d = JSON.parse(t);
          return S.files().then(function (L) {
            var target = mkPath(ms, '03_총회·회의', '', mn + '.hwpx'), ex = L.some(function (f) { return f.file === target; });
            if (ex && P.get('new') !== '1') return { ok: false, exists: true, file: target };
            return hwpx(mtgBody(d), true).then(function (b) { return putFile(ms, '03_총회·회의', '', mn + '.hwpx', b); });
          }); }).catch(function (e) { return { ok: false, error: '만들지 못했습니다: ' + e.message }; }); }
      case 'rthwp': { var hs = String(P.get('site') || '').trim(), hn = safe(P.get('name') || '추정분담금').slice(0, 120); if (!hs) return J({ ok: false, msg: '현장 이름이 없습니다' });
        return textOf(body).then(function (h) { return hwpx(rtBody(h), false); }).then(function (b) { return putFile(hs, '05_사업수지·분담금', '', hn + '.hwpx', b, {}); })
          .then(function (o) { return o; }).catch(function (e) { return { ok: false, error: '만들지 못했습니다: ' + e.message }; }); }
      case 'boxput': { var bs = String(P.get('site') || '').trim(), sub = String(P.get('sub') || '').trim();
        if (/손대지 않음/.test(sub)) return J({ ok: false, msg: '「손대지 않음」 폴더에는 넣지 않습니다' });
        return putFile(bs, sub, '', String(P.get('name') || ''), blobOf(body, 'application/octet-stream')); }
      case 'boxmv': { var mvf = norm(P.get('f')), ns = String(P.get('sub') || ''), nn = safe(P.get('name') || '');
        return S.files().then(function (L) {
          var m = L.filter(function (f) { return f.file === mvf; })[0];
          if (!m) return { ok: false, msg: '문서함 안의 파일만 바꿀 수 있습니다' };
          if (/손대지 않음/.test(mvf)) return { ok: false, msg: '「손대지 않음」 폴더의 파일은 바꾸지 않습니다' };
          if (!nn || nn.length > 150 || /^\.+$/.test(nn)) return { ok: false, msg: '파일 이름을 넣어 주세요' };
          if (ns && ns !== '(바로 넣은 파일)' && /[\\/:*?"<>|]|^\.|\.\./.test(ns)) return { ok: false, msg: '칸 이름이 잘못되었습니다' };
          var keepDir = ns === m.sub ? m.dir : '', to = mkPath(m.site, ns || '(바로 넣은 파일)', keepDir, nn);
          if (to === mvf) return { ok: true, file: mvf };
          if (L.some(function (f) { return f.file === to && f.file.toLowerCase() !== mvf.toLowerCase(); })) return { ok: false, msg: '옮길 곳에 같은 이름의 파일이 이미 있습니다 — 이름을 조금 바꿔 주세요' };
          var nm2 = Object.assign({}, m, { file: to, sub: ns || '(바로 넣은 파일)', dir: keepDir, name: nn });
          return S.frm(mvf).then(function () { return S.fset(nm2); }).then(function () { return { ok: true, file: to }; });
        }); }
      case 'recent': { var days = Math.min(60, Number(P.get('days')) || 7), since = ymdD(new Date(Date.now() - days * 864e5));
        return S.files().then(function (L) { return { ok: true, files: L.filter(function (f) { return f.date >= since; }).map(function (f) { var o = pub(f); o.site = f.site; return o; }).sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 300) }; }); }
      case 'sort': { var ss = P.get('site') || ''; if (!ss) return J({});
        return S.files().then(function (L) {
          var taken = {}, moved = [], undo = [], ch = Promise.resolve(); L.forEach(function (f) { taken[f.file] = 1; });
          L.filter(function (f) { return f.site === ss && f.sub === '(바로 넣은 파일)' && !f.dir; }).forEach(function (f) {
            var sub = SORT.filter(function (r) { return r[1].test(f.name); })[0][0], nm3 = freeName(ss, sub, '', f.name, taken), to = mkPath(ss, sub, '', nm3); taken[to] = 1;
            var nmeta = Object.assign({}, f, { file: to, sub: sub, name: nm3 });
            ch = ch.then(function () { return S.frm(f.file).then(function () { return S.fset(nmeta); }); }); moved.push([f.name, sub]); undo.push([to, f]);
          });
          return ch.then(function () { LASTSORT[ss] = undo; return { ok: true, moved: moved }; });
        }); }
      case 'unsort': { var us = P.get('site') || '', Ls = LASTSORT[us] || [], back = [], c2 = Promise.resolve();
        Ls.forEach(function (x) { c2 = c2.then(function () { return S.fmeta(x[0]).then(function (m) { if (!m) return; return S.frm(x[0]).then(function () { return S.fset(x[1]); }).then(function () { back.push(x[1].name); }); }); }); });
        return c2.then(function () { delete LASTSORT[us]; return { ok: true, back: back }; }); }
    }
    return J({ ok: false, msg: '웹판에서 아직 안 되는 기능입니다' });
  }

  /* ───────── 함께 쓰기 (일정·글) — 같은 업체 안에서만 ───────── */
  function rpc(fn, a) {
    switch (fn) {
      case 'pm_list': return S.keys('i:').then(function (ks) { return Promise.all(ks.map(function (k) { return S.get(k); })); }).then(function (L) { return L.filter(Boolean).sort(function (x, y) { return y.created_at.localeCompare(x.created_at); }).slice(0, 1000); });
      case 'pm_add': { var id = uuid(), t = new Date().toISOString(); return S.set('i:' + id, { id: id, kind: a.kind_, box: a.box_, created_at: t, updated_at: t }).then(function () { return id; }); }
      case 'pm_set': return S.get('i:' + a.id_).then(function (o) { if (!o) return null; o.box = a.box_; o.updated_at = new Date().toISOString(); return S.set('i:' + a.id_, o).then(function () { return null; }); });
      case 'pm_del': return S.del('i:' + a.id_).then(function () { return null; });
      case 'pm_file_add': { var fid = uuid(); return S.set('bf:' + fid, a.box_).then(function () { return fid; }); }
      case 'pm_file_get': return S.get('bf:' + a.id_).then(function (b) { return b || null; });
      case 'pm_ok': return J(true);
    }
    return Promise.reject(new Error('없는 기능'));
  }

  /* ───────── fetch 가로채기 ───────── */
  var fetch0 = window.fetch.bind(window);
  function resp(o, status) { return new Response(o == null ? '' : JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '', o = init || {};
    var m = url.match(/^pmb:\/rest\/v1\/rpc\/([a-z_]+)/);
    if (m) return Promise.resolve().then(function () { return rpc(m[1], o.body ? JSON.parse(o.body) : {}); }).then(function (r) { return resp(r); }, function (e) { return resp({ message: e.message }, 500); });
    if (/^\/api\/|^api\//.test(url) || url.indexOf(location.origin + '/api/') === 0) {
      return Promise.resolve().then(function () { return handle(url, (o.method || 'GET').toUpperCase(), o.body); })
        .then(function (r) { return resp(r); }, function (e) { return resp({ ok: false, msg: String(e && e.message || e), error: String(e && e.message || e) }); });
    }
    return fetch0(input, init);
  };
  if (PM_SERVER) document.addEventListener('DOMContentLoaded', function () { var e = document.getElementById('pmInvBtn'); if (e) e.style.display = ''; });
  function invite() { if (!PM_SERVER) return alert('직원 초대는 서버 연결 뒤에 됩니다'); Server.invite().then(function (c) { window.prompt('직원에게 이 코드를 알려 주세요 (7일 동안 한 번 쓸 수 있음)', c); }).catch(function (e) { alert(e.message); }); }
  window.PMB = { pilog: function (who, what) { if (PM_SERVER && S.pilog) S.pilog(who, what).catch(function () {}); }, demo: DEMO, XL: XL, handle: handle, invite: invite, rpc: rpc, store: function () { return S; }, server: PM_SERVER, vendor: VENDOR, tally: tally, mtgBody: mtgBody, rtBody: rtBody, hwpx: hwpx };
})();
