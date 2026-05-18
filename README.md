# HeartLink

HeartLink is a private social chat app built with Next.js and Firebase.

## Features

- Google login for account owners
- Public user profiles with username, name, bio, and photo URL
- User discovery and username search
- Chat requests with accept and deny actions
- Shared 1:1 chat rooms after a request is accepted
- Realtime Firestore messages
- Edit and delete messages
- Compressed photo upload and camera snaps stored in Firestore
- Reactions, gifts, room prompts, themes, and a small tap game
- Consent-only location and device sharing

## Firebase Setup

Create a Firebase project, then enable:

- Authentication: Google provider
- Firestore Database
- Firebase Hosting

Firebase Storage is not required. Photos are compressed in the browser and saved as small Firestore message data URLs.

Create `.env.local` from `.env.example` and fill in your Firebase web app config.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run lint
npm run typecheck
npm run build
```

## Deploy To Firebase Hosting

```bash
firebase login
firebase deploy --only "hosting,firestore:rules" --project love-room-48927
```

After deploy, open:

```text
https://love-room-48927.web.app
```
