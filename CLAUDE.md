# Free Time - Project Guidelines

## Overview

Free Time is a clothing analysis application that helps users determine resale values by scanning clothing tags and garments.

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
│   └── FreeTime/
├── web-test/                  # Backend test page
└── package.json
```

## Task Management

**This project uses GitHub Issues exclusively** for tracking work.

### Git Workflow

**Always use feature branches tied to issues:**

```bash
# Create a feature branch for issue #42
git checkout -b feature/42-add-multi-image-upload

# Do work, commit with issue reference
git commit -m "feat: add multi-image upload (#42)"

# Push and create PR
git push -u origin feature/42-add-multi-image-upload
gh pr create --fill

# After merge, clean up
git checkout main && git pull
git branch -d feature/42-add-multi-image-upload
```

**Branch naming convention:**
- `feature/XX-short-description` - New features
- `fix/XX-short-description` - Bug fixes
- `docs/XX-short-description` - Documentation only

**Commit messages should reference issues:** `feat: description (#XX)` or `Closes #XX`

### GitHub CLI Commands

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
Image(s) → Extraction → Research → Refinement → Results
             (AI)       (SerpAPI)     (AI)
```

Each stage is isolated and can be swapped independently.

### Stage Details

1. **Extraction** (`pipeline/extraction.ts`)
   - Auto-detects image type: `tag | garment | condition | detail`
   - Tag images → brand, SKU, RN number, materials
   - Garment images → style, era, patterns, construction
   - Condition images → grade, issues, wear level
   - Generates AI search suggestions for research stage

2. **Research** (`pipeline/research.ts`)
   - Uses SerpAPI for web search
   - Prioritizes AI-generated search suggestions
   - Falls back to programmatic queries from extracted data
   - Targets resale platforms (eBay, Poshmark, Mercari, etc.)

3. **Refinement** (`pipeline/refinement.ts`)
   - Synthesizes research into pricing recommendations
   - Provides market activity assessment
   - Falls back to statistical analysis if AI fails

## Convex Constraints

### "use node" Files
- Files with `"use node"` can only export **actions**, not mutations or queries
- If you need a mutation called from an action, define it in a separate file and use `ctx.runMutation(internal.file.mutation, args)`

### Internal vs Public APIs
- Use `internal` for functions called only by other backend code
- Use `api` for functions callable from clients
- Actions calling other actions: use `internal.pipeline.extraction.analyzeImage`

## Image Processing

### Size Limits
- **Anthropic Claude**: 5MB base64 limit for images
- Images are auto-compressed using Jimp if > 4MB

### Why Jimp, Not Sharp
Sharp has native binaries that don't work in Convex's serverless environment. Jimp is pure JavaScript and works everywhere.

### Compression Strategy
1. Check if image > 4MB
2. Reduce JPEG quality (90 → 10) iteratively
3. If still too large, resize dimensions by 10% steps
4. Target: under 4MB for safe base64 encoding

## AI Providers

### Configuration
Set in Convex environment variables:
```bash
npx convex env set ANTHROPIC_API_KEY=sk-ant-...
npx convex env set OPENAI_API_KEY=sk-...
npx convex env set SERPAPI_API_KEY=...
```

### Fallback Strategy
1. Try primary provider (default: Anthropic)
2. On failure, try fallback provider (OpenAI)
3. For refinement: if both AI providers fail, use statistical analysis
4. All attempts logged to `pipelineRuns` table for debugging

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

