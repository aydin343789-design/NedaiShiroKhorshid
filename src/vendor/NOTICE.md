# Third-party neural speech runtime notice

`piperPhonemize.js` is derived from the WebAssembly build distributed by
[diffusion-studio/piper-wasm](https://github.com/diffusion-studio/piper-wasm).
It is used by the application only to phonemize Persian text locally before
ONNX inference. The upstream project is licensed under the MIT License.

The adjacent runtime binary files in `public/runtime/piper/` are from the same
MIT-licensed project. ONNX Runtime Web assets in `public/runtime/ort/` are
provided under the MIT License by Microsoft.
