package ir.nedaye.shirokhorshid.moss

import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

@CapacitorPlugin(name = "MossOfflineTts")
class MossOfflineTtsPlugin : Plugin() {
    private val worker = Executors.newSingleThreadExecutor()
    private val ttsRevision = "f52645cb467506d8e18e746ddd59482685b74e58"
    private val codecRevision = "ceff0d0749bfb3fa2d61149794ec6feef0d1e1ae"
    private val ttsRepo = "OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX"
    private val codecRepo = "OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX"
    private val root: File get() = File(context.filesDir, "moss_tts_onnx")
    private val ttsDir: File get() = File(root, "MOSS-TTS-Nano-100M-ONNX")
    private val codecDir: File get() = File(root, "MOSS-Audio-Tokenizer-Nano-ONNX")

    private data class Asset(val repo: String, val revision: String, val dir: File, val name: String)
    private val assets: List<Asset> get() = listOf(
        Asset(ttsRepo, ttsRevision, ttsDir, "browser_poc_manifest.json"),
        Asset(ttsRepo, ttsRevision, ttsDir, "tts_browser_onnx_meta.json"),
        Asset(ttsRepo, ttsRevision, ttsDir, "tokenizer.model"),
        Asset(ttsRepo, ttsRevision, ttsDir, "moss_tts_prefill.onnx"),
        Asset(ttsRepo, ttsRevision, ttsDir, "moss_tts_decode_step.onnx"),
        Asset(ttsRepo, ttsRevision, ttsDir, "moss_tts_local_fixed_sampled_frame.onnx"),
        Asset(ttsRepo, ttsRevision, ttsDir, "moss_tts_global_shared.data"),
        Asset(ttsRepo, ttsRevision, ttsDir, "moss_tts_local_shared.data"),
        Asset(codecRepo, codecRevision, codecDir, "codec_browser_onnx_meta.json"),
        Asset(codecRepo, codecRevision, codecDir, "moss_audio_tokenizer_decode_full.onnx"),
        Asset(codecRepo, codecRevision, codecDir, "moss_audio_tokenizer_decode_shared.data"),
    )

    @PluginMethod
    fun checkModels(call: PluginCall) {
        val missing = assets.filter { !File(it.dir, it.name).let { file -> file.isFile && file.length() > 0 } }
        call.resolve(JSObject().put("ready", missing.isEmpty()).put("missing", missing.map { it.name }))
    }

    @PluginMethod
    fun prepareModels(call: PluginCall) {
        worker.execute {
            try {
                ttsDir.mkdirs()
                codecDir.mkdirs()
                val files = assets
                files.forEachIndexed { index, asset ->
                    val target = File(asset.dir, asset.name)
                    if (target.isFile && target.length() > 0) {
                        emitProgress((index + 1).toDouble(), files.size, "بررسی‌شده: ${asset.name}")
                        return@forEachIndexed
                    }
                    val part = File(asset.dir, asset.name + ".part")
                    if (part.exists()) part.delete()
                    val address = "https://huggingface.co/${asset.repo}/resolve/${asset.revision}/${asset.name}?download=true"
                    val connection = (URL(address).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 30000
                        readTimeout = 120000
                        instanceFollowRedirects = true
                        setRequestProperty("User-Agent", "NedayeShiroKhorshid-Android/2.4.0")
                    }
                    try {
                        val status = connection.responseCode
                        if (status !in 200..299) throw IllegalStateException("دانلود ${asset.name} ناموفق بود (HTTP $status).")
                        val expectedBytes = connection.contentLengthLong
                        BufferedInputStream(connection.inputStream).use { input ->
                            BufferedOutputStream(part.outputStream()).use { output ->
                                val buffer = ByteArray(256 * 1024)
                                var received = 0L
                                var lastReport = 0L
                                while (true) {
                                    val count = input.read(buffer)
                                    if (count < 0) break
                                    output.write(buffer, 0, count)
                                    received += count
                                    if (received - lastReport >= 2L * 1024 * 1024) {
                                        val fraction = if (expectedBytes > 0) received.toDouble() / expectedBytes else 0.5
                                        emitProgress(index + fraction, files.size, "دریافت ${asset.name} (${formatMb(received)} مگابایت)")
                                        lastReport = received
                                    }
                                }
                            }
                        }
                        if (part.length() == 0L || (expectedBytes > 0 && part.length() != expectedBytes)) {
                            throw IllegalStateException("فایل ${asset.name} ناقص دریافت شد؛ اتصال را بررسی و دوباره تلاش کنید.")
                        }
                        if (target.exists()) target.delete()
                        if (!part.renameTo(target)) throw IllegalStateException("ذخیرهٔ فایل ${asset.name} در حافظهٔ برنامه ممکن نشد.")
                    } finally {
                        connection.disconnect()
                    }
                    emitProgress((index + 1).toDouble(), files.size, "دریافت شد: ${asset.name}")
                }
                emitProgress(files.size.toDouble(), files.size, "مدل MOSS آماده است.")
                call.resolve(JSObject().put("ready", true))
            } catch (error: Throwable) {
                rejectWithError(call, error, "بارگیری مدل MOSS ناموفق بود.")
            }
        }
    }

    @PluginMethod
    fun getTokenizerModel(call: PluginCall) {
        try {
            val file = File(ttsDir, "tokenizer.model")
            if (!file.isFile) throw IllegalStateException("ابتدا باید مدل MOSS دانلود شود.")
            val encoded = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
            call.resolve(JSObject().put("base64", encoded))
        } catch (error: Throwable) {
            rejectWithError(call, error, "بارگیری tokenizer ناموفق بود.")
        }
    }

    @PluginMethod
    fun synthesize(call: PluginCall) {
        val tokenArray = call.getArray("textTokenIds")
        val voice = call.getString("voice") ?: "Bella"
        val maxFrames = call.getInt("maxFrames") ?: 300
        if (tokenArray == null || tokenArray.length() == 0) {
            call.reject("متن فارسی به شناسه‌های tokenizer تبدیل نشد.")
            return
        }
        worker.execute {
            try {
                val tokenIds = IntArray(tokenArray.length()) { tokenArray.getInt(it) }
                val output = File(context.cacheDir, "moss-${UUID.randomUUID()}.wav")
                val result = MossOnnxDemoEngine(
                    modelRoot = ttsDir,
                    outputDir = context.cacheDir,
                    cpuThreads = 2,
                ).use { engine ->
                    engine.synthesize(textTokenIds = tokenIds, outputFile = output, voice = voice, maxFrames = maxFrames)
                }
                val wavBase64 = Base64.encodeToString(result.outputFile.readBytes(), Base64.NO_WRAP)
                result.outputFile.delete()
                call.resolve(JSObject()
                    .put("wavBase64", wavBase64)
                    .put("durationMs", result.durationMs)
                    .put("elapsedMs", result.elapsedMs)
                    .put("sampleRate", result.sampleRate))
            } catch (error: Throwable) {
                rejectWithError(call, error, "تولید صوت آفلاین MOSS ناموفق بود.")
            }
        }
    }

    @PluginMethod
    fun downloadAudio(call: PluginCall) {
        val address = call.getString("url")
        if (address.isNullOrBlank() || !address.startsWith("https://openmoss-team-moss-tts-nano.hf.space/")) {
            call.reject("نشانی صوت امن و معتبری دریافت نشد.")
            return
        }
        worker.execute {
            try {
                val connection = (URL(address).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 30000
                    readTimeout = 180000
                    instanceFollowRedirects = true
                    setRequestProperty("User-Agent", "NedayeShiroKhorshid-Android/2.4.0")
                }
                val bytes = try {
                    if (connection.responseCode !in 200..299) throw IllegalStateException("دریافت فایل صوتی MOSS ناموفق بود (HTTP ${connection.responseCode}).")
                    connection.inputStream.use { it.readBytes() }
                } finally { connection.disconnect() }
                call.resolve(JSObject().put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP)))
            } catch (error: Throwable) {
                rejectWithError(call, error, "دریافت فایل صوتی آنلاین ناموفق بود.")
            }
        }
    }

    private fun emitProgress(completedFiles: Double, totalFiles: Int, message: String) {
        notifyListeners("mossProgress", JSObject()
            .put("completed", completedFiles.coerceIn(0.0, totalFiles.toDouble()))
            .put("total", totalFiles)
            .put("message", message))
    }

    private fun rejectWithError(call: PluginCall, error: Throwable, fallback: String) {
        val exception = error as? Exception ?: RuntimeException(error)
        call.reject(error.message ?: fallback, exception)
    }

    private fun formatMb(bytes: Long): String = String.format("%.1f", bytes / (1024.0 * 1024.0))
}
