import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.budgetwing.app",
  appName: "BudgetWing",
  webDir: "dist",
  server: {
    // During development you can point the app at a live dev server:
    // url: "http://YOUR_PC_LAN_IP:5173",
    // cleartext: true,
    androidScheme: "https",
  },
};

export default config;
