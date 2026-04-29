package com.afriserve.customer.di

import android.util.Log
import com.afriserve.customer.BuildConfig
import com.afriserve.customer.data.remote.api.AuthApi
import com.afriserve.customer.data.remote.api.ClientApi
import com.afriserve.customer.data.remote.api.LoanApi
import com.afriserve.customer.data.remote.interceptors.AuthInterceptor
import com.afriserve.customer.data.remote.interceptors.TokenRefreshAuthenticator
import com.google.gson.FieldNamingPolicy
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
  @Provides
  @Singleton
  fun provideGson(): Gson = GsonBuilder()
    .setFieldNamingPolicy(FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES)
    .create()

  @Provides
  @Singleton
  fun provideOkHttpClient(
    authInterceptor: AuthInterceptor,
    authenticator: TokenRefreshAuthenticator,
  ): OkHttpClient {
    val builder = OkHttpClient.Builder()
      .addInterceptor(authInterceptor)
      .authenticator(authenticator)
      .addInterceptor(
        HttpLoggingInterceptor { message -> Log.d("AfriServe-HTTP", message) }.apply {
          level = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BODY
          } else {
            HttpLoggingInterceptor.Level.NONE
          }
        },
      )
      .connectTimeout(30, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)

    val pins = BuildConfig.API_PINS
      .split(",")
      .map { it.trim() }
      .filter { it.isNotBlank() }
    if (BuildConfig.API_HOST.isNotBlank() && pins.isNotEmpty()) {
      val pinner = CertificatePinner.Builder().apply {
        pins.forEach { pin -> add(BuildConfig.API_HOST, pin) }
      }.build()
      builder.certificatePinner(pinner)
    }

    return builder.build()
  }

  @Provides
  @Singleton
  fun provideRetrofit(okHttpClient: OkHttpClient, gson: Gson): Retrofit =
    Retrofit.Builder()
      .baseUrl(BuildConfig.API_BASE_URL)
      .client(okHttpClient)
      .addConverterFactory(GsonConverterFactory.create(gson))
      .build()

  @Provides
  @Singleton
  fun provideAuthApi(retrofit: Retrofit): AuthApi = retrofit.create(AuthApi::class.java)

  @Provides
  @Singleton
  fun provideClientApi(retrofit: Retrofit): ClientApi = retrofit.create(ClientApi::class.java)

  @Provides
  @Singleton
  fun provideLoanApi(retrofit: Retrofit): LoanApi = retrofit.create(LoanApi::class.java)
}
