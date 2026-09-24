(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const onLoginPage = document.body?.dataset.page === "login" || location.pathname.endsWith("/login.html");
  const loginUrl = "/login.html";
  const appUrl = "/index.html";

  function configurationIsValid() {
    return Boolean(
      config.SUPABASE_URL &&
      config.SUPABASE_ANON_KEY &&
      !config.SUPABASE_URL.includes("COLE_AQUI") &&
      !config.SUPABASE_ANON_KEY.includes("COLE_AQUI")
    );
  }

  function setLoginError(message) {
    const element = document.getElementById("loginError");
    if (element) element.textContent = message || "";
  }

  if (!configurationIsValid() || !window.supabase) {
    if (onLoginPage) setLoginError("Configuração do Supabase ausente ou inválida.");
    else location.replace(loginUrl + "?erro=configuracao");
    return;
  }

  const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.supabaseClient = client;

  async function requireSession() {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) {
      location.replace(loginUrl);
      return null;
    }
    window.currentSession = data.session;
    document.body.classList.remove("auth-pending");
    window.dispatchEvent(new CustomEvent("app-auth-ready", { detail: data.session }));
    return data.session;
  }

  async function initializeLogin() {
    const { data } = await client.auth.getSession();
    if (data.session) {
      location.replace(appUrl);
      return;
    }

    const form = document.getElementById("loginForm");
    const button = document.getElementById("loginButton");
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setLoginError("");
      button.disabled = true;
      button.textContent = "Entrando...";
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      const { data: signInData, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !signInData.session) {
        setLoginError(error?.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : (error?.message || "Não foi possível entrar."));
        button.disabled = false;
        button.textContent = "Entrar";
        return;
      }
      location.replace(appUrl);
    });
  }

  window.signOutApp = async function () {
    await client.auth.signOut();
    location.replace(loginUrl);
  };

  if (onLoginPage) {
    initializeLogin();
  } else {
    requireSession();
    const logoutButton = document.getElementById("logoutBtn");
    if (logoutButton) logoutButton.addEventListener("click", window.signOutApp);
  }
})();
