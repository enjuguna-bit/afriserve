package com.afriserve.customer.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.afriserve.customer.domain.model.FeePaymentStatus
import com.afriserve.customer.domain.model.InstallmentStatus
import com.afriserve.customer.domain.model.KycStatus
import com.afriserve.customer.domain.model.LoanStatus
import com.afriserve.customer.domain.model.OnboardingStatus
import com.afriserve.customer.ui.theme.ErrorRed
import com.afriserve.customer.ui.theme.ErrorRedLight
import com.afriserve.customer.ui.theme.Gold100
import com.afriserve.customer.ui.theme.Gold400
import com.afriserve.customer.ui.theme.Gold600
import com.afriserve.customer.ui.theme.Gray100
import com.afriserve.customer.ui.theme.Gray400
import com.afriserve.customer.ui.theme.Gray500
import com.afriserve.customer.ui.theme.Green50
import com.afriserve.customer.ui.theme.Green200
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.InfoBlue
import com.afriserve.customer.ui.theme.InfoBlueLight

@Composable
fun StatusChip(
  text: String,
  containerColor: androidx.compose.ui.graphics.Color,
  contentColor: androidx.compose.ui.graphics.Color,
  modifier: Modifier = Modifier,
  borderColor: androidx.compose.ui.graphics.Color? = null,
  textDecoration: TextDecoration? = null,
) {
  Surface(
    modifier = modifier,
    color = containerColor,
    shape = androidx.compose.foundation.shape.RoundedCornerShape(999.dp),
    border = borderColor?.let { BorderStroke(1.dp, it) },
  ) {
    Text(
      text = text,
      modifier = Modifier.padding(PaddingValues(horizontal = 10.dp, vertical = 6.dp)),
      style = MaterialTheme.typography.labelLarge,
      color = contentColor,
      textDecoration = textDecoration,
    )
  }
}

@Composable
fun LoanStatusChip(status: LoanStatus, modifier: Modifier = Modifier) {
  val spec = when (status) {
    LoanStatus.ACTIVE -> ChipSpec("ACTIVE", Green50, Green700, Green200)
    LoanStatus.OVERDUE -> ChipSpec("OVERDUE", ErrorRedLight, ErrorRed, ErrorRed)
    LoanStatus.PENDING_APPROVAL -> ChipSpec("PENDING", Gold100, Gold600, Gold400)
    LoanStatus.CLOSED -> ChipSpec("CLOSED", Gray100, Gray500, null)
    LoanStatus.APPROVED -> ChipSpec("APPROVED", InfoBlueLight, InfoBlue, null)
    LoanStatus.WRITTEN_OFF -> ChipSpec("WRITTEN OFF", Gray100, Gray400, null, TextDecoration.LineThrough)
    LoanStatus.REJECTED -> ChipSpec("REJECTED", ErrorRedLight, ErrorRed, null)
    LoanStatus.RESTRUCTURED -> ChipSpec("RESTRUCTURED", InfoBlueLight, InfoBlue, null)
    LoanStatus.UNKNOWN -> ChipSpec("UNKNOWN", Gray100, Gray500, null)
  }
  StatusChip(
    text = spec.text,
    containerColor = spec.containerColor,
    contentColor = spec.contentColor,
    borderColor = spec.borderColor,
    textDecoration = spec.textDecoration,
    modifier = modifier,
  )
}

@Composable
fun KycStatusChip(status: KycStatus, modifier: Modifier = Modifier) {
  val spec = when (status) {
    KycStatus.VERIFIED -> ChipSpec("KYC VERIFIED", Green50, Green700, Green200)
    KycStatus.PENDING -> ChipSpec("KYC PENDING", Gold100, Gold600, Gold400)
    KycStatus.REJECTED -> ChipSpec("KYC REJECTED", ErrorRedLight, ErrorRed, null)
    KycStatus.UNKNOWN -> ChipSpec("KYC UNKNOWN", Gray100, Gray500, null)
  }
  StatusChip(spec.text, spec.containerColor, spec.contentColor, modifier, spec.borderColor)
}

@Composable
fun InstallmentStatusChip(status: InstallmentStatus, modifier: Modifier = Modifier) {
  val spec = when (status) {
    InstallmentStatus.PAID -> ChipSpec("PAID", Green50, Green700, Green200)
    InstallmentStatus.PENDING -> ChipSpec("PENDING", Gold100, Gold600, Gold400)
    InstallmentStatus.PARTIAL -> ChipSpec("PARTIAL", InfoBlueLight, InfoBlue, null)
    InstallmentStatus.OVERDUE -> ChipSpec("OVERDUE", ErrorRedLight, ErrorRed, null)
    InstallmentStatus.UNKNOWN -> ChipSpec("UNKNOWN", Gray100, Gray500, null)
  }
  StatusChip(spec.text, spec.containerColor, spec.contentColor, modifier, spec.borderColor)
}

@Composable
fun OnboardingStatusChip(status: OnboardingStatus, modifier: Modifier = Modifier) {
  val label = when (status) {
    OnboardingStatus.REGISTERED -> "REGISTERED"
    OnboardingStatus.KYC_SUBMITTED -> "KYC SUBMITTED"
    OnboardingStatus.FEES_PAID -> "FEES PAID"
    OnboardingStatus.ACTIVE -> "ACTIVE"
    OnboardingStatus.UNKNOWN -> "UNKNOWN"
  }
  val color = if (status == OnboardingStatus.ACTIVE) Green50 else Gold100
  val content = if (status == OnboardingStatus.ACTIVE) Green700 else Gold600
  val border = if (status == OnboardingStatus.ACTIVE) Green200 else Gold400
  StatusChip(label, color, content, modifier, border)
}

@Composable
fun FeePaymentStatusChip(status: FeePaymentStatus, modifier: Modifier = Modifier) {
  val label = when (status) {
    FeePaymentStatus.PAID -> "FEES PAID"
    FeePaymentStatus.UNPAID -> "FEES DUE"
    FeePaymentStatus.UNKNOWN -> "FEES UNKNOWN"
  }
  val color = if (status == FeePaymentStatus.PAID) Green50 else Gold100
  val content = if (status == FeePaymentStatus.PAID) Green700 else Gold600
  val border = if (status == FeePaymentStatus.PAID) Green200 else Gold400
  StatusChip(label, color, content, modifier, border)
}

private data class ChipSpec(
  val text: String,
  val containerColor: androidx.compose.ui.graphics.Color,
  val contentColor: androidx.compose.ui.graphics.Color,
  val borderColor: androidx.compose.ui.graphics.Color? = null,
  val textDecoration: TextDecoration? = null,
)
