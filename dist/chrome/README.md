# Password Manager Autofill (Chrome + Firefox)

Готовый каркас расширения, которое:
- показывает список сохранённых логинов **сразу при фокусе** (клик/Tab) на поле логина/e-mail;
- запрашивает пароль у локального приложения **только после выбора пункта**;
- заполняет логин + пароль.

## Native Messaging (кратко)
Браузер запускает `pm-native-host.exe` и общается с ним через stdin/stdout:
JSON (UTF-8) + 4-байтная длина (native byte order); max ~1MB на сообщение.

Документация:
- Chrome: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- Firefox: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging
- Native manifests: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests

## Что в архиве
- `dist/chrome/` — Chrome/Edge (Manifest V3)
- `dist/firefox/` — Firefox (Manifest V3) + `browser_specific_settings.gecko.id = password-manager@local.app`

## Установка (Chrome)
1) `chrome://extensions`
2) Developer mode = ON
3) Load unpacked → выбери папку `dist/chrome`

## Установка (Firefox)
1) `about:debugging#/runtime/this-firefox`
2) Load Temporary Add-on… → выбери `dist/firefox/manifest.json`

## Важно: allowlist для native host
Host-manifest должен разрешать *только* твоё расширение:
- Chrome: `allowed_origins: ["chrome-extension://<CHROME_EXTENSION_ID>/"]`
- Firefox: `allowed_extensions: ["password-manager@local.app"]`

## Как пользоваться
- Кликни (или Tab) в поле e-mail/логина → список появится сразу.
- Выбери пункт → расширение запросит пароль у приложения и заполнит парольное поле (если найдёт его рядом/в форме).
