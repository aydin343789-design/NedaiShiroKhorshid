import { existsSync } from 'node:fs';
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
