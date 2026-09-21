# CHEQ SST React

Server-Side Tagging (SST) SDK for React and React Native applications. This package enables CHEQ's tag management capabilities in your mobile and web applications.

## Installation

```bash
npm install @cheq.ai/cheq-sst-react
```

## Requirements

- React 17 or higher
- For React Native: Expo or bare React Native project

## Quick Start

```javascript
import { Sst, Config, Event } from "@cheq.ai/cheq-sst-react";

// Configure SST with your client name
Sst.configure(new Config("your_client_name"));

// Track an event
await Sst.trackEvent(new Event("page_view", {
  data: { route: "/home" }
}));
```

## Configuration Options

```javascript
import { Sst, Config, Models, CheqAdvertisingModel } from "@cheq.ai/cheq-sst-react";

Sst.configure(new Config("your_client_name", {
  domain: "t.nc0.co",           // SST domain (default)
  nexusHost: "nexus.ensighten.com", // Error reporting host (default)
  publishPath: "sst",           // Publish path (default)
  dataLayerName: "digitalData", // Data layer namespace (default)
  debug: false,                 // Enable debug logging
  screenEnabled: true,          // Collect screen dimensions
  models: Models.default()      // Data models to include
}));
```

## Data Layer

The SDK provides a persistent data layer for storing event context. Values survive app restarts:
on web through `localStorage`, on React Native through `@react-native-async-storage/async-storage`
(see [Optional Peer Dependencies](#optional-peer-dependencies); without it the data layer is
memory-only and resets on every launch). It does not depend on `Sst.configure()` having run.

```javascript
// Add values
await Sst.dataLayer.add("user", { id: "123", tier: "premium" });
await Sst.dataLayer.add("route", "/checkout");

// Get values
const user = await Sst.dataLayer.get("user");

// Get all values
const all = await Sst.dataLayer.all();

// Clear
await Sst.dataLayer.clear();

// Persisted across launches
const count = (await Sst.dataLayer.get("launch_count")) ?? 0;
await Sst.dataLayer.add("launch_count", count + 1);
```

## Storage APIs

The SDK provides cookie, localStorage, and sessionStorage abstractions that work across platforms:

```javascript
// Cookies
Sst.cookies.add("consent", "granted");
Sst.cookies.add({ key1: "value1", key2: "value2" });

// Local Storage
Sst.localStorage.add("preference", "dark");

// Session Storage
Sst.sessionStorage.add("session_id", "abc123");
```

## Advertising / IDFA Support

To enable advertising ID collection (IDFA on iOS, AAID on Android):

```javascript
import {
  Models,
  CheqAdvertisingModel,
  getAdvertisingId,
  getAdvertisingAuthorization,
  getTrackingAuthorizationStatus
} from "@cheq.ai/cheq-sst-react";

// Include advertising model in config
Sst.configure(new Config("your_client_name", {
  models: Models.default().add(new CheqAdvertisingModel())
}));

// Request tracking authorization (iOS ATT)
const granted = await getAdvertisingAuthorization();

// Check status
const status = await getTrackingAuthorizationStatus();
// Returns: "authorized" | "denied" | "restricted" | "notDetermined" | "unavailable"

// Get advertising ID (only if authorized)
if (granted) {
  const advertisingId = await getAdvertisingId();
}
```

## UUID Management

The SDK generates and persists a unique identifier:

```javascript
import { getUUID, clearUUID } from "@cheq.ai/cheq-sst-react";

const uuid = await getUUID();
clearUUID(); // Clear stored UUID
```

## Events

Create events with custom data and URL parameters:

```javascript
const event = new Event("purchase", {
  data: {
    orderId: "ORD-123",
    total: 99.99,
    items: ["SKU-1", "SKU-2"]
  },
  parameters: {
    ensDisableTracking: "user" // URL query parameters
  }
});

const result = await Sst.trackEvent(event);
```

## API Reference

### Sst

| Method | Description |
|--------|-------------|
| `configure(config)` | Initialize SST with configuration. Returns a promise that resolves once persisted storage is loaded (immediately on web); `trackEvent` waits for it on its own |
| `trackEvent(event)` | Send an event to SST |
| `getCheqUuid()` | Get the current CHEQ UUID. Native only — returns `null` on web, where the browser owns the cookie. On native, `await Sst.configure(...)` first, or it is `null` until persisted storage has loaded |
| `clearCheqUuid()` | Clear the stored UUID; the collector issues a new one on the next request. Native only |
| `dataLayer` | Access the data layer API |
| `cookies` | Access the cookies API |
| `localStorage` | Access the localStorage API |
| `sessionStorage` | Access the sessionStorage API |

### Config

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientName` | string | required | Your CHEQ client identifier |
| `domain` | string | `"t.nc0.co"` | SST collection domain |
| `nexusHost` | string | `"nexus.ensighten.com"` | Error reporting endpoint |
| `publishPath` | string | `"sst"` | Publish path |
| `dataLayerName` | string | `"digitalData"` | Data layer namespace |
| `debug` | boolean | `false` | Enable debug logging |
| `screenEnabled` | boolean | `true` | Collect screen info |
| `models` | Models | `Models.default()` | Data collection models |

## Platform Support

- React (Web)
- React Native (iOS)
- React Native (Android)
- Expo

## Optional Peer Dependencies

These are not installed for you. Each is loaded lazily and skipped silently if absent,
so install the ones matching the data you want collected.

```bash
# Device model, manufacturer, app version, User-Agent
npm install react-native-device-info

# Timezone and locale
npm install react-native-localize    # or, in Expo apps: expo-localization

# iOS ATT status and advertising ID
npm install expo-tracking-transparency          # Expo apps
npm install react-native-tracking-transparency  # bare React Native apps

# Persists the CHEQ UUID and storage values across app restarts.
# Without it they are kept in memory only and reset on every launch. Any 1.x, 2.x or 3.x works.
npm install @react-native-async-storage/async-storage
```

Install **one** tracking-transparency package, not both — they are two bridges to the
same iOS framework, and linking both puts two ATT native modules in one binary.

## License

Apache 2.0 - See [LICENSE](https://github.com/cheq-ai/cheq-sst-react/blob/master/LICENSE) for details.

## Support

For support, contact [support@cheq.ai](mailto:support@cheq.ai)
