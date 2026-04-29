package com.afriserve.customer.util

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.os.Environment
import com.afriserve.customer.domain.model.ClientProfile
import com.afriserve.customer.domain.model.Loan
import com.afriserve.customer.domain.model.StatementEntry
import com.afriserve.customer.domain.model.StatementEntryType
import java.io.File
import java.io.FileOutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

object PdfGenerator {
  private const val pageWidth = 595
  private const val pageHeight = 842
  private const val margin = 40f
  private const val lineHeight = 18f

  private val generatedAtFormatter = DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm")

  private data class PageState(
    val document: PdfDocument,
    var page: PdfDocument.Page,
    var canvas: Canvas,
    var y: Float,
    var nextPageNumber: Int,
  )

  fun generateLoanStatement(
    context: Context,
    profile: ClientProfile,
    loan: Loan,
    entries: List<StatementEntry>,
  ): File {
    val document = PdfDocument()
    val state = newPageState(document)

    with(state) {
      drawText(margin, "LOAN ACCOUNT STATEMENT", titlePaint())
      y += 24f
      drawText(margin, "AfriServe | ${LocalDateTime.now().format(generatedAtFormatter)}", smallPaint())
      y += lineHeight
      drawRule()

      drawText(margin, "CUSTOMER", sectionPaint())
      y += lineHeight
      drawText(margin, "Name: ${profile.fullName}", bodyPaint())
      drawText(300f, "Phone: ${profile.phone ?: "--"}", bodyPaint())
      y += lineHeight
      drawText(margin, "ID: ${profile.nationalId ?: "--"}", bodyPaint())
      drawText(300f, "KYC: ${profile.kycStatus.name}", bodyPaint())
      y += lineHeight + 6f
      drawRule()

      drawText(margin, "LOAN DETAILS", sectionPaint())
      y += lineHeight
      drawText(margin, "Ref: #LN-${loan.id.toString().padStart(4, '0')}", bodyPaint())
      drawText(300f, "Status: ${loan.status.name}", bodyPaint())
      y += lineHeight
      drawText(margin, "Principal: KES ${formatAmount(loan.principal)}", bodyPaint())
      drawText(300f, "Rate: ${formatAmount(loan.interestRate)}% p/w", bodyPaint())
      y += lineHeight
      drawText(margin, "Expected: KES ${formatAmount(loan.expectedTotal)}", bodyPaint())
      drawText(300f, "Term: ${loan.termWeeks ?: (loan.termMonths * 4)} weeks", bodyPaint())
      y += lineHeight
      drawText(margin, "Repaid: KES ${formatAmount(loan.repaidTotal)}", bodyPaint())
      drawText(300f, "Balance: KES ${formatAmount(loan.balance)}", bodyPaint())
      y += lineHeight
      loan.disbursedAt?.let {
        drawText(margin, "Disbursed: ${it.take(10)}", bodyPaint())
        y += lineHeight
      }
      y += 6f
      drawRule()

      drawText(margin, "TRANSACTION HISTORY", sectionPaint())
      y += lineHeight
      drawTableHeader()
      drawRule()

      entries.forEach { entry ->
        ensureSpace(lineHeight * 2) {
          drawText(margin, "TRANSACTION HISTORY (CONT.)", sectionPaint())
          y += lineHeight
          drawTableHeader()
          drawRule()
        }
        drawStatementEntry(entry)
      }

      drawRule()
      drawText(margin, "TOTALS", sectionPaint())
      drawText(330f, formatAmount(entries.sumOf { it.debit }), debitPaint())
      drawText(400f, formatAmount(entries.sumOf { it.credit }), creditPaint())
      y += lineHeight + 8f
      drawText(margin, "System-generated statement. For queries contact your loan officer.", smallPaint())
      y += lineHeight
      drawText(margin, "AfriServe | Customer #${profile.id} | Loan #LN-${loan.id.toString().padStart(4, '0')}", smallPaint())

      finishCurrentPage()
    }

    return writeToFile(context, document, "AfriServe_Loan${loan.id}_${System.currentTimeMillis()}.pdf")
  }

  fun generateCrossLoanStatement(
    context: Context,
    profile: ClientProfile,
    entries: List<StatementEntry>,
  ): File {
    val document = PdfDocument()
    val state = newPageState(document)
    val groupedEntries = entries
      .groupBy { it.loanId ?: 0L }
      .entries
      .sortedBy { group -> group.value.minOfOrNull { it.date } ?: "" }

    with(state) {
      drawText(margin, "ACCOUNT STATEMENT - ALL LOAN CYCLES", titlePaint())
      y += 24f
      drawText(margin, "Customer: ${profile.fullName} | ID: ${profile.id}", smallPaint())
      drawText(360f, "Generated: ${LocalDateTime.now().format(generatedAtFormatter)}", smallPaint())
      y += lineHeight
      drawText(margin, "Phone: ${profile.phone ?: "--"} | ID No: ${profile.nationalId ?: "--"}", smallPaint())
      y += lineHeight + 6f
      drawRule()

      groupedEntries.forEach { (loanId, cycleEntries) ->
        ensureSpace(lineHeight * 5) {
          drawText(margin, "ACCOUNT STATEMENT (CONT.)", titlePaint())
          y += 24f
        }
        drawCycleHeader(loanId, cycleEntries)
        drawTableHeader()
        drawRule()

        cycleEntries.forEach { entry ->
          ensureSpace(lineHeight * 2) {
            drawCycleHeader(loanId, cycleEntries, continuation = true)
            drawTableHeader()
            drawRule()
          }
          drawStatementEntry(entry)
        }

        drawText(margin, "Cycle sub-total:", smallPaint())
        drawText(330f, formatAmount(cycleEntries.sumOf { it.debit }), debitPaint())
        drawText(400f, formatAmount(cycleEntries.sumOf { it.credit }), creditPaint())
        y += lineHeight
        drawRule()
      }

      drawText(margin, "ALL CYCLES TOTAL", sectionPaint())
      drawText(330f, formatAmount(entries.sumOf { it.debit }), debitPaint())
      drawText(400f, formatAmount(entries.sumOf { it.credit }), creditPaint())
      y += lineHeight + 8f
      drawText(margin, "System-generated statement. For queries contact your loan officer.", smallPaint())
      y += lineHeight
      drawText(margin, "AfriServe | Customer #${profile.id}", smallPaint())

      finishCurrentPage()
    }

    return writeToFile(context, document, "AfriServe_Statement_${profile.id}_${System.currentTimeMillis()}.pdf")
  }

  private fun newPageState(document: PdfDocument): PageState {
    val page = createPage(document, 1)
    return PageState(
      document = document,
      page = page,
      canvas = page.canvas,
      y = margin,
      nextPageNumber = 2,
    )
  }

  private fun createPage(document: PdfDocument, pageNumber: Int): PdfDocument.Page =
    document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())

  private fun PageState.finishCurrentPage() {
    document.finishPage(page)
  }

  private fun PageState.newPage() {
    finishCurrentPage()
    page = createPage(document, nextPageNumber)
    canvas = page.canvas
    y = margin
    nextPageNumber += 1
  }

  private fun PageState.ensureSpace(requiredHeight: Float, afterBreak: PageState.() -> Unit = {}) {
    if (y + requiredHeight > pageHeight - margin) {
      newPage()
      afterBreak()
    }
  }

  private fun PageState.drawRule() {
    canvas.drawLine(margin, y, (pageWidth - margin).toFloat(), y, rulePaint())
    y += 6f
  }

  private fun PageState.drawText(x: Float, text: String, paint: Paint) {
    canvas.drawText(text, x, y, paint)
  }

  private fun PageState.drawTableHeader() {
    val paint = smallPaint()
    canvas.drawText("Date", margin, y, paint)
    canvas.drawText("Description", 110f, y, paint)
    canvas.drawText("Debit", 330f, y, paint)
    canvas.drawText("Credit", 400f, y, paint)
    canvas.drawText("Balance", 470f, y, paint)
    y += 4f
  }

  private fun PageState.drawStatementEntry(entry: StatementEntry) {
    drawText(margin, entry.date.take(10), bodyPaint())
    drawText(110f, truncate(entry.description, 34), bodyPaint())
    if (entry.debit > 0.0) {
      drawText(330f, formatAmount(entry.debit), debitPaint())
    }
    if (entry.credit > 0.0) {
      drawText(400f, formatAmount(entry.credit), creditPaint())
    }
    drawText(470f, formatAmount(entry.runningBalance), bodyPaint())
    y += lineHeight
  }

  private fun PageState.drawCycleHeader(
    loanId: Long,
    cycleEntries: List<StatementEntry>,
    continuation: Boolean = false,
  ) {
    val disbursementEntry = cycleEntries.firstOrNull { it.type == StatementEntryType.DISBURSEMENT }
    val cycleId = if (loanId > 0L) loanId.toString().padStart(4, '0') else "UNKNOWN"
    val title = buildString {
      append("LOAN CYCLE | #LN-")
      append(cycleId)
      if (continuation) {
        append(" (CONT.)")
      } else if (disbursementEntry != null) {
        append(" | Disbursed: ${disbursementEntry.date.take(10)} | KES ${formatAmount(disbursementEntry.debit)}")
      }
    }
    drawText(margin, title, cyclePaint())
    y += lineHeight
  }

  private fun writeToFile(context: Context, document: PdfDocument, name: String): File {
    val directory = context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) ?: context.filesDir
    val file = File(directory, name)
    FileOutputStream(file).use { output ->
      document.writeTo(output)
    }
    document.close()
    return file
  }

  private fun titlePaint() = Paint().apply {
    color = Color.rgb(27, 93, 32)
    textSize = 18f
    isFakeBoldText = true
  }

  private fun sectionPaint() = Paint().apply {
    color = Color.BLACK
    textSize = 13f
    isFakeBoldText = true
  }

  private fun cyclePaint() = Paint().apply {
    color = Color.rgb(27, 93, 32)
    textSize = 11f
    isFakeBoldText = true
  }

  private fun bodyPaint() = Paint().apply {
    color = Color.DKGRAY
    textSize = 10f
  }

  private fun smallPaint() = Paint().apply {
    color = Color.GRAY
    textSize = 9f
  }

  private fun debitPaint() = Paint().apply {
    color = Color.rgb(183, 28, 28)
    textSize = 10f
  }

  private fun creditPaint() = Paint().apply {
    color = Color.rgb(27, 93, 32)
    textSize = 10f
  }

  private fun rulePaint() = Paint().apply {
    color = Color.LTGRAY
    strokeWidth = 0.8f
  }

  private fun truncate(value: String, maxLength: Int): String =
    if (value.length <= maxLength) value else value.take(maxLength - 1) + "."

  private fun formatAmount(value: Double): String = String.format(Locale.US, "%,.2f", value)
}
