import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const run = (command, args) => {
  execFileSync(command, args, { stdio: 'inherit' });
};

run('npm', ['run', 'build']);

if (!existsSync('android')) {
  run('npx', ['cap', 'add', 'android']);
}

run('npx', ['cap', 'sync', 'android']);
// Install the experimental native MOSS bridge after Capacitor has generated/synced Android.
const mossPackageDir = 'android/app/src/main/java/ir/nedaye/shirokhorshid/moss';
mkdirSync(mossPackageDir, { recursive: true });
for (const file of ['MossOnnxDemoEngine.kt', 'MossOfflineTtsPlugin.kt']) {
  copyFileSync(`native/moss-native/${file}`, `${mossPackageDir}/${file}`);
}
let appGradle = readFileSync('android/app/build.gradle', 'utf8');
if (!appGradle.includes('com.microsoft.onnxruntime:onnxruntime-android')) {
  appGradle = appGradle.replace(
    /dependencies\s*\{/,
    '$&\n    implementation "com.microsoft.onnxruntime:onnxruntime-android:1.20.0"',
  );
  writeFileSync('android/app/build.gradle', appGradle);
}
if (!appGradle.includes("apply plugin: 'kotlin-android'")) {
  appGradle = appGradle.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'");
  writeFileSync('android/app/build.gradle', appGradle);
}
const rootGradlePath = 'android/build.gradle';
let rootGradle = readFileSync(rootGradlePath, 'utf8');
if (!rootGradle.includes('org.jetbrains.kotlin:kotlin-gradle-plugin')) {
  rootGradle = rootGradle.replace(
    /dependencies\s*\{/,
    '$&\n        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21"',
  );
  writeFileSync(rootGradlePath, rootGradle);
}
const mainActivityPath = 'android/app/src/main/java/ir/nedaye/shirokhorshid/MainActivity.java';
let mainActivity = readFileSync(mainActivityPath, 'utf8');
if (!mainActivity.includes('MossOfflineTtsPlugin.class')) {
  mainActivity = mainActivity
    .replace('import com.getcapacitor.BridgeActivity;', 'import android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\nimport ir.nedaye.shirokhorshid.moss.MossOfflineTtsPlugin;')
    .replace(
      /public class MainActivity extends BridgeActivity\s*\{\s*\}/,
      'public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(MossOfflineTtsPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}',
    );
  writeFileSync(mainActivityPath, mainActivity);
}
// Generate the launcher assets after the final Capacitor sync; cap sync can
// otherwise restore the default Capacitor icon over the custom project logo.
run('npx', ['capacitor-assets', 'generate', '--android', '--assetPath', 'resources']);

const gradleFile = 'android/app/build.gradle';
let gradle = readFileSync(gradleFile, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 8');
gradle = gradle.replace(/versionName\s+"[^"]+"/, 'versionName "2.4.1-moss-test"');

// CI can provide a persistent private keystore through GitHub Actions secrets.
// Never commit that keystore or its passwords to the repository. If the
// secrets are not configured yet, keep the debug fallback so local previews
// and first-time CI builds remain usable.
const signingEnv = [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];
const stableSigningEnabled = signingEnv.every((name) => process.env[name]);
if (stableSigningEnabled) {
  // Sync can be run repeatedly on a local checkout. Remove any prior block
  // first so Gradle never receives duplicate `release` signing definitions.
  gradle = gradle.replace(
    /\n    signingConfigs \{\n        release \{\n(?:            [^\n]*\n)*        \}\n    \}\n/g,
    '\n',
  );
  const signingConfig = `
    signingConfigs {
        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }
`;
  gradle = gradle.replace('android {\n', `android {\n${signingConfig}`);
  gradle = gradle.replace(
    /(buildTypes\s*\{\s*release\s*\{)/,
    '$1\n            signingConfig signingConfigs.release',
  );
}
writeFileSync(gradleFile, gradle);
