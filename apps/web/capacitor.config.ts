import type { CapacitorConfig } from "@capacitor/cli";

// 에뮬레이터 점검용 빌드(DOMO_CAP_TEST=1)는 PC의 임시 서버(http://localhost, adb reverse)에 붙도록 http 출처를 쓴다.
const testBuild = process.env.DOMO_CAP_TEST === "1";

const config: CapacitorConfig = {
  appId: "com.cloimism.domo",
  appName: "도모",
  webDir: process.env.DOMO_WEB_DIR ?? "dist",
  android: { buildOptions: { releaseType: "APK" } },
  plugins: {
    // 구글 로그인만 쓴다. 나머지 로그인 SDK(특히 페이스북)는 광고 추적 권한을 끌고 와 Play 프로텍트 차단의 원인이 되므로 넣지 않는다.
    SocialLogin: { providers: { google: true, facebook: false, apple: false, twitter: false } },
  },
  ...(testBuild ? { server: { androidScheme: "http", cleartext: true } } : {}),
};

export default config;
