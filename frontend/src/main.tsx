import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { MeProvider } from "./hooks/useMe";
import "./index.css";
import "./gmv-tokens.css";
import "./gmv-theme.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MeProvider>
          <App />
        </MeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
