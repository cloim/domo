import { Capacitor, registerPlugin } from "@capacitor/core";
const native = Capacitor.getPlatform() === "android";
export const DomoWidget = registerPlugin<{ update(options: { month: string; balance: number; updatedAt: number }): Promise<void>; clear(): Promise<void> }>("DomoWidget");
window.addEventListener("domo:signed-out", () => { if (native) void DomoWidget.clear().catch(() => {}); });
export const widgetSupported = native;
