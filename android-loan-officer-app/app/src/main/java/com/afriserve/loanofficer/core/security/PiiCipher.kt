package com.afriserve.loanofficer.core.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class PiiCipher(
    @Suppress("unused")
    private val context: Context,
    private val alias: String = "afriserve-officer-pii",
) {

    fun encrypt(plainText: String): String {
        if (plainText.isBlank()) return plainText

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv
        val encryptedBytes = cipher.doFinal(plainText.toByteArray(StandardCharsets.UTF_8))
        val combined = iv + encryptedBytes
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    fun decrypt(cipherText: String): String {
        if (cipherText.isBlank()) return cipherText

        val combined = Base64.decode(cipherText, Base64.NO_WRAP)
        val iv = combined.copyOfRange(0, IV_SIZE_BYTES)
        val cipherBytes = combined.copyOfRange(IV_SIZE_BYTES, combined.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_LENGTH_BITS, iv))
        return cipher.doFinal(cipherBytes).toString(StandardCharsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existingKey = keyStore.getKey(alias, null) as? SecretKey
        if (existingKey != null) return existingKey

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return keyGenerator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TAG_LENGTH_BITS = 128
        const val IV_SIZE_BYTES = 12
    }
}
