# Dibya Love Room

A private Next.js room for Dibya and Biswajit with realtime chat, gifts, love quotes, photo sharing, camera snaps, editable profiles, theme changes, and consent-only location/device sharing.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/room/dibya-biswajit`.

Without Firebase keys, the app runs in local demo mode using browser storage. It is good for testing, but only the same browser can see messages.

## Make it realtime for both phones

Use Firebase Spark free tier:

1. Create a Firebase project.
2. Create a Firestore database.
3. Enable Firebase Storage.
4. Copy `.env.example` to `.env.local`.
5. Add your web app Firebase config values.
6. Publish `firestore.rules` and `storage.rules` in Firebase console.

The current rules are open because you asked for no login. That keeps sharing simple, but anyone with the link can read/write. For stronger privacy later, add anonymous auth and invite codes.

The package versions are pinned so Vercel and your laptop use the same dependency graph. You can upgrade them later with `npm update` after the first deploy is stable.

## Deploy to Firebase Hosting

Firebase Hosting can host this Next.js app too. Run these from this folder:

```bash
npm install -g firebase-tools
firebase login
firebase experiments:enable webframeworks
firebase init hosting
```

Choose your Firebase project, answer **yes** to using a web framework, choose **Next.js** if asked, and keep this folder as the source directory. After init, deploy:

```bash
firebase deploy
```

If Firebase creates `.firebaserc`, make sure the project id matches your Firebase project. See `.firebaserc.example`.

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Add the same `NEXT_PUBLIC_FIREBASE_*` environment variables in Vercel project settings.
4. Deploy.

Your private share URL will look like:

```text
https://your-vercel-site.vercel.app/room/dibya-biswajit
```

## Privacy note

Camera, location, and device details are only sent after someone taps the matching button and accepts browser permission where required. The app does not collect hidden location or hidden device information.
