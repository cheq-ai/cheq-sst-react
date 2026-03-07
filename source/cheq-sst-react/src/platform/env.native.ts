import { Platform } from "react-native";

export function getPlatform(): string {
    return Platform.OS === "web" ? "react" : "react-native";
}