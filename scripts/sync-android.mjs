import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const run = (command, args) => {
  execFileSync(command, args, { stdio: 'inherit' });
};

run('npm', ['run', 'build']);

if (!existsSync('android')) {
  run('npx', ['cap', 'add', 'android']);
}

run('npx', ['cap', 'sync', 'android']);
// Generate the launcher assets after the final Capacitor sync; cap sync can
// otherwise restore the default Capacitor icon over the custom project logo.
run('npx', ['capacitor-assets', 'generate', '--android', '--assetPath', 'resources']);

const gradleFile = 'android/app/build.gradle';
let gradle = readFileSync(gradleFile, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 4');
gradle = gradle.replace(/versionName\s+"[^"]+"/, 'versionName "1.3.0"');

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
