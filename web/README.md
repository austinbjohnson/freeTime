# Free Time Web Portal

User-facing portal that mirrors the iOS scan experience (upload-based intake).

## Requirements

- Node.js 18+
- Convex deployment
- WorkOS AuthKit configured for Google + Apple providers

## Environment Variables

Create `web/.env.local`:

```
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
NEXT_PUBLIC_WORKOS_CLIENT_ID=client_...
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/auth/callback
```

## Local Development

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

## Notes

- Auth is powered by WorkOS AuthKit; limit providers in the WorkOS dashboard.
- Multi-image uploads are supported on day one (tag/garment/condition).
