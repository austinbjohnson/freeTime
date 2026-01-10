# Free Time

A clothing analysis app that helps resellers determine item values by scanning tags and garments.

## What It Does

1. **Scan** - Take photos of clothing tags, garments, or condition details
2. **Extract** - AI identifies brand, style, materials, era, and condition
3. **Research** - Automatically searches resale platforms for comparable items
4. **Price** - Get suggested price ranges based on market data

## Quick Start

### Prerequisites

- Node.js 18+
- Convex account ([convex.dev](https://convex.dev))
- API keys for: OpenAI, Anthropic, SerpAPI
- (Optional) WorkOS account for auth

### Setup

```bash
# Clone and install
git clone https://github.com/austinbjohnson/freeTime.git
cd freeTime
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Set Convex environment variables
npx convex env set ANTHROPIC_API_KEY=sk-ant-...
npx convex env set OPENAI_API_KEY=sk-...
npx convex env set SERPAPI_API_KEY=...

# Start development
npx convex dev
```

### Test the Backend

```bash
npm run test:web
# Opens http://localhost:3001
```

Upload an image and watch the pipeline process it through extraction → research → refinement.

## Project Structure

```
freeTime/
├── convex/                    # Backend (Convex)
│   ├── schema.ts             # Database schema
│   ├── scans.ts              # Scan CRUD
│   └── pipeline/             # AI processing pipeline
│       ├── extraction.ts     # Image analysis
│       ├── research.ts       # Web search
│       ├── refinement.ts     # Price synthesis
│       └── orchestrator.ts   # Pipeline coordination
├── iOS/                       # iOS app (Swift/SwiftUI)
│   └── FreeTime/
├── web-test/                  # Backend test UI
└── testImages/               # Sample images for testing
```

## How It Works

```
Image(s) → Extraction → Research → Refinement → Results
             (AI)       (SerpAPI)     (AI)
```

### Smart Image Analysis

The AI automatically detects what type of image you've uploaded:

| Image Type | What's Extracted |
|------------|------------------|
| **Tag** | Brand, SKU, RN number, materials, size, care instructions |
| **Garment** | Style, era, patterns, construction, estimated brand/origin |
| **Condition** | Grade (excellent→poor), issues, wear level |

### Multi-Image Support

Upload multiple images per item - the system merges data intelligently:
- Tag data provides definitive brand/materials
- Garment photos identify style and era
- Condition shots affect pricing recommendations

## Tech Stack

- **Backend**: [Convex](https://convex.dev) (serverless functions, database, file storage)
- **Auth**: [WorkOS](https://workos.com) AuthKit
- **AI Vision**: Anthropic Claude / OpenAI GPT-4 (with automatic fallback)
- **Search**: SerpAPI
- **iOS**: Swift/SwiftUI with Vision framework

## Environment Variables

Create `.env.local`:

```bash
CONVEX_DEPLOYMENT=your-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud

# AI Providers (set via `npx convex env set`)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SERPAPI_API_KEY=...

# Auth (optional)
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
```

## Contributing

See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines.

1. Create a GitHub issue for your work
2. Branch from main: `git checkout -b feature/XX-description`
3. Reference issues in commits: `feat: add feature (#XX)`
4. Open a PR when ready

## License

Private - All rights reserved

