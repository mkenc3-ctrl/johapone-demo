// 조합ONE 앱에서 휴대폰으로 연 페이지(?app=1)에 「조합ONE으로 돌아가기」 막대를 맨 위에 붙임
(function () {
  if (!/[?&]app=1/.test(location.search)) return;
  function add() {
    if (document.getElementById('appBack')) return;
    var a = document.createElement('a');
    a.id = 'appBack'; a.href = 'union.html#home'; a.textContent = '← 조합ONE으로 돌아가기';
    a.style.cssText = 'position:sticky;top:0;z-index:9999;display:block;background:#0B5563;color:#fff;font:700 16px/1.2 "Noto Sans KR","Apple SD Gothic Neo",sans-serif;padding:14px 16px;text-decoration:none';
    document.body.insertBefore(a, document.body.firstChild);
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
