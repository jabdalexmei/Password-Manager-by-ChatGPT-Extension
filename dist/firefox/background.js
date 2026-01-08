const HOST = "com.passwordmanager.native";

const api = (() => {
  if (typeof browser !== "undefined" && browser.runtime) return browser;
  return chrome;
})();

function getLastErrorMessage() {
  const err = api.runtime.lastError;
  return err ? (err.message || String(err)) : null;
}

function sendNative(type, payload) {
  return new Promise((resolve, reject) => {
    api.runtime.sendNativeMessage(HOST, { id: crypto.randomUUID(), type, payload }, (resp) => {
      const le = getLastErrorMessage();
      if (le) {
        reject(Object.assign(new Error(le), { code: "NATIVE_HOST_ERROR" }));
        return;
      }
      if (!resp || typeof resp !== "object") {
        reject(Object.assign(new Error("Empty response from native host"), { code: "NATIVE_HOST_EMPTY" }));
        return;
      }
      if (resp.ok) resolve(resp.result);
      else reject(Object.assign(new Error(resp.error?.code || "NATIVE_HOST_FAIL"), { code: resp.error?.code || "NATIVE_HOST_FAIL" }));
    });
  });
}

async function getStoredProfileId() {
  const out = await api.storage.local.get({ profileId: null });
  return out.profileId;
}

async function setStoredProfileId(profileId) {
  await api.storage.local.set({ profileId });
}

api.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  (async () => {
    switch (req?.type) {
      case "pm:listProfiles": {
        const result = await sendNative("list_profiles", {});
        sendResponse({ ok: true, result });
        return;
      }
      case "pm:getStatus": {
        const profileId = req.profileId || (await getStoredProfileId());
        if (!profileId) {
          sendResponse({ ok: true, result: { locked: true, profileId: null } });
          return;
        }
        const result = await sendNative("get_status", { profileId });
        sendResponse({ ok: true, result: { ...result, profileId } });
        return;
      }
      case "pm:setProfile": {
        if (!req.profileId || typeof req.profileId !== "string") {
          sendResponse({ ok: false, error: "BAD_PROFILE" });
          return;
        }
        await setStoredProfileId(req.profileId);
        sendResponse({ ok: true });
        return;
      }
      case "pm:listCredentials": {
        const profileId = req.profileId || (await getStoredProfileId());
        if (!profileId) {
          sendResponse({ ok: false, error: { code: "NO_PROFILE" } });
          return;
        }
        const result = await sendNative("list_credentials", { profileId, origin: req.origin });
        sendResponse({ ok: true, result });
        return;
      }
      case "pm:getCredentialForFill": {
        const profileId = req.profileId || (await getStoredProfileId());
        if (!profileId) {
          sendResponse({ ok: false, error: { code: "NO_PROFILE" } });
          return;
        }
        const result = await sendNative("get_credential_for_fill", {
          profileId,
          origin: req.origin,
          credentialId: req.credentialId,
        });
        sendResponse({ ok: true, result });
        return;
      }
      default:
        sendResponse({ ok: false, error: "UNKNOWN_REQUEST" });
        return;
    }
  })().catch((e) => {
    sendResponse({ ok: false, error: { code: e.code || "ERR", message: e.message || String(e) } });
  });

  return true; // async
});
