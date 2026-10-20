import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cloimism.domo",
  appName: "도모",
  webDir: "dist",
  android: { buildOptions: { releaseType: "APK" } },
};

export default config;
