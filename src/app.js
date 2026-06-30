const STORAGE_KEY = "gam3eya-manager:v1";
const STORAGE_VERSION = 2;

const state = {
  data: loadState(),
  selectedAssociationId: "",
  selectedCycle: 0,
  activeTab: "payments",
  session: null,
  authError: "",
};

state.selectedAssociationId = state.data.associations[0]?.id || "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(startMonth, cycleIndex) {
  const date = new Date(`${startMonth || currentMonth()}-01T00:00:00`);
  date.setMonth(date.getMonth() + cycleIndex);
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function emptyMember() {
  return {
    id: uid(),
    name: "",
    phone: "",
    nationalId: "",
    address: "",
    notes: "",
    username: "",
    passwordHash: "",
    role: "member",
  };
}

function seedData() {
  const members = [
    {
      ...emptyMember(),
      name: "Ahmed Hassan",
      phone: "01000000001",
      address: "Nasr City",
      notes: "Prefers cash collection",
    },
    {
      ...emptyMember(),
      name: "Mona Ali",
      phone: "01000000002",
      address: "Heliopolis",
    },
    {
      ...emptyMember(),
      name: "Karim Samir",
      phone: "01000000003",
      address: "Maadi",
      notes: "Bank transfer",
    },
  ];

  return {
    version: STORAGE_VERSION,
    associations: [
      {
        id: uid(),
        name: "Family Saving Circle",
        monthlyAmount: 3000,
        startMonth: currentMonth(),
        status: "active",
        admin: null,
        members,
        turnOrder: members.map((member) => member.id),
        payments: {
          0: {
            [members[0].id]: {
              paid: true,
              amount: 3000,
              method: "Cash",
              paidAt: new Date().toISOString().slice(0, 10),
            },
            [members[1].id]: {
              paid: true,
              amount: 3000,
              method: "Bank transfer",
              paidAt: new Date().toISOString().slice(0, 10),
            },
          },
        },
      },
    ],
  };
}

function normalizeMember(member) {
  return {
    ...emptyMember(),
    ...member,
    username: String(member?.username || "").trim(),
    passwordHash: String(member?.passwordHash || ""),
    role: member?.role === "admin" ? "admin" : "member",
  };
}

function normalizeAssociation(association) {
  const members = Array.isArray(association?.members)
    ? association.members.map(normalizeMember)
    : [];
  const validMemberIds = new Set(members.map((member) => member.id));
  const existingOrder = Array.isArray(association?.turnOrder)
    ? association.turnOrder.filter((id) => validMemberIds.has(id))
    : [];
  const missingOrder = members
    .map((member) => member.id)
    .filter((id) => !existingOrder.includes(id));

  return {
    id: association?.id || uid(),
    name: association?.name || "Association",
    monthlyAmount: Number(association?.monthlyAmount || 0),
    startMonth: association?.startMonth || currentMonth(),
    status: association?.status || "active",
    admin: association?.admin?.username && association?.admin?.passwordHash
      ? {
          username: String(association.admin.username).trim(),
          passwordHash: String(association.admin.passwordHash),
        }
      : null,
    members,
    turnOrder: [...existingOrder, ...missingOrder],
    payments: association?.payments && typeof association.payments === "object"
      ? association.payments
      : {},
  };
}

function migrateData(parsed) {
  const source = Array.isArray(parsed?.associations) ? parsed : seedData();
  return {
    version: STORAGE_VERSION,
    associations: source.associations.map(normalizeAssociation),
  };
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return seedData();
    return migrateData(JSON.parse(stored));
  } catch {
    return seedData();
  }
}

function saveState() {
  state.data.version = STORAGE_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function selectedAssociation() {
  return (
    state.data.associations.find((item) => item.id === state.selectedAssociationId) ||
    state.data.associations[0]
  );
}

function currentUserIsAdmin() {
  return state.session?.role === "admin";
}

function currentMember(association = selectedAssociation()) {
  if (!state.session?.memberId) return null;
  return association?.members.find((member) => member.id === state.session.memberId) || null;
}

function updateAssociation(updater) {
  const association = selectedAssociation();
  state.data.associations = state.data.associations.map((item) =>
    item.id === association.id ? normalizeAssociation(updater(item)) : item
  );
  saveState();
  render();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureCryptoAvailable() {
  return Boolean(window.crypto?.subtle && window.TextEncoder);
}

async function hashPassword(password) {
  if (!ensureCryptoAvailable()) {
    throw new Error("Password hashing is unavailable in this browser or context.");
  }
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return (await hashPassword(password)) === hash;
}

function render() {
  const association = selectedAssociation();
  if (!association) return renderEmptyScreen();

  if (!state.session) {
    renderAuthScreen(association);
    return;
  }

  $("#authScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");

  const cycleCount = Math.max(association.members.length, 1);
  if (state.selectedCycle > cycleCount - 1) state.selectedCycle = cycleCount - 1;
  if (!currentUserIsAdmin()) state.activeTab = "my-status";

  renderAssociations(association);
  renderHeader(association, cycleCount);
  renderSummary(association);
  renderTabs();
  renderActiveTab(association);
}

function renderEmptyScreen() {
  document.body.innerHTML = `
    <section class="empty-screen">
      <div class="empty-card">
        <p class="eyebrow">Gam3eya Manager</p>
        <h1>No associations</h1>
        <p class="muted">Reload the page to restore the starter data.</p>
      </div>
    </section>
  `;
}

function renderAuthScreen(association) {
  $("#appShell").classList.add("hidden");
  $("#authScreen").classList.remove("hidden");

  const hasAdmin = Boolean(association.admin?.username && association.admin?.passwordHash);
  const associationOptions = state.data.associations
    .map(
      (item) =>
        `<option value="${item.id}" ${item.id === association.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`
    )
    .join("");

  $("#authScreen").innerHTML = `
    <section class="auth-card">
      <div>
        <p class="eyebrow">Gam3eya Manager</p>
        <h1>${hasAdmin ? "Login" : "Create admin access"}</h1>
        <p class="muted">
          This static version uses local browser storage and local password hashes only.
        </p>
      </div>
      <form id="${hasAdmin ? "loginForm" : "adminSetupForm"}" class="auth-form">
        <label>
          Association
          <select id="authAssociation">${associationOptions}</select>
        </label>
        <label>
          Username
          <input name="username" autocomplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autocomplete="${hasAdmin ? "current-password" : "new-password"}" required />
        </label>
        ${
          hasAdmin
            ? ""
            : `
              <label>
                Confirm password
                <input name="confirmPassword" type="password" autocomplete="new-password" required />
              </label>
            `
        }
        ${state.authError ? `<p class="error-box">${escapeHtml(state.authError)}</p>` : ""}
        <button class="primary-button" type="submit">${hasAdmin ? "Login" : "Create admin"}</button>
      </form>
      <p class="security-note">
        GitHub Pages cannot provide real secure shared authentication. Use a backend/database for production security.
      </p>
    </section>
  `;

  $("#authAssociation").addEventListener("change", (event) => {
    state.selectedAssociationId = event.target.value;
    state.selectedCycle = 0;
    state.authError = "";
    render();
  });

  if (hasAdmin) {
    $("#loginForm").addEventListener("submit", handleLogin);
  } else {
    $("#adminSetupForm").addEventListener("submit", handleAdminSetup);
  }
}

async function handleAdminSetup(event) {
  event.preventDefault();
  const association = selectedAssociation();
  const form = new FormData(event.currentTarget);
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");

  if (!ensureCryptoAvailable()) return setAuthError("Web Crypto is unavailable, so passwords cannot be safely hashed.");
  if (!username) return setAuthError("Username is required.");
  if (!password) return setAuthError("Password is required.");
  if (password !== confirmPassword) return setAuthError("Password confirmation must match.");
  if (usernameExists(association, username)) return setAuthError("That username already exists in this association.");

  const passwordHash = await hashPassword(password);
  updateAssociation((item) => ({ ...item, admin: { username, passwordHash } }));
  state.session = { associationId: association.id, role: "admin", username, memberId: "" };
  state.authError = "";
  render();
}

async function handleLogin(event) {
  event.preventDefault();
  const association = selectedAssociation();
  const form = new FormData(event.currentTarget);
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");

  if (!ensureCryptoAvailable()) return setAuthError("Web Crypto is unavailable, so passwords cannot be verified.");
  if (!username || !password) return setAuthError("Enter a username and password.");

  try {
    if (
      association.admin?.username === username &&
      (await verifyPassword(password, association.admin.passwordHash))
    ) {
      state.session = { associationId: association.id, role: "admin", username, memberId: "" };
      state.authError = "";
      render();
      return;
    }

    const member = association.members.find((item) => item.username === username);
    if (member?.passwordHash && (await verifyPassword(password, member.passwordHash))) {
      state.session = {
        associationId: association.id,
        role: member.role === "admin" ? "admin" : "member",
        username,
        memberId: member.id,
      };
      state.activeTab = member.role === "admin" ? "payments" : "my-status";
      state.authError = "";
      render();
      return;
    }
  } catch {
    return setAuthError("Password verification failed in this browser.");
  }

  setAuthError("Invalid username or password.");
}

function setAuthError(message) {
  state.authError = message;
  render();
}

function usernameExists(association, username, ignoredMemberId = "") {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return false;
  if (association.admin?.username?.toLowerCase() === normalized) return true;
  return association.members.some(
    (member) =>
      member.id !== ignoredMemberId &&
      member.username &&
      member.username.toLowerCase() === normalized
  );
}

function renderAssociations(activeAssociation) {
  const isAdmin = currentUserIsAdmin();
  $("#exportJson").classList.toggle("hidden", !isAdmin);
  $("#associationForm").classList.toggle("hidden", !isAdmin);

  $("#associationList").innerHTML = state.data.associations
    .filter((item) => isAdmin || item.id === state.session.associationId)
    .map(
      (item) => `
        <button class="association-item ${item.id === activeAssociation.id ? "selected" : ""}" data-association-id="${item.id}" type="button">
          <span>${escapeHtml(item.name)}</span>
          <small>${formatMoney(item.monthlyAmount)} / member</small>
        </button>
      `
    )
    .join("");

  $$(".association-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (!currentUserIsAdmin() && button.dataset.associationId !== state.session.associationId) return;
      state.selectedAssociationId = button.dataset.associationId;
      state.selectedCycle = 0;
      render();
    });
  });
}

function renderHeader(association, cycleCount) {
  $("#associationStatus").textContent = association.status || "active";
  $("#associationTitle").textContent = association.name;
  $("#associationSubtitle").textContent =
    `${association.members.length} members, ${cycleCount} payout cycles`;
  $("#sessionStatus").textContent = `${state.session.username} (${state.session.role})`;

  $("#cycleSelect").innerHTML = Array.from({ length: cycleCount })
    .map(
      (_, index) =>
        `<option value="${index}" ${index === state.selectedCycle ? "selected" : ""}>${index + 1} - ${monthLabel(association.startMonth, index)}</option>`
    )
    .join("");
}

function renderSummary(association) {
  const metrics = getAssociationMetrics(association);
  if (currentUserIsAdmin()) {
    $("#summaryGrid").innerHTML = [
      metricHtml("This turn", metrics.receiver?.name || "No member yet"),
      metricHtml("Expected pot", formatMoney(metrics.expected)),
      metricHtml("Collected", formatMoney(metrics.collected), "good"),
      metricHtml("Outstanding", formatMoney(metrics.outstanding), "warn"),
    ].join("");
    return;
  }

  const member = currentMember(association);
  const payment = member ? metrics.cyclePayments[member.id] : null;
  $("#summaryGrid").innerHTML = [
    metricHtml("My status", payment?.paid ? "Paid" : "Unpaid", payment?.paid ? "good" : "warn"),
    metricHtml("My amount", formatMoney(payment?.amount || association.monthlyAmount)),
    metricHtml("This turn", metrics.receiver?.name || "No member yet"),
    metricHtml("Current cycle", `${state.selectedCycle + 1} - ${monthLabel(association.startMonth, state.selectedCycle)}`),
  ].join("");
}

function metricHtml(label, value, tone = "") {
  return `
    <article class="metric ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function getAssociationMetrics(association) {
  const cyclePayments = association.payments?.[state.selectedCycle] || {};
  const membersById = Object.fromEntries(
    association.members.map((member) => [member.id, member])
  );
  const receiverId =
    association.turnOrder[state.selectedCycle % Math.max(association.turnOrder.length, 1)];
  const receiver = membersById[receiverId];
  const paidMembers = association.members.filter(
    (member) => cyclePayments[member.id]?.paid
  );
  const collected = paidMembers.reduce((total, member) => {
    return total + Number(cyclePayments[member.id]?.amount || association.monthlyAmount);
  }, 0);
  const expected = association.members.length * Number(association.monthlyAmount || 0);
  return {
    cyclePayments,
    membersById,
    receiverId,
    receiver,
    paidMembers,
    collected,
    expected,
    outstanding: Math.max(expected - collected, 0),
  };
}

function renderTabs() {
  const tabs = currentUserIsAdmin()
    ? [
        ["payments", "Payments"],
        ["members", "Members"],
        ["turns", "Turn order"],
        ["settings", "Settings"],
      ]
    : [["my-status", "My status"]];

  $("#tabs").innerHTML = tabs
    .map(
      ([id, label]) =>
        `<button class="${state.activeTab === id ? "active" : ""}" type="button" data-tab="${id}">${label}</button>`
    )
    .join("");

  $$("#tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      render();
    });
  });
}

function renderActiveTab(association) {
  const content = $("#tabContent");
  if (!currentUserIsAdmin()) {
    content.innerHTML = memberStatusPanelHtml(association);
    return;
  }

  if (state.activeTab === "payments") {
    content.innerHTML = paymentPanelHtml(association);
    bindPaymentEvents(association);
  }
  if (state.activeTab === "members") {
    content.innerHTML = membersPanelHtml(association);
    bindMemberEvents();
  }
  if (state.activeTab === "turns") {
    content.innerHTML = turnsPanelHtml(association);
    bindTurnEvents();
  }
  if (state.activeTab === "settings") {
    content.innerHTML = settingsPanelHtml(association);
    bindSettingsEvents();
  }
}

function paymentPanelHtml(association) {
  if (!association.members.length) {
    return `
      <section class="panel empty-state">
        <div>
          <h3>No members yet</h3>
          <p>Add members first, then payment rows will appear here.</p>
        </div>
      </section>
    `;
  }

  const { cyclePayments, receiverId } = getAssociationMetrics(association);
  const rows = association.members
    .map((member) => {
      const payment = cyclePayments[member.id] || {};
      const paid = Boolean(payment.paid);
      return `
        <tr>
          <td>
            <strong>${escapeHtml(member.name)}</strong>
            <small>${escapeHtml(member.phone || "No phone")}</small>
          </td>
          <td>
            <span class="tag ${member.id === receiverId ? "receiver" : ""}">
              ${member.id === receiverId ? "Receiver" : "Payer"}
            </span>
          </td>
          <td>
            <button class="status-toggle ${paid ? "paid" : ""}" data-pay-toggle="${member.id}" type="button">
              ${paid ? "Paid" : "Unpaid"}
            </button>
          </td>
          <td>
            <input type="number" data-payment-field="amount" data-member-id="${member.id}" value="${escapeHtml(payment.amount || association.monthlyAmount)}" />
          </td>
          <td>
            <select data-payment-field="method" data-member-id="${member.id}">
              ${["Cash", "Bank transfer", "Wallet", "Other"]
                .map(
                  (method) =>
                    `<option ${method === (payment.method || "Cash") ? "selected" : ""}>${method}</option>`
                )
                .join("")}
            </select>
          </td>
          <td>
            <input type="date" data-payment-field="paidAt" data-member-id="${member.id}" value="${escapeHtml(payment.paidAt || "")}" />
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h3>Cycle ${state.selectedCycle + 1} payments</h3>
          <p class="muted">Mark who paid and record method/date.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Paid date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function membersPanelHtml(association) {
  const members = association.members
    .map(
      (member) => `
        <article class="member-card">
          <div>
            <strong>${escapeHtml(member.name)}</strong>
            <span>${escapeHtml(member.phone || "No phone")}</span>
            <small>${escapeHtml(member.username ? `@${member.username} - ${member.role}` : "No login username")}</small>
          </div>
          <button class="danger-button" data-remove-member="${member.id}" type="button">Remove</button>
        </article>
      `
    )
    .join("");

  return `
    <section class="split-grid">
      <form class="panel member-form" id="memberForm">
        <h3>Add member</h3>
        <div class="form-grid two">
          <label>Full name<input name="name" placeholder="Member name" required /></label>
          <label>Phone<input name="phone" placeholder="01..." /></label>
          <label>National ID<input name="nationalId" /></label>
          <label>Address<input name="address" /></label>
          <label>Username<input name="username" autocomplete="off" required /></label>
          <label>Role
            <select name="role">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>Password<input name="password" type="password" autocomplete="new-password" required /></label>
          <label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" required /></label>
        </div>
        <label>Notes<textarea name="notes"></textarea></label>
        <p class="form-error hidden" id="memberFormError"></p>
        <button class="primary-button" type="submit">Add member</button>
      </form>
      <section class="panel">
        <h3>Member records</h3>
        <div class="member-list">${members || "<p class=\"muted\">No members yet.</p>"}</div>
      </section>
    </section>
  `;
}

function turnsPanelHtml(association) {
  const { membersById } = getAssociationMetrics(association);
  const rows = association.turnOrder
    .map((memberId, index) => {
      const member = membersById[memberId];
      if (!member) return "";
      return `
        <article class="turn-row ${index === state.selectedCycle ? "current" : ""}">
          <span class="turn-number">${index + 1}</span>
          <div>
            <strong>${escapeHtml(member.name)}</strong>
            <small>${monthLabel(association.startMonth, index)}</small>
          </div>
          <div class="row-actions">
            <button class="ghost-button" data-move-member="${memberId}" data-direction="-1" type="button">Up</button>
            <button class="ghost-button" data-move-member="${memberId}" data-direction="1" type="button">Down</button>
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h3>Payout order</h3>
          <p class="muted">Move members to change who receives each month.</p>
        </div>
      </div>
      <div class="turn-list">${rows || "<p class=\"muted\">No members yet.</p>"}</div>
    </section>
  `;
}

function settingsPanelHtml(association) {
  return `
    <section class="panel settings-panel">
      <h3>Association settings</h3>
      <div class="form-grid three">
        <label>Name<input id="settingsName" value="${escapeHtml(association.name)}" /></label>
        <label>Monthly amount<input id="settingsAmount" type="number" value="${escapeHtml(association.monthlyAmount)}" /></label>
        <label>Start month<input id="settingsStartMonth" type="month" value="${escapeHtml(association.startMonth)}" /></label>
      </div>
      <p class="security-note">
        This GitHub Pages version is for personal/local tracking only. Static hosting cannot protect private data or passwords from a determined user. For real shared secure access, use a backend such as Supabase, Firebase, or a Node API.
      </p>
      <button class="danger-button" id="resetDemo" type="button">Reset demo data</button>
    </section>
  `;
}

function memberStatusPanelHtml(association) {
  const member = currentMember(association);
  if (!member) {
    return `
      <section class="panel empty-state">
        <div>
          <h3>Member record not found</h3>
          <p>Your login no longer matches a member in this association.</p>
        </div>
      </section>
    `;
  }

  const { cyclePayments, receiver } = getAssociationMetrics(association);
  const payment = cyclePayments[member.id] || {};
  const history = Array.from({ length: Math.max(association.members.length, 1) })
    .map((_, index) => {
      const entry = association.payments?.[index]?.[member.id] || {};
      return `
        <tr>
          <td>${index + 1} - ${monthLabel(association.startMonth, index)}</td>
          <td>${entry.paid ? "Paid" : "Unpaid"}</td>
          <td>${formatMoney(entry.amount || association.monthlyAmount)}</td>
          <td>${escapeHtml(entry.method || "-")}</td>
          <td>${escapeHtml(entry.paidAt || "-")}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="split-grid">
      <section class="panel member-profile">
        <h3>My information</h3>
        <dl>
          <dt>Name</dt><dd>${escapeHtml(member.name)}</dd>
          <dt>Phone</dt><dd>${escapeHtml(member.phone || "-")}</dd>
          <dt>National ID</dt><dd>${escapeHtml(member.nationalId || "-")}</dd>
          <dt>Address</dt><dd>${escapeHtml(member.address || "-")}</dd>
          <dt>Notes</dt><dd>${escapeHtml(member.notes || "-")}</dd>
        </dl>
      </section>
      <section class="panel">
        <h3>Current cycle</h3>
        <div class="status-list">
          <p><strong>Status:</strong> ${payment.paid ? "Paid" : "Unpaid"}</p>
          <p><strong>Amount:</strong> ${formatMoney(payment.amount || association.monthlyAmount)}</p>
          <p><strong>Method:</strong> ${escapeHtml(payment.method || "-")}</p>
          <p><strong>Paid date:</strong> ${escapeHtml(payment.paidAt || "-")}</p>
          <p><strong>Receiver:</strong> ${escapeHtml(receiver?.name || "No member yet")}</p>
        </div>
      </section>
      <section class="panel wide-panel">
        <h3>My payment history</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cycle</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Paid date</th>
              </tr>
            </thead>
            <tbody>${history}</tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function bindPaymentEvents(association) {
  $$("[data-pay-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const memberId = button.dataset.payToggle;
      const cyclePayments = association.payments?.[state.selectedCycle] || {};
      const current = cyclePayments[memberId] || {};
      updatePayment(memberId, {
        paid: !current.paid,
        amount: current.amount || association.monthlyAmount,
        method: current.method || "Cash",
        paidAt:
          !current.paid && !current.paidAt
            ? new Date().toISOString().slice(0, 10)
            : current.paidAt || "",
      });
    });
  });

  $$("[data-payment-field]").forEach((input) => {
    input.addEventListener("change", () => {
      updatePayment(input.dataset.memberId, {
        [input.dataset.paymentField]: input.value,
      });
    });
  });
}

function updatePayment(memberId, patch) {
  if (!currentUserIsAdmin()) return;
  updateAssociation((association) => {
    const cyclePayments = association.payments?.[state.selectedCycle] || {};
    const current = cyclePayments[memberId] || {
      paid: false,
      amount: association.monthlyAmount,
      method: "Cash",
      paidAt: "",
    };
    return {
      ...association,
      payments: {
        ...association.payments,
        [state.selectedCycle]: {
          ...cyclePayments,
          [memberId]: { ...current, ...patch },
        },
      },
    };
  });
}

function showMemberFormError(message) {
  const error = $("#memberFormError");
  error.textContent = message;
  error.classList.toggle("hidden", !message);
}

function bindMemberEvents() {
  $("#memberForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const association = selectedAssociation();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (!ensureCryptoAvailable()) return showMemberFormError("Web Crypto is unavailable, so passwords cannot be safely hashed.");
    if (!username) return showMemberFormError("Username is required.");
    if (!password) return showMemberFormError("Password is required.");
    if (password !== confirmPassword) return showMemberFormError("Password confirmation must match.");
    if (usernameExists(association, username)) return showMemberFormError("That username already exists in this association.");

    const member = {
      id: uid(),
      name: String(form.get("name") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      nationalId: String(form.get("nationalId") || "").trim(),
      address: String(form.get("address") || "").trim(),
      notes: String(form.get("notes") || "").trim(),
      username,
      passwordHash: await hashPassword(password),
      role: form.get("role") === "admin" ? "admin" : "member",
    };
    if (!member.name) return showMemberFormError("Member name is required.");
    updateAssociation((item) => ({
      ...item,
      members: [...item.members, member],
      turnOrder: [...item.turnOrder, member.id],
    }));
  });

  $$("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", () => {
      const memberId = button.dataset.removeMember;
      updateAssociation((association) => {
        const payments = {};
        Object.entries(association.payments || {}).forEach(([cycle, entries]) => {
          payments[cycle] = { ...entries };
          delete payments[cycle][memberId];
        });
        return {
          ...association,
          members: association.members.filter((member) => member.id !== memberId),
          turnOrder: association.turnOrder.filter((id) => id !== memberId),
          payments,
        };
      });
    });
  });
}

function bindTurnEvents() {
  $$("[data-move-member]").forEach((button) => {
    button.addEventListener("click", () => {
      const memberId = button.dataset.moveMember;
      const direction = Number(button.dataset.direction);
      updateAssociation((association) => {
        const order = [...association.turnOrder];
        const index = order.indexOf(memberId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return association;
        [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
        return { ...association, turnOrder: order };
      });
    });
  });
}

function bindSettingsEvents() {
  $("#settingsName").addEventListener("change", (event) => {
    updateAssociation((association) => ({ ...association, name: event.target.value }));
  });
  $("#settingsAmount").addEventListener("change", (event) => {
    updateAssociation((association) => ({
      ...association,
      monthlyAmount: Number(event.target.value || 0),
    }));
  });
  $("#settingsStartMonth").addEventListener("change", (event) => {
    updateAssociation((association) => ({
      ...association,
      startMonth: event.target.value || currentMonth(),
    }));
  });
  $("#resetDemo").addEventListener("click", () => {
    state.data = seedData();
    state.selectedAssociationId = state.data.associations[0].id;
    state.selectedCycle = 0;
    state.activeTab = "payments";
    state.session = null;
    saveState();
    render();
  });
}

$("#associationForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentUserIsAdmin()) return;
  const name = $("#newAssociationName").value.trim();
  if (!name) return;
  const currentAssociation = selectedAssociation();
  const next = {
    id: uid(),
    name,
    monthlyAmount: Number($("#newAssociationAmount").value || 0),
    startMonth: $("#newAssociationStart").value || currentMonth(),
    status: "active",
    admin: currentAssociation.admin ? { ...currentAssociation.admin } : null,
    members: [],
    turnOrder: [],
    payments: {},
  };
  state.data.associations.push(next);
  state.selectedAssociationId = next.id;
  state.selectedCycle = 0;
  $("#newAssociationName").value = "";
  $("#newAssociationAmount").value = "1000";
  $("#newAssociationStart").value = currentMonth();
  saveState();
  render();
});

$("#cycleSelect").addEventListener("change", (event) => {
  state.selectedCycle = Number(event.target.value);
  render();
});

$("#previousCycle").addEventListener("click", () => {
  state.selectedCycle = Math.max(0, state.selectedCycle - 1);
  render();
});

$("#nextCycle").addEventListener("click", () => {
  const association = selectedAssociation();
  const cycleCount = Math.max(association.members.length, 1);
  state.selectedCycle = Math.min(cycleCount - 1, state.selectedCycle + 1);
  render();
});

$("#logoutButton").addEventListener("click", () => {
  state.session = null;
  state.activeTab = "payments";
  state.authError = "";
  render();
});

$("#exportJson").addEventListener("click", () => {
  if (!currentUserIsAdmin()) return;
  const blob = new Blob([JSON.stringify(state.data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gam3eya-data.json";
  link.click();
  URL.revokeObjectURL(url);
});

$("#newAssociationStart").value = currentMonth();
saveState();
render();
