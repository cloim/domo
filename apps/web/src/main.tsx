import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/500.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import "@fontsource/ibm-plex-sans-kr/700.css";
import "@fontsource-variable/hahmlet";
import "./components/Modal/modal.css";
import "./components/SelectControl/select-control.css";
import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App.tsx";
import { DialogProvider } from "./components/Dialogs.tsx";
import { UpdatePromptProvider } from "./UpdatePrompt.tsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DialogProvider>
          <UpdatePromptProvider>
            <App />
          </UpdatePromptProvider>
        </DialogProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
