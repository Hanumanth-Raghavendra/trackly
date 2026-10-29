# The Android app

The Android app is the **same React code** as the website, packaged with
[Capacitor](https://capacitorjs.com). There's one codebase and one set of tests, and features ship
to web and mobile together.

## What's different on the phone

| | Web | Android |
|---|---|---|
| API address | Same origin (`/api`, rewritten by Vercel) | Absolute URLs from `.env.mobile` |
| Staying signed in | Refresh token in an httpOnly cookie | Refresh token in the app's private storage (`@capacitor/preferences`), excluded from backups |
| How the API knows | default | Header `X-Client: native` returns the refresh token in the response body |
| Habit reminders | Web push from the server (optional) | **On-device notifications** scheduled from your habits: they fire on time even when the free server is asleep |
| Feel | | Haptic feedback on check-ins and completions |
| Offline shell | Service worker (PWA) | The app ships its own files, so there's no service worker |

The server allows the app's origins (`https://localhost`, `capacitor://localhost`) automatically.

## Get the APK without installing anything

GitHub builds it for free:

1. GitHub → your `trackly` repo → **Actions** → **Android app** → **Run workflow** → **Run**.
2. When it finishes (about 5 minutes), open the run → **Artifacts** → **trackly-debug-apk**. You
   get a zip containing `app-debug.apk`.
3. Copy the APK to your phone and open it. Android asks once to allow installing apps from that
   source (your Files app or browser). Allow it, then install.

Pushing a tag such as `v1.0.0` also attaches the APK to a GitHub Release, which is where the
landing page's **Android app** link points.

The app talks to `https://trackly-core-api.onrender.com` and `https://trackly-insights.onrender.com`.
If Render gave your services other URLs, set the repository **variables** `MOBILE_API_URL` and
`MOBILE_INSIGHTS_URL` (Settings → Secrets and variables → Actions → **Variables**) and run the
workflow again.

## Build it yourself (optional)

Needs [Android Studio](https://developer.android.com/studio) (free) and JDK 21. In PowerShell:

```powershell
cd C:\Users\<you>\trackly\apps\web
Copy-Item .env.mobile.example .env.mobile
npm ci
npm run cap:sync
npm run cap:open
```

`cap:sync` builds the web app in mobile mode and copies it into `android/`. `cap:open` opens the
project in Android Studio: pick a phone or emulator and press **Run**. Repeat `npm run cap:sync`
after every web change.

App icons and splash screens are generated from code. After changing the logo, run from the repo
root: `python3 scripts/generate-icons.py` (needs `pip install pillow`).

## Publishing on Google Play

Everything above is free. Publishing on Google Play needs a **Google Play Console developer
account**, which has a **one-time registration fee (US$25 at the time of writing)**. That is the
only cost anywhere in this project, and only if you decide to publish.

> New personal developer accounts must first run a **closed test with at least 12 testers who stay
> opted in for 14 days in a row** before Google grants production access. Plan for those two weeks.
> ([Google's policy](https://support.google.com/googleplay/android-developer/answer/14151465))

### 1. Create an upload key (once)

`keytool` comes with the JDK. Keep the key **outside** the repo and back it up: if you lose it,
you need Google's help to reset it.

```powershell
mkdir C:\Users\<you>\keys
cd C:\Users\<you>\keys
keytool -genkeypair -v -keystore trackly-upload.jks -alias trackly -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a password and your name; remember the password.

### 2. Give the key to GitHub as secrets

Copy the key file as text (base64) to the clipboard:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\<you>\keys\trackly-upload.jks")) | Set-Clipboard
```

GitHub → repo → **Settings** → **Secrets and variables** → **Actions** → **New repository
secret**, four times:

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | paste the clipboard |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `trackly` |
| `ANDROID_KEY_PASSWORD` | the key password (the same one, if you pressed Enter at that prompt) |

### 3. Build the signed bundle

Run the **Android app** workflow again (or push a tag like `v1.0.1`). With the secrets present it
also produces **trackly-release-aab** (`app-release.aab`), the file Google Play wants. Each CI build
gets a higher `versionCode` automatically, which Play requires for every upload.

### 4. Create the listing in Play Console

1. **Create app** → name *Trackly*, app, free.
2. **Testing → Closed testing** → create a release → upload `app-release.aab`. Accept **Play App
   Signing** (Google keeps the app signing key; yours is the upload key).
3. Fill in **App content**:
   - **Privacy policy:** `https://<your-vercel-url>/privacy.html` (the page ships with the app)
   - **Data safety:** collects email, name and user content (tasks, habits); encrypted in transit;
     users can request deletion (Settings → Delete account); no data shared with third parties
     (the optional AI feature sends task text to the AI provider you configured, so mention it if
     you enable AI)
   - **Ads:** none. **Target audience:** 18+.
4. **Store listing:** short and full description, icon (512 px:
   `apps/web/public/icons/icon-512.png`), and phone screenshots (`docs/screenshots/mobile-*.png`).
5. Add 12+ testers to the closed test and keep them for 14 days, then apply for production.

## Next steps for the mobile app

- **Server push to the phone (Firebase Cloud Messaging, free):** add `@capacitor/push-notifications`
  and an FCM sender next to the existing web-push sender in `services/insights/src/notifications`.
- **iOS:** Capacitor supports it (`npx cap add ios`), but building needs a Mac and the Apple
  Developer Program costs US$99 a year, so it isn't included.
