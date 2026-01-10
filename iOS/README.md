# Tag Scanner iOS App

A native iOS app for scanning clothing tags and getting resale pricing insights.

## Setup

### Prerequisites

- Xcode 15+
- iOS 17+ deployment target
- Active WorkOS account for authentication

### Configuration

1. **Create Xcode Project**
   
   Since we're using Swift Package Manager structure, you'll need to create an Xcode project that references these sources:
   
   ```bash
   cd iOS/TagScanner
   # Open in Xcode and create a new iOS App project
   # Point it to use the Sources folder
   ```

2. **Environment Variables**
   
   Add these to your Xcode scheme or `.xcconfig`:
   
   ```
   WORKOS_CLIENT_ID=your_client_id_here
   ```

3. **WorkOS Setup**
   
   - Add `tagscanner://callback` as a redirect URI in your WorkOS dashboard
   - Ensure AuthKit is enabled for your project

### Building

1. Open `TagScanner.xcodeproj` in Xcode (after you create it)
2. Select your development team
3. Build and run on device or simulator

## Architecture

### Services

- **AuthService** - WorkOS authentication via AuthKit
- **ConvexService** - HTTP client for Convex backend
- **VisionService** - On-device text extraction using Apple Vision

### Features

- **Camera** - Capture tag photos with flash support
- **Scans** - List and manage scanned items
- **Results** - View pricing insights and comparable listings

### Data Flow

```
Camera Capture → Vision OCR → Upload to Convex → Pipeline Processing → Display Results
```

## Project Structure

```
iOS/TagScanner/
├── Sources/TagScanner/
│   ├── App/
│   │   └── TagScannerApp.swift
│   ├── Models/
│   │   ├── Scan.swift
│   │   └── User.swift
│   ├── Services/
│   │   ├── AuthService.swift
│   │   ├── ConvexService.swift
│   │   └── VisionService.swift
│   └── Features/
│       ├── Auth/
│       │   └── LoginView.swift
│       ├── Camera/
│       │   └── CameraView.swift
│       ├── Scans/
│       │   ├── ScanListView.swift
│       │   └── ScanDetailView.swift
│       └── Main/
│           └── MainTabView.swift
└── Package.swift
```

