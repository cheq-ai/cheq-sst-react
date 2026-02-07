import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CheqAdvertisingModel, Config, Event, Models, Sst, getAdvertisingAuthorization, getAdvertisingId, getTrackingAuthorizationStatus, getUUID, clearUUID } from "cheq-sst-react";

const account_name = "demoretail";

const add_storage = () => {
    Sst.cookies.add("cookie_test", "1");
    Sst.cookies.add({
        MOBILE_DEMO_ENSIGHTEN_PRIVACY_BANNER_LOADED: "1",
        MOBILE_DEMO_ENSIGHTEN_PRIVACY_Analytics: "1",
    });
    Sst.localStorage.add("ls_test", "world");
    Sst.localStorage.add({ ls_obj1: "val1" });
    Sst.sessionStorage.add("ss_test", "bar");
    Sst.sessionStorage.add({ ss_obj1: "val1" });
};

const configure_sst = () => {
    Sst.configure(
        new Config(account_name, {
            models: Models.default().add(new CheqAdvertisingModel()),
            //models: Models.default(),
            //models: Models.required(),
            debug: true
        })
    );

    add_storage();
};

export default function App() {
    const [uuid, setUuid] = useState(null);
    const [att_status, setAttStatus] = useState(null);
    const [att_tracking_granted, setAttTrackingGranted] = useState(false);
    const [advertising_id, setAdvertisingId] = useState(null);

    // What we DISPLAY on the page should match what SST SENDS.
    const [dataLayer, setDataLayer] = useState(null);
    const [settings, setSettings] = useState(null);
    const [storage, setStorage] = useState(null);
    const [virtualBrowser, setVirtualBrowser] = useState(null);
    const [lastSend, setLastSend] = useState(null);
    const [sending, setSending] = useState(false);
    const [lastError, setLastError] = useState(null);

    const snapshotLocalDebug = async () => {
        // This is a local snapshot (no network) - helpful before sending.
        const dl = await Sst.dataLayer.all();
        setDataLayer(dl);

        setStorage({
            cookies: Sst.cookies.all(),
            localStorage: Sst.localStorage.all(),
            sessionStorage: Sst.sessionStorage.all(),
        });
    };

    const applyPayloadToDebugPanels = (payload) => {
        // These keys are created inside Sst.trackEvent()
        setSettings(payload?.settings ?? null);
        setVirtualBrowser(payload?.virtualBrowser ?? null);
        setStorage(payload?.storage ?? null);
        setDataLayer(payload?.dataLayer ?? null);
    };

    const sendAndCapture = async (event) => {
        setSending(true);
        setLastError(null);

        try {
            const res = await Sst.trackEvent(event);
            if (!res || !res.requestBody) {
                setLastSend(null);
                setLastError("trackEvent returned null (network/serialization/config)");
                return null;
            }

            const payload = JSON.parse(res.requestBody);
            setLastSend(payload);
            return payload;
        }
        catch (e) {
            setLastSend(null);
            setLastError(String(e?.message ?? e));
            return null;
        }
        finally {
            setSending(false);
        }
    };

    const send_custom_example_no_uuid = async () => {
        await sendAndCapture(
            new Event("custom_example", {
                data: {
                    string: "foobar",
                    int: 123,
                    float: 456.789,
                    boolean: true,
                },
                parameters: {
                    ensDisableTracking: "user",
                },
            })
        );
    };

    const trigger_network_error = async () => {
        Sst.configure(
            new Config(account_name, {
                domain: "test.invalid",
                debug: true,
            })
        );

        await sendAndCapture(new Event("network_error"));

        // restore
        configure_sst();
    };

    const trigger_track_event_error = async () => {
        // BigInt will fail JSON.stringify inside the SDK -> trackEvent returns null + error beacon
        await sendAndCapture(
            new Event("custom_example", {
                data: { bad: 123n },
                parameters: { ensDisableTracking: "user" },
            })
        );
    };

    const trigger_data_layer_add_error = async () => {
        // BigInt in DataLayer should error (depending on implementation) - kept for testing
        await Sst.dataLayer.add("bad", { n: 1n });
    };

    const refreshUuid = async () => {
        const u = await getUUID();
        setUuid(u);
    };

    // Bootstrap (once)
    useEffect(() => {
        let cancelled = false;

        (async () => {
            configure_sst();

            await Sst.dataLayer.clear();

            // Data layer demo
            const current = await Sst.dataLayer.get("launchCount");
            const next = Number.isInteger(current) ? current + 1 : 1;
            await Sst.dataLayer.add("launchCount", next);

            // Optional: add some real data layer keys so it isn't just launchCount
            await Sst.dataLayer.add("route", "/home");
            await Sst.dataLayer.add("app", { name: "sst-demo", platform: Platform.OS });

            await snapshotLocalDebug();

            // First send: this is where settings/virtualBrowser/__mobileData get generated
            await sendAndCapture(
                new Event("page_view", {
                    data: { route: "/home" },
                    parameters: { cw_test: "abc" },
                })
            );

            if (!cancelled) {
                await refreshUuid();
            }

            // Read status (do NOT prompt here)
            const status = await getTrackingAuthorizationStatus();
            if (cancelled) return;
            setAttStatus(status);

            const granted = status === "authorized";
            setAttTrackingGranted(granted);

            if (granted) {
                const idfa = await getAdvertisingId();
                if (!cancelled) setAdvertisingId(idfa);
            } else {
                setAdvertisingId(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const requestTrackingPermission = async () => {
        try {
            const status = await getAdvertisingAuthorization();
            setAttStatus(status);

            const granted = status === "authorized";
            setAttTrackingGranted(granted);

            if (granted) {
                const idfa = await getAdvertisingId();
                setAdvertisingId(idfa);
            } else {
                setAdvertisingId(null);
            }
        } catch (e) {
            console.error("Failed to request tracking permission", e);
        }
    };

    return (
        <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
            <View style={styles.row}>
                <Text style={styles.label}>CHEQ UUID:</Text>
                <Text style={styles.value}>{uuid ?? "—"}</Text>
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>ATT Status:</Text>
                <Text style={styles.value}>{att_status ?? "—"}</Text>
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>Advertising ID:</Text>
                <Text style={styles.value}>{att_status === 'notDetermined' ? 'Waiting for permission' : (att_tracking_granted ? advertising_id ?? "N/A" : "Not authorized")}
                </Text>
            </View>

            <View style={styles.actions}>
                <ButtonLink
                    onPress={att_status === "notDetermined" ? requestTrackingPermission : undefined}
                    disabled={att_status !== "notDetermined"}
                    text={
                        att_status === null
                            ? "Advertising Model Disabled"
                            : att_status === "notDetermined"
                                ? "Request Tracking Permission"
                                : att_status === "denied"
                                    ? "Tracking Permission Denied"
                                    : att_status === "authorized"
                                        ? "Tracking Permission Granted"
                                        : "Unknown Tracking Permission Status"
                    }
                />
                <ButtonLink
                    onPress={async () => {
                        clearUUID();
                        setUuid(null);
                    }}
                    text="Clear CHEQ UUID"
                />
                <ButtonLink onPress={async () => { await snapshotLocalDebug(); await refreshUuid(); }} text="Refresh Local Debug" />
                <ButtonLink onPress={send_custom_example_no_uuid} text="Send Custom Example" />
                <ButtonLink onPress={trigger_network_error} text="Trigger Network Error" />
                <ButtonLink onPress={trigger_track_event_error} text="Trigger TrackEvent Error" />
                <ButtonLink onPress={trigger_data_layer_add_error} text="Trigger DataLayer.add Error" />
            </View>

            <View style={styles.block}>
                <Text style={styles.label}>Last Send:</Text>
                <Text style={styles.code}>{sending ? "Sending…" : JSON.stringify(lastSend, null, 2)}</Text>
            </View>

            <View style={styles.block}>
                <Text style={styles.label}>Data Layer:</Text>
                <Text style={styles.code}>{JSON.stringify(dataLayer, null, 2)}</Text>
            </View>

            <View style={styles.block}>
                <Text style={styles.label}>Storage:</Text>
                <Text style={styles.code}>{JSON.stringify(storage, null, 2)}</Text>
            </View>

            <View style={styles.block}>
                <Text style={styles.label}>Settings:</Text>
                <Text style={styles.code}>{JSON.stringify(settings, null, 2)}</Text>
            </View>

            <View style={styles.block}>
                <Text style={styles.label}>Virtual Browser:</Text>
                <Text style={styles.code}>{JSON.stringify(virtualBrowser, null, 2)}</Text>
            </View>
        </ScrollView>
    );
}

function ButtonLink({ text, onPress, disabled }) {
    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            style={({ pressed }) => [
                styles.linkButton,
                disabled && styles.linkButtonDisabled,
                pressed && !disabled && styles.linkButtonPressed,
            ]}
        >
            <Text style={[styles.linkButtonText, disabled && styles.linkButtonTextDisabled]}>
                {text}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    page: {
        flex: 1,
        backgroundColor: "#fff",
    },
    pageContent: {
        alignItems: "center",
        paddingTop: 56,
        paddingHorizontal: 16,
        paddingBottom: 80,
    },
    row: {
        width: "100%",
        maxWidth: 520,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 14,
    },
    block: {
        width: "100%",
        maxWidth: 520,
        marginBottom: 14,
    },
    label: {
        fontSize: 16,
        fontWeight: "600",
    },
    value: {
        fontSize: 16,
    },
    code: {
        fontFamily: Platform.select({
            ios: "Menlo",
            android: "monospace",
            default: "monospace",
        }),
        fontSize: 12,
    },
    actions: {
        marginTop: 24,
        width: "100%",
        alignItems: "center",
        gap: 22,
    },
    linkButton: {
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    linkButtonText: {
        fontSize: 22,
        fontWeight: "600",
        color: "#1a73e8",
    },
    linkButtonDisabled: {
        opacity: 0.6,
    },
    linkButtonTextDisabled: {
        color: "#777",
    },
    linkButtonPressed: {
        opacity: 0.7,
    },
});
