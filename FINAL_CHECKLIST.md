# Final Hybrid TTS checklist

## Architecture
- Online TTS: Ava Persian TTS v0.2 through the public Hugging Face Gradio Space.
- Offline TTS: Piper + ONNX Runtime Web, with on-demand per-character model download.
- Android system/browser speech synthesis is not used by either path.
- Online model weights are not bundled into the APK.

## Online behavior
- Uses the Gradio `/gradio_api/call/generate` queue API.
- Sends: text, speed, cleanup=true, pause=120ms.
- Waits for the terminal `complete` SSE event.
- 90-second timeout with a clear Persian error message.
- Converts WAV/raw audio to MP3 using the app's existing encoder.

## Offline behavior
- Keeps the existing four Piper character sources.
- Downloads only the selected model when first needed.
- Stores the downloaded model in Cache Storage for subsequent offline use.

## Android build
- GitHub Actions installs Node 22, Java 21 and Android API 35/build-tools 35.0.0.
- `npm ci` -> TypeScript check -> Vite production build -> Capacitor sync -> Gradle APK.
- If signing secrets are absent, a debug APK is produced.
- If signing secrets are present, a release APK is produced.
- Artifact: `Nedaye-Shirokhorshid-apk`.

## Verification limitation
The provided execution environment did not contain a complete npm dependency installation and could not finish `npm ci` because external registry access timed out. Therefore a local APK build was not falsely marked as tested. The source and CI workflow are prepared for GitHub Actions to perform the real dependency installation and Android build.
