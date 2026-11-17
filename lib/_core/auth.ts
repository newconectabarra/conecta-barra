import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";

const BIOMETRIC_SESSION_KEY = "conecta_biometric_session";
const BIOMETRIC_USER_KEY = "conecta_biometric_user";

type AuthChangeListener = () => void;
const authChangeListeners = new Set<AuthChangeListener>();

/**
 * Permite que componentes globais (ex.: ponte de push) saibam quando o usuário
 * entrou ou saiu. Sem isso, quem foi montado antes do login nunca percebe a sessão nova.
 */
export function subscribeAuthChange(listener: AuthChangeListener): () => void {
  authChangeListeners.add(listener);
  return () => {
    authChangeListeners.delete(listener);
  };
}

function notifyAuthChange() {
  authChangeListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn("[Auth] Listener de mudança de sessão falhou:", error);
    }
  });
}

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role?: "user" | "admin";
  residentStatus?: "pending" | "approved" | "blocked" | null;
  avatarUrl?: string | null;
  lastSignedIn: Date;
};

export async function getSessionToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      const token = window.localStorage.getItem(SESSION_TOKEN_KEY);
      console.log("[Auth] Web session token:", token ? "present" : "missing");
      return token;
    }

    // Use SecureStore for native
    console.log("[Auth] Getting session token...");
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    console.log(
      "[Auth] Session token retrieved from SecureStore:",
      token ? "present" : "missing",
    );
    return token;
  } catch (error) {
    console.error("[Auth] Failed to get session token:", error);
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
      console.log("[Auth] Web session token stored");
      return;
    }

    // Use SecureStore for native
    console.log("[Auth] Setting session token...");
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    console.log("[Auth] Session token stored in SecureStore successfully");
  } catch (error) {
    console.error("[Auth] Failed to set session token:", error);
    throw error;
  }
}

export async function removeSessionToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
      console.log("[Auth] Web session token removed");
      return;
    }

    // Use SecureStore for native
    console.log("[Auth] Removing session token...");
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    console.log("[Auth] Session token removed from SecureStore successfully");
  } catch (error) {
    console.error("[Auth] Failed to remove session token:", error);
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    console.log("[Auth] Getting user info...");

    let info: string | null = null;
    if (Platform.OS === "web") {
      // Use localStorage for web
      info = window.localStorage.getItem(USER_INFO_KEY);
    } else {
      // Use SecureStore for native
      info = await SecureStore.getItemAsync(USER_INFO_KEY);
    }

    if (!info) {
      console.log("[Auth] No user info found");
      return null;
    }
    const user = JSON.parse(info);
    console.log("[Auth] User info retrieved: present");
    return user;
  } catch (error) {
    console.error("[Auth] Failed to get user info:", error);
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    console.log("[Auth] Setting user info...");

    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      console.log("[Auth] User info stored in localStorage successfully");
      notifyAuthChange();
      return;
    }

    // Use SecureStore for native
    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
    console.log("[Auth] User info stored in SecureStore successfully");
    notifyAuthChange();
  } catch (error) {
    console.error("[Auth] Failed to set user info:", error);
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.removeItem(USER_INFO_KEY);
      notifyAuthChange();
      return;
    }

    // Use SecureStore for native
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
    notifyAuthChange();
  } catch (error) {
    console.error("[Auth] Failed to clear user info:", error);
  }
}

export async function setBiometricSession(token: string, user: User): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(BIOMETRIC_SESSION_KEY, token);
  await SecureStore.setItemAsync(BIOMETRIC_USER_KEY, JSON.stringify(user));
}

export async function getBiometricSession(): Promise<{ token: string; user: User } | null> {
  if (Platform.OS === "web") return null;
  try {
    const [token, rawUser] = await Promise.all([
      SecureStore.getItemAsync(BIOMETRIC_SESSION_KEY),
      SecureStore.getItemAsync(BIOMETRIC_USER_KEY),
    ]);
    if (!token || !rawUser) return null;
    return { token, user: JSON.parse(rawUser) as User };
  } catch {
    return null;
  }
}

export async function clearBiometricSession(): Promise<void> {
  if (Platform.OS === "web") return;
  await Promise.all([
    SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_USER_KEY),
  ]);
}
