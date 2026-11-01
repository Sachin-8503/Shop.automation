const loginForm = document.querySelector("#staffLoginForm");
const loginButton = document.querySelector("#loginButton");
const loginError = document.querySelector("#loginError");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginError.hidden = true;

  try {
    const response = await fetch("/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: new FormData(loginForm).get("password") })
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Login API returned a web page instead of JSON. Open this page through the Node server, for example http://localhost:3002/shopkeeper-login.html, not Live Server or file://.");
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Sign in failed.");
    window.location.replace("/shopkeeper.html");
  } catch (error) {
    loginError.textContent = error.message || "Could not reach the shop server.";
    loginError.hidden = false;
    loginButton.disabled = false;
  }
});