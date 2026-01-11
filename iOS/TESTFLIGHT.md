# TestFlight Distribution Guide

## Prerequisites

- **Apple Developer Account** ($99/year) - [developer.apple.com](https://developer.apple.com)
- **Xcode 15+** installed
- **App icon** (1024x1024 PNG) added to `Assets.xcassets/AppIcon.appiconset/`

## Quick Start

### 1. Set Your Development Team

Open `project.yml` and set your Team ID:

```yaml
settings:
  base:
    DEVELOPMENT_TEAM: "YOUR_TEAM_ID"  # Find this in Apple Developer Portal
```

Then regenerate the project:
```bash
cd iOS/FreeTime && xcodegen generate
```

### 2. Add Your App Icon

Add a 1024x1024 PNG named `AppIcon.png` to:
```
Sources/FreeTime/Assets.xcassets/AppIcon.appiconset/
```

Update `Contents.json`:
```json
{
  "images": [
    {
      "filename": "AppIcon.png",
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

### 3. Create App in App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Click **Apps** → **+** → **New App**
3. Fill in:
   - **Platform**: iOS
   - **Name**: Free Time
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: `com.ajohnson.freetime` (must match Xcode)
   - **SKU**: `freetime` (any unique string)

### 4. Archive & Upload

In Xcode:

1. **Select device**: "Any iOS Device (arm64)"
2. **Product** → **Archive**
3. Wait for archive to complete
4. In **Organizer** window, click **Distribute App**
5. Choose **App Store Connect** → **Upload**
6. Follow prompts (default options are fine)

### 5. Submit for TestFlight Review

Back in App Store Connect:

1. Go to your app → **TestFlight** tab
2. Wait for build to finish processing (5-30 min)
3. Click on the build number
4. Fill in **Test Information**:
   - **Beta App Description**: "Clothing resale value analyzer"
   - **What to Test**: "Take a photo of a clothing tag to get pricing recommendations"
   - **Email**: Your contact email
5. Add **Export Compliance** info:
   - "Does this app use encryption?" → **No** (we use HTTPS but no custom crypto)
6. Click **Submit for Review**

Review typically takes **24-48 hours**.

### 6. Add Beta Testers

Once approved:

1. **TestFlight** → **Internal Testing** → **App Store Connect Users**
   - These are people on your Apple Developer team (immediate access)

2. **TestFlight** → **External Testing** → **+** to create a group
   - Add emails of friends to test
   - They'll get an invite to download TestFlight app

## Build Versioning

Before each upload, increment the build number in `project.yml`:

```yaml
settings:
  base:
    MARKETING_VERSION: "0.1.0"      # User-visible version (App Store)
    CURRENT_PROJECT_VERSION: "2"    # Build number (increment for each upload)
```

Then regenerate: `xcodegen generate`

## Troubleshooting

### "No accounts with App Store Connect access"
- Open Xcode → Settings → Accounts → Add your Apple ID

### "No signing certificate"
- Xcode → Settings → Accounts → Select team → Manage Certificates → **+** iOS Distribution

### "Bundle ID not registered"
1. Go to [developer.apple.com/account/resources/identifiers](https://developer.apple.com/account/resources/identifiers)
2. Click **+** → **App IDs** → **App**
3. Enter Bundle ID: `com.ajohnson.freetime`

### Archive greyed out
- Select "Any iOS Device (arm64)" as the build target (not a simulator)

### Build rejected - Missing privacy manifest
- ✅ Already included: `Sources/FreeTime/PrivacyInfo.xcprivacy`

## Privacy Policy

TestFlight requires a privacy policy URL. Options:

1. **Quick**: Use a free generator like [privacypolicygenerator.info](https://privacypolicygenerator.info)
2. **GitHub**: Create a `PRIVACY.md` in this repo and link to the raw URL
3. **Notion/Google Doc**: Create a public page

The policy should mention:
- Photos are processed to analyze clothing tags
- Account info (email) is used for login via WorkOS
- Data is stored on Convex servers
- We don't sell or share data with third parties

## Helpful Commands

```bash
# Regenerate Xcode project after yml changes
cd iOS/FreeTime && xcodegen generate

# Open in Xcode
open iOS/FreeTime/FreeTime.xcodeproj

# Check code signing
security find-identity -v -p codesigning
```

