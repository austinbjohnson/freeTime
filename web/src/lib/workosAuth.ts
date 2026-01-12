type WorkOSConfig = {
  clientId: string;
  redirectUri: string;
};

export type WorkOSUser = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  profile_picture_url?: string | null;
};

export type WorkOSSession = {
  accessToken?: string;
  refreshToken?: string;
  user: WorkOSUser;
  convexUserId?: string;
};

const sessionKey = "freetime.workos.session";
export const sessionUpdatedEvent = "freetime.workos.sessionUpdated";
const verifierKey = "freetime.workos.verifier";
const stateKey = "freetime.workos.state";

function getConfig(): WorkOSConfig {
  const clientId = process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID;
  if (!clientId) {
    throw new Error("NEXT_PUBLIC_WORKOS_CLIENT_ID is not set");
  }
  const redirectUri =
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??
    `${window.location.origin}/auth/callback`;
  return { clientId, redirectUri };
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Base64Url(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function randomBase64Url(bytes: number) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64UrlEncode(data);
}

export function getStoredSession(): WorkOSSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(sessionKey);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as WorkOSSession;
  } catch {
    return null;
  }
}

export function storeSession(update: Partial<WorkOSSession>): WorkOSSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const current = getStoredSession();
  if (!current && !update.user) {
    return null;
  }
  const next = {
    ...(current ?? {}),
    ...update,
  } as WorkOSSession;
  window.localStorage.setItem(sessionKey, JSON.stringify(next));
  window.dispatchEvent(new Event(sessionUpdatedEvent));
  return next;
}

export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(sessionKey);
  window.dispatchEvent(new Event(sessionUpdatedEvent));
}

export function clearAuthState() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(verifierKey);
  window.sessionStorage.removeItem(stateKey);
}

export async function startWorkosLogin() {
  const { clientId, redirectUri } = getConfig();
  const codeVerifier = randomBase64Url(32);
  const state = randomBase64Url(16);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  window.sessionStorage.setItem(verifierKey, codeVerifier);
  window.sessionStorage.setItem(stateKey, state);

  const url = new URL("https://api.workos.com/user_management/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("provider", "authkit");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  window.location.assign(url.toString());
}

export async function exchangeWorkosCode(code: string) {
  const { clientId } = getConfig();
  const codeVerifier = window.sessionStorage.getItem(verifierKey);
  if (!codeVerifier) {
    throw new Error("Missing PKCE verifier. Try logging in again.");
  }

  const response = await fetch(
    "https://api.workos.com/user_management/authenticate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
      }),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "WorkOS authentication failed.");
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    user?: WorkOSUser;
  };

  if (!data.user) {
    throw new Error("WorkOS user profile missing from response.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: data.user,
  };
}

export function getStoredState() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(stateKey);
}
