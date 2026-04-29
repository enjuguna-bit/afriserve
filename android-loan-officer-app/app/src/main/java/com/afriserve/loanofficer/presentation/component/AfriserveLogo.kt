package com.afriserve.loanofficer.presentation.component

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import coil.decode.SvgDecoder
import coil.request.ImageRequest

@Composable
fun AfriserveLogo(
    modifier: Modifier = Modifier,
    showWordmark: Boolean = true,
) {
    val context = LocalContext.current
    val assetPath = if (showWordmark) {
        "file:///android_asset/branding/afriserve-logo.svg"
    } else {
        "file:///android_asset/branding/afriserve-mark.svg"
    }

    AsyncImage(
        model = ImageRequest.Builder(context)
            .data(assetPath)
            .decoderFactory(SvgDecoder.Factory())
            .crossfade(true)
            .build(),
        contentDescription = "Afriserve",
        modifier = modifier,
    )
}
