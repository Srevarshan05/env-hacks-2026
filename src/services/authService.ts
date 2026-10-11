import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signOut,
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Register a new user. `name` is stored as the standard Cognito `name` attribute.
export async function registerUser(
  name: string,
  email: string,
  password: string
) {
  return signUp({
    username: normalizeEmail(email),
    password,
    options: {
      userAttributes: {
        email: normalizeEmail(email),
        name: name.trim()
      }
    }
  });
}

// Verify the email confirmation code
export async function verifyEmail(
  email: string,
  code: string
) {
  return confirmSignUp({
    username: normalizeEmail(email),
    confirmationCode: code.trim()
  });
}

// Resend a verification code
export async function resendVerificationCode(email: string) {
  return resendSignUpCode({
    username: normalizeEmail(email)
  });
}

// Login with email and password
export async function loginUser(
  email: string,
  password: string
) {
  const result = await signIn({
    username: normalizeEmail(email),
    password
  });
  if (result.isSignedIn) await refreshAuth();
  return result;
}

// Get the Cognito ID token (refreshed by Amplify when it expires). The backend requires the ID token
// because it carries the email and name it needs to create the RDS user.
export async function getIdToken() {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString() ?? null;
}

// When this sign-in happened (ID token `auth_time`, seconds since epoch).
export async function getSignInTime() {
  const session = await fetchAuthSession();
  const authTime = session.tokens?.idToken?.payload.auth_time;
  return typeof authTime === "number" ? new Date(authTime * 1000) : null;
}

// Check current signed-in user
export async function getLoggedInUser() {
  return getCurrentUser();
}

// Logout
export async function logoutUser() {
  await signOut();
  setAuth({ status: "signedOut" });
}

// Shared sign-in state for the whole app, read through useAuth().
export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string; name: string };

let authState: AuthState = { status: "loading" };
let started = false;
const listeners = new Set<() => void>();

function setAuth(next: AuthState) {
  authState = next;
  listeners.forEach(listener => listener());
}

export async function refreshAuth() {
  try {
    const user = await getCurrentUser();
    const attributes = await fetchUserAttributes().catch(() => ({} as Record<string, string | undefined>));
    setAuth({
      status: "signedIn",
      userId: user.userId,
      email: attributes.email ?? user.signInDetails?.loginId ?? "",
      name: attributes.name ?? ""
    });
  } catch {
    setAuth({ status: "signedOut" });
  }
}

export function getAuthState() {
  return authState;
}

export function subscribeAuth(listener: () => void) {
  if (!started) {
    started = true;
    void refreshAuth();
    Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn") void refreshAuth();
      else if (payload.event === "signedOut" || payload.event === "tokenRefresh_failure") setAuth({ status: "signedOut" });
    });
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Friendlier text for the Cognito errors users hit most often.
export function authErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Something went wrong. Please try again.";
  switch (error.name) {
    case "UsernameExistsException": return "An account with this email already exists. Try logging in instead.";
    case "NotAuthorizedException": return "Incorrect email or password.";
    case "UserNotFoundException": return "Incorrect email or password.";
    case "CodeMismatchException": return "That code isn’t right. Check the email and try again.";
    case "ExpiredCodeException": return "That code has expired. Request a new one below.";
    case "LimitExceededException":
    case "TooManyRequestsException": return "Too many attempts. Please wait a moment and try again.";
    default: return error.message;
  }
}
