const api = (() => {
  if (typeof browser !== "undefined" && browser.runtime) return browser;
  return chrome;
})();

const profilesEl = document.getElementById("profiles");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refresh");

function setStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = "row status " + (ok ? "ok" : "bad");
}

async function bg(req) {
  return await api.runtime.sendMessage(req);
}

async function loadProfiles() {
  profilesEl.innerHTML = "";
  const resp = await bg({ type: "pm:listProfiles" });
  if (!resp?.ok) {
    const code = resp?.error?.code || resp?.error || "ERR";
    setStatus(`Ошибка: ${code}`, false);
    profilesEl.disabled = true;
    return;
  }
  const list = resp.result?.profiles || [];
  if (list.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Нет профилей";
    profilesEl.appendChild(opt);
    profilesEl.disabled = true;
    return;
  }

  profilesEl.disabled = false;

  const stored = await api.storage.local.get({ profileId: null });
  const storedId = stored.profileId;

  for (const p of list) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || p.id;
    profilesEl.appendChild(opt);
  }

  if (storedId && list.some((p) => p.id === storedId)) {
    profilesEl.value = storedId;
  } else {
    profilesEl.value = list[0].id;
    await api.storage.local.set({ profileId: list[0].id });
  }
}

async function refreshStatus() {
  const profileId = profilesEl.value || null;
  const resp = await bg({ type: "pm:getStatus", profileId });
  if (!resp?.ok) {
    const code = resp?.error?.code || resp?.error || "ERR";
    setStatus(`Статус: ${code}`, false);
    return;
  }
  const locked = !!resp.result?.locked;
  const pid = resp.result?.profileId;
  if (!pid) {
    setStatus("Профиль не выбран.", false);
    return;
  }
  if (locked) setStatus("Профиль заблокирован или не активен в приложении.", false);
  else setStatus("Профиль разблокирован.", true);
}

profilesEl.addEventListener("change", async () => {
  const profileId = profilesEl.value;
  await bg({ type: "pm:setProfile", profileId });
  await refreshStatus();
});

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  try {
    await loadProfiles();
    await refreshStatus();
  } finally {
    refreshBtn.disabled = false;
  }
});

(async () => {
  refreshBtn.disabled = true;
  try {
    await loadProfiles();
    await refreshStatus();
  } catch (e) {
    setStatus(`Ошибка: ${String(e.message || e)}`, false);
  } finally {
    refreshBtn.disabled = false;
  }
})();
