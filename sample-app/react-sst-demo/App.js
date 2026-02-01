import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { CheqAdvertisingModel, Config, Event, Models, Sst, getAdvertisingAuthorization, getAdvertisingId, getTrackingAuthorizationStatus, getUUID, clearUUID } from "cheq-sst-react";

const account_name = "demoretail";

const configure_sst = () => {
    Sst.configure(new Config(account_name, {
        models: Models.default().add(new CheqAdvertisingModel()),
        debug: true
    }));
};

const send_custom_example_no_uuid = async () => {
    await Sst.trackEvent(new Event("custom_example", {
        data: {
            string: "foobar",
            int: 123,
            float: 456.789,
            boolean: true
        },
        parameters: {
            ensDisableTracking: "user"
        }
    }));
};

const trigger_network_error = async () => {
    Sst.configure(new Config(account_name, {
        domain: "test.invalid",
        debug: true
    }));

    await Sst.trackEvent(new Event("network_error"));

    configure_sst();
};

const trigger_track_event_error = async () => {
    await Sst.trackEvent(new Event("custom_example", {
        data: { bad: 123n },
        parameters: { ensDisableTracking: "user" }
    }));
};

const trigger_data_layer_add_error = async () => {
    Sst.dataLayer.add("bad", { n: 1n });
};

export default function App() {
    const [uuid, setUuid] = useState(null);
    const [att_tracking_granted, setAttTrackingGranted] = useState(false);
    const [advertising_id, setAdvertisingId] = useState(null);

    // Bootstrap (once)
    useEffect(() => {
        let cancelled = false;

        (async () => {
            let launch_count = await Sst.dataLayer.get("launchCount");
            launch_count = Number.isInteger(launch_count) ? launch_count + 1 : 1;
            await Sst.dataLayer.add("launchCount", launch_count);

            configure_sst();

            await Sst.trackEvent(new Event("page_view", {
                data: { route: "/home" },
                parameters: { cw_test: "abc" }
            }));

            const u = await getUUID();
            if (!cancelled) setUuid(u);

            // Read status (do NOT prompt here)
            const status = await getTrackingAuthorizationStatus();
            const granted = status === "authorized";

            if (cancelled) return;

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
            const status = await getAdvertisingAuthorization(); // <-- this is the prompt + returns status
            const granted = status === "authorized";

            setAttTrackingGranted(granted);

            if (granted) {
                const idfa = await getAdvertisingId();
                setAdvertisingId(idfa);
            }
            else {
                setAdvertisingId(null);
            }
        } catch (e) {
            console.error("Failed to request tracking permission", e);
        }
    };

    return (
        <View style={styles.page}>
            <View style={styles.row}>
                <Text style={styles.label}>CHEQ UUID:</Text>
                <Text style={styles.value}>{uuid ?? "—"}</Text>
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>Advertising ID:</Text>
                <Text style={styles.value}>
                    {att_tracking_granted ? (advertising_id ?? "N/A") : "Not authorized"}
                </Text>
            </View>

            <View style={styles.actions}>
                <ButtonLink
                    onPress={att_tracking_granted ? undefined : requestTrackingPermission}
                    disabled={att_tracking_granted}
                    text={att_tracking_granted ? "Tracking Permission Granted" : "Request Tracking Permission"}
                />

                <ButtonLink onPress={clearUUID} text="Clear CHEQ UUID" />
                <ButtonLink onPress={send_custom_example_no_uuid} text="Send Custom Example (No UUID)" />
                <ButtonLink onPress={trigger_network_error} text="Trigger Network Error" />
                <ButtonLink onPress={trigger_track_event_error} text="Trigger TrackEvent Error" />
                <ButtonLink onPress={trigger_data_layer_add_error} text="Trigger DataLayer.add Error" />
            </View>
        </View>
    );
}

function ButtonLink({ text, onPress, disabled }) {
    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            style={({ pressed }) => [
                styles.linkButton,
                disabled && styles.linkButtonDisabled,
                pressed && !disabled && styles.linkButtonPressed
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
        alignItems: "center",
        paddingTop: 56,
        paddingHorizontal: 16,
        backgroundColor: "#fff"
    },
    row: {
        width: "100%",
        maxWidth: 520,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 14
    },
    label: {
        fontSize: 16,
        fontWeight: "600"
    },
    value: {
        fontSize: 16
    },
    actions: {
        marginTop: 24,
        width: "100%",
        alignItems: "center",
        gap: 22
    },
    linkButton: {
        paddingVertical: 8,
        paddingHorizontal: 8
    },
    linkButtonText: {
        fontSize: 22,
        fontWeight: "600",
        color: "#1a73e8"
    },
    linkButtonDisabled: {
        opacity: 0.6
    },
    linkButtonTextDisabled: {
        color: "#777"
    },
    linkButtonPressed: {
        opacity: 0.7
    }
});