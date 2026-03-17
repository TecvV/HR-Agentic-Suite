"use strict";

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const resetForm = document.getElementById("resetForm");
const statusEl = document.getElementById("authStatus");
const guestBtn = document.getElementById("guestBtn");
const showLoginBtn = document.getElementById("showLoginBtn");
const showSignupBtn = document.getElementById("showSignupBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const authToggleEl = document.querySelector(".auth-toggle");
const googleAuthBtn = document.getElementById("googleAuthBtn");
let googleClientReady = false;
let googleInitStarted = false;

function showLogin() {
  loginForm.style.display = "grid";
  signupForm.style.display = "none";
  resetForm.style.display = "none";
  showLoginBtn.classList.add("active-tab");
  showSignupBtn.classList.remove("active-tab");
}

function showSignup() {
  loginForm.style.display = "none";
  signupForm.style.display = "grid";
  resetForm.style.display = "none";
  showSignupBtn.classList.add("active-tab");
  showLoginBtn.classList.remove("active-tab");
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    statusEl.textContent = "Logging in...";
    await postJson("/api/auth/login", {
      email: document.getElementById("loginEmail").value.trim(),
      password: document.getElementById("loginPassword").value,
    });
    statusEl.textContent = "Login successful. Redirecting...";
    window.location.href = "/frontend/upload.html";
  } catch (err) {
    statusEl.textContent = `Login failed: ${err.message}`;
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    statusEl.textContent = "Creating account...";
    await postJson("/api/auth/signup", {
      name: document.getElementById("signupName").value.trim(),
      email: document.getElementById("signupEmail").value.trim(),
      password: document.getElementById("signupPassword").value,
    });
    statusEl.textContent = "Signup successful. Redirecting...";
    window.location.href = "/frontend/upload.html";
  } catch (err) {
    statusEl.textContent = `Signup failed: ${err.message}`;
  }
});

guestBtn.addEventListener("click", async () => {
  try {
    statusEl.textContent = "Starting guest session...";
    await postJson("/api/auth/guest", {});
    statusEl.textContent = "Guest session started. Redirecting...";
    window.location.href = "/frontend/index.html";
  } catch (err) {
    statusEl.textContent = `Guest login failed: ${err.message}`;
  }
});

showLoginBtn.addEventListener("click", showLogin);
showSignupBtn.addEventListener("click", showSignup);
showLogin();

forgotPasswordBtn.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  if (!email) {
    statusEl.textContent = "Enter your email first, then click Forgot Password.";
    return;
  }
  try {
    statusEl.textContent = "Sending password reset email...";
    await postJson("/api/auth/forgot-password", { email });
    statusEl.textContent = "Reset email sent. Please check your inbox.";
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("reset_token") || "";
  const email = document.getElementById("resetEmail").value.trim().toLowerCase();
  const newPassword = document.getElementById("resetPassword").value;
  try {
    statusEl.textContent = "Resetting password...";
    await postJson("/api/auth/reset-password", { email, token, newPassword });
    statusEl.textContent = "Password reset successful. Login with your new password.";
    if (authToggleEl) authToggleEl.style.display = "flex";
    params.delete("reset_token");
    params.delete("email");
    const cleanQuery = params.toString();
    window.history.replaceState({}, "", `/frontend/auth.html${cleanQuery ? `?${cleanQuery}` : ""}`);
    document.getElementById("loginEmail").value = email;
    showLogin();
  } catch (err) {
    statusEl.textContent = `Password reset failed: ${err.message}`;
  }
});

(function initResetFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("reset_token");
  const email = params.get("email");
  if (!token || !email) return;
  loginForm.style.display = "none";
  signupForm.style.display = "none";
  resetForm.style.display = "grid";
  if (authToggleEl) authToggleEl.style.display = "none";
  showLoginBtn.classList.remove("active-tab");
  showSignupBtn.classList.remove("active-tab");
  document.getElementById("resetEmail").value = email;
  statusEl.textContent = "Set a new password to complete reset.";
})();

async function initGoogleAuth() {
  if (googleInitStarted) return;
  googleInitStarted = true;
  try {
    const response = await fetch("/api/auth/google-config");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Google auth config unavailable.");
    const clientId = String(data.clientId || "").trim();
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");
    let retries = 0;
    while (!window.google?.accounts?.id && retries < 20) {
      // Wait up to ~4 seconds for Google SDK script to load.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries += 1;
    }
    if (!window.google?.accounts?.id) throw new Error("Google Sign-In SDK failed to load.");
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (credentialResponse) => {
        try {
          statusEl.textContent = "Verifying Google account...";
          await postJson("/api/auth/google", { credential: credentialResponse.credential });
          statusEl.textContent = "Google login successful. Redirecting...";
          window.location.href = "/frontend/upload.html";
        } catch (err) {
          statusEl.textContent = `Google login failed: ${err.message}`;
        }
      },
    });
    googleClientReady = true;
    if (googleAuthBtn) googleAuthBtn.disabled = false;
  } catch (err) {
    googleClientReady = false;
    googleInitStarted = false;
    if (googleAuthBtn) googleAuthBtn.disabled = false;
    statusEl.textContent = `Google setup failed: ${err.message}`;
  }
}

googleAuthBtn.addEventListener("click", () => {
  if (!googleClientReady && !googleInitStarted) {
    initGoogleAuth();
  }
  if (!googleClientReady || !window.google?.accounts?.id) {
    statusEl.textContent = "Google Sign-In is not ready yet. Try again.";
    return;
  }
  statusEl.textContent = "Opening Google verification...";
  window.google.accounts.id.prompt();
});

if (googleAuthBtn) googleAuthBtn.disabled = true;
window.addEventListener("load", () => {
  initGoogleAuth();
});
