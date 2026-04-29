package com.afriserve.loanofficer.core.kyc

import android.content.Context
import android.net.Uri
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.tasks.await

data class OcrScanResult(
    val fullText: String,
    val idCandidate: String?,
)

class OcrScanner(
    private val appContext: Context,
) {
    suspend fun scan(uriString: String): Result<OcrScanResult> = runCatching {
        val image = InputImage.fromFilePath(appContext, Uri.parse(uriString))
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val visionText = recognizer.process(image).await()
        recognizer.close()

        val fullText = visionText.text.orEmpty()
        val idCandidate = extractIdCandidate(visionText, fullText)

        OcrScanResult(
            fullText = fullText,
            idCandidate = idCandidate,
        )
    }

    private companion object {
        val labeledIdRegex = Regex(
            """(?:^|\b)(?:ID|I[D0]|IDENTITY)\s*(?:NUMBER|NUM8ER|NO|NO\.|N0)?\s*[:#-]?\s*(\d{6,10})""",
            RegexOption.IGNORE_CASE,
        )
        val genericIdRegex = Regex("""\b\d{6,10}\b""")
        val serialContextRegex = Regex("""\bSERIAL\b""", RegexOption.IGNORE_CASE)
        val idContextRegex = Regex("""\b(?:ID|I[D0]|IDENTITY)\s*(?:NUMBER|NUM8ER|NO|NO\.|N0)?\b""", RegexOption.IGNORE_CASE)
        val mrzIdRegex = Regex("""B0*(\d{6,10})Y""", RegexOption.IGNORE_CASE)
        val nonIdContextRegex = Regex(
            """<<|IDKYA|PRINCIPAL REGISTRAR|DISTRICT|DIVISION|LOCATION|SUB[-\s]?LOCATION|DATE OF BIRTH|DATE OF ISSUE""",
            RegexOption.IGNORE_CASE,
        )

        fun extractIdCandidate(
            visionText: Text,
            fullText: String,
        ): String? {
            val lines = visionText.textBlocks
                .flatMap { block -> block.lines }
                .map { line -> normalizeLine(line.text.orEmpty()) }
                .filter { it.isNotBlank() }

            findLabeledId(lines)?.let { return it }
            findMrzId(lines, fullText)?.let { return it }
            return scoreFallbackCandidates(lines, fullText)
        }

        private fun findLabeledId(lines: List<String>): String? {
            lines.forEachIndexed { index, rawLine ->
                val line = canonicalize(rawLine)
                labeledIdRegex.findAll(line).forEach { match ->
                    match.groupValues.getOrNull(1)
                        ?.filter(Char::isDigit)
                        ?.takeIf { it.length in 6..10 }
                        ?.let { return it }
                }

                if (idContextRegex.containsMatchIn(line)) {
                    lines.getOrNull(index + 1)
                        ?.let(::canonicalize)
                        ?.let(genericIdRegex::find)
                        ?.value
                        ?.let { return it }
                }
            }
            return null
        }

        private fun findMrzId(
            lines: List<String>,
            fullText: String,
        ): String? {
            val searchSpace = buildList {
                addAll(lines)
                add(normalizeLine(fullText))
            }

            for (line in searchSpace) {
                mrzIdRegex.find(canonicalize(line))
                    ?.groupValues
                    ?.getOrNull(1)
                    ?.filter(Char::isDigit)
                    ?.takeIf { it.length in 6..10 }
                    ?.let { return it }
            }

            return null
        }

        private fun scoreFallbackCandidates(
            lines: List<String>,
            fullText: String,
        ): String? {
            data class Candidate(val value: String, val score: Int)

            val searchLines = if (lines.isNotEmpty()) lines else fullText.lines()
            var best: Candidate? = null

            searchLines.forEachIndexed { index, rawLine ->
                val line = canonicalize(rawLine)
                genericIdRegex.findAll(line).forEach { match ->
                    val value = match.value
                    var score = 0

                    if (idContextRegex.containsMatchIn(line)) score += 50
                    if (serialContextRegex.containsMatchIn(line)) score -= 45
                    if (nonIdContextRegex.containsMatchIn(line)) score -= 30
                    if (value.length in 7..9) score += 10
                    if (value.length == 8) score += 5

                    val previous = searchLines.getOrNull(index - 1)?.let(::canonicalize).orEmpty()
                    val next = searchLines.getOrNull(index + 1)?.let(::canonicalize).orEmpty()
                    if (idContextRegex.containsMatchIn(previous) || idContextRegex.containsMatchIn(next)) {
                        score += 30
                    }

                    if (score > (best?.score ?: Int.MIN_VALUE)) {
                        best = Candidate(value, score)
                    }
                }
            }

            return best?.takeIf { it.score > 0 }?.value
        }

        private fun normalizeLine(raw: String): String =
            raw.replace(Regex("""\s+"""), " ").trim()

        private fun canonicalize(raw: String): String =
            normalizeLine(raw)
                .uppercase()
                .replace("NUM8ER", "NUMBER")
                .replace("I0", "ID")
                .replace("1D", "ID")
                .replace("|D", "ID")
                .replace(" N0", " NO")
    }
}
