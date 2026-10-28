// 조합ONE 공유 서버 설정
// 비어 있으면: 로컬 데모 모드 (데이터가 각자 기기에만 저장)
// 채우면:     공유 서버 모드 (같은 조합 데이터를 모두가 실시간으로 공유)
//
// 값 위치: Supabase 대시보드 → Project Settings → API
//   supabaseUrl     = Project URL
//   supabaseAnonKey = anon public key (공개용 키. service_role 키는 절대 넣지 말 것)
window.JOHAPONE_CONFIG = {
  supabaseUrl: 'https://dpytffriiodsvpwxfbiv.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRweXRmZnJpaW9kc3Zwd3hmYml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxODE5OTMsImV4cCI6MjEwODc1Nzk5M30.HIAQvaBN3jgdHanSaFv-BoZerFcJRYKRPwj4Xbnw3o0',
  tenant: 'demo-oo1'
};
