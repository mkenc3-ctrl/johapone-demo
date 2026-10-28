// 조합ONE 공유 서버 설정
// 비어 있으면: 로컬 데모 모드 (데이터가 각자 기기에만 저장)
// 채우면:     공유 서버 모드 (같은 조합 데이터를 모두가 실시간으로 공유)
//
// 값 위치: Supabase 대시보드 → Project Settings → API
//   supabaseUrl     = Project URL
//   supabaseAnonKey = anon public key (공개용 키. service_role 키는 절대 넣지 말 것)
window.JOHAPONE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  tenant: 'demo-oo1'
};
