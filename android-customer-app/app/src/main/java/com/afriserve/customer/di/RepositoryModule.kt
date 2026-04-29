package com.afriserve.customer.di

import com.afriserve.customer.data.repository.AuthRepository
import com.afriserve.customer.data.repository.AuthRepositoryImpl
import com.afriserve.customer.data.repository.ClientRepository
import com.afriserve.customer.data.repository.ClientRepositoryImpl
import com.afriserve.customer.data.repository.LoanRepository
import com.afriserve.customer.data.repository.LoanRepositoryImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
  @Binds
  @Singleton
  abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

  @Binds
  @Singleton
  abstract fun bindClientRepository(impl: ClientRepositoryImpl): ClientRepository

  @Binds
  @Singleton
  abstract fun bindLoanRepository(impl: LoanRepositoryImpl): LoanRepository
}
