// 안드로이드 APK를 서명 빌드하여 GitHub Releases(cloim/domo)에 올린다.
// 사용: node scripts/release-android.mjs [--notes "변경 내용"] [--dry-run]
// 버전은 루트 package.json 의 version 을 쓴다. 올리기 전에 버전을 먼저 올려 두어야 한다.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps", "web");
const android = join(web, "android");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tag = `v${version}`;
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const notesIndex = args.indexOf("--notes");
const notes = notesIndex >= 0 ? args[notesIndex + 1] : `도모 ${tag}`;

// 운영 주소는 Git에서 제외한 루트 .env에서 읽고, Vite 빌드에 명시적으로 주입한다.
const { PUBLIC_URL } = parseEnv(readFileSync(join(root, ".env"), "utf8"));
const apiUrl = new URL(PUBLIC_URL);
if (apiUrl.protocol !== "https:" || apiUrl.hostname === "example.com" || apiUrl.hostname.endsWith(".example.com") || apiUrl.username || apiUrl.password || apiUrl.pathname !== "/" || apiUrl.search || apiUrl.hash) {
  throw new Error(".env의 PUBLIC_URL에 실제 운영 서버의 HTTPS 출처를 설정해 주세요.");
}
process.env.VITE_API_BASE = apiUrl.origin;
// 운영 웹 출력(dist)을 보호하고 APK 전용 웹 출력을 동기화한다.
const mobileWeb = join(root, "release", "android-web");
process.env.DOMO_WEB_DIR = mobileWeb;

// Windows의 .cmd/.bat(pnpm, npx, gradlew)은 셸이 필요하고, 셸을 쓰면 띄어쓰기 인수가 쪼개지므로 gh 같은 실행 파일은 셸 없이 부른다.
const run = (cmd, cmdArgs, cwd, shell = process.platform === "win32") => {
  console.log(`> ${cmd} ${cmdArgs.join(" ")}`);
  execFileSync(cmd, cmdArgs, { cwd, stdio: ["ignore", "inherit", "inherit"], shell });
};

const existing = (() => {
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", "cloim/domo"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
if (existing && !dryRun) throw new Error(`${tag} 릴리스가 이미 있습니다. package.json 버전을 올려 주세요.`);

run("pnpm", ["--filter", "@domo/web", "typecheck"], root);
run("pnpm", ["--filter", "@domo/web", "exec", "vite", "build", "--outDir", mobileWeb, "--emptyOutDir"], root);
run("npx", ["cap", "sync", "android"], web);
run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["assembleRelease", "--no-daemon", "-q"], android);

const outDir = join(root, "release");
mkdirSync(outDir, { recursive: true });
const apk = join(outDir, `domo-${tag}.apk`);
copyFileSync(join(android, "app", "build", "outputs", "apk", "release", "app-release.apk"), apk);
console.log(`APK: ${apk}`);

if (dryRun) {
  console.log("dry-run: 릴리스 업로드를 건너뜁니다.");
} else {
  run("gh", ["release", "create", tag, apk, "--repo", "cloim/domo", "--title", `도모 ${tag}`, "--notes", notes], root, false);
}
