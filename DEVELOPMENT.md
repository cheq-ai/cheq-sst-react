# Development Guide

This guide covers setting up the development environment, building, testing, and publishing the CHEQ SST React package.

## Repository Structure

```
cheq-sst-react/
├── source/
│   └── cheq-sst-react/      # Main NPM package source
│       ├── src/             # TypeScript source files
│       ├── dist/            # Built output (generated)
│       ├── package.json     # Package configuration
│       └── tsup.config.ts   # Build configuration
├── sample-app/
│   └── react-sst-demo/      # Demo application
├── .github/
│   └── workflows/           # GitHub Actions (NPM publish)
├── package.json             # Workspace root
├── push-github.sh           # Script to push to GitHub mirror
├── README.md                # User documentation
└── DEVELOPMENT.md           # This file
```

## Prerequisites

- [Devbox](https://www.jetpack.io/devbox/docs/installing_devbox/)
- For mobile development:
    - iOS: Xcode, CocoaPods
    - Android: Android Studio, JDK 11+

## Getting Started

```bash
# Build the package
devbox run build

# Run the demo app (web)
devbox run local
```

## Development Workflow

### Watch Mode

For active development with auto-rebuild:

```bash
devbox shell
cd source/cheq-sst-react
npm run dev
```

### Clean Build

```bash
devbox shell
npm run clean
npm install
npm run build
```

## Package Configuration

The package (`source/cheq-sst-react/package.json`) is configured for:

- **ESM and CommonJS** dual output
- **React Native** specific entry point
- **TypeScript declarations** included

### Entry Points

| Export | File | Description |
|--------|------|-------------|
| `main` | `dist/index.cjs` | CommonJS entry |
| `module` | `dist/index.js` | ESM entry |
| `types` | `dist/index.d.ts` | TypeScript types |
| `react-native` | `dist/index.native.js` | React Native entry |

## Versioning

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking API changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

### Version Locations

Update version in **ALL** of these places before releasing:

1. `package.json` (root) - `"version"` field
2. `source/cheq-sst-react/package.json` - `"version"` field
3. `source/cheq-sst-react/src/Sst.ts` - `SST_VERSION` constant
4. `source/cheq-sst-react/src/Info.ts` - `LIBRARY_VERSION` constant
5. `source/cheq-sst-react/src/Models.ts` - `MODELS_VERSION` constant
6. `sample-app/react-sst-demo/package.json` - `"version"` field
7. `sample-app/react-sst-demo/app.json` - `"version"` field

## Release Process

Use git flow to create releases. The NPM publish happens automatically when the tag is pushed to GitHub.

### 1. Start Release

```bash
git flow release start <VERSION> && git flow release publish
```

### 2. Update Version Numbers

Update version in all locations listed above under "Version Locations".

### 3. Commit and Push

```bash
git add -A
git commit -m "Bump version to <VERSION>"
git push
```

### 4. Test

```bash
devbox run build
devbox run local
```

### 5. Create Pull Request

Create a PR: `release/<VERSION>` → `master`

Wait for approval before proceeding.

### 6. Finish Release

```bash
git flow release finish <VERSION> -p
```

### 7. Push to GitHub

```bash
./push-github.sh
```

This pushes `master` and tags to GitHub, which triggers the GitHub Actions workflow to publish to NPM.

### 8. Verify Publication

1. Check GitHub Actions completed: https://github.com/cheq-ai/cheq-sst-react/actions
2. Verify package: https://www.npmjs.com/package/@cheq.ai/cheq-sst-react
3. Test installation: `npm install @cheq.ai/cheq-sst-react@<VERSION>`

## Testing

### Manual Testing Checklist

Before releasing, test on:

- [ ] Web (Chrome, Safari, Firefox)
- [ ] iOS Simulator
- [ ] iOS Device
- [ ] Android Emulator
- [ ] Android Device

### Test Scenarios

1. **Basic event tracking** - Events reach SST endpoint
2. **Data layer persistence** - Values persist across sessions
3. **Storage APIs** - Cookies/localStorage/sessionStorage work
4. **UUID generation** - UUID persists and can be cleared
5. **Error handling** - Network errors handled gracefully
6. **ATT flow (iOS)** - Tracking transparency prompt works

## NPM Package Details

- **Package Name**: `@cheq.ai/cheq-sst-react`
- **Registry**: https://registry.npmjs.org/
- **Organization**: @cheq.ai
- **License**: Apache-2.0

## Repository Mirrors

- **Primary (Bitbucket)**: Internal development
- **GitHub Mirror**: https://github.com/cheq-ai/cheq-sst-react (public, NPM publishing)
