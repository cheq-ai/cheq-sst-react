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

The SDK provides a persistent data layer for storing event context:

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
| `configure(config)` | Initialize SST with configuration |
| `trackEvent(event)` | Send an event to SST |
| `getCheqUuid()` | Get the current CHEQ UUID |
| `clearCheqUuid()` | Clear the stored UUID |
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

For full React Native functionality, install these optional dependencies:

```bash
npm install react-native-device-info react-native-localize expo-tracking-transparency
```

## License

Apache 2.0 - See [LICENSE](https://github.com/cheq-ai/cheq-sst-react/blob/master/LICENSE) for details.

## Support

For support, contact [support@cheq.ai](mailto:support@cheq.ai)
