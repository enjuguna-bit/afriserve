package com.afriserve.loanofficer.core.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import java.time.Instant
import kotlinx.coroutines.tasks.await

data class FieldLocationResult(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Double?,
    val capturedAtIso: String,
)

class FieldLocationClient(
    private val appContext: Context,
) {
    suspend fun captureCurrentLocation(): Result<FieldLocationResult> = runCatching {
        val permissionState = ContextCompat.checkSelfPermission(
            appContext,
            Manifest.permission.ACCESS_FINE_LOCATION,
        )
        if (permissionState != PackageManager.PERMISSION_GRANTED) {
            error("Location permission is required before pinning the field visit.")
        }

        val locationManager = appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val gpsEnabled = runCatching { locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) }.getOrDefault(false)
        val networkEnabled = runCatching { locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) }.getOrDefault(false)
        if (!gpsEnabled && !networkEnabled) {
            error("Turn on device location services to pin the customer's field location.")
        }

        val locationClient = LocationServices.getFusedLocationProviderClient(appContext)
        val cancellationTokenSource = CancellationTokenSource()
        val location = locationClient
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellationTokenSource.token)
            .await()
            ?: locationClient.lastLocation.await()
            ?: error("Unable to determine the current field location. Move outdoors and try again.")

        FieldLocationResult(
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyMeters = location.accuracy.toDouble().takeIf { it > 0.0 },
            capturedAtIso = Instant.ofEpochMilli(
                location.time.takeIf { it > 0L } ?: System.currentTimeMillis(),
            ).toString(),
        )
    }
}
