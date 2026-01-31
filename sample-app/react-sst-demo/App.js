import React, {useEffect, useState} from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { CheqAdvertisingModel, Config, Event, Models, Sst } from "cheq-sst-react";

export default function App() {
	useEffect(() => {
        let cancelled = false;

        (async () => {
            Sst.configure(new Config("demoretail", {
                models: Models.default().add(new CheqAdvertisingModel()),
                debug: true
            }));

            if (cancelled) return;

            await Sst.trackEvent(new Event("page_view", {
                data: { route: "/home" },
                parameters: { cw_test: "abc" }
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
