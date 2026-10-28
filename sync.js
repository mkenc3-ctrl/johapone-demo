// 조합ONE 공유 서버 동기화 (1단계 데모)
// union.html의 상태(S)를 컬렉션 단위로 나눠 서버 records 테이블과 주고받는다.
// - 저장(save) 때마다 바뀐 항목만 올림 (diff)
// - 다른 사람이 바꾸면 실시간으로 받아 화면 갱신
// - 엑셀로 불러온 실제 명부(IMPORTED)는 절대 올리지 않음 (S.roster의 예시 명부만 대상)
(function () {
  var CFG = window.JOHAPONE_CONFIG || {};
  var SYNC = window.SYNC = { on: false, status: 'local', tenant: CFG.tenant || 'demo-oo1', client: null, snap: {}, pending: false };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  // 배열 컬렉션: 항목마다 고유키(_k)를 붙여 행으로 저장
  function arr(path, sort) {
    return {
      get: function () { var a = path(); var m = {}; (a.get() || []).forEach(function (x) { if (!x._k) x._k = x.id != null ? String(x.id) : uid(); m[x._k] = x; }); return m; },
      set: function (m) { var v = Object.keys(m).map(function (k) { return m[k]; }); if (sort) v.sort(sort); path().set(v); }
    };
  }
  // 객체 컬렉션: 키 그대로 행 id
  function obj(path) {
    return {
      get: function () { var o = path().get() || {}; var m = {}; Object.keys(o).forEach(function (k) { m[k] = o[k]; }); return m; },
      set: function (m) { path().set(m); }
    };
  }
  function P(get, set) { return function () { return { get: get, set: set }; }; }
  var byAtDesc = function (a, b) { return String(a.at) < String(b.at) ? 1 : -1; };

  var COLLS = {
    posts:   arr(P(function () { return S.posts; }, function (v) { S.posts = v; })),
    cafe:    arr(P(function () { return S.cafe; }, function (v) { S.cafe = v; }), function (a, b) { return a.id - b.id; }),
    consents: obj(P(function () { return S.consents; }, function (v) { S.consents = v; })),
    ballots: obj(P(function () { return S.vote.ballots; }, function (v) { S.vote.ballots = v; })),
    chat:    arr(P(function () { return S.asm.chat; }, function (v) { S.asm.chat = v; }), function (a, b) { return String(a._k) < String(b._k) ? -1 : 1; }),
    attend:  obj(P(function () { return S.asm.attend; }, function (v) { S.asm.attend = v; })),
    qna:     arr(P(function () { return S.qna; }, function (v) { S.qna = v; }), function (a, b) { return b.id - a.id; }),
    events:  arr(P(function () { return S.events; }, function (v) { S.events = v; }), function (a, b) { return a.d < b.d ? -1 : 1; }),
    bids:    arr(P(function () { return S.bids; }, function (v) { S.bids = v; }), function (a, b) { return b.id - a.id; }),
    sms:     arr(P(function () { return S.sms; }, function (v) { S.sms = v; }), byAtDesc),
    proReq:  arr(P(function () { return S.proReq; }, function (v) { S.proReq = v; }), byAtDesc),
    permReq: arr(P(function () { return S.permReq; }, function (v) { S.permReq = v; }), byAtDesc),
    perm:    obj(P(function () { return S.perm; }, function (v) { S.perm = v; })),
    edu:     obj(P(function () { return S.edu; }, function (v) { S.edu = v; })),
    roster:  arr(P(function () { return S.roster; }, function (v) { S.roster = v; }), function (a, b) { return a.no - b.no; }),
    logs:    arr(P(function () { return S.logs; }, function (v) { S.logs = v; }), byAtDesc),
    meta: {
      get: function () { return { vote: { open: S.vote.open, paper: S.vote.paper }, asm: { idx: S.asm.idx }, svc: S.svc }; },
      set: function (m) { if (m.vote) { S.vote.open = m.vote.open; S.vote.paper = m.vote.paper; } if (m.asm) S.asm.idx = m.asm.idx; if (m.svc) S.svc = m.svc; }
    }
  };
  SYNC.COLLS = COLLS;

  function snapshot() { var s = {}; Object.keys(COLLS).forEach(function (c) { var m = COLLS[c].get(), o = {}; Object.keys(m).forEach(function (k) { o[k] = JSON.stringify(m[k]); }); s[c] = o; }); return s; }

  // 바뀐 행 계산 (테스트에서도 사용)
  SYNC.diff = function () {
    var cur = snapshot(), up = [], del = [];
    Object.keys(cur).forEach(function (c) {
      var p = SYNC.snap[c] || {}, n = cur[c];
      Object.keys(n).forEach(function (k) { if (n[k] !== p[k]) up.push({ tenant_id: SYNC.tenant, coll: c, id: k, data: JSON.parse(n[k]) }); });
      Object.keys(p).forEach(function (k) { if (!(k in n)) del.push({ coll: c, id: k }); });
    });
    return { cur: cur, up: up, del: del };
  };

  var timer = null;
  SYNC.push = function () {
    if (!SYNC.on) return Promise.resolve();
    var d = SYNC.diff(); SYNC.snap = d.cur;
    var jobs = [];
    if (d.up.length) jobs.push(SYNC.client.from('records').upsert(d.up));
    d.del.forEach(function (x) { jobs.push(SYNC.client.from('records').delete().match({ tenant_id: SYNC.tenant, coll: x.coll, id: x.id })); });
    return Promise.all(jobs).then(function (rs) { rs.forEach(function (r) { if (r && r.error) setStatus('error', r.error.message); }); });
  };
  SYNC.schedule = function () { if (!SYNC.on) return; clearTimeout(timer); timer = setTimeout(SYNC.push, 250); };

  // 서버 행 → 상태 반영
  SYNC.apply = function (rows) {
    var g = {}; rows.forEach(function (r) { (g[r.coll] = g[r.coll] || {})[r.id] = r.data; });
    Object.keys(g).forEach(function (c) { if (COLLS[c]) COLLS[c].set(g[c]); });
    SYNC.snap = snapshot();
  };

  // 입력 중이거나 창이 열려 있으면 화면 갱신을 미룸 (작성 중 내용 보호)
  function safeRender() {
    var a = document.activeElement, busy = (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || (document.getElementById('modal') || {}).open || document.querySelector('canvas#sig[data-drawn="1"]');
    if (busy) { SYNC.pending = true; return; }
    SYNC.pending = false; if (typeof render === 'function') render();
  }
  document.addEventListener('focusout', function () { if (SYNC.pending) setTimeout(safeRender, 50); });

  function setStatus(st, msg) { SYNC.status = st; SYNC.msg = msg || ''; var el = document.getElementById('syncTag'); if (el) el.outerHTML = SYNC.tag(); }
  SYNC.tag = function () {
    var t = { local: ['gray', '로컬 데모'], connecting: ['acc', '서버 연결 중…'], live: ['ok', '● 공유 서버'], error: ['no', '서버 오류'] }[SYNC.status] || ['gray', '로컬 데모'];
    return '<span id="syncTag" class="tag ' + t[0] + '" title="' + (SYNC.msg || '') + '">' + t[1] + '</span>';
  };

  SYNC.start = function (client) {
    SYNC.client = client; setStatus('connecting');
    return client.from('records').select('coll,id,data').eq('tenant_id', SYNC.tenant).then(function (r) {
      if (r.error) { setStatus('error', r.error.message); return; }
      SYNC.on = true;
      if (!r.data.length) { SYNC.snap = {}; return SYNC.push().then(function () { setStatus('live'); }); } // 첫 실행: 예시 데이터 올림
      SYNC.apply(r.data); setStatus('live'); safeRender();
      client.channel('records-' + SYNC.tenant)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: 'tenant_id=eq.' + SYNC.tenant }, function (p) {
          var row = p.new && p.new.coll ? p.new : p.old, c = row.coll; if (!COLLS[c]) return;
          var m = COLLS[c].get();
          if (p.eventType === 'DELETE') delete m[row.id]; else m[row.id] = p.new.data;
          COLLS[c].set(m); SYNC.snap[c] = SYNC.snap[c] || {};
          if (p.eventType === 'DELETE') delete SYNC.snap[c][row.id]; else SYNC.snap[c][row.id] = JSON.stringify(p.new.data);
          safeRender();
        }).subscribe();
    });
  };

  // 설정이 있으면 Supabase 클라이언트를 불러와 연결
  if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
    var sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
    sc.onload = function () { SYNC.start(window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey)); };
    sc.onerror = function () { setStatus('error', '서버 연결 모듈을 불러오지 못했습니다'); };
    document.head.appendChild(sc);
  }
})();
