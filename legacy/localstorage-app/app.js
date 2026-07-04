const STORAGE_KEY = "gam3eya-manager:v1";
const STORAGE_VERSION = 3;
const PASSWORD_ALGORITHM = "PBKDF2-SHA-256";
const PASSWORD_ITERATIONS = 150000;

const state = {
  data: loadState(),
  selectedAssociationId: "",
  selectedCycle: 0,
  activeTab: "payments",
  session: null,
  authError: "",
  memberError: "",
  importError: "",
  editingMemberId: "",
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
    passwordRecord: null,
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
              paidAt: todayIso(),
            },
            [members[1].id]: {
              paid: true,
              amount: 3000,
              method: "Bank transfer",
              paidAt: todayIso(),
            },
          },
        },
      },
    ],
  };
}

function normalizePasswordRecord(record) {
  if (
    record?.algorithm === PASSWORD_ALGORITHM &&
    Number(record.iterations) > 0 &&
    record.salt &&
    record.hash
  ) {
    return {
      algorithm: PASSWORD_ALGORITHM,
      iterations: Number(record.iterations),
      salt: String(record.salt),
      hash: String(record.hash),
    };
  }
  return null;
}

function normalizeMember(member) {
  return {
    ...emptyMember(),
    ...member,
    id: member?.id || uid(),
    username: String(member?.username || "").trim(),
    passwordHash: String(member?.passwordHash || ""),
    passwordRecord: normalizePasswordRecord(member?.passwordRecord),
    role: member?.role === "admin" ? "admin" : "member",
  };
}

function normalizeAdmin(admin) {
  if (!admin?.username) return null;
  const passwordHash = String(admin.passwordHash || "");
  const passwordRecord = normalizePasswordRecord(admin.passwordRecord);
  if (!passwordHash && !passwordRecord) return null;
  return {
    username: String(admin.username).trim(),
    passwordHash,
    passwordRecord,
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
    admin: normalizeAdmin(association?.admin),
    members,
    turnOrder: [...existingOrder, ...missingOrder],
    payments:
      association?.payments && typeof association.payments === "object"
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

function sessionAssociation() {
  if (!state.session) return selectedAssociation();
  return state.data.associations.find((item) => item.id === state.session.associationId);
}

function currentUserIsAdmin() {
  return state.session?.role === "admin";
}

function currentMember(association = sessionAssociation()) {
  if (!state.session?.memberId) return null;
  return association?.members.find((member) => member.id === state.session.memberId) || null;
}

function updateAssociation(updater) {
  const association = sessionAssociation() || selectedAssociation();
  state.data.associations = state.data.associations.map((item) =>
    item.id === association.id ? normalizeAssociation(updater(item)) : item
  );
  saveState();
  render();
}

function replaceAssociation(association) {
  const normalized = normalizeAssociation(association);
  state.data.associations = state.data.associations.map((item) =>
    item.id === normalized.id ? normalized : item
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

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Hex(password) {
  if (!ensureCryptoAvailable()) {
    throw new Error("Password hashing is unavailable in this browser or context.");
  }
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createPasswordRecord(password) {
  if (!ensureCryptoAvailable()) {
    throw new Error("Password hashing is unavailable in this browser or context.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PASSWORD_ITERATIONS,
    },
    keyMaterial,
    256
  );
  return {
    algorithm: PASSWORD_ALGORITHM,
    iterations: PASSWORD_ITERATIONS,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(new Uint8Array(bits)),
  };
}

async function verifyPassword(password, passwordRecord) {
  const record = normalizePasswordRecord(passwordRecord);
  if (!record) return false;
  if (!ensureCryptoAvailable()) {
    throw new Error("Password verification is unavailable in this browser or context.");
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(record.salt),
      iterations: record.iterations,
    },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(bits)) === record.hash;
}

function hasCredential(account) {
  return Boolean(account?.passwordRecord || account?.passwordHash);
}

async function verifyAccountPassword(account, password) {
  if (account?.passwordRecord && (await verifyPassword(password, account.passwordRecord))) {
    return { ok: true, legacy: false };
  }
  if (account?.passwordHash && (await sha256Hex(password)) === account.passwordHash) {
    return { ok: true, legacy: true };
  }
  return { ok: false, legacy: false };
}

function render() {
  if (!state.data.associations.length) return renderEmptyScreen();

  if (state.session) {
    const scopedAssociation = sessionAssociation();
    if (!scopedAssociation) {
      state.session = null;
      state.selectedAssociationId = state.data.associations[0]?.id || "";
      render();
      return;
    }
    state.selectedAssociationId = scopedAssociation.id;
  }

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
  $("#appShell").classList.add("hidden");
  $("#authScreen").classList.remove("hidden");
  $("#authScreen").innerHTML = `
    <section class="auth-card">
      <div>
        <p class="eyebrow">Gam3eya Manager</p>
        <h1>No associations</h1>
        <p class="muted">Reset the demo data or import a backup to start tracking again.</p>
      </div>
      <div class="row-actions">
        <button class="primary-button" id="restoreSeedData" type="button">Restore demo data</button>
      </div>
    </section>
  `;
  $("#restoreSeedData").addEventListener("click", () => {
    if (!confirm("Restore demo data? This overwrites the current empty state.")) return;
    state.data = seedData();
    state.selectedAssociationId = state.data.associations[0].id;
    saveState();
    render();
  });
}

function renderAuthScreen(association) {
  $("#appShell").classList.add("hidden");
  $("#authScreen").classList.remove("hidden");

  const hasAdmin = hasCredential(association.admin);
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
          Choose an association, then sign in with that association's local account.
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
        Static GitHub Pages/localStorage access is for personal tracking only and is not real secure multi-user authentication.
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

  const passwordRecord = await createPasswordRecord(password);
  replaceAssociation({ ...association, admin: { username, passwordHash: "", passwordRecord } });
  state.session = { associationId: association.id, role: "admin", username, memberId: "" };
  state.authError = "";
  state.activeTab = "payments";
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
    if (association.admin?.username === username) {
      const result = await verifyAccountPassword(association.admin, password);
      if (result.ok) {
        if (result.legacy) {
          const passwordRecord = await createPasswordRecord(password);
          replaceAssociation({
            ...association,
            admin: { ...association.admin, passwordHash: "", passwordRecord },
          });
        }
        state.session = { associationId: association.id, role: "admin", username, memberId: "" };
        state.authError = "";
        state.activeTab = "payments";
        render();
        return;
      }
    }

    const member = association.members.find((item) => item.username === username);
    if (member) {
      const result = await verifyAccountPassword(member, password);
      if (result.ok) {
        if (result.legacy) {
          const passwordRecord = await createPasswordRecord(password);
          replaceAssociation({
            ...association,
            members: association.members.map((item) =>
              item.id === member.id ? { ...item, passwordHash: "", passwordRecord } : item
            ),
          });
        }
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
  $("#shareJson").classList.toggle("hidden", !isAdmin);
  $("#importJsonButton").classList.toggle("hidden", !isAdmin);
  $("#importJson").classList.toggle("hidden", true);
  $("#associationForm").classList.toggle("hidden", !isAdmin);

  $("#associationList").innerHTML = `
    <button class="association-item selected locked" type="button">
      <span>${escapeHtml(activeAssociation.name)}</span>
      <small>${formatMoney(activeAssociation.monthlyAmount)} / member</small>
    </button>
    <p class="sidebar-note">Access is scoped to the association used at login.</p>
  `;
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
      state.memberError = "";
      state.importError = "";
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
              <span class="status-dot"></span>${paid ? "Paid" : "Unpaid"}
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
  const editingMember =
    association.members.find((member) => member.id === state.editingMemberId) || null;
  const formTitle = editingMember ? "Edit member" : "Add member";
  const members = association.members
    .map(
      (member) => `
        <article class="member-card ${member.id === state.editingMemberId ? "editing" : ""}">
          <div>
            <strong>${escapeHtml(member.name)}</strong>
            <span>${escapeHtml(member.phone || "No phone")}</span>
            <small>${escapeHtml(member.username ? `@${member.username} - ${member.role}` : "No login username")}</small>
          </div>
          <div class="row-actions">
            <button class="ghost-button" data-edit-member="${member.id}" type="button">Edit</button>
            <button class="danger-button" data-remove-member="${member.id}" type="button">Remove</button>
          </div>
        </article>
      `
    )
    .join("");

  return `
    <section class="split-grid">
      <form class="panel member-form" id="memberForm">
        <div class="panel-heading">
          <h3>${formTitle}</h3>
          ${editingMember ? `<button class="ghost-button" id="cancelEditMember" type="button">Cancel</button>` : ""}
        </div>
        <input type="hidden" name="memberId" value="${escapeHtml(editingMember?.id || "")}" />
        <div class="form-grid two">
          <label>Full name<input name="name" placeholder="Member name" value="${escapeHtml(editingMember?.name || "")}" required /></label>
          <label>Phone<input name="phone" placeholder="01..." value="${escapeHtml(editingMember?.phone || "")}" /></label>
          <label>National ID<input name="nationalId" value="${escapeHtml(editingMember?.nationalId || "")}" /></label>
          <label>Address<input name="address" value="${escapeHtml(editingMember?.address || "")}" /></label>
          <label>Username<input name="username" autocomplete="off" value="${escapeHtml(editingMember?.username || "")}" ${editingMember ? "" : "required"} /></label>
          <label>Role
            <select name="role">
              <option value="member" ${editingMember?.role !== "admin" ? "selected" : ""}>Member</option>
              <option value="admin" ${editingMember?.role === "admin" ? "selected" : ""}>Admin</option>
            </select>
          </label>
          <label>${editingMember ? "New password" : "Password"}<input name="password" type="password" autocomplete="new-password" ${editingMember ? "" : "required"} /></label>
          <label>${editingMember ? "Confirm new password" : "Confirm password"}<input name="confirmPassword" type="password" autocomplete="new-password" ${editingMember ? "" : "required"} /></label>
        </div>
        <label>Notes<textarea name="notes">${escapeHtml(editingMember?.notes || "")}</textarea></label>
        <p class="muted">${editingMember ? "Leave password fields blank to keep the current password." : "Member usernames are unique within this association."}</p>
        ${state.memberError ? `<p class="form-error">${escapeHtml(state.memberError)}</p>` : ""}
        <button class="primary-button" type="submit">${editingMember ? "Save member" : "Add member"}</button>
      </form>
      <section class="panel">
        <h3>Member records</h3>
        <div class="member-list">${members || "<p class=\"muted\">No members yet. Add the first member to start tracking payments.</p>"}</div>
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
      <div class="turn-list">${rows || "<p class=\"muted\">No members yet. Add members before setting a payout order.</p>"}</div>
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
      ${state.importError ? `<p class="form-error">${escapeHtml(state.importError)}</p>` : ""}
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
  const cycleCount = Math.max(association.members.length, 1);
  const historyRows = Array.from({ length: cycleCount })
    .map((_, index) => {
      const entry = association.payments?.[index]?.[member.id] || {};
      return `
        <tr>
          <td>${index + 1} - ${monthLabel(association.startMonth, index)}</td>
          <td><span class="tag ${entry.paid ? "paid-chip" : "unpaid-chip"}">${entry.paid ? "Paid" : "Unpaid"}</span></td>
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
          <p><strong>Status:</strong> <span class="tag ${payment.paid ? "paid-chip" : "unpaid-chip"}">${payment.paid ? "Paid" : "Unpaid"}</span></p>
          <p><strong>Amount:</strong> ${formatMoney(payment.amount || association.monthlyAmount)}</p>
          <p><strong>Method:</strong> ${escapeHtml(payment.method || "-")}</p>
          <p><strong>Paid date:</strong> ${escapeHtml(payment.paidAt || "-")}</p>
          <p><strong>Receiver:</strong> ${escapeHtml(receiver?.name || "No member yet")}</p>
        </div>
      </section>
      <section class="panel wide-panel">
        <h3>My payment history</h3>
        ${
          historyRows
            ? `
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
                  <tbody>${historyRows}</tbody>
                </table>
              </div>
            `
            : `<p class="muted">No payment history yet.</p>`
        }
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
            ? todayIso()
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

function setMemberError(message) {
  state.memberError = message;
  render();
}

async function buildMemberFromForm(form, association, existingMember = null) {
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  const isEdit = Boolean(existingMember);

  if (!username) throw new Error("Username is required.");
  if (usernameExists(association, username, existingMember?.id || "")) {
    throw new Error("That username already exists in this association.");
  }
  if (!isEdit && !password) throw new Error("Password is required.");
  if ((password || confirmPassword) && (!password || !confirmPassword)) {
    throw new Error("Enter and confirm the new password.");
  }
  if (password !== confirmPassword) throw new Error("Password confirmation must match.");
  if (password && !ensureCryptoAvailable()) {
    throw new Error("Web Crypto is unavailable, so passwords cannot be safely hashed.");
  }

  const next = {
    ...(existingMember || emptyMember()),
    name: String(form.get("name") || "").trim(),
    phone: String(form.get("phone") || "").trim(),
    nationalId: String(form.get("nationalId") || "").trim(),
    address: String(form.get("address") || "").trim(),
    notes: String(form.get("notes") || "").trim(),
    username,
    role: form.get("role") === "admin" ? "admin" : "member",
  };
  if (!next.name) throw new Error("Member name is required.");
  if (password) {
    next.passwordHash = "";
    next.passwordRecord = await createPasswordRecord(password);
  }
  return next;
}

function bindMemberEvents() {
  $("#memberForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const association = sessionAssociation();
    const form = new FormData(event.currentTarget);
    const memberId = String(form.get("memberId") || "");
    const existingMember = association.members.find((member) => member.id === memberId) || null;

    try {
      const member = await buildMemberFromForm(form, association, existingMember);
      updateAssociation((item) => {
        if (existingMember) {
          return {
            ...item,
            members: item.members.map((current) => (current.id === member.id ? member : current)),
          };
        }
        return {
          ...item,
          members: [...item.members, member],
          turnOrder: [...item.turnOrder, member.id],
        };
      });
      state.editingMemberId = "";
      state.memberError = "";
    } catch (error) {
      setMemberError(error.message || "Could not save member.");
    }
  });

  $("#cancelEditMember")?.addEventListener("click", () => {
    state.editingMemberId = "";
    state.memberError = "";
    render();
  });

  $$("[data-edit-member]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingMemberId = button.dataset.editMember;
      state.memberError = "";
      render();
    });
  });

  $$("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", () => {
      const memberId = button.dataset.removeMember;
      const association = sessionAssociation();
      const member = association.members.find((item) => item.id === memberId);
      if (!confirm(`Remove ${member?.name || "this member"}? This also removes their payment rows.`)) return;
      updateAssociation((item) => {
        const payments = {};
        Object.entries(item.payments || {}).forEach(([cycle, entries]) => {
          payments[cycle] = { ...entries };
          delete payments[cycle][memberId];
        });
        return {
          ...item,
          members: item.members.filter((current) => current.id !== memberId),
          turnOrder: item.turnOrder.filter((id) => id !== memberId),
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
    if (!confirm("Reset all local data to demo data? This overwrites associations stored in this browser.")) return;
    state.data = seedData();
    state.selectedAssociationId = state.data.associations[0].id;
    state.selectedCycle = 0;
    state.activeTab = "payments";
    state.session = null;
    state.importError = "";
    saveState();
    render();
  });
}

function sanitizeAssociationForShare(association) {
  const { admin, ...safeAssociation } = normalizeAssociation(association);
  return {
    ...safeAssociation,
    members: safeAssociation.members.map((member) => {
      const { passwordHash, passwordRecord, nationalId, ...safeMember } = member;
      return safeMember;
    }),
  };
}

function exportAssociation(kind) {
  if (!currentUserIsAdmin()) return;
  const association = sessionAssociation();
  const isShare = kind === "share";
  const payload = {
    type: isShare ? "gam3eya-association-share" : "gam3eya-association-backup",
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    association: isShare ? sanitizeAssociationForShare(association) : normalizeAssociation(association),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = association.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  link.href = url;
  link.download = `${safeName || "association"}-${isShare ? "share" : "backup"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function extractImportedAssociation(parsed) {
  if (parsed?.type?.startsWith("gam3eya-association-") && parsed.association) {
    return normalizeAssociation(parsed.association);
  }
  if (parsed?.id && parsed?.members && parsed?.turnOrder) {
    return normalizeAssociation(parsed);
  }
  if (Array.isArray(parsed?.associations) && parsed.associations.length === 1) {
    return normalizeAssociation(parsed.associations[0]);
  }
  throw new Error("Invalid import file. Choose a Gam3eya association backup or share JSON file.");
}

function importAssociation(association) {
  const existing = state.data.associations.find((item) => item.id === association.id);
  let nextAssociation = association;
  if (existing) {
    const replace = confirm(
      `An association named "${existing.name}" already uses this ID. Replace it? Choose Cancel to import as a copy.`
    );
    if (!replace) {
      nextAssociation = {
        ...association,
        id: uid(),
        name: `${association.name} Copy`,
      };
    }
    if (replace && !confirm("Replace the existing association data? This cannot be undone.")) return;
  }

  if (existing && nextAssociation.id === existing.id) {
    state.data.associations = state.data.associations.map((item) =>
      item.id === nextAssociation.id ? normalizeAssociation(nextAssociation) : item
    );
  } else {
    state.data.associations.push(normalizeAssociation(nextAssociation));
  }

  state.selectedAssociationId = nextAssociation.id;
  state.selectedCycle = 0;
  state.activeTab = "payments";
  state.session = null;
  state.importError = "";
  saveState();
  render();
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const association = extractImportedAssociation(JSON.parse(text));
    const hasAuth = hasCredential(association.admin);
    const message = hasAuth
      ? `Import "${association.name}"? Backup auth records will be restored locally.`
      : `Import "${association.name}"? This file has no admin credentials, so admin setup will be required.`;
    if (!confirm(message)) return;
    importAssociation(association);
  } catch (error) {
    state.importError = error.message || "Imported file invalid.";
    if (state.activeTab !== "settings") state.activeTab = "settings";
    render();
  }
}

$("#associationForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentUserIsAdmin()) return;
  const name = $("#newAssociationName").value.trim();
  if (!name) return;
  const next = {
    id: uid(),
    name,
    monthlyAmount: Number($("#newAssociationAmount").value || 0),
    startMonth: $("#newAssociationStart").value || currentMonth(),
    status: "active",
    admin: null,
    members: [],
    turnOrder: [],
    payments: {},
  };
  state.data.associations.push(next);
  state.selectedAssociationId = next.id;
  state.selectedCycle = 0;
  state.session = null;
  state.authError = "";
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
  const association = sessionAssociation();
  const cycleCount = Math.max(association.members.length, 1);
  state.selectedCycle = Math.min(cycleCount - 1, state.selectedCycle + 1);
  render();
});

$("#logoutButton").addEventListener("click", () => {
  state.session = null;
  state.activeTab = "payments";
  state.authError = "";
  state.memberError = "";
  state.importError = "";
  state.editingMemberId = "";
  render();
});

$("#exportJson").addEventListener("click", () => exportAssociation("backup"));
$("#shareJson").addEventListener("click", () => exportAssociation("share"));
$("#importJsonButton").addEventListener("click", () => $("#importJson").click());
$("#importJson").addEventListener("change", handleImportFile);

$("#newAssociationStart").value = currentMonth();
saveState();
render();
