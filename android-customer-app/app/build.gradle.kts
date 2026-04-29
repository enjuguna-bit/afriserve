plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
  id("com.google.dagger.hilt.android")
  id("org.jetbrains.kotlin.kapt")
}

import java.io.File

val apiBaseUrl = providers.environmentVariable("AFRISERVE_API_BASE_URL")
  .orElse("https://aca-afriserve-dev-web-4jf5ap.greenbeach-37755cdd.southafricanorth.azurecontainerapps.io/")
  .get()

val normalizedApiUrl = if (apiBaseUrl.endsWith("/")) apiBaseUrl else "$apiBaseUrl/"
val apiHost = normalizedApiUrl
  .removePrefix("https://")
  .removePrefix("http://")
  .substringBefore("/")
  .substringBefore(":")
val apiPins = providers.environmentVariable("AFRISERVE_API_PINS").orElse("").get()
val otpMode = providers.environmentVariable("AFRISERVE_OTP_MODE").orElse("sms").get().lowercase()
val demoClientId = providers.environmentVariable("AFRISERVE_DEMO_CLIENT_ID").orElse("9").get()

val signingStoreFilePath = providers.gradleProperty("MYAPP_UPLOAD_STORE_FILE")
  .orElse(providers.environmentVariable("MYAPP_UPLOAD_STORE_FILE"))
  .orElse("C:/BulkSMS2/Erick-release-keystore.jks")
  .get()
val signingKeyAlias = providers.gradleProperty("MYAPP_UPLOAD_KEY_ALIAS")
  .orElse(providers.environmentVariable("MYAPP_UPLOAD_KEY_ALIAS"))
  .orElse("")
  .get()
val signingStorePassword = providers.gradleProperty("MYAPP_UPLOAD_STORE_PASSWORD")
  .orElse(providers.environmentVariable("MYAPP_UPLOAD_STORE_PASSWORD"))
  .orElse("")
  .get()
val signingKeyPassword = providers.gradleProperty("MYAPP_UPLOAD_KEY_PASSWORD")
  .orElse(providers.environmentVariable("MYAPP_UPLOAD_KEY_PASSWORD"))
  .orElse("")
  .get()

fun resolveSigningStore(path: String): File {
  val requestedFile = file(path)
  if (requestedFile.exists()) return requestedFile

  val fallbackFile = file("C:/BulkSMS2/Erick-release-keystore.jks")
  if (fallbackFile.exists()) return fallbackFile

  return requestedFile
}

android {
  namespace = "com.afriserve.customer"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.afriserve.customer"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "1.0.0"
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    vectorDrawables {
      useSupportLibrary = true
    }

    buildConfigField("String", "API_BASE_URL", "\"$normalizedApiUrl\"")
    buildConfigField("String", "API_HOST", "\"$apiHost\"")
    buildConfigField("String", "API_PINS", "\"$apiPins\"")
    buildConfigField("String", "OTP_MODE", "\"$otpMode\"")
    buildConfigField("long", "DEMO_CLIENT_ID", "${demoClientId}L")
  }

  signingConfigs {
    create("release") {
      storeFile = resolveSigningStore(signingStoreFilePath)
      storePassword = signingStorePassword
      keyAlias = signingKeyAlias
      keyPassword = signingKeyPassword
      enableV1Signing = true
      enableV2Signing = true
    }
  }

  buildTypes {
    release {
      signingConfig = signingConfigs.getByName("release")
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro",
      )
    }
    debug {
      applicationIdSuffix = ".debug"
      versionNameSuffix = "-debug"
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

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
  }
}

kapt {
  correctErrorTypes = true
}

dependencies {
  val composeBom = platform("androidx.compose:compose-bom:2024.12.01")

  implementation(composeBom)
  androidTestImplementation(composeBom)

  implementation("androidx.core:core-ktx:1.15.0")
  implementation("androidx.core:core-splashscreen:1.0.1")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
  implementation("androidx.lifecycle:lifecycle-process:2.8.7")
  implementation("androidx.activity:activity-compose:1.9.3")
  implementation("androidx.navigation:navigation-compose:2.8.4")
  implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
  implementation("androidx.hilt:hilt-work:1.2.0")
  implementation("androidx.work:work-runtime-ktx:2.10.0")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-text-google-fonts")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.compose.foundation:foundation")
  implementation("androidx.compose.material:material")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.material:material-icons-extended")
  implementation("androidx.compose.animation:animation")
  implementation("com.google.android.material:material:1.12.0")
  implementation("androidx.biometric:biometric:1.1.0")
  implementation("com.google.dagger:hilt-android:2.52")
  kapt("androidx.hilt:hilt-compiler:1.2.0")
  kapt("com.google.dagger:hilt-compiler:2.52")
  implementation("com.squareup.retrofit2:retrofit:2.11.0")
  implementation("com.squareup.retrofit2:converter-gson:2.11.0")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
  implementation("androidx.security:security-crypto:1.1.0-alpha06")
  implementation("io.coil-kt:coil-compose:2.6.0")
  implementation("org.mindrot:jbcrypt:0.4")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
  implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
  implementation("com.google.firebase:firebase-messaging-ktx")

  testImplementation("junit:junit:4.13.2")
  androidTestImplementation("androidx.test.ext:junit:1.2.1")
  androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
  androidTestImplementation("androidx.compose.ui:ui-test-junit4")
  debugImplementation("androidx.compose.ui:ui-tooling")
  debugImplementation("androidx.compose.ui:ui-test-manifest")
}
