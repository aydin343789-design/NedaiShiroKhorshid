# MOSS Android bridge (test branch)

The Kotlin ONNX inference engine is adapted from `OpenMOSS/MOSS-TTS-Nano/examples/android_onnx_runtime` and is covered by the included Apache-2.0 license copy. It is copied into the generated Capacitor Android project by `scripts/sync-android.mjs`; generated Android files are not committed.

The app downloads the pinned ONNX model assets from the two public OpenMOSS Hugging Face repositories on first entry into Offline mode. The model is not embedded in the APK. Native inference uses ONNX Runtime Android and an on-device SentencePiece tokenizer; text stays on the phone in Offline mode. The model asset list/revisions are pinned in `MossOfflineTtsPlugin.kt`.

This is a test adapter, not a production-ready native module. The upstream Android sample provides a small set of built-in non-Persian speaker prompts. Persian text is tokenized locally, but the available offline voice identities are cross-lingual and their Persian pronunciation/voice quality must be evaluated on a real phone. The upstream engine's Android sample uses pre-tokenized prompts; this adapter adds SentencePiece in JavaScript and passes token IDs into that engine.
