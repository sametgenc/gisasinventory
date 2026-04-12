import { Flows, AuthenticatorType } from "./lib";
import type { AuthResponse } from "./types";

export const URLs = Object.freeze({
  LOGIN_URL: "/login",
  LOGIN_REDIRECT_URL: "/dashboard",
  LOGOUT_REDIRECT_URL: "/",
  ACCOUNT: "/account",
});

const flow2path: Record<string, string> = {};
flow2path[Flows.LOGIN] = "/login";
flow2path[Flows.SIGNUP] = "/register";
flow2path[Flows.REAUTHENTICATE] = "/auth/reauthenticate";
flow2path[Flows.VERIFY_EMAIL] = "/auth/email/verify";
flow2path[Flows.PASSWORD_RESET_BY_CODE] = "/auth/password/reset";
flow2path[Flows.MFA_AUTHENTICATE] = "/auth/mfa/authenticate";
flow2path[`${Flows.MFA_AUTHENTICATE}:${AuthenticatorType.TOTP}`] = "/auth/mfa/authenticate";
flow2path[`${Flows.MFA_AUTHENTICATE}:${AuthenticatorType.WEBAUTHN}`] = "/auth/mfa/authenticate";
flow2path[`${Flows.MFA_AUTHENTICATE}:${AuthenticatorType.RECOVERY_CODES}`] = "/auth/mfa/authenticate";
flow2path[Flows.MFA_WEBAUTHN_LOGIN] = "/login"; // Handled on login page
flow2path[Flows.MFA_WEBAUTHN_SIGNUP] = "/register/passkey/create";
flow2path[Flows.PROVIDER_SIGNUP] = "/account/provider/signup";

export function pathForFlow(
  flow: { id: string; types?: string[] },
  typ?: string,
): string {
  let key = flow.id;
  if (typeof flow.types !== "undefined" && flow.types.length > 0) {
    typ = typ ?? flow.types[0];
    key = `${key}:${typ}`;
  }
  console.log(
    `[Routing] Looking up path for key: "${key}" (Original ID: "${flow.id}")`,
  );
  const path = flow2path[key] ?? flow2path[flow.id];

  if (!path) {
    console.warn(`[Routing] Unknown path for flow key: ${key}`);
    console.log("[Routing] Available paths keys:", Object.keys(flow2path));
    // Fallback to dashboard or login if unknown, or throw
    return "/dashboard";
  }
  return path;
}

export function pathForPendingFlow(auth: AuthResponse): string | null {
  console.log("[Routing] Checking flows:", auth.data?.flows);
  if (!auth.data?.flows) return null;
  const flow = auth.data.flows.find((flow) => flow.is_pending);
  console.log("[Routing] Pending flow found:", flow);
  if (flow) {
    console.log("[Routing] Processing pending flow:", flow);
    const path = pathForFlow(flow);
    console.log("[Routing] Resolved path for pending flow:", path);
    return path;
  }
  return null;
}
