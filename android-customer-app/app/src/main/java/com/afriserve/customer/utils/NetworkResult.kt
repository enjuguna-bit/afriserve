package com.afriserve.customer.utils

sealed class NetworkResult<out T> {
  data class Success<T>(val data: T) : NetworkResult<T>()
  data class Error(val message: String, val code: Int? = null) : NetworkResult<Nothing>()
  data object Loading : NetworkResult<Nothing>()

  inline fun onSuccess(block: (T) -> Unit): NetworkResult<T> {
    if (this is Success) block(data)
    return this
  }

  inline fun onError(block: (Error) -> Unit): NetworkResult<T> {
    if (this is Error) block(this)
    return this
  }

  fun getOrNull(): T? = if (this is Success) data else null
}
