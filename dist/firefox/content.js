const api = (() => {
  if (typeof browser !== "undefined" && browser.runtime) return browser;
  return chrome;
})();

if (window.top !== window) {
  // MVP: ignore iframes.
} else {
  const UI_Z = 2147483647;

  function isVisibleInput(el) {
    if (!(el instanceof HTMLInputElement)) return false;
    if (el.type === "hidden") return false;
    if (el.disabled || el.readOnly) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  }

  function isUsernameField(el) {
    if (!isVisibleInput(el)) return false;
    const t = (el.type || "").toLowerCase();
    if (t === "password") return false;
    if (t === "email") return true;

    const ac = (el.autocomplete || "").toLowerCase();
    if (ac === "username" || ac === "email") return true;

    const hints = (el.name + " " + el.id + " " + (el.placeholder || "")).toLowerCase();
    return /(user|login|email|mail|account)/.test(hints);
  }

  function findPasswordField(usernameEl) {
    const form = usernameEl.form || usernameEl.closest("form");
    const candidates = [];
    const collect = (root) => {
      if (!root) return;
      const nodes = root.querySelectorAll('input[type="password"]');
      for (const n of nodes) {
        if (!isVisibleInput(n)) continue;
        candidates.push(n);
      }
    };
    if (form) collect(form);
    if (candidates.length === 0) {
      const container = usernameEl.closest("main, section, article, div") || document;
      collect(container);
    }
    if (candidates.length === 0) return null;

    const preferred = candidates.find((n) => (n.autocomplete || "").toLowerCase() === "current-password");
    return preferred || candidates[0];
  }

  function dispatchValueEvents(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  let uiRoot = null;
  let currentTarget = null;
  let lastOrigin = null;

  function closeUi() {
    uiRoot?.remove();
    uiRoot = null;
    currentTarget = null;
    lastOrigin = null;
  }

  function positionUi(target) {
    if (!uiRoot) return;
    const rect = target.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 8));
    const top = Math.min(window.innerHeight - 8, rect.bottom);
    uiRoot.style.left = `${left}px`;
    uiRoot.style.top = `${top}px`;
    uiRoot.style.minWidth = `${Math.max(260, rect.width)}px`;
  }

  function renderUi(target, items, message) {
    closeUi();
    currentTarget = target;
    lastOrigin = location.origin;

    uiRoot = document.createElement("div");
    uiRoot.style.position = "fixed";
    uiRoot.style.zIndex = String(UI_Z);
    uiRoot.style.left = "0px";
    uiRoot.style.top = "0px";
    uiRoot.style.minWidth = "260px";

    const shadow = uiRoot.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .box {
        font: 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: #ffffff;
        border: 1px solid rgba(0,0,0,0.2);
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.18);
        overflow: hidden;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        cursor: pointer;
        border: 0;
        width: 100%;
        text-align: left;
        background: transparent;
      }
      .row:hover { background: rgba(0,0,0,0.06); }
      .title { font-weight: 600; }
      .sub { opacity: 0.75; font-size: 12px; margin-top: 2px; }
      .empty { padding: 10px 12px; opacity: 0.85; }
      .footer {
        padding: 8px 12px;
        border-top: 1px solid rgba(0,0,0,0.08);
        font-size: 12px;
        opacity: 0.8;
      }
    `;

    const box = document.createElement("div");
    box.className = "box";

    if (message) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = message;
      box.appendChild(empty);
    } else if (!items || items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Нет сохранённых логинов для этого сайта.";
      box.appendChild(empty);
    } else {
      for (const it of items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "row";
        btn.addEventListener("click", () => onPickCredential(it));
        const wrap = document.createElement("div");
        const title = document.createElement("div");
        title.className = "title";
        title.textContent = it.username || it.title || it.id;
        const sub = document.createElement("div");
        sub.className = "sub";
        sub.textContent = it.title || "";
        wrap.appendChild(title);
        if (sub.textContent) wrap.appendChild(sub);
        btn.appendChild(wrap);
        box.appendChild(btn);
      }
    }

    const footer = document.createElement("div");
    footer.className = "footer";
    footer.textContent = "Password Manager Autofill";
    box.appendChild(footer);

    shadow.appendChild(style);
    shadow.appendChild(box);
    document.documentElement.appendChild(uiRoot);

    positionUi(target);
  }

  async function onPickCredential(item) {
    const target = currentTarget;
    if (!target) return;

    const origin = lastOrigin || location.origin;

    let resp;
    try {
      resp = await api.runtime.sendMessage({
        type: "pm:getCredentialForFill",
        origin,
        credentialId: item.id,
      });
    } catch (_e) {
      renderUi(target, [], "Ошибка связи с расширением.");
      return;
    }

    if (!resp?.ok) {
      const code = resp?.error?.code || "ERR";
      if (code === "LOCKED") {
        renderUi(target, [], "Профиль заблокирован. Откройте приложение и разблокируйте профиль.");
      } else if (code === "APP_NOT_RUNNING" || code === "NATIVE_HOST_ERROR") {
        renderUi(target, [], "Приложение не запущено или native host не настроен.");
      } else if (code === "ORIGIN_MISMATCH") {
        renderUi(target, [], "Домен не совпадает с записью. Подстановка отменена.");
      } else if (code === "NO_PROFILE") {
        renderUi(target, [], "Не выбран профиль. Откройте popup расширения и выберите профиль.");
      } else {
        renderUi(target, [], `Ошибка: ${code}`);
      }
      return;
    }

    const { username, password } = resp.result || {};
    if (typeof username !== "string" || typeof password !== "string") {
      renderUi(target, [], "Некорректный ответ от приложения.");
      return;
    }

    target.focus({ preventScroll: true });
    target.value = username;
    dispatchValueEvents(target);

    const pw = findPasswordField(target);
    if (pw) {
      pw.focus({ preventScroll: true });
      pw.value = password;
      dispatchValueEvents(pw);
    }

    // Drop references
    resp = null;
    closeUi();
  }

  let focusTimer = null;

  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!isUsernameField(el)) return;

    if (focusTimer) clearTimeout(focusTimer);
    focusTimer = setTimeout(async () => {
      const origin = location.origin;

      let resp;
      try {
        resp = await api.runtime.sendMessage({ type: "pm:listCredentials", origin });
      } catch (_err) {
        renderUi(el, [], "Native host недоступен. Проверьте установку приложения.");
        return;
      }

      if (!resp?.ok) {
        const code = resp?.error?.code || resp?.error || "ERR";
        if (code === "LOCKED") {
          renderUi(el, [], "Профиль заблокирован. Откройте приложение и разблокируйте профиль.");
        } else if (code === "NO_PROFILE") {
          renderUi(el, [], "Не выбран профиль. Откройте popup расширения и выберите профиль.");
        } else if (code === "APP_NOT_RUNNING" || code === "NATIVE_HOST_ERROR") {
          renderUi(el, [], "Приложение не запущено или native host не настроен.");
        } else {
          renderUi(el, [], `Ошибка: ${code}`);
        }
        return;
      }

      renderUi(el, resp.result?.items || [], null);
    }, 20);
  });

  window.addEventListener("scroll", () => {
    if (uiRoot && currentTarget) positionUi(currentTarget);
  }, true);

  window.addEventListener("resize", () => {
    if (uiRoot && currentTarget) positionUi(currentTarget);
  });

  document.addEventListener("mousedown", (e) => {
    if (uiRoot && e.target && !uiRoot.contains(e.target)) closeUi();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeUi();
  });
}
