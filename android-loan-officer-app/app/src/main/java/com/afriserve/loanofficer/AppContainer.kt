package com.afriserve.loanofficer

import android.content.Context
import androidx.room.Room
import com.afriserve.loanofficer.core.kyc.LivenessAnalyzer
import com.afriserve.loanofficer.core.kyc.OcrScanner
import com.afriserve.loanofficer.core.location.FieldLocationClient
import com.afriserve.loanofficer.core.security.PiiCipher
import com.afriserve.loanofficer.data.local.AppConfigStore
import com.afriserve.loanofficer.data.local.OfficerDatabase
import com.afriserve.loanofficer.data.local.SessionStore
import com.afriserve.loanofficer.data.network.ApiFactory
import com.afriserve.loanofficer.data.repository.AuthRepositoryImpl
import com.afriserve.loanofficer.data.repository.OnboardingRepositoryImpl
import com.afriserve.loanofficer.domain.repository.AuthRepository
import com.afriserve.loanofficer.domain.repository.OnboardingRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json

class AppContainer(
    context: Context,
) {
    val applicationContext: Context = context.applicationContext

    val json: Json by lazy {
        Json {
            ignoreUnknownKeys = true
            isLenient = true
        }
    }

    val cipher: PiiCipher by lazy {
        PiiCipher(applicationContext)
    }

    val sessionStore: SessionStore by lazy {
        SessionStore(
            context = applicationContext,
            cipher = cipher,
            json = json,
        )
    }

    val appConfigStore: AppConfigStore by lazy {
        AppConfigStore(
            appContext = applicationContext,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
        )
    }

    val db: OfficerDatabase by lazy {
        Room.databaseBuilder(
            applicationContext,
            OfficerDatabase::class.java,
            "officer.db",
        ).build()
    }

    val retrofitFactory: ApiFactory by lazy {
        ApiFactory(
            context = applicationContext,
            appConfigStore = appConfigStore,
            sessionStore = sessionStore,
            json = json,
        )
    }

    val authApi by lazy { retrofitFactory.authApi }
    val clientsApi by lazy { retrofitFactory.clientsApi }
    val uploadApi by lazy { retrofitFactory.uploadApi }

    val authRepository: AuthRepository by lazy {
        AuthRepositoryImpl(
            authApi = authApi,
            sessionStore = sessionStore,
        )
    }

    val onboardingRepository: OnboardingRepository by lazy {
        OnboardingRepositoryImpl(
            appContext = applicationContext,
            draftDao = db.onboardingDraftDao(),
            syncQueueDao = db.syncQueueDao(),
            clientsApi = clientsApi,
            uploadApi = uploadApi,
            cipher = cipher,
            json = json,
            sessionStore = sessionStore,
        )
    }

    val ocrScanner: OcrScanner by lazy {
        OcrScanner(appContext = applicationContext)
    }

    val livenessAnalyzer: LivenessAnalyzer by lazy {
        LivenessAnalyzer(appContext = applicationContext)
    }

    val fieldLocationClient: FieldLocationClient by lazy {
        FieldLocationClient(appContext = applicationContext)
    }
}
