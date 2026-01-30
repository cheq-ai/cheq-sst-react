import React, {useEffect, useState} from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Sst, Config, Event } from "cheq-sst-react";

export default function App() {
	useEffect(() => {
        console.log("useEffect");
        let cancelled = false;

        (async () => {
            Sst.configure(new Config("demoretail", { debug: true }));

            if (cancelled) return;

            await Sst.trackEvent(new Event("page_view", {
                data: { route: "/home" },
                parameters: { rid: "-1" }
            }));
        })();

        return () => {
            cancelled = true;
        };
    }, []);


	return (
		<View style={{flex: 1, padding: 24}}>
			<Text></Text>
			<Text>Hello World</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#fff',
		alignItems: 'center',
		justifyContent: 'center',
	},
});
