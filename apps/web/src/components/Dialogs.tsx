import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Modal } from "./Modal/index.js";

interface DialogRequest {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  kind: "alert" | "confirm";
}

interface DialogApi {
  alert: (title: string, message: ReactNode) => Promise<void>;
  confirm: (options: Omit<DialogRequest, "kind">) => Promise<boolean>;
}

const DialogContext = createContext<DialogApi | null>(null);

/** 작업 결과와 오류는 공용 Modal(sm)로 알리고, 되돌리기 어려운 동작은 확인을 받는다. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const resolver = useRef<(value: boolean) => void>(() => {});
  const confirmRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(
    (req: DialogRequest) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setRequest(req);
      }),
    [],
  );

  const api = useRef<DialogApi>({
    alert: async (title, message) => void (await open({ title, message, kind: "alert" })),
    confirm: (options) => open({ ...options, kind: "confirm" }),
  });

  const close = (value: boolean) => {
    setRequest(null);
    resolver.current(value);
  };

  return (
    <DialogContext.Provider value={api.current}>
      {children}
      <Modal
        isOpen={!!request}
        onClose={() => close(false)}
        title={request?.title ?? ""}
        size="sm"
        draggable={false}
        initialFocusRef={confirmRef}
        footer={
          <>
            {request?.kind === "confirm" && (
              <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
                {request.cancelLabel ?? "취소"}
              </button>
            )}
            <button type="button" ref={confirmRef} className={`btn ${request?.danger ? "btn-danger" : "btn-primary"}`} onClick={() => close(true)}>
              {request?.confirmLabel ?? "확인"}
            </button>
          </>
        }
      >
        <div className="dialog-message">{request?.message}</div>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("DialogProvider 안에서 사용해야 합니다.");
  return ctx;
}
