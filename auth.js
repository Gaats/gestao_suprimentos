(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const page = document.body.dataset.page;
  const isLoginPage = page === "login";
  const baseUrl = new URL("./", window.location.href);
  const loginUrl = new URL("login.html", baseUrl).href;
  const appUrl = new URL("index.html", baseUrl).href;

  function loginError(message) {
    const element = document.getElementById("loginError");
    if (element) element.textContent = message || "";
  }

  function configIsValid() {
    return Boolean(
      config.SUPABASE_URL && config.SUPABASE_ANON_KEY &&
      !config.SUPABASE_URL.includes("COLE_AQUI") &&
      !config.SUPABASE_ANON_KEY.includes("COLE_AQUI")
    );
  }

  if (!window.supabase) {
    loginError("Não foi possível carregar a biblioteca de autenticação.");
    if (!isLoginPage) window.location.replace(loginUrl + "?erro=biblioteca");
    return;
  }

  if (!configIsValid()) {
    loginError("Preencha SUPABASE_URL e SUPABASE_ANON_KEY no arquivo supabase-config.js.");
    if (!isLoginPage) window.location.replace(loginUrl + "?erro=configuracao");
    return;
  }

  const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.supabaseClient = client;

  async function protectApp() {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) {
      window.location.replace(loginUrl);
      return;
    }
    window.currentSession = data.session;
    document.body.classList.remove("auth-pending");
    window.dispatchEvent(new CustomEvent("app-auth-ready", { detail: data.session }));
  }

  async function prepareLogin() {
    const { data } = await client.auth.getSession();
    if (data.session) {
      window.location.replace(appUrl);
      return;
    }

    const form = document.getElementById("loginForm");
    const button = document.getElementById("loginButton");
    if (!form || !button) {
      loginError("Formulário de login não encontrado.");
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      loginError("");
      button.disabled = true;
      button.textContent = "Entrando...";

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      if (!email || !password) {
        loginError("Informe o e-mail e a senha.");
        button.disabled = false;
        button.textContent = "Entrar";
        return;
      }

      const { data: signInData, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !signInData.session) {
        loginError(error?.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : (error?.message || "Não foi possível entrar."));
        button.disabled = false;
        button.textContent = "Entrar";
        return;
      }
      window.location.replace(appUrl);
    });
  }

  window.signOutApp = async function () {
    await client.auth.signOut();
    window.location.replace(loginUrl);
  };

  if (isLoginPage) prepareLogin();
  else protectApp();
})();
