// Pagefind por idioma: um índice misturaria os 3 idiomas em toda busca.
// 1. tira dist/en e dist/es do caminho, 2. indexa o PT, 3. restaura,
// 4. indexa cada locale no próprio diretório.
import { execSync } from 'node:child_process';
import { renameSync, existsSync } from 'node:fs';

const run = c => execSync(c, { stdio: 'inherit', shell: true });
const tmp = l => `dist-${l}.pagefind-tmp`;
const moved = [];

for (const l of ['en', 'es']) {
  if (existsSync(`dist/${l}`)) {
    renameSync(`dist/${l}`, tmp(l));
    moved.push(l);
  }
}
run('pagefind --site dist');
for (const l of moved) {
  renameSync(tmp(l), `dist/${l}`);
  run(`pagefind --site dist/${l}`);
}
