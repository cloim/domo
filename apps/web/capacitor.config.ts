import type { CapacitorConfig } from "@capacitor/cli";

// 에뮬레이터 점검용 빌드(DOMO_CAP_TEST=1)는 PC의 임시 서버(http://localhost, adb reverse)에 붙도록 http 출처를 쓴다.
const testBuild = process.env.DOMO_CAP_TEST === "1";

const config: CapacitorConfig = {
  appId: "com.cloimism.domo",
  appName: "도모",
  webDir: "dist",
  android: { buildOptions: { releaseType: "APK" } },
  ...(testBuild ? { server: { androidScheme: "http", cleartext: true } } : {}),
};

export default config;
