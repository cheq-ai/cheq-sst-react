package com.anonymous.Test

import com.facebook.react.bridge.*
import com.google.android.gms.ads.identifier.AdvertisingIdClient

class AdvertisingIdModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "AdvertisingId"

    @ReactMethod
    fun getAdvertisingId(promise: Promise) {
        Thread {
            try {
                val info = AdvertisingIdClient.getAdvertisingIdInfo(reactApplicationContext)
                val map = Arguments.createMap().apply {
                    putString("advertisingId", info.id)
                    putBoolean("isLimitAdTrackingEnabled", info.isLimitAdTrackingEnabled)
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.resolve(Arguments.createMap().apply {
                    putString("advertisingId", null)
                    putBoolean("isLimitAdTrackingEnabled", true)
                    putString("error", e.javaClass.simpleName)
                })
            }
        }.start()
    }
}