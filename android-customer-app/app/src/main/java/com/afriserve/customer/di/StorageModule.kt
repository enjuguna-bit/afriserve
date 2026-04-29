package com.afriserve.customer.di

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.afriserve.customer.data.local.TokenStore
import com.google.gson.Gson
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object StorageModule {
  @Provides
  @Singleton
  fun provideSharedPreferences(
    @ApplicationContext context: Context,
  ): SharedPreferences {
    val masterKey = MasterKey.Builder(context)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .build()

    return EncryptedSharedPreferences.create(
      context,
      "afriserve_customer_secure_prefs",
      masterKey,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  @Provides
  @Singleton
  fun provideTokenStore(
    sharedPreferences: SharedPreferences,
    gson: Gson,
  ): TokenStore = TokenStore(sharedPreferences, gson)
}
