import { Capacitor, registerPlugin } from "@capacitor/core";
const native = Capacitor.getPlatform() === "android";
export interface WidgetAppearance { backgroundColor: string; transparency: number }
export const DomoWidget = registerPlugin<{ getAppearance(): Promise<WidgetAppearance>; setAppearance(options: WidgetAppearance): Promise<void>; update(options: { month: string; balance: number; updatedAt: number }): Promise<void>; clear(): Promise<void> }>("DomoWidget");
window.addEventListener("domo:signed-out", () => { if (native) void DomoWidget.clear().catch(() => {}); });
export const widgetSupported = native;
