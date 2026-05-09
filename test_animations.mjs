import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const run = (args) => new Promise((resolve) => {
  const p = spawn('node', ['packages/paw-plan/cli.js', ...args.split(' ')], { stdio: 'inherit' });
  p.on('close', resolve);
});

const steps = [
  // setup
  ['vision "Testeando todas las animaciones"',         500],
  ['set-plan \'[{"title":"working"},{"title":"running"},{"title":"exploring"},{"title":"thinking"},{"title":"climbing"},{"title":"waiting"},{"title":"danger"},{"title":"error"},{"title":"fall"},{"title":"sleeping"},{"title":"all-done"}]\'', 1500],

  // trabajo activo
  ['working',                     2000],
  ['running',                     2500],
  ['exploring',                   2000],
  ['thinking',                    2000],
  ['climbing',                    3000],

  // necesita input
  ['waiting "aprobá esto"',       3500],

  // problemas
  ['danger "operación destructiva"', 2000],
  ['error "algo explotó"',           3000],
  ['fall "cambié de enfoque"',       2500],

  // descanso y fin
  ['sleeping',                    3000],
  ['all-done',                    1000],
];

console.log('▶ Iniciando test de animaciones...\n');
for (const [cmd, delay] of steps) {
  console.log(`  → paw-plan ${cmd}`);
  await run(cmd);
  await sleep(delay);
}
console.log('\n✓ Test completo');
