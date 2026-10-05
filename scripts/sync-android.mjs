import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const run = (command, args) => {
  execFileSync(command, args, { stdio: 'inherit' });
};

run('npm', ['run', 'build']);

if (!existsSync('android')) {
  run('npx', ['cap', 'add', 'android']);
}

run('npx', ['capacitor-assets', 'generate', '--android']);
run('npx', ['cap', 'sync', 'android']);

const gradleFile = 'android/app/build.gradle';
let gradle = readFileSync(gradleFile, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 2');
gradle = gradle.replace(/versionName\s+"[^"]+"/, 'versionName "1.1.0"');
writeFileSync(gradleFile, gradle);
