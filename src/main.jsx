import React from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App.jsx";

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || "dev-80qboln3b7g4zaoy.us.auth0.com";
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || "gavn0xykWuIFmCU8bVEhVCqcqLScRYwI";
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE || "";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        scope: "openid profile email",
        ...(auth0Audience ? { audience: auth0Audience } : {})
      }}
    >
      <App />
    </Auth0Provider>
  </React.StrictMode>
);
