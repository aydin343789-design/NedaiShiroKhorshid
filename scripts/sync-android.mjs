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
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 3');
gradle = gradle.replace(/versionName\s+"[^"]+"/, 'versionName "1.2.0"');
writeFileSync(gradleFile, gradle);
