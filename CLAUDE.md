# Tag Scanner - Project Guidelines

## Overview

Tag Scanner is a clothing tag analysis application that helps users determine resale values by scanning clothing tags.

## Tech Stack

- **Backend**: Convex (serverless functions, database, file storage)
- **Auth**: WorkOS AuthKit
- **iOS**: Swift/SwiftUI with Vision framework
- **AI**: Anthropic Claude / OpenAI GPT-4 (abstracted for swappability)
- **Search**: SerpAPI for web research

## Project Structure

```
freeTime/
├── convex/                    # Convex backend
│   ├── schema.ts             # Database schema
│   ├── users.ts              # User management
│   ├── scans.ts              # Scan CRUD operations
│   └── pipeline/             # Processing pipeline
│       ├── extraction.ts     # Stage 1: AI data extraction
│       ├── research.ts       # Stage 2: Web research
│       ├── refinement.ts     # Stage 3: AI synthesis
│       ├── orchestrator.ts   # Pipeline coordination
│       ├── logging.ts        # Audit logging
│       └── types.ts          # Shared types
├── iOS/                       # iOS application
│   └── TagScanner/
├── web-test/                  # Backend test page
└── package.json
```

## Task Management

**This project uses GitHub Issues exclusively** for tracking work.

```bash
# Create issue
gh issue create --title "Title" --label "feature" --body "Description"

# List issues
gh issue list

# Close issue
gh issue close <number>
```

### Labels

- `feature` - New feature
- `bug` - Something broken
- `backend` - Convex/pipeline work
- `ios` - iOS app work
- `infrastructure` - Setup/config

## Pipeline Architecture

```
Image → Extraction → Research → Refinement → Results
         (AI)       (SerpAPI)     (AI)
```

Each stage is isolated and can be swapped independently.

## Development

### Backend

```bash
# Start Convex dev server
npx convex dev

# Test web interface
npm run test:web
# Opens http://localhost:3001
```

### iOS

Open `iOS/TagScanner` in Xcode and configure:
- Bundle ID
- Development team
- WorkOS Client ID in scheme environment variables

## Environment Variables

Required in `.env.local`:

```
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
SERPAPI_API_KEY=
WORKOS_API_KEY=
WORKOS_CLIENT_ID=
```

