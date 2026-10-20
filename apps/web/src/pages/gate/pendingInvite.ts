const KEY = "domo.pendingInvite";

/** 초대 링크로 들어왔지만 아직 로그인 전일 때 코드를 잠시 보관한다. */
export const pendingInvite = {
  peek(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save(code: string) {
    try {
      sessionStorage.setItem(KEY, code.toUpperCase());
    } catch {
      // 저장소를 쓸 수 없으면 합류 화면에서 코드를 다시 입력받는다.
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // 무시
    }
  },
};
