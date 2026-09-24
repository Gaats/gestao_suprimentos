(async function () {
  "use strict";
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("COLE_AQUI") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");
  const db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  let currentUser = null;
  let currentRole = "user";

  const STORAGE_KEY = "estoque-planta-v1";
  const LEGACY_STORAGE_KEY = "estoque-planta-demo-v1";
  const DEMO_IDS = new Set(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"]);
  const fmt = new Intl.NumberFormat("pt-BR");
  const today = new Date();
  const isoOffset = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  let movements = [];
  let pendingWriteoffId = null;
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function loadMovements() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      const saved = JSON.parse(current ?? legacy ?? "null");
      if (!Array.isArray(saved)) return [];

      const cleaned = saved.filter((movement) => !DEMO_IDS.has(movement.id));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return cleaned;
    } catch (_) {
      return [];
    }
  }

  function saveMovements() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movements));
  }

  function signedQuantity(movement) {
    return movement.type === "Entrada" ? Number(movement.quantity) : -Number(movement.quantity);
  }

  function inventoryMap() {
    return movements.reduce((map, movement) => {
      const key = movement.code.toUpperCase();
      if (!map[key]) map[key] = { code: key, item: movement.item, unit: movement.unit, minimum: Number(movement.minimum || 10), stock: 0 };
      map[key].stock += signedQuantity(movement);
      map[key].item = movement.item;
      map[key].unit = movement.unit;
      map[key].minimum = Number(movement.minimum || map[key].minimum || 10);
      return map;
    }, {});
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function showView(viewId) {
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
    $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (viewId === "history") renderTable();
    if (viewId === "register") setTimeout(() => $("#code").focus(), 80);
  }

  function renderAll() {
    renderKpis();
    renderMovementChart();
    renderRestock();
    renderDonut();
    renderEmployeeChart();
    renderTable();
    updateStockPreview();
    $("#lastUpdated").textContent = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date()).replace(".", "");
  }

  function renderKpis() {
    const inventory = Object.values(inventoryMap());
    const totalStock = inventory.reduce((sum, item) => sum + item.stock, 0);
    const entries = movements.filter((m) => m.type === "Entrada").reduce((sum, m) => sum + Number(m.quantity), 0);
    const exits = movements.filter((m) => m.type !== "Entrada").reduce((sum, m) => sum + Number(m.quantity), 0);
    const restock = inventory.filter((item) => item.stock <= item.minimum).length;
    const pending = movements.filter((m) => m.status === "Pendente").length;
    $("#pendingNavCount").textContent = pending;

    const cards = [
      { label: "Estoque atual", value: totalStock, note: `${inventory.length} itens cadastrados`, color: "#f47a20", soft: "#fff3e9", icon: '<path d="m4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10"/>' },
      { label: "Entradas", value: entries, note: "unidades recebidas", color: "#1f9d6a", soft: "#e9f8f1", icon: '<path d="M12 19V5m0 0L7 10m5-5 5 5M5 21h14"/>' },
      { label: "Saídas", value: exits, note: "entregas e trocas", color: "#244866", soft: "#ecf3f8", icon: '<path d="M12 5v14m0 0 5-5m-5 5-5-5M5 3h14"/>' },
      { label: "Para reposição", value: restock, note: "abaixo do mínimo", color: "#d8504f", soft: "#fff0ef", icon: '<path d="M12 9v4m0 4h.01M10.3 3.7 2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/>' },
      { label: "Pendências de baixa", value: pending, note: "aguardando a matriz", color: "#d99700", soft: "#fff7dd", icon: '<path d="M12 8v5l3 2m6-3a9 9 0 1 1-9-9"/>' }
    ];
    $("#kpiGrid").innerHTML = cards.map((card) => `
      <article class="kpi-card" style="--accent:${card.color};--soft:${card.soft}">
        <div class="kpi-top"><span>${card.label}</span><span class="kpi-icon"><svg viewBox="0 0 24 24">${card.icon}</svg></span></div>
        <strong>${fmt.format(card.value)}</strong><small>${card.note}</small>
      </article>`).join("");
  }

  function dailySeries() {
    const days = [...Array(7)].map((_, index) => {
      const date = isoOffset(index - 6);
      return { date, label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", ""), in: 0, out: 0 };
    });
    movements.forEach((movement) => {
      const day = days.find((d) => d.date === movement.date);
      if (!day) return;
      if (movement.type === "Entrada") day.in += Number(movement.quantity);
      else day.out += Number(movement.quantity);
    });
    return days;
  }

  function renderMovementChart() {
    const data = dailySeries();
    const width = 760, height = 230, pad = { x: 38, top: 18, bottom: 34 };
    const max = Math.max(10, ...data.flatMap((d) => [d.in, d.out]));
    const ceiling = Math.ceil(max / 10) * 10;
    const x = (i) => pad.x + i * ((width - pad.x * 2) / (data.length - 1));
    const y = (v) => height - pad.bottom - (v / ceiling) * (height - pad.top - pad.bottom);
    const pathFor = (key) => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
    const ticks = [0, .25, .5, .75, 1].map((p) => Math.round(ceiling * p));
    $("#movementChart").innerHTML = `
      <svg class="line-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="orangeFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f47a20" stop-opacity=".16"/><stop offset="1" stop-color="#f47a20" stop-opacity="0"/></linearGradient></defs>
        ${ticks.map((tick) => `<line class="grid-line" x1="${pad.x}" x2="${width-pad.x}" y1="${y(tick)}" y2="${y(tick)}"/><text class="axis-label" x="4" y="${y(tick)+4}">${tick}</text>`).join("")}
        <path class="area-orange" d="${pathFor("in")} L${x(data.length-1)},${height-pad.bottom} L${x(0)},${height-pad.bottom} Z"/>
        <path class="chart-line line-orange" d="${pathFor("in")}"/>
        <path class="chart-line line-navy" d="${pathFor("out")}"/>
        ${data.map((d, i) => `<circle class="chart-point" cx="${x(i)}" cy="${y(d.in)}" r="4" fill="#f47a20"/><circle class="chart-point" cx="${x(i)}" cy="${y(d.out)}" r="4" fill="#17324d"/><text class="axis-label" text-anchor="middle" x="${x(i)}" y="${height-9}">${d.label}</text>`).join("")}
      </svg>`;
  }

  function renderRestock() {
    const items = Object.values(inventoryMap()).filter((item) => item.stock <= item.minimum).sort((a, b) => a.stock - b.stock);
    $("#restockCount").textContent = items.length;
    $("#restockList").innerHTML = items.length ? items.slice(0, 4).map((item) => `
      <div class="attention-item">
        <span class="item-avatar">${escapeHtml(item.code.split("-")[0])}</span>
        <div><strong>${escapeHtml(item.item)}</strong><small>${escapeHtml(item.code)} · mínimo ${fmt.format(item.minimum)} ${escapeHtml(item.unit)}</small></div>
        <div class="stock-level"><b>${fmt.format(item.stock)} ${escapeHtml(item.unit)}</b><small>em estoque</small></div>
      </div>`).join("") : '<div class="empty-mini">Nenhum item precisa de reposição.</div>';
  }

  function renderDonut() {
    const totals = {
      Entrada: movements.filter((m) => m.type === "Entrada").reduce((s, m) => s + Number(m.quantity), 0),
      Entrega: movements.filter((m) => m.type === "Entrega").reduce((s, m) => s + Number(m.quantity), 0),
      Troca: movements.filter((m) => m.type === "Troca").reduce((s, m) => s + Number(m.quantity), 0)
    };
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    const denominator = total || 1;
    const entryEnd = totals.Entrada / denominator * 100;
    const deliveryEnd = entryEnd + totals.Entrega / denominator * 100;
    $("#typeDonut").style.background = total === 0
      ? "#edf2f5"
      : `conic-gradient(var(--orange) 0 ${entryEnd}%, var(--navy) ${entryEnd}% ${deliveryEnd}%, #f1b64e ${deliveryEnd}% 100%)`;
    $("#donutTotal").textContent = fmt.format(total);
    const colors = { Entrada: "#f47a20", Entrega: "#17324d", Troca: "#f1b64e" };
    $("#donutLegend").innerHTML = Object.entries(totals).map(([label, value]) => `<div class="legend-row"><i style="background:${colors[label]}"></i><span>${label}</span><b>${fmt.format(value)}</b></div>`).join("");
  }

  function renderEmployeeChart() {
    const grouped = movements.filter((m) => m.type === "Troca").reduce((acc, movement) => {
      acc[movement.employee] = (acc[movement.employee] || 0) + Number(movement.quantity);
      return acc;
    }, {});
    const rows = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = Math.max(1, ...rows.map((row) => row[1]));
    $("#employeeChart").innerHTML = rows.length ? rows.map(([name, value]) => `
      <div class="bar-row"><span title="${escapeHtml(name)}">${escapeHtml(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${value/max*100}%"></div></div><b>${fmt.format(value)}</b></div>`).join("") : '<div class="empty-mini">Nenhuma troca registrada no período.</div>';
  }

  function filteredMovements() {
    const query = $("#searchFilter").value.trim().toLowerCase();
    const type = $("#typeFilter").value;
    const status = $("#statusFilter").value;
    const from = $("#fromFilter").value;
    const to = $("#toFilter").value;
    return movements.filter((movement) => {
      const haystack = `${movement.code} ${movement.item} ${movement.employee}`.toLowerCase();
      return (!query || haystack.includes(query)) && (!type || movement.type === type) && (!status || movement.status === status) && (!from || movement.date >= from) && (!to || movement.date <= to);
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }

  function renderTable() {
    const rows = filteredMovements();
    $("#resultCount").textContent = rows.length;
    $("#emptyState").hidden = rows.length > 0;
    $("#movementTable").innerHTML = rows.map((movement) => `
      <tr>
        <td>${formatDate(movement.date)}</td>
        <td class="item-cell"><strong>${escapeHtml(movement.item)}</strong><small>${escapeHtml(movement.code)}</small></td>
        <td><span class="type-badge type-${movement.type.toLowerCase()}">${escapeHtml(movement.type)}</span></td>
        <td><strong>${fmt.format(movement.quantity)}</strong> ${escapeHtml(movement.unit)}</td>
        <td class="employee-cell">${escapeHtml(movement.employee)}</td>
        <td><span class="status-badge status-${movement.status.toLowerCase()}">${escapeHtml(movement.status)}</span></td>
        <td>${movement.status === "Pendente" ? `<button class="action-link" type="button" data-writeoff="${escapeHtml(movement.id)}">Concluir baixa</button>` : '<span class="action-done">Concluída</span>'}</td>
      </tr>`).join("");
  }

  function updateStockPreview() {
    const code = $("#code").value.trim().toUpperCase();
    const item = inventoryMap()[code];
    if (!code) {
      $("#currentItemStock").textContent = "—";
      $("#stockPreviewText").textContent = "Digite um código para consultar.";
    } else if (item) {
      $("#currentItemStock").textContent = `${fmt.format(item.stock)} ${item.unit}`;
      $("#stockPreviewText").textContent = item.item;
      if (!$("#item").value.trim()) $("#item").value = item.item;
      $("#unit").value = item.unit;
      $("#minimum").value = item.minimum;
    } else {
      $("#currentItemStock").textContent = "0";
      $("#stockPreviewText").textContent = "Novo código — saldo inicial zero.";
    }
  }

  function clearErrors() {
    $$(".invalid").forEach((field) => field.classList.remove("invalid"));
    $$(".field-error").forEach((error) => error.textContent = "");
  }

  function setError(field, message) {
    field.classList.add("invalid");
    const error = field.parentElement.querySelector(".field-error");
    if (error) error.textContent = message;
  }

  function validateForm() {
    clearErrors();
    const required = [$("#code"), $("#item"), $("#quantity"), $("#minimum"), $("#employee"), $("#date")];
    let valid = true;
    required.forEach((field) => {
      if (!field.value.trim()) { setError(field, "Campo obrigatório."); valid = false; }
    });
    const quantity = Number($("#quantity").value);
    if (quantity <= 0) { setError($("#quantity"), "Informe uma quantidade maior que zero."); valid = false; }

    const type = $("#type").value;
    const code = $("#code").value.trim().toUpperCase();
    const available = inventoryMap()[code]?.stock || 0;
    if (type !== "Entrada" && quantity > available) {
      setError($("#quantity"), `Saldo insuficiente. Disponível: ${fmt.format(available)}.`);
      valid = false;
    }
    return valid;
  }

  async function submitMovement(event) {
    event.preventDefault();
    if (!validateForm()) {
      $(".invalid")?.focus();
      showToast("Revise o lançamento", "Há campos que precisam de correção.", false);
      return;
    }
    const movement = {
      id: `m${Date.now()}`,
      date: $("#date").value,
      code: $("#code").value.trim().toUpperCase(),
      item: $("#item").value.trim(),
      unit: $("#unit").value,
      quantity: Number($("#quantity").value),
      minimum: Number($("#minimum").value),
      employee: $("#employee").value.trim(),
      type: $("#type").value,
      status: $("#status").value,
      notes: $("#notes").value.trim()
    };
    movements.push(movement);
    saveMovements();
    renderAll();
    $("#movementForm").reset();
    $("#date").value = isoOffset(0);
    $("#minimum").value = 10;
    showToast("Movimentação registrada", `${movement.type} de ${fmt.format(movement.quantity)} ${movement.unit} salva com sucesso.`, true);
    showView("history");
  }

  function showToast(title, text, success) {
    $("#toastTitle").textContent = title;
    $("#toastText").textContent = text;
    $("#toast").classList.toggle("error", !success);
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4300);
  }

  function exportCsv() {
    const headers = ["Data", "Código", "Item", "Unidade", "Quantidade", "Colaborador", "Tipo", "Status da baixa", "Observação"];
    const values = movements.map((m) => [m.date, m.code, m.item, m.unit, m.quantity, m.employee, m.type, m.status, m.notes]);
    const csv = "\ufeff" + [headers, ...values].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `movimentacoes-estoque-${isoOffset(0)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Arquivo exportado", "O histórico foi preparado em formato CSV.", true);
  }

  function openWriteoffModal(id) {
    pendingWriteoffId = id;
    $("#confirmModal").hidden = false;
    $("#confirmWriteoff").focus();
  }

  function closeWriteoffModal() {
    pendingWriteoffId = null;
    $("#confirmModal").hidden = true;
  }

  async function confirmWriteoff() {
    const movement = movements.find((m) => m.id === pendingWriteoffId);
    if (movement) {
      movement.status = "Baixado";
      saveMovements();
      renderAll();
      showToast("Baixa concluída", `${movement.code} foi marcado como baixado pela matriz.`, true);
    }
    closeWriteoffModal();
  }

  function initEvents() {
    $$(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
    $$('[data-go]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
    $("#movementForm").addEventListener("submit", submitMovement);
    $("#movementForm").addEventListener("reset", () => setTimeout(() => { clearErrors(); $("#date").value = isoOffset(0); $("#minimum").value = 10; updateStockPreview(); }, 0));
    $("#code").addEventListener("input", updateStockPreview);
    ["searchFilter", "typeFilter", "statusFilter", "fromFilter", "toFilter"].forEach((id) => $("#" + id).addEventListener(id === "searchFilter" ? "input" : "change", renderTable));
    $("#clearFilters").addEventListener("click", () => {
      ["searchFilter", "typeFilter", "statusFilter", "fromFilter", "toFilter"].forEach((id) => $("#" + id).value = "");
      renderTable();
    });
    $("#movementTable").addEventListener("click", (event) => {
      const button = event.target.closest("[data-writeoff]");
      if (button) openWriteoffModal(button.dataset.writeoff);
    });
    $("#cancelModal").addEventListener("click", closeWriteoffModal);
    $("#confirmWriteoff").addEventListener("click", confirmWriteoff);
    $("#confirmModal").addEventListener("click", (event) => { if (event.target === $("#confirmModal")) closeWriteoffModal(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#confirmModal").hidden) closeWriteoffModal(); });
    $("#toastClose").addEventListener("click", () => $("#toast").classList.remove("show"));
    $("#exportBtn").addEventListener("click", exportCsv);
  }

  async function loadSession() {
    if (!db) { $("#loginError").textContent = "Configure supabase-config.js antes de usar."; return; }
    const { data: { session } } = await db.auth.getSession();
    if (session) await enterApp(session.user);
  }
  async function enterApp(user) {
    currentUser = user;
    const { data: profile, error: profileError } = await db.from("profiles").select("full_name,role").eq("id", user.id).single();
    if (profileError) { $("#loginError").textContent = profileError.message; return; }
    currentRole = profile.role;
    const { data, error } = await db.from("movements").select("*").order("date", { ascending:false });
    if (error) { $("#loginError").textContent = error.message; return; }
    movements = data || [];
    $("#loginScreen").hidden = true; $("#appShell").hidden = false;
    $("#userChip").textContent = `${profile.full_name || user.email} · ${currentRole === "admin" ? "Administrador" : "Usuário"}`;
    if (currentRole !== "admin") {
      $$(".tab").forEach(t => t.hidden = t.dataset.view !== "register");
      $("#exportBtn").hidden = true;
      showView("register");
    } else showView("dashboard");
    $("#date").value = isoOffset(0); initEvents(); renderAll();
  }
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault(); $("#loginError").textContent = "";
    const { data, error } = await db.auth.signInWithPassword({ email: $("#loginEmail").value.trim(), password: $("#loginPassword").value });
    if (error) { $("#loginError").textContent = "E-mail ou senha inválidos."; return; }
    await enterApp(data.user);
  });
  $("#logoutBtn").addEventListener("click", async () => { await db.auth.signOut(); location.reload(); });
  await loadSession();
})();  
