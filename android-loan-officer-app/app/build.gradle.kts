import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

val defaultReleaseBaseUrl =
    "https://aca-afriserve-dev-web-4jf5ap.greenbeach-37755cdd.southafricanorth.azurecontainerapps.io/"
val defaultDebugBaseUrl = defaultReleaseBaseUrl

fun readBuildSecret(name: String): String? {
    val propertyValue = providers.gradleProperty(name).orNull?.trim().orEmpty()
    if (propertyValue.isNotEmpty()) {
        return propertyValue
    }

    val envValue = System.getenv(name).orEmpty().trim()
    return envValue.ifEmpty { null }
}

fun resolveSigningFile(rawPath: String): File {
    val candidate = File(rawPath)
    if (candidate.isAbsolute) {
        return candidate
    }

    val rootRelative = rootDir.resolve(rawPath).normalize()
    if (rootRelative.exists()) {
        return rootRelative
    }

    return projectDir.resolve(rawPath).normalize()
}

fun normalizeBaseUrl(raw: String, fallback: String = defaultDebugBaseUrl): String {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return fallback
    val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        trimmed
    } else {
        "http://$trimmed"
    }
    return if (withScheme.endsWith("/")) withScheme else "$withScheme/"
}

val releaseApiBaseUrl = normalizeBaseUrl(
    raw = System.getenv("AFRISERVE_RELEASE_API_BASE_URL").orEmpty().ifBlank { defaultReleaseBaseUrl },
    fallback = defaultReleaseBaseUrl,
)

val releaseStoreFile = readBuildSecret("MYAPP_UPLOAD_STORE_FILE")
val releaseKeyAlias = readBuildSecret("MYAPP_UPLOAD_KEY_ALIAS")
val releaseStorePassword = readBuildSecret("MYAPP_UPLOAD_STORE_PASSWORD")
val releaseKeyPassword = readBuildSecret("MYAPP_UPLOAD_KEY_PASSWORD")
val hasReleaseSigning =
    !releaseStoreFile.isNullOrBlank() &&
        !releaseKeyAlias.isNullOrBlank() &&
        !releaseStorePassword.isNullOrBlank() &&
        !releaseKeyPassword.isNullOrBlank()

fun resolveDebugBaseUrl(): String {
    val envOverride = System.getenv("AFRISERVE_API_BASE_URL").orEmpty().trim()
    if (envOverride.isNotEmpty()) {
        return normalizeBaseUrl(envOverride, fallback = defaultDebugBaseUrl)
    }

    return defaultDebugBaseUrl
}

android {
    namespace = "com.afriserve.loanofficer"
    compileSdk = 35

    signingConfigs {
        create("release") {
            if (hasReleaseSigning) {
                storeFile = resolveSigningFile(requireNotNull(releaseStoreFile))
                storePassword = requireNotNull(releaseStorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    defaultConfig {
        applicationId = "com.afriserve.loanofficer"
        minSdk = 28
        targetSdk = 35
        versionCode = 2
        versionName = "1.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
        buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")
        buildConfigField("String", "DEFAULT_TENANT_ID", "\"default\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("String", "API_BASE_URL", "\"${resolveDebugBaseUrl()}\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")

    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.4")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("androidx.camera:camera-camera2:1.4.1")
    implementation("androidx.camera:camera-lifecycle:1.4.1")
    implementation("androidx.camera:camera-view:1.4.1")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("com.google.mlkit:text-recognition:16.0.1")
    implementation("com.google.mlkit:face-detection:16.1.7")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("io.coil-kt:coil-svg:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    ksp("androidx.room:room-compiler:2.6.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
