(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const isLoginPage = document.body.dataset.page === "login";
  const directoryUrl = new URL("./", window.location.href);
  const loginUrl = new URL("login.html", directoryUrl).href;
  const appUrl = new URL("index.html", directoryUrl).href;

  function showLoginError(message) {
    const element = document.getElementById("loginError");
    if (element) element.textContent = message || "";
  }

  function validConfig() {
    return Boolean(
      config.SUPABASE_URL &&
      config.SUPABASE_ANON_KEY &&
      !config.SUPABASE_URL.includes("COLE_AQUI") &&
      !config.SUPABASE_ANON_KEY.includes("COLE_AQUI")
    );
  }

  function setButtonBusy(button, busy, text) {
    if (!button) return;
    button.disabled = busy;
    button.textContent = text;
  }

  if (!window.supabase) {
    showLoginError("Não foi possível carregar a biblioteca do Supabase.");
    if (!isLoginPage) window.location.replace(loginUrl + "?erro=biblioteca");
    return;
  }

  if (!validConfig()) {
    showLoginError("Configure SUPABASE_URL e SUPABASE_ANON_KEY em supabase-config.js.");
    if (!isLoginPage) window.location.replace(loginUrl + "?erro=configuracao");
    return;
  }

  const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  window.supabaseClient = client;

  async function logout() {
    const button = document.getElementById("logoutBtn");
    setButtonBusy(button, true, "Saindo...");

    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) console.error("Erro ao encerrar sessão:", error);
    } catch (error) {
      console.error("Falha de comunicação ao sair:", error);
    } finally {
      window.currentSession = null;
      window.location.replace(loginUrl);
    }
  }
  window.signOutApp = logout;

  function connectLogoutButton() {
    const button = document.getElementById("logoutBtn");
    if (!button || button.dataset.logoutConnected === "true") return;
    button.dataset.logoutConnected = "true";
    button.addEventListener("click", logout);
  }

  async function protectApplication() {
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) {
        window.location.replace(loginUrl);
        return;
      }
      window.currentSession = data.session;
      connectLogoutButton();
      document.body.classList.remove("auth-pending");
      window.dispatchEvent(new CustomEvent("app-auth-ready", { detail: data.session }));
    } catch (error) {
      console.error("Falha ao verificar sessão:", error);
      window.location.replace(loginUrl + "?erro=sessao");
    }
  }

  async function prepareLogin() {
    try {
      const { data } = await client.auth.getSession();
      if (data.session) {
        window.location.replace(appUrl);
        return;
      }
    } catch (error) {
      console.error("Falha ao consultar sessão:", error);
    }

    const form = document.getElementById("loginForm");
    const button = document.getElementById("loginButton");
    if (!form || !button) {
      showLoginError("Formulário de login não encontrado.");
      return;
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      showLoginError("");
      setButtonBusy(button, true, "Entrando...");

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      if (!email || !password) {
        showLoginError("Informe o e-mail e a senha.");
        setButtonBusy(button, false, "Entrar");
        return;
      }

      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error || !data.session) {
          showLoginError(error?.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : (error?.message || "Não foi possível entrar."));
          setButtonBusy(button, false, "Entrar");
          return;
        }
        window.location.replace(appUrl);
      } catch (error) {
        console.error("Falha no login:", error);
        showLoginError("Falha de comunicação com o Supabase. Verifique a URL e a chave pública.");
        setButtonBusy(button, false, "Entrar");
      }
    });
  }

  client.auth.onAuthStateChange(function (event) {
    if (event === "SIGNED_OUT" && !isLoginPage) window.location.replace(loginUrl);
  });

  if (isLoginPage) prepareLogin();
  else protectApplication();
})();
