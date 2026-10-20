import { Capacitor } from "@capacitor/core";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Modal } from "./components/Modal/index.js";
import { checkForUpdate, openDownload, type ReleaseInfo } from "./lib/update.ts";

const PromptContext = createContext<(release: ReleaseInfo) => void>(() => {});

/** 앱 시작 시 새 버전을 확인하고, 설정 화면의 수동 확인도 같은 안내 창을 쓴다. */
export function UpdatePromptProvider({ children }: { children: ReactNode }) {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    checkForUpdate()
      .then((r) => r.hasUpdate && r.latest && setRelease(r.latest))
      .catch(() => {}); // 시작 시 확인 실패는 사용 흐름을 막지 않는다. 설정에서 다시 확인할 수 있다.
  }, []);

  return (
    <PromptContext.Provider value={setRelease}>
      {children}
      <Modal
        isOpen={!!release}
        onClose={() => setRelease(null)}
        title={`새 버전 ${release?.version ?? ""}`}
        size="sm"
        draggable={false}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRelease(null)}>
              나중에
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (release) void openDownload(release.apkUrl ?? release.pageUrl);
                setRelease(null);
              }}
            >
              내려받기
            </button>
          </>
        }
      >
        <p className="dialog-message" style={{ marginBottom: 8 }}>
          새 버전을 내려받아 설치하면 최신 기능을 쓸 수 있어요. 설치 중 '알 수 없는 앱 설치' 허용을 요청하면 허용해 주세요.
        </p>
        {release?.notes && <p className="dialog-message" style={{ fontSize: 14, color: "var(--ink-3)" }}>{release.notes}</p>}
      </Modal>
    </PromptContext.Provider>
  );
}

export const useUpdatePrompt = () => useContext(PromptContext);
