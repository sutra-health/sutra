import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

WebBrowser.maybeCompleteAuthSession();

export type SutraIdentity = {
  subject: string;
  email: string;
  name: string;
  organizationId: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
};

export type OidcProvider = {
  id: "workos" | "keycloak";
  issuer: string;
  clientId: string;
  scopes: string[];
};

const env = process.env;

export const authProvider: OidcProvider = env.EXPO_PUBLIC_OIDC_PROVIDER === "keycloak"
  ? {
      id: "keycloak",
      issuer: env.EXPO_PUBLIC_KEYCLOAK_ISSUER ?? "https://identity.hospital.example/realms/sutra",
      clientId: env.EXPO_PUBLIC_OIDC_CLIENT_ID ?? "sutra-mobile",
      scopes: ["openid", "profile", "email", "offline_access"]
    }
  : {
      id: "workos",
      issuer: env.EXPO_PUBLIC_WORKOS_ISSUER ?? "https://api.workos.com/user_management",
      clientId: env.EXPO_PUBLIC_OIDC_CLIENT_ID ?? "client_demo_only",
      scopes: ["openid", "profile", "email", "offline_access"]
    };

export const DEMO_MODE = env.EXPO_PUBLIC_DEMO_MODE === "true";

const NATIVE_TOKEN_KEY = "sutra.native.refresh-token";
const NATIVE_ACCESS_TOKEN_KEY = "sutra.native.access-token";

/**
 * Native uses Authorization Code + PKCE and keeps only the refresh token in the
 * OS keychain/keystore. Web delegates the code exchange to the SUTRA BFF so the
 * session can be held in a Secure, SameSite, httpOnly cookie.
 */
export async function beginLogin(provider = authProvider) {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "sutra", path: "auth/callback" });
  const discovery = await AuthSession.fetchDiscoveryAsync(provider.issuer);
  const request = new AuthSession.AuthRequest({
    clientId: provider.clientId,
    scopes: provider.scopes,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== "success" || !result.params.code) return result;

  if (Platform.OS === "web") {
    const response = await fetch("/api/auth/callback", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: result.params.code,
        codeVerifier: request.codeVerifier,
        redirectUri,
        provider: provider.id
      })
    });
    if (!response.ok) throw new Error("The hospital session could not be created.");
    return response.json();
  }

  const token = await AuthSession.exchangeCodeAsync({
    clientId: provider.clientId,
    code: result.params.code,
    redirectUri,
    extraParams: { code_verifier: request.codeVerifier ?? "" }
  }, discovery);
  if (token.refreshToken) {
    await SecureStore.setItemAsync(NATIVE_TOKEN_KEY, token.refreshToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  }
  if (token.accessToken) await SecureStore.setItemAsync(NATIVE_ACCESS_TOKEN_KEY, token.accessToken);
  return token;
}

export async function accessToken() {
  if (Platform.OS === "web") return null;
  return SecureStore.getItemAsync(NATIVE_ACCESS_TOKEN_KEY);
}

export async function currentSession(): Promise<SutraIdentity | null> {
  if (Platform.OS === "web") {
    const response = await fetch("/api/auth/session", { credentials: "include" });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Unable to read the hospital session.");
    return response.json();
  }
  const refreshToken = await SecureStore.getItemAsync(NATIVE_TOKEN_KEY);
  if (!refreshToken) return null;
  // The API refresh endpoint validates issuer, audience, organization and role
  // claims before returning the least-privilege SUTRA identity.
  const response = await fetch(`${env.EXPO_PUBLIC_API_URL ?? "http://localhost:4100"}/api/auth/native-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken, provider: authProvider.id })
  });
  if (!response.ok) return null;
  return response.json();
}

export async function logout() {
  if (Platform.OS === "web") {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } else {
    await Promise.all([SecureStore.deleteItemAsync(NATIVE_TOKEN_KEY), SecureStore.deleteItemAsync(NATIVE_ACCESS_TOKEN_KEY)]);
  }
}

export function tenantFromClaims(identity: SutraIdentity) {
  // WorkOS Organization is the tenant boundary. Keycloak deployments map their
  // organization/group claim to the same normalized tenantId in the API.
  return identity.tenantId || identity.organizationId;
}
