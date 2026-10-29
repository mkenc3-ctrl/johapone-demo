// 조합ONE 서식함용 엑셀 양식 정의 + .xlsx 생성기
// rebuild.html(절차 체크리스트)의 SHEETS·엑셀 생성 코드를 그대로 옮긴 것. 양식을 바꾸면 두 곳을 함께 고칠 것.
(function () {
  // 열: [제목, 너비, 종류(s 글자, d 날짜, n 숫자, p 백분율), 수식({r}=행 번호)]
  var SHEETS = {
    owners: { title: '토지등소유자 명부', cols: [['연번', 6, 'n'], ['동', 7, 's'], ['호', 7, 's'], ['소유자 성명', 14, 's'], ['생년월일(법인은 등록번호)', 16, 's'], ['주소', 34, 's'], ['연락처', 16, 's'], ['소유 형태(단독/공유)', 12, 's'], ['공유 지분', 10, 's'], ['대표자 여부', 10, 's'], ['1세대 묶음 번호', 12, 's'], ['토지면적(㎡)', 12, 'n'], ['등기 확인일', 12, 'd'], ['추진위 구성 동의일', 14, 'd'], ['조합설립 동의일', 14, 'd'], ['철회·반대 의사표시일', 16, 'd'], ['비고', 24, 's']] },
    consent: { title: '동별 동의율 집계표', cols: [['동 (상가는 전체를 한 줄로)', 22, 's'], ['구분소유자 수', 12, 'n'], ['동의자 수', 12, 'n'], ['동의율', 10, 'p', '=IF(B{r}="","",C{r}/B{r})'], ['과반수 충족', 12, 's', '=IF(B{r}="","",IF(B{r}<=5,"제외(5 이하)",IF(C{r}>B{r}/2,"충족","미달")))'], ['토지면적(㎡)', 12, 'n'], ['동의 토지면적(㎡)', 14, 'n'], ['비고', 24, 's']] },
    contracts: { title: '계약 대장', cols: [['연번', 6, 'n'], ['계약명', 26, 's'], ['업체명', 18, 's'], ['추정가격(원)', 14, 'n'], ['계약금액(원)', 14, 'n'], ['입찰 방법(일반/지명/수의)', 16, 's'], ['지명·수의계약 사유', 22, 's'], ['전자조달 여부', 12, 's'], ['의결 기관', 12, 's'], ['의결일', 12, 'd'], ['계약일', 12, 'd'], ['공개 기한(계약일+15일)', 16, 'd', '=IF(K{r}="","",K{r}+15)'], ['공개일', 12, 'd'], ['변경 이력', 22, 's'], ['비고', 20, 's']] },
    disclosure: { title: '정보공개 대장', cols: [['연번', 6, 'n'], ['서류명', 30, 's'], ['작성·변경일', 12, 'd'], ['공개 기한(+15일)', 14, 'd', '=IF(C{r}="","",C{r}+15)'], ['인터넷 공개일', 12, 'd'], ['그 밖의 방법 공개일', 14, 'd'], ['공개 방법', 16, 's'], ['담당자', 10, 's'], ['비고', 22, 's']] },
    requests: { title: '열람·복사 처리 대장', cols: [['연번', 6, 'n'], ['요청일', 12, 'd'], ['요청자', 12, 's'], ['요청 자료', 30, 's'], ['처리 기한(+15일)', 14, 'd', '=IF(B{r}="","",B{r}+15)'], ['처리일', 12, 'd'], ['처리 내용(열람/복사/일부)', 20, 's'], ['비용(원)', 10, 'n'], ['담당자', 10, 's'], ['비고', 20, 's']] },
    notices: { title: '통지 발송 대장', cols: [['연번', 6, 'n'], ['통지 종류', 22, 's'], ['대상자', 12, 's'], ['주소', 34, 's'], ['발송일', 12, 'd'], ['발송 방법', 12, 's'], ['등기번호', 16, 's'], ['도달일', 12, 'd'], ['반송 여부', 10, 's'], ['재발송일', 12, 'd'], ['비고', 22, 's']] },
    meeting: { title: '총회 참석·의결 집계표', cols: [['안건', 30, 's'], ['조합원 수', 10, 'n'], ['직접 출석', 10, 'n'], ['서면', 8, 'n'], ['전자', 8, 'n'], ['대리', 8, 'n'], ['출석 합계', 10, 'n', '=IF(B{r}="","",C{r}+D{r}+E{r}+F{r})'], ['찬성', 8, 'n'], ['반대', 8, 'n'], ['기권·무효', 10, 'n'], ['직접 출석 비율', 12, 'p', '=IF(B{r}="","",C{r}/B{r})'], ['찬성 비율(전체 조합원 대비)', 18, 'p', '=IF(B{r}="","",H{r}/B{r})'], ['찬성 비율(출석 대비)', 16, 'p', '=IF(OR(B{r}="",G{r}=0),"",H{r}/G{r})'], ['필요 요건', 22, 's']] },
    sale: { title: '매도청구 대상자 관리표', cols: [['연번', 6, 'n'], ['동·호', 10, 's'], ['소유자', 12, 's'], ['촉구서 발송일', 12, 'd'], ['도달일', 12, 'd'], ['회답 기한(도달일+2개월)', 18, 'd', '=IF(E{r}="","",EDATE(E{r},2))'], ['회답 내용', 14, 's'], ['매도청구 기한(회답 기한+2개월)', 22, 'd', '=IF(E{r}="","",EDATE(E{r},4))'], ['소 제기일', 12, 'd'], ['사건번호', 16, 's'], ['비고', 22, 's']] },
    apply: { title: '분양신청 접수 대장', cols: [['연번', 6, 'n'], ['조합원 번호', 10, 's'], ['성명', 12, 's'], ['종전자산 가격(원)', 16, 'n'], ['통지 발송일', 12, 'd'], ['도달일', 12, 'd'], ['신청일', 12, 'd'], ['신청 평형', 12, 's'], ['철회 여부', 10, 's'], ['현금청산 대상', 12, 's'], ['비고', 22, 's']] },
    cash: { title: '현금청산 협의 기록', cols: [['연번', 6, 'n'], ['대상자', 12, 's'], ['사유(미신청/철회/제외)', 18, 's'], ['협의 일시', 12, 'd'], ['제시 금액(원)', 14, 'n'], ['상대방 의견', 26, 's'], ['결과', 12, 's'], ['소 제기일', 12, 'd'], ['사건번호', 16, 's'], ['비고', 22, 's']] }
  };
  // 체크리스트 단계별 사용처 (rebuild.html 의 FORMMAP·SHEETMAP 과 같음)
  var STEP = { c1: '자료 공개와 열람·복사', c2: '총회 소집과 의결 요건', c5: '정비업체(PM) 자체 점검', c6: '계약 순서', c7: '계약 방식: 금액별 입찰 기준', c8: '알릴 의무 모음', s1: '단지 현황과 사업 방식 확인', s2: '재건축진단 요청과 결과 확인', s4a: '추진위원회 구성 동의', s5a: '조합설립 동의서 받기', s5b: '창립총회', s5c: '인가·등기·추진위 인계', s6a: '시공자 선정', s7b: '총회 의결', s7c: '사업시행 인가 신청과 고시', s8a: '미동의자 매도청구', s8c: '분양신청 통지와 접수', s9b: '조합원 통지·총회·공람', s9c: '관리처분 인가 신청과 고시', s10a: '현금청산 협의와 소송', s11: '준공인가' };
  var FORMMAP = { c5: ['13'], s2: ['1'], s4a: ['4', '3'], s5a: ['6'], s5c: ['5'], s7c: ['8'], s9c: ['9'], s11: ['10', '12'] };
  var SHEETMAP = { c1: ['disclosure', 'requests'], c2: ['meeting'], c6: ['contracts'], c7: ['contracts'], c8: ['notices'], s1: ['owners'], s4a: ['owners'], s5a: ['owners', 'consent'], s5b: ['meeting'], s6a: ['contracts', 'meeting'], s7b: ['meeting'], s8a: ['sale'], s8c: ['apply', 'notices'], s9b: ['meeting', 'notices'], s10a: ['cash'] };

  // ---- .xlsx 생성 (rebuild.html 과 동일) ----
  function xmlEsc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  var CRC = (function () { var t = [], n, k, c; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var te = new TextEncoder(), parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var nm = te.encode(f.name), data = te.encode(f.text), crc = crc32(data), sz = data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nm);
      offset += 30 + nm.length + sz;
    });
    var csize = central.reduce(function (n, p) { return n + p.length; }, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]), out = new Uint8Array(offset + csize + 22), at = 0;
    all.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }
  function xlsx(sheet, rowCount) {
    var X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', NS = 'http://schemas.openxmlformats.org/', ROWS = rowCount || 200;
    var col = function (i) { return String.fromCharCode(65 + i); }, STYLE = { d: 2, p: 3, n: 4 };
    var rows = '<row r="1">' + sheet.cols.map(function (c, i) { return '<c r="' + col(i) + '1" s="1" t="inlineStr"><is><t>' + xmlEsc(c[0]) + '</t></is></c>'; }).join('') + '</row>';
    for (var r = 2; r <= ROWS + 1; r++) {
      rows += '<row r="' + r + '">' + sheet.cols.map(function (c, i) {
        var s = STYLE[c[2]], f = c[3] ? '<f>' + xmlEsc(c[3].slice(1).replace(/\{r\}/g, r)) + '</f>' : '';
        if (!s && !f) return '';
        return '<c r="' + col(i) + r + '"' + (s ? ' s="' + s + '"' : '') + (f && !s ? ' t="str"' : '') + '>' + f + '</c>';
      }).join('') + '</row>';
    }
    var ws = X + '<worksheet xmlns="' + NS + 'spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
      sheet.cols.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + c[1] + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>' + rows + '</sheetData></worksheet>';
    var styles = X + '<styleSheet xmlns="' + NS + 'spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6EFF5"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>' +
      '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
    return zip([
      { name: '[Content_Types].xml', text: X + '<Types xmlns="' + NS + 'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', text: X + '<Relationships xmlns="' + NS + 'package/2006/relationships"><Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: X + '<workbook xmlns="' + NS + 'spreadsheetml/2006/main" xmlns:r="' + NS + 'officeDocument/2006/relationships"><sheets><sheet name="' + xmlEsc(sheet.title).slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: X + '<Relationships xmlns="' + NS + 'package/2006/relationships"><Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + NS + 'officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', text: styles },
      { name: 'xl/worksheets/sheet1.xml', text: ws }
    ]);
  }
  window.JOHAP_SHEETS = { SHEETS: SHEETS, STEP: STEP, FORMMAP: FORMMAP, SHEETMAP: SHEETMAP, xlsx: xlsx };
})();
